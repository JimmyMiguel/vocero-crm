import { eq, inArray } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "@/lib/db/schema";
import { newId } from "@/lib/db/ids";
import { NODO_ETAPAS, NODO_GREEN } from "@/lib/nodo";

type Db = PostgresJsDatabase<typeof schema>;

/**
 * Demo de NODO (nodoec.com): importación de China en contenedor compartido.
 * Deja la instancia lista para enseñar: marca, 10 etapas, salidas mensuales,
 * clientes con su conversación con la IA, conocimiento y agente.
 *
 * DESTRUCTIVO: borra contactos, conversaciones, catálogo, conocimiento y
 * etapas de la organización. Respáldala antes.
 */

const HORA = 3_600_000;
const DIA = 24 * HORA;

type Msg = { dir: "in" | "out"; text: string; ai?: boolean; h: number };

type Cliente = {
  name: string;
  phone: string;
  etapa: (typeof NODO_ETAPAS)[number];
  diasEnEtapa: number;
  contenedor?: "ago" | "sep" | "oct" | "nov";
  ficha: Record<string, string | number | boolean>;
  notas?: string;
  /** La IA pasó el caso al equipo y nadie lo tomó. */
  handoff?: boolean;
  /** El equipo tomó la conversación (IA en pausa). */
  tomada?: boolean;
  chat: Msg[];
};

const CONTENEDORES = {
  ago: { name: "Contenedor agosto", cutoffDate: "2026-08-05", departureDate: "2026-08-20", capacityCbm: 68 },
  sep: { name: "Contenedor septiembre", cutoffDate: "2026-09-10", departureDate: "2026-09-25", capacityCbm: 68 },
  oct: { name: "Contenedor octubre", cutoffDate: "2026-10-10", departureDate: "2026-10-25", capacityCbm: 68 },
  nov: { name: "Contenedor noviembre", cutoffDate: "2026-11-15", departureDate: "2026-11-25", capacityCbm: 68 },
  dic: { name: "Contenedor diciembre", cutoffDate: "2026-12-05", departureDate: "2026-12-20", capacityCbm: 68 },
} as const;

const SALUDO =
  "¡Hola! Soy Valeria, la asistente de NODO 🇨🇳➡️🇪🇨 Te ayudo a importar desde China en contenedor compartido. ¿Qué producto te gustaría traer?";

