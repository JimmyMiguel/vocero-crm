import { apiError } from "@/lib/api";
import { saveProductImage } from "@/server/catalog";
import { MediaValidationError } from "@/server/whatsapp/media";

/** Guarda las fotos subidas; devuelve sus media_asset ids o la respuesta de error. */
export async function saveImages(
  organizationId: string,
  files: File[]
): Promise<string[] | Response> {
  const ids: string[] = [];
  for (const file of files) {
    try {
      ids.push(await saveProductImage(organizationId, file));
    } catch (err) {
      if (err instanceof MediaValidationError) {
        const msg =
          err.code === "too_large"
            ? `"${file.name}" pesa demasiado (máx. 5 MB)`
            : `"${file.name}": ${err.message}`;
        return apiError(err.code === "too_large" ? 413 : 415, err.code, msg);
      }
      throw err;
    }
  }
  return ids;
}
