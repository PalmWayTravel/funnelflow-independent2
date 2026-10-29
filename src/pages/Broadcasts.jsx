import React, { useEffect, useMemo, useState } from "react";
import { Megaphone, Mail, MessageSquare, Send, Users, CheckCircle2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import PageHeader from "@/components/PageHeader";
import StatCard from "@/components/StatCard";
import { formatNumber, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { getWorkspaceSettings, SMS_DISABLED_HINT } from "@/lib/crm";

const EMPTY = { name: "", account_id: "", channel: "email", subject: "", body: "", audience_stage_id: "", audience_tag: "" };

export default function Broadcasts() {
  const [broadcasts, setBroadcasts] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [stages, setStages] = useState([]);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY);
  const smsEnabled = settings?.sms_enabled === true;
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [b, c, a, s, ws] = await Promise.all([
        base44.entities.Broadcast.list("-created_date", 100),
        base44.entities.Contact.list("-created_date", 500),
        base44.entities.Account.list("-created_date", 100),
        base44.entities.PipelineStage.list("order", 50),
        getWorkspaceSettings(),
      ]);
      setBroadcasts(b); setContacts(c); setAccounts(a); setStages(s); setSettings(ws);
    } catch (e) {} finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const recipients = useMemo(() => contacts.filter((c) => {
    if (form.account_id && c.account_id !== form.account_id) return false;
    if (form.audience_stage_id && c.stage_id !== form.audience_stage_id) return false;
    if (form.audience_tag && !(c.tags || []).includes(form.audience_tag)) return false;
    return form.channel === "sms" ? !!c.phone : !!c.email;
  }), [contacts, form.account_id, form.audience_stage_id, form.audience_tag, form.channel]);

  const allTags = useMemo(() => Array.from(new Set(contacts.flatMap((c) => c.tags || []))).sort(), [contacts]);

  const send = async () => {
    if (!form.name.trim() || !form.body.trim() || recipients.length === 0) return;
    setSending(true);
    setResult(null);
    try {
      const created = await base44.entities.Broadcast.create({
        ...form, name: form.name.trim(), recipient_count: recipients.length, status: "draft",
      });
      const res = await base44.functions.invoke("crmSendBroadcast", { broadcast_id: created.id });
      setResult(res.data);
      setForm(EMPTY);
      load();
    } catch (e) { setResult({ error: e.message }); } finally { setSending(false); }
  };

  const sentTotal = broadcasts.reduce((s, b) => s + (b.sent_count || 0), 0);

  if (loading) return <div className="flex h-64 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary/20 border-t-primary" /></div>;

  return (
    <div>
      <PageHeader title="Kampányok" subtitle="Egyszeri, célzott e-mail vagy SMS küldés kiválasztott csoportnak" />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={Megaphone} label="Kampányok" value={formatNumber(broadcasts.length)} gradient="violet" />
        <StatCard icon={Send} label="Elküldött üzenetek" value={formatNumber(sentTotal)} gradient="blue" />
        <StatCard icon={Users} label="Kontakt a listán" value={formatNumber(contacts.length)} gradient="emerald" />
        <StatCard icon={CheckCircle2} label="Aktuális célzott címzettek" value={formatNumber(recipients.length)} gradient="pink" />
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3 rounded-2xl border border-border bg-card p-5 shadow-card">
          <h2 className="mb-4 font-heading text-base font-semibold">Új kampány</h2>
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div><Label>Kampány neve *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="pl. Novemberi ajánlat" className="mt-1.5" /></div>
              <div><Label>Csatorna</Label>
                <div className="mt-1.5 flex gap-1 rounded-xl border border-border p-0.5">
                  {[["email", "E-mail"], ["sms", "SMS"]].map(([key, label]) => (
                    <button key={key} onClick={() => setForm({ ...form, channel: key })}
                      disabled={key === "sms" && !smsEnabled}
                      className={cn("flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40", form.channel === key ? "gradient-brand text-white" : "text-muted-foreground")}>
                      {key === "email" ? <Mail className="mr-1 inline h-3.5 w-3.5" /> : <MessageSquare className="mr-1 inline h-3.5 w-3.5" />}{label}
                    </button>
                  ))}
                </div>
                {!smsEnabled && <p className="mt-1.5 text-xs font-medium text-amber-600 dark:text-amber-400">{SMS_DISABLED_HINT}</p>}
              </div>
            </div>

            <div className="rounded-xl border border-border p-3">
              <Label className="mb-2 block">Célcsoport</Label>
              <div className="grid gap-2 sm:grid-cols-3">
                <Select value={form.account_id || "all"} onValueChange={(v) => setForm({ ...form, account_id: v === "all" ? "" : v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="all">Minden account</SelectItem>{accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={form.audience_stage_id || "all"} onValueChange={(v) => setForm({ ...form, audience_stage_id: v === "all" ? "" : v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="all">Minden fázis</SelectItem>{stages.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={form.audience_tag || "all"} onValueChange={(v) => setForm({ ...form, audience_tag: v === "all" ? "" : v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="all">Minden címke</SelectItem>{allTags.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="mt-2 flex items-center gap-2 rounded-lg gradient-brand-soft px-3 py-2">
                <Users className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold text-primary">{formatNumber(recipients.length)} címzettet érint</span>
              </div>
            </div>

            {form.channel === "email" && <div><Label>Tárgy</Label><Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} className="mt-1.5" /></div>}
            <div><Label>Üzenet *</Label>
              <Textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} rows={6}
                placeholder="Üzenet szövege — változók: {{nev}}, {{ceg}}, {{email}}" className="mt-1.5" />
            </div>

            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">Legfeljebb 200 címzett kampányonként. Minden kiküldött üzenet naplózásra kerül.</p>
              <Button onClick={send} disabled={sending || recipients.length === 0 || !form.name.trim() || !form.body.trim()} className="gradient-brand text-white">
                <Send className="mr-1.5 h-4 w-4" /> {sending ? "Küldés…" : "Kampány indítása"}
              </Button>
            </div>

            {result && !result.error && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-400">
                {formatNumber(result.recipients)} címzett · {formatNumber(result.sent)} elküldve · {formatNumber(result.failed)} sikertelen
                {result.skipped ? ` · ${formatNumber(result.skipped)} kihagyva (nincs elérhetőség)` : ""}
              </div>
            )}
            {result?.error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">{result.error}</div>}
          </div>
        </div>

        <div className="lg:col-span-2 rounded-2xl border border-border bg-card shadow-card">
          <div className="border-b border-border px-5 py-4"><h2 className="font-heading text-base font-semibold">Korábbi kampányok</h2></div>
          {broadcasts.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-muted-foreground">Még nem indítottál kampányt.</p>
          ) : (
            <div className="divide-y divide-border">
              {broadcasts.map((b) => (
                <div key={b.id} className="px-5 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold">{b.name}</span>
                    <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">{b.channel === "sms" ? "SMS" : "E-mail"}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatNumber(b.recipient_count || 0)} címzett · {formatNumber(b.sent_count || 0)} elküldve
                    {b.failed_count ? ` · ${formatNumber(b.failed_count)} sikertelen` : ""}
                  </p>
                  <p className="text-[11px] text-muted-foreground">{b.sent_at ? formatDateTime(b.sent_at) : "Piszkozat"}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}