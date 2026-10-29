import React, { useEffect, useState } from "react";
import { Send, Mail, MessageSquare, Plus, Clock } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import Modal from "@/components/Modal";
import TwoStepDelete from "@/components/TwoStepDelete";
import SettingQuestions, { SETTING_QUESTIONS } from "@/components/crm/SettingQuestions";
import BookingTab from "@/components/crm/BookingTab";
import ContractSender from "@/components/crm/ContractSender";
import { SOURCE_OPTIONS, triggerAutomations } from "@/lib/crm";
import { formatDateTime, initials } from "@/lib/format";
import { cn } from "@/lib/utils";

const EMPTY = {
  name: "", email: "", phone: "", company: "", industry: "", source: "Website",
  tags: [], notes: "", stage_id: "", owner_id: "", account_id: "",
  marketing_consent: false, unsubscribed: false,
};

function answersToMap(list) {
  const map = {};
  (list || []).forEach((a) => { map[a.key || a.question] = a.answer || ""; });
  return map;
}

function mapToAnswers(map) {
  return SETTING_QUESTIONS
    .map((q) => ({ key: q.key, question: q.question, answer: (map[q.key] || "").trim() }))
    .filter((a) => a.answer);
}

function statusClass(status) {
  if (status === "sent") return "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400";
  if (status === "failed") return "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400";
  return "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400";
}

