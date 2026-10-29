import React, { useCallback, useEffect, useState } from "react";
import { Plus, Search, Pencil, MessageSquareWarning, Bot } from "lucide-react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import ResponsiveSelect from "@/components/ResponsiveSelect";
import PullToRefresh from "@/components/PullToRefresh";
import PageHeader from "@/components/PageHeader";
import StatusBadge from "@/components/StatusBadge";
import Modal from "@/components/Modal";
import EmptyState from "@/components/EmptyState";
import TwoStepDelete from "@/components/TwoStepDelete";
import { logActivity } from "@/lib/activity";
import { formatDateShort } from "@/lib/format";

const EMPTY = { title: "", client_id: "none", description: "", status: "open" };

const PRIORITY_LABEL = { low: "Alacsony", medium: "Közepes", high: "Magas" };
const PRIORITY = {
  low: "rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600",
  medium: "rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700",
  high: "rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-700",
};

export default function Complaints() {
  const [items, setItems] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [c, cl] = await Promise.all([
        base44.entities.Complaint.list("-created_date", 500),
        base44.entities.Client.list("-created_date", 500),
      ]);
      setItems(c); setClients(cl);
    } catch (e) {} finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const openCount = items.filter((c) => c.status !== "resolved").length;
  const clientName = (id) => clients.find((c) => c.id === id)?.name || "—";
  const filtered = items.filter((c) => {
    const q = search.toLowerCase();
    return !q || c.title?.toLowerCase().includes(q) || clientName(c.client_id).toLowerCase().includes(q);
  });

  const openNew = () => { setEditing(null); setForm(EMPTY); setModalOpen(true); };
  const openEdit = (c) => { setEditing(c); setForm({ ...EMPTY, title: c.title, client_id: c.client_id || "none", description: c.description, status: c.status }); setModalOpen(true); };

  const triage = async (id) => {
    try {
      await base44.functions.invoke("complaintIntake", { complaint_id: id });
    } catch (e) {
      // a panasz ettől függetlenül rögzítve marad
    } finally {
      load();
    }
  };

  const save = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    const payload = { ...form, client_id: form.client_id === "none" ? "" : form.client_id };
    try {
      if (editing) {
        await base44.entities.Complaint.update(editing.id, payload);
        await logActivity(`Panasz frissítve: "${form.title}"`, "update", "Complaint", editing.id);
        setModalOpen(false); load();
      } else {
        const created = await base44.entities.Complaint.create(payload);
        await logActivity(`Panasz rögzítve: "${form.title}"`, "create", "Complaint", created.id);
        setModalOpen(false);
        await load();
        triage(created.id);
      }
    } catch (e) { alert(e.message); } finally { setSaving(false); }
  };

  const remove = async (c) => {
    await base44.entities.Complaint.delete(c.id);
    await logActivity(`Panasz törölve: "${c.title}"`, "delete", "Complaint", c.id);
    load();
  };

  return (
    <PullToRefresh onRefresh={load}>
      <PageHeader
        title="Panaszok"
        subtitle={`${openCount} nyitott panasz`}
        action={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline"><Link to="/complaints/agent"><Bot className="mr-1.5 h-4 w-4" /> Asszisztens</Link></Button>
            <Button onClick={openNew} className="gradient-brand text-white hover:opacity-90"><Plus className="mr-1.5 h-4 w-4" /> Új panasz</Button>
          </div>
        }
      />

      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Keresés cím vagy ügyfél…" className="pl-9" />
      </div>

      {loading ? (
        <div className="flex h-40 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary/20 border-t-primary" /></div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={MessageSquareWarning} title={search ? "Nincs találat" : "Nincs panasz"} description={search ? "Próbálj más keresést." : "Rögzíts egy panaszt az ügyfélproblémák követéséhez."} action={!search && <Button onClick={openNew} className="gradient-brand text-white"><Plus className="mr-1.5 h-4 w-4" /> Új panasz</Button>} />
      ) : (
        <div className="space-y-2">
          {filtered.map((c) => (
            <div key={c.id} className="flex items-center gap-4 rounded-2xl border border-border bg-card p-4 shadow-card transition-colors hover:border-primary/30">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate font-semibold">{c.title}</span>
                  <StatusBadge status={c.status} />
                  {c.triaged_at && c.priority && <span className={PRIORITY[c.priority]}>{PRIORITY_LABEL[c.priority]}</span>}
                  {!c.triaged_at && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">Feldolgozás alatt…</span>}
                </div>
                <div className="text-sm text-muted-foreground">{clientName(c.client_id)} · {formatDateShort(c.created_date)}</div>
              </div>
              <Button variant="outline" size="sm" onClick={() => openEdit(c)} className="tap-lg"><Pencil className="mr-1 h-3.5 w-3.5" /> Szerkeszt</Button>
              <TwoStepDelete onDelete={() => remove(c)} />
            </div>
          ))}
        </div>
      )}

      <Modal
        open={modalOpen} onClose={() => setModalOpen(false)}
        title={editing ? "Panasz szerkesztése" : "Új panasz"}
        footer={<>
          <Button variant="outline" onClick={() => setModalOpen(false)}>Mégse</Button>
          {editing && <TwoStepDelete onDelete={() => { setModalOpen(false); remove(editing); }} label="Törlés" />}
          <Button onClick={save} disabled={saving} className="gradient-brand text-white">{saving ? "Mentés…" : "Mentés"}</Button>
        </>}
      >
        <div className="space-y-4">
          <div><Label>Cím *</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="mt-1.5" /></div>
          <div>
            <Label>Ügyfél</Label>
            <ResponsiveSelect
              value={form.client_id}
              onValueChange={(v) => setForm({ ...form, client_id: v })}
              placeholder="Ügyfél kiválasztása"
              className="mt-1.5"
              options={[
                { value: "none", label: "— Nincs ügyfél —" },
                ...clients.map((c) => ({ value: c.id, label: c.name })),
              ]}
            />
          </div>
          <div>
            <Label>Státusz</Label>
            <ResponsiveSelect
              value={form.status}
              onValueChange={(v) => setForm({ ...form, status: v })}
              className="mt-1.5"
              options={[
                { value: "open", label: "Nyitott" },
                { value: "in_progress", label: "Folyamatban" },
                { value: "resolved", label: "Megoldva" },
              ]}
            />
          </div>
          <div><Label>Leírás</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={4} className="mt-1.5" /></div>
          {editing?.agent_summary && (
            <div className="space-y-2 rounded-xl border border-border bg-secondary/50 p-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Asszisztens összefoglaló</div>
                <p className="mt-1 text-sm">{editing.agent_summary}</p>
              </div>
              {editing.category && <div className="text-sm text-muted-foreground">Kategória: {editing.category}</div>}
              {editing.draft_response && (
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Válaszjavaslat</div>
                  <p className="mt-1 whitespace-pre-wrap text-sm">{editing.draft_response}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </Modal>
    </PullToRefresh>
  );
}