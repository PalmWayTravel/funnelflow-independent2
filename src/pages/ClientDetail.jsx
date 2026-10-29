import React, { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Pencil, MessageSquareWarning, CheckSquare, KanbanSquare, Paperclip, Download, Upload } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import StatusBadge from "@/components/StatusBadge";
import Modal from "@/components/Modal";
import EmptyState from "@/components/EmptyState";
import TwoStepDelete from "@/components/TwoStepDelete";
import StatCard from "@/components/StatCard";
import { logActivity } from "@/lib/activity";
import { initials, formatDateShort, timeAgo } from "@/lib/format";

const STAGES = ["New Lead", "Contacted", "Proposal", "Negotiation", "Won", "Lost"];
const STAGE_LABELS = { "New Lead": "Új lead", Contacted: "Kapcsolatfelvétel", Proposal: "Ajánlat", Negotiation: "Tárgyalás", Won: "Nyert", Lost: "Elvesztett" };

export default function ClientDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [client, setClient] = useState(null);
  const [complaints, setComplaints] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [leads, setLeads] = useState([]);
  const [stages, setStages] = useState([]);
  const [files, setFiles] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState({});

  const load = async () => {
    setLoading(true);
    try {
      const [c, comp, t, f, allLogs] = await Promise.all([
        base44.entities.Client.get(id),
        base44.entities.Complaint.filter({ client_id: id }, "-created_date", 100),
        base44.entities.Task.list("-created_date", 200),
        base44.entities.ClientFile.filter({ client_id: id }, "-created_date", 100),
        base44.entities.ActivityLog.list("-created_date", 30),
      ]);
      // A leadek a közös pipeline-ból jönnek: az ügyfél accountjához tartozó kontakok.
      const [l, s] = await Promise.all([
        c.account_id ? base44.entities.Contact.filter({ account_id: c.account_id }, "-created_date", 200) : [],
        c.account_id ? base44.entities.PipelineStage.filter({ account_id: c.account_id }, "order", 50) : [],
      ]);
      setClient(c); setComplaints(comp); setTasks(t.filter(x => !x.assigned_to_id || true)); setLeads(l); setStages(s); setFiles(f);
      setLogs(allLogs.filter(x => x.message?.includes(c.name)));
    } catch (e) {} finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [id]);

  const saveClient = async () => {
    await base44.entities.Client.update(id, form);
    await logActivity(`Ügyfél frissítve: "${form.name}"`, "update", "Client", id);
    setEditOpen(false); load();
  };

  const onUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { file_url } = await base44.integrations.Core.UploadPublicFile({ file });
      await base44.entities.ClientFile.create({ client_id: id, file_name: file.name, file_url, file_type: file.type, file_size: file.size, uploaded_by_id: "" });
      await logActivity(`Fájl feltöltve: "${file.name}" — ${client.name}`, "create", "ClientFile");
      load();
    } catch (err) { alert(err.message); }
  };

  const deleteFile = async (f) => { await base44.entities.ClientFile.delete(f.id); load(); };

  if (loading) return <div className="flex h-64 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary/20 border-t-primary" /></div>;
  if (!client) return <EmptyState title="Ügyfél nem található" />;

  const openComp = complaints.filter(c => c.status !== "resolved").length;
  const openTasks = tasks.filter(t => !t.done).length;
  const stageName = (stageId) => stages.find(s => s.id === stageId)?.name || "";

  return (
    <div className="space-y-6">
      <Link to="/clients" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Vissza az ügyfelekhez</Link>

      {/* Header */}
      <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-card sm:flex-row sm:items-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl text-xl font-bold text-white" style={{ background: `linear-gradient(135deg, ${client.avatar_color || "#8549DE"}, #C548C0)` }}>
          {initials(client.name)}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="font-heading text-xl font-bold">{client.name}</h1>
            <StatusBadge status={client.status} />
            {client.crm_enabled && <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-bold text-violet-700 dark:bg-violet-500/15 dark:text-violet-400">CRM</span>}
          </div>
          <div className="text-sm text-muted-foreground">{[client.email, client.phone].filter(Boolean).join(" · ") || "Nincs elérhetőség"}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => { setForm({ ...client }); setEditOpen(true); }}><Pencil className="mr-1 h-3.5 w-3.5" /> Szerkeszt</Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={MessageSquareWarning} label="Nyitott panaszok" value={openComp} gradient="rose" />
        <StatCard icon={CheckSquare} label="Nyitott feladatok" value={openTasks} gradient="amber" />
        <StatCard icon={KanbanSquare} label="Lead-ek a pipeline-ban" value={leads.length} gradient="violet" />
        <StatCard icon={Paperclip} label="Fájlok" value={files.length} gradient="blue" />
      </div>

      <Tabs defaultValue="overview">
        <div className="mb-4 overflow-x-auto pb-1 scrollbar-thin">
          <TabsList className="w-max">
          <TabsTrigger value="overview">Áttekintés</TabsTrigger>
          <TabsTrigger value="complaints">Panaszok ({complaints.length})</TabsTrigger>
          <TabsTrigger value="tasks">Feladatok ({tasks.length})</TabsTrigger>
          {client.crm_enabled && <TabsTrigger value="crm">CRM Pipeline ({leads.length})</TabsTrigger>}
          <TabsTrigger value="files">Fájlok ({files.length})</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
              <h3 className="mb-3 font-heading font-semibold">Elérhetőségek</h3>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between"><dt className="text-muted-foreground">E-mail</dt><dd>{client.email || "—"}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Telefon</dt><dd>{client.phone || "—"}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Létrehozva</dt><dd>{formatDateShort(client.created_date)}</dd></div>
              </dl>
              {client.note && <div className="mt-4"><h4 className="mb-1 text-sm font-medium">Megjegyzés</h4><p className="text-sm text-muted-foreground">{client.note}</p></div>}
            </div>
            <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
              <h3 className="mb-3 font-heading font-semibold">Legutóbbi tevékenység</h3>
              {logs.length === 0 ? <p className="text-sm text-muted-foreground">Még nincs tevékenység.</p> : (
                <div className="space-y-3">
                  {logs.slice(0, 8).map(l => (
                    <div key={l.id} className="flex gap-3">
                      <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full gradient-brand" />
                      <div><p className="text-sm">{l.message}</p><p className="text-xs text-muted-foreground">{timeAgo(l.created_date)}</p></div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="complaints">
          {complaints.length === 0 ? <EmptyState icon={MessageSquareWarning} title="Nincs panasz" description="Ennek az ügyfélnek nincs rögzített panasza." /> : (
            <div className="space-y-2">
              {complaints.map(c => (
                <div key={c.id} className="rounded-2xl border border-border bg-card p-4 shadow-card">
                  <div className="flex items-center gap-2"><span className="font-semibold">{c.title}</span><StatusBadge status={c.status} /></div>
                  {c.description && <p className="mt-1 text-sm text-muted-foreground">{c.description}</p>}
                  <div className="text-xs text-muted-foreground">{formatDateShort(c.created_date)}</div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="tasks">
          {tasks.length === 0 ? <EmptyState icon={CheckSquare} title="Nincs feladat" description="Nincs feladat ehhez az ügyfélhez." /> : (
            <div className="space-y-2">
              {tasks.map(t => (
                <div key={t.id} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-card">
                  <div className={`h-2 w-2 rounded-full ${t.done ? "bg-emerald-500" : "bg-amber-500"}`} />
                  <span className={`flex-1 font-medium ${t.done ? "text-muted-foreground line-through" : ""}`}>{t.title}</span>
                  {t.due_date && <span className="text-xs text-muted-foreground">{formatDateShort(t.due_date)}</span>}
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {client.crm_enabled && (
          <TabsContent value="crm">
            {leads.length === 0 ? <EmptyState icon={KanbanSquare} title="Még nincs lead" description="Ennek az ügyfélnek a pipeline-ja üres." /> : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {leads.map(l => (
                  <div key={l.id} className="rounded-2xl border border-border bg-card p-4 shadow-card">
                    <div className="flex items-center justify-between"><span className="font-semibold">{l.name}</span>{stageName(l.stage_id) && <StatusBadge status={stageName(l.stage_id)} />}</div>
                    <div className="mt-1 text-sm text-muted-foreground">{[l.company, l.email].filter(Boolean).join(" · ") || "Nincs elérhetőség"}</div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        )}

        <TabsContent value="files">
          <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-heading font-semibold">Csatolt fájlok</h3>
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg gradient-brand px-3 py-1.5 text-sm font-medium text-white">
                <Upload className="h-4 w-4" /> Feltöltés
                <input type="file" className="hidden" onChange={onUpload} />
              </label>
            </div>
            {files.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">Még nincs csatolt fájl.</p> : (
              <div className="space-y-2">
                {files.map(f => (
                  <div key={f.id} className="flex items-center gap-3 rounded-xl border border-border p-3">
                    <Paperclip className="h-4 w-4 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <div className="truncate text-sm font-medium">{f.file_name}</div>
                      <div className="text-xs text-muted-foreground">{formatDateShort(f.created_date)}</div>
                    </div>
                    <a href={f.file_url} target="_blank" rel="noreferrer" className="rounded-lg p-2 text-muted-foreground hover:bg-accent"><Download className="h-4 w-4" /></a>
                    <TwoStepDelete onDelete={() => deleteFile(f)} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Ügyfél szerkesztése"
        footer={<><Button variant="outline" onClick={() => setEditOpen(false)}>Mégse</Button><Button onClick={saveClient} className="gradient-brand text-white">Mentés</Button></>}>
        <div className="space-y-4">
          <div><Label>Név</Label><Input value={form.name || ""} onChange={e => setForm({ ...form, name: e.target.value })} className="mt-1.5" /></div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div><Label>E-mail</Label><Input value={form.email || ""} onChange={e => setForm({ ...form, email: e.target.value })} className="mt-1.5" /></div>
            <div><Label>Telefon</Label><Input value={form.phone || ""} onChange={e => setForm({ ...form, phone: e.target.value })} className="mt-1.5" /></div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div><Label>Státusz</Label>
              <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}><SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="active">Aktív</SelectItem><SelectItem value="prospect">Érdeklődő</SelectItem><SelectItem value="inactive">Inaktív</SelectItem></SelectContent></Select>
            </div>
            <div><Label>CRM modul</Label>
              <Select value={form.crm_enabled ? "yes" : "no"} onValueChange={v => setForm({ ...form, crm_enabled: v === "yes" })}><SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="yes">Igen</SelectItem><SelectItem value="no">Nem</SelectItem></SelectContent></Select>
            </div>
          </div>
          <div><Label>Megjegyzés</Label><Textarea value={form.note || ""} onChange={e => setForm({ ...form, note: e.target.value })} rows={3} className="mt-1.5" /></div>
        </div>
      </Modal>
    </div>
  );
}