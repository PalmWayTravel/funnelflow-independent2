import React from "react";

export default function ReportPreview({ report }) {
  return (
    <div className="text-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-3">
        <div>
          <h2 className="font-heading text-lg font-bold">{report.title}</h2>
          <p className="text-xs text-muted-foreground">{report.periodLabel}</p>
        </div>
        <p className="text-xs text-muted-foreground">Készült: {report.generatedAt}</p>
      </div>

      {report.summary?.length > 0 && (
        <table className="mt-4 w-full">
          <tbody>
            {report.summary.map((s) => (
              <tr key={s.label} className="border-b border-border last:border-0">
                <td className="py-2 text-muted-foreground">{s.label}</td>
                <td className="py-2 text-right font-semibold">{s.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {report.rows?.length > 0 && (
        <table className="mt-4 w-full">
          <thead>
            <tr className="border-b border-border text-left text-[11px] uppercase text-muted-foreground">
              {report.columns.map((c) => (
                <th key={c.key} className={`py-2 font-semibold ${c.right ? "text-right" : ""}`}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {report.rows.map((r, i) => (
              <tr key={i} className="border-b border-border last:border-0">
                {report.columns.map((c) => (
                  <td key={c.key} className={`py-1.5 ${c.right ? "text-right font-semibold" : ""}`}>{r[c.key]}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {report.note && <p className="mt-3 text-xs text-muted-foreground">{report.note}</p>}
    </div>
  );
}