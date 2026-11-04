import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { getAuth, runInternalSignup } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (session) => {
  const db = getDb();
  const members = await db
    .select({
      id: schema.member.id,
      role: schema.member.role,
      createdAt: schema.member.createdAt,
      name: schema.user.name,
      email: schema.user.email,
    })
    .from(schema.member)
    .innerJoin(schema.user, eq(schema.member.userId, schema.user.id))
    .where(scoped(schema.member.organizationId, session.organizationId));
  return Response.json({
    members: members.map((m) => ({
      id: m.id,
      role: m.role,
      name: m.name,
      email: m.email,
      createdAt: m.createdAt.toISOString(),
    })),
  });
});

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email(),
  password: z.string().min(8).max(128),
});

/** Alta de cuenta de equipo (owner only): email + contraseña temporal (FR-061). */
export const POST = withAuth(async (session, req: Request) => {
  if (session.role !== "owner") {
    return apiError(403, "forbidden", "Solo el propietario puede crear cuentas");
  }
  const body = await parseBody(req, createSchema);
  if (!body.ok) return body.response;

  const auth = getAuth();
  let newUserId: string;
  try {
    const result = await runInternalSignup(() =>
      auth.api.signUpEmail({
        body: {
          name: body.data.name,
          email: body.data.email,
          password: body.data.password,
        },
      })
    );
    newUserId = result.user.id;
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "No se pudo crear la cuenta";
    if (/exist/i.test(message)) {
      return apiError(409, "duplicate", "Ya existe una cuenta con ese correo");
    }
    return apiError(422, "invalid", message);
  }

  const db = getDb();
  await db
    .insert(schema.member)
    .values({
      id: newId("member"),
      organizationId: session.organizationId,
      userId: newUserId,
      role: "member",
    })
    .onConflictDoNothing();

  return Response.json({ ok: true }, { status: 201 });
});

const deleteSchema = z.object({ id: z.string().min(1) });

/**
 * Quitar a alguien del equipo (owner only). No se puede borrar al propietario
 * ni a uno mismo. Se borra su membresía y, si no pertenece a otra
 * organización, también su cuenta (sesiones y credenciales caen en cascada).
 */
export const DELETE = withAuth(async (session, req: Request) => {
  if (session.role !== "owner") {
    return apiError(403, "forbidden", "Solo el propietario puede quitar miembros");
  }
  const body = await parseBody(req, deleteSchema);
  if (!body.ok) return body.response;

  const db = getDb();
  const rows = await db
    .select({
      id: schema.member.id,
      role: schema.member.role,
      userId: schema.member.userId,
    })
    .from(schema.member)
    .where(scoped(schema.member.organizationId, session.organizationId, eq(schema.member.id, body.data.id)));
  const target = rows[0];
  if (!target) {
    return apiError(404, "not_found", "Miembro no encontrado");
  }
  if (target.role === "owner") {
    return apiError(422, "invalid", "No se puede quitar al propietario");
  }
  if (target.userId === session.userId) {
    return apiError(422, "invalid", "No puedes quitarte a ti mismo");
  }

  await db
    .delete(schema.member)
    .where(scoped(schema.member.organizationId, session.organizationId, eq(schema.member.id, target.id)));

  const others = await db
    .select({ id: schema.member.id })
    .from(schema.member)
    .where(and(eq(schema.member.userId, target.userId), ne(schema.member.id, target.id)));
  if (others.length === 0) {
    await db.delete(schema.user).where(eq(schema.user.id, target.userId));
  }

  return Response.json({ ok: true });
});
