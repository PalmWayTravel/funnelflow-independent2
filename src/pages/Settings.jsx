import React, { useEffect, useState } from "react";
import { Users as UsersIcon, User, Target, Plug, AlertTriangle, Mail, Copy, Check, Send, Bell, Smartphone, Trash2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { getWorkspaceSettings, saveWorkspaceSettings } from "@/lib/crm";
import { syncClientFromAccount } from "@/lib/clientSync";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { useTheme } from "@/components/ThemeProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import PageHeader from "@/components/PageHeader";
import StatusBadge from "@/components/StatusBadge";
import Modal from "@/components/Modal";
import TwoStepDelete from "@/components/TwoStepDelete";
import TeamMemberList from "@/components/settings/TeamMemberList";
import BookingEmailSettings from "@/components/settings/BookingEmailSettings";
import { logActivity } from "@/lib/activity";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const AVATAR_COLORS = ["#8549DE", "#C548C0", "#E9498F", "#10B981", "#3B82F6", "#F59E0B", "#EF4444"];
const ROLE_LABELS = { admin: "Admin", user: "Ügyfél" };
const THEME_LABELS = { light: "világos", dark: "sötét", system: "rendszer" };

export default function Settings() {
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const [users, setUsers] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [goals, setGoals] = useState(null);
  const [integrations, setIntegrations] = useState([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("user");
  const [profile, setProfile] = useState({ full_name: "", avatar_color: "#8549DE" });
  const [goalsForm, setGoalsForm] = useState({ cash_target: 0, closed_deals_target: 0, booked_meetings_target: 0, monthly_commission: 0 });
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState("");
  const [ws, setWs] = useState(null);
  const [wsForm, setWsForm] = useState({
    email_from_name: "", email_from_email: "", email_domain: "", sms_from_name: "", sms_enabled: false,
    notify_new_contact: true, notify_new_booking: true, notify_complaint: true, notify_daily_summary: false,
  });
  const [deleteStep, setDeleteStep] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const [stripe, setStripe] = useState({ loading: true, connected: null, error: "" });

  const load = async () => {
    try {
      const [u, gs, ig, ac] = await Promise.all([
        base44.entities.User.list().catch(() => []),
        base44.entities.Goals.list("-created_date", 1),
        base44.entities.Integration.list("-created_date", 20),
        base44.entities.Account.list("-created_date", 200).catch(() => []),
      ]);
      setUsers(u); setGoals(gs[0] || null); setAccounts(ac);
      if (gs[0]) setGoalsForm({ cash_target: gs[0].cash_target, closed_deals_target: gs[0].closed_deals_target, booked_meetings_target: gs[0].booked_meetings_target, monthly_commission: gs[0].monthly_commission });
      setIntegrations(ig);
      const wsData = await getWorkspaceSettings();
      if (wsData) {
        setWs(wsData);
        setWsForm({
          email_from_name: wsData.email_from_name || "",
          email_from_email: wsData.email_from_email || "",
          email_domain: wsData.email_domain || "",
          sms_from_name: wsData.sms_from_name || "",
          sms_enabled: !!wsData.sms_enabled,
          notify_new_contact: !!wsData.notify_new_contact,
          notify_new_booking: !!wsData.notify_new_booking,
          notify_complaint: !!wsData.notify_complaint,
          notify_daily_summary: !!wsData.notify_daily_summary,
        });
      }
    } catch (e) {}
  };
  useEffect(() => {
    setProfile({ full_name: user?.full_name || "", avatar_color: user?.avatar_color || "#8549DE" });
    load();
  }, [user]);

  const assignAccount = async (userId, accountId) => {
    try {
      await base44.entities.User.update(userId, { account_id: accountId === "none" ? "" : accountId });
      await logActivity("Account hozzárendelve egy felhasználóhoz", "update", "User", userId);
      // Az ügyfél szerepű munkatárs accounthoz rendelésekor az ügyfél bekerül az Ügyfelek fülre.
      const member = users.find(u => u.id === userId);
      const account = accounts.find(a => a.id === accountId);
      if (account && member?.role !== "admin") await syncClientFromAccount(account).catch(() => null);
      load();
    } catch (e) { alert(e.message); }
  };

  const invite = async () => {
    if (!inviteEmail.trim()) return;
    try {
      await base44.users.inviteUser(inviteEmail.trim(), inviteRole);
      await logActivity(`Meghíva: ${inviteEmail} — ${ROLE_LABELS[inviteRole] || inviteRole}`, "create", "User");
      setInviteEmail(""); load();
    } catch (e) { alert(e.message); }
  };

  const saveProfile = async () => {
    setSaving(true);
    try {
      await base44.auth.updateMe({ full_name: profile.full_name, avatar_color: profile.avatar_color });
      await logActivity("Profil frissítve", "update", "User");
      setSaving(false);
    } catch (e) { alert(e.message); setSaving(false); }
  };

  const deleteAccount = async () => {
    setDeleting(true);
    try {
      await base44.functions.invoke("crmDeleteAccount", {});
      logout();
    } catch (e) {
      setDeleting(false);
      setDeleteStep(0);
      alert(e?.response?.data?.error || e?.message || "A fiók törlése nem sikerült.");
    }
  };

  const saveGoals = async () => {
    setSaving(true);
    try {
      if (goals?.id) await base44.entities.Goals.update(goals.id, goalsForm);
      else { const g = await base44.entities.Goals.create(goalsForm); setGoals(g); }
      load(); setSaving(false);
    } catch (e) { alert(e.message); setSaving(false); }
  };

  const saveSender = async () => {
    setSaving(true);
    try {
      const saved = await saveWorkspaceSettings(ws, wsForm);
      setWs(saved);
      await logActivity("Küldési beállítások frissítve", "update", "WorkspaceSettings");
      setSaving(false);
    } catch (e) { alert(e.message); setSaving(false); }
  };

  const saveNotifications = async () => {
    setSaving(true);
    try {
      const payload = {
        notify_new_contact: wsForm.notify_new_contact,
        notify_new_booking: wsForm.notify_new_booking,
        notify_complaint: wsForm.notify_complaint,
        notify_daily_summary: wsForm.notify_daily_summary,
      };
      const saved = await saveWorkspaceSettings(ws, payload);
      setWs(saved);
      setSaving(false);
    } catch (e) { alert(e.message); setSaving(false); }
  };

  // A Stripe valós állapota a szerverről jön (nem kézi kapcsoló): be van-e kötve a Base44 Payments.
  const checkStripe = async () => {
    setStripe((s) => ({ ...s, loading: true }));
    try {
      const res = await base44.functions.invoke("crmContractSend", { action: "payments_status" });
      setStripe({ loading: false, connected: res.data?.connected ?? null, error: res.data?.error || "" });
    } catch (e) {
      setStripe({ loading: false, connected: null, error: e?.response?.data?.error || e.message || "ismeretlen hiba" });
    }
  };
  useEffect(() => { checkStripe(); }, []);

  const newIntegrationToken = () => `${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 6)}`;

  const updateIntegration = async (provider, patch) => {
    const existing = integrations.find(i => i.provider === provider);
    if (!existing) return;
    try {
      await base44.entities.Integration.update(existing.id, patch);
      load();
    } catch (e) { alert(e.message); }
  };

  const toggleIntegration = async (provider) => {
    const existing = integrations.find(i => i.provider === provider);
    const newStatus = existing?.status === "connected" ? "disconnected" : "connected";
    try {
      if (existing) await base44.entities.Integration.update(existing.id, { status: newStatus, last_synced_at: new Date().toISOString() });
      else await base44.entities.Integration.create({
        provider, status: newStatus, last_synced_at: new Date().toISOString(),
        webhook_url: `https://api.base44.app/webhook/${provider}-${Math.random().toString(36).slice(2, 10)}`,
        token: provider === "meta_lead_ads" ? newIntegrationToken() : "",
      });
      await logActivity(`${newStatus === "connected" ? "Csatlakoztatva" : "Leválasztva"}: ${provider}`, "update", "Integration");
      load();
    } catch (e) { alert(e.message); }
  };

  const copyUrl = (url) => { navigator.clipboard?.writeText(url); setCopied(url); setTimeout(() => setCopied(""), 2000); };

  const resetData = async () => {
    setSaving(true);
    try {
      await Promise.all([
        base44.entities.Client.deleteMany({}),
        base44.entities.Complaint.deleteMany({}),
        base44.entities.Task.deleteMany({}),
        base44.entities.Lead.deleteMany({}),
        base44.entities.SalesEvent.deleteMany({}),
        base44.entities.AdSpend.deleteMany({}),
        base44.entities.ActivityLog.deleteMany({}),
        base44.entities.ClientFile.deleteMany({}),
      ]);
      await logActivity("Munkaterület adatainak visszaállítása", "delete", "system");
      load(); setSaving(false);
    } catch (e) { alert(e.message); setSaving(false); }
  };

  const integCards = [
    { provider: "meta_lead_ads", name: "Meta Lead Ads", desc: "Lead-ek automatikus létrehozása Meta hirdetésekből" },
    { provider: "stripe", name: "Stripe", desc: "Sikeres fizetések és visszatérítések szinkronizálása" },
    { provider: "webhook", name: "Bejövő Webhook", desc: "Általános JSON payload Zapier/Make-hez" },
  ];

  return (
    <div>
      <PageHeader title="Beállítások" subtitle="Csapat, profil, célok és integrációk kezelése" />

      <Tabs defaultValue="team">
        <div className="mb-4 overflow-x-auto pb-1 scrollbar-thin">
          <TabsList className="w-max">
          <TabsTrigger value="team"><UsersIcon className="mr-1.5 inline h-4 w-4" /> Csapat</TabsTrigger>
          <TabsTrigger value="profile"><User className="mr-1.5 inline h-4 w-4" /> Profil</TabsTrigger>
          <TabsTrigger value="goals"><Target className="mr-1.5 inline h-4 w-4" /> Célok</TabsTrigger>
          <TabsTrigger value="integrations"><Plug className="mr-1.5 inline h-4 w-4" /> Integrációk</TabsTrigger>
          <TabsTrigger value="sending"><Send className="mr-1.5 inline h-4 w-4" /> Küldés</TabsTrigger>
          <TabsTrigger value="notifications"><Bell className="mr-1.5 inline h-4 w-4" /> Értesítések</TabsTrigger>
          <TabsTrigger value="danger"><AlertTriangle className="mr-1.5 inline h-4 w-4" /> Veszélyzóna</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="team" className="mt-0">
          <div className="mb-4 rounded-2xl border border-border bg-card p-5 shadow-card">
            <h3 className="mb-3 font-heading font-semibold">Csapattag meghívása</h3>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="email@pelda.com" className="h-11 flex-1 sm:h-9" />
              <Select value={inviteRole} onValueChange={setInviteRole}>
                <SelectTrigger className="h-11 w-full sm:h-9 sm:w-[160px]"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="user">Ügyfél</SelectItem><SelectItem value="admin">Admin</SelectItem></SelectContent>
              </Select>
              <Button onClick={invite} className="h-11 w-full gradient-brand text-white sm:h-9 sm:w-auto"><Mail className="mr-1.5 h-4 w-4" /> Meghívás</Button>
            </div>
          </div>
          <TeamMemberList
            members={users}
            accounts={accounts}
            roleLabels={ROLE_LABELS}
            onAssignAccount={assignAccount}
          />
        </TabsContent>

        <TabsContent value="profile" className="mt-0">
          <div className="max-w-lg rounded-2xl border border-border bg-card p-5 shadow-card">
            <h3 className="mb-4 font-heading font-semibold">Profilod</h3>
            <div className="space-y-4">
              <div><Label>Teljes név</Label><Input value={profile.full_name} onChange={e => setProfile({ ...profile, full_name: e.target.value })} className="mt-1.5" /></div>
              <div><Label>E-mail</Label><Input value={user?.email || ""} disabled className="mt-1.5 opacity-60" /></div>
              <div>
                <Label>Avatar szín</Label>
                <div className="mt-2 flex gap-2">
                  {AVATAR_COLORS.map(c => (
                    <button key={c} onClick={() => setProfile({ ...profile, avatar_color: c })} className={cn("h-8 w-8 rounded-full ring-2 ring-offset-2 ring-offset-card transition-all", profile.avatar_color === c ? "ring-primary" : "ring-transparent")} style={{ background: c }} />
                  ))}
                </div>
              </div>
              <div>
                <Label>Téma beállítás</Label>
                <div className="mt-2 flex gap-2">
                  {["light", "dark", "system"].map(t => (
                    <button key={t} onClick={() => setTheme(t)} className={cn("rounded-lg border px-4 py-2 text-sm font-medium transition-colors", theme === t ? "gradient-brand border-transparent text-white" : "border-border hover:bg-accent")}>{THEME_LABELS[t]}</button>
                  ))}
                </div>
              </div>
              <Button onClick={saveProfile} disabled={saving} className="h-11 w-full gradient-brand text-white sm:h-9 sm:w-auto">{saving ? "Mentés…" : "Profil mentése"}</Button>
            </div>

            <div className="mt-5 border-t border-border pt-5">
              <Label className="text-red-600 dark:text-red-400">Fiók törlése</Label>
              <p className="mt-1.5 text-xs text-muted-foreground">
                A fiók és a profil véglegesen törlődik, a hozzáférésed azonnal megszűnik. Ez a művelet nem visszavonható.
              </p>
              <Button variant="destructive" onClick={() => setDeleteStep(1)} className="mt-3 h-11 w-full sm:h-9 sm:w-auto">
                <Trash2 className="mr-1.5 h-4 w-4" /> Fiók törlése
              </Button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="goals" className="mt-0">
          <div className="max-w-lg rounded-2xl border border-border bg-card p-5 shadow-card">
            <h3 className="mb-4 font-heading font-semibold">Havi célok</h3>
            <div className="space-y-4">
              <div><Label>Cash cél (Ft)</Label><Input type="number" value={goalsForm.cash_target} onChange={e => setGoalsForm({ ...goalsForm, cash_target: Number(e.target.value) })} className="mt-1.5" /></div>
              <div><Label>Lezárt üzletek célja</Label><Input type="number" value={goalsForm.closed_deals_target} onChange={e => setGoalsForm({ ...goalsForm, closed_deals_target: Number(e.target.value) })} className="mt-1.5" /></div>
              <div><Label>Lefoglalt meetingek célja</Label><Input type="number" value={goalsForm.booked_meetings_target} onChange={e => setGoalsForm({ ...goalsForm, booked_meetings_target: Number(e.target.value) })} className="mt-1.5" /></div>
              <div><Label>Havi jutalék (Ft)</Label><Input type="number" value={goalsForm.monthly_commission} onChange={e => setGoalsForm({ ...goalsForm, monthly_commission: Number(e.target.value) })} className="mt-1.5" /></div>
              <Button onClick={saveGoals} disabled={saving} className="h-11 w-full gradient-brand text-white sm:h-9 sm:w-auto">{saving ? "Mentés…" : "Célok mentése"}</Button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="integrations" className="mt-0">
          <div className="grid gap-4 md:grid-cols-3">
            {integCards.map(ic => {
              const integ = integrations.find(i => i.provider === ic.provider);
              const isStripe = ic.provider === "stripe";
              const status = isStripe ? (stripe.connected ? "connected" : "disconnected") : (integ?.status || "disconnected");
              return (
                <div key={ic.provider} className="rounded-2xl border border-border bg-card p-5 shadow-card">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl gradient-brand-soft text-primary"><Plug className="h-5 w-5" /></div>
                    <StatusBadge status={status} />
                  </div>
                  <h3 className="font-heading font-semibold">{ic.name}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{ic.desc}</p>
                  {integ?.webhook_url && !isStripe && (
                    <div className="mt-3 flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-2 py-1.5">
                      <span className="flex-1 truncate text-xs text-muted-foreground">{integ.webhook_url}</span>
                      <button onClick={() => copyUrl(integ.webhook_url)} className="text-muted-foreground hover:text-foreground">{copied === integ.webhook_url ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}</button>
                    </div>
                  )}
                  {isStripe && (
                    <div className="mt-3 rounded-xl border border-border p-3 text-xs text-muted-foreground">
                      {stripe.loading ? "Állapot ellenőrzése…"
                        : stripe.connected ? "A fizetés a nyilvános Portal appban van bekötve: az aláírt szerződésekhez automatikus Stripe fizetési link készül (HUF), a befizetések és visszatérítések 5 percenként átkerülnek az Értékesítés riportba. Teszt vagy éles módban fut-e, azt a Portal app Payments oldalán látod."
                        : stripe.connected === false ? "A Stripe még nincs bekötve a Portal appban (a Base44-ben a Portal app Payments részén kell). Addig az ajánlatnál megadott kézi fizetési link használható."
                        : `Az állapot nem ellenőrizhető: ${stripe.error}`}
                    </div>
                  )}
                  {integ?.last_synced_at && !isStripe && <p className="mt-2 text-xs text-muted-foreground">Utoljára szinkronizálva: {formatDateTime(integ.last_synced_at)}</p>}
                  {ic.provider === "meta_lead_ads" && integ && (
                    <div className="mt-3 space-y-2 rounded-xl border border-border p-3">
                      <div>
                        <Label className="text-xs">Melyik account kapja a Meta leadeket?</Label>
                        <Select value={integ.account_id || "none"} onValueChange={(v) => updateIntegration("meta_lead_ads", { account_id: v === "none" ? "" : v })}>
                          <SelectTrigger className="mt-1.5"><SelectValue placeholder="Nincs" /></SelectTrigger>
                          <SelectContent><SelectItem value="none">Nincs</SelectItem>{accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      {integ.token && (
                        <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-2 py-1.5">
                          <span className="flex-1 truncate text-xs text-muted-foreground">{integ.token}</span>
                          <button onClick={() => copyUrl(integ.token)} className="text-muted-foreground hover:text-foreground">
                            {copied === integ.token ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                          </button>
                        </div>
                      )}
                      <p className="text-[11px] text-muted-foreground">
                        A Meta űrlap külön hozzájárulás mezőjét a marketing_consent kulccsal add át — csak igennel küldünk marketing e-mailt.
                      </p>
                    </div>
                  )}
                  {isStripe ? (
                    <Button onClick={checkStripe} variant="outline" disabled={stripe.loading} className="mt-3 w-full">Állapot ellenőrzése</Button>
                  ) : (
                    <Button onClick={() => toggleIntegration(ic.provider)} variant={status === "connected" ? "outline" : "default"} className={cn("mt-3 w-full", status !== "connected" && "gradient-brand text-white")}>
                      {status === "connected" ? "Leválasztás" : "Csatlakoztatás"}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="sending" className="mt-0">
          <div className="grid max-w-3xl gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
              <h3 className="mb-1 font-heading font-semibold">E-mail feladó</h3>
              <p className="mb-4 text-xs text-muted-foreground">Ha üresen hagyod, a rendszer saját küldési infrastruktúrája használatos — így azonnal működik.</p>
              <div className="space-y-3">
                <div><Label>Feladó név</Label><Input value={wsForm.email_from_name} onChange={e => setWsForm({ ...wsForm, email_from_name: e.target.value })} placeholder="FunnelFlow" className="mt-1.5" /></div>
                <div><Label>Feladó e-mail cím</Label><Input value={wsForm.email_from_email} onChange={e => setWsForm({ ...wsForm, email_from_email: e.target.value })} placeholder="hello@cegem.hu" className="mt-1.5" /></div>
                <div><Label>Saját domain</Label><Input value={wsForm.email_domain} onChange={e => setWsForm({ ...wsForm, email_domain: e.target.value })} placeholder="cegem.hu" className="mt-1.5" /></div>
              </div>
            </div>
            <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
              <h3 className="mb-1 font-heading font-semibold">SMS feladó</h3>
              <p className="mb-4 text-xs text-muted-foreground">
                SMS küldés csak akkor indul el, ha a Twilio kulcsok (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER)
                be vannak állítva, és itt be van kapcsolva. Kikapcsolva az SMS lépések és az SMS kampányok letiltottak.
              </p>
              <div className="space-y-3">
                <div><Label>Feladó név</Label><Input value={wsForm.sms_from_name} onChange={e => setWsForm({ ...wsForm, sms_from_name: e.target.value })} placeholder="FunnelFlow" className="mt-1.5" /></div>
                <div className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2">
                  <span className="text-xs font-medium">SMS küldés engedélyezése</span>
                  <Switch checked={!!wsForm.sms_enabled} onCheckedChange={v => setWsForm({ ...wsForm, sms_enabled: v })} />
                </div>
                <div className="flex items-center gap-2 rounded-xl bg-muted/60 px-3 py-2">
                  <Smartphone className="h-4 w-4 text-primary" />
                  <span className="text-xs text-muted-foreground">Az SMS kimenő napló a kontakt idővonalán is megjelenik.</span>
                </div>
              </div>
            </div>
          </div>
          <div className="mt-4"><Button onClick={saveSender} disabled={saving} className="h-11 w-full gradient-brand text-white sm:h-9 sm:w-auto">{saving ? "Mentés…" : "Küldési beállítások mentése"}</Button></div>
          <div className="mt-4"><BookingEmailSettings /></div>
        </TabsContent>

        <TabsContent value="notifications" className="mt-0">
          <div className="max-w-lg rounded-2xl border border-border bg-card p-5 shadow-card">
            <h3 className="mb-4 font-heading font-semibold">Értesítési preferenciák</h3>
            <div className="space-y-3">
              {[
                ["notify_new_contact", "Új kontakt vagy űrlapkitöltés", "E-mail értesítés a megadott feladó címre"],
                ["notify_new_booking", "Új időpontfoglalás", "Azonnali értesítés minden új foglalásról"],
                ["notify_complaint", "Új panasz", "Ha ügyfél panasza érkezik"],
                ["notify_daily_summary", "Napi összefoglaló", "Összegzés a napi foglalásokról és kontaktokról"],
              ].map(([key, title, desc]) => (
                <div key={key} className="flex items-start justify-between gap-3 rounded-xl border border-border p-3">
                  <div>
                    <div className="text-sm font-medium">{title}</div>
                    <div className="text-xs text-muted-foreground">{desc}</div>
                  </div>
                  <Switch checked={!!wsForm[key]} onCheckedChange={v => setWsForm({ ...wsForm, [key]: v })} />
                </div>
              ))}
            </div>
            <Button onClick={saveNotifications} disabled={saving} className="mt-4 h-11 w-full gradient-brand text-white sm:h-9 sm:w-auto">{saving ? "Mentés…" : "Értesítések mentése"}</Button>
          </div>
        </TabsContent>

        <TabsContent value="danger" className="mt-0">
          <div className="max-w-lg rounded-2xl border-2 border-red-200 bg-card p-5 dark:border-red-500/30">
            <div className="flex items-center gap-2 text-red-600"><AlertTriangle className="h-5 w-5" /><h3 className="font-heading font-semibold">Minden adat visszaállítása</h3></div>
            <p className="mt-2 text-sm text-muted-foreground">Ez véglegesen törli az összes ügyfelet, panaszt, feladatot, lead-et, értékesítési eseményt és tevékenységi naplót ebben a munkaterületen. Ez nem visszavonható.</p>
            <div className="mt-4"><TwoStepDelete label="Minden adat visszaállítása" size="md" onDelete={resetData} className="w-full justify-center py-2.5 text-sm sm:w-auto" /></div>
          </div>
        </TabsContent>
      </Tabs>

      <Modal
        open={deleteStep > 0}
        onClose={() => !deleting && setDeleteStep(0)}
        title="Fiók törlése"
        description="A biztonság kedvéért két megerősítést kérünk."
        size="sm"
        footer={deleteStep === 1 ? (
          <>
            <Button variant="outline" onClick={() => setDeleteStep(0)}>Mégse</Button>
            <Button variant="destructive" onClick={() => setDeleteStep(2)}>Tovább</Button>
          </>
        ) : (
          <>
            <Button variant="outline" onClick={() => setDeleteStep(0)} disabled={deleting}>Mégse</Button>
            <Button variant="destructive" onClick={deleteAccount} disabled={deleting}>
              {deleting ? "Törlés…" : "Fiók végleges törlése"}
            </Button>
          </>
        )}
      >
        {deleteStep === 1 ? (
          <p className="text-sm text-muted-foreground">
            Biztosan törölni szeretnéd a fiókodat? A profilod és a hozzáférésed megszűnik.
          </p>
        ) : (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">
            <AlertTriangle className="mr-1.5 inline h-4 w-4" />
            Utolsó megerősítés: a fiók <strong>véglegesen</strong> törlődik, ezt nem lehet visszavonni.
          </div>
        )}
      </Modal>
    </div>
  );
}