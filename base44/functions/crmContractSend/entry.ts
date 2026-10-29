import { createClientFromRequest } from 'npm:@base44/sdk@0.8.57';
import {
  renderTemplate, sendEmail, logMessage, appendActivity, budapestIsoDate, formatLocalDateTime, newToken,
} from '../../shared/crm.ts';
import {
  money, contractHash, contractVars, findStage, portalConfig, portalCall, portalSignUrl, toPortalPayload,
  syncPortalContracts, contractHasFees,
} from '../../shared/contracts.ts';

// Az admin oldali szerződéskezelés. Az aláírás és a fizetés a külön, nyilvános Portal appban
// történik; innen csak létrehozzuk, visszavonjuk és időnként lekérdezzük az eredményét.
const DEFAULT_VALID_DAYS = 7;
const MAX_FEE = 1000000000;

function clean(value, max = 200) {
  return String(value == null ? '' : value).trim().slice(0, max);
}

function fee(value, fallback = 0) {
  const n = Number(value);
  if (value === undefined || value === null || value === '' || !Number.isFinite(n) || n < 0 || n > MAX_FEE) return fallback;
  return Math.round(n);
}

async function emailContract(base44, contract, contact, settings) {
  const url = contract.sign_url;
  const until = contract.expires_at ? formatLocalDateTime(new Date(contract.expires_at).getTime()) : '';
  const subject = `Szerződés aláírásra — ${contract.offer_name}`;
  const text = [
    `Kedves ${contract.contact_name || ''}!`,
    '',
    `Az egyeztetésünk alapján elkészítettük a szerződést (${contract.offer_name}).`,
    `Setup díj: ${money(contract.setup_fee)}`,
    `Havi díj: ${money(contract.monthly_fee)}`,
    '',
    'Itt tudod átnézni és online aláírni:',
    url,
    '',
    until ? `A link eddig érvényes: ${until}.` : '',
    '',
    'Ha kérdésed van, válaszolj erre az e-mailre.',
    '',
    'Üdvözlettel,',
    settings?.email_from_name || 'FunnelFlow',
  ].join('\n');
  const mail = await sendEmail(base44, {
    to: contact.email, subject, body: text, fromName: settings?.email_from_name || '',
  });
  await logMessage(base44, {
    contact_id: contact.id, account_id: contact.account_id || '', channel: 'email',
    to_address: contact.email, subject, body: text, status: mail.status, error: mail.error || '',
    booking_id: contract.booking_id || '',
  });
  return mail;
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    // Szerződést küldeni, újraküldeni és visszavonni kizárólag admin tud.
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const action = clean(body.action, 20) || 'create';
    const Contract = base44.asServiceRole.entities.Contract;
    const settingsList = await base44.asServiceRole.entities.WorkspaceSettings.list('-created_date', 1).catch(() => []);
    const settings = settingsList[0] || null;

    // ---- Stripe állapot a Portalban (csak olvasás) -----------------------
    if (action === 'payments_status') {
      if (!portalConfig().ok) {
        return Response.json({ connected: null, portal: false, error: 'A Portal app még nincs bekötve (PORTAL_URL, PORTAL_APP_ID, PORTAL_SECRET).' });
      }
      try {
        const r = await portalCall('payments_state');
        return Response.json({ connected: r.connected ?? null, portal: true, error: r.error || '' });
      } catch (e) {
        return Response.json({ connected: null, portal: false, error: e.message });
      }
    }

    // ---- a Portal eredményeinek átvétele (kézi gomb és időzített futás) ----
    if (action === 'sync') {
      if (!portalConfig().ok) return Response.json({ error: 'A Portal app még nincs bekötve.' }, { status: 503 });
      try {
        const r = await syncPortalContracts(base44, { contractId: clean(body.contract_id, 64), force: body.force === true });
        return Response.json({ ok: true, checked: r.checked, recorded: r.applied });
      } catch (e) {
        return Response.json({ error: e.message }, { status: 502 });
      }
    }

    // ---- friss fizetési link az adminnak (aláírt szerződéshez) -----------
    if (action === 'payment_link') {
      const contract = await Contract.get(clean(body.contract_id, 64)).catch(() => null);
      if (!contract) return Response.json({ error: 'A szerződés nem található' }, { status: 404 });
      if (contract.status !== 'signed') return Response.json({ error: 'Fizetési link csak aláírt szerződéshez készíthető.' }, { status: 400 });
      if (contract.payment_status === 'paid') return Response.json({ error: 'Ez a szerződés már ki van fizetve.' }, { status: 400 });
      if (!contractHasFees(contract)) return Response.json({ error: 'Ehhez a szerződéshez nincs fizetendő összeg.' }, { status: 400 });
      try {
        const r = await portalCall('payment_link', { crm_contract_id: String(contract.id) });
        return Response.json({ ok: true, url: r.url, page_url: contract.sign_url });
      } catch (e) {
        await Contract.update(contract.id, { payment_error: String(e.message).slice(0, 300) }).catch(() => null);
        return Response.json({ error: e.message }, { status: 400 });
      }
    }

    // ---- visszavonás ----------------------------------------------------
    if (action === 'cancel') {
      const contract = await Contract.get(clean(body.contract_id, 64)).catch(() => null);
      if (!contract) return Response.json({ error: 'A szerződés nem található' }, { status: 404 });
      if (contract.status === 'signed') return Response.json({ error: 'Az aláírt szerződés nem vonható vissza' }, { status: 400 });
      // A linknek a Portalon is meg kell szűnnie; ha ott nem sikerül, nem vonjuk vissza csak félig.
      try {
        await portalCall('cancel', { crm_contract_id: String(contract.id) });
      } catch (e) {
        if (!/nem található/i.test(e.message)) {
          return Response.json({ error: `A Portalon nem sikerült visszavonni, ezért a szerződés élő maradt: ${e.message}` }, { status: 502 });
        }
      }
      await Contract.update(contract.id, { status: 'cancelled' });
      const contact = contract.contact_id
        ? await base44.asServiceRole.entities.Contact.get(contract.contact_id).catch(() => null) : null;
      await appendActivity(base44, contact, `Szerződés visszavonva: ${contract.offer_name}`);
      return Response.json({ ok: true });
    }

    // ---- újraküldés -----------------------------------------------------
    if (action === 'resend') {
      let contract = await Contract.get(clean(body.contract_id, 64)).catch(() => null);
      if (!contract) return Response.json({ error: 'A szerződés nem található' }, { status: 404 });
      if (['signed', 'cancelled'].includes(contract.status)) {
        return Response.json({ error: 'Ez a szerződés már nem küldhető újra' }, { status: 400 });
      }
      const contact = await base44.asServiceRole.entities.Contact.get(contract.contact_id).catch(() => null);
      if (!contact) return Response.json({ error: 'A kontakt nem található' }, { status: 404 });
      const expired = !contract.expires_at || Date.now() > new Date(contract.expires_at).getTime();
      if (expired || contract.status === 'expired' || contract.status === 'declined') {
        contract = await Contract.update(contract.id, {
          status: 'sent',
          expires_at: new Date(Date.now() + DEFAULT_VALID_DAYS * 86400000).toISOString(),
        });
        // A Portalon is újra élővé kell tenni (az upsert csak a még nem aláírt szerződést frissíti).
        try {
          await portalCall('upsert', { contract: toPortalPayload(contract) });
        } catch (e) {
          return Response.json({ error: `A Portal nem érhető el: ${e.message}` }, { status: 502 });
        }
      }
      let mail = { status: 'skipped' };
      if (body.send_email !== false) {
        mail = contact.email
          ? await emailContract(base44, contract, contact, settings)
          : { status: 'failed', error: 'A kontaktnak nincs e-mail címe' };
        await Contract.update(contract.id, { send_status: mail.status, send_error: mail.error || '' });
      }
      return Response.json({
        ok: true, contract_id: contract.id, sign_url: contract.sign_url,
        email: { status: mail.status, error: mail.error || '' },
      });
    }

    // ---- új szerződés ---------------------------------------------------
    if (!portalConfig().ok) {
      return Response.json({ error: 'A Portal app még nincs bekötve, ezért a szerződés nem küldhető (PORTAL_URL, PORTAL_APP_ID, PORTAL_SECRET).' }, { status: 503 });
    }
    const contact = await base44.asServiceRole.entities.Contact.get(clean(body.contact_id, 64)).catch(() => null);
    if (!contact) return Response.json({ error: 'A kontakt nem található' }, { status: 404 });
    const offer = await base44.asServiceRole.entities.Offer.get(clean(body.offer_id, 64)).catch(() => null);
    if (!offer) return Response.json({ error: 'Az ajánlat nem található' }, { status: 404 });
    if (offer.active === false) return Response.json({ error: 'Ez az ajánlat inaktív' }, { status: 400 });

    const snapshot = {
      offer_name: clean(offer.name, 150),
      description: clean(offer.description, 1000),
      services: Array.isArray(offer.services) ? offer.services.map((s) => clean(s, 200)).filter(Boolean).slice(0, 30) : [],
      setup_fee: fee(body.setup_fee, fee(offer.setup_fee)),
      monthly_fee: fee(body.monthly_fee, fee(offer.monthly_fee)),
    };

    const template = clean(body.body_override, 20000) || clean(offer.contract_template, 20000);
    if (!template) return Response.json({ error: 'Az ajánlathoz nincs szerződésszöveg megadva' }, { status: 400 });
    const rendered = renderTemplate(template, contractVars(contact, snapshot, settings));

    const rawDays = Number(body.valid_days);
    const days = Number.isFinite(rawDays) ? Math.min(60, Math.max(1, Math.round(rawDays))) : DEFAULT_VALID_DAYS;
    const now = new Date();
    const paymentRaw = clean(body.payment_url !== undefined ? body.payment_url : offer.payment_url, 500);
    const paymentUrl = /^https:\/\//i.test(paymentRaw) ? paymentRaw : '';
    const token = newToken();

    const record = {
      contact_id: contact.id,
      booking_id: clean(body.booking_id, 64),
      offer_id: offer.id,
      ...snapshot,
      body: rendered,
      sign_token: token,
      sign_url: portalSignUrl(token),
      status: 'sent',
      sent_at: now.toISOString(),
      expires_at: new Date(now.getTime() + days * 86400000).toISOString(),
      payment_url: paymentUrl,
      payment_status: 'none',
      contact_name: contact.name || '',
      contact_email: contact.email || '',
      contact_company: contact.company || '',
    };
    record.content_hash = await contractHash(record);
    const contract = await Contract.create(record);

    // A szerződés a Portalra kerül; ha ott nem sikerül, nem marad árva rekord és élő link sem.
    try {
      await portalCall('upsert', { contract: toPortalPayload(contract) });
    } catch (e) {
      await Contract.delete(contract.id).catch(() => null);
      return Response.json({ error: `A szerződés nem küldhető el, a Portal nem érhető el: ${e.message}` }, { status: 502 });
    }

    // E-mail (a lead a meetingben a másolható linket is megkapja a válaszban).
    let mail = { status: 'skipped' };
    if (body.send_email !== false) {
      mail = contact.email
        ? await emailContract(base44, contract, contact, settings)
        : { status: 'failed', error: 'A kontaktnak nincs e-mail címe — használd a másolható linket.' };
      await Contract.update(contract.id, { send_status: mail.status, send_error: mail.error || '' });
    }

    // Értékesítési napló: "Ajánlat elküldve" a díjakkal, a küldő admin a closer.
    await base44.asServiceRole.entities.SalesEvent.create({
      account_id: contact.account_id || '',
      type: 'quote',
      date: budapestIsoDate(Date.now()),
      contact_id: contact.id,
      booking_id: record.booking_id || '',
      closer_id: user.id,
      source: contact.source || '',
      amount: snapshot.setup_fee,
      setup_fee: snapshot.setup_fee,
      monthly_fee: snapshot.monthly_fee,
    }).catch(() => null);

    // A kontakt az "Ajánlat" fázisba lép, ha van ilyen.
    const stage = await findStage(base44, contact.account_id, 'ajánlat');
    const stageChange = stage && contact.stage_id !== stage.id;
    const lines = [`Szerződés elküldve: ${snapshot.offer_name} (setup ${money(snapshot.setup_fee)}, havi ${money(snapshot.monthly_fee)})`];
    if (stageChange) lines.push(`Fázis módosítva: ${stage.name}`);
    try {
      const activity = [...(contact.activity || []), ...lines].slice(-100);
      await base44.asServiceRole.entities.Contact.update(contact.id, {
        activity, ...(stageChange ? { stage_id: stage.id } : {}),
      });
    } catch (e) { /* nem kritikus */ }

    await base44.asServiceRole.entities.ActivityLog.create({
      message: `Szerződés elküldve: ${contact.name} — ${snapshot.offer_name}`,
      type: 'contract', entity_type: 'Contract', entity_id: contract.id, read: false,
    }).catch(() => null);

    return Response.json({
      ok: true,
      contract_id: contract.id,
      sign_url: contract.sign_url,
      expires_at: contract.expires_at,
      email: { status: mail.status, error: mail.error || '' },
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
