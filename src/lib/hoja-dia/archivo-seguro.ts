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
