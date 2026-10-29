import React, { useCallback, useEffect, useRef, useState } from "react";
import { TriangleAlert } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import ReportToolbar from "@/components/reports/ReportToolbar";
import ReportPreview from "@/components/reports/ReportPreview";
import { useAccountScope } from "@/lib/accountScope";
import { exportCsv, exportPdf, loadReport, reportFileName } from "@/lib/reports";

// Az ügyfél itt kérhet riportot a saját eredményeiről, és letöltheti PDF-ben vagy CSV-ben.
export default function Reports() {
  const { accountId } = useAccountScope();
  const [type, setType] = useState("summary");
  const [period, setPeriod] = useState("this_month");
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState("");
  const [error, setError] = useState("");
  const previewRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setReport(await loadReport(type, period, accountId));
    } catch (e) {
      setError(e.message || "Nem sikerült elkészíteni a riportot.");
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [type, period, accountId]);

  useEffect(() => { load(); }, [load]);

  const handleCsv = () => {
    if (!report) return;
    try {
      exportCsv(report, period);
    } catch (e) {
      alert(e.message);
    }
  };

  const handlePdf = async () => {
    if (!previewRef.current || !report) return;
    setExporting("pdf");
    try {
      await exportPdf(previewRef.current, reportFileName(report, period));
    } catch (e) {
      alert(e.message);
    } finally {
      setExporting("");
    }
  };

  return (
    <div style={{ maxWidth: "1000px" }}>
      <PageHeader
        title="Riport"
        subtitle="Kérj riportot az eredményeidről, és töltsd le PDF-ben vagy táblázatban (CSV)"
      />

      <ReportToolbar
        type={type}
        period={period}
        onTypeChange={setType}
        onPeriodChange={setPeriod}
        onCsv={handleCsv}
        onPdf={handlePdf}
        exporting={exporting}
      />

      {error && (
        <div className="mb-4 flex gap-2.5 rounded-xl border border-destructive/40 bg-destructive/10 px-3.5 py-3 text-sm text-destructive">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
        </div>
      ) : report ? (
        <div ref={previewRef} className="report-paper rounded-2xl border p-5 shadow-card md:p-6">
          <ReportPreview report={report} />
        </div>
      ) : null}
    </div>
  );
}