import React from "react";
import { Hourglass, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/AuthContext";

export default function AccountPendingScreen() {
  const { user, logout } = useAuth();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-card">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl gradient-brand text-white">
          <Hourglass className="h-6 w-6" />
        </div>
        <h1 className="mt-5 font-heading text-xl font-bold">Várakozás jóváhagyásra</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          A fiókod ({user?.email}) még nincs munkaterülethez rendelve. Amint egy admin hozzárendeli a
          megfelelő accountot, megnyílnak a saját leadjeid, riportjaid és foglalásaid.
        </p>
        <Button variant="outline" className="mt-6 w-full" onClick={() => logout()}>
          <LogOut className="mr-2 h-4 w-4" /> Kijelentkezés
        </Button>
      </div>
    </div>
  );
}