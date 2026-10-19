import { and, asc, desc, eq, gte, inArray, max, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import {
  DIAS_TRANSITO,
  PRIMER_NUMERO_COTIZACION,
  calcularInversion,
  leerNodoFicha,
  sumarDias,
  type NodoFicha,
} from "@/lib/nodo";

/**
 * NODO — contenedores, días en etapa, imagen de referencia y cotizaciones.
 * Todo lo que el tablero, la ficha y el panel de inicio leen del dominio de
 * importación vive aquí.
 */

export type Shipment = typeof schema.shipment.$inferSelect;

export type ShipmentDto = {
  id: string;
  name: string;
  cutoffDate: string | null;
  departureDate: string;
  arrivalDate: string;
  transitDays: number;
  capacityCbm: number;
};

export function serializeShipment(s: Shipment): ShipmentDto {
  return {
    id: s.id,
    name: s.name,
    cutoffDate: s.cutoffDate,
    departureDate: s.departureDate,
    arrivalDate: sumarDias(s.departureDate, s.transitDays),
    transitDays: s.transitDays,
    capacityCbm: s.capacityCbm,
  };
}

export function hoyEcuador(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Guayaquil" });
}

export async function listShipments(organizationId: string): Promise<Shipment[]> {
  return getDb()
    .select()
    .from(schema.shipment)
    .where(scoped(schema.shipment.organizationId, organizationId))
    .orderBy(asc(schema.shipment.departureDate));
}

/** El próximo contenedor que todavía no zarpa. */
export async function nextShipment(organizationId: string): Promise<Shipment | null> {
  const rows = await getDb()
    .select()
    .from(schema.shipment)
    .where(
      scoped(
        schema.shipment.organizationId,
        organizationId,
        gte(schema.shipment.departureDate, hoyEcuador())
      )
    )
    .orderBy(asc(schema.shipment.departureDate))
    .limit(1);
  return rows[0] ?? null;
}

export async function getShipment(
  organizationId: string,
  id: string
): Promise<Shipment | null> {
  const rows = await getDb()
    .select()
    .from(schema.shipment)
    .where(scoped(schema.shipment.organizationId, organizationId, eq(schema.shipment.id, id)))
    .limit(1);
  return rows[0] ?? null;
}

/** Desde cuándo está cada trato en su etapa actual (último movimiento). */
export async function stageSince(
  organizationId: string,
  leadIds: string[]
): Promise<Map<string, Date>> {
  if (leadIds.length === 0) return new Map();
  const rows = await getDb()
    .select({
      leadId: schema.leadStageEvent.leadId,
      at: max(schema.leadStageEvent.occurredAt),
    })
    .from(schema.leadStageEvent)
    .where(
      scoped(
        schema.leadStageEvent.organizationId,
        organizationId,
        inArray(schema.leadStageEvent.leadId, leadIds)
      )
    )
    .groupBy(schema.leadStageEvent.leadId);
  return new Map(rows.flatMap((r) => (r.at ? [[r.leadId, r.at] as const] : [])));
}

export function diasDesde(fecha: Date | null | undefined): number {
  if (!fecha) return 0;
  return Math.max(0, Math.floor((Date.now() - fecha.getTime()) / 86_400_000));
}

/**
 * La imagen de referencia: la que se fijó en la ficha o, si no, la última foto
 * que el cliente mandó por WhatsApp.
 */
export async function referenceImageId(
  organizationId: string,
  contactId: string,
  ficha: NodoFicha
): Promise<string | null> {
  if (ficha.imagenReferencia?.startsWith("ma_")) return ficha.imagenReferencia;
  const rows = await getDb()
    .select({ assetId: schema.message.mediaAssetId })
    .from(schema.message)
    .innerJoin(schema.conversation, eq(schema.message.conversationId, schema.conversation.id))
    .where(
      and(
        eq(schema.message.organizationId, organizationId),
        eq(schema.conversation.contactId, contactId),
        eq(schema.message.direction, "in"),
        eq(schema.message.type, "image")
      )
    )
    .orderBy(desc(schema.message.createdAt))
    .limit(1);
  return rows[0]?.assetId ?? null;
}

/** Asigna (o quita, con null) el contenedor de un trato. */
export async function assignShipment(
  organizationId: string,
  leadId: string,
  shipmentId: string | null
): Promise<boolean> {
  if (shipmentId && !(await getShipment(organizationId, shipmentId))) return false;
  const res = await getDb()
    .update(schema.lead)
    .set({ shipmentId, updatedAt: new Date() })
    .where(scoped(schema.lead.organizationId, organizationId, eq(schema.lead.id, leadId)))
    .returning({ id: schema.lead.id });
  return res.length > 0;
}

/** Tratos con su contacto y ficha, para contenedores y panel. */
export async function leadsWithFicha(organizationId: string) {
  const rows = await getDb()
    .select({
      leadId: schema.lead.id,
      stageId: schema.lead.stageId,
      shipmentId: schema.lead.shipmentId,
      contactId: schema.contact.id,
      name: schema.contact.name,
      phone: schema.contact.phone,
      ficha: schema.contact.ficha,
      aiEnabled: schema.conversation.aiEnabled,
      handoffAt: schema.conversation.handoffAt,
    })
    .from(schema.lead)
    .innerJoin(schema.contact, eq(schema.lead.contactId, schema.contact.id))
    .leftJoin(
      schema.conversation,
      and(
        eq(schema.conversation.contactId, schema.contact.id),
        eq(schema.conversation.isTest, false)
      )
    )
    .where(scoped(schema.lead.organizationId, organizationId));
  return rows.map((r) => ({ ...r, nodo: leerNodoFicha(r.ficha) }));
}

/**
 * "Requiere acción del equipo": la IA pasó el caso a una persona y nadie lo
 * ha tomado todavía. Al tomarlo (IA pausada) deja de pedir atención.
 */
export function requiereAccion(c: { aiEnabled: boolean | null; handoffAt: Date | null }): boolean {
  return !!c.handoffAt && c.aiEnabled !== false;
}

/* ============================================================
 * Cotizaciones
 * ============================================================ */

export type QuoteData = {
  cliente: string;
  telefono: string | null;
  ciudad: string | null;
  producto: string;
  cantidad: number | null;
  cbm: number | null;
  servicio: string | null;
  inversion: ReturnType<typeof calcularInversion>;
  emitida: string;
  contenedor: {
    nombre: string;
    corteBodega: string | null;
    salida: string;
    llegada: string;
  } | null;
};

export type QuoteDto = { id: string; number: number; data: QuoteData; createdAt: string };

/**
 * Emite una cotización con el siguiente número correlativo. Guarda la foto de
 * los datos: reabrir la 086 dentro de un mes muestra lo mismo que se envió.
 */
export async function createQuote(
  organizationId: string,
  leadId: string
): Promise<QuoteDto | null> {
  const db = getDb();
  const rows = await db
    .select({ lead: schema.lead, contact: schema.contact })
    .from(schema.lead)
    .innerJoin(schema.contact, eq(schema.lead.contactId, schema.contact.id))
    .where(scoped(schema.lead.organizationId, organizationId, eq(schema.lead.id, leadId)))
    .limit(1);
  const row = rows[0];
  if (!row) return null;

  const f = leerNodoFicha(row.contact.ficha);
  const ship = row.lead.shipmentId
    ? await getShipment(organizationId, row.lead.shipmentId)
    : await nextShipment(organizationId);

  const data: QuoteData = {
    cliente: row.contact.name,
    telefono: row.contact.phone,
    ciudad: f.ciudad,
    producto: f.producto ?? "Producto por definir",
    cantidad: f.cantidad,
    cbm: f.cbm,
    servicio: f.servicio,
    inversion: calcularInversion(f),
    emitida: hoyEcuador(),
    contenedor: ship
      ? {
          nombre: ship.name,
          corteBodega: ship.cutoffDate,
          salida: ship.departureDate,
          llegada: sumarDias(ship.departureDate, ship.transitDays ?? DIAS_TRANSITO),
        }
      : null,
  };

  // Dos personas generando a la vez chocan en el índice único: se reintenta.
  for (let intento = 0; intento < 3; intento++) {
    const [{ ultimo }] = (await db
      .select({ ultimo: max(schema.quote.number) })
      .from(schema.quote)
      .where(scoped(schema.quote.organizationId, organizationId))) as [{ ultimo: number | null }];
    const number = Math.max((ultimo ?? 0) + 1, PRIMER_NUMERO_COTIZACION);
    try {
      const [q] = await db
        .insert(schema.quote)
        .values({ id: newId("quote"), organizationId, leadId, number, data })
        .returning();
      if (q) return serializeQuote(q);
    } catch (err) {
      if (!String(err).includes("quote_org_number_uq")) throw err;
    }
  }
  return null;
}

function serializeQuote(q: typeof schema.quote.$inferSelect): QuoteDto {
  return {
    id: q.id,
    number: q.number,
    data: q.data as unknown as QuoteData,
    createdAt: q.createdAt.toISOString(),
  };
}

export async function getQuote(organizationId: string, id: string): Promise<QuoteDto | null> {
  const rows = await getDb()
    .select()
    .from(schema.quote)
    .where(scoped(schema.quote.organizationId, organizationId, eq(schema.quote.id, id)))
    .limit(1);
  return rows[0] ? serializeQuote(rows[0]) : null;
}

export async function listQuotes(organizationId: string, leadId: string): Promise<QuoteDto[]> {
  const rows = await getDb()
    .select()
    .from(schema.quote)
    .where(scoped(schema.quote.organizationId, organizationId, eq(schema.quote.leadId, leadId)))
    .orderBy(desc(schema.quote.number));
  return rows.map(serializeQuote);
}

/** Para el prompt del agente: la próxima salida y lo que cuesta el CBM. */
export async function nodoContextForAgent(organizationId: string): Promise<string | null> {
  const ship = await nextShipment(organizationId);
  const count = await getDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.shipment)
    .where(scoped(schema.shipment.organizationId, organizationId));
  if (!count[0]?.n) return null;
  return ship
    ? `Próximo contenedor: sale el ${ship.departureDate}${ship.cutoffDate ? `; la carga debe llegar a la bodega en China hasta el ${ship.cutoffDate}` : ""}; llega a Ecuador en unos ${ship.transitDays} días.`
    : "No hay contenedor programado: di que el equipo confirmará la próxima salida.";
}
