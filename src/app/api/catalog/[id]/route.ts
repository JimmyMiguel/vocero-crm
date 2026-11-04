import { eq } from "drizzle-orm";
import { apiError, withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import {
  countProductImages,
  getProduct,
  MAX_PRODUCT_IMAGES,
  updateProductImages,
} from "@/server/catalog";
import { reclamarAnuncios } from "@/server/catalog-ads";
import { readProductForm } from "../form";
import { saveImages } from "../images";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * Edita un producto/propiedad (multipart). `images` se agregan al final,
 * `removeImages` (ids) se quitan y `coverImage` (id) pasa a portada.
 */
export const PATCH = withAuth(async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const current = await getProduct(session.organizationId, id);
  if (!current) return apiError(404, "not_found", "Producto no encontrado");

  const form = await req.formData().catch(() => null);
  if (!form) return apiError(400, "invalid", "Se esperaba multipart/form-data");
  const fields = readProductForm(form);
  if (!fields.ok) return apiError(422, "invalid", fields.message);

  const existing = await countProductImages(session.organizationId, id);
  const total = existing - fields.removeImages.length + fields.images.length;
  if (fields.images.length && total > MAX_PRODUCT_IMAGES) {
    return apiError(422, "invalid", `Máximo ${MAX_PRODUCT_IMAGES} fotos por propiedad`);
  }

  const saved = await saveImages(session.organizationId, fields.images);
  if (saved instanceof Response) return saved;

  await getDb()
    .update(schema.product)
    .set({ ...fields.data, updatedAt: new Date() })
    .where(
      scoped(schema.product.organizationId, session.organizationId, eq(schema.product.id, id))
    );
  // Un anuncio pertenece a un solo producto: se le quita a cualquier otro.
  if (fields.data.adIds) {
    await reclamarAnuncios(session.organizationId, id, fields.data.adIds);
  }
  await updateProductImages(session.organizationId, id, {
    add: saved,
    remove: fields.removeImages,
    coverId: fields.coverImage,
  });

  return Response.json({ product: await getProduct(session.organizationId, id) });
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
