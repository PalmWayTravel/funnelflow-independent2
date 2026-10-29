import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import {
  renderTemplate, triggerMatches, buildVars,
  sendEmail, sendSms, logMessage, appendActivity,
  isMarketingAllowed, marketingSkipReason, ensureUnsubscribeToken, emailFooter, accountReplyFooter,
  createSendLimiter,
} from '../../shared/crm.ts';

const MAX_STEPS_PER_RUN = 30;

function requestOrigin(req) {
  try {
    return new URL(req.url).origin;
  } catch (e) {
    return '';
  }
}

// An automation only ever runs for the account it is bound to. An automation without an
// account belongs to the agency's own workspace and runs only for the agency's own contacts
// (contacts without an account) — never for a client's leads.
function accountMatches(automation, contact, accountId) {
  return (automation.account_id || '') === (contact?.account_id || accountId || '');
}

function unsubscribeLine(origin, token) {
  if (!token) return '';
  return `Leiratkozás a marketing e-mailekről: ${origin}/u/${token}`;
}

async function logBlockedSend(base44, automation, contact, booking, step, accountId, reason, marketing = true) {
  const channel = step.type === 'sms' ? 'sms' : 'email';
  await logMessage(base44, {
    contact_id: contact?.id || '',
    account_id: accountId,
    channel,
    to_address: channel === 'sms' ? (contact?.phone || '') : (contact?.email || ''),
    subject: renderTemplate(step.subject || automation.name, buildVars(contact, booking)),
    body: '',
    status: 'failed',
    error: `Kihagyva — ${reason}`,
    automation_id: automation.id,
    marketing,
  });
  if (contact) await appendActivity(base44, contact, `Marketing küldés kihagyva: ${reason}`);
}

