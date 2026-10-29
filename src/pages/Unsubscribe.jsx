import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { CheckCircle2, Loader2, AlertTriangle } from "lucide-react";
import { base44 } from "@/api/base44Client";

export default function Unsubscribe() {
  const { token } = useParams();
  const [state, setState] = useState({ loading: true, error: "" });

  useEffect(() => {
    (async () => {
      try {
        // The token alone identifies the contact; no contact data comes back.
        const res = await base44.functions.invoke("crmUnsubscribe", { token });
        if (res.data?.error) setState({ loading: false, error: res.data.error });
        else setState({ loading: false, error: "" });
      } catch (e) {
        setState({ loading: false, error: e.message || "Nem sikerült a leiratkozás." });
      }
    })();
  }, [token]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-6">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-card">
        {state.loading ? (
          <Loader2 className="mx-auto h-7 w-7 animate-spin text-muted-foreground" />
        ) : state.error ? (
          <>
            <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-amber-500" />
            <h1 className="font-heading text-lg font-semibold">Nem sikerült a leiratkozás</h1>
            <p className="mt-2 text-sm text-muted-foreground">{state.error}</p>
          </>
        ) : (
          <>
            <CheckCircle2 className="mx-auto mb-3 h-9 w-9 text-emerald-500" />
            <h1 className="font-heading text-lg font-semibold">Sikeresen leiratkoztál</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              A továbbiakban nem küldünk marketing e-mailt erre a címre. A folyamatban lévő megkereséseket leállítottuk.
            </p>
          </>
        )}
      </div>
    </div>
  );
}