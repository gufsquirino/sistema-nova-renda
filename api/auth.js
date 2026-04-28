// api/auth.js — verifica se email tem acesso + login do admin
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Admin email vem de variável de ambiente (não fica exposto no frontend)
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@gmail.com';
const ADMIN_PASS  = process.env.ADMIN_PASS  || 'geniusdrop2026';
const SUFFIX      = process.env.PASSWORD_SUFFIX || 'geniusdrop2026';

export default async function handler(req, res) {
  // CORS — permite o hub fazer requisições
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ ok: false, error: 'Email e senha obrigatorios' });
  }

  const emailNorm = email.trim().toLowerCase();

  // 1. Verifica admin
  const isAdmin = (emailNorm === ADMIN_EMAIL.toLowerCase() && password === ADMIN_PASS);

  // 2. Verifica membro (senha = email + SUFFIX)
  const isMember = (password === emailNorm + SUFFIX);

  if (!isAdmin && !isMember) {
    return res.status(401).json({ ok: false, error: 'Senha incorreta' });
  }

  // 3. Se for membro, verifica se está cadastrado no Supabase (comprou)
  if (isMember && !isAdmin) {
    const { data, error } = await supabase
      .from('members')
      .select('email, active')
      .eq('email', emailNorm)
      .single();

    if (error || !data) {
      return res.status(403).json({
        ok: false,
        error: 'Acesso nao encontrado. Verifique se a compra foi confirmada ou entre em contato com o suporte.'
      });
    }

    if (!data.active) {
      return res.status(403).json({
        ok: false,
        error: 'Seu acesso esta inativo. Entre em contato com o suporte.'
      });
    }
  }

  // Login OK
  return res.status(200).json({
    ok: true,
    role: isAdmin ? 'admin' : 'member',
    email: emailNorm,
    name: emailNorm.split('@')[0]
  });
}