async function runStep(base44, automation, contact, booking, step, ctx) {
  const vars = buildVars(contact, booking);
  const marketing = automation.marketing === true;

  // Marketing messages are gated by the contact's marketing consent.
  if (marketing && (step.type === 'email' || step.type === 'sms')) {
    const reason = marketingSkipReason(contact);
    if (reason) {
      await logBlockedSend(base44, automation, contact, booking, step, ctx.accountId, reason, marketing);
      return { message: `Marketing küldés kihagyva: ${reason} — sorozat leállítva`, stop: true };
    }
  }
  // Every outgoing e-mail — marketing and transactional alike — counts against the account cap.
  if (step.type === 'email') {
    const limit = await ctx.limiter.canSend(ctx.accountId);
    if (!limit.allowed) {
      await logBlockedSend(base44, automation, contact, booking, step, ctx.accountId, limit.reason, marketing);
      return { message: `Küldés kihagyva: ${limit.reason} — sorozat leállítva`, stop: true };
    }
  }

  if (step.type === 'email') {
    const account = await ctx.limiter.account(ctx.accountId);
    const fromName = account?.name || ctx.settings?.email_from_name || '';
    const subject = renderTemplate(step.subject || automation.name, vars);
    let body = renderTemplate(step.body || '', vars);
    if (marketing) {
      const token = await ensureUnsubscribeToken(base44, contact);
      body += emailFooter([accountReplyFooter(account), unsubscribeLine(ctx.origin, token)]);
    } else {
      body += emailFooter([accountReplyFooter(account)]);
    }
    const result = contact?.email
      ? await sendEmail(base44, { to: contact.email, subject, body, fromName })
      : { status: 'failed', error: 'A kontaktnak nincs e-mail címe' };
    // Only a delivered e-mail spends the account's daily quota.
    if (result.status === 'sent') await ctx.limiter.consume(ctx.accountId);
    await logMessage(base44, {
      contact_id: contact?.id || '', account_id: ctx.accountId,
      channel: 'email', to_address: contact?.email || '', subject, body,
      status: result.status, error: result.error || '', automation_id: automation.id, marketing,
    });
    if (contact?.email) {
      await base44.asServiceRole.entities.Contact.update(contact.id, {
        last_contacted_at: new Date().toISOString(),
        last_message_status: result.status,
      }).catch(() => null);
    }
    await appendActivity(base44, contact, `Automatikus e-mail: "${subject}" — ${result.status === 'sent' ? 'elküldve' : result.status === 'failed' ? 'sikertelen' : 'sorban'}`);
    return { message: `E-mail: ${subject} (${result.status})` };
  }

  if (step.type === 'sms') {
    const account = await ctx.limiter.account(ctx.accountId);
    const body = renderTemplate(step.body || '', vars);
    const result = contact?.phone
      ? await sendSms({
        to: contact.phone, body,
        fromName: account?.name || ctx.settings?.sms_from_name || '',
        enabled: ctx.settings?.sms_enabled === true,
      })
      : { status: 'failed', error: 'A kontaktnak nincs telefonszáma' };
    await logMessage(base44, {
      contact_id: contact?.id || '', account_id: ctx.accountId,
      channel: 'sms', to_address: contact?.phone || '', body,
      status: result.status, error: result.error || '', automation_id: automation.id, marketing,
    });
    await appendActivity(base44, contact, `Automatikus SMS — ${result.status === 'sent' ? 'elküldve' : result.status === 'failed' ? 'sikertelen' : 'sorban'}`);
    return { message: `SMS (${result.status})` };
  }

  if (step.type === 'tag') {
    if (!contact) return { message: 'Címke: nincs kontakt' };
    const tags = new Set(contact.tags || []);
    if (step.tag_action === 'remove') tags.delete(step.tag); else if (step.tag) tags.add(step.tag);
    const nextTags = Array.from(tags);
    await base44.asServiceRole.entities.Contact.update(contact.id, { tags: nextTags });
    contact.tags = nextTags;
    await appendActivity(base44, contact, `Címke ${step.tag_action === 'remove' ? 'levéve' : 'hozzáadva'}: ${step.tag}`);
    return { message: `Címke frissítve: ${step.tag}` };
  }

  if (step.type === 'stage') {
    if (!contact || !step.stage_id) return { message: 'Fázisváltás kihagyva' };
    await base44.asServiceRole.entities.Contact.update(contact.id, { stage_id: step.stage_id });
    contact.stage_id = step.stage_id;
    await appendActivity(base44, contact, 'Fázis automatikusan módosítva');
    return { message: 'Fázis frissítve' };
  }

  if (step.type === 'condition') {
    const has = contact && step.tag && (contact.tags || []).includes(step.tag);
    if (has) return { message: `Feltétel teljesült: ${step.tag}` };
    return { message: `Feltétel nem teljesült: ${step.tag} — leállítás`, stop: true };
  }

  if (step.type === 'notify') {
    const message = renderTemplate(step.message || `Automatizáció futott: ${automation.name}`, vars);
    await base44.asServiceRole.entities.ActivityLog.create({ message, type: 'automation', entity_type: 'Contact', entity_id: contact?.id || '', read: false }).catch(() => null);
    return { message: 'Belső értesítés létrehozva' };
  }

  if (step.type === 'stop') {
    return { message: 'Automatizáció leállítva', stop: true };
  }

  return { message: `Ismeretlen lépés kihagyva: ${step.type}` };
}

async function executeRun(base44, run, ctx) {
  const automation = await base44.asServiceRole.entities.Automation.get(run.automation_id).catch(() => null);
  if (!automation) {
    await base44.asServiceRole.entities.AutomationRun.update(run.id, { status: 'stopped' }).catch(() => null);
    return { executed: 0, finished: true };
  }
  if (automation.active === false) {
    const history = [...(run.history || []), 'Az automatizáció szüneteltetve — a sorozat leállt.'].slice(-60);
    await base44.asServiceRole.entities.AutomationRun.update(run.id, { status: 'stopped', history }).catch(() => null);
    return { executed: 0, finished: true };
  }

  const contact = run.contact_id ? await base44.asServiceRole.entities.Contact.get(run.contact_id).catch(() => null) : null;
  const booking = run.booking_id ? await base44.asServiceRole.entities.Booking.get(run.booking_id).catch(() => null) : null;
  const steps = automation.steps || [];
  const runCtx = {
    settings: ctx.settings,
    origin: ctx.origin,
    limiter: ctx.limiter,
    accountId: run.account_id || automation.account_id || contact?.account_id || '',
  };

  let index = run.current_step || 0;
  let delayApplied = typeof run.delay_applied_for === 'number' ? run.delay_applied_for : -1;
  const history = [...(run.history || [])];
  let executed = 0;
  let status = 'running';
  let nextRunAt = run.next_run_at;

  while (index < steps.length && executed < MAX_STEPS_PER_RUN) {
    const step = steps[index] || {};
    if (step.type === 'wait') {
      if (delayApplied !== index) {
        const minutes = (Number(step.days) || 0) * 1440 + (Number(step.hours) || 0) * 60 + (Number(step.minutes) || 0);
        delayApplied = index;
        nextRunAt = new Date(Date.now() + Math.max(1, minutes) * 60000).toISOString();
        history.push(`Várakozás: ${Number(step.days) || 0} nap ${Number(step.hours) || 0} óra ${Number(step.minutes) || 0} perc`);
        await base44.asServiceRole.entities.AutomationRun.update(run.id, {
          current_step: index, delay_applied_for: delayApplied, next_run_at: nextRunAt, history, status: 'running',
        });
        return { executed, finished: false };
      }
    } else {
      const outcome = await runStep(base44, automation, contact, booking, step, runCtx);
      executed += 1;
      history.push(outcome.message);
      if (outcome.stop) { status = 'stopped'; break; }
    }
    index += 1;
    delayApplied = -1;
  }

  if (status === 'running' && index >= steps.length) status = 'done';
  const patch = {
    current_step: index,
    delay_applied_for: delayApplied,
    history: history.slice(-60),
    status,
    next_run_at: status === 'running' ? new Date(Date.now() + 1000).toISOString() : nextRunAt,
  };
  await base44.asServiceRole.entities.AutomationRun.update(run.id, patch);
  return { executed, finished: status !== 'running' };
}

