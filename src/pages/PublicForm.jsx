import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { CheckCircle2, Loader2, AlertTriangle } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export default function PublicForm() {
  const { id } = useParams();
  const [form, setForm] = useState(null);
  const [answers, setAnswers] = useState({});
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        // A visitor has no CRM access — the form endpoint returns only the public fields.
        const res = await base44.functions.invoke("crmPublicFormSubmit", { form_id: id, action: "form" });
        if (res.data?.error) setError(res.data.error);
        else setForm(res.data?.form || null);
      } catch (e) {
        setError("Az űrlap nem található vagy már nem elérhető.");
      } finally { setLoading(false); }
    })();
  }, [id]);

  const accent = form?.accent_color || "#8549DE";

  const submit = async () => {
    setError("");
    setSending(true);
    try {
      const res = await base44.functions.invoke("crmPublicFormSubmit", { form_id: id, answers });
      if (res.data?.error) setError(res.data.error);
      else setSuccess(res.data?.message || form?.success_message || "Köszönjük!");
    } catch (e) {
      setError(e.message || "Nem sikerült elküldeni. Próbáld újra.");
    } finally { setSending(false); }
  };

  if (loading) return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  if (!form) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/40 p-6">
        <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-card">
          <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-amber-500" />
          <p className="text-sm text-muted-foreground">{error || "Az űrlap nem elérhető."}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4 sm:p-8">
      <div className="w-full max-w-xl overflow-hidden rounded-3xl border border-border bg-card shadow-card">
        <div className="h-1.5 w-full" style={{ background: accent }} />
        <div className="p-6 sm:p-8">
          <h1 className="font-heading text-2xl font-bold">{form.title}</h1>
          {form.description && <p className="mt-2 text-sm text-muted-foreground">{form.description}</p>}

          {success ? (
            <div className="mt-8 flex flex-col items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center dark:border-emerald-500/30 dark:bg-emerald-500/10">
              <CheckCircle2 className="h-10 w-10 text-emerald-500" />
              <p className="font-heading font-semibold text-emerald-700 dark:text-emerald-400">{success}</p>
            </div>
          ) : (
            <div className="mt-6 space-y-4">
              {(form.fields || []).map((field, i) => {
                const value = answers[field.label] ?? "";
                const common = {
                  id: `field-${i}`,
                  value,
                  onChange: (e) => setAnswers({ ...answers, [field.label]: field.field_type === "checkbox" ? e.target.checked : e.target.value }),
                  placeholder: field.placeholder || "",
                  required: !!field.required,
                };
                return (
                  <div key={i}>
                    <Label htmlFor={`field-${i}`}>{field.label}{field.required ? " *" : ""}</Label>
                    <div className="mt-1.5">
                      {field.field_type === "textarea" && <Textarea {...common} rows={4} />}
                      {field.field_type === "select" && (
                        <select {...common}
                          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                          <option value="">Válassz…</option>
                          {(field.options || "").split(",").map((o) => o.trim()).filter(Boolean).map((o) => (
                            <option key={o} value={o}>{o}</option>
                          ))}
                        </select>
                      )}
                      {field.field_type === "checkbox" && (
                        <label className="flex items-center gap-2 text-sm">
                          <input type="checkbox" checked={!!value}
                            onChange={(e) => setAnswers({ ...answers, [field.label]: e.target.checked })}
                            className="h-4 w-4 rounded border-border" />
                          {field.placeholder || "Igen"}
                        </label>
                      )}
                      {!["textarea", "select", "checkbox"].includes(field.field_type) && (
                        <Input {...common} type={field.field_type === "number" ? "number" : field.field_type === "date" ? "date" : field.field_type === "email" ? "email" : field.field_type === "phone" ? "tel" : "text"} />
                      )}
                    </div>
                  </div>
                );
              })}

              {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">{error}</p>}

              <Button onClick={submit} disabled={sending} className="w-full text-white" style={{ background: accent }}>
                {sending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Küldés…</> : (form.button_text || "Küldés")}
              </Button>
              <p className="text-center text-[11px] text-muted-foreground">Az adataidat biztonságosan tároljuk, és kizárólag a megkeresésedre használjuk.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}