const CLIENTES: Cliente[] = [
  {
    name: "Joel Pujos",
    phone: "593990010085",
    etapa: "Esperando confirmación del cliente",
    diasEnEtapa: 3,
    contenedor: "nov",
    ficha: {
      ciudad: "El Empalme",
      tiene_proveedor: false,
      producto: "Máquinas para elaborar algodón de azúcar",
      cantidad: 1,
      cbm: 2.5,
      servicio: "Maquinaria",
      valor_mercaderia: 4210,
      tributos: 952.06,
    },
    notas: "Ya tiene la cotización 085. Quiere saber si puede pagar en dos partes.",
    chat: [
      { dir: "in", text: "Buenas, quiero traer una máquina de algodón de azúcar automática", h: 98 },
      { dir: "out", ai: true, text: SALUDO, h: 97.9 },
      { dir: "in", text: "Es una automática, de esas que venden en los centros comerciales. Soy de El Empalme", h: 97 },
      { dir: "out", ai: true, text: "¡Excelente! ¿Ya tienes proveedor en China o quieres que nuestro equipo te busque uno?", h: 96.9 },
      { dir: "in", text: "No tengo, búsquenme ustedes porfa", h: 96 },
      { dir: "out", ai: true, text: "Perfecto, nuestro equipo en China buscará opciones. Una máquina así ocupa unos 2,5 CBM: el servicio sería aprox. $1.500 (CBM × $600), sin impuestos de aduana. Te paso con un asesor para la cotización formal 🙌", h: 95.9 },
      { dir: "out", text: "Hola Joel, te envío la cotización 085 con la máquina que encontramos. Quedo atento a tu confirmación.", h: 72 },
      { dir: "in", text: "Gracias, la reviso con mi socio y le confirmo", h: 70 },
    ],
  },
  {
    name: "María Fernanda Quishpe",
    phone: "593991234501",
    etapa: "Nuevo contacto",
    diasEnEtapa: 0,
    handoff: true,
    ficha: {
      ciudad: "Quito",
      tiene_proveedor: false,
      producto: "Termos de acero con logo grabado",
      cantidad: 2000,
      cbm: 3.2,
      servicio: "Marca propia",
    },
    chat: [
      { dir: "in", text: "Hola! quiero hacer termos con el logo de mi marca", h: 5 },
      { dir: "out", ai: true, text: SALUDO, h: 4.95 },
      { dir: "in", text: "Termos de acero inoxidable de 500ml, unos 2000. Estoy en Quito", h: 4.5 },
      { dir: "out", ai: true, text: "¡Qué buena idea! Con marca propia el proveedor graba tu logo en fábrica. ¿Ya tienes un proveedor o lo buscamos nosotros?", h: 4.45 },
      { dir: "in", text: "No tengo. Me pueden dar el precio exacto por termo ya mismo? necesito decidir hoy", h: 4 },
      { dir: "out", ai: true, text: "Te entiendo 🙌 El precio por unidad lo calcula nuestro equipo con el proveedor. Paso tu caso a un asesor ahora mismo para que te dé la cotización formal hoy.", h: 3.95 },
    ],
  },
  {
    name: "Carlos Andrade",
    phone: "593987650002",
    etapa: "Muestra en aprobación",
    diasEnEtapa: 6,
    contenedor: "oct",
    tomada: true,
    ficha: {
      ciudad: "Cuenca",
      tiene_proveedor: true,
      producto: "Faros LED para vehículos",
      cantidad: 500,
      cbm: 1.8,
      servicio: "Importación",
      valor_mercaderia: 6500,
    },
    notas: "Muestra enviada por DHL el 12/10. Revisa que los conectores sean H4.",
    chat: [
      { dir: "in", text: "Buen día, tengo proveedor de faros LED en Guangzhou, necesito que me traigan la carga", h: 300 },
      { dir: "out", ai: true, text: SALUDO, h: 299.9 },
      { dir: "in", text: "Son 500 juegos, como 1.8 cbm según el proveedor. Estoy en Cuenca", h: 299 },
      { dir: "out", ai: true, text: "¡Listo, Carlos! Con 1,8 CBM el servicio de importación sería aprox. $1.080 (sin impuestos). ¿Quieres que pidamos una muestra antes de producir?", h: 298.9 },
      { dir: "in", text: "Sí, primero la muestra", h: 298 },
      { dir: "out", text: "Carlos, soy Andrés de NODO. La muestra ya salió por DHL, te aviso apenas llegue a Cuenca.", h: 150 },
      { dir: "in", text: "Perfecto, gracias Andrés", h: 149 },
    ],
  },
  {
    name: "Gabriela Torres",
    phone: "593998880003",
    etapa: "Pago confirmado",
    diasEnEtapa: 2,
    contenedor: "oct",
    ficha: {
      ciudad: "Quito",
      tiene_proveedor: true,
      producto: "Ropa deportiva (leggings y tops)",
      cantidad: 1200,
      cbm: 4.5,
      servicio: "Importación",
      valor_mercaderia: 7800,
    },
    chat: [
      { dir: "in", text: "Hola, ya hice la transferencia al proveedor, les mando el comprobante", h: 50 },
      { dir: "out", ai: true, text: "¡Gracias, Gabriela! Recibido 🙌 El equipo lo valida y te confirma. Tu carga va en el contenedor de octubre.", h: 49.9 },
      { dir: "in", text: "Genial, cuándo sale?", h: 49 },
      { dir: "out", ai: true, text: "El contenedor de octubre sale el 25 de octubre y llega a Ecuador en unos 55 días.", h: 48.9 },
    ],
  },
  {
    name: "Luis Mejía",
    phone: "593984440004",
    etapa: "En producción",
    diasEnEtapa: 9,
    contenedor: "oct",
    ficha: {
      ciudad: "Guayaquil",
      tiene_proveedor: false,
      producto: "Empacadora al vacío industrial",
      cantidad: 2,
      cbm: 3,
      servicio: "Maquinaria",
      valor_mercaderia: 5400,
    },
    chat: [
      { dir: "in", text: "Cómo va la producción de mis empacadoras?", h: 30 },
      { dir: "out", ai: true, text: "Hola Luis 👋 Tus 2 empacadoras están en producción. El proveedor estima terminarlas antes del corte de bodega del contenedor de octubre.", h: 29.9 },
      { dir: "in", text: "Ok, me mandan fotos cuando estén?", h: 29 },
      { dir: "out", ai: true, text: "¡Claro! En la inspección en China tomamos fotos y videos y te los enviamos.", h: 28.9 },
    ],
  },
  {
    name: "Andrea Sarmiento",
    phone: "593979990006",
    etapa: "Buscando proveedor",
    diasEnEtapa: 4,
    contenedor: "nov",
    ficha: {
      ciudad: "Cuenca",
      tiene_proveedor: false,
      producto: "Juguetes didácticos de madera",
      cantidad: 800,
      cbm: 2.2,
      servicio: "Importación",
    },
    chat: [
      { dir: "in", text: "Hola, tengo una tienda de juguetes en Cuenca. Quiero traer juguetes montessori de madera", h: 110 },
      { dir: "out", ai: true, text: SALUDO, h: 109.9 },
      { dir: "in", text: "Unos 800 juegos variados. No tengo proveedor", h: 109 },
      { dir: "out", ai: true, text: "¡Perfecto, Andrea! Nuestro equipo en China ya busca proveedores con certificación para juguetes. Te enviamos opciones en unos días.", h: 108.9 },
    ],
  },
  {
    name: "Diego Paredes",
    phone: "593996660007",
    etapa: "Esperando confirmación del cliente",
    diasEnEtapa: 8,
    ficha: {
      ciudad: "Quito",
      tiene_proveedor: false,
      producto: "Viaje a la Feria de Cantón",
      servicio: "Viaje a ferias",
    },
    notas: "Le interesa la fase 2 (hogar y regalos). Enviada propuesta de viaje.",
    chat: [
      { dir: "in", text: "Organizan viajes a la feria de Cantón?", h: 220 },
      { dir: "out", ai: true, text: "¡Sí! Te acompañamos a la feria con traductor y visitas a fábricas. ¿Qué categoría de productos te interesa?", h: 219.9 },
      { dir: "in", text: "Artículos para el hogar y regalos", h: 219 },
      { dir: "out", ai: true, text: "Esa es la fase 2 de la feria. Te paso con un asesor para armar tu viaje ✈️", h: 218.9 },
      { dir: "out", text: "Diego, te envié la propuesta del viaje por correo. ¿Pudiste revisarla?", h: 192 },
    ],
  },
  {
    name: "Paola Vinueza",
    phone: "593983330008",
    etapa: "Inspección en China",
    diasEnEtapa: 1,
    contenedor: "oct",
    ficha: {
      ciudad: "Ambato",
      tiene_proveedor: true,
      producto: "Mochilas escolares",
      cantidad: 1500,
      cbm: 5,
      servicio: "Verificación",
      valor_mercaderia: 9000,
    },
    chat: [
      { dir: "in", text: "Ya está mi pedido de mochilas en la bodega?", h: 20 },
      { dir: "out", ai: true, text: "¡Hola Paola! Sí, llegó a nuestra bodega en Yiwu y está en inspección. Revisamos cantidades y calidad antes de consolidar.", h: 19.9 },
    ],
  },
  {
    name: "Santiago Herrera",
    phone: "593995550009",
    etapa: "En tránsito",
    diasEnEtapa: 24,
    contenedor: "sep",
    ficha: {
      ciudad: "Quito",
      tiene_proveedor: true,
      producto: "Repuestos de motos",
      cantidad: 3000,
      cbm: 3.8,
      servicio: "Importación",
      valor_mercaderia: 8200,
      tributos: 2150,
    },
    chat: [
      { dir: "in", text: "Hola, cuándo llega el contenedor de septiembre?", h: 70 },
      { dir: "out", ai: true, text: "Hola Santiago 👋 El contenedor de septiembre salió el 25 de septiembre y llega a Ecuador aprox. el 19 de noviembre.", h: 69.9 },
    ],
  },
  {
    name: "Verónica Cárdenas",
    phone: "593972220010",
    etapa: "En tránsito",
    diasEnEtapa: 24,
    contenedor: "sep",
    ficha: {
      ciudad: "Cuenca",
      tiene_proveedor: false,
      producto: "Vajilla de cerámica",
      cantidad: 400,
      cbm: 2.7,
      servicio: "Importación",
      valor_mercaderia: 3100,
    },
    chat: [
      { dir: "in", text: "Mi vajilla viene bien empacada? me preocupa que se rompa", h: 90 },
      { dir: "out", ai: true, text: "¡Tranquila, Verónica! En la inspección verificamos el embalaje reforzado antes de cargar. Va en el contenedor de septiembre.", h: 89.9 },
    ],
  },
  {
    name: "Jorge Villacís",
    phone: "593981110011",
    etapa: "Impuestos de aduana pendientes",
    diasEnEtapa: 3,
    contenedor: "ago",
    handoff: true,
    ficha: {
      ciudad: "Quito",
      tiene_proveedor: true,
      producto: "Sillas de oficina ergonómicas",
      cantidad: 120,
      cbm: 6,
      servicio: "Importación",
      valor_mercaderia: 9600,
      tributos: 3480,
    },
    chat: [
      { dir: "in", text: "Me llegó el valor de los impuestos, me parece muy alto. Por qué tanto?", h: 26 },
      { dir: "out", ai: true, text: "Entiendo tu duda, Jorge. Los tributos dependen de la partida arancelaria del producto. Paso tu caso a un asesor para que te explique el detalle.", h: 25.9 },
    ],
  },
  {
    name: "Ana Lucía Ortega",
    phone: "593977770012",
    etapa: "Entregado",
    diasEnEtapa: 5,
    contenedor: "ago",
    ficha: {
      ciudad: "Loja",
      tiene_proveedor: false,
      producto: "Lámparas decorativas",
      cantidad: 300,
      cbm: 1.6,
      servicio: "Importación",
      valor_mercaderia: 2400,
      tributos: 610,
    },
    chat: [
      { dir: "in", text: "Ya me llegaron las lámparas a Loja por Servientrega, todo perfecto!", h: 120 },
      { dir: "out", ai: true, text: "¡Qué alegría, Ana Lucía! 🎉 Gracias por confiar en NODO. Cuando quieras traer tu próximo pedido, aquí estamos.", h: 119.9 },
    ],
  },
  {
    name: "Fernando Guamán",
    phone: "593969990013",
    etapa: "Buscando proveedor",
    diasEnEtapa: 11,
    ficha: {
      ciudad: "Riobamba",
      tiene_proveedor: true,
      producto: "Verificación de fábrica de calzado",
      servicio: "Verificación",
    },
    chat: [
      { dir: "in", text: "Tengo un proveedor de zapatos pero no confío, pueden ir a ver la fábrica?", h: 270 },
      { dir: "out", ai: true, text: "¡Claro, Fernando! Nuestro servicio de verificación visita la fábrica, revisa licencias y capacidad, y te enviamos un informe con fotos.", h: 269.9 },
    ],
  },
  {
    name: "Daniela Ruiz",
    phone: "593958880014",
    etapa: "Buscando proveedor",
    diasEnEtapa: 2,
    contenedor: "nov",
    ficha: {
      ciudad: "Quito",
      tiene_proveedor: false,
      producto: "Botellas térmicas con marca propia",
      cantidad: 1000,
      cbm: 2,
      servicio: "Marca propia",
    },
    chat: [
      { dir: "in", text: "Quiero botellas con mi marca para mi gimnasio, unas 1000", h: 52 },
      { dir: "out", ai: true, text: SALUDO, h: 51.9 },
      { dir: "out", ai: true, text: "Con 1000 botellas serían unos 2 CBM: el servicio sale aprox. $1.200 (sin impuestos). Ya buscamos proveedores que graben tu logo 💪", h: 51.8 },
    ],
  },
  {
    name: "Ricardo Espinoza",
    phone: "593947770015",
    etapa: "Nuevo contacto",
    diasEnEtapa: 1,
    handoff: true,
    ficha: {
      ciudad: "Cuenca",
      producto: "Cortadora láser CNC",
      cantidad: 1,
      servicio: "Maquinaria",
    },
    chat: [
      { dir: "in", text: "Buenas tardes, necesito una cortadora láser CNC para mi taller", h: 22 },
      { dir: "out", ai: true, text: SALUDO, h: 21.95 },
      { dir: "in", text: "Prefiero hablar con una persona, es una inversión grande", h: 21 },
      { dir: "out", ai: true, text: "¡Por supuesto, Ricardo! Te paso con un asesor de maquinaria que te contactará en breve.", h: 20.95 },
    ],
  },
];

