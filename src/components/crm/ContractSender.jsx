import React, { useEffect, useMemo, useState } from "react";
import { Send, Copy, Check, ExternalLink, RefreshCw, FileSignature } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import Modal from "@/components/Modal";
import TwoStepDelete from "@/components/TwoStepDelete";
import { getWorkspaceSettings } from "@/lib/crm";
import {
  CONTRACT_STATUS, PAYMENT_STATUS, ft, contractLink, hasPlaceholders, renderPreview, callContractSend,
} from "@/lib/contracts";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const VALID_DAY_OPTIONS = [3, 7, 14, 30];

function previewVars(contact, offer, setupFee, monthlyFee, settings) {
  return {
    nev: contact?.name || "",
    ceg: contact?.company || contact?.name || "",
    email: contact?.email || "",
    csomag: offer?.name || "",
    setup_dij: ft(setupFee),
    havi_dij: ft(monthlyFee),
    tartalom: (offer?.services || []).map((s) => `- ${s}`).join("\n"),
    datum: new Date().toISOString().slice(0, 10),
    szolgaltato: settings?.email_from_name || "",
  };
}

// Szerződés küldése egy kontaktnak: ajánlatkártyák, szerkeszthető díjak, e-mail és másolható link.
export default function ContractSender({ contact, bookingId = "" }) {
  const [offers, setOffers] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [offerId, setOfferId] = useState("");
  const [setupFee, setSetupFee] = useState(0);
  const [monthlyFee, setMonthlyFee] = useState(0);
  const [validDays, setValidDays] = useState(7);
  const [sendMail, setSendMail] = useState(true);
  const [paymentUrl, setPaymentUrl] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [showBody, setShowBody] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [copied, setCopied] = useState("");

  const loadContracts = async () => {
    if (!contact?.id) return;
    const list = await base44.entities.Contract.filter({ contact_id: contact.id }, "-created_date", 20).catch(() => []);
    setContracts(list);
  };

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      const [o, s] = await Promise.all([
        base44.entities.Offer.list("-created_date", 100).catch(() => []),
        getWorkspaceSettings().catch(() => null),
      ]);
      if (!active) return;
      setOffers(o.filter((x) => x.active !== false));
      setSettings(s);
      await loadContracts();
      if (active) setLoading(false);
    })();
    setOfferId(""); setResult(null); setError("");
    setSendMail(!!contact?.email);
    return () => { active = false; };
  }, [contact?.id]);

  const offer = offers.find((o) => o.id === offerId) || null;

  const choose = (o) => {
    setOfferId(o.id);
    setSetupFee(o.setup_fee || 0);
    setMonthlyFee(o.monthly_fee || 0);
    setPaymentUrl(o.payment_url || "");
    setBodyText(o.contract_template || "");
    setResult(null);
    setError("");
  };

  const preview = useMemo(
    () => renderPreview(bodyText, previewVars(contact, offer, setupFee, monthlyFee, settings)),
    [bodyText, contact, offer, setupFee, monthlyFee, settings]
  );

  const copy = async (key, text) => {
    try { await navigator.clipboard.writeText(text); } catch (e) { /* ignore */ }
    setCopied(key);
    setTimeout(() => setCopied(""), 2000);
  };

  const send = async () => {
    if (!offer) return;
    if (!bodyText.trim()) { setError("Az ajánlathoz nincs szerződésszöveg."); return; }
    if (hasPlaceholders(bodyText)
      && !window.confirm("A szerződésszövegben kitöltetlen [szögletes zárójeles] rész van. Biztosan elküldöd így?")) return;
    setBusy(true); setError(""); setResult(null);
    try {
      const data = await callContractSend({
        contact_id: contact.id,
        offer_id: offer.id,
        booking_id: bookingId || "",
        setup_fee: Number(setupFee) || 0,
        monthly_fee: Number(monthlyFee) || 0,
        valid_days: validDays,
        send_email: sendMail && !!contact.email,
        payment_url: paymentUrl.trim(),
        ...(bodyText !== (offer.contract_template || "") ? { body_override: bodyText } : {}),
      });
      setResult(data);
      await loadContracts();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  const resend = async (c) => {
    try {
      const data = await callContractSend({ action: "resend", contract_id: c.id, send_email: !!contact.email });
      setResult(data);
      await loadContracts();
    } catch (e) { setError(e.message); }
  };

  const cancel = async (c) => {
    try {
      await callContractSend({ action: "cancel", contract_id: c.id });
      await loadContracts();
    } catch (e) { setError(e.message); }
  };

  if (loading) return <div className="flex h-32 items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-4 border-primary/20 border-t-primary" /></div>;

  return (
    <div className="space-y-5">
      {contracts.length > 0 && (
        <div>
          <div className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Korábbi szerződések</div>
          <div className="space-y-2">
            {contracts.map((c) => {
              const st = CONTRACT_STATUS[c.status] || CONTRACT_STATUS.sent;
              const open = ["sent", "viewed"].includes(c.status);
              return (
                <div key={c.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-border px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{c.offer_name}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {ft(c.setup_fee)} + {ft(c.monthly_fee)}/hó · {c.signed_at ? `aláírva: ${formatDateTime(c.signed_at)}` : `elküldve: ${formatDateTime(c.sent_at || c.created_date)}`}
                    </div>
                  </div>
                  <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", st.cls)}>{st.label}</span>
                  {c.status === "signed" && (Number(c.setup_fee) > 0 || Number(c.monthly_fee) > 0) && (() => {
                    const ps = PAYMENT_STATUS[c.payment_status || "none"] || PAYMENT_STATUS.none;
                    return <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", ps.cls)}>{ps.label}</span>;
                  })()}
                  {c.status === "signed" && (
                    <Button size="sm" variant="outline" onClick={() => copy(c.id, contractLink(c))}>
                      {copied === c.id ? <Check className="mr-1 h-3.5 w-3.5" /> : <Copy className="mr-1 h-3.5 w-3.5" />} Link
                    </Button>
                  )}
                  {open && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => copy(c.id, contractLink(c))}>
                        {copied === c.id ? <Check className="mr-1 h-3.5 w-3.5" /> : <Copy className="mr-1 h-3.5 w-3.5" />} Link
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => resend(c)}><RefreshCw className="mr-1 h-3.5 w-3.5" /> Újraküldés</Button>
                      <TwoStepDelete onDelete={() => cancel(c)} label="Visszavonás" />
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <div className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Válassz ajánlatot</div>
        {offers.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            Még nincs aktív ajánlat. Hozz létre egyet a Szerződések oldalon.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {offers.map((o) => (
              <button key={o.id} type="button" onClick={() => choose(o)}
                className={cn("rounded-2xl border p-4 text-left transition-all hover:-translate-y-0.5",
                  offerId === o.id ? "border-primary bg-primary/5 ring-2 ring-primary/30" : "border-border bg-card hover:border-primary/40")}>
                <div className="font-heading font-semibold">{o.name}</div>
                {o.description && <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{o.description}</div>}
                <div className="mt-3 text-sm"><span className="font-semibold">{ft(o.setup_fee)}</span> <span className="text-muted-foreground">setup</span></div>
                <div className="text-sm"><span className="font-semibold">{ft(o.monthly_fee)}</span> <span className="text-muted-foreground">/ hó</span></div>
                {(o.services || []).length > 0 && <div className="mt-2 text-[11px] text-muted-foreground">{o.services.length} tétel a csomagban</div>}
              </button>
            ))}
          </div>
        )}
      </div>

      {offer && (
        <div className="space-y-4 rounded-2xl border border-border p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div><Label>Setup díj (Ft)</Label><Input type="number" min="0" value={setupFee} onChange={(e) => setSetupFee(e.target.value)} className="mt-1.5" /></div>
            <div><Label>Havi díj (Ft)</Label><Input type="number" min="0" value={monthlyFee} onChange={(e) => setMonthlyFee(e.target.value)} className="mt-1.5" /></div>
            <div><Label>A link érvényes</Label>
              <select value={validDays} onChange={(e) => setValidDays(Number(e.target.value))}
                className="mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                {VALID_DAY_OPTIONS.map((d) => <option key={d} value={d}>{d} napig</option>)}
              </select>
            </div>
          </div>

          <div><Label>Fizetési link (opcionális, https://)</Label>
            <Input value={paymentUrl} onChange={(e) => setPaymentUrl(e.target.value)} className="mt-1.5" placeholder="https://" /></div>

          <div>
            <button type="button" onClick={() => setShowBody(!showBody)} className="text-xs font-medium text-primary hover:underline">
              {showBody ? "Szerződésszöveg elrejtése" : "Szerződésszöveg megtekintése és szerkesztése"}
            </button>
            {showBody && (
              <div className="mt-2 grid gap-3 lg:grid-cols-2">
                <Textarea value={bodyText} onChange={(e) => setBodyText(e.target.value)} rows={14} className="font-mono text-xs" />
                <div className="max-h-[22rem] overflow-y-auto whitespace-pre-wrap rounded-xl border border-border bg-muted/30 p-3 text-xs">{preview}</div>
              </div>
            )}
            {hasPlaceholders(bodyText) && (
              <p className="mt-2 rounded-lg bg-amber-100 px-2 py-1.5 text-xs text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
                A szövegben még van kitöltetlen [szögletes zárójeles] rész. Küldés előtt töltsd ki.
              </p>
            )}
          </div>

          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={sendMail && !!contact.email} disabled={!contact.email} onCheckedChange={(v) => setSendMail(!!v)} />
            {contact.email ? `Küldés e-mailben is: ${contact.email}` : "A kontaktnak nincs e-mail címe — a másolható linket használd."}
          </label>

          {error && <p className="rounded-lg bg-red-100 px-3 py-2 text-sm text-red-700 dark:bg-red-500/15 dark:text-red-400">{error}</p>}

          <div className="flex justify-end">
            <Button onClick={send} disabled={busy} className="gradient-brand text-white">
              <Send className="mr-1.5 h-4 w-4" /> {busy ? "Küldés…" : "Szerződés küldése"}
            </Button>
          </div>
        </div>
      )}

      {result && (
        <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-4 dark:border-emerald-500/40 dark:bg-emerald-500/10">
          <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
            <FileSignature className="h-4 w-4" /> A szerződés kész, a link élő
          </div>
          <p className="mt-1 text-xs text-emerald-700/80 dark:text-emerald-400/80">
            {result.email?.status === "sent" ? "Az e-mail elment." : result.email?.status === "failed" ? `Az e-mail nem ment ki: ${result.email.error}` : "E-mail nem ment ki."}
            {" "}A linket beírhatod a meeting chatbe, a lead pedig telefonról is aláírhatja.
          </p>
          <div className="mt-3 flex gap-2">
            <Input readOnly value={result.sign_url} onFocus={(e) => e.target.select()} className="bg-background text-xs" />
            <Button size="sm" onClick={() => copy("result", result.sign_url)}>
              {copied === "result" ? <Check className="mr-1 h-3.5 w-3.5" /> : <Copy className="mr-1 h-3.5 w-3.5" />} Másolás
            </Button>
            <Button size="sm" variant="outline" onClick={() => window.open(result.sign_url, "_blank")}><ExternalLink className="h-3.5 w-3.5" /></Button>
          </div>
        </div>
      )}
      {!result && error && !offer && <p className="rounded-lg bg-red-100 px-3 py-2 text-sm text-red-700 dark:bg-red-500/15 dark:text-red-400">{error}</p>}
    </div>
  );
}

// Önálló ablak a Foglalások oldalról (a meeting közben).
export function ContractSendModal({ open, onClose, contactId, bookingId = "" }) {
  const [contact, setContact] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !contactId) return;
    setContact(null); setError("");
    base44.entities.Contact.get(contactId).then(setContact).catch(() => setError("A kontakt nem található."));
  }, [open, contactId]);

  return (
    <Modal open={open} onClose={onClose} title={contact ? `Szerződés küldése — ${contact.name}` : "Szerződés küldése"} size="xl"
      footer={<Button variant="outline" onClick={onClose}>Bezárás</Button>}>
      {error ? <p className="text-sm text-red-600">{error}</p>
        : contact ? <ContractSender contact={contact} bookingId={bookingId} />
        : <div className="flex h-32 items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-4 border-primary/20 border-t-primary" /></div>}
    </Modal>
  );
}
