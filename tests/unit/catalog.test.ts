import { describe, expect, it } from "vitest";
import { renderCatalog, type Product } from "@/server/catalog";
import { readProductForm } from "@/app/api/catalog/form";

const base: Product = {
  id: "prd_1",
  organizationId: "org_1",
  name: "Sérum",
  price: "$18.90",
  description: "Vitamina C",
  stock: null,
  imageAssetId: "ma_1",
  operation: null,
  propertyType: null,
  city: null,
  sector: null,
  bedrooms: null,
  bathrooms: null,
  areaM2: null,
  lotM2: null,
  parking: null,
  features: null,
  locationUrl: null,
  status: "disponible",
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("catálogo", () => {
  it("lista los disponibles con su id y omite los agotados", () => {
    const text = renderCatalog([
      base,
      { ...base, id: "prd_2", name: "Agotado", stock: 0 },
      { ...base, id: "prd_3", name: "Tónico", stock: 4, imageAssetId: null },
    ]);
    expect(text).toContain("[prd_1] Sérum");
    expect(text).toContain("[prd_3] Tónico · Precio: $18.90 · Stock: 4 · Sin foto");
    expect(text).not.toContain("Agotado");
  });

  it("muestra la ficha de la propiedad y oculta lo no disponible y el enlace de Maps", () => {
    const casa = {
      ...base,
      id: "prd_9",
      name: "Casa km 10",
      price: "$175.000",
      operation: "venta",
      propertyType: "Casa",
      city: "Samborondón",
      sector: "Km 10",
      bedrooms: 3,
      bathrooms: 2.5,
      areaM2: 160,
      parking: 2,
      features: "Piscina",
      locationUrl: "https://maps.app.goo.gl/x",
      images: [
        { id: "pim_1", assetId: "ma_1" },
        { id: "pim_2", assetId: "ma_2" },
      ],
    };
    const text = renderCatalog([casa, { ...casa, id: "prd_10", name: "Vendida", status: "vendido" }]);
    expect(text).toContain("[prd_9] Casa km 10 · Precio: $175.000 · 2 fotos");
    expect(text).toContain(
      "Venta · Casa · Km 10, Samborondón · 3 hab · 2,5 baños · 160 m² construcción · 2 parqueaderos"
    );
    expect(text).toContain("Incluye: Piscina");
    expect(text).not.toContain("Vendida");
    expect(text).not.toContain("maps.app");
  });

  it("sin productos disponibles no hay catálogo", () => {
    expect(renderCatalog([{ ...base, stock: 0 }])).toBe("");
  });

  it("valida el formulario", () => {
    const form = (o: Record<string, string>) => {
      const f = new FormData();
      for (const [k, v] of Object.entries(o)) f.set(k, v);
      return f;
    };
    expect(readProductForm(form({ name: " " })).ok).toBe(false);
    expect(readProductForm(form({ name: "A", stock: "-1" })).ok).toBe(false);
    const ok = readProductForm(form({ name: "A", stock: "", price: "$5" }));
    expect(ok).toMatchObject({ ok: true, data: { name: "A", stock: null, price: "$5" } });
    expect(readProductForm(form({ name: "A", bathrooms: "2,5", bedrooms: "3" }))).toMatchObject({
      ok: true,
      data: { bathrooms: 2.5, bedrooms: 3 },
    });
    expect(readProductForm(form({ name: "A", bedrooms: "2,5" })).ok).toBe(false);
    expect(readProductForm(form({ name: "A", operation: "permuta" })).ok).toBe(false);
    expect(readProductForm(form({ name: "A", locationUrl: "casa" })).ok).toBe(false);
    expect(readProductForm(form({ name: "A", status: "" }))).toMatchObject({
      ok: true,
      data: { status: "disponible" },
    });
  });
});
