// ══════════════════════════════════════════════════════
// NexusARG — Instagram Webhook Handler
// Recibe mensajes de Instagram DM y comentarios
// Responde usando Claude AI
// ══════════════════════════════════════════════════════

const VERIFY_TOKEN = process.env.INSTAGRAM_VERIFY_TOKEN || 'nexusarg_webhook_2025';
const IG_TOKEN     = process.env.INSTAGRAM_PAGE_TOKEN;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

// System prompt del bot — personalizado para NexusARG
const SYSTEM_PROMPT = `Sos el asistente virtual de NexusARG, una agencia de inteligencia artificial fundada por Leonardo Colioni en Comodoro Rivadavia, Argentina.

Tu función es atender consultas de potenciales clientes que llegan por Instagram.

INFORMACIÓN DEL NEGOCIO:
- Creamos chatbots con IA, automatizaciones y sistemas digitales para pymes argentinas
- Implementación en 7 días hábiles
- Primera semana gratis sin compromiso
- Soporte mensual disponible

SERVICIOS Y PRECIOS:
- Chatbot 24/7: desde $480.000 ARS + soporte $150.000/mes
- Agente de Ventas IA: desde $580.000 ARS + soporte $150.000/mes  
- Automatización de procesos: desde $650.000 ARS + soporte $180.000/mes
- Asistente personalizado: desde $720.000 ARS + soporte $180.000/mes
- Productos listos (agendamiento, inventario, menú digital, ERP): desde $90.000 ARS

CONTACTO:
- WhatsApp: +54 9 297 528-3287
- Email: arg.nexus1@gmail.com
- Web: nexusarg.netlify.app
- Instagram: @nexusarg1

REGLAS DE COMPORTAMIENTO:
1. Respondés en español rioplatense, usás el vos
2. Sos amigable pero profesional
3. Cuando alguien muestra interés concreto, invitalo a escribir por WhatsApp para agendar una demo gratis
4. Máximo 3-4 oraciones por respuesta en Instagram (mensajes cortos)
5. Usás emojis con moderación
6. Si te preguntan algo que no sabés, decís que lo consultás con el equipo
7. NUNCA inventás precios o servicios que no están en esta lista`;

exports.handler = async function(event, context) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };

  // ── VERIFICACIÓN DEL WEBHOOK (GET) ──
  if (event.httpMethod === 'GET') {
    const params = event.queryStringParameters || {};
    const mode      = params['hub.mode'];
    const token     = params['hub.verify_token'];
    const challenge = params['hub.challenge'];

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log('Webhook verified OK');
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'text/plain' },
        body: challenge,
      };
    }
    return { statusCode: 403, headers, body: 'Verification failed' };
  }

  // ── RECEPCIÓN DE MENSAJES (POST) ──
  if (event.httpMethod === 'POST') {
    try {
      const body = JSON.parse(event.body || '{}');
      console.log('Webhook received:', JSON.stringify(body, null, 2));

      // Responder 200 inmediatamente a Meta (requerido)
      // Procesamos en background
      processWebhook(body).catch(function(err) {
        console.error('Processing error:', err);
      });

      return { statusCode: 200, headers, body: JSON.stringify({ status: 'ok' }) };

    } catch (err) {
      console.error('Parse error:', err);
      return { statusCode: 200, headers, body: JSON.stringify({ status: 'ok' }) };
    }
  }

  return { statusCode: 405, headers, body: 'Method not allowed' };
};

async function processWebhook(body) {
  if (!body.entry) return;

  for (var i = 0; i < body.entry.length; i++) {
    var entry = body.entry[i];

    // ── MENSAJES DIRECTOS (DMs) ──
    if (entry.messaging) {
      for (var j = 0; j < entry.messaging.length; j++) {
        var event = entry.messaging[j];
        if (event.message && event.message.text && !event.message.is_echo) {
          await handleDM(event);
        }
      }
    }

    // ── COMENTARIOS ──
    if (entry.changes) {
      for (var k = 0; k < entry.changes.length; k++) {
        var change = entry.changes[k];
        if (change.field === 'comments' && change.value) {
          await handleComment(change.value);
        }
      }
    }
  }
}

async function handleDM(event) {
  var senderId = event.sender.id;
  var messageText = event.message.text;

  console.log('DM from', senderId, ':', messageText);

  // Generar respuesta con IA
  var aiResponse = await generateAIResponse(messageText, 'dm');
  if (!aiResponse) return;

  // Enviar respuesta por la Graph API
  await sendIGMessage(senderId, aiResponse);
}

async function handleComment(commentData) {
  // Solo responder comentarios en posts propios, no en respuestas
  if (commentData.parent_id) return;

  var commenterId = commentData.from ? commentData.from.id : null;
  var commentText = commentData.text || '';
  var mediaId     = commentData.media_id;

  if (!commenterId || !commentText) return;

  console.log('Comment from', commenterId, ':', commentText);

  // Generar respuesta corta para comentario
  var aiResponse = await generateAIResponse(commentText, 'comment');
  if (!aiResponse) return;

  // Responder al comentario
  await replyToComment(mediaId, commentData.id, commenterId, aiResponse);
}

async function generateAIResponse(userMessage, context) {
  if (!ANTHROPIC_KEY) {
    console.error('No ANTHROPIC_API_KEY configured');
    return null;
  }

  var contextNote = context === 'comment'
    ? ' IMPORTANTE: Es un comentario público en Instagram, sé muy breve (máximo 2 oraciones) y si muestran interés invitalos a escribir por DM.'
    : '';

  try {
    var response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 300,
        system: SYSTEM_PROMPT + contextNote,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });

    var data = await response.json();
    if (data.content && data.content[0]) {
      return data.content[0].text;
    }
    return null;
  } catch (err) {
    console.error('AI error:', err);
    return null;
  }
}

async function sendIGMessage(recipientId, text) {
  if (!IG_TOKEN) {
    console.error('No INSTAGRAM_PAGE_TOKEN configured');
    return;
  }

  try {
    var response = await fetch('https://graph.facebook.com/v19.0/me/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        access_token: IG_TOKEN,
        recipient: { id: recipientId },
        message: { text: text },
        messaging_type: 'RESPONSE',
      }),
    });
    var result = await response.json();
    console.log('DM sent:', result);
  } catch (err) {
    console.error('Send DM error:', err);
  }
}

async function replyToComment(mediaId, commentId, userId, text) {
  if (!IG_TOKEN) return;

  try {
    // Responder al comentario públicamente
    var response = await fetch('https://graph.facebook.com/v19.0/' + mediaId + '/comments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        access_token: IG_TOKEN,
        message: '@' + userId + ' ' + text,
      }),
    });
    var result = await response.json();
    console.log('Comment reply sent:', result);

    // Además mandar DM invitando a continuar en privado
    var dmText = 'Hola! Vi tu comentario y te respondo por acá para que sea más cómodo 😊 ¿Qué más querés saber sobre nuestros servicios?';
    await sendIGMessage(userId, dmText);

  } catch (err) {
    console.error('Reply comment error:', err);
  }
}
