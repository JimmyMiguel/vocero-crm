"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Bot,
  FileText,
  Hand,
  ImageIcon,
  MessageSquareText,
  User,
  X,
} from "lucide-react";
import type {
  AnuncioDto,
  FichaDto,
  FichaValue,
  MessageDto,
  PriorityValue,
  StageDto,
} from "@/lib/types";
import {
  NODO_CAMPOS,
  NODO_CLAVES,
  SERVICIOS,
  calcularInversion,
  cbmTexto,
  costoServicio,
  fechaCorta,
  leerNodoFicha,
  numeroCotizacion,
  usd,
} from "@/lib/nodo";
import { cn, formatPhone } from "@/lib/utils";
import { AnuncioOrigen } from "@/components/anuncio-origen";
import { ContactAvatar } from "@/components/avatar";
import { FichaPanel } from "@/components/ficha-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PriorityPicker } from "./priority-picker";
import type { BoardLead } from "./pipeline-client";

type ShipmentOpt = {
  id: string;
  name: string;
  departureDate: string;
};

type NodoDetalle = {
  notes: string | null;
  imageAssetId: string | null;
  quotes: { id: string; number: number; createdAt: string }[];
  shipments: ShipmentOpt[];
  nextShipmentId: string | null;
};

const CIUDADES = ["Quito", "Cuenca"];

/**
 * Ficha del cliente de NODO, abierta sin salir del tablero: datos de la
 * importación, costo estimado, contenedor, cotización en PDF y el historial
 * de lo que habló con la IA.
 */
