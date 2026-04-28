// api/webhook.js — Hotmart webhook v2.0.0
// Webhook não precisa de CORS (chamado server-to-server pela Hotmart, não pelo browser)
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const token = req.query.token;
  if (token !== process.env.HOTMART_TOKEN) {
    console.error('Invalid token:', token);
    return res.status(401).json({ error: 'Unauthorized' });
  }

  console.log('HOTMART PAYLOAD:', JSON.stringify(req.body, null, 2));

  try {
    const body   = req.body;
    const event  = body?.event;
    const status = body?.data?.purchase?.status;
    const email  = body?.data?.buyer?.email;

    if (!email) {
      return res.status(400).json({ error: 'Email not found', payload_event: event });
    }

    const emailNorm = email.trim().toLowerCase();

    // ── Reembolso / cancelamento ───────────────────────────────
    const isRevoke =
      event === 'PURCHASE_REFUNDED'   ||
      event === 'PURCHASE_CANCELLED'  ||
      event === 'PURCHASE_CHARGEBACK' ||
      event === 'PURCHASE_PROTEST'    ||
      status === 'REFUNDED'           ||
      status === 'CANCELLED'          ||
      status === 'CHARGEBACK';

    if (isRevoke) {
      await supabase.from('members').update({
        active: false,
        deactivated_at: new Date().toISOString(),
        deactivation_reason: event || status
      }).eq('email', emailNorm);

      // Invalida sessão ativa
      await supabase.from('sessions').delete().eq('email', emailNorm);

      console.log('Access REVOKED:', emailNorm);
      return res.status(200).json({ success: true, action: 'revoked', email: emailNorm });
    }

    // ── Compra aprovada ────────────────────────────────────────
    const isApprove =
      event === 'PURCHASE_APPROVED' ||
      event === 'PURCHASE_COMPLETE' ||
      status === 'APPROVED'         ||
      status === 'COMPLETE';

    if (isApprove) {
      const now       = new Date();
      const expiresAt = new Date(now);
      expiresAt.setFullYear(expiresAt.getFullYear() + 1);

      await supabase.from('members').upsert({
        email:      emailNorm,
        active:     true,
        joined_at:  now.toISOString(),
        expires_at: expiresAt.toISOString(),
        source:     'hotmart',
        raw_event:  JSON.stringify(body).substring(0, 1000)
      }, { onConflict: 'email' });

      console.log('Access GRANTED:', emailNorm, '| expires:', expiresAt.toISOString());
      return res.status(200).json({ success: true, action: 'activated', email: emailNorm, expires_at: expiresAt.toISOString() });
    }

    return res.status(200).json({ message: 'Event ignored', event, status });

  } catch (err) {
    console.error('Handler error:', err.message);
    return res.status(500).json({ error: 'Internal error' });
  }
}
