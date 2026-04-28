// _cors.js — helper compartilhado de CORS
// Importado por todos os endpoints

const ALLOWED_ORIGINS = [
  'https://sistema-nova-renda.vercel.app',
  'https://snr.alynnegustavo.com.br',
  'http://snr.alynnegustavo.com.br', // redireciona para https mas aceita os dois
];

export function setCors(req, res) {
  const origin = req.headers.origin || '';
  
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin'); // cache separado por origem
  }
  // Se a origem não for permitida, não seta o header — browser bloqueia automaticamente

  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400'); // preflight cacheado por 24h
}

export function handlePreflight(req, res) {
  if (req.method === 'OPTIONS') {
    setCors(req, res);
    res.status(200).end();
    return true;
  }
  return false;
}
