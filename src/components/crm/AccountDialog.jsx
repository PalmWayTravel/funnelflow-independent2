import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import Modal from "@/components/Modal";
import TwoStepDelete from "@/components/TwoStepDelete";
import { cn } from "@/lib/utils";
import { syncClientFromAccount } from "@/lib/clientSync";

const EMPTY = {
  name: "", status: "active", industry: "", contact_email: "", plan: "standard",
  send_limit_daily: 50, send_limit_monthly: 500, user_ids: [], note: "",
};

export default function AccountDialog({ open, onClose, account, users, onSaved }) {
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setForm(account ? { ...EMPTY, ...account, user_ids: account.user_ids || [] } : EMPTY);
  }, [open, account]);

  const toggleUser = (id) => {
    const has = form.user_ids.includes(id);
    setForm({ ...form, user_ids: has ? form.user_ids.filter((u) => u !== id) : [...form.user_ids, id] });
  };

  // Az ügyfél szerepű felhasználó hozzáférése a user account_id mezőjén múlik, ezért
  // a hozzárendelést itt is szinkronban tartjuk: felvételkor beállítjuk, elvételkor töröljük.
  const isClient = (id) => users.find((u) => u.id === id)?.role !== "admin";

  const syncClientAccess = async (accountId) => {
    const before = account?.user_ids || [];
    const added = form.user_ids.filter((id) => !before.includes(id));
    const removed = before.filter((id) => !form.user_ids.includes(id));
    await Promise.all([
      ...added.filter(isClient).map((id) => base44.entities.User.update(id, { account_id: accountId })),
      ...removed.filter(isClient).map((id) => base44.entities.User.update(id, { account_id: "" })),
    ]);
  };

  const detachClients = async () => {
    const before = account?.user_ids || [];
    await Promise.all(before.filter(isClient).map((id) => base44.entities.User.update(id, { account_id: "" }))).catch(() => null);
  };

  const save = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const payload = { ...form, name: form.name.trim() };
      const saved = account ? await base44.entities.Account.update(account.id, payload) : await base44.entities.Account.create(payload);
      await syncClientAccess(account ? account.id : saved.id).catch(() => null);
      // Ügyfél szerepű felhasználónál az account automatikusan megjelenik az Ügyfelek fülön is.
      if (form.user_ids.some(isClient)) await syncClientFromAccount({ ...saved, ...payload, id: saved.id }).catch(() => null);
      onClose();
      onSaved && onSaved();
    } catch (e) { alert(e.message); } finally { setSaving(false); }
  };

  const remove = async () => {
    await base44.entities.Account.delete(account.id);
    await detachClients();
    onClose();
    onSaved && onSaved();
  };

  return (
    <Modal open={open} onClose={onClose} title={account ? "Account szerkesztése" : "Új ügyfél-account"} size="lg"
      footer={<>
        <Button variant="outline" onClick={onClose}>Mégse</Button>
        {account && <TwoStepDelete onDelete={remove} />}
        <Button onClick={save} disabled={saving} className="gradient-brand text-white">{saving ? "Mentés…" : "Mentés"}</Button>
      </>}>
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div><Label>Cégnév *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1.5" /></div>
          <div><Label>Állapot</Label>
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
              <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="active">Aktív</SelectItem><SelectItem value="inactive">Inaktív</SelectItem></SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div><Label>Iparág</Label><Input value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} className="mt-1.5" /></div>
          <div><Label>Kapcsolattartó e-mail (válaszcím)</Label><Input value={form.contact_email} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} className="mt-1.5" /></div>
          <div><Label>Csomag</Label>
            <Select value={form.plan} onValueChange={(v) => setForm({ ...form, plan: v })}>
              <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="standard">Standard</SelectItem><SelectItem value="pro">Pro</SelectItem><SelectItem value="enterprise">Enterprise</SelectItem></SelectContent>
            </Select>
          </div>
        </div>
        <div className="rounded-xl border border-border p-4">
          <div className="mb-1 text-sm font-semibold">Marketing küldési limitek</div>
          <p className="mb-3 text-xs text-muted-foreground">
            Az account marketing e-mailjeinek napi és havi felső korlátja. A feladó neve a cég neve, a válaszcím a kapcsolattartó e-mail cím.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div><Label className="text-xs">Napi limit</Label><Input type="number" value={form.send_limit_daily} onChange={(e) => setForm({ ...form, send_limit_daily: Number(e.target.value) })} className="mt-1.5" /></div>
            <div><Label className="text-xs">Havi limit</Label><Input type="number" value={form.send_limit_monthly} onChange={(e) => setForm({ ...form, send_limit_monthly: Number(e.target.value) })} className="mt-1.5" /></div>
          </div>
        </div>
        <div><Label>Megjegyzés</Label><Textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} rows={2} className="mt-1.5" /></div>

        <div>
          <Label className="mb-1 block">Hozzárendelt munkatársak</Label>
          <p className="mb-2 text-xs text-muted-foreground">
            Az itt kijelölt ügyfél szerepű felhasználó hozzáférést kap ehhez az accounthez, és bejelentkezve csak a saját nézetét látja.
          </p>
          <div className="max-h-52 space-y-1.5 overflow-y-auto rounded-xl border border-border p-2 scrollbar-thin">
            {users.map((u) => {
              const active = form.user_ids.includes(u.id);
              return (
                <button key={u.id} type="button" onClick={() => toggleUser(u.id)}
                  className={cn("flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors", active ? "bg-primary/10 text-primary" : "hover:bg-accent")}>
                  <span className={cn("flex h-5 w-5 items-center justify-center rounded-md border text-[11px] font-bold", active ? "border-primary bg-primary text-white" : "border-border")}>
                    {active ? "✓" : ""}
                  </span>
                  <span className="flex-1">{u.full_name || u.email}</span>
                  <span className="text-xs text-muted-foreground">{u.role}</span>
                </button>
              );
            })}
            {users.length === 0 && <p className="px-2 py-3 text-sm text-muted-foreground">Nincs felhasználó.</p>}
          </div>
        </div>
      </div>
    </Modal>
  );
}