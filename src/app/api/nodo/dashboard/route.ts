import { asc } from "drizzle-orm";
import { withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { costoServicio } from "@/lib/nodo";
import {
  diasDesde,
  leadsWithFicha,
  listShipments,
  nextShipment,
  requiereAccion,
  serializeShipment,
  stageSince,
} from "@/server/nodo";

export const dynamic = "force-dynamic";

/** Panel de inicio: clientes por etapa, casos que piden acción y CBM por contenedor. */
export const GET = withAuth(async (session) => {
  const org = session.organizationId;
  const [stages, leads, ships, next] = await Promise.all([
    getDb()
      .select()
      .from(schema.pipelineStage)
      .where(scoped(schema.pipelineStage.organizationId, org))
      .orderBy(asc(schema.pipelineStage.position)),
    leadsWithFicha(org),
    listShipments(org),
    nextShipment(org),
  ]);
  const desde = await stageSince(org, leads.map((l) => l.leadId));
  const stageName = new Map(stages.map((s) => [s.id, s.name]));

  const contenedores = ships.map((s) => {
    const cbm = leads
      .filter((l) => l.shipmentId === s.id)
      .reduce((a, l) => a + (l.nodo.cbm ?? 0), 0);
    return {
      ...serializeShipment(s),
      clientes: leads.filter((l) => l.shipmentId === s.id).length,
      cbmOcupados: Math.round(cbm * 100) / 100,
      vendido: costoServicio(cbm) ?? 0,
    };
  });

  return Response.json({
    totalClientes: leads.length,
    porEtapa: stages.map((s) => ({
      id: s.id,
      name: s.name,
      count: leads.filter((l) => l.stageId === s.id).length,
    })),
    accion: leads
      .filter(requiereAccion)
      .map((l) => ({
        leadId: l.leadId,
        contactId: l.contactId,
        name: l.name,
        producto: l.nodo.producto,
        cbm: l.nodo.cbm,
        stage: stageName.get(l.stageId) ?? "",
        handoffAt: l.handoffAt?.toISOString() ?? null,
        dias: diasDesde(desde.get(l.leadId)),
      })),
    contenedores,
    proximo: next ? contenedores.find((c) => c.id === next.id) ?? null : null,
  });
});