async function processRuns(base44, ctx) {
  const nowIso = new Date().toISOString();
  const due = await base44.asServiceRole.entities.AutomationRun.filter(
    { status: 'running', next_run_at: { $lte: nowIso } }, 'next_run_at', 50
  ).catch(() => []);

  let executed = 0;
  let finished = 0;
  for (const run of due) {
    const res = await executeRun(base44, run, ctx);
    executed += res.executed;
    if (res.finished) finished += 1;
  }
  return { due: due.length, executed, finished };
}

async function scheduleUpcomingReminders(base44, ctx) {
  const automations = await base44.asServiceRole.entities.Automation.filter({ active: true, trigger: 'booking_upcoming' }).catch(() => []);
  if (!automations.length) return 0;
  const bookings = await base44.asServiceRole.entities.Booking.filter({ status: 'confirmed' }, '-start', 200).catch(() => []);
  const now = Date.now();
  let created = 0;
  for (const automation of automations) {
    const windowMs = (Number(automation.trigger_minutes_before) || 60) * 60000;
    for (const booking of bookings) {
      if (!booking.start) continue;
      if (!accountMatches(automation, null, booking.account_id)) continue;
      const start = new Date(booking.start).getTime();
      if (isNaN(start) || start - now > windowMs || start - now < -windowMs) continue;
      const key = `${automation.id}:${booking.id}`;
      const existing = await base44.asServiceRole.entities.AutomationRun.filter({ dedupe_key: key }).catch(() => []);
      if (existing.length) continue;
      await base44.asServiceRole.entities.AutomationRun.create({
        automation_id: automation.id, contact_id: booking.contact_id || '', booking_id: booking.id,
        account_id: booking.account_id || automation.account_id || '',
        current_step: 0, status: 'running', next_run_at: new Date().toISOString(),
        delay_applied_for: -1, dedupe_key: key,
        history: [`Indítás emlékeztető: ${automation.name}`],
      });
      created += 1;
    }
  }
  return created;
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // Cross-account work (queue maintenance, other accounts' records) is admin-only;
    // everyone else may only act on records belonging to their own account.
    const isAdmin = user.role === 'admin';
    const callerAccountId = user.account_id || user.data?.account_id || '';
    if (!isAdmin && !callerAccountId) return Response.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const action = body.action;
    const payload = body.payload || {};
    const settingsList = await base44.asServiceRole.entities.WorkspaceSettings.list('-created_date', 1).catch(() => []);
    const ctx = {
      settings: settingsList[0] || null,
      origin: requestOrigin(req),
      limiter: createSendLimiter(base44),
    };

    if (action === 'trigger') {
      const automations = await base44.asServiceRole.entities.Automation.filter({ active: true }).catch(() => []);
      const contact = body.contact_id
        ? await base44.asServiceRole.entities.Contact.get(body.contact_id).catch(() => null)
        : null;
      // Non-admins may only start sequences for a contact of their own account.
      if (!isAdmin && (!contact || contact.account_id !== callerAccountId)) {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
      }
      const accountId = contact?.account_id || payload.account_id || '';
      const matched = automations.filter((a) => triggerMatches(a, body.event, payload) && accountMatches(a, contact, accountId));

      let created = 0;
      let skipped = 0;
      for (const automation of matched) {
        // Marketing sequences only start for contacts who opted in and have not unsubscribed.
        if (automation.marketing === true && !isMarketingAllowed(contact)) { skipped += 1; continue; }
        if (automation.stop_tag && contact && (contact.tags || []).includes(automation.stop_tag)) continue;
        if (automation.condition_tag && contact && !(contact.tags || []).includes(automation.condition_tag)) continue;
        const key = payload.booking_id ? `${automation.id}:${payload.booking_id}` : '';
        if (key) {
          const existing = await base44.asServiceRole.entities.AutomationRun.filter({ dedupe_key: key }).catch(() => []);
          if (existing.length) continue;
        }
        await base44.asServiceRole.entities.AutomationRun.create({
          automation_id: automation.id,
          contact_id: body.contact_id || '',
          booking_id: payload.booking_id || '',
          account_id: accountId,
          current_step: 0, status: 'running', next_run_at: new Date().toISOString(),
          delay_applied_for: -1, dedupe_key: key,
          history: [`Indítás: ${automation.name}`],
        });
        await base44.asServiceRole.entities.Automation.update(automation.id, {
          run_count: (automation.run_count || 0) + 1,
        }).catch(() => null);
        created += 1;
      }
      const result = await processRuns(base44, ctx);
      return Response.json({ triggered: created, skipped, ...result });
    }

    if (action === 'process') {
      // The run queue and the reminder sweep span every account — admin maintenance.
      if (!isAdmin) return Response.json({ error: 'Forbidden' }, { status: 403 });
      const scheduled = await scheduleUpcomingReminders(base44, ctx);
      const result = await processRuns(base44, ctx);
      return Response.json({ scheduled, ...result });
    }

    if (action === 'send_message') {
      const settings = ctx.settings;
      const contact = await base44.asServiceRole.entities.Contact.get(body.contact_id).catch(() => null);
      if (!contact) return Response.json({ error: 'A kontakt nem található' }, { status: 404 });
      // Non-admins may only message a contact of their own account.
      if (!isAdmin && contact.account_id !== callerAccountId) {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
      }
      const channel = body.channel === 'sms' ? 'sms' : 'email';
      const account = contact.account_id
        ? await base44.asServiceRole.entities.Account.get(contact.account_id).catch(() => null)
        : null;
      const vars = buildVars(contact, null);
      const subject = renderTemplate(body.subject || 'Üzenet', vars);
      let messageBody = renderTemplate(body.body || '', vars);
      if (channel === 'email') messageBody += emailFooter([accountReplyFooter(account)]);
      // A manual e-mail spends the account's daily quota as well.
      if (channel === 'email') {
        const limit = await ctx.limiter.canSend(contact.account_id || '');
        if (!limit.allowed) {
          await logMessage(base44, {
            contact_id: contact.id, account_id: contact.account_id || '', channel,
            to_address: contact.email || '', subject, body: messageBody,
            status: 'failed', error: `Kihagyva — ${limit.reason}`, marketing: false,
          });
          return Response.json({ status: 'failed', error: `Kihagyva — ${limit.reason}` });
        }
      }
      const result = channel === 'sms'
        ? await sendSms({
          to: contact.phone, body: messageBody,
          fromName: account?.name || settings?.sms_from_name || '',
          enabled: settings?.sms_enabled === true,
        })
        : await sendEmail(base44, { to: contact.email, subject, body: messageBody, fromName: account?.name || settings?.email_from_name || '' });
      if (channel === 'email' && result.status === 'sent') await ctx.limiter.consume(contact.account_id || '');
      await logMessage(base44, {
        contact_id: contact.id, account_id: contact.account_id || '', channel,
        to_address: channel === 'sms' ? contact.phone : contact.email,
        subject, body: messageBody, status: result.status, error: result.error || '', marketing: false,
      });
      if (channel === 'email' && contact.email) {
        await base44.asServiceRole.entities.Contact.update(contact.id, {
          last_contacted_at: new Date().toISOString(), last_message_status: result.status,
        }).catch(() => null);
      }
      await appendActivity(base44, contact, `Kézi ${channel === 'sms' ? 'SMS' : 'e-mail'}: ${subject} — ${result.status}`);
      return Response.json({ status: result.status, error: result.error || '' });
    }

    return Response.json({ error: 'Ismeretlen művelet' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}