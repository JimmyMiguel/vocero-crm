/**
 * Self-test E2E — del anuncio de Meta al producto del catálogo
 * (tests/e2e/us-anuncio-producto.md).
 *
 * Conduce la app real con los mocks: crea productos con foto, hace llegar
 * mensajes desde anuncios (referral de WhatsApp) y comprueba lo que el
 * cliente RECIBE en el outbox del wa-mock.
 *
 * Uso:
 *   1) app corriendo con WA_MOCK_ENABLED=true, META_GRAPH_BASE_URL → wa-mock,
 *      OPENROUTER_BASE_URL → ai-mock y BD migrada
 *   2) node --env-file=.env scripts/e2e-anuncio-producto.mjs
 */

const BASE = process.env.APP_BASE_URL ?? "http://localhost:3000";
const PN = "PN-E2E-1";
const RUN = String(Date.now()).slice(-6);

let cookie = "";
let failures = 0;

function ok(name, cond, extra = "") {
  if (cond) console.log(`  OK  ${name}`);
  else {
    failures++;
    console.log(`  FAIL ${name}${extra ? ` — ${extra}` : ""}`);
  }
}

async function api(path, opts = {}) {
  const isForm = opts.body instanceof FormData;
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      ...(isForm ? {} : { "content-type": "application/json" }),
      origin: BASE,
      ...(cookie ? { cookie } : {}),
      ...(opts.headers ?? {}),
    },
  });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  if (setCookie.length) cookie = setCookie.map((c) => c.split(";")[0]).join("; ");
  let json = null;
  try {
    json = await res.clone().json();
  } catch {}
  return { res, json };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function hasta(cond, ms = 20000, paso = 400) {
  const fin = Date.now() + ms;
  for (;;) {
    if (await cond()) return true;
    if (Date.now() > fin) return false;
    await sleep(paso);
  }
}

/** Un PNG de 1×1 válido: el catálogo solo acepta JPG o PNG. */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

async function crearProducto({ name, stock = "", adIds = "" }) {
  const form = new FormData();
  form.set("name", name);
  form.set("price", "$100.000");
  form.set("description", "Casa de prueba");
  form.set("stock", stock);
  form.set("adIds", adIds);
  form.set("image", new File([PNG], "casa.png", { type: "image/png" }));
  const r = await api("/api/catalog", { method: "POST", body: form });
  return r.json?.product ?? null;
}

const tel = (n) => `59399${RUN}${String(n).padStart(2, "0")}`;
const nombre = (n) => `Cliente ${RUN} ${n}`;
let wamid = 0;
const entra = (n, texto, referral) =>
  api("/api/dev/wa-mock/inbound", {
    method: "POST",
    body: JSON.stringify({
      phoneNumberId: PN,
      from: tel(n),
      name: nombre(n),
      text: texto,
      waMessageId: `wamid.e2e.anuncio.${RUN}.${++wamid}`,
      ...(referral ? { referral } : {}),
    }),
  });
const referral = (sourceId, headline) => ({
  source_url: `https://fb.me/${sourceId}`,
  source_id: sourceId,
  source_type: "ad",
  headline,
  body: "Texto del anuncio",
  media_type: "image",
});

/** Lo que le llegó a ese cliente, en orden. */
async function recibido(n) {
  const outbox = (await api("/api/dev/wa-mock/outbox")).json?.outbox ?? [];
  return outbox.filter((o) => o.to === tel(n) || o.recipient === tel(n));
}
const esImagen = (o) => o.type === "image" || !!o.image;
const textoDe = (o) => o.body?.text?.body ?? o.body?.image?.caption ?? o.text?.body ?? "";

