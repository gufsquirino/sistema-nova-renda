// api/auth.js — verifica acesso, expiração e reembolso
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@gmail.com';
const ADMIN_PASS  = process.env.ADMIN_PASS  || 'geniusdrop2026';
const SUFFIX      = process.env.PASSWORD_SUFFIX || 'geniusdrop2026';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ ok: false, error: 'Preencha e-mail e senha.' });

  const emailNorm = email.trim().toLowerCase();

  // 1. Admin — acesso irrestrito
  if (emailNorm === ADMIN_EMAIL.toLowerCase() && password === ADMIN_PASS) {
    return res.status(200).json({ ok: true, role: 'admin', email: emailNorm, name: emailNorm.split('@')[0] });
  }

  // 2. Verifica senha padrão
  if (password !== emailNorm + SUFFIX) {
    return res.status(401).json({ ok: false, error: 'Senha incorreta. Verifique seu e-mail de compra.' });
  }

  // 3. Busca membro no banco
  const { data, error } = await supabase
    .from('members')
    .select('email, active, expires_at, deactivation_reason')
    .eq('email', emailNorm)
    .single();

  if (error || !data) {
    return res.status(403).json({
      ok: false,
      error: 'Acesso n\u00e3o encontrado. Verifique se a compra foi confirmada ou entre em contato com o suporte.'
    });
  }

  // 4. Verifica reembolso / cancelamento
  if (!data.active) {
    return res.status(403).json({
      ok: false,
      error: 'Seu acesso foi cancelado. Em caso de d\u00favidas, entre em contato com o suporte.'
    });
  }

  // 5. Verifica expiração (12 meses)
  if (data.expires_at) {
    const now     = new Date();
    const expires = new Date(data.expires_at);
    if (now > expires) {
      // Desativa automaticamente no banco
      await supabase
        .from('members')
        .update({ active: false, deactivation_reason: 'expired' })
        .eq('email', emailNorm);

      return res.status(403).json({
        ok: false,
        error: 'Seu acesso de 12 meses expirou. Renove sua assinatura para continuar.'
      });
    }

    // Avisa quando falta menos de 15 dias
    const daysLeft = Math.ceil((expires - now) / (1000 * 60 * 60 * 24));
    const warning  = daysLeft <= 15
      ? 'Seu acesso expira em ' + daysLeft + ' dia' + (daysLeft > 1 ? 's' : '') + '. Renove para n\u00e3o perder o acesso.'
      : null;

    return res.status(200).json({
      ok: true,
      role: 'member',
      email: emailNorm,
      name: emailNorm.split('@')[0],
      expires_at: data.expires_at,
      warning
    });
  }

  // 6. Acesso OK sem data de expiração definida
  return res.status(200).json({
    ok: true,
    role: 'member',
    email: emailNorm,
    name: emailNorm.split('@')[0]
  });
}
