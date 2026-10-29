import React, { useState } from "react";
import { KanbanSquare, BarChart3, CalendarCheck, CalendarDays, Zap, ArrowRight, ArrowLeft, Facebook } from "lucide-react";
import { Button } from "@/components/ui/button";

const SLIDES = [
  {
    icon: KanbanSquare,
    title: "Lead tábla",
    text: "A saját accountodhoz tartozó leadeket egy helyen látod. A fázist (Érdeklődő → Egyeztetés → Ajánlat → Ügyfél) itt állítod, a keresővel pedig azonnal megtalálod a keresett kontaktot.",
    bullets: ["Automatikusan ide kerül minden Meta hirdetésből érkező lead", "A fázisváltás egy kattintás"],
  },
  {
    icon: BarChart3,
    title: "Értékesítés",
    text: "Számokban látod, mi történik: leadek, foglalások, megkötött üzletek és bevétel. Így pontosan tudod, mennyit hoznak a hirdetések.",
    bullets: ["Időszakra bontható riportok", "Setter és closer teljesítmény"],
  },
  {
    icon: CalendarCheck,
    title: "Foglalások",
    text: "A beérkező időpontfoglalások egy listában: ki, mikor, melyik linkkel. A megbeszélésekhez a Google Meet linket is megkapod.",
    bullets: ["Státusz követés (megerősítve, lemondva, megtartva)", "Emlékeztető e-mailek automatikusan"],
  },
  {
    icon: CalendarDays,
    title: "Naptár",
    text: "Heti és havi nézetben látod a megbeszéléseidet, így egy pillantás alatt képben vagy a következő napokról.",
    bullets: ["Színes blokkokkal a foglalások", "Kattintásra az összes részlet"],
  },
  {
    icon: Zap,
    title: "Automatizációk",
    text: "Amint egy új lead beérkezik, magától elindulhat a visszajelzés, emlékeztető vagy belső értesítés. Neked nem kell minden lépést kézzel megtenned.",
    bullets: ["Új lead, foglalás vagy fázisváltás indíthatja", "Az e-mail szövegét te írod"],
  },
];

export default function FeatureTour({ onNext, saving }) {
  const [index, setIndex] = useState(0);
  const slide = SLIDES[index];
  const isLast = index === SLIDES.length - 1;

  return (
    <div>
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl gradient-brand-soft text-primary">
          <slide.icon className="h-5 w-5" />
        </div>
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {index + 1}. / {SLIDES.length} funkció
          </div>
          <h2 className="font-heading text-xl font-bold">{slide.title}</h2>
        </div>
      </div>

      <p className="mt-4 text-sm text-muted-foreground">{slide.text}</p>

      <ul className="mt-4 space-y-2">
        {slide.bullets.map((bullet) => (
          <li key={bullet} className="flex gap-3 rounded-xl bg-muted/50 px-3.5 py-2.5 text-sm">
            <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span>{bullet}</span>
          </li>
        ))}
      </ul>

      <div className="mt-6 flex gap-1.5">
        {SLIDES.map((s, i) => (
          <button
            key={s.title}
            onClick={() => setIndex(i)}
            aria-label={s.title}
            className={i === index ? "h-1.5 w-6 rounded-full gradient-brand" : "h-1.5 w-3 rounded-full bg-muted"}
          />
        ))}
      </div>

      <div className="mt-6 flex items-center justify-between gap-3">
        <Button variant="ghost" onClick={() => setIndex((i) => i - 1)} disabled={index === 0}>
          <ArrowLeft className="mr-1.5 h-4 w-4" /> Vissza
        </Button>
        {isLast ? (
          <Button onClick={onNext} disabled={saving} className="h-11 gradient-brand text-white sm:h-9">
            Tovább a Meta fiókhoz <ArrowRight className="ml-1.5 h-4 w-4" />
          </Button>
        ) : (
          <Button onClick={() => setIndex((i) => i + 1)} className="gradient-brand text-white">
            Következő <ArrowRight className="ml-1.5 h-4 w-4" />
          </Button>
        )}
      </div>

      {isLast && (
        <div className="mt-4 flex gap-2.5 rounded-xl border border-border px-3.5 py-3 text-xs text-muted-foreground">
          <Facebook className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <span>
            A hirdetéseid kezelése is nálunk van: mindjárt összekötjük a Meta hirdetési fiókodat, hogy mi is hozzáférjünk hozzá.
          </span>
        </div>
      )}
    </div>
  );
}