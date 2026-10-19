import { z } from "zod";
import { parseBody, withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { costoServicio } from "@/lib/nodo";
import {
  leadsWithFicha,
  listShipments,
  nextShipment,
  requiereAccion,
  serializeShipment,
} from "@/server/nodo";

export const dynamic = "force-dynamic";

/** Contenedores con sus clientes asignados y los CBM ocupados. */
export const GET = withAuth(async (session) => {
  const [ships, leads, next] = await Promise.all([
    listShipments(session.organizationId),
    leadsWithFicha(session.organizationId),
    nextShipment(session.organizationId),
  ]);
  const stages = await getDb()
    .select({ id: schema.pipelineStage.id, name: schema.pipelineStage.name })
    .from(schema.pipelineStage)
    .where(scoped(schema.pipelineStage.organizationId, session.organizationId));
  const stageName = new Map(stages.map((s) => [s.id, s.name]));

  const cliente = (l: (typeof leads)[number]) => ({
    leadId: l.leadId,
    contactId: l.contactId,
    name: l.name,
    producto: l.nodo.producto,
    ciudad: l.nodo.ciudad,
    cbm: l.nodo.cbm,
    costo: costoServicio(l.nodo.cbm),
    stage: stageName.get(l.stageId) ?? "",
    needsAction: requiereAccion(l),
  });

  return Response.json({
    nextId: next?.id ?? null,
    shipments: ships.map((s) => {
      const clientes = leads.filter((l) => l.shipmentId === s.id).map(cliente);
      const ocupados = clientes.reduce((a, c) => a + (c.cbm ?? 0), 0);
      return {
        ...serializeShipment(s),
        clientes,
        cbmOcupados: Math.round(ocupados * 100) / 100,
        vendido: costoServicio(ocupados),
      };
    }),
    sinAsignar: leads.filter((l) => !l.shipmentId).map(cliente),
  });
});

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
  departureDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  cutoffDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  transitDays: z.number().int().min(1).max(200).optional(),
  capacityCbm: z.number().positive().max(200).optional(),
});

export const POST = withAuth(async (session, req: Request) => {
  const body = await parseBody(req, createSchema);
  if (!body.ok) return body.response;
  const [row] = await getDb()
    .insert(schema.shipment)
    .values({
      id: newId("shipment"),
      organizationId: session.organizationId,
      name: body.data.name,
      departureDate: body.data.departureDate,
      cutoffDate: body.data.cutoffDate ?? null,
      transitDays: body.data.transitDays ?? 55,
      capacityCbm: body.data.capacityCbm ?? 68,
    })
    .returning();
  return Response.json({ shipment: row ? serializeShipment(row) : null }, { status: 201 });
});
