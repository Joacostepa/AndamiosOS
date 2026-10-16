// Filtro de salida: ¿este texto que va al cliente habla de plata? Puro, con su lista de
// pruebas (filtro-salida.test.ts).
//
// Lo va a usar el agente en el paso 5 (crm-propuesta.md §3, §11 riesgo 4 y §13): todo texto que
// escriba la IA pasa por acá antes de salir. Si bloquea, al cliente no le llega nada, la charla
// pasa a «Espera tu OK» con el motivo («texto bloqueado: monto en letras») y aparece en
// «Revisar charlas». Los textos fijos del servidor (el del presupuesto aprobado, los datos de
// pago) NO pasan por acá: esos llevan montos a propósito y los arma el código.
//
// SE DEFINE POR PATRONES DE PLATA, NO POR «CUALQUIER NÚMERO»: medidas (12,40 m), direcciones
// (Los Aromos 1234), cantidades de piezas (3 cuerpos, 4 tablones), días (30 días), pisos y el
// número del presupuesto (#1042) pasan. Bloquea:
//   · el signo y las monedas: «$», «pesos», «ARS», «dólares», «USD», «u$s», «mangos», «gambas»;
//   · los miles y millones: «mil» (salvo «mil gracias»), «millón», «palo(s)» con un número,
//     «luca(s)», «140k»;
//   · porcentajes: «%», «por ciento», «x ciento»;
//   · descuentos: «descuento», «bonificación», «rebaja», y el «IVA» (si la IA dice «más IVA»
//     está hablando de un precio);
//   · datos bancarios: «CBU», «CVU», «alias», y 22 dígitos seguidos (con o sin espacios);
//   · montos en letras: las centenas («ciento cuarenta», «doscientos»);
//   · números con forma de monto: con punto de miles («140.000», «1.736.000») o de 5 cifras o
//     más que no sean un CUIT ni un teléfono («140000»).
//
// Prefiere equivocarse para el lado de bloquear: un falso positivo es un texto que revisa una
// persona; un falso negativo es un precio inventado en el WhatsApp de un cliente.

import { normalizar, primeraCoincidencia } from "./texto.ts";

export type CodigoPlata = "moneda" | "miles" | "porcentaje" | "descuento" | "datos_bancarios" | "monto_en_letras" | "numero_de_monto";

export type HallazgoPlata = { codigo: CodigoPlata; motivo: string; fragmento: string };

export type ResultadoFiltro = { bloquea: boolean; hallazgos: HallazgoPlata[] };

const MOTIVO: Record<CodigoPlata, string> = {
  moneda: "signo de pesos o moneda",
  miles: "monto («mil», «lucas», «palos»)",
  porcentaje: "porcentaje",
  descuento: "descuento, bonificación o IVA",
  datos_bancarios: "CBU, CVU o alias",
  monto_en_letras: "monto en letras",
  numero_de_monto: "número con forma de monto",
};

const CENTENAS = "(?:cien|ciento|doscientos|trescientos|cuatrocientos|quinientos|seiscientos|setecientos|ochocientos|novecientos)";
const NUMERO_O_PALABRA = "(?:\\d+(?:[.,]\\d+)?|un|uno|medio|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|veinte|treinta|cuarenta|cincuenta|sesenta|setenta|ochenta|noventa|cien)";

// Las listas se escriben normalizadas: sin tildes y sin letras dobles (ver texto.ts).
const REGLAS: { codigo: CodigoPlata; terminos: (string | RegExp)[] }[] = [
  {
    codigo: "moneda",
    terminos: [/(\$)/, /\b(u\s*\$\s*s|u\s*s\s*\$)/, "pesos", "peso argentino", "ars", "dolares", "dolar", "usd", "mangos", "mango", "gambas"],
  },
  {
    codigo: "miles",
    // «mil» suelto, pero no «mil gracias»/«mil disculpas»: eso es una forma de hablar.
    terminos: [
      /(?:^|[^a-z0-9])(mil)(?![a-z0-9])(?!\s+(?:gracias|disculpas|perdones|perdon)\b)/,
      "miles", "milon", "milones", "lucas", "luca", "luquitas", "lukas", "luka", "lukitas",
      new RegExp(`(?:^|[^a-z0-9])(${NUMERO_O_PALABRA}\\s+palos?)(?![a-z0-9])`),
      /(?:^|[^a-z0-9])(\d+(?:[.,]\d+)?\s*k)(?![a-z0-9])/,
    ],
  },
  { codigo: "porcentaje", terminos: [/(%)/, "por ciento", "porciento", "porcentaje"] },
  {
    codigo: "descuento",
    terminos: [/(?:^|[^a-z0-9])(descuent[a-z]*|descont[a-z]*|bonific[a-z]*|rebaj[a-z]*)/, "iva"],
  },
  { codigo: "datos_bancarios", terminos: ["cbu", "cvu", "alias"] },
  {
    codigo: "monto_en_letras",
    terminos: [new RegExp(`(?:^|[^a-z0-9])(${CENTENAS})(?![a-z0-9])`)],
  },
];

