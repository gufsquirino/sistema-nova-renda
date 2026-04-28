// api/webhook.js — Hotmart webhook v2.0.0 (payload real validado)
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Hotmart envia token na query string
  const token = req.query.token;
  if (token !== process.env.HOTMART_TOKEN) {
    console.error('Invalid token:', token);
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Log completo para debug nos logs do Vercel
  console.log('HOTMART PAYLOAD:', JSON.stringify(req.body, null, 2));

  try {
    const body = req.body;

    // Campos reais do payload Hotmart v2.0.0
    const event  = body?.event;                    // "PURCHASE_APPROVED", "PURCHASE_REFUNDED" etc
    const status = body?.data?.purchase?.status;   // "APPROVED", "REFUNDED" etc
    const email  = body?.data?.buyer?.email;       // email do comprador

    if (!email) {
      console.error('Email not found. Keys:', Object.keys(body?.data?.buyer || {}));
      return res.status(400).json({ error: 'Email not found', payload_event: event });
    }

    const emailNorm = email.trim().toLowerCase();

    // ── REEMBOLSO / CANCELAMENTO → remove acesso ─────────────────
    const isRevoke =
      event === 'PURCHASE_REFUNDED'   ||
      event === 'PURCHASE_CANCELLED'  ||
      event === 'PURCHASE_CHARGEBACK' ||
      event === 'PURCHASE_PROTEST'    ||
      status === 'REFUNDED'           ||
      status === 'CANCELLED'          ||
      status === 'CHARGEBACK';

    if (isRevoke) {
      const { error } = await supabase
        .from('members')
        .update({
          active: false,
          deactivated_at: new Date().toISOString(),
          deactivation_reason: event || status
        })
        .eq('email', emailNorm);

      if (error) return res.status(500).json({ error: error.message });
      console.log('Access REVOKED:', emailNorm, '| reason:', event);
      return res.status(200).json({ success: true, action: 'revoked', email: emailNorm });
    }

    // ── COMPRA APROVADA → libera acesso por 12 meses ─────────────
    const isApprove =
      event === 'PURCHASE_APPROVED'  ||
      event === 'PURCHASE_COMPLETE'  ||
      status === 'APPROVED'          ||
      status === 'COMPLETE';

    if (isApprove) {
      const now       = new Date();
      const expiresAt = new Date(now);
      expiresAt.setFullYear(expiresAt.getFullYear() + 1);

      const { error } = await supabase
        .from('members')
        .upsert(
          {
            email:      emailNorm,
            active:     true,
            joined_at:  now.toISOString(),
            expires_at: expiresAt.toISOString(),
            source:     'hotmart',
            raw_event:  JSON.stringify(body).substring(0, 1000)
          },
          { onConflict: 'email' }
        );

      if (error) return res.status(500).json({ error: error.message });
      console.log('Access GRANTED:', emailNorm, '| expires:', expiresAt.toISOString());
      return res.status(200).json({ success: true, action: 'activated', email: emailNorm, expires_at: expiresAt.toISOString() });
    }

    // Evento não mapeado — retorna 200 para Hotmart não retentar
    console.log('Event ignored:', event, '| status:', status, '| email:', emailNorm);
    return res.status(200).json({ message: 'Event ignored', event, status });

  } catch (err) {
    console.error('Handler error:', err);
    return res.status(500).json({ error: 'Internal error', detail: err.message });
  }
}
