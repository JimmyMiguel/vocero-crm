import { and, asc, eq, inArray } from "drizzle-orm";
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
export type ProductImage = { id: string; assetId: string };
export type ProductWithImages = Product & { images: ProductImage[] };

export const PRODUCT_STATUSES = ["disponible", "reservado", "vendido", "arrendado"] as const;
export const PRODUCT_OPERATIONS = ["venta", "arriendo"] as const;

/** Máximo de fotos por propiedad, y cuántas manda el agente de una vez. */
export const MAX_PRODUCT_IMAGES = 15;
export const AGENT_PHOTOS_PER_SEND = 4;

export async function listProducts(organizationId: string): Promise<ProductWithImages[]> {
  const db = getDb();
  const products = await db
    .select()
    .from(schema.product)
    .where(scoped(schema.product.organizationId, organizationId))
    .orderBy(asc(schema.product.name));
  const images = await db
    .select()
    .from(schema.productImage)
    .where(eq(schema.productImage.organizationId, organizationId))
    .orderBy(asc(schema.productImage.position), asc(schema.productImage.createdAt));
  const byProduct = new Map<string, ProductImage[]>();
  for (const img of images) {
    const list = byProduct.get(img.productId) ?? [];
    list.push({ id: img.id, assetId: img.mediaAssetId });
    byProduct.set(img.productId, list);
  }
  return products.map((p) => ({ ...p, images: byProduct.get(p.id) ?? [] }));
}

async function productImages(organizationId: string, productId: string) {
  return getDb()
    .select()
    .from(schema.productImage)
    .where(
      and(
        eq(schema.productImage.organizationId, organizationId),
        eq(schema.productImage.productId, productId)
      )
    )
    .orderBy(asc(schema.productImage.position), asc(schema.productImage.createdAt));
}

/**
 * Cambia las fotos de un producto: quita `remove`, agrega `add` al final y,
 * si viene `coverId`, la pone primera. Luego renumera y deja la portada en
 * `product.imageAssetId`, que es lo que leen la lista y el agente.
 */
export async function updateProductImages(
  organizationId: string,
  productId: string,
  changes: { add?: string[]; remove?: string[]; coverId?: string | null }
): Promise<void> {
  const db = getDb();
  if (changes.remove?.length) {
    await db
      .delete(schema.productImage)
      .where(
        and(
          eq(schema.productImage.organizationId, organizationId),
          eq(schema.productImage.productId, productId),
          inArray(schema.productImage.id, changes.remove)
        )
      );
  }
  if (changes.add?.length) {
    await db.insert(schema.productImage).values(
      changes.add.map((assetId, i) => ({
        id: newId("productImage"),
        organizationId,
        productId,
        mediaAssetId: assetId,
        position: 10_000 + i,
      }))
    );
  }
  const rows = await productImages(organizationId, productId);
  const cover = changes.coverId ? rows.find((r) => r.id === changes.coverId) : undefined;
  const ordered = cover ? [cover, ...rows.filter((r) => r !== cover)] : rows;
  for (const [i, row] of ordered.entries()) {
    if (row.position !== i) {
      await db
        .update(schema.productImage)
        .set({ position: i })
        .where(eq(schema.productImage.id, row.id));
    }
  }
  await db
    .update(schema.product)
    .set({ imageAssetId: ordered[0]?.mediaAssetId ?? null, updatedAt: new Date() })
    .where(
      scoped(schema.product.organizationId, organizationId, eq(schema.product.id, productId))
    );
}

/** Cuántas fotos tiene ya un producto (para no pasar el máximo). */
export async function countProductImages(
  organizationId: string,
  productId: string
): Promise<number> {
  return (await productImages(organizationId, productId)).length;
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

/** Las primeras `max` fotos del producto, listas para enviarse por WhatsApp. */
export async function readProductImages(
  organizationId: string,
  product: Product,
  max: number
): Promise<{ data: Buffer; mimeType: string; fileName?: string }[]> {
  const rows = await productImages(organizationId, product.id);
  const assetIds = rows.length
    ? rows.map((r) => r.mediaAssetId)
    : product.imageAssetId
      ? [product.imageAssetId]
      : [];
  const files: { data: Buffer; mimeType: string; fileName?: string }[] = [];
  for (const assetId of assetIds.slice(0, max)) {
    const asset = (
      await getDb()
        .select()
        .from(schema.mediaAsset)
        .where(eq(schema.mediaAsset.id, assetId))
        .limit(1)
    )[0];
    if (!asset?.mimeType) continue;
    const data = await readMediaFile(organizationId, asset.id).catch(() => null);
    if (data) files.push({ data, mimeType: asset.mimeType, fileName: asset.fileName ?? undefined });
  }
  return files;
}

const fmtNum = (n: number) => String(n).replace(".", ",");

/** La ficha en una línea: "Venta · Casa · Samborondón, km 10 · 3 hab · 2,5 baños · 160 m²…" */
export function propertySummary(p: Product): string {
  const where = [p.sector, p.city].filter(Boolean).join(", ");
  return [
    p.operation ? p.operation.charAt(0).toUpperCase() + p.operation.slice(1) : null,
    p.propertyType,
    where || null,
    p.bedrooms !== null ? `${p.bedrooms} hab` : null,
    p.bathrooms !== null ? `${fmtNum(p.bathrooms)} baños` : null,
    p.areaM2 !== null ? `${p.areaM2} m² construcción` : null,
    p.lotM2 !== null ? `${p.lotM2} m² terreno` : null,
    p.parking !== null ? `${p.parking} parqueadero${p.parking === 1 ? "" : "s"}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * El catálogo como lo lee el agente. Solo lo disponible (ni agotados, ni
 * reservados, vendidos o arrendados): así no lo ofrece. El id va al principio
 * porque es lo que pide `send_product`. El enlace de Maps no se le pasa.
 */
export function renderCatalog(products: (Product & { images?: ProductImage[] })[]): string {
  const available = products.filter(
    (p) => (p.stock === null || p.stock > 0) && (p.status ?? "disponible") === "disponible"
  );
  if (available.length === 0) return "";
  return available
    .map((p) => {
      const photos = p.images?.length ?? (p.imageAssetId ? 1 : 0);
      const summary = propertySummary(p);
      return [
        `[${p.id}] ${p.name}`,
        p.price ? `Precio: ${p.price}` : null,
        p.stock !== null ? `Stock: ${p.stock}` : null,
        photos === 0 ? "Sin foto" : photos === 1 ? "Tiene foto" : `${photos} fotos`,
        summary ? `\n  ${summary}` : null,
        p.features ? `\n  Incluye: ${p.features}` : null,
        p.description ? `\n  ${p.description.replace(/\n+/g, " ")}` : null,
      ]
        .filter(Boolean)
        .join(" · ")
        .replace(/ · \n/g, "\n");
    })
    .join("\n");
}

/**
 * El catálogo que recibe el agente (y el Laboratorio). Con AGENT_CATALOG=off
 * el catálogo es solo vitrina en el CRM: el agente no lo ve ni envía fotos.
 */
export async function agentCatalog(organizationId: string): Promise<string> {
  if (process.env.AGENT_CATALOG?.trim().toLowerCase() === "off") return "";
  return renderCatalog(await listProducts(organizationId));
}
