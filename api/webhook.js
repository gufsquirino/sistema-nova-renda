// api/webhook.js — recebe webhook da Hotmart
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const token = req.headers['x-hotmart-webhook-token'] || req.query.token;
  if (token !== process.env.HOTMART_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const body = req.body;
    const event  = body?.event || body?.data?.event;
    const status = body?.data?.purchase?.status || body?.purchase?.status;

    const email =
      body?.data?.buyer?.email ||
      body?.buyer?.email ||
      body?.data?.purchase?.buyer?.email;

    if (!email) {
      return res.status(400).json({ error: 'Email not found in payload' });
    }

    const emailNorm = email.trim().toLowerCase();

    // ── REEMBOLSO → desativa acesso ──────────────────────────────
    const isRefund =
      event === 'PURCHASE_REFUNDED'   ||
      event === 'PURCHASE_CANCELLED'  ||
      event === 'PURCHASE_CHARGEBACK' ||
      status === 'REFUNDED'           ||
      status === 'CANCELLED'          ||
      status === 'CHARGEBACK';

    if (isRefund) {
      const { error } = await supabase
        .from('members')
        .update({
          active: false,
          deactivated_at: new Date().toISOString(),
          deactivation_reason: event || status
        })
        .eq('email', emailNorm);

      if (error) return res.status(500).json({ error: error.message });

      console.log('Access revoked:', emailNorm, event);
      return res.status(200).json({ success: true, action: 'revoked', email: emailNorm });
    }

    // ── COMPRA APROVADA → ativa acesso com expiração 12 meses ────
    const isApproved =
      event === 'PURCHASE_COMPLETE'  ||
      event === 'PURCHASE_APPROVED'  ||
      status === 'COMPLETE'          ||
      status === 'APPROVED';

    if (isApproved) {
      const now       = new Date();
      const expiresAt = new Date(now);
      expiresAt.setFullYear(expiresAt.getFullYear() + 1); // +12 meses

      const { error } = await supabase
        .from('members')
        .upsert(
          {
            email:        emailNorm,
            active:       true,
            joined_at:    now.toISOString(),
            expires_at:   expiresAt.toISOString(),
            source:       'hotmart',
            raw_event:    JSON.stringify(body).substring(0, 500)
          },
          { onConflict: 'email' }
        );

      if (error) return res.status(500).json({ error: error.message });

      console.log('Member registered:', emailNorm, '| expires:', expiresAt.toISOString());
      return res.status(200).json({ success: true, action: 'activated', email: emailNorm, expires_at: expiresAt.toISOString() });
    }

    // Evento ignorado
    return res.status(200).json({ message: 'Event ignored', event });

  } catch (err) {
    console.error('Handler error:', err);
    return res.status(500).json({ error: 'Internal error', detail: err.message });
  }
}
