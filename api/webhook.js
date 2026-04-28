// api/webhook.js — recebe webhook da Hotmart e registra o comprador
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  // Apenas POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verificar token secreto da Hotmart (configura no painel deles)
  const token = req.headers['x-hotmart-webhook-token'] || req.query.token;
  if (token !== process.env.HOTMART_TOKEN) {
    console.error('Invalid token:', token);
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const body = req.body;

    // Hotmart envia evento — só processa compras aprovadas
    const event = body?.event || body?.data?.event;
    const status = body?.data?.purchase?.status || body?.purchase?.status;

    // Aceita PURCHASE_COMPLETE ou PURCHASE_APPROVED
    const isApproved = 
      event === 'PURCHASE_COMPLETE' || 
      event === 'PURCHASE_APPROVED' ||
      status === 'COMPLETE' ||
      status === 'APPROVED';

    if (!isApproved) {
      // Ignora outros eventos mas retorna 200 para a Hotmart não retentar
      return res.status(200).json({ message: 'Event ignored', event });
    }

    // Extrai email do comprador
    const email = 
      body?.data?.buyer?.email ||
      body?.buyer?.email ||
      body?.data?.purchase?.buyer?.email;

    if (!email) {
      console.error('No email found in payload:', JSON.stringify(body));
      return res.status(400).json({ error: 'Email not found in payload' });
    }

    const emailNorm = email.trim().toLowerCase();

    // Upsert no Supabase (insere ou atualiza se já existir)
    const { error } = await supabase
      .from('members')
      .upsert(
        {
          email: emailNorm,
          active: true,
          joined_at: new Date().toISOString(),
          source: 'hotmart',
          raw_event: JSON.stringify(body).substring(0, 500)
        },
        { onConflict: 'email' }
      );

    if (error) {
      console.error('Supabase error:', error);
      return res.status(500).json({ error: 'Database error', detail: error.message });
    }

    console.log('Member registered:', emailNorm);
    return res.status(200).json({ success: true, email: emailNorm });

  } catch (err) {
    console.error('Handler error:', err);
    return res.status(500).json({ error: 'Internal error', detail: err.message });
  }
}
