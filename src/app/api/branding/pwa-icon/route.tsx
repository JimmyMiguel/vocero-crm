import { ImageResponse } from "next/og";
import { DEFAULT_BRANDING, resolveAccentSet } from "@/lib/branding";
import { FAVICON_ASSET, faviconInitial } from "@/lib/favicon";
import { getBrandingContext } from "@/server/branding";
import { readMediaFile } from "@/server/whatsapp/media";

export const dynamic = "force-dynamic";

const SIZES = new Set([180, 192, 512]);
const EMBEDDABLE = new Set(["image/png", "image/jpeg", "image/svg+xml"]);

/**
 * Icono PNG de la app instalada (iPhone y Android piden PNG, no SVG). Pública
 * como el favicon: el icono no es un secreto. Si el dueño subió un logo PNG,
 * JPEG o SVG se usa ese sobre el acento; si no, la inicial de la marca.
 * `maskable=1` deja margen extra para que Android pueda recortarlo en círculo.
 */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const requested = Number(params.get("size"));
  const size = SIZES.has(requested) ? requested : 512;

  const ctx = await getBrandingContext().catch(() => null);
  const branding = ctx?.branding ?? DEFAULT_BRANDING;
  const { accent, fg } = resolveAccentSet(branding.accent);

  let logo: string | null = null;
  if (ctx?.organizationId && branding.favicon && EMBEDDABLE.has(branding.favicon.mime)) {
    try {
      const buf = await readMediaFile(ctx.organizationId, FAVICON_ASSET);
      logo = `data:${branding.favicon.mime};base64,${Buffer.from(buf).toString("base64")}`;
    } catch {
      logo = null;
    }
  }

  // Con logo subido ocupa todo el icono (sin marco de otro verde). La inicial
  // generada sí lleva margen extra si es maskable.
  const inner = size;
  const image = new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: accent,
          color: fg,
          fontSize: Math.round(size * 0.55),
          fontWeight: 700,
        }}
      >
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo} width={inner} height={inner} alt="" style={{ objectFit: "cover" }} />
        ) : (
          faviconInitial(branding.name)
        )}
      </div>
    ),
    { width: size, height: size }
  );
  image.headers.set("cache-control", params.has("v") ? "public, max-age=31536000, immutable" : "public, max-age=60");
  return image;
}
