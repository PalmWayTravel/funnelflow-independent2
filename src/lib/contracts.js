import { base44 } from "@/api/base44Client";

export const CONTRACT_STATUS = {
  sent: { label: "Elküldve", cls: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400" },
  viewed: { label: "Megnyitva", cls: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400" },
  signed: { label: "Aláírva", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400" },
  declined: { label: "Elutasítva", cls: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400" },
  expired: { label: "Lejárt", cls: "bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-400" },
  cancelled: { label: "Visszavonva", cls: "bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-400" },
};

export const PAYMENT_STATUS = {
  none: { label: "Nincs fizetés", cls: "bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-400" },
  pending: { label: "Fizetésre vár", cls: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400" },
  paid: { label: "Befizetve", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400" },
  refunded: { label: "Visszatérítve", cls: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400" },
  failed: { label: "Sikertelen", cls: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400" },
};

export const TEMPLATE_VARS = ["{{nev}}", "{{ceg}}", "{{email}}", "{{csomag}}", "{{setup_dij}}", "{{havi_dij}}", "{{tartalom}}", "{{datum}}", "{{szolgaltato}}"];

// Kiinduló váz: a szögletes zárójeles részeket ki kell tölteni, és az egészet jogásszal kell
// átnézetni, mielőtt ügyfélnek küldöd.
export const DEFAULT_TEMPLATE = `SZOLGÁLTATÁSI SZERZŐDÉS

Létrejött egyrészről: {{szolgaltato}} [cégnév, székhely, adószám] (a továbbiakban: Szolgáltató),
másrészről: {{ceg}} (kapcsolattartó: {{nev}}, {{email}}) (a továbbiakban: Megbízó)
között, {{datum}} napján, az alábbi feltételekkel.

1. A szerződés tárgya
A Szolgáltató a(z) "{{csomag}}" csomag keretében az alábbi szolgáltatásokat nyújtja a Megbízó részére:
{{tartalom}}

2. Díjazás
Egyszeri (setup) díj: {{setup_dij}} [+ ÁFA / ÁFA-t tartalmaz]
Havi díj: {{havi_dij}} [+ ÁFA / ÁFA-t tartalmaz]
Fizetési határidő: [határidő]

3. Időtartam és megszűnés
[határozott / határozatlan idő, felmondási idő]

4. Adatkezelés
[adatkezelési és adatfeldolgozói rendelkezések, hivatkozás az adatkezelési tájékoztatóra]

5. Egyéb rendelkezések
[felelősség, titoktartás, irányadó jog, vitarendezés]
`;

export function ft(n) {
  return `${Math.round(Number(n) || 0).toLocaleString("hu-HU")} Ft`;
}

// Az aláíró oldal a nyilvános Portal appban van; a teljes cím a szerződésen tárolódik.
export function contractLink(c) {
  return (c && c.sign_url) || "";
}

export function hasPlaceholders(text) {
  return /\[[^\]\n]{2,}\]/.test(text || "");
}

// Előnézet a küldő felületen: ugyanazok a változók, mint a szerveren.
export function renderPreview(template, vars) {
  return String(template || "").replace(/\{\{\s*([a-zA-Z_]+)\s*\}\}/g, (m, key) => {
    const v = vars ? vars[key] : undefined;
    return v === undefined || v === null ? "" : String(v);
  });
}

function errorMessage(e) {
  return e?.response?.data?.error || e?.data?.error || e?.message || "Ismeretlen hiba";
}

export async function callContractSend(payload) {
  try {
    const res = await base44.functions.invoke("crmContractSend", { origin: window.location.origin, ...payload });
    if (res.data?.error) throw new Error(res.data.error);
    return res.data;
  } catch (e) {
    throw new Error(errorMessage(e));
  }
}

// Új, friss Stripe fizetési link egy aláírt szerződéshez (a hosted checkout 24 óráig él; a Portalon készül).
export function callPaymentLink(contractId) {
  return callContractSend({ action: "payment_link", contract_id: contractId });
}

// A Portal eredményeinek (megnyitás, aláírás, fizetés, visszatérítés) átvétele a CRM-be.
export function syncPayments(contractId) {
  return callContractSend({ action: "sync", ...(contractId ? { contract_id: contractId } : {}) });
}
