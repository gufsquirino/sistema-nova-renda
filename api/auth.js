// api/auth.js — login + geração de session token
import { createClient } from '@supabase/supabase-js';
import { randomBytes }   from 'crypto';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const ADMIN_EMAIL = process.env.ADMIN_EMAIL   || 'admin@gmail.com';
const ADMIN_PASS  = process.env.ADMIN_PASS    || 'geniusdrop2026';
const SUFFIX      = process.env.PASSWORD_SUFFIX || 'geniusdrop2026';

function generateToken() {
  return randomBytes(32).toString('hex'); // 64 chars, criptograficamente seguro
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ ok: false, error: 'Preencha e-mail e senha.' });

  const emailNorm = email.trim().toLowerCase();

  // ── 1. Admin ──────────────────────────────────────────────────
  const isAdmin = (emailNorm === ADMIN_EMAIL.toLowerCase() && password === ADMIN_PASS);

  // ── 2. Senha padrão membro ────────────────────────────────────
  const isMemberPass = (password === emailNorm + SUFFIX);

  if (!isAdmin && !isMemberPass) {
    return res.status(401).json({ ok: false, error: 'Senha incorreta. Verifique seu e-mail de compra.' });
  }

  // ── 3. Verifica membro no banco ───────────────────────────────
  if (!isAdmin) {
    const { data, error } = await supabase
      .from('members')
      .select('email, active, expires_at')
      .eq('email', emailNorm)
      .single();

    if (error || !data) {
      return res.status(403).json({ ok: false, error: 'Acesso n\u00e3o encontrado. Verifique se a compra foi confirmada ou entre em contato com o suporte.' });
    }
    if (!data.active) {
      return res.status(403).json({ ok: false, error: 'Seu acesso foi cancelado. Entre em contato com o suporte.' });
    }
    if (data.expires_at && new Date() > new Date(data.expires_at)) {
      await supabase.from('members').update({ active: false, deactivation_reason: 'expired' }).eq('email', emailNorm);
      return res.status(403).json({ ok: false, error: 'Seu acesso de 12 meses expirou. Renove para continuar.' });
    }

    // Aviso de expiração próxima
    const daysLeft = data.expires_at
      ? Math.ceil((new Date(data.expires_at) - new Date()) / 86400000)
      : null;
    const warning = daysLeft && daysLeft <= 15
      ? 'Seu acesso expira em ' + daysLeft + ' dia' + (daysLeft > 1 ? 's' : '') + '. Renove para n\u00e3o perder o acesso.'
      : null;

    // Gera session token
    const token     = generateToken();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

    await supabase.from('sessions').upsert(
      { email: emailNorm, token, expires_at: expiresAt.toISOString() },
      { onConflict: 'email' }
    );

    return res.status(200).json({
      ok: true, role: 'member',
      email: emailNorm, name: emailNorm.split('@')[0],
      token, expires_at: data.expires_at, warning
    });
  }

  // ── 4. Admin — gera session token também ─────────────────────
  const token     = generateToken();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await supabase.from('sessions').upsert(
    { email: emailNorm, token, expires_at: expiresAt.toISOString() },
    { onConflict: 'email' }
  );

  return res.status(200).json({
    ok: true, role: 'admin',
    email: emailNorm, name: emailNorm.split('@')[0],
    token
  });
}
