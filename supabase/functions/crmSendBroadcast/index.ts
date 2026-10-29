import { createClientFromRequest, serve } from '../_shared/base44.ts';
import {
  renderTemplate, buildVars, sendEmail, sendSms, logMessage, appendActivity,
  isMarketingAllowed, ensureUnsubscribeToken, emailFooter, accountReplyFooter, createSendLimiter,
  smsConfigured, SMS_UNAVAILABLE,
} from '../_shared/crm.ts';

const MAX_RECIPIENTS = 200;

async function handler(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    // Launching a campaign sends marketing messages on behalf of an account — admins only.
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const broadcastId = body.broadcast_id;
    if (!broadcastId) return Response.json({ error: 'Hiányzó kampány azonosító' }, { status: 400 });

    const broadcast = await base44.asServiceRole.entities.Broadcast.get(broadcastId).catch(() => null);
    if (!broadcast) return Response.json({ error: 'A kampány nem található' }, { status: 404 });

    const settingsList = await base44.asServiceRole.entities.WorkspaceSettings.list('-created_date', 1).catch(() => []);
    const settings = settingsList[0] || null;
    // A campaign may only use SMS when the provider is configured and switched on.
    if (broadcast.channel === 'sms' && !(settings?.sms_enabled === true && smsConfigured())) {
      return Response.json({ error: SMS_UNAVAILABLE }, { status: 400 });
    }
    const account = broadcast.account_id
      ? await base44.asServiceRole.entities.Account.get(broadcast.account_id).catch(() => null)
      : null;
    const limiter = createSendLimiter(base44);
    const origin = (Deno.env.get('APP_URL') || '').replace(/\/$/, '');

    const query = {};
    if (broadcast.account_id) query.account_id = broadcast.account_id;
    if (broadcast.audience_stage_id) query.stage_id = broadcast.audience_stage_id;
    if (broadcast.audience_tag) query.tags = broadcast.audience_tag;

    const all = await base44.asServiceRole.entities.Contact.filter(query, '-created_date', MAX_RECIPIENTS).catch(() => []);
    const reachable = all.filter((c) => (broadcast.channel === 'sms' ? !!c.phone : !!c.email));
    // A campaign is a marketing message: only opted-in, non-unsubscribed contacts may receive it.
    const consented = reachable.filter((c) => isMarketingAllowed(c));
    const noConsent = reachable.length - consented.length;

    const quota = broadcast.account_id ? await limiter.remaining(broadcast.account_id) : null;
    const cap = quota ? Math.max(0, Math.min(quota.daily, quota.monthly)) : consented.length;
    const recipients = consented.slice(0, cap);
    const limitBlocked = consented.length - recipients.length;

    let sent = 0;
    let failed = 0;
    for (const contact of recipients) {
      const vars = buildVars(contact, null);
      const subject = renderTemplate(broadcast.subject || broadcast.name, vars);
      let messageBody = renderTemplate(broadcast.body || '', vars);
      if (broadcast.channel === 'email') {
        const token = await ensureUnsubscribeToken(base44, contact);
        messageBody += emailFooter([
          accountReplyFooter(account),
          token ? `Leiratkozás a marketing e-mailekről: ${origin}/u/${token}` : '',
        ]);
      }
      const result = broadcast.channel === 'sms'
        ? await sendSms({
          to: contact.phone, body: messageBody,
          fromName: account?.name || settings?.sms_from_name || '',
          enabled: settings?.sms_enabled === true,
        })
        : await sendEmail(base44, { to: contact.email, subject, body: messageBody, fromName: account?.name || settings?.email_from_name || '' });

      if (result.status === 'sent') sent += 1; else if (result.status === 'failed') failed += 1;
      // Only a delivered e-mail spends the account quota — a failed or SMS send does not.
      if (broadcast.channel === 'email' && result.status === 'sent') await limiter.consume(broadcast.account_id);

      await logMessage(base44, {
        contact_id: contact.id, account_id: contact.account_id || broadcast.account_id || '',
        channel: broadcast.channel, to_address: broadcast.channel === 'sms' ? contact.phone : contact.email,
        subject, body: messageBody, status: result.status, error: result.error || '', broadcast_id: broadcast.id,
        marketing: true,
      });
      await appendActivity(base44, contact, `Kampány: "${broadcast.name}" — ${result.status === 'sent' ? 'elküldve' : result.status === 'failed' ? 'sikertelen' : 'sorban'}`);
    }

    await base44.asServiceRole.entities.Broadcast.update(broadcast.id, {
      status: 'sent',
      sent_at: new Date().toISOString(),
      recipient_count: recipients.length,
      sent_count: sent,
      failed_count: failed,
    });

    await base44.asServiceRole.entities.ActivityLog.create({
      message: `Kampány elküldve: "${broadcast.name}" — ${recipients.length} címzett`,
      type: 'broadcast', entity_type: 'Broadcast', entity_id: broadcast.id, read: false,
    }).catch(() => null);

    return Response.json({
      recipients: recipients.length,
      sent,
      failed,
      skipped: all.length - recipients.length,
      no_consent: noConsent,
      limit_blocked: limitBlocked,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

serve(handler);
