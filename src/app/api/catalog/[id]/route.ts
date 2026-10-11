import { eq } from "drizzle-orm";
import { apiError, withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { getProduct, saveProductImage } from "@/server/catalog";
import { MediaValidationError } from "@/server/whatsapp/media";
import { readProductForm } from "../form";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Edita un producto (multipart). Una foto nueva reemplaza la anterior. */
export const PATCH = withAuth(async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const current = await getProduct(session.organizationId, id);
  if (!current) return apiError(404, "not_found", "Producto no encontrado");

  const form = await req.formData().catch(() => null);
  if (!form) return apiError(400, "invalid", "Se esperaba multipart/form-data");
  const fields = readProductForm(form);
  if (!fields.ok) return apiError(422, "invalid", fields.message);

  let imageAssetId = current.imageAssetId;
  if (fields.image) {
    try {
      imageAssetId = await saveProductImage(session.organizationId, fields.image);
    } catch (err) {
      if (err instanceof MediaValidationError) {
        return apiError(err.code === "too_large" ? 413 : 415, err.code, err.message);
      }
      throw err;
    }
  }

  const updated = await getDb()
    .update(schema.product)
    .set({ ...fields.data, imageAssetId, updatedAt: new Date() })
    .where(
      scoped(schema.product.organizationId, session.organizationId, eq(schema.product.id, id))
    )
    .returning();
  return Response.json({ product: updated[0] });
});

export const DELETE = withAuth(async (session, _req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const deleted = await getDb()
    .delete(schema.product)
    .where(
      scoped(schema.product.organizationId, session.organizationId, eq(schema.product.id, id))
    )
    .returning();
  if (!deleted[0]) return apiError(404, "not_found", "Producto no encontrado");
  return Response.json({ deleted: true });
});
