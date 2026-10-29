import React from "react";
import { Check, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { META_STATUS_LABELS } from "@/lib/onboarding";

export default function FinishStep({ record, onEnter }) {
  const helpRequested = record?.meta_status === "help_requested";

  const rows = [
    ["Hirdetési fiók", record?.meta_ad_account_id || "—"],
    ["Fiók neve", record?.meta_ad_account_name || "—"],
    ["Business Manager", record?.meta_business_id || "—"],
    ["Meta állapot", META_STATUS_LABELS[record?.meta_status] || "—"],
  ];

  return (
    <div className="text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl gradient-brand text-white shadow-card">
        <Check className="h-7 w-7" />
      </div>
      <h1 className="mt-5 font-heading text-2xl font-bold">Minden készen áll!</h1>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        {helpRequested
          ? "Megkaptuk a jelzést: felvesszük veled a kapcsolatot, és közösen létrehozzuk a hirdetési fiókot. Addig is nyugodtan beléphetsz a saját nézetedbe."
          : "Megkaptuk a hirdetési fiók adatait. A csapatunk ellenőrzi a partner hozzáférést, és hamarosan visszaigazoljuk. Közben már a saját nézetedben dolgozhatsz."}
      </p>

      <dl className="mx-auto mt-6 max-w-md space-y-2 rounded-2xl bg-muted/50 p-4 text-left text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-start justify-between gap-4">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="truncate font-medium">{value}</dd>
          </div>
        ))}
      </dl>

      <Button onClick={onEnter} className="mt-6 h-11 w-full gradient-brand text-white sm:w-auto sm:px-8">
        Belépés a saját nézetbe <ArrowRight className="ml-1.5 h-4 w-4" />
      </Button>
    </div>
  );
}