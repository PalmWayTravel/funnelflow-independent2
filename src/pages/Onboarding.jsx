import React, { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Eye, KanbanSquare, LogOut } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import OnboardingProgress from "@/components/onboarding/OnboardingProgress";
import WelcomeStep from "@/components/onboarding/WelcomeStep";
import FeatureTour from "@/components/onboarding/FeatureTour";
import MetaConnectStep from "@/components/onboarding/MetaConnectStep";
import FinishStep from "@/components/onboarding/FinishStep";

const STEPS = ["Üdvözlés", "Funkciók", "Meta Ads", "Kész"];

// Első belépéses onboarding: funkcióbemutató, Meta hirdetési fiók összekötése,
// majd a saját ügyfél nézet megnyitása.
export default function Onboarding() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const isClient = !!user && user.role !== "admin";
  // Admin előnézet: /onboarding?preview=1 — ekkor semmi nem mentődik.
  const previewMode = !!user && !isClient && new URLSearchParams(window.location.search).get("preview") === "1";
  const userId = user?.id;

  const [step, setStep] = useState(0);
  const [record, setRecord] = useState(null);
  const [partnerId, setPartnerId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if ((!isClient && !previewMode) || !userId) { setLoading(false); return; }
    let active = true;
    (async () => {
      try {
        const res = await base44.functions.invoke("crmOnboardingConfig", {});
        if (active) setPartnerId(res?.data?.meta_business_id || "");
      } catch (e) {}
      if (isClient) {
        try {
          const { items } = await base44.entities.ClientOnboarding.filter(
            { user_id: userId }, { sort: "-created_date", limit: 1 }
          );
          if (active) setRecord(items?.[0] || null);
        } catch (e) {}
      }
      if (active) setLoading(false);
    })();
    return () => { active = false; };
  }, [isClient, previewMode, userId]);

  const save = async (patch) => {
    const payload = { user_id: userId, user_email: user.email || "", account_id: user.account_id || "", ...patch };
    if (previewMode) {
      const local = { ...(record || {}), ...payload };
      setRecord(local);
      return local;
    }
    const saved = record?.id
      ? await base44.entities.ClientOnboarding.update(record.id, payload)
      : await base44.entities.ClientOnboarding.create(payload);
    setRecord(saved);
    return saved;
  };

  const closeTour = async () => {
    setSaving(true);
    try {
      await save({ tour_completed: true });
    } catch (e) {
    } finally {
      setSaving(false);
    }
    setStep(2);
  };

  const submitMeta = async (meta) => {
    setSaving(true);
    try {
      await save({ ...meta, tour_completed: true, status: "completed", completed_at: new Date().toISOString() });
      setStep(3);
    } finally {
      setSaving(false);
    }
  };

  if (user && !isClient && !previewMode) return <Navigate to="/dashboard" replace />;

  const firstName = (user?.full_name || user?.email || "vendég").split(" ")[0].split("@")[0];

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto max-w-2xl">
        {previewMode && (
          <div className="mb-4 flex gap-2.5 rounded-xl border border-primary/30 bg-primary/5 px-3.5 py-3 text-sm">
            <Eye className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span>
              <span className="font-semibold">Előnézet.</span> Így látja az ügyfél az első belépéskor — itt semmi nem
              mentődik. Az éles folyamat egy ügyfél szerepkörű felhasználó első belépésekor indul automatikusan.
            </span>
          </div>
        )}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl gradient-brand text-white shadow-sm">
              <KanbanSquare className="h-5 w-5" />
            </div>
            <div className="leading-tight">
              <div className="font-heading text-base font-bold">FunnelFlow</div>
              <div className="text-[11px] text-muted-foreground">Első belépés beállítása</div>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={() => logout()}>
            <LogOut className="mr-1.5 h-4 w-4" /> Kilépés
          </Button>
        </div>

        <OnboardingProgress steps={STEPS} current={step} />

        <div className="rounded-2xl border border-border bg-card p-6 shadow-card md:p-8">
          {loading ? (
            <div className="flex h-48 items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
            </div>
          ) : (
            <>
              {step === 0 && <WelcomeStep firstName={firstName} onNext={() => setStep(1)} onLogout={() => logout()} />}
              {step === 1 && <FeatureTour onNext={closeTour} saving={saving} />}
              {step === 2 && (
                <MetaConnectStep partnerId={partnerId} record={record} onSubmit={submitMeta} saving={saving} />
              )}
              {step === 3 && (
                <FinishStep record={record} onEnter={() => navigate(previewMode ? "/meta-ads" : "/", { replace: true })} />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}