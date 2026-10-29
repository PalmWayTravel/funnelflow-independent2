import { base44 } from "@/api/base44Client";

// Az Ügyfelek fül ügyféltörzse és az Accountok fül ugyanazt a céget írja le két helyen.
// Amint egy accountnál ügyfél-státuszú (nem admin) felhasználó jelenik meg, az account
// automatikusan bekerül az ügyfelek közé, és a két hely adatai szinkronban maradnak.
export async function syncClientFromAccount(account) {
  const name = account?.name?.trim();
  if (!account?.id || !name) return null;

  const mirror = {
    name,
    email: account.contact_email || "",
    status: account.status === "inactive" ? "inactive" : "active",
  };

  const existing = await base44.entities.Client.filter({ account_id: account.id }, "-created_date", 1);
  if (existing.length) return base44.entities.Client.update(existing[0].id, mirror);

  return base44.entities.Client.create({ ...mirror, account_id: account.id, crm_enabled: true });
}