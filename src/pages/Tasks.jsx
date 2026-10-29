import React, { useCallback, useEffect, useState } from "react";
import { Plus, Search, Pencil, CheckSquare, Calendar } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ResponsiveSelect from "@/components/ResponsiveSelect";
import PullToRefresh from "@/components/PullToRefresh";
import PageHeader from "@/components/PageHeader";
import Modal from "@/components/Modal";
import EmptyState from "@/components/EmptyState";
import TwoStepDelete from "@/components/TwoStepDelete";
import { logActivity } from "@/lib/activity";
import { formatDateShort, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const EMPTY = { title: "", due_date: "", assigned_to_id: "none" };

export default function Tasks() {
  const [items, setItems] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("open");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [t, u] = await Promise.all([
        base44.entities.Task.list("-created_date", 500),
        base44.entities.User.list().catch(() => []),
      ]);
      setItems(t); setUsers(u);
    } catch (e) {} finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const openCount = items.filter((t) => !t.done).length;
  const userName = (id) => users.find((u) => u.id === id)?.full_name || "";

  const filtered = items.filter((t) => {
    const q = search.toLowerCase();
    const matchesSearch = !q || t.title?.toLowerCase().includes(q);
    const matchesTab = tab === "all" ? true : tab === "open" ? !t.done : t.done;
    return matchesSearch && matchesTab;
  }).sort((a, b) => (a.done === b.done ? 0 : a.done ? 1 : -1) || (a.due_date || "9999") > (b.due_date || "9999") ? 1 : -1);

  const toggle = async (t) => {
    const done = !t.done;
    const doneAt = done ? new Date().toISOString() : "";
    const previous = items;
    // The checkbox flips immediately and rolls back if the save fails.
    setItems((list) => list.map((x) => (x.id === t.id ? { ...x, done, done_at: doneAt } : x)));
    try {
      await base44.entities.Task.update(t.id, { done, done_at: doneAt });
      await logActivity(done ? `Feladat teljesítve: "${t.title}"` : `Feladat újra megnyitva: "${t.title}"`, "update", "Task", t.id);
      load();
    } catch (e) {
      setItems(previous);
      alert(e.message);
    }
  };

  const openNew = () => { setEditing(null); setForm(EMPTY); setModalOpen(true); };
  const openEdit = (t) => { setEditing(t); setForm({ title: t.title, due_date: t.due_date || "", assigned_to_id: t.assigned_to_id || "none" }); setModalOpen(true); };

  const save = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    const payload = { ...form, assigned_to_id: form.assigned_to_id === "none" ? "" : form.assigned_to_id };
    try {
      if (editing) {
        await base44.entities.Task.update(editing.id, payload);
        await logActivity(`Feladat frissítve: "${form.title}"`, "update", "Task", editing.id);
      } else {
        const created = await base44.entities.Task.create({ ...payload, done: false });
        await logActivity(`Feladat létrehozva: "${form.title}"`, "create", "Task", created.id);
      }
      setModalOpen(false); load();
    } catch (e) { alert(e.message); } finally { setSaving(false); }
  };

  const remove = async (t) => { await base44.entities.Task.delete(t.id); load(); };

  return (
    <PullToRefresh onRefresh={load}>
      <PageHeader
        title="Feladatok"
        subtitle={`${openCount} nyitott feladat`}
        action={<Button onClick={openNew} className="gradient-brand text-white hover:opacity-90"><Plus className="mr-1.5 h-4 w-4" /> Új feladat</Button>}
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Feladatok keresése…" className="pl-9" />
        </div>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="open">Nyitott</TabsTrigger>
            <TabsTrigger value="done">Kész</TabsTrigger>
            <TabsTrigger value="all">Összes</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {loading ? (
        <div className="flex h-40 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary/20 border-t-primary" /></div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={CheckSquare} title={search ? "Nincs találat" : "Nincs feladat"} description={search ? "Próbálj más keresést." : "Hozz létre egy feladatot, hogy a csapatod nyomon követhesse."} action={!search && <Button onClick={openNew} className="gradient-brand text-white"><Plus className="mr-1.5 h-4 w-4" /> Új feladat</Button>} />
      ) : (
        <div className="space-y-2">
          {filtered.map((t) => (
            <div key={t.id} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-card transition-colors hover:border-primary/30">
              <button
                onClick={() => toggle(t)}
                className={cn("tap-lg flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border-2 transition-all",
                  t.done ? "gradient-brand border-transparent text-white" : "border-border hover:border-primary")}
              >
                {t.done && <CheckSquare className="h-3.5 w-3.5" />}
              </button>
              <div className="min-w-0 flex-1">
                <div className={cn("font-medium", t.done && "text-muted-foreground line-through")}>{t.title}</div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {t.done ? <span>Kész: {formatDateTime(t.done_at)}</span> : t.due_date ? <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" /> {formatDateShort(t.due_date)}</span> : <span>Nincs határidő</span>}
                  {userName(t.assigned_to_id) && <span>· {userName(t.assigned_to_id)}</span>}
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => openEdit(t)} className="tap-lg"><Pencil className="mr-1 h-3.5 w-3.5" /> Szerkeszt</Button>
              <TwoStepDelete onDelete={() => remove(t)} />
            </div>
          ))}
        </div>
      )}

      <Modal
        open={modalOpen} onClose={() => setModalOpen(false)}
        title={editing ? "Feladat szerkesztése" : "Új feladat"}
        footer={<>
          <Button variant="outline" onClick={() => setModalOpen(false)}>Mégse</Button>
          <Button onClick={save} disabled={saving} className="gradient-brand text-white">{saving ? "Mentés…" : "Mentés"}</Button>
        </>}
      >
        <div className="space-y-4">
          <div><Label>Cím *</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="mt-1.5" /></div>
          <div><Label>Határidő</Label><Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} className="mt-1.5" /></div>
          <div>
            <Label>Felelős</Label>
            <ResponsiveSelect
              value={form.assigned_to_id}
              onValueChange={(v) => setForm({ ...form, assigned_to_id: v })}
              placeholder="Nincs hozzárendelve"
              className="mt-1.5"
              options={[
                { value: "none", label: "Nincs hozzárendelve" },
                ...users.map((u) => ({ value: u.id, label: u.full_name || u.email })),
              ]}
            />
          </div>
        </div>
      </Modal>
    </PullToRefresh>
  );
}