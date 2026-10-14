// ¿El último mensaje del vendedor es una confirmación clara?
//
// LO DECIDE EL SERVIDOR, NO EL MODELO. El modelo puede interpretar "sí, pero con 10 %" como
// un sí; esta función no. Es estricta a propósito: TODA palabra del mensaje tiene que ser una
// afirmación o relleno conocido ("sí", "dale", "mandalo nomás", "ok, guardalo en Odoo"). Si
// aparece cualquier otra cosa —un número, un "pero", un "sin la concertina"— no es una
// confirmación: el asistente vuelve a preguntar o se ofrece el botón. Equivocarse para el
// lado de preguntar de nuevo cuesta un segundo; equivocarse para el otro lado es un
// presupuesto mal cargado o un mail que salió.
//
// explicita (mandar un mail al cliente): además hace falta el verbo — "mandalo", "envialo",
// "confirmo el envío". Un "sí" suelto no alcanza para algo que sale de la empresa.
//
// Pura: sin base ni red, con tests en confirmacion.test.ts.

const AFIRMATIVAS = new Set([
  "si", "sii", "siii", "sip", "dale", "ok", "okey", "okay", "oka", "confirmo", "confirmado", "confirmalo", "confirmala",
  "hacelo", "hacela", "adelante", "listo", "perfecto", "correcto", "exacto", "afirmativo", "obvio", "claro",
  "mandalo", "mandala", "mandalos", "envialo", "enviala", "guardalo", "guardala", "cargalo", "cargala", "subilo", "subila",
  "genial", "joya", "barbaro", "excelente", "buenisimo", "seguro", "procede", "procede", "va",
]);

/** "de una" y "está bien" son afirmaciones de dos palabras. */
const AFIRMATIVAS_DOBLES = ["de una", "esta bien", "todo bien", "me parece bien", "de acuerdo"];

const RELLENO = new Set([
  "bueno", "bien", "nomas", "ya", "ahora", "entonces", "porfa", "por", "favor", "gracias", "che", "capo", "genio",
  "lo", "la", "los", "las", "le", "eso", "esto", "todo", "asi", "que", "de", "una", "el", "al", "a", "en", "y", "me",
  "parece", "esta", "acuerdo", "claude", "asistente", "mismo", "tal", "cual", "como", "dijiste", "decis",
  "presupuesto", "propuesta", "orden", "cotizacion", "odoo", "mail", "correo", "cliente", "pdf", "envio", "accion",
  // Imperativos con tilde ("creá", "guardá"): la normalización les saca la tilde.
  "manda", "envia", "enviar", "mandar", "guardar", "cargar", "crear", "crealo", "creala", "crea", "guarda", "carga", "hace",
]);

const VERBOS_ENVIO = /\b(mandalo|mandala|mandalos|envialo|enviala|manda|envia|enviar|mandar|confirmo el envio|confirmo el mail|mandale|enviale)\b/;

export type NivelConfirmacion = "simple" | "explicita";

export type Veredicto = { ok: true } | { ok: false; motivo: string };

function normalizar(texto: string): string {
  return texto
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[.,;:!¡…"'()\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function esConfirmacion(texto: string, nivel: NivelConfirmacion = "simple"): Veredicto {
  const crudo = (texto ?? "").trim();
  if (!crudo) return { ok: false, motivo: "No hubo respuesta." };
  if (/[?¿]/.test(crudo)) return { ok: false, motivo: "Es una pregunta, no una confirmación." };
  if (/\d|%|\$/.test(crudo)) return { ok: false, motivo: "Trae números: parece un cambio, no una confirmación." };

  const t = normalizar(crudo);
  const palabras = t.split(" ").filter(Boolean);
  if (palabras.length > 12) return { ok: false, motivo: "Es demasiado largo para ser un sí: puede traer un cambio." };

  const conDobles = AFIRMATIVAS_DOBLES.some((d) => t.includes(d));
  const tieneAfirmacion = conDobles || palabras.some((p) => AFIRMATIVAS.has(p));
  if (!tieneAfirmacion) return { ok: false, motivo: "No hay un sí claro." };

  const ajenas = palabras.filter((p) => !AFIRMATIVAS.has(p) && !RELLENO.has(p));
  if (ajenas.length) return { ok: false, motivo: `Dice algo más que un sí («${ajenas.slice(0, 3).join(" ")}»): puede ser un cambio.` };

  if (nivel === "explicita" && !VERBOS_ENVIO.test(t)) {
    return { ok: false, motivo: "Para mandar algo al cliente hace falta decirlo: «mandalo» o «confirmo el envío»." };
  }
  return { ok: true };
}
