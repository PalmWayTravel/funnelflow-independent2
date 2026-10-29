import React, { useEffect, useState } from "react";
import { Plus, Search, Pencil, Users as UsersIcon } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import PageHeader from "@/components/PageHeader";
import StatusBadge from "@/components/StatusBadge";
import Modal from "@/components/Modal";
import EmptyState from "@/components/EmptyState";
import TwoStepDelete from "@/components/TwoStepDelete";
import { logActivity } from "@/lib/activity";
import { initials } from "@/lib/format";

const AVATAR_COLORS = ["#8549DE", "#C548C0", "#E9498F", "#10B981", "#3B82F6", "#F59E0B"];
const EMPTY = { name: "", email: "", phone: "", status: "prospect", note: "", crm_enabled: false, assigned_owner_id: "", avatar_color: "#8549DE" };

export default function Clients() {
  const [clients, setClients] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [c, u] = await Promise.all([
        base44.entities.Client.list("-created_date", 500),
        base44.entities.User.list().catch(() => []),
      ]);
      setClients(c);
      setUsers(u);
    } catch (e) {} finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const filtered = clients.filter((c) => {
    const q = search.toLowerCase();
    return !q || c.name?.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q) || c.phone?.toLowerCase().includes(q);
  });

  const openNew = () => { setEditing(null); setForm(EMPTY); setModalOpen(true); };
  const openEdit = (c) => { setEditing(c); setForm({ ...EMPTY, ...c }); setModalOpen(true); };

  const save = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      if (editing) {
        await base44.entities.Client.update(editing.id, form);
        await logActivity(`Ügyfél frissítve: "${form.name}"`, "update", "Client", editing.id);
      } else {
        const created = await base44.entities.Client.create(form);
        await logActivity(`Ügyfél létrehozva: "${form.name}"`, "create", "Client", created.id);
      }
      setModalOpen(false);
      load();
    } catch (e) { alert(e.message); } finally { setSaving(false); }
  };

  const remove = async (c) => {
    try {
      const leads = await base44.entities.Lead.filter({ client_id: c.id }, "-created_date", 500);
      if (leads.length) await base44.entities.Lead.deleteMany({ client_id: c.id });
      const files = await base44.entities.ClientFile.filter({ client_id: c.id }, "-created_date", 500);
      if (files.length) await base44.entities.ClientFile.deleteMany({ client_id: c.id });
      await base44.entities.Client.delete(c.id);
      await logActivity(`Ügyfél törölve: "${c.name}"`, "delete", "Client", c.id);
      load();
    } catch (e) { alert(e.message); }
  };

  return (
    <div>
      <PageHeader
        title="Ügyfelek"
        subtitle={`${clients.length} ügyfél összesen`}
        action={<Button onClick={openNew} className="gradient-brand text-white hover:opacity-90"><Plus className="mr-1.5 h-4 w-4" /> Új ügyfél</Button>}
      />

      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Keresés név, e-mail, telefon…" className="pl-9" />
      </div>

      {loading ? (
        <div className="flex h-40 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary/20 border-t-primary" /></div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={UsersIcon} title={search ? "Nincs találat" : "Még nincs ügyfél"} description={search ? "Próbálj más keresőkifejezést." : "Add hozzá az első ügyfeledet a pipeline és a munka követésének megkezdéséhez."} action={!search && <Button onClick={openNew} className="gradient-brand text-white"><Plus className="mr-1.5 h-4 w-4" /> Új ügyfél</Button>} />
      ) : (
        <div className="space-y-2">
          {filtered.map((c) => (
            <div key={c.id} className="flex items-center gap-4 rounded-2xl border border-border bg-card p-4 shadow-card transition-colors hover:border-primary/30">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white" style={{ background: `linear-gradient(135deg, ${c.avatar_color || "#8549DE"}, ${c.avatar_color || "#C548C0"})` }}>
                {initials(c.name)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-semibold">{c.name}</span>
                  <StatusBadge status={c.status} />
                  {c.crm_enabled && <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-bold text-violet-700 dark:bg-violet-500/15 dark:text-violet-400">CRM</span>}
                </div>
                <div className="truncate text-sm text-muted-foreground">{[c.email, c.phone].filter(Boolean).join(" · ") || "Nincs elérhetőség"}</div>
              </div>
              <Button variant="outline" size="sm" onClick={() => openEdit(c)}><Pencil className="mr-1 h-3.5 w-3.5" /> Szerkeszt</Button>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? "Ügyfél szerkesztése" : "Új ügyfél"}
        size="md"
        footer={<>
          <Button variant="outline" onClick={() => setModalOpen(false)}>Mégse</Button>
          <Button onClick={save} disabled={saving} className="gradient-brand text-white">{saving ? "Mentés…" : "Mentés"}</Button>
        </>}
      >
        <div className="space-y-4">
          <div>
            <Label>Név *</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1.5" />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div><Label>E-mail</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="mt-1.5" /></div>
            <div><Label>Telefon</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="mt-1.5" /></div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label>Státusz</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="active">Aktív</SelectItem><SelectItem value="prospect">Érdeklődő</SelectItem><SelectItem value="inactive">Inaktív</SelectItem></SelectContent>
              </Select>
            </div>
            <div>
              <Label>CRM modul</Label>
              <Select value={form.crm_enabled ? "yes" : "no"} onValueChange={(v) => setForm({ ...form, crm_enabled: v === "yes" })}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="yes">Igen</SelectItem><SelectItem value="no">Nem</SelectItem></SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Felelős tulajdonos</Label>
            <Select value={form.assigned_owner_id || "none"} onValueChange={(v) => setForm({ ...form, assigned_owner_id: v === "none" ? "" : v })}>
              <SelectTrigger className="mt-1.5"><SelectValue placeholder="Nincs hozzárendelve" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nincs hozzárendelve</SelectItem>
                {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.full_name || u.email}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Megjegyzés</Label>
            <Textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} rows={3} className="mt-1.5" />
          </div>
          {editing && (
            <div className="flex items-center justify-between border-t border-border pt-4">
              <span className="text-sm text-muted-foreground">Ügyfél és minden lead/fájl végleges törlése</span>
              <TwoStepDelete onDelete={() => { setModalOpen(false); remove(editing); }} />
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}