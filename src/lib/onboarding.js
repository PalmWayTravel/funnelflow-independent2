// Az ügyfél onboarding Meta lépéséhez tartozó konstansok és segédfüggvények.

export const META_BUSINESS_HOME = "https://business.facebook.com";
export const META_AD_ACCOUNTS_LINK = "https://business.facebook.com/settings/ad-accounts";

export const META_STATUS_LABELS = {
  not_started: "Nincs megkezdve",
  pending_review: "Ellenőrzésre vár",
  connected: "Összekötve",
  help_requested: "Segítséget kért",
};

// A Meta azonosítót mindig act_ előtaggal használja — a beírt értéket erre alakítjuk.
export function normalizeAdAccountId(value) {
  const raw = String(value || "").trim().replace(/\s+/g, "");
  if (!raw) return "";
  const digits = raw.replace(/^act_/i, "").replace(/\D/g, "");
  return digits ? `act_${digits}` : "";
}