async function main() {
  console.log("== Setup ==");
  const email = "e2e@vocero.test";
  const password = "password-e2e-123";
  let su = await api("/api/auth/sign-up/email", {
    method: "POST",
    body: JSON.stringify({ email, password, name: "Operador E2E" }),
  });
  if (!su.res.ok) {
    su = await api("/api/auth/sign-in/email", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
  }
  ok("login del operador", su.res.ok, JSON.stringify(su.json));
  const conn = await api("/api/settings/whatsapp", {
    method: "PUT",
    body: JSON.stringify({ wabaId: "WABA-E2E", phoneNumberId: PN, token: "tok-e2e" }),
  });
  ok("WhatsApp conectado (wa-mock)", conn.res.ok, JSON.stringify(conn.json));
  const prof = await api("/api/agent/profile", {
    method: "PUT",
    body: JSON.stringify({ enabled: true }),
  });
  ok("agente encendido", prof.res.ok, JSON.stringify(prof.json));

  const AD_PEGADO = `1202${RUN}01`;
  const AD_VENDIDA = `1202${RUN}02`;
  const AD_AUTO = `1202${RUN}03`;
  const AD_GENERICO = `1202${RUN}04`;

  const ceibo = await crearProducto({ name: `Casa Ceibo ${RUN}`, adIds: AD_PEGADO });
  const vendida = await crearProducto({ name: `Casa Laurel ${RUN}`, stock: "0", adIds: AD_VENDIDA });
  const roble = await crearProducto({ name: `Casa Roble ${RUN}` });
  ok("productos creados con su anuncio", !!ceibo && !!vendida && !!roble);
  ok("el ID pegado se guarda en el producto", ceibo?.adIds?.includes(AD_PEGADO), JSON.stringify(ceibo?.adIds));

  const malo = new FormData();
  malo.set("name", "X");
  malo.set("adIds", "https://facebook.com/campaña");
  const rMalo = await api("/api/catalog", { method: "POST", body: malo });
  ok("un ID con forma rara se rechaza con 422", rMalo.res.status === 422, String(rMalo.res.status));

  console.log("\n== 1 · anuncio con ID pegado → foto de ESA casa sin preguntar ==");
  await entra(1, "Hola, quiero información", referral(AD_PEGADO, "Tu nuevo hogar"));
  const llegó1 = await hasta(async () => (await recibido(1)).some(esImagen));
  const out1 = await recibido(1);
  ok("el cliente recibe la foto de la casa del anuncio", llegó1, JSON.stringify(out1));

  console.log("\n== 2 · pedir la foto otra vez → se reenvía (antes se negaba) ==");
  await entra(1, "¿me puedes mandar la foto otra vez?");
  const llegó2 = await hasta(async () => (await recibido(1)).filter(esImagen).length >= 2);
  ok("al pedirla de nuevo, vuelve a llegar la foto", llegó2, JSON.stringify(await recibido(1)));

  console.log("\n== 3 · anuncio de una casa vendida → lo dice, sin foto ==");
  await entra(3, "Hola, me interesa", referral(AD_VENDIDA, "Casa en oferta"));
  await hasta(async () => (await recibido(3)).length > 0);
  const out3 = await recibido(3);
  ok("no le manda la foto de la casa vendida", !out3.some(esImagen), JSON.stringify(out3));
  ok("le dice que ya se vendió", out3.some((o) => /vendi/i.test(textoDe(o))), JSON.stringify(out3));

  console.log("\n== 4 · anuncio sin ID pegado que nombra la casa → se conecta solo ==");
  await entra(4, "Buenas", referral(AD_AUTO, `¡Estrena tu CASA ROBLE ${RUN}!`));
  const llegó4 = await hasta(async () => (await recibido(4)).some(esImagen));
  ok("recibe la foto de la casa que nombra el anuncio", llegó4, JSON.stringify(await recibido(4)));
  const productos = (await api("/api/catalog")).json?.products ?? [];
  const robleAhora = productos.find((p) => p.id === roble?.id);
  ok("el anuncio quedó conectado solo a esa casa", robleAhora?.adIds?.includes(AD_AUTO), JSON.stringify(robleAhora?.adIds));
  const ads = (await api("/api/catalog/ads")).json?.ads ?? [];
  ok("el catálogo lista los anuncios recibidos", ads.some((a) => a.sourceId === AD_AUTO), JSON.stringify(ads.slice(0, 3)));

  console.log("\n== 5 · anuncio genérico → pregunta cuál le interesa ==");
  await entra(5, "Hola", referral(AD_GENERICO, "Tu casa propia te espera"));
  await hasta(async () => (await recibido(5)).length > 0);
  const out5 = await recibido(5);
  ok("pregunta qué propiedad le interesa", out5.some((o) => /cuál/i.test(textoDe(o))), JSON.stringify(out5));
  ok("y no se conecta a nada", !((await api("/api/catalog")).json?.products ?? []).some((p) => p.adIds.includes(AD_GENERICO)));

  console.log("\n== 6 · un anuncio pertenece a UNA casa ==");
  const form = new FormData();
  form.set("adIds", `${AD_PEGADO}`);
  form.set("name", roble.name);
  const mov = await api(`/api/catalog/${roble.id}`, { method: "PATCH", body: form });
  ok("se pega en otra casa", mov.res.ok, JSON.stringify(mov.json));
  const tras = (await api("/api/catalog")).json?.products ?? [];
  ok("y desaparece de la anterior", !tras.find((p) => p.id === ceibo.id)?.adIds.includes(AD_PEGADO), JSON.stringify(tras.map((p) => [p.name, p.adIds])));

  console.log(failures === 0 ? "\nTodo verde." : `\n${failures} fallo(s).`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
