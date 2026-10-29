import { secrets } from "base44:runtime";

// Account-level sending defaults, used when an account has no explicit limit.
export const SEND_LIMIT_DEFAULTS = { daily: 50, monthly: 500 };

// A Google Naptárban létrehozott bejegyzések időzónája.
export const CALENDAR_TZ = "Europe/Budapest";

export function renderTemplate(text, vars) {
  if (!text) return "";
  return String(text).replace(/\{\{\s*([a-zA-Z_]+)\s*\}\}/g, (m, key) => {
    const v = vars ? vars[key] : undefined;
    return v === undefined || v === null ? "" : String(v);
  });
}

export function triggerMatches(automation, event, payload) {
  if (!automation || automation.active === false) return false;
  if (automation.trigger !== event) return false;
  if (event === "stage_changed" && automation.trigger_stage_id && automation.trigger_stage_id !== payload.stage_id) return false;
  if (event === "form_submitted" && automation.trigger_form_id && automation.trigger_form_id !== payload.form_id) return false;
  return true;
}

// A foglalás nyers ISO időpontja (pl. az emlékeztetőnél) Budapest szerinti, olvasható formában;
// a már formázott szöveget változatlanul hagyja.
function formatBookingStart(value) {
  if (!value) return '';
  const text = String(value);
  if (!/^\d{4}-\d{2}-\d{2}T/.test(text)) return text;
  const ms = Date.parse(text);
  return Number.isFinite(ms) ? formatLocalDateTime(ms) : text;
}

export function buildVars(contact, booking) {
  return {
    nev: contact?.name || "",
    name: contact?.name || "",
    email: contact?.email || "",
    telefon: contact?.phone || "",
    ceg: contact?.company || "",
    cegnev: contact?.company || "",
    iparag: contact?.industry || "",
    forras: contact?.source || "",
    foglalas_idopont: formatBookingStart(booking?.start),
    meeting_link: booking?.meeting_link || "",
  };
}

// ---- Foglalás visszaigazoló e-mail -----------------------------------------
// A Beállítások → Küldés fülön felülírható alapértelmezett szöveg; a helyőrzőket
// a renderTemplate tölti ki ({{nev}}, {{foglalas_idopont}}, {{meeting_link}},
// {{closer}}, {{hossz}}, {{felado}}).

export const DEFAULT_BOOKING_SUBJECT = "Időpontod megerősítve — {{foglalas_idopont}}";

export const DEFAULT_BOOKING_BODY = `Kedves {{nev}}!\n\nAz időpontod rögzítettük: {{foglalas_idopont}} ({{hossz}} perc).\nA megbeszélést {{closer}} tartja.\n\nGoogle Meet link: {{meeting_link}}\n\nHa nem megfelelő az időpont, válaszolj erre az e-mailre.\n\nÜdvözlettel,\n{{felado}}`;

// ---- Marketing consent -----------------------------------------------------
// A marketing automation/campaign may only reach contacts who opted in and have not unsubscribed.

export function isMarketingAllowed(contact) {
  return !!contact && contact.marketing_consent === true && contact.unsubscribed !== true;
}

export function marketingSkipReason(contact) {
  if (!contact) return "nincs kontakt a sorozathoz";
  if (contact.unsubscribed === true) return "a kontakt leiratkozott a marketing e-mailekről";
  if (contact.marketing_consent !== true) return "a kontakt nem adott marketing hozzájárulást";
  return "";
}

// Tokens that travel in public links must be unguessable: 24 random bytes, hex encoded.
export function newToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function ensureUnsubscribeToken(base44, contact) {
  if (!contact) return "";
  if (contact.unsubscribe_token) return contact.unsubscribe_token;
  const token = newToken();
  await base44.asServiceRole.entities.Contact.update(contact.id, { unsubscribe_token: token }).catch(() => null);
  contact.unsubscribe_token = token;
  return token;
}

// ---- Account sender identity and limits -----------------------------------

export function accountReplyFooter(account) {
  return account?.contact_email ? `Válasz erre a címre: ${account.contact_email}` : "";
}

export function emailFooter(lines) {
  const parts = (lines || []).filter(Boolean);
  return parts.length ? `\n\n---\n${parts.join("\n")}` : "";
}

export function dailySendLimit(account) {
  const value = Number(account?.send_limit_daily);
  return value > 0 ? value : SEND_LIMIT_DEFAULTS.daily;
}

export function monthlySendLimit(account) {
  const value = Number(account?.send_limit_monthly);
  return value > 0 ? value : SEND_LIMIT_DEFAULTS.monthly;
}

function startOfDayIso(now) {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
}

function startOfMonthIso(now) {
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
}

