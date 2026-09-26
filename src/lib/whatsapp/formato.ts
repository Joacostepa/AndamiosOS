// Del markdown del asistente al formato de WhatsApp, en pedazos que entran en un mensaje.
//
// WhatsApp tiene su propio formato: *negrita*, _cursiva_, ~tachado~ y ```bloques```; no tiene
// títulos, tablas ni links con texto. Por WhatsApp el asistente ya escribe corto y sin tablas,
// pero si se le escapa algo, acá se traduce en vez de llegar con asteriscos dobles y barras.

/** El límite de WhatsApp es 4096 caracteres; queda margen. */
export const MAX_TEXTO = 4000;

const SEPARADOR_TABLA = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
const FILA_TABLA = /^\s*\|.*\|\s*$/;

function linea(l: string): string {
  if (FILA_TABLA.test(l)) {
    return l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim()).filter(Boolean).join(" · ");
  }
  let t = l;
  const titulo = /^\s*#{1,6}\s+(.+?)\s*#*\s*$/.exec(t);
  if (titulo) t = `**${titulo[1].replace(/\*\*/g, "")}**`;
  t = t.replace(/^(\s*)[*-]\s+/, "$1• ");
  t = t.replace(/^\s*(-{3,}|\*{3,}|_{3,})\s*$/, "");
  // Negrita de markdown (**x**) a la de WhatsApp (*x*). Un *x* suelto se deja: por WhatsApp el
  // asistente ya escribe así la negrita.
  t = t.replace(/\*\*(?=\S)(.+?)(?<=\S)\*\*/g, "*$1*").replace(/__(?=\S)(.+?)(?<=\S)__/g, "*$1*");
  t = t.replace(/~~(?=\S)(.+?)(?<=\S)~~/g, "~$1~");
  t = t.replace(/\[([^\]]+)\]\((\S+?)\)/g, (_, texto: string, url: string) => (texto === url ? url : `${texto} (${url})`));
  return t;
}

export function aWhatsapp(md: string): string {
  const salida: string[] = [];
  let enCodigo = false;
  for (const l of md.replace(/\r\n/g, "\n").split("\n")) {
    if (/^\s*```/.test(l)) {
      enCodigo = !enCodigo;
      salida.push(l.trim());
      continue;
    }
    if (enCodigo) salida.push(l);
    else if (!SEPARADOR_TABLA.test(l)) salida.push(linea(l));
  }
  return salida.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** En pedazos de hasta `max`, cortando por párrafo, después por línea y por último por palabra. */
export function partir(texto: string, max = MAX_TEXTO): string[] {
  const partes: string[] = [];
  let resto = texto.trim();
  while (resto.length > max) {
    const ventana = resto.slice(0, max);
    let corte = ventana.lastIndexOf("\n\n");
    if (corte < max * 0.5) corte = ventana.lastIndexOf("\n");
    if (corte < max * 0.5) corte = ventana.lastIndexOf(" ");
    if (corte <= 0) corte = max;
    partes.push(resto.slice(0, corte).trim());
    resto = resto.slice(corte).trim();
  }
  if (resto) partes.push(resto);
  return partes;
}