export default function ContactDialog({ open, onClose, contact, accounts, stages, users, onSaved, defaultAccountId }) {
  const [form, setForm] = useState(EMPTY);
  const [tab, setTab] = useState("data");
  const [tagText, setTagText] = useState("");
  const [noteText, setNoteText] = useState("");
  const [answers, setAnswers] = useState({});
  const [messages, setMessages] = useState([]);
  const [saving, setSaving] = useState(false);
  const [sendForm, setSendForm] = useState({ channel: "email", subject: "", body: "" });
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState(null);

  useEffect(() => {
    if (!open) return;
    setTab("data");
    setSendResult(null);
    setNoteText("");
    if (contact) {
      setForm({ ...EMPTY, ...contact, tags: contact.tags || [] });
      setTagText((contact.tags || []).join(", "));
      setAnswers(answersToMap(contact.setting_answers));
      base44.entities.MessageLog.filter({ contact_id: contact.id }, "-created_date", 50)
        .then(setMessages).catch(() => setMessages([]));
    } else {
      setForm({ ...EMPTY, account_id: defaultAccountId || "", stage_id: stages[0]?.id || "" });
      setTagText("");
      setAnswers({});
      setMessages([]);
    }
  }, [open, contact]);

  const save = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    const tags = tagText.split(",").map((t) => t.trim()).filter(Boolean);
    const payload = {
      name: form.name.trim(), email: form.email, phone: form.phone, company: form.company,
      industry: form.industry, source: form.source, notes: form.notes, tags,
      stage_id: form.stage_id, owner_id: form.owner_id, account_id: form.account_id,
      marketing_consent: !!form.marketing_consent, unsubscribed: !!form.unsubscribed,
      setting_answers: mapToAnswers(answers),
    };
    try {
      if (contact) {
        const stageChanged = contact.stage_id !== form.stage_id;
        const stageName = stages.find((s) => s.id === form.stage_id)?.name || "";
        const previous = answersToMap(contact.setting_answers);
        const answerLogs = mapToAnswers(answers)
          .filter((a) => (previous[a.key] || "").trim() !== a.answer)
          .map((a) => `Setting kérdés — ${a.question} ${a.answer}`);
        const newEntries = [...(stageChanged ? [`Fázis módosítva: ${stageName}`] : []), ...answerLogs];
        const activity = newEntries.length ? [...(contact.activity || []), ...newEntries] : undefined;
        await base44.entities.Contact.update(contact.id, { ...payload, ...(activity ? { activity } : {}) });
        if (stageChanged) await triggerAutomations("stage_changed", contact.id, { stage_id: form.stage_id });
      } else {
        const created = await base44.entities.Contact.create({
          ...payload, activity: ["Kontakt létrehozva"],
        });
        await triggerAutomations("contact_created", created.id, {});
      }
      onClose();
      onSaved && onSaved();
    } catch (e) { alert(e.message); } finally { setSaving(false); }
  };

  const remove = async () => {
    await base44.entities.Contact.delete(contact.id);
    onClose();
    onSaved && onSaved();
  };

  const addNote = async () => {
    if (!noteText.trim() || !contact) return;
    const activity = [...(contact.activity || []), `Jegyzet: ${noteText.trim()}`];
    await base44.entities.Contact.update(contact.id, { activity });
    setNoteText("");
    onSaved && onSaved();
  };

  const sendNow = async () => {
    if (!contact) return;
    setSending(true);
    try {
      const res = await base44.functions.invoke("crmAutomationEngine", {
        action: "send_message", contact_id: contact.id, channel: sendForm.channel,
        subject: sendForm.subject || `Üzenet — ${contact.name}`, body: sendForm.body,
      });
      setSendResult(res.data);
      const list = await base44.entities.MessageLog.filter({ contact_id: contact.id }, "-created_date", 50);
      setMessages(list);
      onSaved && onSaved();
    } catch (e) { setSendResult({ status: "failed", error: e.message }); } finally { setSending(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title={contact ? "Kontakt" : "Új kontakt"} size="lg"
      footer={<>
        <Button variant="outline" onClick={onClose}>Bezárás</Button>
        {contact && <TwoStepDelete onDelete={remove} />}
        <Button onClick={save} disabled={saving} className="gradient-brand text-white">{saving ? "Mentés…" : "Mentés"}</Button>
      </>}>
      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="flex gap-1 overflow-x-auto rounded-xl border border-border p-0.5 scrollbar-thin sm:w-44 sm:shrink-0 sm:flex-col sm:overflow-visible">
          {[["data", "Adatok"], ["timeline", "Idővonal"], ["booking", "Időpont"], ["contract", "Szerződés"], ["messages", "Üzenetek"], ["setting", "Setting kérdések"]].map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)}
              className={cn("shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-left text-sm font-medium transition-colors sm:w-full", tab === key ? "gradient-brand text-white" : "text-muted-foreground hover:bg-accent")}>
              {label}
            </button>
          ))}
        </div>
        <div className="min-w-0 flex-1">

      {tab === "data" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div><Label>Név *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1.5" /></div>
            <div><Label>Account</Label>
              <Select value={form.account_id || "none"} onValueChange={(v) => setForm({ ...form, account_id: v === "none" ? "" : v })}>
                <SelectTrigger className="mt-1.5"><SelectValue placeholder="Nincs" /></SelectTrigger>
                <SelectContent><SelectItem value="none">Nincs</SelectItem>{accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div><Label>E-mail</Label><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="mt-1.5" /></div>
            <div><Label>Telefon</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="mt-1.5" /></div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div><Label>Cégnév</Label><Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} className="mt-1.5" /></div>
            <div><Label>Iparág</Label><Input value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} className="mt-1.5" /></div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div><Label>Forrás</Label>
              <Select value={form.source} onValueChange={(v) => setForm({ ...form, source: v })}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>{SOURCE_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Fázis</Label>
              <Select value={form.stage_id || "none"} onValueChange={(v) => setForm({ ...form, stage_id: v === "none" ? "" : v })}>
                <SelectTrigger className="mt-1.5"><SelectValue placeholder="Nincs" /></SelectTrigger>
                <SelectContent><SelectItem value="none">Nincs</SelectItem>{stages.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Felelős</Label>
              <Select value={form.owner_id || "none"} onValueChange={(v) => setForm({ ...form, owner_id: v === "none" ? "" : v })}>
                <SelectTrigger className="mt-1.5"><SelectValue placeholder="Nincs" /></SelectTrigger>
                <SelectContent><SelectItem value="none">Nincs</SelectItem>{users.map((u) => <SelectItem key={u.id} value={u.id}>{u.full_name || u.email}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex items-start justify-between gap-3 rounded-xl border border-border px-3 py-2">
              <div>
                <div className="text-sm font-medium">Marketing hozzájárulás</div>
                <div className="text-xs text-muted-foreground">Csak igennel küldhető marketing e-mail</div>
              </div>
              <Switch checked={!!form.marketing_consent} onCheckedChange={(v) => setForm({ ...form, marketing_consent: v })} />
            </div>
            <div className="flex items-start justify-between gap-3 rounded-xl border border-border px-3 py-2">
              <div>
                <div className="text-sm font-medium">Leiratkozott</div>
                <div className="text-xs text-muted-foreground">Nem kaphat marketing üzenetet</div>
              </div>
              <Switch checked={!!form.unsubscribed} onCheckedChange={(v) => setForm({ ...form, unsubscribed: v })} />
            </div>
          </div>
          <div><Label>Címkék (vesszővel elválasztva)</Label>
            <Input value={tagText} onChange={(e) => setTagText(e.target.value)} placeholder="vip, visszatérő" className="mt-1.5" />
          </div>
          <div><Label>Jegyzetek</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} className="mt-1.5" /></div>
        </div>
      )}

      {tab === "timeline" && (
        <div>
          {contact ? (
            <>
              <div className="max-h-72 space-y-2 overflow-y-auto scrollbar-thin">
                {[...(contact.activity || [])].reverse().map((entry, i) => (
                  <div key={i} className="flex gap-3">
                    <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full gradient-brand" />
                    <p className="text-sm">{entry}</p>
                  </div>
                ))}
                <div className="flex gap-3">
                  <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-border" />
                  <p className="text-sm text-muted-foreground">Kontakt létrehozva — {formatDateTime(contact.created_date)}</p>
                </div>
                {(contact.activity || []).length === 0 && <p className="text-sm text-muted-foreground">Még nincs esemény.</p>}
              </div>
              <div className="mt-4 flex gap-2">
                <Input value={noteText} onChange={(e) => setNoteText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addNote(); } }}
                  placeholder="Jegyzet hozzáadása…" />
                <Button size="sm" onClick={addNote}><Plus className="h-4 w-4" /></Button>
              </div>
            </>
          ) : <p className="text-sm text-muted-foreground">Mentés után jelenik meg az idővonal.</p>}
        </div>
      )}

      {tab === "messages" && (
        <div className="space-y-4">
          {contact ? (
            <>
              <div className="rounded-xl border border-border p-3">
                <div className="mb-2 flex gap-1 rounded-lg border border-border p-0.5">
                  {[["email", "E-mail"], ["sms", "SMS"]].map(([key, label]) => (
                    <button key={key} onClick={() => setSendForm({ ...sendForm, channel: key })}
                      className={cn("flex-1 rounded-md px-3 py-1.5 text-sm font-medium", sendForm.channel === key ? "gradient-brand text-white" : "text-muted-foreground")}>
                      {key === "email" ? <Mail className="mr-1 inline h-3.5 w-3.5" /> : <MessageSquare className="mr-1 inline h-3.5 w-3.5" />}{label}
                    </button>
                  ))}
                </div>
                {sendForm.channel === "email" && (
                  <Input value={sendForm.subject} onChange={(e) => setSendForm({ ...sendForm, subject: e.target.value })} placeholder="Tárgy" className="mb-2" />
                )}
                <Textarea value={sendForm.body} onChange={(e) => setSendForm({ ...sendForm, body: e.target.value })} rows={3}
                  placeholder="Üzenet szövege — használhatod: {{nev}}, {{ceg}}" />
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{sendForm.channel === "email" ? contact.email || "nincs e-mail cím" : contact.phone || "nincs telefonszám"}</span>
                  <Button size="sm" onClick={sendNow} disabled={sending} className="gradient-brand text-white">
                    <Send className="mr-1 h-3.5 w-3.5" /> {sending ? "Küldés…" : "Küldés"}
                  </Button>
                </div>
                {sendResult && (
                  <p className={cn("mt-2 rounded-lg px-2 py-1 text-xs", statusClass(sendResult.status))}>
                    {sendResult.status === "sent" ? "Elküldve" : sendResult.status === "queued" ? "Sorban áll" : "Sikertelen"}
                    {sendResult.error ? ` — ${sendResult.error}` : ""}
                  </p>
                )}
              </div>

              <div className="max-h-64 space-y-2 overflow-y-auto scrollbar-thin">
                {messages.length === 0 ? <p className="text-sm text-muted-foreground">Még nem küldtünk üzenetet ennek a kontaktnak.</p> :
                  messages.map((m) => (
                    <div key={m.id} className="rounded-xl border border-border p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-1.5 text-sm font-medium">
                          {m.channel === "sms" ? <MessageSquare className="h-3.5 w-3.5" /> : <Mail className="h-3.5 w-3.5" />}
                          {m.subject || "SMS"}
                        </span>
                        <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", statusClass(m.status))}>{m.status}</span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{m.body}</p>
                      <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground"><Clock className="h-3 w-3" /> {formatDateTime(m.created_date)}</p>
                      {m.error && <p className="mt-1 text-[11px] text-red-500">{m.error}</p>}
                    </div>
                  ))}
              </div>
            </>
          ) : <p className="text-sm text-muted-foreground">Mentés után küldhetsz üzenetet.</p>}
        </div>
      )}

      {tab === "booking" && (
        contact
          ? <BookingTab contact={contact} users={users} onSaved={onSaved} />
          : <p className="text-sm text-muted-foreground">Mentés után foglalhatsz időpontot.</p>
      )}

      {tab === "contract" && (
        contact
          ? <ContractSender contact={contact} />
          : <p className="text-sm text-muted-foreground">Mentés után küldhetsz szerződést.</p>
      )}

      {tab === "setting" && (
        contact
          ? <SettingQuestions answers={answers} onChange={setAnswers} />
          : <p className="text-sm text-muted-foreground">Mentés után tölthetők ki a setting kérdések.</p>
      )}
        </div>
      </div>
    </Modal>
  );
}