// Leer la dirección de obra como la escriben en Odoo: para la etiqueta del mapa, para buscar
// la calle en OpenStreetMap y para saber si el punto es confiable.
//
// PURO (sin Odoo ni red) y con tests: direccion.test.ts. Lo usan el servidor
// (src/lib/odoo/mapa-obras.ts) y fachada.ts. Imports con ".ts" porque los tests corren con
// node --test sin bundler.
//
// Las direcciones son texto libre y vienen de todo tipo: "AV SANTA FE 1476 CABA",
// "Palacio Sarmiento, Pje. Pizzurno 935, CABA", "RP58, Km 10,5, Canning, Provincia de Buenos
// Aires", "INGENIERIO BUDGE PVCIA BS AS (RETIRAN ELLOS)". Nada de esto se corrige en Odoo:
// sólo se lee mejor.

/** Sin tildes, en minúsculas. Base de toda comparación. */
export function sinTildes(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * El nombre de una calle reducido a lo que la distingue, para comparar Odoo contra OSM:
 * "Av. Gral. Las Heras" y "Avenida General Las Heras" dan los dos "las heras". Se sacan los
 * prefijos (avenida, general, doctor, pasaje…) porque cada fuente los escribe distinto.
 */
export function normalizarCalle(s: string | null | undefined): string {
  return sinTildes(s ?? "")
    .replace(/\b(avenida|av|avda|calle|gral|general|dr|doctor|pje|pasaje|pres|presidente|ing|ingeniero|ingenierio|tte|teniente|cnel|coronel)\b\.?/g, " ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Lo que va entre paréntesis son notas ("(RETIRAN ELLOS)", "(Capilla…)"), no dirección. */
const sinNotas = (d: string) => d.replace(/\([^)]*\)/g, " ");

/** Los tramos de una dirección: "calle altura, localidad, provincia" o "calle altura - nota". */
function tramos(d: string): string[] {
  return sinNotas(d)
    .split(/,\s+| - | – /)
    .map((x) => x.replace(/\s+/g, " ").replace(/[.\s]+$/, "").trim())
    .filter(Boolean);
}

/**
 * La calle de la dirección, normalizada, para buscarla entre los nombres de calles de OSM.
 *
 * Toma el primer tramo que tenga un número (en "Palacio Sarmiento, Pje. Pizzurno 935" la calle
 * es el segundo) y se queda con lo que va antes de la altura. La altura es el primer número
 * después de alguna letra que no siga con "de": así "25 de Mayo 1234" da "25 de mayo" y
 * "Av. 9 de Julio 1200" da "9 de julio", no "av". En una esquina sin altura ("Paraná esq.
 * Corrientes") es lo que va antes de "esq".
 */
export function calleDeDireccion(dir: string | null | undefined): string {
  const partes = tramos(dir ?? "");
  // "RETIRA CUCHA CUCHA 2345": el cliente retira en el depósito; la calle es Cucha Cucha.
  const t = (partes.find((x) => /\d/.test(x) && /[a-z]/i.test(x)) ?? partes[0] ?? "").replace(/^retiran?\s+/i, "");
  const m = t.match(/^(.*?[a-záéíóúüñ].*?)\s+\d{1,5}\b(?!\s+de\b)/i);
  const calle = (m ? m[1] : t).replace(/\s*\b(esq\.?|esquina|casi)\b.*$/i, "");
  return normalizarCalle(calle);
}

/**
 * ¿La dirección ubica un punto concreto? Tiene algún número (altura, km) o es una esquina.
 * "INGENIERIO BUDGE PVCIA BS AS" no: Google la resuelve al centro de la localidad, y el mapa
 * tiene que avisar que el punto no es la obra. Lo de entre paréntesis no cuenta.
 */
export function tieneAltura(dir: string | null | undefined): boolean {
  const d = sinNotas(dir ?? "");
  return /\d/.test(d) || /\besq/i.test(d);
}

/** CABA, Capital Federal, "Pcia. de Bs. As.", "Provincia de Buenos Aires": ruido en una etiqueta. */
const RUIDO = /\b(c\.?\s?a\.?\s?b\.?\s?a\.?|capital federal|p[rcv]{1,2}[a-z]*\.?\s*(de\s*)?(bs\.?\s*as\.?|buenos aires)|bs\.?\s*as\.?)(?=\s|$|,|\.)/gi;

/** Las abreviaturas de siempre, para que la etiqueta entre en el chip. */
const ABREVIATURAS: [RegExp, string][] = [
  [/\b(avenida|avda\.?|av\.?)(?=\s)/gi, "Av."],
  [/\b(ingenierio|ingeniero|ing\.?)(?=\s)/gi, "Ing."],
  [/\b(general|gral\.?)(?=\s)/gi, "Gral."],
  [/\b(presidente|pres\.?)(?=\s)/gi, "Pres."],
  [/\bdoctor(?=\s)/gi, "Dr."],
  [/\b(pasaje|pje\.?)(?=\s)/gi, "Pje."],
];

/** Palabras que en un nombre propio van en minúscula ("Paseo de la Infanta"). */
const MENORES = new Set(["de", "del", "la", "las", "los", "y", "e", "el"]);

/** "AV SANTA FE" → "Av Santa Fe". Sólo para lo que vino todo en mayúsculas. */
function tituloDe(s: string): string {
  return s
    .toLowerCase()
    .replace(/(^|[\s./])([a-záéíóúüñ]+)/g, (_m, p: string, w: string) =>
      p + (p !== "" && MENORES.has(w) ? w : w[0].toUpperCase() + w.slice(1)));
}

/**
 * La dirección limpia para la etiqueta del mapa: "Av. Santa Fe 1476" a partir de "AV SANTA FE
 * 1476 CABA". Toma el tramo con la altura; si es muy corto ("RP58") le suma el siguiente
 * ("RP58, Km 10,5"); a una calle sin altura le suma la esquina. Saca CABA/provincia y las
 * notas, pasa a tipo título lo que estaba en mayúsculas y abrevia. Misma lógica que la
 * maqueta aprobada (`corta`).
 */
export function direccionCorta(dir: string | null | undefined): string {
  const partes = tramos(dir ?? "");
  if (!partes.length) return "Sin dirección";
  let a = partes.find((x) => /\d/.test(x)) ?? partes[0];
  const k = partes.indexOf(a);
  // La esquina no se suma acá: va abajo, con su "esq." ("Paraná, esquina Corrientes").
  if (a.length < 8 && partes[k + 1] && !/^esq/i.test(partes[k + 1])) a += ", " + partes[k + 1];
  const esq = partes.find((x) => /^esq/i.test(x));
  if (esq && !/\d/.test(a)) a += " " + esq.replace(/^esq(uina)?\.?\s*/i, "esq. ");
  a = a.replace(RUIDO, " ").replace(/\s+/g, " ").trim();
  if (a && a === a.toUpperCase()) a = tituloDe(a);
  for (const [re, v] of ABREVIATURAS) a = a.replace(re, v);
  return a.replace(/\.\./g, ".").replace(/[\s,]+$/, "").replace(/\s+/g, " ").trim() || "Sin dirección";
}
