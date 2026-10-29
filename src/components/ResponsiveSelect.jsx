import React, { useEffect, useState } from "react";
import { ChevronDown, Check } from "lucide-react";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { cn } from "@/lib/utils";

const MOBILE_QUERY = "(max-width: 1023px)";

// Keeps the desktop dropdown exactly as it is, and opens a native-style bottom
// sheet instead of a floating dropdown on phones and small tablets.
export default function ResponsiveSelect({ value, onValueChange, options = [], placeholder = "Válassz", className, disabled }) {
  const [isMobile, setIsMobile] = useState(() => (typeof window === "undefined" ? false : window.matchMedia(MOBILE_QUERY).matches));
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(MOBILE_QUERY);
    const onChange = (e) => setIsMobile(e.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  const selected = options.find((o) => o.value === value);

  if (!isMobile) {
    return (
      <Select value={value} onValueChange={onValueChange} disabled={disabled}>
        <SelectTrigger className={className}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  const pick = (next) => {
    onValueChange(next);
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className={cn(
          "flex h-9 w-full items-center justify-between gap-2 whitespace-nowrap rounded-md border border-input bg-transparent px-3 py-2 text-left text-sm shadow-sm disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
      >
        <span className={cn("truncate", !selected && "text-muted-foreground")}>{selected ? selected.label : placeholder}</span>
        <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
      </button>

      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent className="pointer-events-auto">
          <DrawerHeader>
            <DrawerTitle className="font-heading text-base">{placeholder}</DrawerTitle>
          </DrawerHeader>
          <div className="max-h-[60vh] overflow-y-auto px-2 pb-[calc(1.5rem+env(safe-area-inset-bottom))] scrollbar-thin">
            {options.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => pick(o.value)}
                className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium hover:bg-accent"
              >
                <span className={cn("truncate", o.value === value && "font-semibold text-primary")}>{o.label}</span>
                {o.value === value && <Check className="h-4 w-4 shrink-0 text-primary" />}
              </button>
            ))}
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}