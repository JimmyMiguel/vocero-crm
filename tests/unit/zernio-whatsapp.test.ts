import { describe, expect, it } from "vitest";
import { normalizeZernioWhatsappEvent } from "@/server/zernio/whatsapp";
import { zernioTargetChannel } from "@/server/zernio/dispatch";

const evento = (over: Record<string, unknown> = {}, sender: Record<string, unknown> = {}) => ({
  id: "evt_1",
  event: "message.received",
  message: {
    id: "m_1",
    conversationId: "conv_1",
    platform: "whatsapp",
    direction: "incoming",
    text: "hola, ¿precio del sérum?",
    attachments: [],
    sender: { id: "593991234567", name: "Ana", phoneNumber: "+593991234567", ...sender },
    sentAt: "2026-10-11T15:00:00Z",
    ...over,
  },
  account: { id: "acc_1", platform: "whatsapp" },
});

describe("WhatsApp por Zernio", () => {
  it("reparte los eventos de WhatsApp a su canal", () => {
    expect(zernioTargetChannel(evento())).toBe("whatsapp");
  });

  it("normaliza un texto entrante con el teléfono como identidad", () => {
    const n = normalizeZernioWhatsappEvent(evento());
    expect(n).toMatchObject({
      accountRef: "acc_1",
      messageId: "m_1",
      threadRef: "conv_1",
      type: "text",
      text: "hola, ¿precio del sérum?",
      identity: { identity: "593991234567", phone: "593991234567", profileName: "Ana" },
    });
  });

  it("sin teléfono usa el BSUID", () => {
    const n = normalizeZernioWhatsappEvent(
      evento({}, { id: "EC.123", phoneNumber: null, businessScopedUserId: "EC.123" })
    );
    expect(n?.identity).toMatchObject({ identity: "bsuid:EC.123", phone: null, waUserId: "EC.123" });
  });

  it("una foto sin texto entra como imagen", () => {
    const n = normalizeZernioWhatsappEvent(
      evento({ text: null, attachments: [{ type: "image", url: "https://x" }] })
    );
    expect(n?.type).toBe("image");
  });

  it("ignora salientes y otras plataformas", () => {
    expect(normalizeZernioWhatsappEvent(evento({ direction: "outgoing" }))).toBeNull();
    expect(
      normalizeZernioWhatsappEvent({ ...evento(), account: { id: "acc_1", platform: "instagram" } })
    ).toBeNull();
  });
});
