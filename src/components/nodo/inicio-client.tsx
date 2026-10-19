"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, Box, Ship, Users } from "lucide-react";
import { fechaLarga, usd } from "@/lib/nodo";
import { cn } from "@/lib/utils";
import { useEvents } from "@/components/use-events";

type Contenedor = {
  id: string;
  name: string;
  departureDate: string;
  capacityCbm: number;
  clientes: number;
  cbmOcupados: number;
  vendido: number;
};

type Data = {
  totalClientes: number;
  porEtapa: { id: string; name: string; count: number }[];
  accion: {
    leadId: string;
    contactId: string;
    name: string;
    producto: string | null;
    cbm: number | null;
    stage: string;
    dias: number;
  }[];
  contenedores: Contenedor[];
  proximo: (Contenedor & { cutoffDate: string | null }) | null;
};

function diasHasta(fecha: string): number {
  const hoy = new Date(new Date().toLocaleDateString("en-CA", { timeZone: "America/Guayaquil" }));
  return Math.round((new Date(fecha).getTime() - hoy.getTime()) / 86_400_000);
}

/** Panel de inicio de NODO: cómo va el embudo, qué pide atención y cómo se llenan los contenedores. */
export function InicioClient() {
  const [data, setData] = useState<Data | null>(null);

  const refetch = useCallback(async () => {
    const res = await fetch("/api/nodo/dashboard").catch(() => null);
    if (res?.ok) setData(await res.json());
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  // Un handoff nuevo de la IA aparece sin recargar.
  useEvents({
    onConversationUpdated: () => void refetch(),
    onReconnect: () => void refetch(),
  });

  if (!data) return <p className="p-6 text-sm text-text-3">Cargando…</p>;

  const max = Math.max(1, ...data.porEtapa.map((s) => s.count));
  const p = data.proximo;

  return (
    <div className="h-full overflow-y-auto">
      <header className="border-b px-4 py-3 sm:px-6 sm:py-4">
        <h2 className="text-[17px] font-bold tracking-tight">Inicio</h2>
        <p className="text-xs text-text-3">Resumen de importaciones y contenedores</p>
      </header>

      <div className="space-y-5 p-4 sm:p-6">
        {/* Indicadores */}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Kpi icon={Users} label="Clientes en el pipeline" value={String(data.totalClientes)} />
          <Kpi
            icon={AlertTriangle}
            label="Requieren acción del equipo"
            value={String(data.accion.length)}
            tone={data.accion.length > 0 ? "warning" : undefined}
          />
          <Kpi
            icon={Ship}
            label="Próximo contenedor"
            value={p ? fechaLarga(p.departureDate, false) : "Sin programar"}
            hint={p ? `Sale en ${diasHasta(p.departureDate)} días` : undefined}
          />
          <Kpi
            icon={Box}
            label="CBM vendidos (próximo)"
            value={p ? `${p.cbmOcupados.toLocaleString("es-EC")} / ${p.capacityCbm}` : "—"}
            hint={p ? `$${usd(p.vendido)} en servicio` : undefined}
          />
        </div>

        <div className="grid gap-5 xl:grid-cols-[1.1fr_1fr]">
          {/* Clientes por etapa */}
          <section className="rounded-lg border border-border-strong bg-card p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-bold">Clientes por etapa</h3>
              <Link href="/pipeline" className="flex items-center gap-1 text-xs text-brand-ink hover:underline">
                Ver pipeline <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            <ol className="space-y-1.5">
              {data.porEtapa.map((s, i) => (
                <li key={s.id} className="grid grid-cols-[minmax(0,13rem)_1fr_2rem] items-center gap-3 text-xs">
                  <span className="truncate text-text-2">
                    {i + 1}. {s.name}
                  </span>
                  <span className="h-4 rounded-sm bg-subtle">
                    <span
                      className="block h-full rounded-sm bg-brand"
                      style={{ width: `${(s.count / max) * 100}%`, minWidth: s.count ? 4 : 0 }}
                    />
                  </span>
                  <span className="text-right font-semibold tabular-nums">{s.count}</span>
                </li>
              ))}
            </ol>
          </section>

          {/* Casos que requieren acción */}
          <section className="rounded-lg border border-border-strong bg-card p-4 shadow-sm">
            <h3 className="mb-3 flex items-center gap-1.5 text-sm font-bold">
              <AlertTriangle className="h-4 w-4 text-warning-text" />
              Casos que requieren acción
            </h3>
            {data.accion.length === 0 ? (
              <p className="text-xs text-text-3">
                Nada pendiente: la IA está atendiendo todas las conversaciones.
              </p>
            ) : (
              <ul className="divide-y">
                {data.accion.map((a) => (
                  <li key={a.leadId} className="flex items-center gap-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{a.name}</p>
                      <p className="truncate text-xs text-text-3">
                        {a.producto ?? "Producto por definir"} · {a.stage}
                      </p>
                    </div>
                    <Link
                      href={`/inbox?contact=${a.contactId}`}
                      className="shrink-0 rounded-md border border-brand px-2.5 py-1 text-xs font-semibold text-brand-ink hover:bg-brand-tint"
                    >
                      Atender
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* CBM por contenedor */}
        <section className="rounded-lg border border-border-strong bg-card p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-bold">CBM vendidos por contenedor</h3>
            <Link href="/contenedores" className="flex items-center gap-1 text-xs text-brand-ink hover:underline">
              Ver contenedores <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          {data.contenedores.length === 0 ? (
            <p className="text-xs text-text-3">Todavía no hay salidas programadas.</p>
          ) : (
            <ul className="space-y-3">
              {data.contenedores.map((c) => {
                const pct = Math.min(100, (c.cbmOcupados / c.capacityCbm) * 100);
                return (
                  <li key={c.id}>
                    <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2 text-xs">
                      <span>
                        <strong className="text-sm">{c.name}</strong>
                        <span className="text-text-3"> · sale {fechaLarga(c.departureDate)} · {c.clientes} clientes</span>
                      </span>
                      <span className="tabular-nums">
                        <strong>{c.cbmOcupados.toLocaleString("es-EC")}</strong> / {c.capacityCbm} CBM ·{" "}
                        <strong>${usd(c.vendido)}</strong>
                      </span>
                    </div>
                    <div className="h-3 overflow-hidden rounded-full bg-subtle">
                      <div
                        className={cn("h-full rounded-full bg-brand", c.id === p?.id ? "" : "opacity-60")}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: typeof Users;
  label: string;
  value: string;
  hint?: string;
  tone?: "warning";
}) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-card p-4 shadow-sm",
        tone === "warning" ? "border-warning-soft bg-warning-tint" : "border-border-strong"
      )}
    >
      <p
        className={cn(
          "flex items-center gap-1.5 text-xs",
          tone === "warning" ? "font-semibold text-warning-text" : "text-text-3"
        )}
      >
        <Icon className="h-3.5 w-3.5" /> {label}
      </p>
      <p className="mt-1.5 text-2xl font-bold tracking-tight">{value}</p>
      {hint && <p className="text-xs text-text-3">{hint}</p>}
    </div>
  );
}
