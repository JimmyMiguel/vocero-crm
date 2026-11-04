import type { MetadataRoute } from "next";
import { DEFAULT_BRANDING, resolveAccentSet } from "@/lib/branding";
import { faviconCacheKey } from "@/lib/favicon";
import { getBranding } from "@/server/branding";

export const dynamic = "force-dynamic";

/**
 * Manifiesto de la PWA, white-label: nombre y color salen de la marca. Con
 * esto el navegador ofrece "Añadir a pantalla de inicio" / "Instalar".
 */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const branding = await getBranding().catch(() => DEFAULT_BRANDING);
  const v = faviconCacheKey(branding);
  return {
    name: `${branding.name} — CRM de WhatsApp`,
    short_name: branding.name,
    description: "CRM de WhatsApp con agente de IA",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: resolveAccentSet(branding.accent).accent,
    lang: "es",
    icons: [
      { src: `/api/branding/pwa-icon?size=192&v=${v}`, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: `/api/branding/pwa-icon?size=512&v=${v}`, sizes: "512x512", type: "image/png", purpose: "any" },
      { src: `/api/branding/pwa-icon?size=512&maskable=1&v=${v}`, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
