// Las imágenes de referencia que manda Tomás (JS, 19/11): cuando entiende que el cliente
// necesita una bandeja de protección peatonal, un andamio de fachada con pantalla o una torre,
// le manda el render de la biblioteca de ese tipo para confirmar que es eso. Una vez por tipo y
// por charla. Apuntalamiento, no (por ahora).
//
// La imagen es la de por defecto de ese tipo en la biblioteca (Parámetros → Renders) y, si no hay
// ninguna marcada, la más nueva. Los renders son PNG de ~3 MB: se manda una copia en JPG de
// 1600 px (unos 300 KB), que se arma la primera vez y queda en Storage (referencias/).

export const TIPOS_REFERENCIA = ["bandeja", "fachada", "torre"] as const;
export type TipoReferencia = (typeof TIPOS_REFERENCIA)[number];

export const REFERENCIAS: Record<TipoReferencia, { que: string; nombre: string }> = {
  bandeja: { que: "una bandeja de protección peatonal", nombre: "referencia-bandeja.jpg" },
  fachada: { que: "un andamio de fachada con pantalla de protección", nombre: "referencia-fachada.jpg" },
  torre: { que: "una torre de andamio multidireccional", nombre: "referencia-torre.jpg" },
};

/** El epígrafe ya trae la pregunta: si la respuesta de Tomás no sale, la foto se entiende sola. */
export function epigrafeReferencia(tipo: TipoReferencia, trato: "vos" | "usted" | null = null): string {
  const pregunta = trato === "usted" ? "¿Es algo así lo que necesita?" : "¿Es algo así lo que necesitás?";
  return `Imagen de referencia: ${REFERENCIAS[tipo].que}. ${pregunta}`;
}

/** charla_tomada: la tiene una persona (o Tomás la derivó en este mismo turno): no sale nada. */
export type ResultadoReferencia = "enviada" | "ya_enviada" | "sin_imagen" | "charla_tomada";

export type FilaRender = { id: string; path: string; por_defecto: boolean; created_at: string };

/** La de por defecto y, si no hay ninguna marcada, la más nueva. */
export function elegirRender(filas: readonly FilaRender[]): FilaRender | null {
  const conImagen = filas.filter((f) => f.path);
  return conImagen.find((f) => f.por_defecto) ?? [...conImagen].sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null;
}
