import { PRODUCT_OPERATIONS, PRODUCT_STATUSES } from "@/server/catalog";

export type ProductFormData = {
  name?: string;
  price?: string | null;
  description?: string | null;
  stock?: number | null;
  operation?: string | null;
  propertyType?: string | null;
  city?: string | null;
  sector?: string | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  areaM2?: number | null;
  lotM2?: number | null;
  parking?: number | null;
  features?: string | null;
  locationUrl?: string | null;
  status?: string;
};

/**
 * Lee los campos del formulario de producto/propiedad. Un campo ausente no se
 * toca (para editar); uno vacío se borra (null). `name` vacío nunca es válido.
 * Fotos: `images` (varias) se agregan, `removeImages` son ids a quitar y
 * `coverImage` es el id de la foto que pasa a portada.
 */
export function readProductForm(form: FormData):
  | {
      ok: true;
      data: ProductFormData;
      images: File[];
      removeImages: string[];
      coverImage: string | null;
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

  // Números: ausente = no tocar, vacío = null. Acepta coma decimal ("2,5").
  let numberError: string | null = null;
  const num = (key: string, label: string, decimals = false): number | null | undefined => {
    const raw = text(key, 12);
    if (raw === undefined) return undefined;
    if (raw === null) return null;
    const n = Number(raw.replace(",", "."));
    if (!Number.isFinite(n) || n < 0 || (!decimals && !Number.isInteger(n))) {
      numberError ??= `${label} debe ser un número ${decimals ? "" : "entero "}≥ 0`;
      return undefined;
    }
    return n;
  };

  const stock = num("stock", "El stock");
  const bedrooms = num("bedrooms", "Habitaciones");
  const bathrooms = num("bathrooms", "Baños", true);
  const areaM2 = num("areaM2", "Los m² de construcción");
  const lotM2 = num("lotM2", "Los m² de terreno");
  const parking = num("parking", "Parqueaderos");
  if (numberError) return { ok: false, message: numberError };

  const operation = text("operation", 20);
  if (operation && !(PRODUCT_OPERATIONS as readonly string[]).includes(operation)) {
    return { ok: false, message: "La operación debe ser venta o arriendo" };
  }
  const status = text("status", 20);
  if (status && !(PRODUCT_STATUSES as readonly string[]).includes(status)) {
    return { ok: false, message: "Estado inválido" };
  }

  const locationUrl = text("locationUrl", 500);
  if (locationUrl && !/^https?:\/\//i.test(locationUrl)) {
    return { ok: false, message: "La ubicación debe ser un enlace (https://…)" };
  }

  const images = form
    .getAll("images")
    .filter((f): f is File => f instanceof File && f.size > 0);
  // Compatibilidad con el formulario anterior (una sola foto).
  const single = form.get("image");
  if (single instanceof File && single.size > 0) images.push(single);

  return {
    ok: true,
    data: {
      name,
      price: text("price", 100),
      description: text("description", 4000),
      stock,
      operation,
      propertyType: text("propertyType", 60),
      city: text("city", 100),
      sector: text("sector", 150),
      bedrooms,
      bathrooms,
      areaM2,
      lotM2,
      parking,
      features: text("features", 1000),
      locationUrl,
      // El estado nunca queda vacío: vacío = disponible.
      status: status === undefined ? undefined : (status ?? "disponible"),
    },
    images,
    removeImages: form.getAll("removeImages").filter((v): v is string => typeof v === "string"),
    coverImage: text("coverImage", 40) ?? null,
  };
}
