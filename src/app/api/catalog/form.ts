import { parseAdIds } from "@/server/catalog-ads";

/**
 * Lee los campos del formulario de producto. Un campo ausente no se toca (para
 * editar); uno vacío se borra (null). `name` vacío nunca es válido.
 */
export function readProductForm(form: FormData):
  | {
      ok: true;
      data: {
        name?: string;
        price?: string | null;
        description?: string | null;
        stock?: number | null;
        adIds?: string[];
      };
      image: File | null;
    }
  | { ok: false; message: string } {
  const text = (key: string, max: number): string | null | undefined => {
    const v = form.get(key);
    if (typeof v !== "string") return undefined;
    const t = v.trim();
    return t ? t.slice(0, max) : null;
  };

  const name = text("name", 200);
  if (name === null) return { ok: false, message: "El nombre es obligatorio" };

  const stockRaw = text("stock", 10);
  let stock: number | null | undefined = stockRaw === undefined ? undefined : null;
  if (stockRaw) {
    stock = Number(stockRaw);
    if (!Number.isInteger(stock) || stock < 0) {
      return { ok: false, message: "El stock debe ser un número entero ≥ 0" };
    }
  }

  // IDs de anuncio de Meta: ausente = no se tocan; vacío = se quitan todos.
  const adIdsRaw = form.get("adIds");
  let adIds: string[] | undefined;
  if (typeof adIdsRaw === "string") {
    const parsed = parseAdIds(adIdsRaw);
    if (!parsed.ok) {
      return {
        ok: false,
        message: `«${parsed.bad}» no parece un ID de anuncio: copia el «Identificador del anuncio» (solo números)`,
      };
    }
    adIds = parsed.ids;
  }

  const image = form.get("image");
  return {
    ok: true,
    data: {
      name,
      price: text("price", 100),
      description: text("description", 2000),
      stock,
      ...(adIds !== undefined ? { adIds } : {}),
    },
    image: image instanceof File && image.size > 0 ? image : null,
  };
}