export function LeadDrawer({
  lead,
  stages,
  onClose,
  onMoveStage,
  onPriority,
  onTake,
  onChanged,
}: {
  lead: BoardLead;
  stages: StageDto[];
  currency: string;
  onClose: () => void;
  /** Pasa por el mismo camino que el arrastre: perder exige motivo. */
  onMoveStage: (stageId: string) => void;
  onAmount: (cents: number | null) => void;
  onPriority: (value: PriorityValue | null) => void;
  onTake: () => void;
  onChanged: () => void;
}) {
  const [ficha, setFicha] = useState<FichaDto>({});
  const [anuncio, setAnuncio] = useState<AnuncioDto | null>(null);
  const [detalle, setDetalle] = useState<NodoDetalle | null>(null);
  const [mensajes, setMensajes] = useState<MessageDto[] | null>(null);
  const [notas, setNotas] = useState("");
  const [generando, setGenerando] = useState(false);

  const contactId = lead.contact.id;
  const nodo = leerNodoFicha(ficha);
  const inversion = calcularInversion(nodo);

  const cargar = useCallback(async () => {
    const [detail, extra] = await Promise.all([
      fetch(`/api/contacts/${contactId}`)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
      fetch(`/api/nodo/leads/${lead.id}`)
        .then((r) => (r.ok ? (r.json() as Promise<NodoDetalle>) : null))
        .catch(() => null),
    ]);
    setFicha(detail?.contact?.ficha ?? {});
    setAnuncio(detail?.anuncio ?? null);
    if (extra) {
      setDetalle(extra);
      setNotas(extra.notes ?? "");
    }
  }, [contactId, lead.id]);

  useEffect(() => {
    setAnuncio(null);
    setDetalle(null);
    setMensajes(null);
    void cargar();
  }, [cargar]);

  useEffect(() => {
    if (!lead.conversationId) return;
    void fetch(`/api/conversations/${lead.conversationId}/messages`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { messages: MessageDto[] } | null) => setMensajes(d?.messages ?? []))
      .catch(() => setMensajes([]));
  }, [lead.conversationId]);

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
    onChanged();
  }

  async function guardarContacto(patch: { name?: string; notes?: string | null }) {
    await fetch(`/api/contacts/${contactId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    }).catch(() => null);
    onChanged();
  }

  async function asignarContenedor(shipmentId: string | null) {
    await fetch(`/api/pipeline/leads/${lead.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ shipmentId }),
    }).catch(() => null);
    onChanged();
  }

  async function generarCotizacion() {
    // La pestaña se abre YA, dentro del clic: si se abre después del fetch el
    // navegador la toma por un popup y la bloquea.
    const tab = window.open("about:blank", "_blank");
    setGenerando(true);
    try {
      const res = await fetch("/api/nodo/quotes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ leadId: lead.id }),
      });
      const data = (await res.json().catch(() => null)) as { quote?: { id: string } } | null;
      if (data?.quote && tab) tab.location.href = `/cotizacion/${data.quote.id}?imprimir=1`;
      else tab?.close();
      void cargar();
    } finally {
      setGenerando(false);
    }
  }

  const num = (t: string): number | null => {
    const n = Number(t.replace(",", "."));
    return t.trim() && Number.isFinite(n) ? n : null;
  };

  const otros = Object.fromEntries(
    Object.entries(ficha).filter(([k]) => !NODO_CLAVES.includes(k))
  ) as FichaDto;

  const ciudadOtra = nodo.ciudad !== null && !CIUDADES.includes(nodo.ciudad);

  return (
    <>
      <button
        aria-label="Cerrar la ficha"
        tabIndex={-1}
        onClick={onClose}
        className="fixed inset-0 z-40 bg-overlay"
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`Ficha de ${lead.contact.name}`}
        className="fixed inset-y-0 right-0 z-50 flex w-[min(480px,96vw)] flex-col border-l bg-popover shadow-pop"
      >
        <header className="flex items-center justify-between border-b px-4 py-3">
          <h3 className="kicker text-text-2">Ficha de cliente</h3>
          <button
            onClick={onClose}
            aria-label="Cerrar la ficha"
            className="rounded p-1 text-text-3 hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" strokeWidth={1.7} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto">
          {/* Quién y acciones */}
          <section className="border-b p-4">
            <div className="flex items-center gap-3">
              <ContactAvatar name={lead.contact.name} seed={lead.contact.id} size="md" />
              <div className="min-w-0 flex-1">
                <InlineText
                  value={lead.contact.name}
                  ariaLabel="Nombre"
                  className="text-sm font-[650]"
                  onSave={(v) => v && void guardarContacto({ name: v })}
                />
                <p className="mt-0.5 px-2 text-xs text-text-3">
                  WhatsApp: {formatPhone(lead.contact.phone)}
                </p>
              </div>
            </div>

            {lead.needsAction && (
              <p className="mt-3 flex items-center gap-1.5 rounded-md border border-warning-soft bg-warning-tint px-2.5 py-2 text-xs font-semibold text-warning-text">
                <AlertTriangle className="h-3.5 w-3.5" />
                La IA pasó este caso al equipo: requiere acción.
              </p>
            )}

            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button
                onClick={() => void generarCotizacion()}
                disabled={generando}
                className="col-span-2"
              >
                <FileText className="h-4 w-4" />
                {generando ? "Generando…" : "Generar cotización PDF"}
              </Button>
              {lead.conversationId ? (
                <>
                  <Link
                    href={`/inbox?contact=${lead.contact.id}`}
                    className="flex items-center justify-center gap-2 rounded-md border bg-secondary px-3 py-2 text-sm font-medium hover:bg-accent"
                  >
                    <MessageSquareText className="h-4 w-4" /> Ver chat
                  </Link>
                  {lead.aiPaused ? (
                    <span className="flex items-center justify-center rounded-md border border-dashed px-2 text-center text-xs text-text-3">
                      IA en pausa · responde el equipo
                    </span>
                  ) : (
                    <Button variant="outline" onClick={onTake}>
                      <Hand className="h-4 w-4" /> Tomar conversación
                    </Button>
                  )}
                </>
              ) : (
                <p className="col-span-2 text-xs text-text-3">
                  Todavía no hay conversación con este cliente.
                </p>
              )}
            </div>

            {anuncio && (
              <div className="mt-3">
                <AnuncioOrigen anuncio={anuncio} />
              </div>
            )}
          </section>

          {/* Etapa */}
          <section className="border-b p-4">
            <p className="mb-2 kicker">
              Etapa · {lead.daysInStage === 1 ? "1 día" : `${lead.daysInStage} días`} aquí
            </p>
            <div className="flex flex-wrap gap-1.5">
              {stages.map((s, i) => {
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
                    {i + 1}. {s.name}
                  </button>
                );
              })}
            </div>
          </section>

          {/* Importación */}
          <section className="border-b p-4">
            <p className="mb-3 kicker">Importación</p>
            <dl className="grid grid-cols-[40%_1fr] items-center gap-x-3 gap-y-2 text-sm">
              <dt className="text-xs text-text-3">Ciudad</dt>
              <dd className="flex flex-wrap items-center gap-1">
                {[...CIUDADES, "Otra"].map((c) => {
                  const activa = c === "Otra" ? ciudadOtra : nodo.ciudad === c;
                  return (
                    <button
                      key={c}
                      onClick={() =>
                        void guardarFicha({
                          [NODO_CAMPOS.ciudad]:
                            c === "Otra" ? (ciudadOtra ? nodo.ciudad : "Otra") : c,
                        })
                      }
                      className={cn(
                        "rounded-full border px-2 py-0.5 text-xs",
                        activa
                          ? "border-brand bg-brand-tint font-semibold text-brand-text"
                          : "border-border text-text-2 hover:bg-accent"
                      )}
                    >
                      {c}
                    </button>
                  );
                })}
                {ciudadOtra && (
                  <InlineText
                    value={nodo.ciudad ?? ""}
                    ariaLabel="Otra ciudad"
                    className="mt-1 text-xs"
                    onSave={(v) => v && void guardarFicha({ [NODO_CAMPOS.ciudad]: v })}
                  />
                )}
              </dd>

              <dt className="text-xs text-text-3">¿Tiene proveedor?</dt>
              <dd className="flex gap-1">
                {(
                  [
                    ["Sí", true],
                    ["No", false],
                  ] as const
                ).map(([label, val]) => (
                  <button
                    key={label}
                    onClick={() => void guardarFicha({ [NODO_CAMPOS.tieneProveedor]: val })}
                    className={cn(
                      "rounded-full border px-2.5 py-0.5 text-xs",
                      nodo.tieneProveedor === val
                        ? "border-brand bg-brand-tint font-semibold text-brand-text"
                        : "border-border text-text-2 hover:bg-accent"
                    )}
                  >
                    {label}
                  </button>
                ))}
              </dd>

              <dt className="text-xs text-text-3">Producto</dt>
              <dd>
                <InlineText
                  value={nodo.producto ?? ""}
                  placeholder="¿Qué quiere importar?"
                  ariaLabel="Producto"
                  onSave={(v) => void guardarFicha({ [NODO_CAMPOS.producto]: v || null })}
                />
              </dd>

              <dt className="text-xs text-text-3">Cantidad</dt>
              <dd>
                <InlineText
                  value={nodo.cantidad === null ? "" : String(nodo.cantidad)}
                  placeholder="Unidades"
                  ariaLabel="Cantidad"
                  onSave={(v) => void guardarFicha({ [NODO_CAMPOS.cantidad]: num(v) })}
                />
              </dd>

              <dt className="text-xs text-text-3">Servicio</dt>
              <dd>
                <select
                  value={nodo.servicio ?? ""}
                  onChange={(e) =>
                    void guardarFicha({ [NODO_CAMPOS.servicio]: e.target.value || null })
                  }
                  aria-label="Servicio"
                  className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
                >
                  <option value="">Sin definir</option>
                  {SERVICIOS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </dd>

              <dt className="text-xs text-text-3">CBM estimado</dt>
              <dd>
                <InlineText
                  value={nodo.cbm === null ? "" : String(nodo.cbm)}
                  placeholder="Ej. 2.5"
                  ariaLabel="CBM estimado"
                  onSave={(v) => void guardarFicha({ [NODO_CAMPOS.cbm]: num(v) })}
                />
              </dd>

              <dt className="text-xs text-text-3">Costo estimado</dt>
              <dd className="text-sm">
                <span className="font-semibold tabular-nums">
                  {nodo.cbm === null ? "—" : `$${usd(costoServicio(nodo.cbm))}`}
                </span>
                <span className="block text-[11px] text-text-3">
                  CBM × $600 · sin impuestos
                </span>
              </dd>

              <dt className="text-xs text-text-3">Contenedor</dt>
              <dd>
                <select
                  value={lead.shipmentId ?? ""}
                  onChange={(e) => void asignarContenedor(e.target.value || null)}
                  aria-label="Contenedor"
                  className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
                >
                  <option value="">Sin asignar</option>
                  {detalle?.shipments.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} · sale {fechaCorta(s.departureDate)}
                      {s.id === detalle.nextShipmentId ? " (próximo)" : ""}
                    </option>
                  ))}
                </select>
              </dd>

              <dt className="text-xs text-text-3">Imagen de referencia</dt>
              <dd>
                {detalle?.imageAssetId ? (
                  <a
                    href={`/api/media/${detalle.imageAssetId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="block w-fit overflow-hidden rounded-md border"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/media/${detalle.imageAssetId}`}
                      alt="Imagen de referencia del producto"
                      className="h-24 w-24 object-cover"
                    />
                  </a>
                ) : (
                  <span className="flex items-center gap-1 text-xs text-text-3">
                    <ImageIcon className="h-3.5 w-3.5" /> El cliente aún no envía foto
                  </span>
                )}
              </dd>
            </dl>
          </section>

          {/* Para la cotización */}
          <section className="border-b p-4">
            <p className="mb-3 kicker">Cotización</p>
            <dl className="grid grid-cols-[40%_1fr] items-center gap-x-3 gap-y-2 text-sm">
              <dt className="text-xs text-text-3">Valor de mercadería ($)</dt>
              <dd>
                <InlineText
                  value={nodo.valorMercaderia === null ? "" : String(nodo.valorMercaderia)}
                  placeholder="Precio del proveedor"
                  ariaLabel="Valor de mercadería"
                  onSave={(v) => void guardarFicha({ [NODO_CAMPOS.valorMercaderia]: num(v) })}
                />
              </dd>
              <dt className="text-xs text-text-3">Transferencia e ISD</dt>
              <dd className="tabular-nums">
                {inversion.transferenciaIsd === null ? "—" : `$${usd(inversion.transferenciaIsd)}`}
                <span className="ml-1 text-[11px] text-text-3">8 % aprox.</span>
              </dd>
              <dt className="text-xs text-text-3">Servicios de importación</dt>
              <dd className="tabular-nums">
                {inversion.servicios === null ? "—" : `$${usd(inversion.servicios)}`}
              </dd>
              <dt className="text-xs text-text-3">Tributos de aduana ($)</dt>
              <dd>
                <InlineText
                  value={nodo.tributos === null ? "" : String(nodo.tributos)}
                  placeholder="Opcional · según el producto"
                  ariaLabel="Tributos de aduana"
                  onSave={(v) => void guardarFicha({ [NODO_CAMPOS.tributos]: num(v) })}
                />
              </dd>
              <dt className="text-xs font-semibold">Inversión total</dt>
              <dd className="font-semibold tabular-nums">
                ${usd(inversion.total)}
                {inversion.sinTributos && (
                  <span className="ml-1 text-[11px] font-normal text-text-3">sin tributos</span>
                )}
              </dd>
            </dl>
            {detalle && detalle.quotes.length > 0 && (
              <ul className="mt-3 space-y-1 border-t pt-2">
                {detalle.quotes.map((q) => (
                  <li key={q.id}>
                    <a
                      href={`/cotizacion/${q.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-2 rounded px-1 py-0.5 text-xs text-brand-ink hover:bg-accent"
                    >
                      <FileText className="h-3.5 w-3.5" />
                      Cotización Nº {numeroCotizacion(q.number)}
                      <span className="text-text-3">
                        · {new Date(q.createdAt).toLocaleDateString("es-EC")}
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Notas */}
          <section className="border-b p-4">
            <p className="mb-2 kicker">Notas</p>
            <Textarea
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              onBlur={() => {
                if ((detalle?.notes ?? "") !== notas) {
                  void guardarContacto({ notes: notas.trim() || null });
                  setDetalle((d) => (d ? { ...d, notes: notas } : d));
                }
              }}
              placeholder="Lo que el equipo debe saber de este cliente"
              rows={3}
              className="text-sm"
            />
          </section>

          <section className="border-b p-4">
            <p className="mb-2 kicker">Prioridad</p>
            <PriorityPicker value={lead.priority} onChange={onPriority} />
          </section>

          {/* Historial con la IA */}
          <section className="border-b p-4">
            <p className="mb-2 kicker">Historial de la conversación</p>
            {mensajes === null && lead.conversationId && (
              <p className="text-xs text-text-3">Cargando…</p>
            )}
            {(mensajes?.length === 0 || !lead.conversationId) && (
              <p className="text-xs text-text-3">Sin mensajes todavía.</p>
            )}
            {mensajes && mensajes.length > 0 && (
              <ol className="max-h-80 space-y-1.5 overflow-y-auto rounded-md bg-chat p-2">
                {mensajes.map((m) => (
                  <li
                    key={m.id}
                    className={cn(
                      "max-w-[85%] rounded-md border px-2 py-1 text-xs",
                      m.direction === "in"
                        ? "border-bubble-in-border bg-bubble-in"
                        : "ml-auto border-bubble-out-border bg-bubble-out text-bubble-out-text"
                    )}
                  >
                    <span className="mb-0.5 flex items-center gap-1 text-[10px] text-text-3">
                      {m.direction === "in" ? (
                        <>
                          <User className="h-3 w-3" /> Cliente
                        </>
                      ) : m.aiGenerated ? (
                        <>
                          <Bot className="h-3 w-3" /> IA
                        </>
                      ) : (
                        <>
                          <Hand className="h-3 w-3" /> Equipo
                        </>
                      )}
                      ·{" "}
                      {new Date(m.createdAt).toLocaleString("es-EC", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </span>
                    {m.text ?? (m.type === "image" ? "📷 Foto" : `[${m.type}]`)}
                  </li>
                ))}
              </ol>
            )}
          </section>

          {Object.keys(otros).length > 0 && <FichaPanel ficha={otros} onSave={guardarFicha} />}

          <p className="p-4 text-[11px] text-text-3">
            {cbmTexto(nodo.cbm)} · Servicio: CBM × $600. No incluye impuestos de
            aduana, se calculan según el producto.
          </p>
        </div>
      </aside>
    </>
  );
}

/** Texto que se edita en el sitio y se guarda al salir o con Enter. */
function InlineText({
  value,
  onSave,
  placeholder,
  ariaLabel,
  className,
}: {
  value: string;
  onSave: (value: string) => void;
  placeholder?: string;
  ariaLabel: string;
  className?: string;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    if (draft.trim() !== value) onSave(draft.trim());
  };
  return (
    <Input
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") setDraft(value);
      }}
      placeholder={placeholder}
      aria-label={ariaLabel}
      className={cn("h-8 px-2 text-sm", className)}
    />
  );
}
