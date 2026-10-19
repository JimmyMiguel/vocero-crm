"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  AlertTriangle,
  Hand,
  MessageSquareText,
  Settings2,
  Trophy,
  XCircle,
} from "lucide-react";
import { cbmTexto, costoServicio, usd, type NodoFicha } from "@/lib/nodo";
import type { LossReason, PriorityValue, StageDto } from "@/lib/types";
import { formatMoneyCents, sumable } from "@/lib/money";
import { cn } from "@/lib/utils";
import { ContactAvatar } from "@/components/avatar";
import { Button } from "@/components/ui/button";
import { StageManager } from "./stage-manager";
import { LossReasonDialog } from "./loss-reason-dialog";
import { AmountDialog } from "./amount-dialog";
import { PriorityBadge } from "./priority-picker";
import { LeadDrawer } from "./lead-drawer";

export type BoardLead = {
  id: string;
  stageId: string;
  position: number;
  lastActivityAt: string | null;
  contact: { id: string; name: string; phone: string | null };
  conversationId: string | null;
  amountCents: number | null;
  currency: string | null;
  priority: PriorityValue | null;
  /** NODO */
  shipmentId: string | null;
  daysInStage: number;
  /** La IA pasó el caso a una persona y nadie lo ha tomado. */
  needsAction: boolean;
  /** El equipo tomó la conversación: la IA está en pausa. */
  aiPaused: boolean;
  nodo: NodoFicha;
};

