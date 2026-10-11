import { apiError, withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { listProducts, saveProductImage } from "@/server/catalog";
import { MediaValidationError } from "@/server/whatsapp/media";
import { readProductForm } from "./form";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (session) => {
  const products = await listProducts(session.organizationId);
  return Response.json({ products });
});

/** Crea un producto (multipart): name, price, description, stock, image. */
export const POST = withAuth(async (session, req: Request) => {
  const form = await req.formData().catch(() => null);
  if (!form) return apiError(400, "invalid", "Se esperaba multipart/form-data");
  const fields = readProductForm(form);
  if (!fields.ok) return apiError(422, "invalid", fields.message);
  if (!fields.data.name) return apiError(422, "invalid", "El nombre es obligatorio");

  let imageAssetId: string | null = null;
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

  const inserted = await getDb()
    .insert(schema.product)
    .values({
      id: newId("product"),
      organizationId: session.organizationId,
      name: fields.data.name,
      price: fields.data.price ?? null,
      description: fields.data.description ?? null,
      stock: fields.data.stock ?? null,
      imageAssetId,
    })
    .returning();
  if (!inserted[0]) return apiError(500, "internal", "No se pudo crear");
  return Response.json({ product: inserted[0] }, { status: 201 });
});
