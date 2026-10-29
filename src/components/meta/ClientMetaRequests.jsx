import React, { useState } from "react";
import { Check, Inbox, Link2, Mail, LifeBuoy, TriangleAlert } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { AGENCY_WORKSPACE } from "@/lib/meta";
import { META_STATUS_LABELS } from "@/lib/onboarding";
import { timeAgo } from "@/lib/format";

// Admin oldal: az onboarding során beküldött ügyfél Meta adatok, egy kattintásos összekötéssel.
export default function ClientMetaRequests({ requests, accounts, mappings, onDone }) {
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");

  const accountName = (id) => accounts.find((a) => a.id === id)?.name || "Nincs account hozzárendelve";
  const isMapped = (adAccountId) => !!adAccountId && mappings.some((m) => m.ad_account_id === adAccountId);

  const connect = async (request) => {
    setBusyId(request.id);
    setError("");
    try {
      await base44.entities.MetaAdAccountMapping.create({
        workspace_id: request.account_id || AGENCY_WORKSPACE,
        ad_account_id: request.meta_ad_account_id,
        ad_account_name: request.meta_ad_account_name || request.user_email || "",
        page_name: request.meta_page_name || "",
        status: "active",
        note: `Ügyfél onboarding — beküldte: ${request.user_email || ""}`,
      });
      await base44.entities.ClientOnboarding.update(request.id, { meta_status: "connected" });
      onDone();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusyId("");
    }
  };

  const closeRequest = async (request) => {
    setBusyId(request.id);
    setError("");
    try {
      await base44.entities.ClientOnboarding.update(request.id, { meta_status: "connected" });
      onDone();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusyId("");
    }
  };

  if (requests.length === 0) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-dashed border-border bg-card px-4 py-5 text-sm text-muted-foreground">
        <Inbox className="h-4 w-4 shrink-0" />
        <span>Még nincs beérkező ügyfél adat. Amint egy ügyfél végigmegy az onboardingon, itt jelenik meg.</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="flex gap-2.5 rounded-xl border border-destructive/40 bg-destructive/10 px-3.5 py-3 text-sm text-destructive">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {requests.map((request) => {
        const mapped = isMapped(request.meta_ad_account_id);
        const helpRequested = request.meta_status === "help_requested";
        return (
          <div key={request.id} className="rounded-2xl border border-border bg-card p-4 shadow-card">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {helpRequested ? <LifeBuoy className="h-4 w-4 text-amber-600" /> : <Link2 className="h-4 w-4 text-primary" />}
                <span className="font-heading text-sm font-semibold">
                  {request.meta_ad_account_name || request.meta_ad_account_id || "Segítségkérés"}
                </span>
                <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                  {META_STATUS_LABELS[request.meta_status] || request.meta_status}
                </span>
              </div>
              <span className="text-xs text-muted-foreground">{timeAgo(request.updated_date || request.created_date)}</span>
            </div>

            <div className="mt-3 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Mail className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{request.user_email || "—"}</span>
              </div>
              <div className="text-muted-foreground">Account: <span className="text-foreground">{accountName(request.account_id)}</span></div>
              <div className="text-muted-foreground">Hirdetési fiók: <span className="font-mono text-foreground">{request.meta_ad_account_id || "—"}</span></div>
              <div className="text-muted-foreground">Business Manager: <span className="font-mono text-foreground">{request.meta_business_id || "—"}</span></div>
              <div className="text-muted-foreground">Facebook oldal: <span className="text-foreground">{request.meta_page_name || "—"}</span></div>
            </div>

            {request.meta_note && (
              <p className="mt-3 rounded-xl bg-muted/50 px-3 py-2 text-xs text-muted-foreground">{request.meta_note}</p>
            )}

            <div className="mt-4 flex flex-wrap gap-2">
              {request.meta_ad_account_id && (
                mapped ? (
                  <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300/60 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
                    <Check className="h-3.5 w-3.5" /> Már szerepel a mappingben
                  </span>
                ) : (
                  <Button size="sm" disabled={busyId === request.id} onClick={() => connect(request)} className="gradient-brand text-white">
                    <Link2 className="mr-1.5 h-3.5 w-3.5" /> Összekötés a workspace-szel
                  </Button>
                )
              )}
              <Button size="sm" variant="outline" disabled={busyId === request.id} onClick={() => closeRequest(request)}>
                {busyId === request.id ? "Feldolgozás…" : "Kész, lezárom"}
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}