const KB: { kind: "qa" | "block"; question?: string; answer?: string; content?: string }[] = [
  {
    kind: "block",
    content:
      "NODO (nodoec.com) es una empresa ecuatoriana que importa productos de China para emprendedores en contenedor compartido (carga consolidada). Servicios: importación, maquinaria, marca propia, verificación de fábricas y viajes a ferias. Tenemos equipo en China y bodegas en Yiwu y Guangzhou. Atendemos en Quito, Cuenca y enviamos a todo el Ecuador.",
  },
  { kind: "qa", question: "¿Cuánto cuesta importar?", answer: "El servicio de importación cuesta $600 por metro cúbico (CBM) e incluye flete internacional, agenciamiento aduanero y costos en puerto de destino. No incluye los impuestos de aduana: se calculan según el producto. A eso se suma el valor de la mercadería y aprox. 8 % por transferencia e ISD." },
  { kind: "qa", question: "¿Cada cuánto sale un contenedor?", answer: "Hay una salida mensual de contenedor compartido. El tránsito hasta Ecuador toma unos 55 días." },
  { kind: "qa", question: "¿Necesito tener proveedor?", answer: "No. Si no tienes proveedor, nuestro equipo en China lo busca por ti y te envía opciones." },
  { kind: "qa", question: "¿Cuál es el proceso?", answer: "1) Nos cuentas qué producto y cantidad quieres. 2) Buscamos proveedor. 3) Confirmas la cotización. 4) Apruebas la muestra. 5) Pagas. 6) Se produce. 7) Lo inspeccionamos en China. 8) Viaja en el contenedor (~55 días). 9) Pagas impuestos de aduana. 10) Te lo entregamos." },
  { kind: "qa", question: "¿Cuándo se pagan los impuestos?", answer: "Los gastos logísticos más impuestos y tributos (aranceles, FODINFA, IVA) se pagan una semana antes de que el contenedor llegue al puerto de Guayaquil." },
  { kind: "qa", question: "¿Hacen envíos a provincia?", answer: "Sí, por agencias terrestres como Servientrega o Tramaco, previo pago del flete interno. Desde aprox. $10." },
  { kind: "qa", question: "¿Qué productos no se pueden importar?", answer: "No aceptamos réplicas de marcas, productos prohibidos ni los que requieren permisos no gestionados antes (INEN, ARCSA, Agrocalidad)." },
  { kind: "qa", question: "¿En qué moneda se paga?", answer: "Todos los pagos son en dólares (USD)." },
  { kind: "qa", question: "¿Hay reembolsos?", answer: "Una vez iniciado el proceso de consolidación y flete no hay opción de reembolso." },
  { kind: "qa", question: "¿Qué es un CBM?", answer: "Un metro cúbico (1 m × 1 m × 1 m). Es la medida con la que se cobra el espacio en el contenedor compartido." },
];

