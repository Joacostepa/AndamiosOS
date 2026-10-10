// Cómo se sirve un adjunto de Odoo por el link público (I1 de la revisión). Pura: la usan
// la ruta y los tests.
//
// El archivo sale del MISMO origen que la app: un HTML o un SVG con script, servido
// "inline" con su tipo, correría con las cookies de la app de quien lo abra. Por eso:
// sólo imágenes comunes y PDF se muestran en el navegador; todo lo demás baja como
// archivo (application/octet-stream + attachment). Siempre nosniff, y una CSP que aísla
// la respuesta (sandbox, sin scripts) en todo menos el PDF: los visores de PDF de Chrome y
// Firefox no abren un documento con `sandbox` (el capataz vería "bloqueado"), y un PDF no
// ejecuta código en el origen de la app.

const EN_LINEA = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"]);

export function cabecerasArchivo(mimetype: string | null | undefined, nombre: string): Record<string, string> {
  const tipo = (mimetype ?? "").toLowerCase().split(";")[0].trim();
  const enLinea = EN_LINEA.has(tipo);
  const limpio = (nombre || "archivo").replace(/[^\w.\- ]+/g, "_").slice(0, 120) || "archivo";
  return {
    "Content-Type": enLinea ? tipo : "application/octet-stream",
    "Content-Disposition": `${enLinea ? "inline" : "attachment"}; filename="${limpio}"`,
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": tipo === "application/pdf" ? "default-src 'none'; frame-ancestors 'self'" : "sandbox; default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'",
    "Cross-Origin-Resource-Policy": "same-origin",
  };
}

/** Lo máximo que acepta la foto del remito (el celular la achica antes a ~300 KB). */
export const MAX_FOTO = 4 * 1024 * 1024;

/**
 * La foto del remito: qué imagen es MIRANDO LOS BYTES (no lo que dice el navegador), o null
 * si no es JPEG, PNG ni WebP. Lo que se guarda es siempre una imagen de verdad.
 */
export function tipoImagen(b: Uint8Array): { ext: "jpg" | "png" | "webp"; mime: string } | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { ext: "jpg", mime: "image/jpeg" };
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return { ext: "png", mime: "image/png" };
  if (b.length >= 12 && String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP") return { ext: "webp", mime: "image/webp" };
  return null;
}
