import { getDb, schema } from "@/lib/db";
import { MetaApiError, normalizeMx } from "@/lib/meta/client";
import { BSUID_PREFIX, type ResolvedIdentity } from "@/server/inbox/identity";
import { ingestInboundMessage } from "@/server/inbox/ingest";
import { ZERNIO_BASE, zernioSentAtSeconds, type ZernioEvent } from "@/server/zernio";

/**
 * WhatsApp por Zernio (automatizate.ec).
 *
 * Para usar WhatsApp sin una app de Meta propia aprobada: Zernio es el dueño
 * de la integración con Meta y el CRM habla con Zernio. Se configura por
 * entorno (una instancia = un negocio) y solo se usa mientras NO haya un
 * número conectado directo con Meta: conectar uno en Ajustes → WhatsApp lo
 * reemplaza sin tocar nada más.
 */

export type ZernioWhatsappConfig = {
  token: string;
  accountId: string;
  webhookSecret: string;
};

export function zernioWhatsappConfig(): ZernioWhatsappConfig | null {
  const token = process.env.ZERNIO_API_KEY?.trim();
  const accountId = process.env.ZERNIO_WA_ACCOUNT_ID?.trim();
  const webhookSecret = process.env.ZERNIO_WA_WEBHOOK_SECRET?.trim();
  if (!token || !accountId || !webhookSecret) return null;
  return { token, accountId, webhookSecret };
}

/**
 * La organización de la instancia. Vocero es de un negocio por instancia (el
 * registro se cierra tras la primera), así que debe haber exactamente una; si
 * hubiera más, no se adivina a cuál pertenece el mensaje.
 */
async function instanceOrganizationId(): Promise<string | null> {
  const rows = await getDb()
    .select({ id: schema.organization.id })
    .from(schema.organization)
    .limit(2);
  return rows.length === 1 ? rows[0]!.id : null;
}

type ZernioWhatsappEvent = ZernioEvent & {
  message?: ZernioEvent["message"] & {
    sender?: {
      id?: string;
      name?: string | null;
      phoneNumber?: string | null;
      businessScopedUserId?: string | null;
    };
  };
};

export type ZernioWhatsappInbound = {
  accountRef: string;
  identity: ResolvedIdentity;
  messageId: string;
  text: string | null;
  type: string;
  timestamp: string;
  threadRef: string;
};

const ATTACHMENT_TYPE: Record<string, string> = {
  image: "image",
  video: "video",
  audio: "audio",
  file: "document",
  sticker: "sticker",
};

/**
 * Normaliza un `message.received` de WhatsApp. Puro, para probarlo sin base de
 * datos. El contacto queda igual que uno entrado por Meta (teléfono
 * normalizado o `bsuid:`), así que al pasar a Meta directo no se duplica.
 */
export function normalizeZernioWhatsappEvent(
  payload: unknown
): ZernioWhatsappInbound | null {
  const evt = payload as ZernioWhatsappEvent | null;
  if (!evt || typeof evt !== "object") return null;
  if (evt.event !== "message.received") return null;
  if ((evt.account?.platform ?? "").toLowerCase() !== "whatsapp") return null;
  if (evt.message?.direction && evt.message.direction !== "incoming") return null;

  const accountRef = evt.account?.id;
  const messageId = evt.message?.id;
  const threadRef = evt.message?.conversationId;
  const sender = evt.message?.sender;
  if (!accountRef || !messageId || !threadRef || !sender) return null;

  const profileName = sender.name?.trim() || null;
  const waUserId = sender.businessScopedUserId ?? null;
  const rawPhone = sender.phoneNumber ?? (/^\+?\d{6,}$/.test(sender.id ?? "") ? sender.id : null);
  let identity: ResolvedIdentity;
  if (rawPhone) {
    const phone = normalizeMx(rawPhone.replace(/^\+/, ""));
    identity = { identity: phone, phone, waUserId, profileName };
  } else if (waUserId) {
    identity = { identity: `${BSUID_PREFIX}${waUserId}`, phone: null, waUserId, profileName };
  } else {
    return null;
  }

  const text =
    typeof evt.message?.text === "string" && evt.message.text.length > 0
      ? evt.message.text
      : null;
  const attachment = evt.message?.attachments?.[0];
  // En la v1 el adjunto entrante no se descarga: entra con su tipo para que la
  // bandeja enseñe que llegó algo («📎 Imagen») y el operador lo vea en Zernio.
  const type = text ? "text" : attachment ? (ATTACHMENT_TYPE[attachment.type ?? ""] ?? "unsupported") : null;
  if (!type) return null;

  return {
    accountRef,
    identity,
    messageId,
    text,
    type,
    timestamp: zernioSentAtSeconds(evt.message?.sentAt),
    threadRef,
  };
}

export async function processZernioWhatsappEvent(payload: unknown): Promise<void> {
  const config = zernioWhatsappConfig();
  const inbound = normalizeZernioWhatsappEvent(payload);
  if (!config || !inbound) return;
  if (inbound.accountRef !== config.accountId) {
    console.warn(
      `[zernio-wa] evento de una cuenta que no es la configurada (${inbound.accountRef}): descartado`
    );
    return;
  }
  const organizationId = await instanceOrganizationId();
  if (!organizationId) {
    console.warn("[zernio-wa] la instancia no tiene exactamente una organización: descartado");
    return;
  }
  await ingestInboundMessage({
    organizationId,
    identity: inbound.identity,
    // Prefijado para no chocar con los wamid de Meta en el índice único.
    waMessageId: `zwa_${inbound.messageId}`,
    type: inbound.type,
    text: inbound.text,
    timestamp: inbound.timestamp,
    threadRef: inbound.threadRef,
  });
}

/**
 * Envía un adjunto (la foto de un producto) por Zernio con multipart, que es
 * como Zernio recibe un archivo binario. El texto va como pie de la imagen.
 */
export async function sendZernioWhatsappAttachment(input: {
  config: ZernioWhatsappConfig;
  conversationId: string;
  file: { data: Buffer; mimeType: string; fileName?: string };
  caption?: string;
  idempotencyKey?: string;
}): Promise<{ platformMessageId: string }> {
  const form = new FormData();
  form.set("accountId", input.config.accountId);
  if (input.caption) form.set("message", input.caption);
  form.set(
    "attachment",
    new Blob([new Uint8Array(input.file.data)], { type: input.file.mimeType }),
    input.file.fileName ?? "archivo"
  );

  let res: Response;
  try {
    res = await fetch(
      `${ZERNIO_BASE}/inbox/conversations/${encodeURIComponent(input.conversationId)}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${input.config.token}`,
          ...(input.idempotencyKey ? { "Idempotency-Key": input.idempotencyKey } : {}),
        },
        body: form,
      }
    );
  } catch (cause) {
    throw new MetaApiError("No se pudo contactar la API de Zernio", { status: 0, details: cause });
  }
  const json = (await res.json().catch(() => null)) as
    | { message?: { id?: string }; id?: string; error?: { message?: string } | string }
    | null;
  if (!res.ok) {
    const message =
      typeof json?.error === "string" ? json.error : (json?.error?.message ?? `HTTP ${res.status}`);
    throw new MetaApiError(message, { status: res.status, details: json });
  }
  return { platformMessageId: String(json?.message?.id ?? json?.id ?? `zernio_${Date.now()}`) };
}
