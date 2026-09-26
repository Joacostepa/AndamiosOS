// El pedacito de mensaje que muestra el buscador de conversaciones, con las palabras buscadas
// marcadas. La base ya eligió el mensaje (asistente_buscar); acá se recorta alrededor de la
// primera coincidencia, sin distinguir acentos ni mayúsculas, igual que la búsqueda.

export type Tramo = { t: string; marca: boolean };

/** Una letra por letra ("á" → "a", "Ñ" → "n"), así las posiciones coinciden con el original. */
function normalizar(letras: string[]): string[] {
  return letras.map((l) => {
    const n = l.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
    return Array.from(n).length === 1 ? n : l;
  });
}

export function palabrasDeBusqueda(q: string): string[] {
  return normalizar(Array.from(q.trim())).join("").split(/\s+/).filter(Boolean);
}

export function recortarFragmento(texto: string, q: string, ancho = 110): Tramo[] | null {
  const palabras = palabrasDeBusqueda(q);
  // El markdown de las respuestas (**negritas**, títulos) no se lee en una línea.
  const letras = Array.from(texto.replace(/[*_`#>]+/g, "").replace(/\s+/g, " ").trim());
  const norm = normalizar(letras).join("");
  const normLetras = Array.from(norm);
  if (!palabras.length || normLetras.length !== letras.length) return null;

  // Dónde cae cada palabra (todas sus apariciones), en posiciones de letra.
  const marcas: [number, number][] = [];
  for (const p of palabras) {
    const largo = Array.from(p).length;
    for (let i = norm.indexOf(p); i !== -1; i = norm.indexOf(p, i + 1)) {
      const desde = Array.from(norm.slice(0, i)).length;
      marcas.push([desde, desde + largo]);
    }
  }
  if (!marcas.length) return null;
  const primera = Math.min(...marcas.map(([d]) => d));

  // Ventana alrededor de la primera coincidencia, cortada en un espacio.
  let inicio = Math.max(0, primera - Math.floor(ancho / 3));
  let fin = Math.min(letras.length, inicio + ancho);
  inicio = Math.max(0, fin - ancho);
  if (inicio > 0) {
    const espacio = letras.indexOf(" ", inicio);
    if (espacio !== -1 && espacio < primera) inicio = espacio + 1;
  }
  if (fin < letras.length) {
    const espacio = letras.lastIndexOf(" ", fin);
    if (espacio > primera) fin = espacio;
  }

  const marcada = letras.map((_, i) => marcas.some(([d, h]) => i >= d && i < h));
  const tramos: Tramo[] = [];
  for (let i = inicio; i < fin; i++) {
    const ultimo = tramos.at(-1);
    if (ultimo && ultimo.marca === marcada[i]) ultimo.t += letras[i];
    else tramos.push({ t: letras[i], marca: marcada[i] });
  }
  if (inicio > 0) tramos.unshift({ t: "…", marca: false });
  if (fin < letras.length) tramos.push({ t: "…", marca: false });
  return tramos;
}