// Every outgoing e-mail of an account today / this month — marketing and transactional
// alike; failed sends do not count.
export async function emailUsage(base44, accountId) {
  if (!accountId) return { day: 0, month: 0 };
  const now = new Date();
  const base = { account_id: accountId, channel: "email", status: { $ne: "failed" } };
  const [day, month] = await Promise.all([
    base44.asServiceRole.entities.MessageLog.count({ ...base, created_date: { $gte: startOfDayIso(now) } }).catch(() => 0),
    base44.asServiceRole.entities.MessageLog.count({ ...base, created_date: { $gte: startOfMonthIso(now) } }).catch(() => 0),
  ]);
  return { day: Number(day) || 0, month: Number(month) || 0 };
}

// The admin is warned once per account per day when the daily e-mail cap is nearly spent.
const LIMIT_WARNING_RATIO = 0.8;

// Loads an account once per engine run and tracks how much of its quota is spent.
export function createSendLimiter(base44) {
  const cache = new Map();

  async function entry(accountId) {
    if (!accountId) return null;
    if (cache.has(accountId)) return cache.get(accountId);
    const account = await base44.asServiceRole.entities.Account.get(accountId).catch(() => null);
    const usage = await emailUsage(base44, accountId);
    const item = {
      accountId,
      account,
      day: usage.day,
      month: usage.month,
      dailyLimit: dailySendLimit(account),
      monthlyLimit: monthlySendLimit(account),
    };
    cache.set(accountId, item);
    return item;
  }

  async function warnNearDailyLimit(item) {
    if (item.day < Math.ceil(item.dailyLimit * LIMIT_WARNING_RATIO)) return;
    const already = await base44.asServiceRole.entities.ActivityLog
      .count({ type: "send_limit", entity_id: item.accountId, created_date: { $gte: startOfDayIso(new Date()) } })
      .catch(() => 1);
    if (already > 0) return;
    await base44.asServiceRole.entities.ActivityLog.create({
      message: `Figyelem: a(z) "${item.account?.name || "account"}" account elérte a napi küldési limit 80%-át (${item.day}/${item.dailyLimit} e-mail).`,
      type: "send_limit",
      entity_type: "Account",
      entity_id: item.accountId,
      read: false,
    }).catch(() => null);
  }

  return {
    async account(accountId) {
      const item = await entry(accountId);
      return item ? item.account : null;
    },
    async canSend(accountId) {
      const item = await entry(accountId);
      if (!item) return { allowed: true, reason: "" };
      if (item.day + 1 > item.dailyLimit) return { allowed: false, reason: `napi küldési limit elérve (${item.dailyLimit}/nap)` };
      if (item.month + 1 > item.monthlyLimit) return { allowed: false, reason: `havi küldési limit elérve (${item.monthlyLimit}/hó)` };
      return { allowed: true, reason: "" };
    },
    async remaining(accountId) {
      const item = await entry(accountId);
      if (!item) return { daily: Number.MAX_SAFE_INTEGER, monthly: Number.MAX_SAFE_INTEGER };
      return {
        daily: Math.max(0, item.dailyLimit - item.day),
        monthly: Math.max(0, item.monthlyLimit - item.month),
      };
    },
    async consume(accountId) {
      const item = await entry(accountId);
      if (!item) return;
      item.day += 1;
      item.month += 1;
      await warnNearDailyLimit(item);
    },
  };
}

// ---- Outbound messages ----------------------------------------------------

// `html` esetén a levél HTML-ben megy, a `text` pedig a sima szöveges változat;
// `body` nélkül (csak sima szöveges tartalomnál) a body mezőt használjuk.
export async function sendEmail(base44, { to, subject, body, html, text, fromName }) {
  if (!to) return { status: "failed", error: "Nincs e-mail cím" };
  try {
    await base44.asServiceRole.integrations.Core.SendEmail({
      to,
      subject: subject || "Üzenet",
      ...(html ? { html } : { body: body || "" }),
      ...(text ? { text } : {}),
      from_name: fromName || undefined,
    });
    return { status: "sent" };
  } catch (e) {
    return { status: "failed", error: (e && e.message) || "Ismeretlen hiba" };
  }
}

export const SMS_UNAVAILABLE = "Sikertelen: SMS szolgáltató nincs beállítva";

// SMS works only when the Twilio secrets are set and the workspace has switched SMS on.
export function smsConfigured() {
  try {
    return !!(secrets.get("TWILIO_ACCOUNT_SID") && secrets.get("TWILIO_AUTH_TOKEN") && secrets.get("TWILIO_FROM_NUMBER"));
  } catch (e) {
    return false;
  }
}

export async function sendSms({ to, body, fromName, enabled }) {
  if (!to) return { status: "failed", error: "Nincs telefonszám" };
  if (enabled !== true || !smsConfigured()) {
    return { status: "failed", error: SMS_UNAVAILABLE };
  }
  try {
    const sid = secrets.get("TWILIO_ACCOUNT_SID");
    const token = secrets.get("TWILIO_AUTH_TOKEN");
    const from = secrets.get("TWILIO_FROM_NUMBER");
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: "Basic " + btoa(`${sid}:${token}`),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: to, From: from, Body: body || "" }).toString(),
    });
    if (!res.ok) {
      const t = await res.text();
      return { status: "failed", error: t.slice(0, 300) };
    }
    return { status: "sent" };
  } catch (e) {
    return { status: "failed", error: (e && e.message) || "Ismeretlen hiba" };
  }
}