export function PipelineClient() {
  const router = useRouter();
  const [soloAccion, setSoloAccion] = useState(false);
  const [stages, setStages] = useState<StageDto[]>([]);
  const [currency, setCurrency] = useState("MXN");
  const [leads, setLeads] = useState<BoardLead[]>([]);
  const [activeLead, setActiveLead] = useState<BoardLead | null>(null);
  const [managing, setManaging] = useState(false);
  /** Arrastre hacia una etapa perdida, esperando el motivo. */
  const [pendingLoss, setPendingLoss] = useState<{
    leadId: string;
    stageId: string;
    name: string;
  } | null>(null);
  /** Tarjeta cuyo monto se está capturando. */
  const [editandoMonto, setEditandoMonto] = useState<BoardLead | null>(null);
  /**
   * Trato abierto en el cajón. Se guarda el ID y no el objeto: así el cajón
   * lee siempre del tablero y refleja al instante lo que se cambie desde
   * dentro, en vez de enseñar una copia que envejece.
   */
  const [abiertoId, setAbiertoId] = useState<string | null>(null);
  const abierto = leads.find((l) => l.id === abiertoId) ?? null;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  const refetch = useCallback(async () => {
    const res = await fetch("/api/pipeline/board").catch(() => null);
    if (!res?.ok) return;
    const data = (await res.json()) as {
      stages: StageDto[];
      leads: BoardLead[];
      currency?: string;
    };
    if (data.currency) setCurrency(data.currency);
    setStages(data.stages);
    setLeads(data.leads);
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  function onDragStart(event: DragStartEvent) {
    const lead = leads.find((l) => l.id === event.active.id);
    setActiveLead(lead ?? null);
  }

  async function moverLead(
    leadId: string,
    overStage: string,
    loss?: { reason: LossReason; note: string }
  ) {
    const position = leads.filter((l) => l.stageId === overStage).length;
    // Optimista + persistencia
    setLeads((prev) =>
      prev.map((l) => (l.id === leadId ? { ...l, stageId: overStage, position } : l))
    );
    await fetch(`/api/pipeline/leads/${leadId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        stageId: overStage,
        position,
        ...(loss
          ? { lossReason: loss.reason, ...(loss.note ? { lossNote: loss.note } : {}) }
          : {}),
      }),
    }).catch(() => null);
    void refetch();
  }

  async function guardarMonto(leadId: string, cents: number | null) {
    setLeads((prev) =>
      prev.map((l) => (l.id === leadId ? { ...l, amountCents: cents } : l))
    );
    await fetch(`/api/pipeline/leads/${leadId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      // Sin `stageId`: esto NO mueve la tarjeta, solo escribe el importe.
      body: JSON.stringify({ amountCents: cents }),
    }).catch(() => null);
    void refetch();
  }

  /**
   * "Tomar conversación": pausa la IA en ese chat y lleva al equipo a la
   * bandeja para responder él mismo.
   */
  async function tomarConversacion(lead: BoardLead) {
    if (!lead.conversationId) return;
    setLeads((prev) =>
      prev.map((l) =>
        l.id === lead.id ? { ...l, aiPaused: true, needsAction: false } : l
      )
    );
    await fetch(`/api/conversations/${lead.conversationId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ aiEnabled: false }),
    }).catch(() => null);
    router.push(`/inbox?contact=${lead.contact.id}`);
  }

  const pendientes = leads.filter((l) => l.needsAction).length;

  async function guardarPrioridad(leadId: string, priority: PriorityValue | null) {
    setLeads((prev) =>
      prev.map((l) => (l.id === leadId ? { ...l, priority } : l))
    );
    await fetch(`/api/pipeline/leads/${leadId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ priority }),
    }).catch(() => null);
    void refetch();
  }

  async function onDragEnd(event: DragEndEvent) {
    setActiveLead(null);
    const leadId = String(event.active.id);
    const overStage = event.over ? String(event.over.id) : null;
    if (!overStage) return;
    const lead = leads.find((l) => l.id === leadId);
    if (!lead || lead.stageId === overStage) return;

    // Perder un trato exige motivo. Se pregunta ANTES de mover: si el dueño
    // cancela, la tarjeta ni siquiera parpadea fuera de su columna.
    const destino = stages.find((s) => s.id === overStage);
    if (destino?.kind === "lost") {
      setPendingLoss({ leadId, stageId: overStage, name: lead.contact.name });
      return;
    }

    await moverLead(leadId, overStage);
  }

  /**
   * Cambiar de etapa desde el cajón. Entra por la MISMA puerta que el
   * arrastre: perder un trato exige motivo venga de donde venga, y duplicar
   * esa regla aquí sería tener dos sitios donde olvidarla.
   */
  function moverDesdeCajon(leadId: string, stageId: string) {
    const lead = leads.find((l) => l.id === leadId);
    if (!lead || lead.stageId === stageId) return;
    const destino = stages.find((s) => s.id === stageId);
    if (destino?.kind === "lost") {
      setPendingLoss({ leadId, stageId, name: lead.contact.name });
      return;
    }
    void moverLead(leadId, stageId);
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3 sm:px-6 sm:py-4">
        <div>
          <h2 className="text-[17px] font-bold tracking-tight">Pipeline de importaciones</h2>
          <p className="text-xs text-text-3">
            {leads.length} clientes · arrastra las tarjetas para cambiar de etapa
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSoloAccion((v) => !v)}
            aria-pressed={soloAccion}
            className={cn(
              "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
              soloAccion
                ? "border-warning-soft bg-warning-tint text-warning-text"
                : "border-border-strong text-warning-text hover:bg-accent"
            )}
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            {pendientes} requieren acción
          </button>
          <Button variant="outline" size="sm" onClick={() => setManaging(true)}>
            <Settings2 className="h-4 w-4" /> Gestionar etapas
          </Button>
        </div>
      </header>

      {/* El tablero se arrastra en horizontal; en el teléfono cada columna
          se detiene en su sitio (snap) para no quedar a medio camino. */}
      <div className="flex-1 snap-x snap-mandatory overflow-x-auto p-3 sm:snap-none sm:p-4">
        <DndContext
          sensors={sensors}
          onDragStart={onDragStart}
          onDragEnd={(e) => void onDragEnd(e)}
        >
          <div className="flex h-full gap-3">
            {stages.map((stage) => (
              <StageColumn
                key={stage.id}
                stage={stage}
                currency={currency}
                onEditAmount={setEditandoMonto}
                onOpen={(l) => setAbiertoId(l.id)}
                onTake={(l) => void tomarConversacion(l)}
                leads={leads
                  .filter((l) => l.stageId === stage.id)
                  .filter((l) => !soloAccion || l.needsAction)
                  .sort((a, b) => a.position - b.position)}
              />
            ))}
          </div>
          <DragOverlay>
            {activeLead ? (
              <LeadCard lead={activeLead} currency={currency} overlay />
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>

      {managing && (
        <StageManager
          stages={stages}
          onClose={() => setManaging(false)}
          onChanged={() => void refetch()}
        />
      )}

      {/* Va ANTES que los diálogos: con el mismo z-index, el que se pinta
          después queda encima, y el motivo de pérdida debe tapar al cajón. */}
      {abierto && (
        <LeadDrawer
          lead={abierto}
          stages={stages}
          currency={currency}
          onClose={() => setAbiertoId(null)}
          onMoveStage={(stageId) => moverDesdeCajon(abierto.id, stageId)}
          onAmount={(cents) => void guardarMonto(abierto.id, cents)}
          onPriority={(p) => void guardarPrioridad(abierto.id, p)}
          onTake={() => void tomarConversacion(abierto)}
          onChanged={() => void refetch()}
        />
      )}

      {editandoMonto && (
        <AmountDialog
          leadName={editandoMonto.contact.name}
          currency={editandoMonto.currency ?? currency}
          amountCents={editandoMonto.amountCents}
          priority={editandoMonto.priority}
          onPriorityChange={(p) => {
            setEditandoMonto({ ...editandoMonto, priority: p });
            void guardarPrioridad(editandoMonto.id, p);
          }}
          onCancel={() => setEditandoMonto(null)}
          onSave={(cents) => {
            const leadId = editandoMonto.id;
            setEditandoMonto(null);
            void guardarMonto(leadId, cents);
          }}
        />
      )}

      {pendingLoss && (
        <LossReasonDialog
          leadName={pendingLoss.name}
          onCancel={() => setPendingLoss(null)}
          onConfirm={(reason, note) => {
            const { leadId, stageId } = pendingLoss;
            setPendingLoss(null);
            void moverLead(leadId, stageId, { reason, note });
          }}
        />
      )}
    </div>
  );
}

/**
 * Totales de una columna. Se calculan al pintar: un total guardado se
 * desincroniza en cuanto alguien mueve una tarjeta, y sumar unas decenas es
 * gratis. Todo en CENTAVOS enteros — el dinero jamás pasa por coma flotante.
 */
function totalesDeEtapa(leads: BoardLead[], businessCurrency: string) {
  let totalCents = 0;
  let sinMonto = 0;
  let otraMoneda = 0;

  for (const l of leads) {
    if (l.amountCents === null) {
      sinMonto++;
      continue;
    }
    if (!sumable({ amountCents: l.amountCents, currency: l.currency }, businessCurrency)) {
      otraMoneda++;
      continue;
    }
    totalCents += l.amountCents;
  }
  return { totalCents, sinMonto, otraMoneda };
}

function StageColumn({
  stage,
  leads,
  currency,
  onEditAmount,
  onOpen,
  onTake,
}: {
  stage: StageDto;
  leads: BoardLead[];
  currency: string;
  onEditAmount: (lead: BoardLead) => void;
  onOpen: (lead: BoardLead) => void;
  onTake: (lead: BoardLead) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex h-full w-[272px] shrink-0 snap-start flex-col rounded-lg border border-border-strong bg-subtle transition-[box-shadow,border-color]",
        isOver && "border-brand ring-[3px] ring-brand-soft"
      )}
    >
      <div className="flex items-center justify-between px-3 py-2.5">
        <span className="flex items-center gap-1.5 text-[13.5px] font-bold tracking-tight">
          {stage.kind === "won" && <Trophy className="h-3.5 w-3.5 text-primary" />}
          {stage.kind === "lost" && (
            <XCircle className="h-3.5 w-3.5 text-muted-foreground" />
          )}
          {stage.name}
        </span>
        <span className="rounded-full border border-border-strong bg-background px-2 py-0.5 font-mono text-[11px] text-text-3">
          {leads.length}
        </span>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto p-2">
        {leads.map((lead) => (
          <DraggableLead
            key={lead.id}
            lead={lead}
            currency={currency}
            onEditAmount={onEditAmount}
            onOpen={onOpen}
            onTake={onTake}
          />
        ))}
      </div>
      <CbmFooter leads={leads} />
    </div>
  );
}

