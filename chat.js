// ══════════════════════════════════════════════════════
// NexusARG — Chat API Handler
// Conecta las apps y demos con la API de Anthropic (Claude)
// Variables de entorno necesarias:
//   ANTHROPIC_API_KEY = sk-ant-...
// ══════════════════════════════════════════════════════

exports.handler = async function(event, context) {

  // Solo POST y OPTIONS
  if (event.httpMethod !== 'POST' && event.httpMethod !== 'OPTIONS') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  // CORS — permite llamadas desde cualquier origen (tus apps en Netlify)
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  // Respuesta a preflight OPTIONS
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  // Verificar API Key
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('ANTHROPIC_API_KEY not configured in environment variables');
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'API key not configured. Go to Netlify → Site config → Environment variables and add ANTHROPIC_API_KEY' })
    };
  }

  try {
    // Parsear body
    const body = JSON.parse(event.body || '{}');
    const { system, messages, model, max_tokens } = body;

    // Validar mensajes
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'messages array is required' })
      };
    }

    // Construir payload para Anthropic
    const payload = {
      model:      model      || 'claude-haiku-4-5-20251001', // Haiku = más barato y rápido para apps cotidianas
      max_tokens: max_tokens || 1024,
      messages:   messages,
    };

    // System prompt opcional
    if (system) payload.system = system;

    // Llamada a la API de Anthropic
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    // Manejar errores de la API
    if (!response.ok) {
      console.error('Anthropic API error:', response.status, data);
      return {
        statusCode: response.status,
        headers,
        body: JSON.stringify({
          error: data.error?.message || 'Anthropic API error',
          type:  data.error?.type   || 'unknown'
        })
      };
    }

    // Respuesta exitosa
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(data),
    };

  } catch (err) {
    console.error('Function error:', err.message);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Server error: ' + err.message })
    };
  }
};
