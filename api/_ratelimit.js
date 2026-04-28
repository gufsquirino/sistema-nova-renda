// _ratelimit.js — rate limit por usuário usando Supabase
// Limites: 10 req/min e 100 req/dia por email

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const LIMIT_PER_MINUTE = 10;
const LIMIT_PER_DAY    = 100;

export async function checkRateLimit(email) {
  const now     = new Date();
  const minAgo  = new Date(now - 60 * 1000);           // 1 minuto atrás
  const dayAgo  = new Date(now - 24 * 60 * 60 * 1000); // 24h atrás

  // Conta requisições no último minuto
  const { count: perMin } = await supabase
    .from('ai_usage')
    .select('*', { count: 'exact', head: true })
    .eq('email', email)
    .gte('created_at', minAgo.toISOString());

  if (perMin >= LIMIT_PER_MINUTE) {
    return { allowed: false, reason: 'Muitas requisicoes por minuto. Aguarde alguns segundos.' };
  }

  // Conta requisições nas últimas 24h
  const { count: perDay } = await supabase
    .from('ai_usage')
    .select('*', { count: 'exact', head: true })
    .eq('email', email)
    .gte('created_at', dayAgo.toISOString());

  if (perDay >= LIMIT_PER_DAY) {
    return { allowed: false, reason: 'Limite diario de mensagens atingido. Tente novamente amanha.' };
  }

  return { allowed: true };
}

export async function recordUsage(email, agentId) {
  await supabase.from('ai_usage').insert({
    email,
    agent_id:   agentId,
    created_at: new Date().toISOString()
  });
}
