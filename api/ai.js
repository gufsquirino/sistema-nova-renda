// api/ai.js — proxy seguro para a API da Anthropic
// A chave fica no servidor, nunca exposta no frontend

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  const { system, messages } = req.body || {};

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages array required' });
  }

  // Limite de segurança — máximo 30 mensagens por conversa
  if (messages.length > 30) {
    return res.status(400).json({ error: 'Conversation too long' });
  }

  // Limite de tokens por mensagem (evita abuso)
  for (const msg of messages) {
    if (typeof msg.content === 'string' && msg.content.length > 4000) {
      return res.status(400).json({ error: 'Message too long' });
    }
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':         'application/json',
        'x-api-key':            process.env.ANTHROPIC_API_KEY,
        'anthropic-version':    '2023-06-01',
      },
      body: JSON.stringify({
        model:      'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system:     system || '',
        messages,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Anthropic error:', data);
      return res.status(response.status).json({ error: data?.error?.message || 'Anthropic error' });
    }

    // Retorna só o texto — não expõe metadados desnecessários
    const text = data?.content?.[0]?.text || '';
    return res.status(200).json({ ok: true, text });

  } catch (err) {
    console.error('AI proxy error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
}