/** NODO: CBM y costo estimado de la columna (CBM × $600, sin impuestos). */
function CbmFooter({ leads }: { leads: BoardLead[] }) {
  const cbm = leads.reduce((a, l) => a + (l.nodo.cbm ?? 0), 0);
  const sinCbm = leads.filter((l) => l.nodo.cbm === null).length;
  return (
    <div className="border-t px-3 py-2 text-[11px]">
      {cbm === 0 ? (
        <p className="text-muted-foreground">Sin CBM estimados</p>
      ) : (
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-muted-foreground">
            {cbmTexto(cbm)}
            {sinCbm > 0 ? ` · ${sinCbm} sin CBM` : ""}
          </span>
          <span className="font-semibold tabular-nums">${usd(costoServicio(cbm))}</span>
        </div>
      )}
    </div>
  );
}

/** Cuánto dinero hay en esta etapa, y qué quedó fuera de la cuenta. */
export function StageFooter({ leads, currency }: { leads: BoardLead[]; currency: string }) {
  const { totalCents, sinMonto, otraMoneda } = totalesDeEtapa(leads, currency);
  const conMonto = leads.length - sinMonto - otraMoneda;

  return (
    <div className="border-t px-3 py-2 text-[11px]">
      {conMonto === 0 ? (
        // Un "$0.00" aquí se lee como un error del sistema, no como un dato.
        <p className="text-muted-foreground">Sin montos capturados</p>
      ) : (
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-muted-foreground">
            Total{sinMonto > 0 ? ` · ${sinMonto} sin monto` : ""}
          </span>
          <span className="font-semibold tabular-nums">
            {formatMoneyCents(totalCents, currency)}
          </span>
        </div>
      )}
      {otraMoneda > 0 && (
        // Descartarlos en silencio haría que el total mintiera sin que nadie
        // pudiera notarlo.
        <p className="mt-0.5 text-warning-text">
          {otraMoneda} en otra moneda, fuera del total
        </p>
      )}
    </div>
  );
}