export async function seedNodo(
  db: Db,
  organizationId: string
): Promise<{ clientes: number; contenedores: number }> {
  const now = Date.now();

  // --- Limpieza (orden inverso de FKs) ---
  const prev = await db
    .select({ id: schema.contact.id })
    .from(schema.contact)
    .where(eq(schema.contact.organizationId, organizationId));
  const prevIds = prev.map((c) => c.id);
  if (prevIds.length > 0) {
    const convs = await db
      .select({ id: schema.conversation.id })
      .from(schema.conversation)
      .where(inArray(schema.conversation.contactId, prevIds));
    const convIds = convs.map((c) => c.id);
    if (convIds.length > 0) {
      await db.delete(schema.message).where(inArray(schema.message.conversationId, convIds));
      await db.delete(schema.conversation).where(inArray(schema.conversation.id, convIds));
    }
    await db.delete(schema.lead).where(inArray(schema.lead.contactId, prevIds));
    await db.delete(schema.contact).where(inArray(schema.contact.id, prevIds));
  }
  await db.delete(schema.quote).where(eq(schema.quote.organizationId, organizationId));
  await db.delete(schema.shipment).where(eq(schema.shipment.organizationId, organizationId));
  await db.delete(schema.product).where(eq(schema.product.organizationId, organizationId));
  await db.delete(schema.kbEntry).where(eq(schema.kbEntry.organizationId, organizationId));
  await db.delete(schema.agentTestCase).where(eq(schema.agentTestCase.organizationId, organizationId));
  await db.delete(schema.agentTestRun).where(eq(schema.agentTestRun.organizationId, organizationId));
  await db.delete(schema.leadStageEvent).where(eq(schema.leadStageEvent.organizationId, organizationId));
  await db.delete(schema.pipelineStage).where(eq(schema.pipelineStage.organizationId, organizationId));

  // --- Etapas: las 10 de NODO; "Entregado" es la de ganado ---
  const stageId = new Map<string, string>();
  const stageKind = new Map<string, "open" | "won" | "lost">();
  const etapas: { name: string; kind: "open" | "won" | "lost" }[] = [
    ...NODO_ETAPAS.map((name) => ({
      name,
      kind: name === "Entregado" ? ("won" as const) : ("open" as const),
    })),
    { name: "Descartado", kind: "lost" },
  ];
  for (const [i, e] of etapas.entries()) {
    const id = newId("stage");
    stageId.set(e.name, id);
    stageKind.set(e.name, e.kind);
    await db.insert(schema.pipelineStage).values({
      id,
      organizationId,
      name: e.name,
      position: i,
      kind: e.kind,
    });
  }

  // --- Contenedores ---
  const shipId = new Map<string, string>();
  for (const [key, c] of Object.entries(CONTENEDORES)) {
    const id = newId("shipment");
    shipId.set(key, id);
    await db.insert(schema.shipment).values({ id, organizationId, ...c, transitDays: 55 });
  }

  // --- Clientes ---
  let position = 0;
  for (const c of CLIENTES) {
    const contactId = newId("contact");
    await db.insert(schema.contact).values({
      id: contactId,
      organizationId,
      phone: c.phone,
      waIdentity: c.phone,
      name: c.name,
      nameSource: "manual",
      notes: c.notas ?? null,
      ficha: c.ficha,
      source: "organico",
      createdAt: new Date(now - c.chat[0]!.h * HORA),
    });

    const last = c.chat[c.chat.length - 1]!;
    const lastIn = c.chat.filter((m) => m.dir === "in").at(-1) ?? c.chat[0]!;
    const conversationId = newId("conversation");
    await db.insert(schema.conversation).values({
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
      await db.insert(schema.message).values({
        id: newId("message"),
        organizationId,
        conversationId,
        waMessageId: `wamid.nodo.${newId("message")}`,
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
    await db.insert(schema.lead).values({
      id: leadId,
      organizationId,
      contactId,
      stageId: sid,
      position: position++,
      shipmentId: c.contenedor ? shipId.get(c.contenedor)! : null,
      lastActivityAt: new Date(now - last.h * HORA),
      createdAt: new Date(now - c.chat[0]!.h * HORA),
    });
    // Un solo evento: desde cuándo está en su etapa actual.
    await db.insert(schema.leadStageEvent).values({
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
  }

  // --- Conocimiento y agente ---
  for (const e of KB) {
    await db.insert(schema.kbEntry).values({
      id: newId("kbEntry"),
      organizationId,
      kind: e.kind,
      question: e.question ?? null,
      answer: e.answer ?? null,
      content: e.content ?? null,
    });
  }
  await db
    .update(schema.agentProfile)
    .set({
      name: "Valeria",
      tone: "Cercana, clara y profesional. Tutea al cliente y usa pocos emojis.",
      instructions:
        "Atiendes a emprendedores que quieren importar de China con NODO. Averigua y guarda con save_ficha: ciudad, si tiene proveedor, producto, cantidad, CBM si lo sabe y el servicio. Da el costo estimado solo como CBM × $600 y aclara siempre que no incluye impuestos de aduana. Cuando tengas los datos, o el cliente pida cotización formal o precios exactos, pasa el caso al equipo con handoff.",
      escalationRules:
        "Pasa a una persona si: pide cotización formal o precio por unidad, reclama por impuestos o retrasos, pregunta por productos restringidos (INEN, ARCSA, Agrocalidad), quiere negociar pagos, o pide hablar con alguien.",
      greeting: SALUDO,
      updatedAt: new Date(),
    })
    .where(eq(schema.agentProfile.organizationId, organizationId));

  // --- Marca ---
  const org = await db
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
  const prevBranding = (meta.branding ?? {}) as Record<string, unknown>;
  meta.branding = { ...prevBranding, name: "NODO", accent: NODO_GREEN, currency: "USD" };
  await db
    .update(schema.organization)
    .set({ name: "NODO", metadata: JSON.stringify(meta) })
    .where(eq(schema.organization.id, organizationId));

  return { clientes: CLIENTES.length, contenedores: Object.keys(CONTENEDORES).length };
}
