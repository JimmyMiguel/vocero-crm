import { withAuth } from "@/lib/api";
import { anunciosRecientes } from "@/server/catalog-ads";

export const dynamic = "force-dynamic";

/** Los anuncios de los que han llegado clientes, para conectarlos a un producto. */
export const GET = withAuth(async (session) => {
  const ads = await anunciosRecientes(session.organizationId);
  return Response.json({ ads });
});
