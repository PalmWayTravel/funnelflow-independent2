import React from "react";
import { FileSpreadsheet, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { REPORT_PERIODS, REPORT_TYPES } from "@/lib/reports";

export default function ReportToolbar({ type, period, onTypeChange, onPeriodChange, onCsv, onPdf, exporting }) {
  const active = REPORT_TYPES.find((t) => t.key === type);

  return (
    <div className="mb-5 rounded-2xl border border-border bg-card p-4 shadow-card">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="sm:w-[230px]">
            <Label className="text-xs">Riport típusa</Label>
            <Select value={type} onValueChange={onTypeChange}>
              <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
              <SelectContent>
                {REPORT_TYPES.map((t) => <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="sm:w-[170px]">
            <Label className="text-xs">Időszak</Label>
            <Select value={period} onValueChange={onPeriodChange}>
              <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
              <SelectContent>
                {REPORT_PERIODS.map((p) => <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={onCsv} disabled={!!exporting}>
            <FileSpreadsheet className="mr-1.5 h-4 w-4" /> {exporting === "csv" ? "Készül…" : "CSV"}
          </Button>
          <Button onClick={onPdf} disabled={!!exporting} className="gradient-brand text-white">
            <FileText className="mr-1.5 h-4 w-4" /> {exporting === "pdf" ? "Készül…" : "PDF letöltés"}
          </Button>
        </div>
      </div>

      {active?.description && <p className="mt-3 text-xs text-muted-foreground">{active.description}</p>}
    </div>
  );
}