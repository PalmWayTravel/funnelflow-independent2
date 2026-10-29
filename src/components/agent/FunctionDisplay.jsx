import React, { useState } from "react";
import { Check, ChevronRight, Loader2, Wrench, X } from "lucide-react";

const isFailed = (toolCall) => {
  if (["failed", "error"].includes(toolCall.status)) return true;
  const raw = typeof toolCall.results === "string" ? toolCall.results : JSON.stringify(toolCall.results || {});
  if (/error|failed/i.test(raw)) return true;
  try {
    const parsed = typeof toolCall.results === "string" ? JSON.parse(toolCall.results) : toolCall.results;
    return parsed?.success === false;
  } catch (e) {
    return false;
  }
};

const isRunning = (toolCall) => ["pending", "running", "in_progress"].includes(toolCall.status);

const pretty = (value) => {
  try {
    return JSON.stringify(typeof value === "string" ? JSON.parse(value) : value, null, 2);
  } catch (e) {
    return String(value ?? "");
  }
};

export default function FunctionDisplay({ toolCall }) {
  const [expanded, setExpanded] = useState(false);
  const failed = isFailed(toolCall);
  const running = isRunning(toolCall);
  const projection = toolCall.display_projection || {};
  const hidden = projection.hide_details && projection.details_redacted;
  const label = projection.label || toolCall.name || "Eszköz";
  const statusText = running
    ? (projection.active_label || "fut…")
    : failed
      ? (projection.error_label || "sikertelen")
      : label;

  if (hidden) {
    return (
      <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
        {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : failed ? <X className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
        <span>{statusText}</span>
      </div>
    );
  }

  return (
    <div className="mt-2 text-xs">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 rounded-lg border border-border bg-secondary/60 px-2 py-1 text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronRight className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-90" : ""}`} />
        <Wrench className="h-3.5 w-3.5" />
        <span className="font-medium">{label}</span>
        {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : failed ? <X className="h-3.5 w-3.5 text-destructive" /> : <Check className="h-3.5 w-3.5 text-emerald-600" />}
      </button>
      {expanded && (
        <div className="mt-2 space-y-2 rounded-lg border border-border bg-secondary/40 p-2">
          {toolCall.arguments_string && (
            <div>
              <div className="mb-1 font-semibold uppercase tracking-wide text-muted-foreground">Paraméterek</div>
              <pre className="max-h-40 overflow-auto whitespace-pre-wrap">{pretty(toolCall.arguments_string)}</pre>
            </div>
          )}
          {toolCall.results != null && toolCall.results !== "" && (
            <div>
              <div className="mb-1 font-semibold uppercase tracking-wide text-muted-foreground">Eredmény</div>
              <pre className="max-h-40 overflow-auto whitespace-pre-wrap">{pretty(toolCall.results)}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}