"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CalendarDays, MessageSquareText, X } from "lucide-react";
import type {
  AnuncioDto,
  FichaDto,
  FichaValue,
  PriorityValue,
  StageDto,
} from "@/lib/types";
import { formatMoneyCents, parseMoneyToCents } from "@/lib/money";
import { cn, formatPhone } from "@/lib/utils";
import { AnuncioOrigen } from "@/components/anuncio-origen";
import { ContactAvatar } from "@/components/avatar";
import { FichaPanel } from "@/components/ficha-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Reschedule } from "@/components/bookings/booking-drawer";
import { PriorityPicker } from "./priority-picker";
import type { BoardLead } from "./pipeline-client";

/**
 * El trato, abierto, sin salir del tablero.
 *
 * Antes el clic en una tarjeta no hacía nada: para ver de quién era había que
 * irse a la bandeja y volver, y revisando una columna de quince eso son treinta
 * viajes. El cajón contesta la pregunta "¿quién es y cómo va?" en el sitio
 * donde uno la hace.
 */
export function LeadDrawer({
  lead,
  stages,
  currency,
  agenda,
  onBooked,
  onClose,
  onMoveStage,
  onAmount,
  onPriority,
}: {
  lead: BoardLead;
  stages: StageDto[];
  /** Moneda del negocio, para el lead que aún no tiene la suya. */
  currency: string;
  /** null = agenda apagada: no se ofrece agendar. */
  agenda: { today: string } | null;
  /** Se agendó una visita: el tablero se recarga (tarjeta y etapa). */
  onBooked: () => void;
  onClose: () => void;
  /** Pasa por el mismo camino que el arrastre: perder exige motivo. */
  onMoveStage: (stageId: string) => void;
  onAmount: (cents: number | null) => void;
  onPriority: (value: PriorityValue | null) => void;
}) {
  const [ficha, setFicha] = useState<FichaDto>({});
  // 018: de qué anuncio llegó; null si escribió por su cuenta.
  const [anuncio, setAnuncio] = useState<AnuncioDto | null>(null);
  const [monto, setMonto] = useState("");
  const [editandoMonto, setEditandoMonto] = useState(false);
  const [agendando, setAgendando] = useState(false);
  const [guardandoVisita, setGuardandoVisita] = useState(false);
  const [errorVisita, setErrorVisita] = useState<string | null>(null);

  const contactId = lead.contact.id;
  const moneda = lead.currency ?? currency;

  const cargarFicha = useCallback(async () => {
    const detail = await fetch(`/api/contacts/${contactId}`)
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    setFicha(detail?.contact?.ficha ?? {});
    setAnuncio(detail?.anuncio ?? null);
  }, [contactId]);

  // Al abrir otro trato no puede asomarse el anuncio del anterior (ni quedar
  // abierto el selector de horarios del otro).
  useEffect(() => {
    setAnuncio(null);
    setAgendando(false);
    setErrorVisita(null);
  }, [contactId]);

  useEffect(() => {
    setEditandoMonto(false);
    setMonto(lead.amountCents === null ? "" : (lead.amountCents / 100).toFixed(2));
    void cargarFicha();
  }, [cargarFicha, lead.amountCents]);

  // Escape cierra: un cajón que solo se cierra con el ratón estorba a quien
  // revisa el tablero con el teclado.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function guardarFicha(patch: Record<string, FichaValue | null>) {
    setFicha((prev) => {
      const next = { ...prev };
      for (const [k, v] of Object.entries(patch)) {
        if (v === null) delete next[k];
        else next[k] = v;
      }
      return next;
    });
    await fetch(`/api/contacts/${contactId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ficha: patch }),
    }).catch(() => null);
    void cargarFicha();
  }

  /**
   * La visita entra a la agenda (Citas) con día y hora; el servidor mueve el
   * trato a la etapa de visita agendada. Solo se ofrecen horarios libres, así
   * dos asesores no prometen la misma hora.
   */
  async function agendarVisita(startUtc: string) {
    setGuardandoVisita(true);
    setErrorVisita(null);
    const res = await fetch("/api/bookings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: "session",
        contactId,
        conversationId: lead.conversationId,
        startUtc,
      }),
    }).catch(() => null);
    setGuardandoVisita(false);
    if (!res?.ok) {
      const data = (await res?.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setErrorVisita(data?.error?.message ?? "No se pudo agendar la visita. Intenta de nuevo.");
      return;
    }
    setAgendando(false);
    onBooked();
  }

  const montoParseado = monto.trim() ? parseMoneyToCents(monto) : null;
  const montoInvalido = monto.trim().length > 0 && montoParseado === null;

  return (
    <>
      {/* Velo: cerrar tocando fuera es lo que uno intenta primero. */}
      <button
        aria-label="Cerrar el trato"
        tabIndex={-1}
        onClick={onClose}
        className="fixed inset-0 z-40 bg-overlay"
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`Trato de ${lead.contact.name}`}
        className="fixed inset-y-0 right-0 z-50 flex w-[min(360px,92vw)] flex-col border-l bg-popover shadow-pop"
      >
        <header className="flex items-center justify-between border-b px-4 py-3">
          <h3 className="kicker text-text-2">
            Trato
          </h3>
          <button
            onClick={onClose}
            aria-label="Cerrar el panel del trato"
            className="rounded p-1 text-text-3 hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" strokeWidth={1.7} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto">
          {/* Quién */}
          <section className="border-b p-4">
            <div className="flex items-center gap-3">
              <ContactAvatar
                name={lead.contact.name}
                seed={lead.contact.id}
                size="md"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-[650]">{lead.contact.name}</p>
                <p className="text-xs text-text-3">
                  {formatPhone(lead.contact.phone)}
                </p>
              </div>
            </div>

            {lead.conversationId ? (
              <Link
                href={`/inbox?contact=${lead.contact.id}`}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-md border bg-secondary px-3 py-2 text-sm font-medium hover:bg-accent"
              >
                <MessageSquareText className="h-4 w-4" /> Abrir conversación
              </Link>
            ) : (
              <p className="mt-3 text-xs text-text-3">
                Todavía no hay conversación con este contacto.
              </p>
            )}

            {anuncio && (
              <div className="mt-3">
                <AnuncioOrigen anuncio={anuncio} />
              </div>
            )}
          </section>

          {/* Cuándo visita */}
          {agenda && (agendando ? (
            <>
              <Reschedule
                today={agenda.today}
                busy={guardandoVisita}
                title="Agendar visita"
                onCancel={() => setAgendando(false)}
                onPick={(startUtc) => void agendarVisita(startUtc)}
              />
              {errorVisita && (
                <p role="alert" className="border-b px-4 py-2 text-xs text-destructive">
                  {errorVisita}
                </p>
              )}
            </>
          ) : (
            <section className="border-b p-4">
              <p className="mb-2 kicker">Visita</p>
              {lead.nextVisit ? (
                <div className="space-y-2">
                  <p className="flex items-center gap-2 text-sm font-semibold first-letter:uppercase">
                    <CalendarDays className="h-4 w-4 shrink-0 text-brand" />
                    {lead.nextVisit.label}
                  </p>
                  <Link
                    href={`/bookings?vista=semana&fecha=${lead.nextVisit.dayIso}`}
                    className="text-xs font-medium text-brand-text hover:underline"
                  >
                    Ver en el calendario →
                  </Link>
                </div>
              ) : (
                <Button size="sm" className="w-full" onClick={() => setAgendando(true)}>
                  <CalendarDays className="h-4 w-4" /> Agendar visita
                </Button>
              )}
            </section>
          ))}

          {/* Cuánto */}
          <section className="border-b p-4">
            <p className="mb-2 kicker">
              Monto ({moneda})
            </p>
            {editandoMonto ? (
              <>
                <Input
                  autoFocus
                  value={monto}
                  onChange={(e) => setMonto(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !montoInvalido) {
                      setEditandoMonto(false);
                      onAmount(montoParseado);
                    }
                    if (e.key === "Escape") setEditandoMonto(false);
                  }}
                  placeholder="12,500"
                  aria-label="Monto del trato"
                  className="h-8 text-sm"
                />
                <p className="mt-1 text-xs text-text-3">
                  {montoInvalido
                    ? "No se entiende ese importe."
                    : montoParseado === null
                      ? "Déjalo vacío para quitar el monto."
                      : `Se guardará como ${formatMoneyCents(montoParseado, moneda)}`}
                </p>
                <div className="mt-2 flex gap-1.5">
                  <Button
                    size="sm"
                    disabled={montoInvalido}
                    onClick={() => {
                      setEditandoMonto(false);
                      onAmount(montoParseado);
                    }}
                  >
                    Guardar
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditandoMonto(false)}
                  >
                    Cancelar
                  </Button>
                </div>
              </>
            ) : (
              <button
                onClick={() => setEditandoMonto(true)}
                aria-label="Editar el monto"
                className={cn(
                  "w-full rounded px-1 py-1 text-left text-sm tabular-nums hover:bg-accent",
                  lead.amountCents === null
                    ? "text-text-3"
                    : "font-semibold text-foreground"
                )}
              >
                {lead.amountCents === null
                  ? "Sin monto — captúralo"
                  : formatMoneyCents(lead.amountCents, moneda)}
              </button>
            )}
          </section>

          {/* A quién llamar primero */}
          <section className="border-b p-4">
            <p className="mb-2 kicker">
              Prioridad
            </p>
            <PriorityPicker value={lead.priority} onChange={onPriority} />
          </section>

          {/* Dónde va */}
          <section className="border-b p-4">
            <p className="mb-2 kicker">
              Etapa
            </p>
            <div className="flex flex-wrap gap-1.5">
              {stages.map((s) => {
                const actual = s.id === lead.stageId;
                return (
                  <button
                    key={s.id}
                    onClick={() => !actual && onMoveStage(s.id)}
                    aria-pressed={actual}
                    aria-label={`Mover a ${s.name}`}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-xs transition-colors",
                      actual
                        ? "border-brand bg-brand-tint font-semibold text-brand-text"
                        : "border-border text-text-2 hover:bg-accent"
                    )}
                  >
                    {s.name}
                  </button>
                );
              })}
            </div>
          </section>

          {/* Qué se sabe */}
          <FichaPanel ficha={ficha} onSave={guardarFicha} />
        </div>
      </aside>
    </>
  );
}
