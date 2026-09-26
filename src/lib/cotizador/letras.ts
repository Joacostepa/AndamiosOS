// Montos en letras, en castellano. Reemplaza a num2words (lang="es") de la skill con una
// diferencia a propósito: num2words no apocopa y escribe "veintiuno mil", "treinta y uno mil",
// "trescientos treinta y uno mil" (verificado 26/09 con num2words 0.5). En una propuesta para
// un cliente va lo correcto: "veintiún mil", "treinta y un mil", "ciento un mil". En todo lo
// demás el resultado es el mismo.
//
// Las letras nunca se tipean a mano: el número y las letras que no coinciden son el error más
// clásico de un presupuesto hecho a mano.

const UNIDADES = [
  "cero", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve", "diez",
  "once", "doce", "trece", "catorce", "quince", "dieciséis", "diecisiete", "dieciocho", "diecinueve", "veinte",
  "veintiuno", "veintidós", "veintitrés", "veinticuatro", "veinticinco", "veintiséis", "veintisiete", "veintiocho", "veintinueve",
];
const DECENAS = ["", "", "veinte", "treinta", "cuarenta", "cincuenta", "sesenta", "setenta", "ochenta", "noventa"];
const CENTENAS = ["", "ciento", "doscientos", "trescientos", "cuatrocientos", "quinientos", "seiscientos", "setecientos", "ochocientos", "novecientos"];

function hasta99(n: number): string {
  if (n < 30) return UNIDADES[n];
  const d = Math.floor(n / 10);
  const u = n % 10;
  return u ? `${DECENAS[d]} y ${UNIDADES[u]}` : DECENAS[d];
}

function hasta999(n: number): string {
  if (n === 0) return "";
  if (n === 100) return "cien";
  const c = Math.floor(n / 100);
  const r = n % 100;
  return [c ? CENTENAS[c] : "", r ? hasta99(r) : ""].filter(Boolean).join(" ");
}

/** Delante de "mil" y "millones": "uno" → "un", "veintiuno" → "veintiún". */
function apocopar(s: string): string {
  if (s.endsWith("veintiuno")) return `${s.slice(0, -"veintiuno".length)}veintiún`;
  if (s === "uno" || s.endsWith(" uno")) return `${s.slice(0, -3)}un`;
  return s;
}

function hasta999999(n: number): string {
  const miles = Math.floor(n / 1000);
  const resto = n % 1000;
  const partes: string[] = [];
  if (miles === 1) partes.push("mil");
  else if (miles > 1) partes.push(`${apocopar(hasta999(miles))} mil`);
  if (resto) partes.push(hasta999(resto));
  return partes.join(" ");
}

/** Entero ≥ 0 → letras. Los centavos se descartan (los importes van al peso). */
export function enLetras(numero: number): string {
  const n = Math.floor(Math.abs(Math.round(numero)));
  if (n === 0) return "cero";
  if (n >= 1e12) throw new Error("Monto demasiado grande para pasarlo a letras");
  const millones = Math.floor(n / 1_000_000);
  const resto = n % 1_000_000;
  const partes: string[] = [];
  if (millones === 1) partes.push("un millón");
  else if (millones > 1) partes.push(`${apocopar(hasta999999(millones))} millones`);
  if (resto) partes.push(hasta999999(resto));
  return partes.join(" ");
}

/** "Son pesos un millón cuatrocientos cuarenta mil" — como la skill. */
export function pesosEnLetras(monto: number): string {
  return `Son pesos ${enLetras(monto)}`;
}
