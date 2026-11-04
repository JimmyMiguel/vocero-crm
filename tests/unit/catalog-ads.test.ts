import { describe, expect, it } from "vitest";
import {
  contextoDelAnuncio,
  parseAdIds,
  productoDelAnuncio,
  productoQueNombraElAnuncio,
} from "@/server/catalog-ads";
import { readProductForm } from "@/app/api/catalog/form";
import { buildAgentSystemPrompt } from "@/server/ai/prompts";
import type { Product } from "@/server/catalog";

const casa: Product = {
  id: "prd_ceibo",
  organizationId: "org_1",
  name: "Casa Modelo Ceibo",
  price: "$128.000",
  description: "3 habitaciones",
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
  adIds: ["120200000000000001"],
  createdAt: new Date(),
  updatedAt: new Date(),
};
const laurel: Product = { ...casa, id: "prd_laurel", name: "Casa Modelo Laurel", adIds: [] };

describe("IDs de anuncio pegados por el dueño", () => {
  it("acepta comas, espacios y saltos de línea, sin repetir", () => {
    expect(parseAdIds(" 111, 222\n333 111 ")).toEqual({ ok: true, ids: ["111", "222", "333"] });
    expect(parseAdIds("")).toEqual({ ok: true, ids: [] });
  });

  it("rechaza lo que no tiene forma de ID", () => {
    expect(parseAdIds("111 https://facebook.com/ads")).toMatchObject({ ok: false });
  });

  it("el formulario los lee; ausente no los toca, vacío los quita", () => {
    const form = (o: Record<string, string>) => {
      const f = new FormData();
      for (const [k, v] of Object.entries(o)) f.set(k, v);
      return f;
    };
    expect(readProductForm(form({ name: "A", adIds: "1, 2" }))).toMatchObject({
      ok: true,
      data: { adIds: ["1", "2"] },
    });
    const sin = readProductForm(form({ name: "A" }));
    expect(sin.ok && "adIds" in sin.data).toBe(false);
    expect(readProductForm(form({ name: "A", adIds: "" }))).toMatchObject({
      ok: true,
      data: { adIds: [] },
    });
    expect(readProductForm(form({ name: "A", adIds: "campaña!" })).ok).toBe(false);
  });
});

describe("del anuncio al producto", () => {
  it("encuentra el producto por el ID pegado", () => {
    expect(productoDelAnuncio([laurel, casa], "120200000000000001")?.id).toBe("prd_ceibo");
    expect(productoDelAnuncio([laurel, casa], "999")).toBeNull();
  });

  it("conecta solo si el anuncio nombra UN producto, sin tildes ni mayúsculas", () => {
    const anuncio = { headline: "¡Estrena tu CASA MODELO CEIBO!", body: "En Urb. Los Ceibos" };
    expect(productoQueNombraElAnuncio(anuncio, [casa, laurel])).toBe("prd_ceibo");
  });

  it("si el anuncio es genérico o nombra dos productos, no adivina", () => {
    expect(
      productoQueNombraElAnuncio({ headline: "Tu casa propia te espera", body: null }, [casa, laurel])
    ).toBeNull();
    expect(
      productoQueNombraElAnuncio(
        { headline: "Casa Modelo Ceibo y Casa Modelo Laurel", body: null },
        [casa, laurel]
      )
    ).toBeNull();
  });

  it("entre un nombre y otro que lo contiene, gana el más largo", () => {
    const plus = { ...casa, id: "prd_plus", name: "Casa Modelo Ceibo Plus" };
    expect(
      productoQueNombraElAnuncio({ headline: "Nueva Casa Modelo Ceibo Plus", body: null }, [casa, plus])
    ).toBe("prd_plus");
  });

  it("un nombre muy corto no cuenta: aparecería en cualquier anuncio", () => {
    const corto = { ...casa, id: "prd_c", name: "Casa" };
    expect(productoQueNombraElAnuncio({ headline: "Casa en venta", body: null }, [corto])).toBeNull();
  });
});

describe("lo que el agente sabe del anuncio", () => {
  const anuncio = { sourceId: "1", sourceType: "ad", headline: "Casa Modelo Ceibo", body: null };

  it("con producto conectado: no pregunta cuál y ofrece su foto", () => {
    const texto = contextoDelAnuncio({ anuncio, product: casa });
    expect(texto).toContain("[prd_ceibo] Casa Modelo Ceibo");
    expect(texto).toContain("no le preguntes cuál le interesa");
    expect(texto).toContain("send_product");
  });

  it("si ya se vendió, lo dice y ofrece alternativas", () => {
    const texto = contextoDelAnuncio({ anuncio, product: { ...casa, stock: 0 } });
    expect(texto).toContain("YA NO ESTÁ DISPONIBLE");
    expect(texto).toContain("alternativas");
  });

  it("propiedad reservada o vendida: tampoco la ofrece como libre", () => {
    for (const status of ["reservado", "vendido", "arrendado"]) {
      const texto = contextoDelAnuncio({ anuncio, product: { ...casa, status } });
      expect(texto).toContain("YA NO ESTÁ DISPONIBLE");
    }
  });

  it("sin conexión: le pasa el titular para deducir o preguntar", () => {
    const texto = contextoDelAnuncio({
      anuncio: { ...anuncio, headline: "Tu casa propia", body: "Entrada desde $5.000" },
      product: null,
    });
    expect(texto).toContain("«Tu casa propia»");
    expect(texto).toContain("Entrada desde $5.000");
    expect(texto).toContain("pregúntale");
  });
});

describe("fotos cuando el cliente las pide", () => {
  it("el prompt obliga a usar send_product aunque la foto ya se haya enviado", () => {
    const prompt = buildAgentSystemPrompt({
      profile: {
        name: "Ana",
        tone: null,
        instructions: null,
        escalationRules: null,
        greeting: null,
      } as never,
      kb: [],
      stages: [{ name: "Nuevo" }],
      catalog: "[prd_ceibo] Casa Modelo Ceibo",
    });
    expect(prompt).toContain("Si el cliente PIDE ver fotos");
    expect(prompt).toContain("aunque ya aparezca «[Foto enviada]»");
    expect(prompt).not.toContain("UNA sola vez por conversación");
  });
});
