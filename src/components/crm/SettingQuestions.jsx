import React from "react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const SETTING_QUESTIONS = [
  { key: "business", question: "Mivel foglalkozik a cégetek pontosan?" },
  { key: "market", question: "B2B vagy inkább B2C?" },
  { key: "reasons", question: "Mi volt a 2 legfőbb indok, ami miatt jelentkeztél?" },
  { key: "website", question: "Van weboldal / landing page? (elégedettek vele?)" },
  { key: "crm", question: "Használtok CRM rendszert? Mit, vagy miért nem?" },
  { key: "leadgen", question: "Jelenleg hogy szereztek új ügyfeleket?" },
  { key: "ads", question: "Futtattok fizetett hirdetéseket? Hol, vagy miért nem?" },
  { key: "budget", question: "Mekkora jelenleg a havi marketing budget?" },
  { key: "challenge", question: "Mi most a legnagyobb kihívás az ügyfélszerzésben?" },
  { key: "revenue_goal", question: "Mekkora havi bevételt szeretnétek elérni 6 hónap múlva?" },
  { key: "decision_makers", question: "Kik a döntéshozók?" },
  { key: "device", question: "Számítógépről lép be?" },
];

export default function SettingQuestions({ answers, onChange }) {
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        A setter a hívás során tölti ki — a válaszok mentés után az idővonalon is megjelennek.
      </p>
      {SETTING_QUESTIONS.map((q, i) => (
        <div key={q.key}>
          <Label>{i + 1}. {q.question}</Label>
          <Textarea
            value={answers[q.key] || ""}
            onChange={(e) => onChange({ ...answers, [q.key]: e.target.value })}
            rows={2}
            className="mt-1.5"
          />
        </div>
      ))}
    </div>
  );
}