import { and, asc, eq, gte } from "drizzle-orm";
import { withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { getBranding } from "@/server/branding";
import { dayIsoInTz, labelInTz, todayInTz } from "@/lib/time/slots";
import { agendaEnabled } from "@/server/agenda/flag";
import { getSettings } from "@/server/agenda/settings";

/** Una visita que empezó hace menos de esto sigue mostrándose en la tarjeta. */
const VISITA_VIGENTE_MS = 3 * 3_600_000;

export const dynamic = "force-dynamic";

/** Datos completos del kanban: etapas ordenadas + tarjetas con su contacto. */
export const GET = withAuth(async (session) => {
  const db = getDb();

  const stages = await db
    .select()
    .from(schema.pipelineStage)
    .where(scoped(schema.pipelineStage.organizationId, session.organizationId))
    .orderBy(asc(schema.pipelineStage.position));

  const leads = await db
    .select({
      lead: schema.lead,
      contact: schema.contact,
      conversationId: schema.conversation.id,
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
    .where(scoped(schema.lead.organizationId, session.organizationId))
    .orderBy(asc(schema.lead.position));

  // La moneda del negocio viaja con el tablero: el cliente suma sus columnas y
  // necesita saber cuál es la única sumable, sin adivinarla ni pedirla aparte.
  const { currency } = await getBranding(session.organizationId);

  // Con la agenda encendida, cada tarjeta lleva su próxima visita: es lo que
  // se mira en "Visita agendada" sin abrir el calendario.
  const agenda = agendaEnabled();
  const nextVisit = new Map<string, { id: string; startUtc: string; label: string; dayIso: string }>();
  let today: string | null = null;
  if (agenda) {
    const { timezone } = await getSettings(session.organizationId);
    today = todayInTz(new Date(), timezone);
    const visitas = await db
      .select({
        id: schema.booking.id,
        contactId: schema.booking.contactId,
        scheduledAt: schema.booking.scheduledAt,
      })
      .from(schema.booking)
      .where(
        scoped(
          schema.booking.organizationId,
          session.organizationId,
          and(
            eq(schema.booking.kind, "session"),
            eq(schema.booking.status, "agendada"),
            eq(schema.booking.isTest, false),
            gte(schema.booking.scheduledAt, new Date(Date.now() - VISITA_VIGENTE_MS))
          )
        )
      )
      .orderBy(asc(schema.booking.scheduledAt));
    for (const v of visitas) {
      if (!v.contactId || nextVisit.has(v.contactId)) continue;
      const startUtc = v.scheduledAt.toISOString();
      nextVisit.set(v.contactId, {
        id: v.id,
        startUtc,
        label: labelInTz(startUtc, timezone),
        dayIso: dayIsoInTz(v.scheduledAt, timezone),
      });
    }
  }

  return Response.json({
    currency,
    agenda,
    today,
    stages: stages.map((s) => ({
      id: s.id,
      name: s.name,
      position: s.position,
      kind: s.kind,
    })),
    leads: leads.map((r) => ({
      id: r.lead.id,
      stageId: r.lead.stageId,
      position: r.lead.position,
      lastActivityAt: r.lead.lastActivityAt?.toISOString() ?? null,
      amountCents: r.lead.amountCents,
      currency: r.lead.currency,
      priority: r.lead.priority,
      contact: {
        id: r.contact.id,
        name: r.contact.name,
        phone: r.contact.phone,
      },
      conversationId: r.conversationId,
      nextVisit: nextVisit.get(r.contact.id) ?? null,
    })),
  });
});
