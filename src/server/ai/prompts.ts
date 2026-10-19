import { USD_POR_CBM } from "@/lib/nodo";
import type { schema } from "@/lib/db";

type AgentProfile = typeof schema.agentProfile.$inferSelect;
type KbEntry = typeof schema.kbEntry.$inferSelect;

/** Marcador del prompt del juez: el ai-mock lo usa para despachar veredictos. */
export const JUDGE_MARKER = "[JUEZ]";

export function renderKb(entries: KbEntry[]): string {
  if (entries.length === 0) return "(knowledge base vacío)";
  return entries
    .map((e) =>
      e.kind === "qa"
        ? `P: ${e.question}\nR: ${e.answer}`
        : (e.content ?? "")
    )
    .filter(Boolean)
    .join("\n\n");
}

/**
 * System prompt del agente (v1: inyecta el KB completo — el límite se
 * documenta con el contador de tamaño en la UI).
 */
export function buildAgentSystemPrompt(input: {
  profile: AgentProfile;
  kb: KbEntry[];
  stages: { name: string }[];
  /**
   * 015 — ¿esta instancia tiene agenda? Apagada, el prompt no gasta ni un
   * token en hablar de horarios: la agenda no existe aquí.
   */
  agenda?: boolean;
  /** Catálogo ya renderizado (`renderCatalog`); vacío = sin catálogo. */
  catalog?: string;
  /** NODO: próxima salida de contenedor (null = negocio sin contenedores). */
  nodo?: string | null;
}): string {
  const { profile } = input;
  const stageNames = input.stages.map((s) => s.name).join(" | ");
  const agendaLines = input.agenda
    ? [
        '- {"action":"offer_slots","reply":"..."} — ofrecer horarios para agendar (reply es solo la frase de entrada; los horarios los pone el sistema).',
        '- {"action":"book_slot","startUtc":"<uno de los horarios que el sistema ofreció, en ISO UTC>","reply":"..."} — agendar el horario que el cliente eligió.',
      ]
    : [];
  const agendaRules = input.agenda
    ? [
        "- NUNCA escribas tú los horarios ni los inventes: usa offer_slots y el sistema pega los reales.",
        "- book_slot solo acepta un horario que el sistema ofreció antes en ESTA conversación. Si el cliente pide otro, vuelve a ofrecer con offer_slots.",
        "- Si el cliente quiere CANCELAR una cita → handoff: esa decisión no es tuya.",
      ]
    : [];
  const catalogLines = input.catalog
    ? [
        '- {"action":"send_product","product":"<id del producto, p. ej. prd_…>","caption":"..."} — enviar la foto de un producto con un texto (caption: nombre, precio y una frase de venta).',
      ]
    : [];
  const catalogRules = input.catalog
    ? [
        "- Precios, stock y productos SOLO del catálogo. No ofrezcas lo que no está en él.",
        "- Cuando el cliente se interese en un producto que tiene foto, envíala con send_product (uno por turno).",
        "- Envía la foto de cada producto UNA sola vez por conversación: si en el historial ya aparece «[Foto enviada]» de ese producto, responde con reply.",
        "- Si el cliente pregunta otra cosa (envíos, pagos, dudas), respóndele eso con reply; no reenvíes una foto en su lugar.",
      ]
    : [];
  return [
    `Eres "${profile.name}", el asistente de WhatsApp de este negocio. Respondes SIEMPRE en español neutro, con mensajes breves y naturales para chat.`,
    profile.tone ? `Tono: ${profile.tone}` : null,
    profile.instructions ? `Instrucciones del negocio:\n${profile.instructions}` : null,
    profile.escalationRules
      ? `Reglas de escalado a humano:\n${profile.escalationRules}`
      : null,
    profile.greeting ? `Saludo sugerido para conversaciones nuevas: ${profile.greeting}` : null,
    `CONOCIMIENTO DEL NEGOCIO (tu única fuente de verdad; si algo no está aquí, NO lo inventes — di que lo confirmarás con el equipo o escala):\n${renderKb(input.kb)}`,
    input.catalog
      ? `CATÁLOGO DE PRODUCTOS (solo los disponibles; el id entre corchetes es para send_product):\n${input.catalog}`
      : null,
    input.nodo
      ? [
          "IMPORTACIÓN (contenedor compartido):",
          input.nodo,
          `Costo del servicio: $${USD_POR_CBM} por CBM (flete, agenciamiento y puerto), SIN impuestos de aduana: esos se calculan según el producto.`,
          "Datos que debes averiguar y guardar con save_ficha (usa EXACTAMENTE estas claves):",
          "- ciudad (Quito, Cuenca u otra) · tiene_proveedor (true/false) · producto · cantidad (número) · cbm (número, solo si el cliente lo sabe) · servicio (Importación, Maquinaria, Marca propia, Verificación o Viaje a ferias)",
          "- Si el cliente manda una foto del producto, agradécela: el equipo la usa como referencia.",
          "- Cuando ya tengas producto, cantidad y ciudad, o el cliente pida una cotización formal, precios exactos o negociar → handoff para que el equipo cotice.",
        ].join("\n")
      : null,
    `Etapas del pipeline disponibles: ${stageNames}`,
    [
      "En cada turno respondes ÚNICAMENTE un objeto JSON con UNA acción:",
      '- {"action":"none"} — no responder nada.',
      '- {"action":"reply","text":"..."} — responder al cliente.',
      '- {"action":"update_lead","note":"...","reply":"..."} — guardar una nota del lead (reply opcional).',
      '- {"action":"move_stage","stage":"<nombre exacto de etapa>","reply":"..."} — mover el lead (reply opcional).',
      '- {"action":"save_ficha","ficha":{"clave":"valor"},"reply":"..."} — guardar datos que el cliente te dio y seguir la conversación en reply.',
      '- {"action":"handoff","reason":"...","farewell":"..."} — escalar a un humano (farewell opcional para despedirte).',
      ...agendaLines,
      ...catalogLines,
      "Reglas duras:",
      "- Si el cliente pide hablar con una persona/humano/asesor → handoff.",
      "- Si la pregunta NO está cubierta por el conocimiento → NO inventes: responde que lo confirmarás o escala.",
      "- Si detectas intención clara de compra → move_stage a la etapa de interesados y confirma al cliente.",
      ...agendaRules,
      ...catalogRules,
      "- JSON puro, sin markdown ni texto adicional.",
    ].join("\n"),
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** Prompt del juez del Laboratorio: UNA llamada por conversación (FR-032). */
export function buildJudgePrompt(input: {
  persona: string;
  transcript: { role: "cliente" | "agente"; text: string }[];
  kbText: string;
  behaviorText: string;
}): { system: string; user: string } {
  const system = [
    `${JUDGE_MARKER} Eres un evaluador de calidad independiente de agentes de WhatsApp. Evalúas UNA conversación simulada completa contra el conocimiento y comportamiento configurados. Eres estricto: la alucinación (inventar datos que no están en el conocimiento) es la falla más grave.`,
    "Respondes ÚNICAMENTE un objeto JSON con este esquema:",
    '{"veredicto":"verde"|"amarillo"|"rojo","hallazgos":[{"tipo":"alucinacion"|"fuera_de_kb"|"debio_escalar"|"tono","evidencia":"cita textual del transcript","sugerencia":{"pregunta":"...","respuesta":"..."}}]}',
    "- verde: sin problemas relevantes. amarillo: mejorable. rojo: falla grave.",
    "- `sugerencia` es opcional: inclúyela cuando una nueva entrada P/R del knowledge base evitaría el problema.",
    "- Si el agente respondió sobre un tema que NO está en el conocimiento → hallazgo fuera_de_kb (o alucinacion si afirmó datos concretos).",
    "- Si el cliente pidió un humano y no hubo escalado → debio_escalar.",
  ].join("\n");

  const transcript = input.transcript
    .map((t) => `${t.role === "cliente" ? "CLIENTE" : "AGENTE"}: ${t.text}`)
    .join("\n");

  const user = [
    `PERSONA SIMULADA: ${input.persona}`,
    `COMPORTAMIENTO CONFIGURADO:\n${input.behaviorText || "(sin configurar)"}`,
    `CONOCIMIENTO CONFIGURADO:\n${input.kbText || "(vacío)"}`,
    `TRANSCRIPT COMPLETO:\n${transcript}`,
    "Evalúa y responde el JSON.",
  ].join("\n\n");

  return { system, user };
}
