import { eq, inArray, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "@/lib/db/schema";
import { newId } from "@/lib/db/ids";

type Db = PostgresJsDatabase<typeof schema>;

/**
 * Demo de Kore Residences, una inmobiliaria ficticia: es la vitrina que se
 * enseña en las demos de la campaña. Deja etapas, clientes (casi todos
 * llegados por anuncio) con su conversación, propiedades en el catálogo,
 * visitas en el calendario y la marca (verde y dorado).
 *
 * El agente NO atiende como la inmobiliaria: en esta instancia contesta dudas
 * del CRM y agenda demos. Por eso su perfil y su conocimiento se cargan aparte
 * y aquí solo se vacía el conocimiento anterior. Con AGENT_CATALOG=off las
 * propiedades quedan solo de vitrina.
 *
 * DESTRUCTIVO: borra contactos, conversaciones, citas, catálogo, conocimiento
 * y etapas de la organización. Respáldala antes. El icono subido se conserva.
 */

const HORA = 3_600_000;
const DIA = 24 * HORA;

/** Verde del logo de Kore (#054c3a), un punto más claro para los botones. */
const ACENTO = "#0b5c45";
const NOMBRE = "Kore Residences";

/** Ecuador no cambia de horario: UTC−5 todo el año. */
const ZONA = "America/Guayaquil";
const UTC_OFFSET_H = 5;

const ETAPAS = [
  "Nuevo contacto",
  "Calificado",
  "Visita agendada",
  "Visita realizada",
  "Negociación",
  "Reservado",
  "Cerrado",
] as const;

type Etapa = (typeof ETAPAS)[number] | "Descartado";

type Msg = { dir: "in" | "out"; text: string; ai?: boolean; h: number };

type Cliente = {
  name: string;
  phone: string;
  etapa: Etapa;
  diasEnEtapa: number;
  source: "anuncio" | "organico" | "referido";
  /** Valor del trato en dólares. */
  monto?: number;
  prioridad?: "alta" | "media" | "baja";
  ficha: Record<string, string | number | boolean>;
  notas?: string;
  /** La IA pasó el caso al equipo y nadie lo tomó. */
  handoff?: boolean;
  /** El equipo tomó la conversación (IA en pausa). */
  tomada?: boolean;
  /**
   * Visita en el calendario. `dia`: días desde hoy (negativo = ya pasó) o
   * "sabado" (el próximo); `hora` en la zona del negocio.
   */
  visita?: { dia: number | "sabado"; hora: string; estado: "agendada" | "realizada" };
  chat: Msg[];
};

const SALUDO =
  "¡Hola! 👋 Soy Sofía, asistente virtual de Kore Residences. Te ayudo a encontrar casa, departamento o terreno. ¿Buscas comprar o arrendar, y en qué sector?";

const CLIENTES: Cliente[] = [
  {
    name: "Andrea Villacís",
    phone: "593991100201",
    etapa: "Nuevo contacto",
    diasEnEtapa: 0,
    source: "anuncio",
    prioridad: "alta",
    handoff: true,
    ficha: {
      interes: "Compra",
      tipo: "Casa",
      zona: "Samborondón",
      presupuesto: 180000,
      habitaciones: 3,
      financiamiento: "Crédito BIESS",
    },
    chat: [
      { dir: "in", text: "Hola, vi el anuncio de la casa en Samborondón. ¿Sigue disponible?", h: 3 },
      { dir: "out", ai: true, text: SALUDO, h: 2.98 },
      { dir: "in", text: "Comprar. Busco casa de 3 habitaciones, mi presupuesto es hasta 180 mil", h: 2.7 },
      { dir: "out", ai: true, text: "¡Perfecto, Andrea! Tenemos la casa del km 10 de Samborondón: 3 habitaciones, 2,5 baños, 160 m² en urbanización con guardianía, a $175.000. ¿Pagarías de contado o con crédito?", h: 2.68 },
      { dir: "in", text: "Con el BIESS. ¿Aceptan? Y quisiera verla este sábado", h: 2.4 },
      { dir: "out", ai: true, text: "Sí, la propiedad califica para crédito BIESS ✅ Le paso tu caso a un asesor para coordinar la visita del sábado. Te escribe en unos minutos.", h: 2.38 },
    ],
  },
  {
    name: "Luis Cevallos",
    phone: "593987700202",
    etapa: "Nuevo contacto",
    diasEnEtapa: 0,
    source: "anuncio",
    ficha: { interes: "Arriendo", tipo: "Departamento", zona: "Urdesa" },
    chat: [
      { dir: "in", text: "Buenas, cuánto es el arriendo del departamento de Urdesa?", h: 1 },
      { dir: "out", ai: true, text: SALUDO, h: 0.98 },
      { dir: "out", ai: true, text: "El departamento de Urdesa Central tiene 2 habitaciones, 2 baños, amoblado y con parqueadero: $650 al mes + alícuota. ¿Para cuántas personas sería y desde cuándo lo necesitas?", h: 0.97 },
      { dir: "in", text: "Somos 2, desde diciembre. Aceptan mascotas?", h: 0.5 },
    ],
  },
  {
    name: "Paola Mendoza",
    phone: "593998800203",
    etapa: "Calificado",
    diasEnEtapa: 1,
    source: "anuncio",
    monto: 128000,
    prioridad: "media",
    ficha: {
      interes: "Compra",
      tipo: "Departamento",
      zona: "Cumbayá",
      presupuesto: 130000,
      habitaciones: 2,
      financiamiento: "Crédito bancario",
    },
    chat: [
      { dir: "in", text: "Hola! Me interesa el departamento en Cumbayá del anuncio", h: 30 },
      { dir: "out", ai: true, text: SALUDO, h: 29.98 },
      { dir: "in", text: "Comprar, para vivir con mi esposo. Hasta 130 mil", h: 29.5 },
      { dir: "out", ai: true, text: "¡Qué bien, Paola! El de Cumbayá tiene 2 habitaciones, estudio, balcón con vista y 95 m², a $128.000. ¿Ya tienes crédito pre-aprobado o lo estás tramitando?", h: 29.48 },
      { dir: "in", text: "Estamos tramitándolo con el banco", h: 29 },
      { dir: "out", ai: true, text: "Perfecto. Te puedo enviar fotos y el plano mientras tanto. ¿Qué días te quedan mejor para visitarlo?", h: 28.98 },
      { dir: "in", text: "Mándame las fotos porfa, la visita sería la próxima semana", h: 28 },
    ],
  },
  {
    name: "Jorge Salazar",
    phone: "593967700204",
    etapa: "Calificado",
    diasEnEtapa: 2,
    source: "organico",
    monto: 85000,
    ficha: {
      interes: "Compra",
      tipo: "Terreno",
      zona: "Vía a la Costa",
      presupuesto: 90000,
      financiamiento: "Contado",
    },
    chat: [
      { dir: "in", text: "Tienen terrenos en vía a la costa? Pago de contado", h: 54 },
      { dir: "out", ai: true, text: SALUDO, h: 53.98 },
      { dir: "out", ai: true, text: "¡Sí, Jorge! Tenemos un lote de 600 m² en urbanización cerrada en el km 14, con todos los servicios, a $85.000. ¿Es para construir vivienda o como inversión?", h: 53.95 },
      { dir: "in", text: "Para construir mi casa. Me interesa", h: 53 },
    ],
  },
  {
    name: "Valeria Ortiz",
    phone: "593958800205",
    etapa: "Visita agendada",
    diasEnEtapa: 1,
    source: "anuncio",
    monto: 175000,
    prioridad: "alta",
    ficha: {
      interes: "Compra",
      tipo: "Casa",
      zona: "Samborondón",
      presupuesto: 190000,
      habitaciones: 3,
      financiamiento: "Crédito bancario",
    },
    visita: { dia: "sabado", hora: "10:00", estado: "agendada" },
    notas: "Visita confirmada el sábado a las 10:00 con su esposo. Llevar plano y escrituras.",
    chat: [
      { dir: "in", text: "Hola, quiero agendar visita a la casa de Samborondón", h: 26 },
      { dir: "out", ai: true, text: SALUDO, h: 25.98 },
      { dir: "in", text: "Compra, ya vimos fotos en Instagram. Podemos el sábado en la mañana", h: 25.5 },
      { dir: "out", ai: true, text: "¡Listo, Valeria! Te agendé el sábado a las 10:00 en la casa del km 10. Un asesor te acompañará y te enviamos la ubicación un día antes 📍", h: 25.48 },
      { dir: "in", text: "Perfecto, vamos con mi esposo", h: 25 },
    ],
  },
  {
    name: "Diego Paredes",
    phone: "593947700206",
    etapa: "Visita agendada",
    diasEnEtapa: 0,
    source: "anuncio",
    monto: 650,
    ficha: {
      interes: "Arriendo",
      tipo: "Departamento",
      zona: "Urdesa",
      presupuesto: 700,
      habitaciones: 2,
    },
    visita: { dia: 1, hora: "17:00", estado: "agendada" },
    chat: [
      { dir: "in", text: "Hola, el depa de Urdesa todavía se arrienda?", h: 8 },
      { dir: "out", ai: true, text: SALUDO, h: 7.98 },
      { dir: "out", ai: true, text: "¡Sí, Diego! Está disponible: 2 habitaciones, amoblado, $650 + alícuota. ¿Te gustaría verlo?", h: 7.95 },
      { dir: "in", text: "Sí, mañana después del trabajo, tipo 5", h: 7.5 },
      { dir: "out", ai: true, text: "Agendado mañana a las 17:00 ✅ Te enviamos la ubicación exacta por aquí.", h: 7.48 },
    ],
  },
  {
    name: "Carolina Rivas",
    phone: "593991100207",
    etapa: "Visita realizada",
    diasEnEtapa: 3,
    source: "referido",
    monto: 128000,
    tomada: true,
    ficha: {
      interes: "Compra",
      tipo: "Departamento",
      zona: "Cumbayá",
      presupuesto: 125000,
      habitaciones: 2,
      financiamiento: "Crédito BIESS",
    },
    notas: "Le gustó el departamento. Pide revisar si el dueño acepta $120.000.",
    visita: { dia: -3, hora: "11:00", estado: "realizada" },
    chat: [
      { dir: "in", text: "Hola, me refirió mi prima, quiero ver el departamento de Cumbayá", h: 120 },
      { dir: "out", ai: true, text: SALUDO, h: 119.98 },
      { dir: "out", text: "Carolina, soy Daniel, asesor. Fue un gusto mostrarte el departamento hoy. Cualquier duda me escribes por aquí.", h: 74 },
      { dir: "in", text: "Gracias Daniel, nos encantó. ¿El dueño aceptaría 120 mil?", h: 73 },
      { dir: "out", text: "Lo consulto con el propietario y te confirmo hoy mismo.", h: 72.5 },
    ],
  },
  {
    name: "Miguel Ángel Torres",
    phone: "593987700208",
    etapa: "Negociación",
    diasEnEtapa: 4,
    source: "anuncio",
    monto: 240000,
    prioridad: "alta",
    tomada: true,
    ficha: {
      interes: "Compra",
      tipo: "Casa",
      zona: "Cumbayá",
      presupuesto: 250000,
      habitaciones: 4,
      financiamiento: "Contado",
    },
    notas: "Ofertó $230.000 de contado. El propietario pide $240.000. Siguiente paso: contraoferta.",
    visita: { dia: -8, hora: "16:00", estado: "realizada" },
    chat: [
      { dir: "in", text: "Buenas tardes, me interesa la casa de 4 habitaciones en Cumbayá", h: 200 },
      { dir: "out", ai: true, text: SALUDO, h: 199.98 },
      { dir: "out", ai: true, text: "¡Excelente elección! Casa de 4 habitaciones, jardín, 280 m² de construcción en conjunto privado, a $245.000. ¿Te gustaría visitarla?", h: 199.9 },
      { dir: "out", text: "Miguel, el propietario revisó tu oferta de $230.000. Acepta bajar a $240.000 de contado.", h: 96 },
      { dir: "in", text: "Déjame conversarlo con mi familia y te confirmo el lunes", h: 95 },
    ],
  },
  {
    name: "Fernanda Castro",
    phone: "593998800209",
    etapa: "Reservado",
    diasEnEtapa: 2,
    source: "anuncio",
    monto: 85000,
    ficha: {
      interes: "Compra",
      tipo: "Terreno",
      zona: "Vía a la Costa",
      presupuesto: 85000,
      financiamiento: "Contado",
    },
    notas: "Pagó $2.000 de reserva. Firma de promesa de compraventa el jueves.",
    visita: { dia: -5, hora: "10:00", estado: "realizada" },
    chat: [
      { dir: "in", text: "Quiero separar el terreno de vía a la costa", h: 60 },
      { dir: "out", ai: true, text: SALUDO, h: 59.98 },
      { dir: "out", text: "Fernanda, recibimos tu reserva de $2.000 ✅ El jueves firmamos la promesa de compraventa en la notaría.", h: 48 },
      { dir: "in", text: "Perfecto, ahí estaré", h: 47 },
    ],
  },
  {
    name: "Roberto Aguirre",
    phone: "593967700210",
    etapa: "Cerrado",
    diasEnEtapa: 6,
    source: "anuncio",
    monto: 158000,
    ficha: {
      interes: "Compra",
      tipo: "Casa",
      zona: "Daule — La Aurora",
      presupuesto: 160000,
      habitaciones: 3,
      financiamiento: "Crédito BIESS",
    },
    notas: "Escrituras firmadas. Entrega de llaves realizada.",
    chat: [
      { dir: "in", text: "Hola, vi la casa de La Aurora en Facebook", h: 600 },
      { dir: "out", ai: true, text: SALUDO, h: 599.98 },
      { dir: "out", text: "Roberto, ¡felicidades por tu nueva casa! 🏡 Ya puedes pasar por las llaves.", h: 150 },
      { dir: "in", text: "Muchas gracias por todo el acompañamiento!", h: 149 },
    ],
  },
  {
    name: "Gabriela Narváez",
    phone: "593958800211",
    etapa: "Cerrado",
    diasEnEtapa: 10,
    source: "organico",
    monto: 450,
    ficha: {
      interes: "Arriendo",
      tipo: "Departamento",
      zona: "Kennedy",
      presupuesto: 500,
      habitaciones: 1,
    },
    notas: "Contrato de arriendo firmado por 1 año.",
    chat: [
      { dir: "in", text: "Busco suite en la Kennedy, hasta 500", h: 400 },
      { dir: "out", ai: true, text: SALUDO, h: 399.98 },
      { dir: "out", text: "Gabriela, aquí tienes tu contrato firmado. ¡Bienvenida a tu nuevo hogar!", h: 240 },
    ],
  },
  {
    name: "Esteban Morales",
    phone: "593947700212",
    etapa: "Descartado",
    diasEnEtapa: 5,
    source: "anuncio",
    ficha: { interes: "Compra", tipo: "Casa", zona: "Salinas", presupuesto: 60000 },
    notas: "Busca casa en la playa por menos de $60.000. No tenemos inventario en ese rango.",
    chat: [
      { dir: "in", text: "Tienen casas en Salinas por 60 mil?", h: 130 },
      { dir: "out", ai: true, text: SALUDO, h: 129.98 },
      { dir: "out", ai: true, text: "Por ahora nuestras propiedades en la costa empiezan en $95.000. ¿Te aviso si entra alguna en tu rango?", h: 129.95 },
      { dir: "in", text: "Sí porfa, avísenme", h: 129 },
    ],
  },
];

const PROPIEDADES: { name: string; price: string; description: string }[] = [
  {
    name: "Casa 3 hab. en Samborondón (km 10)",
    price: "$175.000",
    description: "3 habitaciones, 2,5 baños, 160 m² de construcción, patio y 2 parqueaderos. Urbanización con guardianía 24/7 y áreas verdes. Califica para crédito BIESS.",
  },
  {
    name: "Departamento 2 hab. en Cumbayá",
    price: "$128.000",
    description: "95 m², 2 habitaciones, estudio, 2 baños y balcón con vista al valle. Edificio con gimnasio y parqueadero cubierto.",
  },
  {
    name: "Casa 4 hab. en Cumbayá",
    price: "$245.000",
    description: "280 m² de construcción en terreno de 400 m². 4 habitaciones, jardín, cuarto de servicio. Conjunto privado.",
  },
  {
    name: "Terreno 600 m² Vía a la Costa (km 14)",
    price: "$85.000",
    description: "Lote plano en urbanización cerrada con agua, luz y alcantarillado. Listo para construir.",
  },
  {
    name: "Departamento amoblado en Urdesa (arriendo)",
    price: "$650/mes + alícuota",
    description: "2 habitaciones, 2 baños, amoblado, parqueadero. Cerca de colegios y centros comerciales.",
  },
  {
    name: "Suite en la Kennedy (arriendo)",
    price: "$450/mes",
    description: "1 habitación, cocina equipada, lavandería. Ideal para profesionales.",
  },
  {
    name: "Casa de playa en Salinas",
    price: "$95.000",
    description: "2 habitaciones a 3 cuadras del malecón, terraza y piscina comunal.",
  },
  {
    name: "Local comercial en el norte de Guayaquil",
    price: "$1.200/mes",
    description: "80 m² con vitrina a la avenida, baño y bodega. Alto tráfico peatonal.",
  },
];

/** Instante UTC de un día/hora del negocio (Guayaquil). */
function instanteLocal(nowMs: number, dia: number | "sabado", hora: string): Date {
  const local = new Date(nowMs - UTC_OFFSET_H * HORA);
  let dias: number;
  if (dia === "sabado") {
    dias = (6 - local.getUTCDay() + 7) % 7 || 7;
  } else {
    dias = dia;
    // Domingo no se visita: la cita de "mañana" pasa al lunes.
    const dow = (local.getUTCDay() + dias + 7 * 10) % 7;
    if (dias > 0 && dow === 0) dias += 1;
  }
  const [h, m] = hora.split(":").map(Number) as [number, number];
  return new Date(
    Date.UTC(
      local.getUTCFullYear(),
      local.getUTCMonth(),
      local.getUTCDate() + dias,
      h + UTC_OFFSET_H,
      m
    )
  );
}

export async function seedInmobiliaria(
  db: Db,
  organizationId: string
): Promise<{ clientes: number; propiedades: number }> {
  const now = Date.now();

  await db.transaction(async (tx) => {
    // --- Limpieza (orden inverso de FKs) ---
    await tx.delete(schema.booking).where(eq(schema.booking.organizationId, organizationId));
    const prev = await tx
      .select({ id: schema.contact.id })
      .from(schema.contact)
      .where(eq(schema.contact.organizationId, organizationId));
    const prevIds = prev.map((c) => c.id);
    if (prevIds.length > 0) {
      const convs = await tx
        .select({ id: schema.conversation.id })
        .from(schema.conversation)
        .where(inArray(schema.conversation.contactId, prevIds));
      const convIds = convs.map((c) => c.id);
      if (convIds.length > 0) {
        await tx.delete(schema.message).where(inArray(schema.message.conversationId, convIds));
        await tx.delete(schema.conversation).where(inArray(schema.conversation.id, convIds));
      }
      await tx.delete(schema.lead).where(inArray(schema.lead.contactId, prevIds));
      await tx.delete(schema.contact).where(inArray(schema.contact.id, prevIds));
    }
    // Restos de una demo anterior de NODO (tablas que este código no conoce).
    for (const table of ["quote", "shipment"]) {
      await tx.execute(
        sql.raw(
          `DO $$ BEGIN IF to_regclass('public.${table}') IS NOT NULL THEN DELETE FROM ${table} WHERE organization_id = '${organizationId.replace(/'/g, "''")}'; END IF; END $$`
        )
      );
    }
    await tx.delete(schema.product).where(eq(schema.product.organizationId, organizationId));
    await tx.delete(schema.kbEntry).where(eq(schema.kbEntry.organizationId, organizationId));
    await tx.delete(schema.agentTestCase).where(eq(schema.agentTestCase.organizationId, organizationId));
    await tx.delete(schema.agentTestRun).where(eq(schema.agentTestRun.organizationId, organizationId));
    await tx.delete(schema.leadStageEvent).where(eq(schema.leadStageEvent.organizationId, organizationId));
    await tx.delete(schema.pipelineStage).where(eq(schema.pipelineStage.organizationId, organizationId));

    // --- Etapas: "Cerrado" es la de ganado ---
    const stageId = new Map<Etapa, string>();
    const stageKind = new Map<Etapa, "open" | "won" | "lost">();
    const etapas: { name: Etapa; kind: "open" | "won" | "lost" }[] = [
      ...ETAPAS.map((name) => ({
        name,
        kind: name === "Cerrado" ? ("won" as const) : ("open" as const),
      })),
      { name: "Descartado", kind: "lost" },
    ];
    for (const [i, e] of etapas.entries()) {
      const id = newId("stage");
      stageId.set(e.name, id);
      stageKind.set(e.name, e.kind);
      await tx.insert(schema.pipelineStage).values({
        id,
        organizationId,
        name: e.name,
        position: i,
        kind: e.kind,
      });
    }

    // --- Clientes ---
    let position = 0;
    for (const c of CLIENTES) {
      const contactId = newId("contact");
      await tx.insert(schema.contact).values({
        id: contactId,
        organizationId,
        phone: c.phone,
        waIdentity: c.phone,
        name: c.name,
        nameSource: "manual",
        notes: c.notas ?? null,
        ficha: c.ficha,
        source: c.source,
        createdAt: new Date(now - c.chat[0]!.h * HORA),
      });

      const last = c.chat[c.chat.length - 1]!;
      const lastIn = c.chat.filter((m) => m.dir === "in").at(-1) ?? c.chat[0]!;
      const conversationId = newId("conversation");
      await tx.insert(schema.conversation).values({
        id: conversationId,
        organizationId,
        contactId,
        aiEnabled: !c.tomada,
        handoffAt: c.handoff ? new Date(now - last.h * HORA) : null,
        handoffReason: c.handoff ? "modelo" : null,
        lastInboundAt: new Date(now - lastIn.h * HORA),
        lastMessageAt: new Date(now - last.h * HORA),
        unreadCount: last.dir === "in" ? 1 : 0,
      });
      for (const m of c.chat) {
        const at = new Date(now - m.h * HORA);
        await tx.insert(schema.message).values({
          id: newId("message"),
          organizationId,
          conversationId,
          waMessageId: `wamid.demo.${newId("message")}`,
          direction: m.dir,
          type: "text",
          text: m.text,
          status: m.dir === "in" ? "delivered" : "read",
          aiGenerated: m.ai ?? false,
          origin: m.dir === "in" ? "operator" : m.ai ? "ai" : "manual",
          waTimestamp: at,
          createdAt: at,
        });
      }

      const leadId = newId("lead");
      const sid = stageId.get(c.etapa)!;
      await tx.insert(schema.lead).values({
        id: leadId,
        organizationId,
        contactId,
        stageId: sid,
        position: position++,
        amountCents: c.monto ? c.monto * 100 : null,
        currency: c.monto ? "USD" : null,
        priority: c.prioridad ?? null,
        lastActivityAt: new Date(now - last.h * HORA),
        createdAt: new Date(now - c.chat[0]!.h * HORA),
      });
      // Un solo evento: desde cuándo está en su etapa actual.
      await tx.insert(schema.leadStageEvent).values({
        id: newId("leadStageEvent"),
        organizationId,
        leadId,
        contactId,
        toStageId: sid,
        toStageName: c.etapa,
        toStageKind: stageKind.get(c.etapa)!,
        occurredAt: new Date(now - c.diasEnEtapa * DIA - 2 * HORA),
        source: "sistema",
        approximate: true,
      });

      if (c.visita) {
        await tx.insert(schema.booking).values({
          id: newId("booking"),
          organizationId,
          kind: "session",
          status: c.visita.estado,
          source: "manual",
          contactId,
          conversationId,
          leadId,
          scheduledAt: instanteLocal(now, c.visita.dia, c.visita.hora),
          durationMinutes: 60,
          connector: "enlace-fijo",
          notes: c.ficha.zona ? `Visita en ${c.ficha.zona}` : null,
        });
      }
    }

    // --- Agenda: visitas de 1 h, lunes a sábado, hora de Ecuador ---
    const horario = {
      weeklyHours: {
        mon: [{ start: "09:00", end: "18:00" }],
        tue: [{ start: "09:00", end: "18:00" }],
        wed: [{ start: "09:00", end: "18:00" }],
        thu: [{ start: "09:00", end: "18:00" }],
        fri: [{ start: "09:00", end: "18:00" }],
        sat: [{ start: "09:00", end: "14:00" }],
      },
      slotMinutes: 60,
      bufferMinutes: 0,
      minNoticeHours: 2,
      maxDaysAhead: 30,
      timezone: ZONA,
      connector: "enlace-fijo",
      meetingLink: null,
      updatedAt: new Date(),
    };
    await tx
      .insert(schema.calendarSettings)
      .values({ id: newId("calendarSettings"), organizationId, ...horario })
      .onConflictDoUpdate({ target: schema.calendarSettings.organizationId, set: horario });

    // --- Propiedades (catálogo de vitrina; las fotos se suben en Catálogo) ---
    for (const p of PROPIEDADES) {
      await tx.insert(schema.product).values({
        id: newId("product"),
        organizationId,
        name: p.name,
        price: p.price,
        description: p.description,
      });
    }

    // --- Marca: Kore Residences ---
    const org = await tx
      .select({ metadata: schema.organization.metadata })
      .from(schema.organization)
      .where(eq(schema.organization.id, organizationId))
      .limit(1);
    let meta: Record<string, unknown> = {};
    try {
      meta = JSON.parse(org[0]?.metadata ?? "{}") ?? {};
    } catch {
      meta = {};
    }
    // El icono (monograma) se sube en Ajustes → Marca y sobrevive al seed.
    const favicon = (meta.branding as { favicon?: unknown } | undefined)?.favicon ?? null;
    meta.branding = { name: NOMBRE, accent: ACENTO, currency: "USD", favicon };
    await tx
      .update(schema.organization)
      .set({ name: NOMBRE, logo: null, metadata: JSON.stringify(meta) })
      .where(eq(schema.organization.id, organizationId));
  });

  return { clientes: CLIENTES.length, propiedades: PROPIEDADES.length };
}
