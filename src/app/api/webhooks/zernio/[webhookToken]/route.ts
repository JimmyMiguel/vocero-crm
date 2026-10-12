import { after } from "next/server";
import { getEnv } from "@/lib/env";
import { isValidWebhookToken } from "@/server/inbox/webhook";
import { isValidZernioSignature, zernioSignatureFrom } from "@/server/zernio";
import { processZernioPayload, resolveZernioSecret } from "@/server/zernio/dispatch";

/**
 * Webhook de Zernio para cualquier plataforma (automatizate.ec): WhatsApp por
 * Zernio y, si están encendidos, Instagram y Messenger. Zernio entrega todas
 * las cuentas por una sola URL y aquí se reparten por `account.platform`.
 *
 * Dos capas, como los demás webhooks: el segmento secreto de la URL y la firma
 * HMAC del cuerpo crudo. Para WhatsApp la firma es obligatoria: un mensaje
 * falso haría que el agente le escriba de verdad a quien el atacante elija.
 */
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ webhookToken: string }> };

export async function POST(req: Request, { params }: Params) {
  const { webhookToken } = await params;
  if (!isValidWebhookToken(webhookToken, getEnv().META_WEBHOOK_VERIFY_TOKEN)) {
    return new Response(null, { status: 404 });
  }

  const rawBody = await req.text();
  const { secret, channel } = await resolveZernioSecret(rawBody);
  if (channel === "whatsapp" && !secret) {
    return new Response(null, { status: 401 });
  }
  if (!isValidZernioSignature(rawBody, zernioSignatureFrom(req.headers), secret)) {
    return new Response(null, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return Response.json({ received: true });
  }

  // Zernio corta a los 5 segundos y reintenta: se acusa recibo ya.
  after(async () => {
    try {
      await processZernioPayload(payload);
    } catch (err) {
      console.error("[zernio] error procesando payload:", err);
    }
  });

  return Response.json({ received: true });
}
