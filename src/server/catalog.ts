import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import {
  MediaValidationError,
  readMediaFile,
  saveMediaFile,
  validateOutgoing,
} from "@/server/whatsapp/media";

/**
 * Catálogo de productos (automatizate.ec). Lo edita el dueño en /catalog, el
 * agente lo lee en su prompt y manda la foto con la acción `send_product`.
 */

export type Product = typeof schema.product.$inferSelect;

export async function listProducts(organizationId: string): Promise<Product[]> {
  return getDb()
    .select()
    .from(schema.product)
    .where(scoped(schema.product.organizationId, organizationId))
    .orderBy(asc(schema.product.name));
}

export async function getProduct(
  organizationId: string,
  productId: string
): Promise<Product | null> {
  const rows = await getDb()
    .select()
    .from(schema.product)
    .where(
      scoped(
        schema.product.organizationId,
        organizationId,
        eq(schema.product.id, productId)
      )
    )
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Guarda la foto de un producto como `media_asset` y devuelve su id. Solo
 * imágenes que WhatsApp acepta como imagen (JPG/PNG dentro del límite): lo
 * demás llegaría al cliente como documento.
 */
export async function saveProductImage(
  organizationId: string,
  file: File
): Promise<string> {
  const data = Buffer.from(await file.arrayBuffer());
  const mimeType = file.type || "application/octet-stream";
  const kind = validateOutgoing(mimeType, data.byteLength);
  if (kind !== "image") {
    throw new MediaValidationError(
      "unsupported_type",
      "La foto debe ser JPG o PNG"
    );
  }
  const assetId = newId("mediaAsset");
  const storagePath = await saveMediaFile(organizationId, assetId, data);
  await getDb().insert(schema.mediaAsset).values({
    id: assetId,
    organizationId,
    kind: "image",
    mimeType,
    fileName: file.name || null,
    fileSize: data.byteLength,
    storagePath,
    fetchStatus: "available",
  });
  return assetId;
}

/** El archivo de la foto, listo para enviarse por WhatsApp. */
export async function readProductImage(
  organizationId: string,
  product: Product
): Promise<{ data: Buffer; mimeType: string; fileName?: string } | null> {
  if (!product.imageAssetId) return null;
  const rows = await getDb()
    .select()
    .from(schema.mediaAsset)
    .where(eq(schema.mediaAsset.id, product.imageAssetId))
    .limit(1);
  const asset = rows[0];
  if (!asset?.mimeType) return null;
  const data = await readMediaFile(organizationId, asset.id).catch(() => null);
  if (!data) return null;
  return { data, mimeType: asset.mimeType, fileName: asset.fileName ?? undefined };
}

/**
 * El catálogo como lo lee el agente. Los agotados no se listan: así no los
 * ofrece. El id va al principio porque es lo que pide `send_product`.
 */
export function renderCatalog(products: Product[]): string {
  const available = products.filter((p) => p.stock === null || p.stock > 0);
  if (available.length === 0) return "";
  return available
    .map((p) =>
      [
        `[${p.id}] ${p.name}`,
        p.price ? `Precio: ${p.price}` : null,
        p.stock !== null ? `Stock: ${p.stock}` : null,
        p.imageAssetId ? "Tiene foto" : "Sin foto",
        p.description ? `\n  ${p.description.replace(/\n+/g, " ")}` : null,
      ]
        .filter(Boolean)
        .join(" · ")
    )
    .join("\n");
}
