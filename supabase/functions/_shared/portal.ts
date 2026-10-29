import { secrets, isSystemRequest } from "./base44.ts";

// A FunnelFlow Portal közös logikája: a lead itt nyitja meg, írja alá és fizeti ki a szerződést.
// Minden adat csak a hosszú, véletlen tokennel érhető el; a CRM-mel rendszer-szintű (titkos) hívás köt össze.
// A fizetés közvetlenül a Stripe API-n megy (STRIPE_SECRET_KEY).

export const TOKEN_RE = /^[a-f0-9]{48}$/;
export const NOT_FOUND = "Érvénytelen vagy lejárt link";

export const CONSENT_TEXT =
  "Kijelentem, hogy a szerződés szövegét elolvastam, megértettem és elfogadom. Tudomásul veszem, hogy a nevem beírásával és az „Aláírom” gombra kattintással elektronikus aláírást adok, amelyet a rendszer az időponttal és technikai adatokkal együtt rögzít.";

export function clean(value, max = 200) {
  return String(value == null ? "" : value).trim().slice(0, max);
}

// A hash-elt tartalom. A CRM pontosan ugyanezt a mezőkészletet hash-eli, ezért a kettőnek betűre egyeznie kell.
export function contractSnapshot(c) {
  return JSON.stringify({
    offer_name: c.offer_name || "",
    description: c.description || "",
    services: c.services || [],
    setup_fee: Number(c.setup_fee) || 0,
    monthly_fee: Number(c.monthly_fee) || 0,
    body: c.body || "",
    contact_name: c.contact_name || "",
    contact_company: c.contact_company || "",
    contact_email: c.contact_email || "",
  });
}

