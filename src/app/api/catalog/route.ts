import { apiError, withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import {
  getProduct,
  listProducts,
  MAX_PRODUCT_IMAGES,
  updateProductImages,
} from "@/server/catalog";
import { reclamarAnuncios } from "@/server/catalog-ads";
import { readProductForm } from "./form";
import { saveImages } from "./images";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (session) => {
  const products = await listProducts(session.organizationId);
  return Response.json({ products });
});

/** Crea un producto/propiedad (multipart): campos de la ficha + `images` (varias). */
export const POST = withAuth(async (session, req: Request) => {
  const form = await req.formData().catch(() => null);
  if (!form) return apiError(400, "invalid", "Se esperaba multipart/form-data");
  const fields = readProductForm(form);
  if (!fields.ok) return apiError(422, "invalid", fields.message);
  if (!fields.data.name) return apiError(422, "invalid", "El nombre es obligatorio");
  if (fields.images.length > MAX_PRODUCT_IMAGES) {
    return apiError(422, "invalid", `Máximo ${MAX_PRODUCT_IMAGES} fotos`);
  }

  const saved = await saveImages(session.organizationId, fields.images);
  if (saved instanceof Response) return saved;

  const id = newId("product");
  await getDb()
    .insert(schema.product)
    .values({ ...fields.data, name: fields.data.name, id, organizationId: session.organizationId });
  if (saved.length) await updateProductImages(session.organizationId, id, { add: saved });
  // Un anuncio pertenece a un solo producto: se le quita a cualquier otro.
  if (fields.data.adIds?.length) {
    await reclamarAnuncios(session.organizationId, id, fields.data.adIds);
  }

  const product = await getProduct(session.organizationId, id);
  if (!product) return apiError(500, "internal", "No se pudo crear");
  return Response.json({ product }, { status: 201 });
});
