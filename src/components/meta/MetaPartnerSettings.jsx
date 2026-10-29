import React, { useEffect, useState } from "react";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getWorkspaceSettings, saveWorkspaceSettings } from "@/lib/crm";

// Az ügyfél onboardingban ezt az azonosítót látja „partner azonosítónk"-ként.
export default function MetaPartnerSettings() {
  const [ws, setWs] = useState(null);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getWorkspaceSettings().then((data) => {
      if (!data) return;
      setWs(data);
      setValue(data.meta_business_id || "");
    });
  }, []);

  const save = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const updated = await saveWorkspaceSettings(ws, { meta_business_id: value.trim() });
      setWs(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
      <div className="flex items-center gap-2">
        <KeyRound className="h-4 w-4 text-primary" />
        <h3 className="font-heading font-semibold">Partner azonosítónk az onboardinghoz</h3>
      </div>
      <p className="mb-4 mt-1 text-xs text-muted-foreground">
        Ez a saját Meta Business Manager azonosítónk. Az új ügyfelek az első belépésnél ezt látják, és ezzel adnak nekünk
        hozzáférést a hirdetési fiókjukhoz. Ha üres, az ügyfél csak az adatait tudja beküldeni, az azonosítót tőled kapja meg.
      </p>
      <Label>Meta Business Manager azonosító</Label>
      <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
        <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder="pl. 1234567890123456" className="font-mono sm:max-w-xs" />
        <Button onClick={save} disabled={saving} className="gradient-brand text-white">
          {saving ? "Mentés…" : saved ? "Elmentve ✓" : "Mentés"}
        </Button>
      </div>
    </div>
  );
}