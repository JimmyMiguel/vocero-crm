import webpush from "web-push";
import { eq, inArray } from "drizzle-orm";
import { getEnv } from "@/lib/env";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";

let configured: boolean | null = null;

function configure(): boolean {
  if (configured !== null) return configured;
  const env = getEnv();
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) {
    configured = false;
    return false;
  }
  webpush.setVapidDetails(
    env.VAPID_SUBJECT ?? env.APP_BASE_URL,
    env.VAPID_PUBLIC_KEY,
    env.VAPID_PRIVATE_KEY
  );
  configured = true;
  return true;
}

export function pushPublicKey(): string | null {
  return getEnv().VAPID_PUBLIC_KEY ?? null;
}

export type PushPayload = { title: string; body: string; url: string; tag?: string };

/**
 * Avisa a todos los dispositivos suscritos de la organización. Nunca lanza:
 * una notificación que falla no puede romper la entrada de un mensaje. Las
 * suscripciones muertas (404/410) se borran solas.
 */
export async function notifyOrganization(organizationId: string, payload: PushPayload): Promise<void> {
  try {
    if (!configure()) return;
    const db = getDb();
    const subs = await db
      .select()
      .from(schema.pushSubscription)
      .where(scoped(schema.pushSubscription.organizationId, organizationId));
    if (subs.length === 0) return;

    const dead: string[] = [];
    await Promise.all(
      subs.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            JSON.stringify(payload),
            { TTL: 60 * 60 }
          );
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) dead.push(sub.id);
          else console.error("[push] fallo al enviar:", status ?? err);
        }
      })
    );
    if (dead.length > 0) {
      await db.delete(schema.pushSubscription).where(inArray(schema.pushSubscription.id, dead));
    }
  } catch (err) {
    console.error("[push] error:", err);
  }
}

export async function removeSubscription(endpoint: string, userId: string): Promise<void> {
  const db = getDb();
  const rows = await db
    .select({ id: schema.pushSubscription.id, userId: schema.pushSubscription.userId })
    .from(schema.pushSubscription)
    .where(eq(schema.pushSubscription.endpoint, endpoint));
  if (rows[0] && rows[0].userId === userId) {
    await db.delete(schema.pushSubscription).where(eq(schema.pushSubscription.id, rows[0].id));
  }
}
