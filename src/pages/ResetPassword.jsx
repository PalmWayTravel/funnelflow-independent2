import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/api/base44Client";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Lock, Loader2, AlertTriangle } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";

export default function ResetPassword() {
  // A Supabase a visszaállító / meghívó linkre kattintva már bejelentkeztet (helyreállító munkamenet),
  // ezért itt nincs külön token: elég, ha van munkamenet.
  const [resetToken, setResetToken] = useState(null);
  const [checking, setChecking] = useState(true);
  useEffect(() => {
    let done = false;
    const finish = (ok) => { if (!done) { done = true; setResetToken(ok ? "session" : null); setChecking(false); } };
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => { if (session) finish(true); });
    supabase.auth.getSession().then(({ data }) => { if (data.session) finish(true); });
    const t = setTimeout(() => finish(false), 2500);
    return () => { clearTimeout(t); sub.subscription.unsubscribe(); };
  }, []);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (newPassword !== confirmPassword) {
      setError("A jelszavak nem egyeznek");
      return;
    }
    setLoading(true);
    try {
      await base44.auth.resetPassword({ resetToken, newPassword });
      window.location.href = "/login";
    } catch (err) {
      setError(err.message || "Nem sikerült visszaállítani a jelszót");
    } finally {
      setLoading(false);
    }
  };

  if (checking) return null;
  if (!resetToken) {
    return (
      <AuthLayout
        icon={AlertTriangle}
        title="Érvénytelen visszaállító link"
        subtitle="Ez a jelszó-visszaállító link hiányzik vagy érvénytelen"
        footer={
          <Link to="/forgot-password" className="text-primary font-medium hover:underline">
            Új link kérése
          </Link>
        }
      >
        <p className="text-sm text-foreground text-center">
          A link, amit használtál, valószínűleg hiányos. Kérj egy új jelszó-visszaállító e-mailt.
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      icon={Lock}
      title="Új jelszó"
      subtitle="Add meg az új jelszavad alább"
    >
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="password">Új jelszó</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              autoFocus
              placeholder="••••••••"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="pl-10 h-12"
              required
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm">Jelszó megerősítése</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="confirm"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="pl-10 h-12"
              required
            />
          </div>
        </div>
        <Button type="submit" className="w-full h-12 font-medium" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Visszaállítás...
            </>
          ) : (
            "Jelszó visszaállítása"
          )}
        </Button>
      </form>
    </AuthLayout>
  );
}