export async function sha256Hex(text) {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function contractHash(c) {
  return sha256Hex(contractSnapshot(c));
}

// Csak a rendszer (ütemező / másik függvény) hívhatja az admin műveleteket.
export async function hasValidSecret(req) {
  return await isSystemRequest(req);
}

// ---- Fizetés (Stripe) ------------------------------------------------------------------

export const PAYMENT_CURRENCY = "huf";
const STRIPE_VERSION = "2024-06-20";

// A Stripe a forintot két tizedessel kezeli: 150 000 Ft = 15 000 000 egység.
export function toMinor(ft) {
  return Math.round(Number(ft) || 0) * 100;
}

export function fromMinor(minor) {
  return Math.round((Number(minor) || 0) / 100);
}

export function contractHasFees(c) {
  return (Number(c.setup_fee) || 0) > 0 || (Number(c.monthly_fee) || 0) > 0;
}

function encodeForm(value, prefix, out) {
  if (value === undefined || value === null) return;
  if (Array.isArray(value)) {
    value.forEach((v, i) => encodeForm(v, `${prefix}[${i}]`, out));
  } else if (typeof value === "object") {
    for (const [k, v] of Object.entries(value)) encodeForm(v, prefix ? `${prefix}[${k}]` : k, out);
  } else {
    out.push(`${encodeURIComponent(prefix)}=${encodeURIComponent(String(value))}`);
  }
}

async function stripe(path, { method = "GET", params, idempotencyKey } = {}) {
  const key = secrets.get("STRIPE_SECRET_KEY");
  if (!key) throw Object.assign(new Error("A Stripe még nincs bekötve."), { code: "payments_not_connected" });
  const pairs = [];
  encodeForm(params, "", pairs);
  const body = pairs.join("&");
  const url = `https://api.stripe.com/v1${path}${method === "GET" && body ? `?${body}` : ""}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      "Stripe-Version": STRIPE_VERSION,
      ...(method !== "GET" ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    ...(method !== "GET" ? { body } : {}),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = json?.error || {};
    throw Object.assign(new Error(err.message || `Stripe hiba (${res.status})`), {
      code: res.status === 401 ? "payments_not_connected" : err.code || err.type || "",
    });
  }
  return json;
}

export function paymentErrorCode(e) {
  return e?.code || "";
}

export function paymentErrorMessage(e) {
  const code = paymentErrorCode(e);
  const map = {
    payments_not_connected: "A Stripe még nincs bekötve (hiányzik vagy érvénytelen a STRIPE_SECRET_KEY).",
    amount_too_small: "Az összeg kisebb a Stripe minimum díjánál.",
    amount_too_large: "Az összeg meghaladja a Stripe maximumát.",
    currency_not_supported: "A Stripe-fiók nem támogatja a forintot (HUF).",
    rate_limit: "Túl sok kérés, próbáld újra egy perc múlva.",
  };
  return map[code] || `Fizetési hiba: ${e?.message || "ismeretlen hiba"}`;
}

// Be van-e kötve a Stripe (olvasás, nem módosít semmit).
export async function paymentsState() {
  if (!secrets.get("STRIPE_SECRET_KEY")) return { connected: false, error: "" };
  try {
    await stripe("/balance");
    return { connected: true, error: "" };
  } catch (e) {
    if (paymentErrorCode(e) === "payments_not_connected") return { connected: false, error: "" };
    return { connected: null, error: e?.message || "Ismeretlen hiba" };
  }
}

// Friss Stripe Checkout a szerződés díjaiból: egyszeri setup tétel + havi előfizetés egy fizetésben.
// A hosted checkout 24 óráig él, ezért a link mindig kérésre készül (6 órás idempotencia-ablakkal).
export async function createContractCheckout(base44, contract) {
  const setup = Number(contract.setup_fee) || 0;
  const monthly = Number(contract.monthly_fee) || 0;
  const appUrl = String(secrets.get("APP_URL") || "").replace(/\/+$/, "");
  if (!appUrl) throw new Error("Hiányzik az APP_URL beállítás.");
  const lineItems = [];
  if (setup > 0) {
    lineItems.push({
      quantity: 1,
      price_data: { currency: PAYMENT_CURRENCY, unit_amount: toMinor(setup), product_data: { name: `${contract.offer_name} — setup díj`.slice(0, 250) } },
    });
  }
  if (monthly > 0) {
    lineItems.push({
      quantity: 1,
      price_data: {
        currency: PAYMENT_CURRENCY,
        unit_amount: toMinor(monthly),
        recurring: { interval: "month" },
        product_data: { name: `${contract.offer_name} — havi díj`.slice(0, 250) },
      },
    });
  }
  if (!lineItems.length) throw new Error("Ehhez a szerződéshez nincs fizetendő összeg.");

  const email = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contract.contact_email || "") ? contract.contact_email : undefined;
  const metadata = { contract_id: String(contract.id), crm_contract_id: String(contract.crm_contract_id || "") };
  const bucket = Math.floor(Date.now() / (6 * 3600 * 1000));
  const session = await stripe("/checkout/sessions", {
    method: "POST",
    idempotencyKey: `contract-${contract.id}-${bucket}-${setup}-${monthly}`,
    params: {
      mode: monthly > 0 ? "subscription" : "payment",
      line_items: lineItems,
      success_url: `${appUrl}/s/${contract.sign_token}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/s/${contract.sign_token}`,
      client_reference_id: String(contract.id),
      locale: "hu",
      metadata,
      ...(monthly > 0 ? { subscription_data: { metadata } } : { payment_intent_data: { metadata } }),
      ...(email ? { customer_email: email } : {}),
    },
  });

  const ids = Array.from(new Set([...(contract.checkout_ids || []), session.id])).slice(-20);
  await base44.asServiceRole.entities.PortalContract.update(contract.id, {
    checkout_ids: ids,
    payment_status: contract.payment_status === "paid" || contract.payment_status === "refunded" ? contract.payment_status : "pending",
    payment_error: "",
  });
  return {
    redirect_url: session.url,
    checkout_id: session.id,
    amount_total: session.amount_total,
    currency: session.currency,
  };
}

// A Stripe-ban történt fizetések összegyűjtése egységes alakban: {checkout_id, payment_id, status, amount_total,
// refunded_minor, subscription_id}. Egyszeri fizetésnél a checkout session, előfizetésnél a kifizetett
// számlák (az első számla a checkout befizetése is).
async function collectPurchases(contract) {
  const items = [];
  const subs = new Set(contract.subscription_id ? [contract.subscription_id] : []);
  for (const id of (contract.checkout_ids || []).slice(-10)) {
    const s = await stripe(`/checkout/sessions/${id}`, { params: { expand: ["payment_intent.latest_charge"] } }).catch(() => null);
    if (!s) continue;
    if (s.subscription) subs.add(typeof s.subscription === "string" ? s.subscription : s.subscription.id);
    else if (s.payment_status === "paid" && s.payment_intent) {
      const refunded = Number(s.payment_intent.latest_charge?.amount_refunded) || 0;
      items.push({
        checkout_id: id, payment_id: s.payment_intent.id, amount_total: s.amount_total,
        refunded_minor: refunded, status: refunded > 0 ? "refunded" : "paid", subscription_id: "",
      });
    }
  }
  for (const sub of subs) {
    const res = await stripe("/invoices", {
      params: { subscription: sub, status: "paid", limit: 100, expand: ["data.payment_intent.latest_charge"] },
    }).catch(() => null);
    for (const inv of res?.data || []) {
      const refunded = Number(inv.payment_intent?.latest_charge?.amount_refunded) || 0;
      items.push({
        checkout_id: inv.id, payment_id: inv.payment_intent?.id || inv.id, amount_total: inv.amount_paid,
        refunded_minor: refunded, status: refunded > 0 ? "refunded" : "paid", subscription_id: sub,
      });
    }
  }
  return items;
}

// A Stripe-ban történtek (befizetés, ismétlődő díj, visszatérítés) rögzítése a szerződésen.
// A CRM-be az eseményeket a CRM veszi át (saját szinkronjával), itt csak a tényeket tároljuk:
// minden eseménynek stabil kulcsa van, így az átvétel többször is lefuthat duplázás nélkül.
export async function syncContractPayments(base44, contract) {
  const found = [];
  const seen = new Set();
  for (const p of await collectPurchases(contract)) {
    const key = `${p.payment_id}|${p.status}`;
    if (!seen.has(key)) { seen.add(key); found.push(p); }
  }

  const Contract = base44.asServiceRole.entities.PortalContract;
  const nowIso = new Date().toISOString();
  const fresh = await Contract.get(contract.id).catch(() => null) || contract;
  const log = new Set(fresh.payment_log || []);
  const events = Array.isArray(fresh.payment_events) ? [...fresh.payment_events] : [];
  const patch: Record<string, unknown> = {};
  let recorded = false;
  let refundedTotal = Number(fresh.refunded_amount) || 0;

  for (const p of found) {
    if (!["paid", "refunded"].includes(p.status)) continue;
    const ref = p.payment_id || p.checkout_id;
    const paidKey = `paid:${ref}`;
    const refundKey = `refund:${ref}`;
    const amount = fromMinor(p.amount_total);

    if (!log.has(paidKey)) {
      log.add(paidKey);
      events.push({ key: paidKey, type: "paid", amount, at: nowIso });
      recorded = true;
      if (!fresh.paid_at && !patch.paid_at) {
        patch.paid_at = nowIso;
        patch.paid_amount = amount;
        patch.payment_status = "paid";
        patch.payment_error = "";
      }
    }
    if (p.subscription_id && !fresh.subscription_id && !patch.subscription_id) patch.subscription_id = p.subscription_id;

    if (p.status === "refunded" && !log.has(refundKey)) {
      const refundAmount = p.refunded_minor ? fromMinor(p.refunded_minor) : amount;
      log.add(refundKey);
      events.push({ key: refundKey, type: "refund", amount: refundAmount, at: nowIso });
      recorded = true;
      refundedTotal += refundAmount;
      patch.refunded_amount = refundedTotal;
      // Csak akkor "visszatérített", ha az első befizetés teljes összegét visszaadták.
      const paidBase = Number(patch.paid_amount ?? fresh.paid_amount) || 0;
      if (paidBase > 0 && refundedTotal >= paidBase) patch.payment_status = "refunded";
    }
  }

  const updated = await Contract.update(fresh.id, {
    ...patch,
    payment_log: Array.from(log),
    payment_events: events.slice(-200),
    payment_synced_at: nowIso,
  });
  return { recorded, contract: updated };
}

// ---- Nézetek ----------------------------------------------------------------------------

// Amit a lead (a link birtokosa) lát. Kontakt-azonosító, e-mail és telefonszám nincs benne.
export function publicView(c, extra = {}) {
  const signed = c.status === "signed";
  return {
    ...extra,
    status: c.status,
    offer_name: c.offer_name || "",
    description: c.description || "",
    services: c.services || [],
    setup_fee: Number(c.setup_fee) || 0,
    monthly_fee: Number(c.monthly_fee) || 0,
    body: c.body || "",
    contact_name: c.contact_name || "",
    contact_company: c.contact_company || "",
    expires_at: c.expires_at || "",
    signed_at: c.signed_at || "",
    signer_name: signed ? (c.signer_name || "") : "",
    doc_ref: String(c.content_hash || "").slice(0, 12),
    consent_text: CONSENT_TEXT,
    payment_status: c.payment_status || "none",
    has_fees: contractHasFees(c),
    paid_at: signed ? (c.paid_at || "") : "",
  };
}

// Amit a CRM lát (csak a rendszerhívással védett admin függvényből érhető el).
export function adminView(c) {
  return {
    crm_contract_id: c.crm_contract_id,
    status: c.status,
    viewed_at: c.viewed_at || "",
    signed_at: c.signed_at || "",
    declined_at: c.declined_at || "",
    decline_reason: c.decline_reason || "",
    expires_at: c.expires_at || "",
    signer_name: c.signer_name || "",
    signer_ip: c.signer_ip || "",
    signer_user_agent: c.signer_user_agent || "",
    consent_text: c.consent_text || "",
    content_hash: c.content_hash || "",
    payment_status: c.payment_status || "none",
    paid_at: c.paid_at || "",
    paid_amount: Number(c.paid_amount) || 0,
    refunded_amount: Number(c.refunded_amount) || 0,
    subscription_id: c.subscription_id || "",
    payment_events: Array.isArray(c.payment_events) ? c.payment_events : [],
    payment_error: c.payment_error || "",
  };
}
