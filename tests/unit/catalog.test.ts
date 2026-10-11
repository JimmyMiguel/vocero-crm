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
  });
});
