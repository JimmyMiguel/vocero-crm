import { eq } from "drizzle-orm";
import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { serializeShipment } from "@/server/nodo";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const patchSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  departureDate: fecha.optional(),
  cutoffDate: fecha.nullable().optional(),
  transitDays: z.number().int().min(1).max(200).optional(),
  capacityCbm: z.number().positive().max(200).optional(),
});

export const PATCH = withAuth(async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const body = await parseBody(req, patchSchema);
  if (!body.ok) return body.response;
  const [row] = await getDb()
    .update(schema.shipment)
    .set(body.data)
    .where(scoped(schema.shipment.organizationId, session.organizationId, eq(schema.shipment.id, id)))
    .returning();
  if (!row) return apiError(404, "not_found", "Contenedor no encontrado");
  return Response.json({ shipment: serializeShipment(row) });
});

/** Borrar un contenedor deja a sus clientes sin asignar (FK set null). */
export const DELETE = withAuth(async (session, _req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const res = await getDb()
    .delete(schema.shipment)
    .where(scoped(schema.shipment.organizationId, session.organizationId, eq(schema.shipment.id, id)))
    .returning({ id: schema.shipment.id });
  if (!res[0]) return apiError(404, "not_found", "Contenedor no encontrado");
  return Response.json({ ok: true });
});
