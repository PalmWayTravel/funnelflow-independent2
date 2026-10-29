import React, { useEffect, useState } from "react";
import { Plus, FileText, Copy, Check, ExternalLink, Inbox } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import StatCard from "@/components/StatCard";
import FormBuilder from "@/components/crm/FormBuilder";
import { embedSnippet, publicUrl } from "@/lib/crm";
import { formatNumber, timeAgo } from "@/lib/format";

export default function Forms() {
  const [forms, setForms] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [stages, setStages] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [copiedId, setCopiedId] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const [f, a, s, sub, c] = await Promise.all([
        base44.entities.FormDef.list("-created_date", 100),
        base44.entities.Account.list("-created_date", 100),
        base44.entities.PipelineStage.list("order", 50),
        base44.entities.FormSubmission.list("-created_date", 100),
        base44.entities.Contact.list("-created_date", 300),
      ]);
      setForms(f); setAccounts(a); setStages(s); setSubmissions(sub); setContacts(c);
    } catch (e) {} finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const toggle = async (form) => {
    await base44.entities.FormDef.update(form.id, { active: !form.active });
    load();
  };

  const copy = (form) => {
    navigator.clipboard?.writeText(embedSnippet(`/f/${form.id}`, 680));
    setCopiedId(form.id);
    setTimeout(() => setCopiedId(""), 2000);
  };

  const contactName = (id) => contacts.find((c) => c.id === id)?.name || "—";
  const formName = (id) => forms.find((f) => f.id === id)?.name || "—";
  const totalSubmissions = forms.reduce((s, f) => s + (f.submission_count || 0), 0);

  if (loading) return <div className="flex h-64 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary/20 border-t-primary" /></div>;

  return (
    <div>
      <PageHeader title="Űrlapok" subtitle="Kód nélkül építhető lead-gyűjtő űrlapok, egy beágyazó kóddal bármely weboldalra"
        action={<Button onClick={() => { setEditing(null); setBuilderOpen(true); }} className="gradient-brand text-white"><Plus className="mr-1.5 h-4 w-4" /> Új űrlap</Button>} />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={FileText} label="Űrlapok" value={formatNumber(forms.length)} gradient="violet" />
        <StatCard icon={FileText} label="Aktív" value={formatNumber(forms.filter((f) => f.active).length)} gradient="emerald" />
        <StatCard icon={Inbox} label="Összes kitöltés" value={formatNumber(totalSubmissions)} gradient="blue" />
        <StatCard icon={Inbox} label="Kitöltés ebben a hónapban" value={formatNumber(submissions.filter((s) => {
          const d = new Date(s.created_date); const n = new Date();
          return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth();
        }).length)} gradient="pink" />
      </div>

      {forms.length === 0 ? (
        <EmptyState icon={FileText} title="Még nincs űrlap" description="Készíts egy kapcsolatfelvételi űrlapot, és helyezd el a weboldaladon — a kitöltések automatikusan kontaktként jelennek meg."
          action={<Button onClick={() => setBuilderOpen(true)} className="gradient-brand text-white">Űrlap létrehozása</Button>} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {forms.map((form) => (
            <div key={form.id} className="flex flex-col rounded-2xl border border-border bg-card p-5 shadow-card">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate font-heading font-semibold">{form.name}</h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">{form.title} · {(form.fields || []).length} mező</p>
                </div>
                <Switch checked={!!form.active} onCheckedChange={() => toggle(form)} />
              </div>

              <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1"><Inbox className="h-3.5 w-3.5" /> {formatNumber(form.submission_count || 0)} kitöltés</span>
                <span className="inline-flex items-center gap-1">
                  <span className="h-3 w-3 rounded-full" style={{ background: form.accent_color || "#8549DE" }} /> {form.accent_color}
                </span>
              </div>

              <div className="mt-3 flex-1 rounded-lg bg-muted px-3 py-2">
                <pre className="overflow-hidden text-[11px] leading-snug text-muted-foreground" style={{ maxHeight: 48 }}>{embedSnippet(`/f/${form.id}`, 680).slice(0, 90)}…</pre>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" onClick={() => copy(form)}>
                  {copiedId === form.id ? <Check className="mr-1 h-3.5 w-3.5" /> : <Copy className="mr-1 h-3.5 w-3.5" />}
                  {copiedId === form.id ? "Kimásolva" : "Beágyazó kód"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => window.open(publicUrl(`/f/${form.id}`), "_blank")}><ExternalLink className="mr-1 h-3.5 w-3.5" /> Előnézet</Button>
                <Button size="sm" variant="outline" onClick={() => { setEditing(form); setBuilderOpen(true); }}>Szerkesztés</Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-8 rounded-2xl border border-border bg-card shadow-card">
        <div className="border-b border-border px-5 py-4"><h2 className="font-heading text-base font-semibold">Legutóbbi kitöltések</h2></div>
        {submissions.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted-foreground">Még nincs kitöltés.</p>
        ) : (
          <div className="divide-y divide-border">
            {submissions.slice(0, 12).map((s) => (
              <div key={s.id} className="flex items-center gap-3 px-5 py-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg gradient-brand-soft text-primary"><Inbox className="h-4 w-4" /></div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{contactName(s.contact_id)}</div>
                  <div className="truncate text-xs text-muted-foreground">{formName(s.form_def_id)}</div>
                </div>
                <span className="text-xs text-muted-foreground">{timeAgo(s.created_date)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <FormBuilder open={builderOpen} onClose={() => setBuilderOpen(false)} form={editing}
        accounts={accounts} stages={stages} onSaved={load} />
    </div>
  );
}