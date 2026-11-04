import { and, desc, eq, isNotNull, max, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import type { Product } from "@/server/catalog";

/**
 * Del anuncio de Meta al producto del catálogo (automatizate.ec).
 *
 * El referral de WhatsApp dice de qué anuncio llegó cada conversación
 * (`ad_attribution.source_id`) pero no de qué producto se trata: Meta no
 * conoce el catálogo. El puente es `product.ad_ids`, que se llena de dos
 * formas:
 *
 * 1. El dueño pega el ID del anuncio en el producto (lo seguro).
 * 2. Si nadie lo pegó y el titular o el texto del anuncio nombran UN solo
 *    producto, se conecta solo la primera vez que llega alguien de ese anuncio.
 *
 * Si no hay conexión, el agente igual recibe el titular y el texto del anuncio
 * para deducir el producto o preguntar. Un anuncio pertenece a UN producto.
 */

/** Forma de un ID de anuncio de Meta (numérico en la práctica). */
const AD_ID = /^[A-Za-z0-9_-]{1,128}$/;
export const MAX_AD_IDS = 50;

/**
 * Lee la lista de IDs que pega el dueño: separados por comas, espacios o
 * saltos de línea. Devuelve null si alguno no tiene forma de ID.
 */
export function parseAdIds(raw: string): { ok: true; ids: string[] } | { ok: false; bad: string } {
  const ids: string[] = [];
  for (const part of raw.split(/[\s,;]+/)) {
    const id = part.trim();
    if (!id) continue;
    if (!AD_ID.test(id)) return { ok: false, bad: id.slice(0, 40) };
    if (!ids.includes(id)) ids.push(id);
  }
  return { ok: true, ids: ids.slice(0, MAX_AD_IDS) };
}

/** Minúsculas, sin tildes ni signos: para comparar nombres con texto libre. */
export function normalizar(texto: string): string {
  return ` ${texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9ñ]+/g, " ")
    .trim()} `;
}

/**
 * El producto que nombra el texto del anuncio, si es UNO solo. Se busca el
 * nombre completo como palabras enteras; un nombre muy corto ("A", "Casa")
 * no cuenta porque aparecería en cualquier anuncio. Si dos productos
 * coinciden, gana el nombre más largo cuando contiene al otro («Casa Ceibo
 * Plus» frente a «Casa Ceibo»); si no, es ambiguo y no se elige.
 */
export function productoQueNombraElAnuncio(
  anuncio: { headline: string | null; body: string | null },
  products: Pick<Product, "id" | "name">[]
): string | null {
  const texto = normalizar(`${anuncio.headline ?? ""} ${anuncio.body ?? ""}`);
  if (texto.trim().length === 0) return null;
  const hits = products.filter((p) => {
    const nombre = normalizar(p.name);
    return nombre.trim().length >= 6 && texto.includes(nombre);
  });
  if (hits.length === 0) return null;
  if (hits.length === 1) return hits[0]!.id;
  const largo = [...hits].sort((a, b) => b.name.length - a.name.length)[0]!;
  const nombreLargo = normalizar(largo.name);
  const todosDentro = hits.every((h) => nombreLargo.includes(normalizar(h.name)));
  return todosDentro ? largo.id : null;
}

export function productoDelAnuncio<P extends Pick<Product, "adIds">>(
  products: P[],
  sourceId: string
): P | null {
  return products.find((p) => p.adIds.includes(sourceId)) ?? null;
}

export type AnuncioDeLaConversacion = {
  sourceId: string | null;
  sourceType: string | null;
  headline: string | null;
  body: string | null;
};

/**
 * Lo que el agente sabe del anuncio por el que llegó el cliente. Va al final
 * del prompt (estado de AHORA), como el mapa de huecos.
 */
export function contextoDelAnuncio(input: {
  anuncio: AnuncioDeLaConversacion;
  product: Product | null;
}): string {
  const { anuncio, product } = input;
  const tipo = anuncio.sourceType === "post" ? "una publicación" : "un anuncio";
  const titular = anuncio.headline ? `«${anuncio.headline}»` : "(sin titular)";
  const lineas = [`ORIGEN DEL CLIENTE: llegó desde ${tipo} de Meta: ${titular}.`];
  if (anuncio.body) lineas.push(`Texto del anuncio: ${anuncio.body.replace(/\s+/g, " ")}`);

  if (product) {
    // Producto sin existencias, o propiedad que ya no está «disponible».
    const vendido = product.stock === 0 || (product.status ?? "disponible") !== "disponible";
    lineas.push(`Ese anuncio es de este producto del catálogo: [${product.id}] ${product.name}.`);
    if (vendido) {
      lineas.push(
        "ESE PRODUCTO/PROPIEDAD YA NO ESTÁ DISPONIBLE (agotado, vendido, reservado o arrendado). Díselo al cliente con amabilidad desde el principio, no le envíes su foto ni le des su precio como si siguiera disponible, y ofrécele las alternativas disponibles del catálogo que más se parezcan."
      );
    } else {
      lineas.push(
        "Da por hecho que le interesa ESE producto: no le preguntes cuál le interesa. Respóndele con su información y, si tiene foto y aún no aparece «[Foto enviada]» de él, envíala con send_product."
      );
    }
  } else {
    lineas.push(
      "Ese anuncio no está conectado a ningún producto. Si el titular o el texto dejan claro de qué producto del catálogo se trata, atiende sobre ese producto; si no está claro, pregúntale amablemente cuál le interesa antes de dar precios."
    );
  }
  return lineas.join("\n");
}

/**
 * Deja `ids` SOLO en el producto `productId`: los quita de cualquier otro
 * producto de la organización.
 */
export async function reclamarAnuncios(
  organizationId: string,
  productId: string,
  ids: string[]
): Promise<void> {
  if (ids.length === 0) return;
  const db = getDb();
  const otros = await db
    .select({ id: schema.product.id, adIds: schema.product.adIds })
    .from(schema.product)
    .where(
      scoped(
        schema.product.organizationId,
        organizationId,
        sql`${schema.product.id} <> ${productId} and ${schema.product.adIds} && array[${sql.join(
          ids.map((id) => sql`${id}`),
          sql`, `
        )}]::text[]`
      )
    );
  for (const otro of otros) {
    await db
      .update(schema.product)
      .set({ adIds: otro.adIds.filter((id) => !ids.includes(id)), updatedAt: new Date() })
      .where(scoped(schema.product.organizationId, organizationId, eq(schema.product.id, otro.id)));
  }
}

/**
 * Conecta un anuncio a un producto si el anuncio aún no está en ninguno.
 * Idempotente y sin carreras graves: si dos turnos lo intentan a la vez, el
 * `not (ad_ids @> ...)` evita duplicar el ID en el mismo producto.
 */
export async function conectarAnuncioSolo(
  organizationId: string,
  productId: string,
  sourceId: string
): Promise<void> {
  await getDb()
    .update(schema.product)
    .set({
      adIds: sql`array_append(${schema.product.adIds}, ${sourceId})`,
      updatedAt: new Date(),
    })
    .where(
      scoped(
        schema.product.organizationId,
        organizationId,
        and(
          eq(schema.product.id, productId),
          sql`not (${schema.product.adIds} @> array[${sourceId}]::text[])`
        )
      )
    );
}

/** El anuncio de origen de la conversación (o, si no, el primero del contacto). */
export async function anuncioDeLaConversacion(
  organizationId: string,
  conversationId: string,
  contactId: string
): Promise<AnuncioDeLaConversacion | null> {
  const cols = {
    sourceId: schema.adAttribution.sourceId,
    sourceType: schema.adAttribution.sourceType,
    headline: schema.adAttribution.headline,
    body: schema.adAttribution.body,
  };
  const db = getDb();
  const propia = await db
    .select(cols)
    .from(schema.adAttribution)
    .where(
      scoped(
        schema.adAttribution.organizationId,
        organizationId,
        eq(schema.adAttribution.conversationId, conversationId)
      )
    )
    .limit(1);
  if (propia[0]) return propia[0];
  const delContacto = await db
    .select(cols)
    .from(schema.adAttribution)
    .where(
      scoped(
        schema.adAttribution.organizationId,
        organizationId,
        eq(schema.adAttribution.contactId, contactId)
      )
    )
    .orderBy(schema.adAttribution.createdAt)
    .limit(1);
  return delContacto[0] ?? null;
}

/**
 * Para el turno del agente: el contexto del anuncio de esta conversación, o ""
 * si no llegó de un anuncio. Si el anuncio no está conectado y su texto nombra
 * un solo producto, lo conecta en este momento. Nunca lanza: el anuncio es
 * contexto, y sin él el agente responde igual.
 */
export async function contextoDelAnuncioParaElTurno(input: {
  organizationId: string;
  conversationId: string;
  contactId: string;
  products: Product[];
}): Promise<string> {
  try {
    const anuncio = await anuncioDeLaConversacion(
      input.organizationId,
      input.conversationId,
      input.contactId
    );
    if (!anuncio) return "";
    let product = anuncio.sourceId ? productoDelAnuncio(input.products, anuncio.sourceId) : null;
    if (!product && anuncio.sourceId) {
      const id = productoQueNombraElAnuncio(anuncio, input.products);
      product = input.products.find((p) => p.id === id) ?? null;
      if (product) {
        await conectarAnuncioSolo(input.organizationId, product.id, anuncio.sourceId);
      }
    }
    return contextoDelAnuncio({ anuncio, product });
  } catch (err) {
    console.error(`[anuncios] no se pudo armar el contexto del anuncio: ${err}`);
    return "";
  }
}

export type AnuncioReciente = {
  sourceId: string;
  headline: string | null;
  conversaciones: number;
  ultimo: string;
};

/** Los anuncios de los que han llegado clientes, para conectarlos en el catálogo. */
export async function anunciosRecientes(organizationId: string): Promise<AnuncioReciente[]> {
  const ultimo = max(schema.adAttribution.createdAt);
  const rows = await getDb()
    .select({
      sourceId: schema.adAttribution.sourceId,
      headline: max(schema.adAttribution.headline),
      conversaciones: sql<number>`count(*)::int`,
      ultimo,
    })
    .from(schema.adAttribution)
    .where(
      scoped(
        schema.adAttribution.organizationId,
        organizationId,
        isNotNull(schema.adAttribution.sourceId)
      )
    )
    .groupBy(schema.adAttribution.sourceId)
    .orderBy(desc(ultimo))
    .limit(30);
  return rows.flatMap((r) =>
    r.sourceId
      ? [
          {
            sourceId: r.sourceId,
            headline: r.headline,
            conversaciones: r.conversaciones,
            ultimo: (r.ultimo ?? new Date(0)).toISOString(),
          },
        ]
      : []
  );
}
