import React, { useEffect, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";

// Az ügyfél csak akkor éri el a saját nézetét, ha az első belépéses
// onboardingot (funkcióbemutató + Meta lépés) befejezte.
export default function OnboardingGate() {
  const { user } = useAuth();
  const location = useLocation();
  const isClient = !!user && user.role !== "admin";
  const userId = user?.id;
  const [status, setStatus] = useState("loading");

  useEffect(() => {
    if (!isClient || !userId) return;
    let active = true;
    base44.entities.ClientOnboarding
      .filter({ user_id: userId }, { sort: "-created_date", limit: 1 })
      .then(({ items }) => { if (active) setStatus(items?.[0]?.status === "completed" ? "done" : "needed"); })
      .catch(() => { if (active) setStatus("needed"); });
    return () => { active = false; };
  }, [isClient, userId]);

  if (!isClient) return <Outlet />;

  if (status === "loading") {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
      </div>
    );
  }

  if (status === "needed" && location.pathname !== "/onboarding") {
    return <Navigate to="/onboarding" replace />;
  }

  return <Outlet />;
}