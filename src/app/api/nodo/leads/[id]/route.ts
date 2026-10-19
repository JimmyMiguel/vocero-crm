import { eq } from "drizzle-orm";
import { apiError, withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { leerNodoFicha } from "@/lib/nodo";
import {
  listQuotes,
  listShipments,
  nextShipment,
  referenceImageId,
  serializeShipment,
} from "@/server/nodo";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Lo que la ficha de NODO necesita además del contacto. */
export const GET = withAuth(async (session, _req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const org = session.organizationId;
  const rows = await getDb()
    .select({ lead: schema.lead, contact: schema.contact })
    .from(schema.lead)
    .innerJoin(schema.contact, eq(schema.lead.contactId, schema.contact.id))
    .where(scoped(schema.lead.organizationId, org, eq(schema.lead.id, id)))
    .limit(1);
  const row = rows[0];
  if (!row) return apiError(404, "not_found", "Trato no encontrado");

  const nodo = leerNodoFicha(row.contact.ficha);
  const [imagen, quotes, ships, next] = await Promise.all([
    referenceImageId(org, row.contact.id, nodo),
    listQuotes(org, id),
    listShipments(org),
    nextShipment(org),
  ]);
  return Response.json({
    notes: row.contact.notes,
    imageAssetId: imagen,
    quotes: quotes.map((q) => ({ id: q.id, number: q.number, createdAt: q.createdAt })),
    shipments: ships.map(serializeShipment),
    nextShipmentId: next?.id ?? null,
  });
});