export async function logMessage(base44, entry) {
  try {
    await base44.asServiceRole.entities.MessageLog.create(entry);
  } catch (e) {
    // naplózási hiba nem állítja meg a folyamatot
  }
}

export async function appendActivity(base44, contact, line) {
  if (!contact) return;
  try {
    const activity = [...(contact.activity || []), line].slice(-100);
    await base44.asServiceRole.entities.Contact.update(contact.id, { activity });
    contact.activity = activity;
  } catch (e) {
    // nem kritikus
  }
}

// ---- Booking availability --------------------------------------------------
// Minden fali idő (elérhetőség, kézi foglalás, e-mail szöveg) Europe/Budapest
// szerint értendő, az adott nap VALÓS eltolásával — így az óraátállítás nem
// csúsztatja el az időpontokat, és a hívó böngészőjének időzónája sem számít.
// A régi `tzOffset` paraméterek kompatibilitás miatt maradtak, de nem használtak.

export function pad2(n) {
  return String(n).padStart(2, '0');
}

const WEEKDAYS_HU = ['vasárnap', 'hétfő', 'kedd', 'szerda', 'csütörtök', 'péntek', 'szombat'];

const BP_PARTS = new Intl.DateTimeFormat('en-US', {
  timeZone: CALENDAR_TZ,
  hourCycle: 'h23',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
});

// Egy pillanat Budapest szerinti naptári részei.
export function budapestParts(ms) {
  const out = {};
  for (const p of BP_PARTS.formatToParts(new Date(ms))) {
    if (p.type !== 'literal') out[p.type] = Number(p.value);
  }
  const weekday = new Date(Date.UTC(out.year, out.month - 1, out.day)).getUTCDay();
  return { y: out.year, m: out.month, d: out.day, hh: out.hour, mm: out.minute, ss: out.second, weekday };
}

// Budapest eltolása egy adott pillanatban, getTimezoneOffset()-konvencióban (télen -60, nyáron -120).
export function budapestOffsetAt(ms) {
  const p = budapestParts(ms);
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm, p.ss);
  return Math.round((Math.floor(ms / 1000) * 1000 - asUtc) / 60000);
}

// "2026-10-27 10:00" Budapest szerint → a valódi UTC pillanat (ms).
export function budapestToUtc(y, m, d, hh, mm) {
  const guess = Date.UTC(y, m - 1, d, hh || 0, mm || 0);
  const first = guess + budapestOffsetAt(guess) * 60000;
  const second = guess + budapestOffsetAt(first) * 60000;
  return second;
}

// Egy pillanat Budapest szerinti napja (YYYY-MM-DD).
export function budapestIsoDate(ms) {
  const p = budapestParts(ms);
  return `${p.y}-${pad2(p.m)}-${pad2(p.d)}`;
}

// Egy időpont megjelenítése Budapest szerint, pl. "2026. 10. 27. (kedd) 10:00".
export function formatLocalDateTime(ms, _tzOffset) {
  const p = budapestParts(ms);
  return `${p.y}. ${pad2(p.m)}. ${pad2(p.d)}. (${WEEKDAYS_HU[p.weekday]}) ${pad2(p.hh)}:${pad2(p.mm)}`;
}

function dateParts(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  return { y, m, d };
}

export function weekdayOf(iso) {
  const { y, m, d } = dateParts(iso);
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return day === 0 ? 7 : day;
}

export function toIsoDate(year, month, day) {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

// Every start instant (ms since epoch) a booking type offers on one Budapest day.
export function slotTimes(bookingType, dateIso, _tzOffset) {
  const day = weekdayOf(dateIso);
  const windows = (bookingType.availability || []).filter((w) => Number(w.day) === day);
  const duration = Number(bookingType.duration_minutes) || 30;
  const buffer = Number(bookingType.buffer_minutes) || 0;
  const { y, m, d } = dateParts(dateIso);
  const slots = [];
  for (const w of windows) {
    const [fh, fm] = String(w.from || '09:00').trim().slice(0, 5).split(':').map(Number);
    const [th, tm] = String(w.to || '17:00').trim().slice(0, 5).split(':').map(Number);
    let cursor = budapestToUtc(y, m, d, fh || 0, fm || 0);
    const end = budapestToUtc(y, m, d, th || 0, tm || 0);
    while (cursor + duration * 60000 <= end) {
      slots.push(cursor);
      cursor += (duration + buffer) * 60000;
    }
  }
  return slots;
}