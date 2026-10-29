import React, { useState } from "react";
import { ArrowLeft, ArrowRight, Facebook, LifeBuoy } from "lucide-react";
import { Button } from "@/components/ui/button";
import MetaAccountCreateGuide from "@/components/onboarding/MetaAccountCreateGuide";
import MetaPartnerGuide from "@/components/onboarding/MetaPartnerGuide";
import MetaAccountForm from "@/components/onboarding/MetaAccountForm";

// Három fázis: van-e fiók → hogyan ad hozzáférést → adatok beküldése.
export default function MetaConnectStep({ partnerId, record, onSubmit, saving }) {
  const [phase, setPhase] = useState(0);
  const [hasAccount, setHasAccount] = useState(record?.has_meta_account ?? null);

  const choose = (value) => {
    setHasAccount(value);
    setPhase(1);
  };

  if (phase === 0) {
    return (
      <div>
        <h2 className="font-heading text-xl font-bold">Kössük össze a Meta hirdetési fiókodat</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Ahhoz, hogy a hirdetéseidet kezelni tudjuk, és minden lead automatikusan a te tábládra kerüljön, hozzáférésre
          van szükségünk a hirdetési fiókodhoz. Van már Meta (Facebook) hirdetési fiókod?
        </p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <button onClick={() => choose(true)}
            className="rounded-2xl border border-border p-5 text-left transition-colors hover:border-primary/60 hover:bg-accent">
            <Facebook className="h-5 w-5 text-primary" />
            <div className="mt-2 font-semibold">Van már hirdetési fiókom</div>
            <p className="mt-1 text-xs text-muted-foreground">Megmutatjuk, hogyan adsz nekünk hozzáférést.</p>
          </button>
          <button onClick={() => choose(false)}
            className="rounded-2xl border border-border p-5 text-left transition-colors hover:border-primary/60 hover:bg-accent">
            <LifeBuoy className="h-5 w-5 text-primary" />
            <div className="mt-2 font-semibold">Még nincs, segítsetek</div>
            <p className="mt-1 text-xs text-muted-foreground">Lépésről lépésre létrehozzuk veled a fiókot.</p>
          </button>
        </div>
      </div>
    );
  }

  if (phase === 1) {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="font-heading text-xl font-bold">Így kapunk hozzáférést</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {hasAccount
              ? "Két dolgot kérünk: partnerként adj hozzá minket a hirdetési fiókodhoz, majd add meg nekünk az azonosítókat."
              : "Először hozd létre a hirdetési fiókot, utána adj nekünk partner hozzáférést, végül add meg az azonosítókat."}
          </p>
        </div>

        {!hasAccount && <MetaAccountCreateGuide />}
        <MetaPartnerGuide partnerId={partnerId} />

        <div className="flex items-center justify-between gap-3 pt-1">
          <Button variant="ghost" onClick={() => setPhase(0)}>
            <ArrowLeft className="mr-1.5 h-4 w-4" /> Vissza
          </Button>
          <Button onClick={() => setPhase(2)} className="gradient-brand text-white">
            Megvan, tovább <ArrowRight className="ml-1.5 h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <MetaAccountForm hasAccount={hasAccount} record={record} onSubmit={onSubmit} saving={saving} onBack={() => setPhase(1)} />
  );
}