/** CUIT con o sin guiones (20-12345678-9; normalizado, los guiones son espacios): no es un monto. */
const CUIT = /\b\d{2}\s?\d{8}\s?\d\b/g;
/** Teléfonos argentinos escritos como se escriben: grupos de 2 a 4 cifras con espacios o guiones. */
const TELEFONO = /(?:\+?54\s*)?(?:9\s*)?\b\d{2,4}[\s-]\d{3,4}[\s-]\d{4}\b/g;

/** Las palabras que, antes de un número, lo vuelven un monto: «son 15000», «a 15000». */
const ANTES_DE_MONTO = new Set(["son", "es", "sale", "salen", "cuesta", "cuestan", "vale", "valen", "cobra", "cobran", "cobramos", "a", "de", "por", "total", "precio", "seria", "serian", "queda", "quedan"]);

/**
 * Las alturas de 5 cifras existen (Rivadavia 11500): un número de hasta 19999 que viene después
 * del nombre de una calle pasa. Si viene después de «son», «a», «sale»… es un monto.
 */
function esAlturaDeCalle(texto: string, inicio: number, numero: string): boolean {
  if (numero.length !== 5 || Number(numero) > 19_999) return false;
  const antes = texto.slice(0, inicio).trim().split(" ").at(-1) ?? "";
  return /^[a-z]{3,}$/.test(antes) && !ANTES_DE_MONTO.has(antes);
}

function numerosDeMonto(normalizado: string): string | null {
  // 22 dígitos (CBU/CVU), aunque vengan en grupos.
  const soloDigitosYEspacios = normalizado.match(/\d[\d\s.-]{20,}\d/g) ?? [];
  for (const s of soloDigitosYEspacios) if (s.replace(/\D/g, "").length === 22) return s;

  const sinCuitNiTelefono = normalizado.replace(CUIT, " ").replace(TELEFONO, " ");
  // Dígitos sueltos separados para esquivar el filtro: «1 4 0 0 0 0» → 140000.
  const juntos = sinCuitNiTelefono.replace(/\b\d(?:[\s.]\d\b){3,}/g, (m) => m.replace(/\D/g, ""));
  const conPunto = /(?:^|[^0-9,.])(\d{1,3}(?:\.\d{3})+)(?![0-9])/.exec(juntos);
  if (conPunto) return conPunto[1];
  // «140 000», «1 736 000»: miles separados con espacio, terminados en 000.
  const conEspacio = /(?:^|[^0-9,.])(\d{1,3}(?: \d{3})* 000)(?![0-9])/.exec(juntos);
  if (conEspacio) return conEspacio[1];
  for (const m of juntos.matchAll(/(?:^|[^0-9,.])(\d{5,})(?![0-9])/g)) {
    if (!esAlturaDeCalle(juntos, (m.index ?? 0) + m[0].indexOf(m[1]), m[1])) return m[1];
  }
  return null;
}

export function detectarPlata(texto: string): ResultadoFiltro {
  const n = normalizar(texto);
  const hallazgos: HallazgoPlata[] = [];
  for (const r of REGLAS) {
    const f = primeraCoincidencia(n, r.terminos);
    if (f) hallazgos.push({ codigo: r.codigo, motivo: MOTIVO[r.codigo], fragmento: f });
  }
  const numero = numerosDeMonto(n);
  if (numero) {
    const bancario = numero.replace(/\D/g, "").length === 22;
    const codigo: CodigoPlata = bancario ? "datos_bancarios" : "numero_de_monto";
    if (!hallazgos.some((h) => h.codigo === codigo)) hallazgos.push({ codigo, motivo: MOTIVO[codigo], fragmento: numero });
  }
  return { bloquea: hallazgos.length > 0, hallazgos };
}

/** «texto bloqueado: monto en letras»: el motivo que se muestra en la charla y en «Revisar charlas». */
export function motivoBloqueo(r: ResultadoFiltro): string | null {
  if (!r.bloquea) return null;
  return `texto bloqueado: ${r.hallazgos.map((h) => h.motivo).join(", ")}`;
}
