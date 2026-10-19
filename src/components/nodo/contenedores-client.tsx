"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Container, Plus, Ship, Trash2 } from "lucide-react";
import { cbmTexto, fechaLarga, usd } from "@/lib/nodo";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/ui/empty-state";

type Cliente = {
  leadId: string;
  contactId: string;
  name: string;
  producto: string | null;
  ciudad: string | null;
  cbm: number | null;
  costo: number | null;
  stage: string;
  needsAction: boolean;
};

type Contenedor = {
  id: string;
  name: string;
  cutoffDate: string | null;
  departureDate: string;
  arrivalDate: string;
  transitDays: number;
  capacityCbm: number;
  clientes: Cliente[];
  cbmOcupados: number;
  vendido: number | null;
};

type Data = { nextId: string | null; shipments: Contenedor[]; sinAsignar: Cliente[] };

/** Una vista por salida mensual: quién va en cada contenedor y cuánto se llenó. */
export function ContenedoresClient() {
  const [data, setData] = useState<Data | null>(null);
  const [creando, setCreando] = useState(false);

  const refetch = useCallback(async () => {
    const res = await fetch("/api/nodo/shipments").catch(() => null);
    if (res?.ok) setData(await res.json());
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  async function asignar(leadId: string, shipmentId: string | null) {
    await fetch(`/api/pipeline/leads/${leadId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ shipmentId }),
    }).catch(() => null);
    void refetch();
  }

  async function borrar(c: Contenedor) {
    if (!confirm(`¿Borrar "${c.name}"? Sus ${c.clientes.length} clientes quedarán sin asignar.`)) return;
    await fetch(`/api/nodo/shipments/${c.id}`, { method: "DELETE" }).catch(() => null);
    void refetch();
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3 sm:px-6 sm:py-4">
        <div>
          <h2 className="text-[17px] font-bold tracking-tight">Contenedores</h2>
          <p className="text-xs text-text-3">
            Salidas mensuales desde China · tránsito estimado de 55 días
          </p>
        </div>
        <Button size="sm" onClick={() => setCreando((v) => !v)}>
          <Plus className="h-4 w-4" /> Nueva salida
        </Button>
      </header>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {creando && (
          <NuevaSalida
            onDone={() => {
              setCreando(false);
              void refetch();
            }}
          />
        )}

        {data === null ? (
          <p className="text-sm text-text-3">Cargando…</p>
        ) : data.shipments.length === 0 ? (
          <EmptyState
            icon={Container}
            title="Todavía no hay salidas"
            description="Crea la próxima salida mensual para asignarle clientes."
          />
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {data.shipments.map((c) => (
              <TarjetaContenedor
                key={c.id}
                c={c}
                proximo={c.id === data.nextId}
                otros={data.shipments.filter((s) => s.id !== c.id)}
                onAsignar={asignar}
                onBorrar={() => void borrar(c)}
              />
            ))}
          </div>
        )}

        {data && data.sinAsignar.length > 0 && data.shipments.length > 0 && (
          <section className="mt-6 rounded-lg border border-dashed p-4">
            <h3 className="mb-1 text-sm font-bold">Clientes sin contenedor</h3>
            <p className="mb-3 text-xs text-text-3">Asígnalos a una salida.</p>
            <ul className="divide-y">
              {data.sinAsignar.map((cl) => (
                <li key={cl.leadId} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className="font-semibold">{cl.name}</span>
                    <span className="text-text-3"> · {cl.producto ?? "Producto por definir"} · {cl.stage}</span>
                  </span>
                  <span className="font-mono text-xs">{cbmTexto(cl.cbm)}</span>
                  <select
                    defaultValue=""
                    onChange={(e) => e.target.value && void asignar(cl.leadId, e.target.value)}
                    className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                    aria-label={`Asignar a ${cl.name}`}
                  >
                    <option value="">Asignar a…</option>
                    {data.shipments.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}

function TarjetaContenedor({
  c,
  proximo,
  otros,
  onAsignar,
  onBorrar,
}: {
  c: Contenedor;
  proximo: boolean;
  otros: Contenedor[];
  onAsignar: (leadId: string, shipmentId: string | null) => void;
  onBorrar: () => void;
}) {
  const pct = Math.min(100, (c.cbmOcupados / c.capacityCbm) * 100);
  const libre = Math.max(0, c.capacityCbm - c.cbmOcupados);
  return (
    <article
      className={cn(
        "rounded-lg border bg-card shadow-sm",
        proximo ? "border-brand ring-[3px] ring-brand-soft" : "border-border-strong"
      )}
    >
      <header className="flex items-start justify-between gap-3 border-b p-4">
        <div>
          <div className="flex items-center gap-2">
            <Ship className="h-4 w-4 text-brand-ink" />
            <h3 className="font-bold">{c.name}</h3>
            {proximo && (
              <span className="rounded-full bg-brand px-2 py-0.5 text-[10px] font-bold uppercase text-brand-fg">
                Próximo
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-text-2">
            Sale el <strong>{fechaLarga(c.departureDate)}</strong>
            {c.cutoffDate && <> · bodega China hasta el {fechaLarga(c.cutoffDate, false)}</>}
            {" "}· llega aprox. el {fechaLarga(c.arrivalDate, false)}
          </p>
        </div>
        <button
          onClick={onBorrar}
          aria-label={`Borrar ${c.name}`}
          className="rounded p-1 text-text-3 hover:bg-accent hover:text-foreground"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </header>

      <div className="p-4">
        <div className="mb-1 flex items-baseline justify-between text-sm">
          <span>
            <strong className="text-lg tabular-nums">{c.cbmOcupados.toLocaleString("es-EC")}</strong>
            <span className="text-text-3"> / {c.capacityCbm} CBM ocupados</span>
          </span>
          <span className="text-xs text-text-3">{libre.toLocaleString("es-EC", { maximumFractionDigits: 2 })} CBM libres</span>
        </div>
        <div
          className="h-2.5 overflow-hidden rounded-full bg-subtle"
          role="progressbar"
          aria-valuenow={Math.round(pct)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Ocupación del contenedor"
        >
          <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-2 text-xs text-text-2">
          {c.clientes.length} clientes · vendido en servicio:{" "}
          <strong className="tabular-nums">${usd(c.vendido ?? 0)}</strong>
        </p>
      </div>

      {c.clientes.length > 0 && (
        <table className="w-full border-t text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-text-3">
              <th className="px-4 py-2 font-semibold">Cliente</th>
              <th className="px-2 py-2 font-semibold">Etapa</th>
              <th className="px-2 py-2 text-right font-semibold">CBM</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {c.clientes.map((cl) => (
              <tr key={cl.leadId}>
                <td className="px-4 py-2">
                  <Link href="/pipeline" className="font-semibold hover:underline">
                    {cl.name}
                  </Link>
                  {cl.needsAction && (
                    <AlertTriangle
                      className="ml-1 inline h-3.5 w-3.5 text-warning-text"
                      aria-label="Requiere acción"
                    />
                  )}
                  <p className="text-xs text-text-3">
                    {cl.producto ?? "Producto por definir"}
                    {cl.ciudad ? ` · ${cl.ciudad}` : ""}
                  </p>
                </td>
                <td className="px-2 py-2 text-xs text-text-2">{cl.stage}</td>
                <td className="px-2 py-2 text-right font-mono text-xs">{cl.cbm ?? "—"}</td>
                <td className="px-4 py-2 text-right">
                  <select
                    value={c.id}
                    onChange={(e) => onAsignar(cl.leadId, e.target.value || null)}
                    className="h-7 max-w-[120px] rounded-md border border-input bg-background px-1 text-xs"
                    aria-label={`Mover a ${cl.name} de contenedor`}
                  >
                    <option value={c.id}>Aquí</option>
                    {otros.map((s) => (
                      <option key={s.id} value={s.id}>
                        → {s.name}
                      </option>
                    ))}
                    <option value="">Quitar</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </article>
  );
}

function NuevaSalida({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");
  const [salida, setSalida] = useState("");
  const [corte, setCorte] = useState("");
  const [capacidad, setCapacidad] = useState("68");
  const [error, setError] = useState<string | null>(null);

  async function crear() {
    if (!name.trim() || !salida) {
      setError("Pon un nombre y la fecha de salida.");
      return;
    }
    const res = await fetch("/api/nodo/shipments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        departureDate: salida,
        cutoffDate: corte || null,
        capacityCbm: Number(capacidad) || 68,
      }),
    }).catch(() => null);
    if (res?.ok) onDone();
    else setError("No se pudo crear la salida.");
  }

  return (
    <div className="mb-6 grid gap-3 rounded-lg border border-border-strong bg-card p-4 sm:grid-cols-5 sm:items-end">
      <div className="sm:col-span-2">
        <Label htmlFor="ns-name">Nombre</Label>
        <Input id="ns-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Contenedor noviembre" />
      </div>
      <div>
        <Label htmlFor="ns-corte">Bodega China hasta</Label>
        <Input id="ns-corte" type="date" value={corte} onChange={(e) => setCorte(e.target.value)} />
      </div>
      <div>
        <Label htmlFor="ns-salida">Fecha de salida</Label>
        <Input id="ns-salida" type="date" value={salida} onChange={(e) => setSalida(e.target.value)} />
      </div>
      <div>
        <Label htmlFor="ns-cap">Capacidad (CBM)</Label>
        <Input id="ns-cap" value={capacidad} onChange={(e) => setCapacidad(e.target.value)} />
      </div>
      <div className="flex items-center gap-2 sm:col-span-5">
        <Button size="sm" onClick={() => void crear()}>Crear salida</Button>
        {error && <p className="text-xs text-danger-text">{error}</p>}
      </div>
    </div>
  );
}
