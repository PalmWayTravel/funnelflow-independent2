import React from "react";
import { Sparkles, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

const HIGHLIGHTS = [
  "Megmutatjuk a 4 fő funkciót, amit naponta használni fogsz.",
  "Összekötjük a Meta hirdetési fiókodat, hogy mi is hozzáférjünk a hirdetésekhez.",
  "A végén belépsz a saját ügyfél nézetedbe.",
];

export default function WelcomeStep({ firstName, onNext, onLogout }) {
  return (
    <div className="text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl gradient-brand text-white shadow-card">
        <Sparkles className="h-7 w-7" />
      </div>
      <h1 className="mt-5 font-heading text-2xl font-bold">Üdv a FunnelFlow-ban, {firstName}! 👋</h1>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        Ez az első belépésed, ezért néhány percben végigvezetünk mindenen. Utána már a saját nézeted vár.
      </p>

      <ul className="mx-auto mt-6 max-w-md space-y-2.5 text-left">
        {HIGHLIGHTS.map((text) => (
          <li key={text} className="flex gap-3 rounded-xl bg-muted/50 px-3.5 py-3 text-sm">
            <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span>{text}</span>
          </li>
        ))}
      </ul>

      <Button onClick={onNext} className="mt-6 h-11 w-full gradient-brand text-white sm:w-auto sm:px-8">
        Kezdjük <ArrowRight className="ml-1.5 h-4 w-4" />
      </Button>
      <button onClick={onLogout} className="mt-4 block w-full text-xs text-muted-foreground hover:text-foreground">
        Kijelentkezés
      </button>
    </div>
  );
}