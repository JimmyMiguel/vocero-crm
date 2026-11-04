import { z } from "zod";
import { parseBody, withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { pushPublicKey, removeSubscription } from "@/server/push";

export const dynamic = "force-dynamic";

/** La clave pública que el navegador necesita para suscribirse. */
export const GET = withAuth(async () => {
  return Response.json({ publicKey: pushPublicKey() });
});

const subscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
});

/** Guarda (o reasigna) este dispositivo como destino de avisos. */
export const POST = withAuth(async (session, req: Request) => {
  const body = await parseBody(req, subscribeSchema);
  if (!body.ok) return body.response;
  const db = getDb();
  await db
    .insert(schema.pushSubscription)
    .values({
      id: newId("pushSubscription"),
      organizationId: session.organizationId,
      userId: session.userId,
      endpoint: body.data.endpoint,
      p256dh: body.data.keys.p256dh,
      auth: body.data.keys.auth,
    })
    .onConflictDoUpdate({
      target: schema.pushSubscription.endpoint,
      set: {
        organizationId: session.organizationId,
        userId: session.userId,
        p256dh: body.data.keys.p256dh,
        auth: body.data.keys.auth,
      },
    });
  return Response.json({ ok: true }, { status: 201 });
});

const deleteSchema = z.object({ endpoint: z.string().url() });

export const DELETE = withAuth(async (session, req: Request) => {
  const body = await parseBody(req, deleteSchema);
  if (!body.ok) return body.response;
  await removeSubscription(body.data.endpoint, session.userId);
  return Response.json({ ok: true });
});
