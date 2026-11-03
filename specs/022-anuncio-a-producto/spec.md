# Feature Specification: Del anuncio de Meta al producto del catálogo

**Created**: 2026-11-03 · **Status**: Implementada

**Input**: decisión del dueño (automatizate.ec, cliente inmobiliario): que cada
cliente que escribe desde un anuncio llegue conectado a la propiedad del
anuncio, y que el agente responda sobre ESA propiedad sin preguntar cuál.
Fuera de alcance por decisión del dueño: asignar el cliente a un vendedor.

## Decisiones

- **D1 — El puente es `product.ad_ids`** (migración `0018`, aditiva, default
  `'{}'`). Guarda el `source_id` del referral de WhatsApp (el ID del ANUNCIO, no
  el de campaña ni conjunto: es el único que Meta manda).
- **D2 — Un anuncio pertenece a un solo producto.** Guardarlo en uno lo quita de
  los demás (`reclamarAnuncios`).
- **D3 — Dos formas de conectar:** el dueño pega el ID en el catálogo (o toca un
  anuncio de los que ya trajeron clientes), o se conecta solo la primera vez que
  llega alguien si el titular/texto del anuncio nombra UN producto (nombre
  completo, sin tildes ni mayúsculas, mínimo 6 caracteres; ambiguo = no se
  conecta).
- **D4 — Contexto al final del prompt** («ORIGEN DEL CLIENTE»), como el mapa de
  huecos: con producto conectado, el agente no pregunta cuál y ofrece su foto;
  si está agotado (stock 0 = vendida) lo dice y ofrece alternativas; sin
  conexión recibe titular y texto para deducir o preguntar.
- **D5 — Nunca tumba el turno:** si armar el contexto falla, el agente responde
  sin él.

## Fotos cuando el cliente las pide (arreglo)

El prompt prohibía reenviar una foto ya enviada «una sola vez por
conversación», así que el agente se negaba cuando el cliente la volvía a
pedir. Ahora: si el cliente PIDE fotos, `send_product` siempre; por su cuenta,
no repite. Y cada fallo de envío deja en el log la causa (producto sin foto,
archivo ausente en `MEDIA_DIR`).

## Verificación

`tests/unit/catalog-ads.test.ts` y el arnés `scripts/e2e-anuncio-producto.mjs`
(guion `tests/e2e/us-anuncio-producto.md`).
