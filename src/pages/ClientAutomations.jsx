import React, { useEffect, useState } from "react";
import { Zap, Play, Pencil, Gauge } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAccountScope } from "@/lib/accountScope";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import StatCard from "@/components/StatCard";
import AutomationContentEditor from "@/components/crm/AutomationContentEditor";
import { STEP_LABELS, TRIGGER_LABELS } from "@/lib/crm";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

const hasEmailStep = (automation) => (automation.steps || []).some((step) => step.type === "email");

export default function ClientAutomations() {
  const { accountId } = useAccountScope();
  const [automations, setAutomations] = useState([]);
  const [account, setAccount] = useState(null);
  const [usage, setUsage] = useState({ day: 0, month: 0 });
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const list = await base44.entities.Automation.list("-created_date", 100);
      setAutomations(list);
      const acc = await base44.entities.Account.get(accountId).catch(() => null);
      setAccount(acc);
      const now = new Date();
      const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const base = { account_id: accountId, marketing: true, status: { $ne: "failed" } };
      const [day, month] = await Promise.all([
        base44.entities.MessageLog.count({ ...base, created_date: { $gte: dayStart } }),
        base44.entities.MessageLog.count({ ...base, created_date: { $gte: monthStart } }),
      ]);
      setUsage({ day: day || 0, month: month || 0 });
    } catch (e) {} finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [accountId]);

  const toggle = async (automation) => {
    setSaving(true);
    try {
      const res = await base44.functions.invoke("crmAutomationContent", {
        automation_id: automation.id, action: "toggle", active: !automation.active,
      });
      if (res.data?.error) alert(res.data.error); else load();
    } catch (e) { alert(e.message); } finally { setSaving(false); }
  };

  const activeCount = automations.filter((a) => a.active).length;
  const dailyLimit = Number(account?.send_limit_daily) > 0 ? Number(account.send_limit_daily) : 50;
  const monthlyLimit = Number(account?.send_limit_monthly) > 0 ? Number(account.send_limit_monthly) : 500;

  if (loading) return <div className="flex h-64 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary/20 border-t-primary" /></div>;

  return (
    <div>
      <PageHeader title="Automatizációk"
        subtitle={`${account?.name || "A saját accountod"} folyamatai — a levél tárgyát és szövegét te írhatod`} />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={Zap} label="Automatizációk" value={formatNumber(automations.length)} gradient="violet" />
        <StatCard icon={Play} label="Aktív" value={formatNumber(activeCount)} gradient="emerald" />
        <StatCard icon={Gauge} label="Ma kiküldve" value={`${formatNumber(usage.day)} / ${formatNumber(dailyLimit)}`} gradient="blue" />
        <StatCard icon={Gauge} label="Ebben a hónapban" value={`${formatNumber(usage.month)} / ${formatNumber(monthlyLimit)}`} gradient="pink" />
      </div>

      {automations.length === 0 ? (
        <EmptyState icon={Zap} title="Még nincs automatizáció"
          description="Az automatizációk sablonjait az adminisztrátor hozza létre az accountodhoz." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {automations.map((a) => (
            <div key={a.id} className="rounded-2xl border border-border bg-card p-5 shadow-card">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate font-heading font-semibold">{a.name}</h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">{TRIGGER_LABELS[a.trigger] || a.trigger}</p>
                  <span className={cn("mt-1.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold",
                    a.marketing
                      ? "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-400"
                      : "bg-muted text-muted-foreground")}>
                    {a.marketing ? "marketing" : "tranzakciós"}
                  </span>
                </div>
                <Switch checked={!!a.active} disabled={saving} onCheckedChange={() => toggle(a)} />
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {(a.steps || []).map((s, i) => (
                  <span key={i} className="rounded-lg bg-muted px-2 py-1 text-[11px] font-medium text-muted-foreground">
                    {i + 1}. {STEP_LABELS[s.type] || s.type}
                  </span>
                ))}
              </div>

              <div className="mt-4 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{formatNumber(a.run_count || 0)} futás</span>
                <Button variant="outline" size="sm" disabled={!hasEmailStep(a)} onClick={() => setEditing(a)}>
                  <Pencil className="mr-1 h-3.5 w-3.5" /> Tartalom szerkesztése
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <AutomationContentEditor open={!!editing} automation={editing} onClose={() => setEditing(null)} onSaved={load} />
    </div>
  );
}