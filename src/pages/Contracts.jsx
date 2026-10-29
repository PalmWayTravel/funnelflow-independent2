import React, { useEffect, useMemo, useState } from "react";
import { Plus, FileSignature, Send, CheckCircle2, Wallet, Copy, Check, ExternalLink, RefreshCw, CreditCard } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import PageHeader from "@/components/PageHeader";
import StatCard from "@/components/StatCard";
import EmptyState from "@/components/EmptyState";
import TwoStepDelete from "@/components/TwoStepDelete";
import OfferEditor from "@/components/crm/OfferEditor";
import { CONTRACT_STATUS, PAYMENT_STATUS, ft, contractLink, callContractSend, callPaymentLink, syncPayments } from "@/lib/contracts";
import { formatDateTime, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

export default function Contracts() {
  const [offers, setOffers] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [copiedId, setCopiedId] = useState("");
  const [notice, setNotice] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const [o, c] = await Promise.all([
        base44.entities.Offer.list("-created_date", 100),
        base44.entities.Contract.list("-created_date", 300),
      ]);
      setOffers(o); setContracts(c);
    } catch (e) {} finally { setLoading(false); }
  };
  // Megnyitáskor (percenként egyszer) átvesszük a Stripe-ban történteket, utána töltünk.
  useEffect(() => {
    (async () => {
      try {
        const stamp = Number(sessionStorage.getItem("contract_sync") || 0);
        if (Date.now() - stamp > 60000) {
          sessionStorage.setItem("contract_sync", String(Date.now()));
          await syncPayments().catch(() => null);
        }
      } catch (e) { /* ignore */ }
      load();
    })();
  }, []);

  const refreshPayments = async () => {
    setNotice("");
    try {
      const r = await syncPayments();
      setNotice(r.recorded ? `${r.recorded} szerződésnél új fizetés került átvezetésre.` : `Ellenőrizve (${r.checked} szerződés), nincs új fizetés.`);
    } catch (e) { setNotice(e.message); }
    load();
  };

  const paymentLink = async (c) => {
    setNotice("");
    try {
      const data = await callPaymentLink(c.id);
      try { await navigator.clipboard.writeText(data.url); } catch (e) { /* ignore */ }
      setCopiedId(`pay-${c.id}`);
      setTimeout(() => setCopiedId(""), 2500);
      setNotice("A közvetlen Stripe fizetési link a vágólapon van. 24 óráig él; tartósabb küldéshez a „Link” gomb oldal-linkjét használd, ott a fizetés gomb mindig friss.");
    } catch (e) { setNotice(e.message); }
    load();
  };

  const stats = useMemo(() => {
    const signed = contracts.filter((c) => c.status === "signed");
    return {
      pending: contracts.filter((c) => ["sent", "viewed"].includes(c.status)).length,
      signed: signed.length,
      paid: signed.reduce((s, c) => s + (Number(c.paid_amount) || 0), 0),
      monthly: signed.reduce((s, c) => s + (Number(c.monthly_fee) || 0), 0),
    };
  }, [contracts]);

  const toggleOffer = async (offer) => {
    await base44.entities.Offer.update(offer.id, { active: offer.active === false });
    load();
  };

  const copy = async (c) => {
    try { await navigator.clipboard.writeText(contractLink(c)); } catch (e) { /* ignore */ }
    setCopiedId(c.id);
    setTimeout(() => setCopiedId(""), 2000);
  };

  const resend = async (c) => {
    setNotice("");
    try {
      const data = await callContractSend({ action: "resend", contract_id: c.id });
      setNotice(data.email?.status === "sent" ? "Az e-mail újra elment." : `Az e-mail nem ment ki: ${data.email?.error || "ismeretlen hiba"}`);
    } catch (e) { setNotice(e.message); }
    load();
  };

  const cancel = async (c) => {
    setNotice("");
    try { await callContractSend({ action: "cancel", contract_id: c.id }); } catch (e) { setNotice(e.message); }
    load();
  };

  if (loading) return <div className="flex h-64 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary/20 border-t-primary" /></div>;

  return (
    <div>
      <PageHeader title="Szerződések" subtitle="Ajánlatcsomagok és az elküldött, aláírásra váró vagy aláírt szerződések"
        action={(
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={refreshPayments}><RefreshCw className="mr-1.5 h-4 w-4" /> Fizetések frissítése</Button>
            <Button onClick={() => { setEditing(null); setEditorOpen(true); }} className="gradient-brand text-white"><Plus className="mr-1.5 h-4 w-4" /> Új ajánlat</Button>
          </div>
        )} />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={Send} label="Aláírásra vár" value={formatNumber(stats.pending)} gradient="blue" />
        <StatCard icon={CheckCircle2} label="Aláírt szerződés" value={formatNumber(stats.signed)} gradient="emerald" />
        <StatCard icon={Wallet} label="Befizetve (első fizetések)" value={ft(stats.paid)} gradient="violet" />
        <StatCard icon={FileSignature} label="Aláírt havi díjak" value={ft(stats.monthly)} gradient="pink" />
      </div>

      <h2 className="mb-3 font-heading text-base font-semibold">Ajánlatcsomagok</h2>
      {offers.length === 0 ? (
        <EmptyState icon={FileSignature} title="Még nincs ajánlatcsomag"
          description="Hozd létre a csomagjaidat díjakkal és szerződésszöveggel, utána a meetingen egy kattintással elküldhetők."
          action={<Button onClick={() => setEditorOpen(true)} className="gradient-brand text-white">Első ajánlat létrehozása</Button>} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {offers.map((o) => (
            <div key={o.id} className={cn("rounded-2xl border border-border bg-card p-5 shadow-card", o.active === false && "opacity-60")}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate font-heading font-semibold">{o.name}</h3>
                  {o.description && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{o.description}</p>}
                </div>
                <Switch checked={o.active !== false} onCheckedChange={() => toggleOffer(o)} />
              </div>
              <div className="mt-3 text-sm"><span className="font-semibold">{ft(o.setup_fee)}</span> <span className="text-muted-foreground">setup</span> · <span className="font-semibold">{ft(o.monthly_fee)}</span> <span className="text-muted-foreground">/ hó</span></div>
              <div className="mt-1 text-xs text-muted-foreground">{(o.services || []).length} tétel · {o.contract_template ? "van szerződésszöveg" : "nincs szerződésszöveg"}</div>
              <div className="mt-4">
                <Button size="sm" variant="outline" onClick={() => { setEditing(o); setEditorOpen(true); }}>Szerkesztés</Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <h2 className="mb-3 mt-8 font-heading text-base font-semibold">Szerződések</h2>
      {notice && <p className="mb-3 rounded-lg bg-muted px-3 py-2 text-sm">{notice}</p>}
      {contracts.length === 0 ? (
        <p className="rounded-2xl border border-border bg-card px-5 py-8 text-center text-sm text-muted-foreground shadow-card">
          Még nem küldtél szerződést. A Kontaktok vagy a Foglalások oldalon találod a „Szerződés" gombot.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-card scrollbar-thin">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <th className="px-4 py-3 font-semibold">Kontakt</th>
                <th className="px-4 py-3 font-semibold">Csomag</th>
                <th className="px-4 py-3 font-semibold">Díjak</th>
                <th className="px-4 py-3 font-semibold">Állapot</th>
                <th className="px-4 py-3 font-semibold">Időpontok</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {contracts.map((c) => {
                const st = CONTRACT_STATUS[c.status] || CONTRACT_STATUS.sent;
                const open = ["sent", "viewed"].includes(c.status);
                return (
                  <tr key={c.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3"><div className="font-semibold">{c.contact_name || "—"}</div><div className="text-xs text-muted-foreground">{c.contact_company || c.contact_email || ""}</div></td>
                    <td className="px-4 py-3">{c.offer_name}</td>
                    <td className="px-4 py-3 text-muted-foreground"><div>{ft(c.setup_fee)} setup</div><div className="text-xs">{ft(c.monthly_fee)} / hó</div></td>
                    <td className="px-4 py-3">
                      <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", st.cls)}>{st.label}</span>
                      {c.status === "signed" && c.signer_name && <div className="mt-1 text-xs text-muted-foreground">{c.signer_name}</div>}
                      {c.send_status === "failed" && <div className="mt-1 text-xs text-red-500">E-mail nem ment ki</div>}
                      {c.status === "signed" && (Number(c.setup_fee) > 0 || Number(c.monthly_fee) > 0) && (() => {
                        const ps = PAYMENT_STATUS[c.payment_status || "none"] || PAYMENT_STATUS.none;
                        return (
                          <div className="mt-1">
                            <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", ps.cls)}>{ps.label}</span>
                            {c.payment_status === "paid" && <span className="ml-1 text-xs text-muted-foreground">{ft(c.paid_amount)}</span>}
                            {c.payment_error && c.payment_status !== "paid" && <div className="mt-1 text-xs text-red-500">{c.payment_error}</div>}
                          </div>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      <div>Elküldve: {formatDateTime(c.sent_at || c.created_date)}</div>
                      {c.viewed_at && <div>Megnyitva: {formatDateTime(c.viewed_at)}</div>}
                      {c.signed_at && <div>Aláírva: {formatDateTime(c.signed_at)}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap justify-end gap-1.5">
                        {open && (
                          <>
                            <Button size="sm" variant="outline" onClick={() => copy(c)}>
                              {copiedId === c.id ? <Check className="mr-1 h-3.5 w-3.5" /> : <Copy className="mr-1 h-3.5 w-3.5" />} Link
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => window.open(contractLink(c), "_blank", "noopener")}><ExternalLink className="h-3.5 w-3.5" /></Button>
                          </>
                        )}
                        {c.status === "signed" && (
                          <Button size="sm" variant="outline" onClick={() => copy(c)}>
                            {copiedId === c.id ? <Check className="mr-1 h-3.5 w-3.5" /> : <Copy className="mr-1 h-3.5 w-3.5" />} Link
                          </Button>
                        )}
                        {c.status === "signed" && c.payment_status !== "paid" && c.payment_status !== "refunded" && (Number(c.setup_fee) > 0 || Number(c.monthly_fee) > 0) && (
                          <Button size="sm" variant="outline" onClick={() => paymentLink(c)}>
                            {copiedId === `pay-${c.id}` ? <Check className="mr-1 h-3.5 w-3.5" /> : <CreditCard className="mr-1 h-3.5 w-3.5" />} Fizetési link
                          </Button>
                        )}
                        {["sent", "viewed", "expired", "declined"].includes(c.status) && (
                          <Button size="sm" variant="outline" onClick={() => resend(c)}><RefreshCw className="mr-1 h-3.5 w-3.5" /> Újra</Button>
                        )}
                        {open && <TwoStepDelete onDelete={() => cancel(c)} label="Visszavonás" />}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <OfferEditor open={editorOpen} onClose={() => setEditorOpen(false)} offer={editing} onSaved={load} />
    </div>
  );
}
