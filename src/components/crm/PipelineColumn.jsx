import React, { useState } from "react";
import { Draggable, Droppable } from "@hello-pangea/dnd";
import { ChevronDown, ChevronRight, GripVertical, Pencil } from "lucide-react";
import PipelineCard from "@/components/crm/PipelineCard";
import { cn } from "@/lib/utils";

// Egy oszlop: fejléc (fogantyú, szín, emoji, név, darabszám, szerkesztés, összecsukás),
// alatta a kártyák, legalul pedig az összecsukható "Elveszett" gyűjtő.
export default function PipelineColumn({
  name, emoji, color, items, lostItems, droppableId, stageIndex, stageTotal,
  onOpenContact, onOpenStage, onMoveContact, accountNameOf,
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [lostOpen, setLostOpen] = useState(false);
  const canBack = stageIndex > 0;
  const canForward = stageIndex < stageTotal - 1;

  const renderCard = (contact, drag) => (
    <PipelineCard key={contact.id} contact={contact} accountName={accountNameOf(contact.account_id)}
      canBack={canBack} canForward={canForward}
      onOpen={() => onOpenContact(contact)} onMove={(dir) => onMoveContact(contact, dir)}
      innerRef={drag?.innerRef} draggableProps={drag?.draggableProps} dragHandleProps={drag?.dragHandleProps} />
  );

  const renderList = (provided, snapshot) => (
    <div ref={provided?.innerRef} {...(provided?.droppableProps || {})}
      className={cn("min-h-[180px] space-y-2 rounded-lg bg-muted/40 p-1.5 transition-colors", snapshot?.isDraggingOver && "bg-primary/5")}>
      {items.map((c, i) => (droppableId
        ? <Draggable key={c.id} draggableId={c.id} index={i}>{(prov) => renderCard(c, prov)}</Draggable>
        : renderCard(c)))}
      {provided?.placeholder}
      {items.length === 0 && (
        <div className="rounded-lg border border-dashed border-border py-8 text-center text-[11px] text-muted-foreground">
          Húzz ide kapcsolatot
        </div>
      )}
    </div>
  );

  return (
    <div className="flex w-[280px] shrink-0 flex-col">
      <div className="mb-2 flex items-center gap-1 rounded-lg border border-border bg-card px-2 py-1.5 shadow-sm">
        <GripVertical className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
        {emoji && <span className="shrink-0 text-[13px] leading-none">{emoji}</span>}
        <span className="min-w-0 flex-1 truncate font-heading text-[13px] font-semibold">{name}</span>
        <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">
          {items.length + lostItems.length} kapcsolat
        </span>
        {onOpenStage && (
          <button type="button" onClick={onOpenStage} title="Fázis szerkesztése"
            className="tap-lg rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent/10 hover:text-accent">
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
        <button type="button" onClick={() => setCollapsed((v) => !v)} title={collapsed ? "Kinyitás" : "Összecsukás"}
          className="tap-lg rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent/10 hover:text-accent">
          {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
      </div>

      {!collapsed && (droppableId
        ? <Droppable droppableId={droppableId}>{renderList}</Droppable>
        : renderList())}

      <button type="button" onClick={() => setLostOpen((v) => !v)}
        className="mt-2 flex w-full items-center justify-between gap-2 rounded-lg border border-border bg-muted/60 px-2.5 py-1.5 text-[11px] font-semibold text-muted-foreground transition-colors hover:bg-muted">
        <span className="flex items-center gap-1">
          {lostOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />} Elveszett
        </span>
        <span className="rounded-full bg-card px-1.5 py-0.5 text-[10px] font-bold">{lostItems.length}</span>
      </button>

      {lostOpen && (lostItems.length > 0
        ? <div className="mt-1.5 space-y-2">{lostItems.map((c) => renderCard(c))}</div>
        : <p className="mt-1.5 rounded-lg border border-dashed border-border py-3 text-center text-[11px] text-muted-foreground">Nincs elveszett kapcsolat</p>)}
    </div>
  );
}