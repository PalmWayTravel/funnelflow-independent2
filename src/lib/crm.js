import { base44 } from "@/api/base44Client";

export const STAGE_COLORS = ["#8549DE", "#C548C0", "#E9498F", "#F59E0B", "#10B981", "#3B82F6", "#EF4444", "#14B8A6"];

export const DEFAULT_STAGES = [
  { name: "Érdeklődő", color: "#8549DE" },
  { name: "Egyeztetés", color: "#C548C0" },
  { name: "Ajánlat", color: "#F59E0B" },
  { name: "Ügyfél", color: "#10B981" },
];

export const TRIGGER_OPTIONS = [
  { value: "contact_created", label: "Új kontakt létrejön" },
  { value: "form_submitted", label: "Űrlap kitöltése" },
  { value: "stage_changed", label: "Kontakt fázist vált" },
  { value: "booking_created", label: "Új időpontfoglalás" },
  { value: "booking_cancelled", label: "Foglalás lemondása" },
  { value: "booking_upcoming", label: "Közelgő foglalás előtt" },
];

export const SMS_DISABLED_HINT = "Az SMS addig nem választható, amíg a Twilio kulcsok (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER) nincsenek beállítva, és az SMS küldés nincs bekapcsolva a Beállításokban.";

export const STEP_TYPES = [
  { value: "email", label: "E-mail küldése" },
  { value: "sms", label: "SMS küldése" },
  { value: "wait", label: "Várakozás" },
  { value: "condition", label: "Elágazás (címke)" },
  { value: "tag", label: "Címke módosítása" },
  { value: "stage", label: "Fázis módosítása" },
  { value: "notify", label: "Belső értesítés" },
  { value: "stop", label: "Leállítás" },
];

export const STEP_LABELS = Object.fromEntries(STEP_TYPES.map((s) => [s.value, s.label]));
export const TRIGGER_LABELS = Object.fromEntries(TRIGGER_OPTIONS.map((t) => [t.value, t.label]));

export const FIELD_TYPES = [
  { value: "text", label: "Szöveg" },
  { value: "email", label: "E-mail" },
  { value: "phone", label: "Telefon" },
  { value: "textarea", label: "Hosszú szöveg" },
  { value: "select", label: "Legördülő" },
  { value: "number", label: "Szám" },
  { value: "date", label: "Dátum" },
  { value: "checkbox", label: "Jelölőnégyzet" },
];

export const MAP_OPTIONS = [
  { value: "name", label: "Név" },
  { value: "email", label: "E-mail" },
  { value: "phone", label: "Telefon" },
  { value: "company", label: "Cégnév" },
  { value: "industry", label: "Iparág" },
  { value: "note", label: "Jegyzet" },
  { value: "consent", label: "Marketing hozzájárulás" },
  { value: "none", label: "Nem kerül kontaktba" },
];

export const SOURCE_OPTIONS = ["Website", "Meta Ads", "Form", "Foglalás", "Ajánlás", "Egyéb"];

export const LEAD_STAGES = ["New Lead", "Contacted", "Proposal", "Negotiation", "Won", "Lost"];

export const LEAD_STAGE_LABELS = {
  "New Lead": "Új lead",
  Contacted: "Kapcsolatfelvétel",
  Proposal: "Ajánlat",
  Negotiation: "Tárgyalás",
  Won: "Nyert",
  Lost: "Elvesztett",
};

export async function getWorkspaceSettings() {
  const list = await base44.entities.WorkspaceSettings.list("-created_date", 1).catch(() => []);
  return list[0] || null;
}

export async function saveWorkspaceSettings(existing, patch) {
  if (existing?.id) return base44.entities.WorkspaceSettings.update(existing.id, patch);
  return base44.entities.WorkspaceSettings.create(patch);
}

export async function ensureDefaultStages(accountId) {
  const existing = await base44.entities.PipelineStage.filter({ account_id: accountId || "" }, "order", 50);
  if (existing.length) return existing;
  const created = [];
  for (let i = 0; i < DEFAULT_STAGES.length; i += 1) {
    created.push(await base44.entities.PipelineStage.create({
      ...DEFAULT_STAGES[i], order: i, account_id: accountId || "",
    }));
  }
  return created;
}

export async function triggerAutomations(event, contactId, payload = {}) {
  try {
    const res = await base44.functions.invoke("crmAutomationEngine", {
      action: "trigger", event, contact_id: contactId || "", payload,
    });
    return res.data;
  } catch (e) {
    return { error: e.message };
  }
}

export async function processAutomationQueue() {
  const stamp = sessionStorage.getItem("crm_engine_run");
  if (stamp && Date.now() - Number(stamp) < 60000) return null;
  sessionStorage.setItem("crm_engine_run", String(Date.now()));
  try {
    const res = await base44.functions.invoke("crmAutomationEngine", { action: "process" });
    return res.data;
  } catch (e) {
    return null;
  }
}

export function publicUrl(path) {
  return `${window.location.origin}${path}`;
}

export function embedSnippet(path, height = 620) {
  return `<iframe src="${publicUrl(path)}" style="width:100%;max-width:720px;height:${height}px;border:0;border-radius:16px" title="FunnelFlow"></iframe>`;
}

export function stageStyle(stage) {
  return { background: `${stage.color}1A`, color: stage.color, borderColor: `${stage.color}40` };
}