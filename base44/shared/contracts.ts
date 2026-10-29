import { secrets } from "base44:runtime";
import { budapestIsoDate, appendActivity, sendEmail, formatLocalDateTime } from "./crm.ts";

// A szerződések CRM-oldali logikája. Az aláírás és a fizetés a külön, nyilvános FunnelFlow Portal
// appban történik (a CRM zárt marad, a lead nem kap hozzáférést). A CRM kétféleképp beszél vele:
//  - szerver-szerver hívás a közös PORTAL_SECRET titokkal (létrehozás, visszavonás, állapot),
//  - időzített lekérés: a Portal eredményeit (megnyitás, aláírás, fizetés) a CRM veszi át, és
//    itt keletkeznek a hatások (fázis, riport-események, feladat, e-mailek).

export function money(n) {
  const v = Math.round(Number(n) || 0);
  return `${String(v).replace(/\B(?=(\d{3})+(?!\d))/g, " ")} Ft`;
}

// A hash-elt tartalom. A Portal pontosan ugyanezt a mezőkészletet hash-eli, ezért a kettőnek
// betűre egyeznie kell (aláíráskor a Portal ellenőrzi, a CRM az átvételkor még egyszer).
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

// A szerződéssablonban használható változók: {{nev}}, {{ceg}}, {{email}}, {{csomag}},
// {{setup_dij}}, {{havi_dij}}, {{tartalom}}, {{datum}}, {{szolgaltato}}.
export function contractVars(contact, offerLike, settings) {
  const services = (offerLike.services || []).filter(Boolean);
  return {
    nev: contact?.name || "",
    ceg: contact?.company || contact?.name || "",
    email: contact?.email || "",
    csomag: offerLike.offer_name || "",
    setup_dij: money(offerLike.setup_fee),
    havi_dij: money(offerLike.monthly_fee),
    tartalom: services.map((s) => `- ${s}`).join("\n"),
    datum: budapestIsoDate(Date.now()),
    szolgaltato: settings?.email_from_name || "",
  };
}

export function contractHasFees(c) {
  return (Number(c.setup_fee) || 0) > 0 || (Number(c.monthly_fee) || 0) > 0;
}

// Fázis keresése név részlet alapján (pl. "ajánlat", "ügyfél") az adott account fázisai között.
export async function findStage(base44, accountId, needle) {
  const stages = await base44.asServiceRole.entities.PipelineStage
    .filter({ account_id: accountId || "" }, "order", 50).catch(() => []);
  const n = String(needle).toLowerCase();
  return stages.find((s) => String(s.name || "").toLowerCase().includes(n)) || null;
}

export async function adminEmails(base44) {
  const members = await base44.asServiceRole.entities.User.list().catch(() => []);
  return members.filter((u) => u.role === "admin" && u.email).map((u) => u.email);
}

export async function notifyAdminEmails(base44, subject, text) {
  const settingsList = await base44.asServiceRole.entities.WorkspaceSettings.list("-created_date", 1).catch(() => []);
  const fromName = settingsList[0]?.email_from_name || "";
  for (const to of await adminEmails(base44)) {
    await sendEmail(base44, { to, subject, body: text, fromName }).catch(() => null);
  }
}

// ---- A Portal app elérése ------------------------------------------------------------------

export function portalConfig() {
  const url = String(secrets.get("PORTAL_URL") || "").trim().replace(/\/+$/, "");
  const appId = String(secrets.get("PORTAL_APP_ID") || "").trim();
  const secret = String(secrets.get("PORTAL_SECRET") || "").trim();
  return { url, appId, secret, ok: !!(url && appId && secret.length >= 32) };
}

export function portalSignUrl(token) {
  return `${portalConfig().url}/s/${token}`;
}

