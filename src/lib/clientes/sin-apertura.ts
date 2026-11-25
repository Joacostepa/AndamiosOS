/**
 * En Argentina no se abre la pregunta (JS, 25/11): lo que manda ABA (Tomás y los textos fijos)
 * sale sin «¿». Lo que escribe una persona del equipo sale como lo escribió.
 */
export function sinApertura(texto: string, autor: { autor: "persona" | "sistema" | "ia" }): string {
  return autor.autor === "persona" ? texto : texto.replace(/¿\s*/g, "");
}
