import { createClientFromRequest, serve } from '../_shared/base44.ts';
import {
  TOKEN_RE, clean, contractHash, contractHasFees, createContractCheckout, syncContractPayments,
  paymentsState, paymentErrorMessage, hasValidSecret, adminView,
} from '../_shared/portal.ts';

// A CRM szerver-szerver kapcsolata. Csak rendszerhívás (titkos fejléc) fogadható el: titok nélkül
// a függvény semmit nem csinál és semmit nem ad vissza.
const MAX_FEE = 1000000000;
const MAX_BATCH = 100;

function fee(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > MAX_FEE) return null;
  return Math.round(n);
}

function validIso(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

async function findByCrmId(Contract, crmId) {
  const list = await Contract.filter({ crm_contract_id: crmId }, '-created_date', 1).catch(() => []);
  return list[0] || null;
}

// Lejárt, még nem aláírt szerződés állapotának frissítése.
async function expireIfNeeded(Contract, c) {
  if (['sent', 'viewed'].includes(c.status) && c.expires_at && Date.now() > new Date(c.expires_at).getTime()) {
    return Contract.update(c.id, { status: 'expired' });
  }
  return c;
}

async function handler(req) {
  try {
    if (!(await hasValidSecret(req))) return Response.json({ error: 'Forbidden' }, { status: 403 });

    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const action = clean(body.action, 30);
    const Contract = base44.asServiceRole.entities.PortalContract;

    // ---- Stripe állapot (csak olvasás) ----------------------------------
    if (action === 'payments_state') {
      return Response.json(await paymentsState());
    }

    // ---- szerződés létrehozása / frissítése (csak még nem aláírt) ---------
    if (action === 'upsert') {
      const c = body.contract || {};
      const crmId = clean(c.crm_contract_id, 64);
      const token = clean(c.sign_token, 80).toLowerCase();
      if (!crmId) return Response.json({ error: 'Hiányzó CRM azonosító' }, { status: 400 });
      if (!TOKEN_RE.test(token)) return Response.json({ error: 'Érvénytelen aláírási kód' }, { status: 400 });
      const setup = fee(c.setup_fee);
      const monthly = fee(c.monthly_fee);
      if (setup === null || monthly === null) return Response.json({ error: 'Érvénytelen díj' }, { status: 400 });
      if (!validIso(c.expires_at)) return Response.json({ error: 'Érvénytelen lejárati idő' }, { status: 400 });
      const text = String(c.body == null ? '' : c.body).slice(0, 20000);
      if (!text.trim()) return Response.json({ error: 'Hiányzik a szerződés szövege' }, { status: 400 });

      const record = {
        crm_contract_id: crmId,
        sign_token: token,
        contact_name: clean(c.contact_name, 150),
        contact_email: clean(c.contact_email, 200),
        contact_company: clean(c.contact_company, 200),
        offer_name: clean(c.offer_name, 150),
        description: clean(c.description, 1000),
        services: Array.isArray(c.services) ? c.services.map((s) => clean(s, 200)).filter(Boolean).slice(0, 30) : [],
        setup_fee: setup,
        monthly_fee: monthly,
        body: text,
        expires_at: new Date(c.expires_at).toISOString(),
        sent_at: validIso(c.sent_at) ? new Date(c.sent_at).toISOString() : new Date().toISOString(),
        payment_url: /^https:\/\//i.test(clean(c.payment_url, 500)) ? clean(c.payment_url, 500) : '',
      };
      // A CRM által küldött hash-nek egyeznie kell a kapott tartalommal: így az aláírt szöveg
      // bizonyíthatóan ugyanaz, amit a CRM-ben elküldtek.
      const computed = await contractHash(record);
      if (computed !== clean(c.content_hash, 80).toLowerCase()) {
        return Response.json({ error: 'A dokumentum hash-e nem egyezik a tartalommal' }, { status: 400 });
      }
      record.content_hash = computed;

      const existing = await findByCrmId(Contract, crmId);
      // Az aláírt és a visszavont szerződés tartalma nem módosítható.
      if (existing && ['signed', 'cancelled'].includes(existing.status)) {
        return Response.json({ error: 'Ez a szerződés már nem módosítható' }, { status: 409 });
      }
      // Egy token csak egy szerződéshez tartozhat.
      const tokenOwner = (await Contract.filter({ sign_token: token }, '-created_date', 1).catch(() => []))[0];
      if (tokenOwner && tokenOwner.crm_contract_id !== crmId) {
        return Response.json({ error: 'Az aláírási kód már foglalt' }, { status: 409 });
      }

      if (existing) {
        await Contract.update(existing.id, {
          ...record, status: 'sent', viewed_at: '', declined_at: '', decline_reason: '',
        });
      } else {
        await Contract.create({ ...record, status: 'sent', payment_status: 'none' });
      }
      return Response.json({ ok: true });
    }

    // ---- visszavonás ----------------------------------------------------
    if (action === 'cancel') {
      const existing = await findByCrmId(Contract, clean(body.crm_contract_id, 64));
      if (!existing) return Response.json({ error: 'A szerződés nem található' }, { status: 404 });
      if (existing.status === 'signed') return Response.json({ error: 'Az aláírt szerződés nem vonható vissza' }, { status: 409 });
      await Contract.update(existing.id, { status: 'cancelled' });
      return Response.json({ ok: true });
    }

    // ---- állapot lekérése + fizetések szinkronja (a CRM időzített futása) ---
    if (action === 'sync') {
      const ids = (Array.isArray(body.crm_contract_ids) ? body.crm_contract_ids : [])
        .map((x) => clean(x, 64)).filter(Boolean).slice(0, MAX_BATCH);
      const force = body.force === true;
      const states = [];
      for (const crmId of ids) {
        let c = await findByCrmId(Contract, crmId);
        if (!c) { states.push({ crm_contract_id: crmId, status: 'missing' }); continue; }
        c = await expireIfNeeded(Contract, c);
        const trackable = c.status === 'signed' && contractHasFees(c)
          && ((c.checkout_ids || []).length > 0 || !!c.subscription_id);
        const lastSync = c.payment_synced_at ? Date.parse(c.payment_synced_at) : 0;
        if (trackable && (force || Date.now() - lastSync > 60000)) {
          try {
            const r = await syncContractPayments(base44, c);
            c = r.contract || c;
          } catch (e) { /* a többi szerződés ettől még frissül */ }
        }
        states.push(adminView(c));
      }
      return Response.json({ ok: true, states });
    }

    // ---- friss fizetési link az adminnak (aláírt szerződéshez) -----------
    if (action === 'payment_link') {
      const c = await findByCrmId(Contract, clean(body.crm_contract_id, 64));
      if (!c) return Response.json({ error: 'A szerződés nem található' }, { status: 404 });
      if (c.status !== 'signed') return Response.json({ error: 'Fizetési link csak aláírt szerződéshez készíthető.' }, { status: 400 });
      if (c.payment_status === 'paid') return Response.json({ error: 'Ez a szerződés már ki van fizetve.' }, { status: 400 });
      if (!contractHasFees(c)) return Response.json({ error: 'Ehhez a szerződéshez nincs fizetendő összeg.' }, { status: 400 });
      try {
        const checkout = await createContractCheckout(base44, c);
        // Az összeg és a pénznem azért is visszajön, hogy ellenőrizhető legyen, a Stripe a várt
        // forint összeget látja-e (150 000 Ft = 15 000 000 egység).
        return Response.json({
          ok: true, url: checkout.redirect_url, amount_total: checkout.amount_total, currency: checkout.currency,
        });
      } catch (e) {
        await Contract.update(c.id, { payment_error: paymentErrorMessage(e).slice(0, 300) }).catch(() => null);
        return Response.json({ error: paymentErrorMessage(e) }, { status: 400 });
      }
    }

    return Response.json({ error: 'Ismeretlen művelet' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: 'Hiba történt a Portal oldalán.' }, { status: 500 });
  }
}

serve(handler);
