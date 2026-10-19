import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { createQuote } from "@/server/nodo";

export const dynamic = "force-dynamic";

const createSchema = z.object({ leadId: z.string().min(1) });

/** Emite una cotización con el siguiente número correlativo. */
export const POST = withAuth(async (session, req: Request) => {
  const body = await parseBody(req, createSchema);
  if (!body.ok) return body.response;
  const quote = await createQuote(session.organizationId, body.data.leadId);
  if (!quote) return apiError(404, "not_found", "Trato no encontrado");
  return Response.json({ quote }, { status: 201 });
});
