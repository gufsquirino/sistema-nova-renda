// api/ai.js — proxy seguro para Anthropic com tratamento robusto de erros
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  // ── Valida session token ──────────────────────────────────────
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.replace('Bearer ', '').trim();

  if (!token) {
    return res.status(401).json({ error: 'Missing token' });
  }

  const { data: session, error: sessErr } = await supabase
    .from('sessions')
    .select('email, expires_at')
    .eq('token', token)
    .single();

  if (sessErr || !session) {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }

  if (new Date() > new Date(session.expires_at)) {
    await supabase.from('sessions').delete().eq('token', token);
    return res.status(401).json({ error: 'Session expired, login again' });
  }

  // ── Valida payload ────────────────────────────────────────────
  const { system, messages } = req.body || {};

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages required' });
  }
  if (messages.length > 30) {
    return res.status(400).json({ error: 'Too many messages' });
  }

  // ── Chama Anthropic ───────────────────────────────────────────
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system:     system || '',
        messages,
      }),
    });

    // Lê como texto primeiro — a Anthropic às vezes retorna erro em texto puro
    const rawText = await response.text();
    let data;

    try {
      data = JSON.parse(rawText);
    } catch (parseErr) {
      // Resposta não era JSON (overload, rate limit, etc)
      console.error('Anthropic non-JSON response:', response.status, rawText.substring(0, 200));
      return res.status(200).json({
        ok: false,
        text: 'O agente est\u00e1 sobrecarregado no momento. Tente novamente em alguns segundos.'
      });
    }

    if (!response.ok) {
      const errMsg = data?.error?.message || 'Erro no agente';
      console.error('Anthropic API error:', response.status, errMsg);
      // Retorna 200 com mensagem amigável — o hub não precisa saber do erro técnico
      return res.status(200).json({
        ok: false,
        text: 'O agente encontrou um problema. Tente reformular a pergunta.'
      });
    }

    const text = data?.content?.[0]?.text || '';
    return res.status(200).json({ ok: true, text });

  } catch (err) {
    console.error('AI proxy error:', err.message);
    return res.status(200).json({
      ok: false,
      text: 'Erro de conex\u00e3o com o agente. Tente novamente.'
    });
  }
}
