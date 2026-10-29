import { createClientFromRequest, serve } from '../_shared/base44.ts';
import {
  TOKEN_RE, NOT_FOUND, CONSENT_TEXT, clean, contractHash, contractHasFees, createContractCheckout,
  syncContractPayments, paymentsState, paymentErrorMessage, publicView,
} from '../_shared/portal.ts';

// Nyilvános végpont az aláíró és fizető oldalhoz (/s/:token). A hosszú, véletlen token az egyetlen
// "hitelesítő": kizárólag az ahhoz tartozó szerződést adja vissza, listázni nem lehet, és a
// kontakt e-mail címét vagy telefonszámát sosem adja ki. A CRM-be semmit nem ír: az aláírást,
// a megnyitást és a fizetést a CRM veszi át a saját szinkronjával.

// A lead oldala: az aláírás után a fizetés állapota is látszik. Ha a Stripe be van kötve, a
// "Fizetés" gomb friss checkoutot készít; ha nincs, a kézi tartalék link (ha van) jelenik meg.
async function viewWithPayment(base44, contract) {
  let c = contract;
  const unpaid = c.status === 'signed' && contractHasFees(c) && c.payment_status !== 'paid';
  if (unpaid) {
    const lastSync = c.payment_synced_at ? Date.parse(c.payment_synced_at) : 0;
    if ((c.checkout_ids || []).length && Date.now() - lastSync > 15000) {
      await syncContractPayments(base44, c).catch(() => null);
      c = await base44.asServiceRole.entities.PortalContract.get(c.id).catch(() => c);
    }
  }
  const extra = {};
  if (c.status === 'signed' && contractHasFees(c) && c.payment_status !== 'paid') {
    const state = await paymentsState();
    extra.payments_enabled = state.connected === true;
    extra.manual_payment_url = c.payment_url || '';
  }
  return publicView(c, extra);
}

async function handler(req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const token = clean(body.token, 80).toLowerCase();
    if (!TOKEN_RE.test(token)) return Response.json({ error: NOT_FOUND }, { status: 404 });

    const Contract = base44.asServiceRole.entities.PortalContract;
    const found = await Contract.filter({ sign_token: token }, '-created_date', 1).catch(() => []);
    let contract = found[0];
    if (!contract) return Response.json({ error: NOT_FOUND }, { status: 404 });

    // Lejárt, még nem aláírt szerződés.
    if (['sent', 'viewed'].includes(contract.status) && contract.expires_at
      && Date.now() > new Date(contract.expires_at).getTime()) {
      contract = await Contract.update(contract.id, { status: 'expired' });
    }

    const action = clean(body.action, 20) || 'get';

    // ---- megnyitás ------------------------------------------------------
    if (action === 'get') {
      if (contract.status === 'sent') {
        contract = await Contract.update(contract.id, { status: 'viewed', viewed_at: new Date().toISOString() });
      }
      return Response.json(await viewWithPayment(base44, contract));
    }

    // ---- fizetés indítása (csak aláírt szerződésre) -------------------------
    if (action === 'pay') {
      if (contract.status !== 'signed') {
        return Response.json({ error: 'A fizetés az aláírás után indítható.' }, { status: 409 });
      }
      if (!contractHasFees(contract)) return Response.json({ error: 'Ehhez a szerződéshez nincs fizetendő összeg.' }, { status: 400 });
      // Előbb ellenőrizzük, nem fizette-e ki már (pl. másik lapon).
      if ((contract.checkout_ids || []).length) {
        await syncContractPayments(base44, contract).catch(() => null);
        const again = await Contract.get(contract.id).catch(() => contract);
        if (again.payment_status === 'paid') return Response.json({ ok: true, paid: true });
        contract = again;
      }
      try {
        const checkout = await createContractCheckout(base44, contract);
        if (!checkout.redirect_url) return Response.json({ error: 'A fizetőoldal nem készült el, próbáld újra.' }, { status: 502 });
        return Response.json({ ok: true, redirect_url: checkout.redirect_url });
      } catch (e) {
        // A lead ne lásson technikai részletet; a pontos ok a szerződésen van, a CRM-ben látszik.
        await Contract.update(contract.id, { payment_error: paymentErrorMessage(e).slice(0, 300) }).catch(() => null);
        return Response.json({
          error: 'A fizetés most nem indítható. Szólunk, amint kész a fizetési link.',
          manual_payment_url: contract.payment_url || '',
        }, { status: 503 });
      }
    }

    // ---- aláírás --------------------------------------------------------
    if (action === 'sign') {
      if (!['sent', 'viewed'].includes(contract.status)) {
        const reasons = {
          signed: 'Ez a szerződés már alá van írva.',
          expired: 'Ez a szerződés lejárt. Kérj új linket.',
          cancelled: 'Ez a szerződés már nem elérhető.',
          declined: 'Ezt a szerződést elutasították.',
        };
        return Response.json({ error: reasons[contract.status] || NOT_FOUND }, { status: 409 });
      }
      const signerName = clean(body.signer_name, 120);
      if (signerName.length < 3) return Response.json({ error: 'Add meg a teljes nevedet az aláíráshoz.' }, { status: 400 });
      if (body.accept !== true) return Response.json({ error: 'Az aláíráshoz el kell fogadnod a nyilatkozatot.' }, { status: 400 });

      // Integritás: az aláírt tartalomnak meg kell egyeznie a kiküldöttel.
      if ((await contractHash(contract)) !== contract.content_hash) {
        return Response.json({ error: 'A dokumentum tartalma megváltozott, ezért nem írható alá. Kérj új linket.' }, { status: 409 });
      }

      // Kettős aláírás ellen: az utolsó pillanatban újra ellenőrizzük az állapotot.
      const fresh = await Contract.get(contract.id).catch(() => null);
      if (!fresh || !['sent', 'viewed'].includes(fresh.status)) {
        return Response.json({ error: 'Ez a szerződés már alá van írva.' }, { status: 409 });
      }

      const forwarded = req.headers.get('x-forwarded-for') || '';
      const ip = clean(forwarded.split(',')[0] || req.headers.get('cf-connecting-ip') || '', 64);
      const userAgent = clean(req.headers.get('user-agent') || '', 300);

      contract = await Contract.update(contract.id, {
        status: 'signed',
        signed_at: new Date().toISOString(),
        signer_name: signerName,
        signer_ip: ip,
        signer_user_agent: userAgent,
        consent_text: CONSENT_TEXT,
      });

      const signedView = await viewWithPayment(base44, contract).catch(() => publicView(contract));
      return Response.json({ ok: true, ...signedView });
    }

    // ---- elutasítás -----------------------------------------------------
    if (action === 'decline') {
      if (!['sent', 'viewed'].includes(contract.status)) {
        return Response.json({ error: 'Ez a szerződés már nem utasítható el.' }, { status: 409 });
      }
      contract = await Contract.update(contract.id, {
        status: 'declined', declined_at: new Date().toISOString(), decline_reason: clean(body.reason, 500),
      });
      return Response.json({ ok: true, ...publicView(contract) });
    }

    return Response.json({ error: 'Ismeretlen művelet' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: 'Hiba történt, próbáld újra később.' }, { status: 500 });
  }
}

serve(handler);
