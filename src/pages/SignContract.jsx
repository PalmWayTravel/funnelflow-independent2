import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { CheckCircle2, Loader2, AlertTriangle, FileSignature, Printer, ExternalLink, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { callPortal, ft, formatDateTime } from "@/lib/contracts";

const BLOCKED = {
  expired: "Ez a szerződés lejárt. Kérj új linket attól, aki küldte.",
  cancelled: "Ez a szerződés már nem elérhető.",
  declined: "Ezt a szerződést elutasítottad.",
};

function Shell({ children }) {
  return (
    <div className="min-h-screen bg-muted/40 px-4 py-8 print:bg-white print:p-0">
      <div className="mx-auto w-full max-w-2xl">{children}</div>
    </div>
  );
}

// Nyilvános oldal: bejelentkezés nélkül nyitható, a hosszú véletlen link (token) az egyetlen azonosító.
export default function SignContract() {
  const { token } = useParams();
  const [state, setState] = useState({ loading: true, error: "", data: null });
  const [name, setName] = useState("");
  const [accept, setAccept] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState("");
  // A Stripe a fizetés után ?session_id=… paraméterrel hozza vissza a látogatót ide.
  const returnedFromPayment = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("session_id");

  const load = async () => {
    try {
      const data = await callPortal({ action: "get", token });
      setState({ loading: false, error: "", data });
      return data;
    } catch (e) {
      setState({ loading: false, error: e.message || "Nem sikerült betölteni a szerződést.", data: null });
      return null;
    }
  };

  useEffect(() => { load(); }, [token]);

  // Fizetés után pár másodpercig várjuk a Stripe visszaigazolását.
  useEffect(() => {
    if (!returnedFromPayment || !state.data || state.data.status !== "signed" || state.data.payment_status === "paid") return undefined;
    let tries = 0;
    const timer = setInterval(async () => {
      tries += 1;
      const d = await load();
      if (tries >= 8 || d?.payment_status === "paid") clearInterval(timer);
    }, 4000);
    return () => clearInterval(timer);
  }, [returnedFromPayment, state.data?.status, state.data?.payment_status]);

  const sign = async () => {
    setBusy(true); setFormError("");
    try {
      const data = await callPortal({ action: "sign", token, signer_name: name.trim(), accept: true });
      setState({ loading: false, error: "", data });
    } catch (e) { setFormError(e.message); } finally { setBusy(false); }
  };

  const decline = async () => {
    setBusy(true); setFormError("");
    try {
      const data = await callPortal({ action: "decline", token, reason: reason.trim() });
      setState({ loading: false, error: "", data });
    } catch (e) { setFormError(e.message); } finally { setBusy(false); }
  };

  const pay = async () => {
    setPaying(true); setPayError("");
    try {
      const data = await callPortal({ action: "pay", token });
      if (data.paid) { await load(); setPaying(false); return; }
      window.location.href = data.redirect_url;
    } catch (e) {
      setPayError(e.message);
      setPaying(false);
    }
  };

  if (state.loading) {
    return <Shell><div className="flex justify-center py-24"><Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /></div></Shell>;
  }

  if (state.error || !state.data) {
    return (
      <Shell>
        <div className="rounded-2xl border border-border bg-card p-8 text-center shadow-card">
          <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-amber-500" />
          <h1 className="font-heading text-lg font-semibold">A szerződés nem érhető el</h1>
          <p className="mt-2 text-sm text-muted-foreground">{state.error || "Érvénytelen vagy lejárt link."}</p>
        </div>
      </Shell>
    );
  }

  const c = state.data;
  const signed = c.status === "signed";
  const blocked = BLOCKED[c.status];
  const paid = c.payment_status === "paid" || c.payment_status === "refunded";
  const manualUrl = c.manual_payment_url || "";

  return (
    <Shell>
      <div className="rounded-2xl border border-border bg-card p-5 shadow-card sm:p-8 print:border-0 print:shadow-none">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl gradient-brand text-white print:hidden"><FileSignature className="h-5 w-5" /></div>
          <div>
            <h1 className="font-heading text-xl font-bold">Szerződés — {c.offer_name}</h1>
            <p className="text-sm text-muted-foreground">{c.contact_company || c.contact_name}</p>
          </div>
        </div>

        {signed && (
          <div className="mt-5 rounded-xl border border-emerald-300 bg-emerald-50 p-4">
            <div className="flex items-center gap-2 font-semibold text-emerald-700"><CheckCircle2 className="h-5 w-5" /> A szerződés alá van írva</div>
            <p className="mt-1 text-sm text-emerald-700/90">
              Aláíró: {c.signer_name} · {formatDateTime(c.signed_at)} · dokumentum azonosító: {c.doc_ref}
            </p>
            <p className="mt-1 text-xs text-emerald-700/80">Egy másolatot a megadott e-mail címre is elküldünk.</p>
            <div className="mt-3 flex flex-wrap gap-2 print:hidden">
              <Button variant="outline" onClick={() => window.print()}><Printer className="mr-1.5 h-4 w-4" /> Mentés PDF-ként / nyomtatás</Button>
            </div>
          </div>
        )}

        {signed && c.has_fees && (
          <div className="mt-4 rounded-xl border border-border p-4 print:hidden">
            {paid ? (
              <div className="flex items-center gap-2 font-semibold text-emerald-700">
                <CheckCircle2 className="h-5 w-5" /> A befizetés megérkezett, köszönjük!
              </div>
            ) : returnedFromPayment ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Köszönjük! A fizetés visszaigazolását ellenőrizzük, ez néhány másodperc.
              </div>
            ) : (
              <>
                <div className="font-heading font-semibold">Fizetés</div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Most fizetendő: {c.setup_fee > 0 ? `${ft(c.setup_fee)} setup díj` : ""}{c.setup_fee > 0 && c.monthly_fee > 0 ? " + " : ""}{c.monthly_fee > 0 ? `${ft(c.monthly_fee)} havi díj (havonta automatikusan megújuló előfizetés)` : ""}.
                  A fizetés a Stripe biztonságos oldalán, bankkártyával történik.
                </p>
                {c.payments_enabled ? (
                  <Button onClick={pay} disabled={paying} className="mt-3 h-12 w-full gradient-brand text-base text-white sm:w-auto">
                    <CreditCard className="mr-2 h-4 w-4" /> {paying ? "Átirányítás…" : "Fizetés bankkártyával"}
                  </Button>
                ) : manualUrl ? (
                  <Button onClick={() => window.open(manualUrl, "_blank", "noopener")} className="mt-3 h-12 w-full gradient-brand text-base text-white sm:w-auto">
                    <ExternalLink className="mr-2 h-4 w-4" /> Fizetés
                  </Button>
                ) : (
                  <p className="mt-3 rounded-lg bg-muted px-3 py-2 text-sm">A fizetési linket külön elküldjük, amint elkészült.</p>
                )}
                {payError && <p className="mt-3 rounded-lg bg-red-100 px-3 py-2 text-sm text-red-700">{payError}</p>}
              </>
            )}
          </div>
        )}

        {blocked && (
          <div className="mt-5 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">{blocked}</div>
        )}

        <div className="mt-5 grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-border p-3"><div className="text-xs text-muted-foreground">Egyszeri (setup) díj</div><div className="mt-0.5 font-heading text-lg font-bold">{ft(c.setup_fee)}</div></div>
          <div className="rounded-xl border border-border p-3"><div className="text-xs text-muted-foreground">Havi díj</div><div className="mt-0.5 font-heading text-lg font-bold">{ft(c.monthly_fee)}</div></div>
        </div>

        {(c.services || []).length > 0 && (
          <ul className="mt-4 space-y-1 text-sm">
            {c.services.map((s, i) => <li key={i} className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />{s}</li>)}
          </ul>
        )}

        <div className="mt-5 max-h-[28rem] overflow-y-auto whitespace-pre-wrap rounded-xl border border-border bg-muted/30 p-4 text-sm leading-relaxed print:max-h-none print:overflow-visible print:border-0 print:bg-white">
          {c.body}
        </div>

        {!signed && !blocked && !declining && (
          <div className="mt-6 space-y-4 print:hidden">
            <div>
              <Label>Teljes neved az aláíráshoz</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Pl. Kovács Anna" className="mt-1.5" autoComplete="name" />
            </div>
            <label className="flex items-start gap-3 text-sm leading-snug">
              <Checkbox checked={accept} onCheckedChange={(v) => setAccept(!!v)} className="mt-0.5" />
              <span>{c.consent_text}</span>
            </label>
            {formError && <p className="rounded-lg bg-red-100 px-3 py-2 text-sm text-red-700">{formError}</p>}
            <Button onClick={sign} disabled={busy || name.trim().length < 3 || !accept} className="h-12 w-full gradient-brand text-base text-white">
              {busy ? "Aláírás…" : "Aláírom"}
            </Button>
            <button type="button" onClick={() => { setDeclining(true); setFormError(""); }} className="block w-full text-center text-xs text-muted-foreground hover:underline">
              Nem fogadom el
            </button>
          </div>
        )}

        {!signed && !blocked && declining && (
          <div className="mt-6 space-y-3 print:hidden">
            <Label>Miért nem fogadod el? (opcionális)</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
            {formError && <p className="rounded-lg bg-red-100 px-3 py-2 text-sm text-red-700">{formError}</p>}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setDeclining(false)}>Vissza</Button>
              <Button onClick={decline} disabled={busy} className="bg-red-500 text-white hover:bg-red-600">{busy ? "Küldés…" : "Elutasítom a szerződést"}</Button>
            </div>
          </div>
        )}

        {c.expires_at && !signed && !blocked && (
          <p className="mt-4 text-center text-xs text-muted-foreground print:hidden">A link eddig érvényes: {formatDateTime(c.expires_at)}</p>
        )}
      </div>
    </Shell>
  );
}