function DraggableLead({
  lead,
  currency,
  onEditAmount,
  onOpen,
  onTake,
}: {
  lead: BoardLead;
  currency: string;
  onEditAmount: (lead: BoardLead) => void;
  onOpen: (lead: BoardLead) => void;
  onTake: (lead: BoardLead) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: lead.id,
  });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      // Abrir y arrastrar conviven porque el sensor solo activa el arrastre a
      // los 6 px de movimiento: un clic quieto nunca llega a ser un arrastre.
      // Los controles de dentro de la tarjeta cortan la propagación, para que
      // tocar "+ monto" no abra además el cajón.
      onClick={() => onOpen(lead)}
      // dnd-kit ya deja el nodo con `role="button"` y `tabIndex`, pero un div
      // no dispara `click` con el teclado: sin esto, el cajón sería alcanzable
      // solo con el ratón.
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(lead);
        }
      }}
      aria-label={`Abrir el trato de ${lead.contact.name}`}
      className={cn(isDragging && "opacity-40")}
    >
      <LeadCard lead={lead} currency={currency} onEditAmount={onEditAmount} onTake={onTake} />
    </div>
  );
}

function LeadCard({
  lead,
  overlay = false,
  onTake,
}: {
  lead: BoardLead;
  currency: string;
  overlay?: boolean;
  onEditAmount?: (lead: BoardLead) => void;
  onTake?: (lead: BoardLead) => void;
}) {
  const dias = lead.daysInStage;
  return (
    <div
      className={cn(
        "cursor-grab rounded-md border bg-card p-3 shadow-sm transition-shadow hover:shadow-md",
        lead.needsAction ? "border-warning" : "border-border-strong",
        overlay && "rotate-2 shadow-pop"
      )}
    >
      {lead.needsAction && (
        <p className="mb-2 flex items-center gap-1 rounded bg-warning-tint px-1.5 py-1 text-[11px] font-semibold text-warning-text">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          Requiere acción del equipo
        </p>
      )}
      <div className="flex items-start gap-2.5">
        <ContactAvatar name={lead.contact.name} seed={lead.contact.id} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-sm font-semibold">{lead.contact.name}</p>
            {lead.priority && <PriorityBadge value={lead.priority} />}
          </div>
          <p className="truncate text-xs text-text-2">
            {lead.nodo.producto ?? "Producto por definir"}
          </p>
        </div>
        {lead.conversationId && (
          <Link
            href={`/inbox?contact=${lead.contact.id}`}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            aria-label="Abrir conversación"
            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <MessageSquareText className="h-4 w-4" />
          </Link>
        )}
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 text-[11px]">
        <span className="rounded bg-brand-tint px-1.5 py-0.5 font-mono font-semibold text-brand-text">
          {cbmTexto(lead.nodo.cbm)}
        </span>
        <span
          className={cn(
            "tabular-nums",
            dias >= 7 ? "font-semibold text-warning-text" : "text-text-3"
          )}
          title="Días en esta etapa"
        >
          {dias === 0 ? "Hoy" : dias === 1 ? "1 día" : `${dias} días`} en la etapa
        </span>
      </div>
      {!overlay && onTake && lead.conversationId && (
        lead.aiPaused ? (
          <p className="mt-2 text-center text-[11px] text-text-3">
            IA en pausa · responde el equipo
          </p>
        ) : (
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onTake(lead);
            }}
            className={cn(
              "mt-2 flex w-full items-center justify-center gap-1.5 rounded border px-2 py-1 text-xs font-semibold transition-colors",
              lead.needsAction
                ? "border-brand bg-brand text-brand-fg hover:bg-brand-hover"
                : "border-border text-text-2 hover:bg-accent"
            )}
          >
            <Hand className="h-3.5 w-3.5" /> Tomar conversación
          </button>
        )
      )}
    </div>
  );
}
