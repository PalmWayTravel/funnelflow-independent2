import React, { useState, useRef, useEffect } from "react";
import { Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

export default function TwoStepDelete({ onDelete, label = "Delete", className, size = "sm" }) {
  const [armed, setArmed] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const arm = () => {
    setArmed(true);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setArmed(false), 4000);
  };

  const confirm = (e) => {
    e.stopPropagation();
    clearTimeout(timerRef.current);
    setArmed(false);
    onDelete();
  };

  if (armed) {
    return (
      <button
        type="button"
        onClick={confirm}
        onBlur={() => setArmed(false)}
        autoFocus
        className={cn(
          "tap-lg inline-flex items-center gap-1.5 rounded-lg bg-red-500 font-semibold text-white shadow-sm transition-colors hover:bg-red-600",
          size === "sm" ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm",
          className
        )}
      >
        <Trash2 className="h-3.5 w-3.5" /> Biztos?
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); arm(); }}
      className={cn(
        "tap-lg inline-flex items-center gap-1.5 rounded-lg border border-red-300 font-semibold text-red-600 transition-colors hover:bg-red-50 dark:border-red-500/40 dark:text-red-400 dark:hover:bg-red-500/10",
        size === "sm" ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm",
        className
      )}
    >
      <Trash2 className="h-3.5 w-3.5" /> {label}
    </button>
  );
}