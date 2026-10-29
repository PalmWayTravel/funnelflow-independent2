import React, { useEffect, useMemo, useState } from "react";
import { Plus, Zap, Play, Pause, History, Clock, CheckCircle2, XCircle } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import StatCard from "@/components/StatCard";
import AutomationBuilder from "@/components/crm/AutomationBuilder";
import SendLogTable from "@/components/crm/SendLogTable";
import { STEP_LABELS, TRIGGER_LABELS, getWorkspaceSettings } from "@/lib/crm";
import { formatNumber, formatDateTime, timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

const STATUS_STYLES = {
  running: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400",
  done: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
  stopped: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
  failed: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400",
};
const STATUS_LABELS = { running: "fut", done: "kész", stopped: "leállítva", failed: "hiba" };

export default function Automations() {
  const [automations, setAutomations] = useState([]);
  const [runs, setRuns] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [stages, setStages] = useState([]);
  const [forms, setForms] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [logs, setLogs] = useState([]);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [a, r, acc, s, f, c, ml, ws] = await Promise.all([
        base44.entities.Automation.list("-created_date", 200),
        base44.entities.AutomationRun.list("-created_date", 100),
        base44.entities.Account.list("-created_date", 100),
        base44.entities.PipelineStage.list("order", 50),
        base44.entities.FormDef.list("-created_date", 100),
        base44.entities.Contact.list("-created_date", 500),
        base44.entities.MessageLog.list("-created_date", 100),
        getWorkspaceSettings(),
      ]);
      setAutomations(a); setRuns(r); setAccounts(acc); setStages(s); setForms(f); setContacts(c); setLogs(ml);
      setSettings(ws);
    } catch (e) {} finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const contactName = (id) => contacts.find((c) => c.id === id)?.name || "—";
  const accountName = (id) => accounts.find((a) => a.id === id)?.name || "Nincs account";
  const activeCount = automations.filter((a) => a.active).length;
  const runningRuns = runs.filter((r) => r.status === "running").length;
  const doneRuns = runs.filter((r) => r.status === "done").length;

  const toggle = async (automation) => {
    if (!automation.account_id) return;
    await base44.entities.Automation.update(automation.id, { active: !automation.active });
    load();
  };

  if (loading) return <div className="flex h-64 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary/20 border-t-primary" /></div>;

  return (
    <div>
      <PageHeader title="Automatizációk" subtitle="Vizuális folyamatok: indító esemény, feltételek és automatikus lépések"
        action={<Button onClick={() => { setEditing(null); setBuilderOpen(true); }} className="gradient-brand text-white"><Plus className="mr-1.5 h-4 w-4" /> Új automatizáció</Button>} />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={Zap} label="Automatizációk" value={formatNumber(automations.length)} gradient="violet" />
        <StatCard icon={Play} label="Aktív" value={formatNumber(activeCount)} gradient="emerald" />
        <StatCard icon={Clock} label="Futó sorozatok" value={formatNumber(runningRuns)} gradient="blue" />
        <StatCard icon={CheckCircle2} label="Lezárt sorozatok" value={formatNumber(doneRuns)} gradient="pink" />
      </div>

      {automations.length === 0 ? (
        <EmptyState icon={Zap} title="Még nincs automatizáció" description="Hozz létre egy folyamatot: pl. új kontaktról azonnal küldjön üdvözlő e-mailt."
          action={<Button onClick={() => setBuilderOpen(true)} className="gradient-brand text-white">Automatizáció létrehozása</Button>} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {automations.map((a) => (
            <div key={a.id} className="rounded-2xl border border-border bg-card p-5 shadow-card">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate font-heading font-semibold">{a.name}</h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {TRIGGER_LABELS[a.trigger] || a.trigger}
                    {a.trigger === "booking_upcoming" ? ` — ${a.trigger_minutes_before || 60} perccel előtte` : ""}
                    {" · "}{accountName(a.account_id)}
                  </p>
                  {!a.account_id && (
                    <span className="mr-1.5 mt-1.5 inline-block rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700 dark:bg-red-500/15 dark:text-red-400">
                      Nincs account
                    </span>
                  )}
                  <span className={cn("mt-1.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold",
                    a.marketing
                      ? "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-400"
                      : "bg-muted text-muted-foreground")}>
                    {a.marketing ? "marketing — csak hozzájárulóknak" : "tranzakciós"}
                  </span>
                  {!a.account_id && (
                    <p className="mt-1.5 text-xs font-medium text-red-600 dark:text-red-400">
                      Account hozzárendelése szükséges — amíg nincs account, egyetlen leadre sem fut le.
                    </p>
                  )}
                </div>
                <Switch checked={!!a.active} disabled={!a.account_id}
                  title={!a.account_id ? "Előbb rendelj accountot az automatizációhoz" : undefined}
                  onCheckedChange={() => toggle(a)} />
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {(a.steps || []).map((s, i) => (
                  <span key={i} className="rounded-lg bg-muted px-2 py-1 text-[11px] font-medium text-muted-foreground">
                    {i + 1}. {STEP_LABELS[s.type] || s.type}
                  </span>
                ))}
                {(a.steps || []).length === 0 && <span className="text-xs text-muted-foreground">Nincs lépés — az automatizáció nem csinál semmit.</span>}
              </div>

              {(a.condition_tag || a.stop_tag) && (
                <div className="mt-3 space-y-0.5 text-xs text-muted-foreground">
                  {a.condition_tag && <div>Belépés csak ha van címkéje: <span className="font-medium text-foreground">{a.condition_tag}</span></div>}
                  {a.stop_tag && <div>Leáll, ha már megvan: <span className="font-medium text-foreground">{a.stop_tag}</span></div>}
                </div>
              )}

              <div className="mt-4 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{formatNumber(a.run_count || 0)} futás</span>
                <Button variant="outline" size="sm" onClick={() => { setEditing(a); setBuilderOpen(true); }}>Szerkesztés</Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-8 rounded-2xl border border-border bg-card shadow-card">
        <div className="flex items-center gap-2 border-b border-border px-5 py-4">
          <History className="h-4 w-4 text-primary" />
          <h2 className="font-heading text-base font-semibold">Legutóbbi futások</h2>
        </div>
        {runs.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted-foreground">Még nem futott automatizáció. A folyamatok akkor indulnak el, amikor egy kontakt létrejön, űrlapot küld be vagy foglal.</p>
        ) : (
          <div className="divide-y divide-border">
            {runs.map((run) => {
              const automation = automations.find((a) => a.id === run.automation_id);
              return (
                <div key={run.id} className="px-5 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold">{automation?.name || "Törölt automatizáció"}</span>
                    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", STATUS_STYLES[run.status])}>{STATUS_LABELS[run.status] || run.status}</span>
                    <span className="text-xs text-muted-foreground">{contactName(run.contact_id)}</span>
                    <span className="ml-auto text-xs text-muted-foreground">{timeAgo(run.created_date)}</span>
                  </div>
                  <div className="mt-1.5 space-y-0.5">
                    {(run.history || []).slice(-4).map((line, i) => (
                      <div key={i} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        {line.includes("(sent)") || line.includes("elküldve") ? <CheckCircle2 className="h-3 w-3 text-emerald-500" /> : <Clock className="h-3 w-3" />}
                        {line}
                      </div>
                    ))}
                  </div>
                  {run.status === "running" && run.next_run_at && (
                    <p className="mt-1 text-[11px] text-muted-foreground">Következő lépés: {formatDateTime(run.next_run_at)}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <SendLogTable logs={logs} automations={automations} accountName={accountName} onToggleAutomation={toggle} />

      <AutomationBuilder open={builderOpen} onClose={() => setBuilderOpen(false)} automation={editing}
        accounts={accounts} stages={stages} forms={forms} onSaved={load}
        smsEnabled={settings?.sms_enabled === true} />
    </div>
  );
}