// Szerver-szerver hívás a Portal admin függvényére. A titok csak fejlécben utazik.
export async function portalCall(action, data = {}) {
  const cfg = portalConfig();
  if (!cfg.ok) throw new Error("A Portal app még nincs bekötve (PORTAL_URL, PORTAL_APP_ID, PORTAL_SECRET).");
  const res = await fetch(`${cfg.url}/api/apps/${cfg.appId}/functions/portalAdmin`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Portal-Secret": cfg.secret },
    body: JSON.stringify({ action, ...data }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) throw new Error(json.error || `A Portal nem válaszolt rendben (${res.status}).`);
  return json;
}

// Ami a CRM-ből a Portalra kerül: a szerződés pillanatnyi, változtathatatlan másolata.
export function toPortalPayload(c) {
  return {
    crm_contract_id: String(c.id),
    sign_token: c.sign_token,
    contact_name: c.contact_name || "",
    contact_email: c.contact_email || "",
    contact_company: c.contact_company || "",
    offer_name: c.offer_name || "",
    description: c.description || "",
    services: c.services || [],
    setup_fee: Number(c.setup_fee) || 0,
    monthly_fee: Number(c.monthly_fee) || 0,
    body: c.body || "",
    content_hash: c.content_hash || "",
    expires_at: c.expires_at,
    sent_at: c.sent_at,
    payment_url: c.payment_url || "",
  };
}

// ---- Az aláírás hatásai a CRM-ben ----------------------------------------------------------

async function onContractSigned(base44, contract, contact) {
  const settingsList = await base44.asServiceRole.entities.WorkspaceSettings.list("-created_date", 1).catch(() => []);
  const settings = settingsList[0] || null;
  const signedAtMs = contract.signed_at ? Date.parse(contract.signed_at) : Date.now();

  // 1) Kontakt: fázis az "Ügyfél"-re, címke, idővonal.
  try {
    if (contact) {
      const stage = await findStage(base44, contact.account_id, "ügyfél");
      const stageChange = stage && contact.stage_id !== stage.id;
      const lines = [`Szerződés aláírva: ${contract.offer_name} — ${contract.signer_name}`];
      if (stageChange) lines.push(`Fázis módosítva: ${stage.name}`);
      await base44.asServiceRole.entities.Contact.update(contact.id, {
        tags: Array.from(new Set([...(contact.tags || []), "szerződött"])),
        activity: [...(contact.activity || []), ...lines].slice(-100),
        ...(stageChange ? { stage_id: stage.id } : {}),
      });
    }
  } catch (e) { /* az aláírás ettől még érvényes */ }

  // 2) Értékesítési napló: "Szerződés aláírva" a díjakkal (a closer az ajánlatküldő).
  try {
    const quotes = contact
      ? await base44.asServiceRole.entities.SalesEvent.filter({ contact_id: contact.id, type: "quote" }, "-created_date", 1).catch(() => [])
      : [];
    const quote = quotes[0] || null;
    const createdMs = contact?.created_date ? Date.parse(contact.created_date) : NaN;
    const cycle = Number.isFinite(createdMs) ? Math.max(0, Math.round((signedAtMs - createdMs) / 86400000)) : undefined;
    await base44.asServiceRole.entities.SalesEvent.create({
      account_id: contact?.account_id || "",
      type: "signed",
      date: budapestIsoDate(signedAtMs),
      contact_id: contract.contact_id,
      booking_id: contract.booking_id || "",
      closer_id: quote?.closer_id || "",
      setter_id: quote?.setter_id || "",
      source: quote?.source || contact?.source || "",
      amount: Number(contract.setup_fee) || 0,
      setup_fee: Number(contract.setup_fee) || 0,
      monthly_fee: Number(contract.monthly_fee) || 0,
      ...(cycle !== undefined ? { sales_cycle_days: cycle } : {}),
    });
  } catch (e) { /* nem kritikus */ }

  // 3) CRM hozzáférés ELŐKÉSZÍTÉSE: account + feladat az adminnak. Meghívót nem küldünk
  //    automatikusan, mert az hozzáférést ad — azt az admin jóváhagyásával kell kiadni.
  let preparedAccountId = "";
  let accountName = "";
  try {
    accountName = String(contract.contact_company || contract.contact_name || "").trim().slice(0, 150);
    if (accountName) {
      const existing = await base44.asServiceRole.entities.Account.filter({ name: accountName }).catch(() => []);
      const account = existing[0] || await base44.asServiceRole.entities.Account.create({
        name: accountName,
        status: "active",
        contact_email: contract.contact_email || "",
        note: `Előkészítve a(z) "${contract.offer_name}" szerződés aláírása után.`,
      });
      preparedAccountId = account.id;
      await base44.asServiceRole.entities.Task.create({
        title: `CRM meghívó küldése: ${contract.contact_email || contract.contact_name} → ${accountName} (Beállítások → Csapat)`,
        due_date: budapestIsoDate(Date.now()),
        done: false,
      });
    }
  } catch (e) { /* nem kritikus */ }
  if (preparedAccountId) {
    await base44.asServiceRole.entities.Contract.update(contract.id, { prepared_account_id: preparedAccountId }).catch(() => null);
  }

  // 4) Admin értesítés (alkalmazáson belül és e-mailben).
  await base44.asServiceRole.entities.ActivityLog.create({
    message: `Aláírták a szerződést: ${contract.contact_name} — ${contract.offer_name}`,
    type: "contract_signed", entity_type: "Contract", entity_id: contract.id, read: false,
  }).catch(() => null);
  await notifyAdminEmails(
    base44,
    `Aláírták a szerződést: ${contract.contact_name} — ${contract.offer_name}`,
    [
      `${contract.signer_name} aláírta a szerződést.`,
      "",
      `Csomag: ${contract.offer_name}`,
      `Setup díj: ${money(contract.setup_fee)}`,
      `Havi díj: ${money(contract.monthly_fee)}`,
      `Aláírás ideje: ${formatLocalDateTime(signedAtMs)}`,
      `Dokumentum azonosító: ${String(contract.content_hash || "").slice(0, 12)}`,
      "",
      preparedAccountId
        ? `Az account előkészítve (${accountName}), és létrejött egy feladat a CRM meghívó kiküldésére.`
        : "Nem sikerült account-ot előkészíteni, ezt kézzel kell megtenni.",
    ].join("\n"),
  );

  // 5) Másolat az aláírónak: szerződésszöveg, bizonyíték, fizetési hivatkozás.
  if (contract.contact_email) {
    const text = [
      `Kedves ${contract.contact_name || ""}!`,
      "",
      `Köszönjük, a szerződést elektronikusan aláírtad (${contract.offer_name}).`,
      `Aláírás ideje: ${formatLocalDateTime(signedAtMs)}`,
      `Aláíró: ${contract.signer_name}`,
      `Dokumentum azonosító: ${String(contract.content_hash || "").slice(0, 12)}`,
      "",
      `Setup díj: ${money(contract.setup_fee)}`,
      `Havi díj: ${money(contract.monthly_fee)}`,
      contractHasFees(contract) && contract.sign_url
        ? `\nA díjak befizetése (bankkártyával, biztonságos fizetőoldalon): ${contract.sign_url}`
        : "",
      "",
      "--- A szerződés szövege ---",
      "",
      contract.body || "",
      "",
      "Hamarosan jelentkezünk a következő lépésekkel.",
      "",
      "Üdvözlettel,",
      settings?.email_from_name || "FunnelFlow",
    ].join("\n");
    await sendEmail(base44, {
      to: contract.contact_email,
      subject: `Aláírt szerződés — ${contract.offer_name}`,
      body: text,
      fromName: settings?.email_from_name || "",
    }).catch(() => null);
  }
}

// ---- A Portal eredményeinek átvétele -------------------------------------------------------

// Egy szerződés CRM-oldali állapotát igazítja a Portal állapotához, és létrehozza a hatásokat.
// Idempotens: ugyanaz az állapot többször átvehető duplázás nélkül.
export async function applyPortalState(base44, local, remote) {
  if (!remote || remote.status === "missing") return { changed: false };
  const Contract = base44.asServiceRole.entities.Contract;
  let cur = await Contract.get(local.id).catch(() => null) || local;
  const contact = cur.contact_id
    ? await base44.asServiceRole.entities.Contact.get(cur.contact_id).catch(() => null)
    : null;
  let changed = false;

  // 1) Állapotváltások
  if (remote.status === "viewed" && cur.status === "sent") {
    cur = await Contract.update(cur.id, { status: "viewed", viewed_at: remote.viewed_at || new Date().toISOString() });
    await appendActivity(base44, contact, `A szerződést megnyitotta: ${cur.offer_name}`);
    await base44.asServiceRole.entities.ActivityLog.create({
      message: `Megnyitotta a szerződést: ${cur.contact_name}`,
      type: "contract_viewed", entity_type: "Contract", entity_id: cur.id, read: false,
    }).catch(() => null);
    changed = true;
  }

  if (remote.status === "declined" && !["declined", "signed", "cancelled"].includes(cur.status)) {
    const reason = String(remote.decline_reason || "").slice(0, 500);
    cur = await Contract.update(cur.id, {
      status: "declined", declined_at: remote.declined_at || new Date().toISOString(), decline_reason: reason,
    });
    await appendActivity(base44, contact, `Szerződés elutasítva: ${cur.offer_name}${reason ? ` — ${reason}` : ""}`);
    await base44.asServiceRole.entities.ActivityLog.create({
      message: `Elutasította a szerződést: ${cur.contact_name}${reason ? ` — ${reason}` : ""}`,
      type: "contract_declined", entity_type: "Contract", entity_id: cur.id, read: false,
    }).catch(() => null);
    await notifyAdminEmails(
      base44,
      `Elutasított szerződés: ${cur.contact_name}`,
      `${cur.contact_name} elutasította a(z) "${cur.offer_name}" szerződést.${reason ? `\nIndok: ${reason}` : ""}`,
    );
    changed = true;
  }

  if (remote.status === "expired" && ["sent", "viewed"].includes(cur.status)) {
    cur = await Contract.update(cur.id, { status: "expired" });
    changed = true;
  }

  if (remote.status === "signed" && cur.status !== "signed") {
    // Az aláírt dokumentumnak bizonyíthatóan azonosnak kell lennie az elküldöttel.
    const localHash = cur.content_hash || await contractHash(cur);
    if (remote.content_hash && remote.content_hash !== localHash) {
      await base44.asServiceRole.entities.ActivityLog.create({
        message: `FIGYELEM: ${cur.contact_name} szerződésének hash-e eltér a Portalon aláírttól — kézi ellenőrzés kell.`,
        type: "contract_warning", entity_type: "Contract", entity_id: cur.id, read: false,
      }).catch(() => null);
      return { changed };
    }
    cur = await Contract.update(cur.id, {
      status: "signed",
      signed_at: remote.signed_at || new Date().toISOString(),
      signer_name: remote.signer_name || "",
      signer_ip: remote.signer_ip || "",
      signer_user_agent: remote.signer_user_agent || "",
      consent_text: remote.consent_text || "",
    });
    await onContractSigned(base44, cur, contact).catch(() => null);
    changed = true;
  }

  // 2) Fizetési események (első befizetés, ismétlődő díj, visszatérítés)
  if (cur.status === "signed") {
    const log = new Set(cur.payment_log || []);
    const patch = {};
    let firstPaymentDone = !!cur.paid_at;
    let refundedTotal = Number(cur.refunded_amount) || 0;
    let quote = null;
    let quoteLoaded = false;
    const loadQuote = async () => {
      if (quoteLoaded) return quote;
      quoteLoaded = true;
      const list = contact
        ? await base44.asServiceRole.entities.SalesEvent.filter({ contact_id: contact.id, type: "quote" }, "-created_date", 1).catch(() => [])
        : [];
      quote = list[0] || null;
      return quote;
    };

    for (const ev of Array.isArray(remote.payment_events) ? remote.payment_events : []) {
      if (!ev || !ev.key || log.has(ev.key)) continue;
      if (ev.type !== "paid" && ev.type !== "refund") continue;
      const amount = Math.round(Number(ev.amount) || 0);
      const atMs = ev.at && Number.isFinite(Date.parse(ev.at)) ? Date.parse(ev.at) : Date.now();
      // Előbb "lefoglaljuk" a kulcsot, utána írunk eseményt: párhuzamos futásnál így nem duplázódik.
      log.add(ev.key);
      await Contract.update(cur.id, { payment_log: Array.from(log) }).catch(() => null);
      changed = true;
      const q = await loadQuote();
      const eventBase = {
        account_id: contact?.account_id || "",
        date: budapestIsoDate(atMs),
        contact_id: cur.contact_id,
        booking_id: cur.booking_id || "",
        closer_id: q?.closer_id || "",
        setter_id: q?.setter_id || "",
        source: q?.source || contact?.source || "",
      };

      if (ev.type === "paid") {
        if (!firstPaymentDone) {
          firstPaymentDone = true;
          const createdMs = contact?.created_date ? Date.parse(contact.created_date) : NaN;
          await base44.asServiceRole.entities.SalesEvent.create({
            ...eventBase, type: "closed", amount,
            setup_fee: Number(cur.setup_fee) || 0, monthly_fee: Number(cur.monthly_fee) || 0,
            ...(Number.isFinite(createdMs) ? { sales_cycle_days: Math.max(0, Math.round((atMs - createdMs) / 86400000)) } : {}),
          }).catch(() => null);
          patch.paid_at = new Date(atMs).toISOString();
          patch.paid_amount = amount;
          await appendActivity(base44, contact, `Befizetés érkezett: ${money(amount)} (${cur.offer_name})`);
          await base44.asServiceRole.entities.ActivityLog.create({
            message: `Befizetés érkezett: ${cur.contact_name} — ${money(amount)}`,
            type: "payment", entity_type: "Contract", entity_id: cur.id, read: false,
          }).catch(() => null);
          await notifyAdminEmails(
            base44,
            `Befizetés érkezett: ${cur.contact_name} — ${money(amount)}`,
            [
              `${cur.contact_name} kifizette az első díjat.`,
              `Csomag: ${cur.offer_name}`,
              `Összeg: ${money(amount)}`,
              Number(cur.monthly_fee) > 0 ? `Havi díj (előfizetés): ${money(cur.monthly_fee)}` : "",
            ].filter(Boolean).join("\n"),
          );
        } else {
          await base44.asServiceRole.entities.SalesEvent.create({ ...eventBase, type: "payment", amount }).catch(() => null);
          await appendActivity(base44, contact, `Újabb befizetés: ${money(amount)}`);
        }
      } else {
        refundedTotal += amount;
        await base44.asServiceRole.entities.SalesEvent.create({ ...eventBase, type: "refund", amount }).catch(() => null);
        patch.refunded_amount = refundedTotal;
        await appendActivity(base44, contact, `Visszatérítés: ${money(amount)}`);
        await base44.asServiceRole.entities.ActivityLog.create({
          message: `Visszatérítés: ${cur.contact_name} — ${money(amount)}`,
          type: "refund", entity_type: "Contract", entity_id: cur.id, read: false,
        }).catch(() => null);
      }
    }

    // A fizetési állapot, az előfizetés és az esetleges hiba tükrözése.
    const status = remote.payment_status || cur.payment_status || "none";
    const sync = { ...patch, payment_log: Array.from(log), payment_status: status };
    if (remote.subscription_id && !cur.subscription_id) sync.subscription_id = remote.subscription_id;
    sync.payment_error = status === "paid" || status === "refunded" ? "" : (remote.payment_error || "");
    await Contract.update(cur.id, sync).catch(() => null);
  }

  await Contract.update(cur.id, { portal_synced_at: new Date().toISOString() }).catch(() => null);
  return { changed };
}

// Az összes még élő szerződés (vagy egyetlen szerződés) állapotának lekérése a Portaltól és átvétele.
export async function syncPortalContracts(base44, { contractId = "", force = false } = {}) {
  const Contract = base44.asServiceRole.entities.Contract;
  const all = contractId
    ? [await Contract.get(contractId).catch(() => null)].filter(Boolean)
    : (await Contract.list("-created_date", 200).catch(() => []))
      .filter((c) => ["sent", "viewed", "signed"].includes(c.status));
  const list = all.slice(0, 100);
  if (!list.length) return { checked: 0, applied: 0 };

  const res = await portalCall("sync", { crm_contract_ids: list.map((c) => String(c.id)), force });
  const byId = new Map(list.map((c) => [String(c.id), c]));
  let applied = 0;
  for (const state of res.states || []) {
    const local = byId.get(String(state.crm_contract_id));
    if (!local) continue;
    try {
      const r = await applyPortalState(base44, local, state);
      if (r.changed) applied += 1;
    } catch (e) { /* a többi szerződés ettől még frissül */ }
  }
  return { checked: list.length, applied };
}
