import React from "react";
import { ChevronLeft, ChevronRight, Clock, ExternalLink, Phone } from "lucide-react";
import { cn } from "@/lib/utils";
import { daysAgoLabel } from "@/lib/format";

function MetaRow({ label, value }) {
  return (
    <div className="truncate">
      <span className="text-muted-foreground">{label}: </span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function IconButton({ icon: Icon, title, disabled, onClick }) {
  return (
    <button type="button" title={title} disabled={disabled} onClick={onClick}
      className="tap-lg rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent/10 hover:text-accent disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted-foreground">
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}

// A tábla kártyája: a kapcsolat adatai a referencia-elrendezés szerint
// (Név | Cég, elérhetőségek, címkék, eltelt idő, gyors műveletek).
export default function PipelineCard({
  contact, accountName, canBack, canForward, onOpen, onMove,
  innerRef, draggableProps, dragHandleProps,
}) {
  const tags = (contact.tags || []).filter(Boolean);

  return (
    <div ref={innerRef} {...draggableProps} {...dragHandleProps} onClick={onOpen}
      className={cn("rounded-lg border border-border bg-card p-2.5 shadow-sm transition-colors hover:border-accent/50",
        dragHandleProps && "cursor-grab active:cursor-grabbing")}>

      <div className="flex items-baseline gap-1.5 text-[13px] font-semibold leading-tight">
        <span className="truncate">{contact.name}</span>
        {contact.company && (
          <>
            <span className="shrink-0 text-muted-foreground">|</span>
            <span className="truncate font-medium text-muted-foreground">{contact.company}</span>
          </>
        )}
      </div>

      <div className="mt-1.5 space-y-0.5 text-[11px] leading-snug">
        {contact.company && <MetaRow label="Cégnév" value={contact.company} />}
        {contact.phone && <MetaRow label="Telefon" value={contact.phone} />}
        {contact.email && <MetaRow label="E-mail" value={contact.email} />}
      </div>

      {(tags.length > 0 || accountName) && (
        <div className="mt-2 flex flex-wrap gap-1">
          {tags.slice(0, 3).map((t) => (
            <span key={t} className="rounded-md bg-accent/15 px-1.5 py-0.5 text-[10px] font-semibold text-accent">{t}</span>
          ))}
          {accountName && (
            <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">{accountName}</span>
          )}
        </div>
      )}

      <div className="mt-2 flex flex-wrap items-center justify-between gap-1">
        <span className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
          <Clock className="h-3 w-3" /> {daysAgoLabel(contact.updated_date || contact.created_date)}
        </span>
        <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
          <IconButton icon={ChevronLeft} title="Előző fázis" disabled={!canBack} onClick={() => onMove(-1)} />
          <IconButton icon={ChevronRight} title="Következő fázis" disabled={!canForward} onClick={() => onMove(1)} />
          <IconButton icon={ExternalLink} title="Kapcsolat megnyitása" onClick={onOpen} />
          {contact.phone
            ? <a href={`tel:${contact.phone}`} title="Hívás" className="tap-lg rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent/10 hover:text-accent"><Phone className="h-3.5 w-3.5" /></a>
            : <IconButton icon={Phone} title="Nincs telefonszám" disabled />}
        </div>
      </div>
    </div>
  );
}