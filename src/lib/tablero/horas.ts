// Horarios del parte, en 24 h y escritos a mano.
//
// POR QUÉ NO `<input type="time">`: el formato que muestra —12 h con AM/PM o 24 h— lo
// decide el idioma del navegador y no se puede forzar de forma confiable. Además obliga a
// tabular entre hora y minuto, y quien carga cinco partes cada mañana escribe "1730"
// mucho más rápido de lo que navega dos sub-campos.
//
// Medido sobre las 1300 líneas de mano de obra que hay en Odoo: 1276 arrancan a las 8 y
// cinco horarios de salida cubren el 99,2%. Escribir es el camino de excepción; el normal
// son los atajos.

/**
 * Acepta "17", "1730", "17:30", "17.30", "9,30", "930".
 * Devuelve horas decimales (17,5) o null si no se entiende.
 */
export function parseHora(s: string): number | null {
  // La coma se usa como separador decimal en es-AR, y el punto también aparece: los dos
  // significan lo mismo acá y se normalizan a ":".
  const t = String(s).trim().replace(",", ".").replace(".", ":");
  if (!t) return null;

  let hh: number;
  let mm: number;
  const conSeparador = /^(\d{1,2}):(\d{1,2})$/.exec(t);
  if (conSeparador) {
    hh = Number(conSeparador[1]);
    mm = Number(conSeparador[2]);
  } else if (/^\d{1,2}$/.test(t)) {
    hh = Number(t);
    mm = 0;
  } else if (/^\d{3}$/.test(t)) {
    // "930" → 9:30
    hh = Number(t.slice(0, 1));
    mm = Number(t.slice(1));
  } else if (/^\d{4}$/.test(t)) {
    hh = Number(t.slice(0, 2));
    mm = Number(t.slice(2));
  } else {
    return null;
  }

  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  if (hh > 23 || mm > 59) return null;
  return hh + mm / 60;
}

/** Horas decimales → "17:30". */
export function formatHora(v: number): string {
  if (!Number.isFinite(v)) return "";
  const total = Math.round(v * 60);
  const hh = Math.floor(total / 60);
  const mm = total % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/**
 * El turno terminó al día siguiente: se entra a las 22 y se sale a las 2.
 *
 * Pasa poco pero pasa, y hasta ahora no se podía cargar: un turno nocturno chocaba con
 * "la salida tiene que ser posterior a la entrada" y quedaba fuera del sistema. Se
 * reconoce por la forma —la salida es ANTERIOR a la entrada— y no con una casilla aparte:
 * preguntarlo en las cinco filas de todos los días para el caso raro es fricción en la
 * pantalla que menos la tolera.
 */
export function cruzaMedianoche(desde: number, hasta: number): boolean {
  return hasta < desde;
}

/**
 * Más que esto no es un turno, es la entrada y la salida escritas al revés.
 *
 * Existe por culpa de lo de arriba: al aceptar la salida anterior a la entrada, tipear
 * 17 en "desde" y 8 en "hasta" —el error natural, porque el 90% de lo que se carga es
 * 8→17— pasaba de dar error a leerse como un turno y guardarse en silencio.
 *
 * EL NÚMERO SALE DE LOS DATOS, no de la intuición. Medido sobre las 1374 líneas cargadas
 * en Odoo: el turno más largo que existe es de NUEVE horas, y no hay ninguno de más. Del
 * otro lado, las transposiciones que hay que atajar dan 14, 15, 17, 20, 22 y 22,5 horas.
 * Doce parte esas dos poblaciones con margen para las dos.
 *
 * El primer valor que puse fue 16 y no servía: 17→8 da 15 horas y pasaba por abajo, o sea
 * que el tope dejaba entrar justo el error que venía a atajar. Los turnos nocturnos reales
 * quedan lejos del tope: 22→2 son 4 horas y 21→5 son 8.
 */
export const MAX_HORAS_TURNO = 12;

/** Duración del turno en horas de reloj, sin descontar el almuerzo. */
export function duracionTurno(desde: number, hasta: number): number {
  // Misma hora de entrada y salida es ambiguo —¿cero horas o veinticuatro?— y no se
  // adivina: da cero acá y lo rechaza la validación con un mensaje que lo dice.
  if (hasta === desde) return 0;
  return (cruzaMedianoche(desde, hasta) ? hasta + 24 : hasta) - desde;
}

/**
 * Horas efectivas de un rango, descontando el solapamiento con el almuerzo (12 a 13).
 * Replica lo que calcula Odoo en x_aba_mano_obra.x_horas, para poder previsualizar las
 * horas-hombre sin ida y vuelta al servidor.
 *
 * En el turno que cruza la medianoche el almuerzo no descuenta nada, y sale solo: la
 * ventana 12-13 no cae dentro de 22→26. No hay rama especial.
 */
export function horasEfectivas(desde: number, hasta: number): number {
  const bruto = duracionTurno(desde, hasta);
  if (bruto === 0) return 0;
  const solape = Math.min(desde + bruto, 13) - Math.max(desde, 12);
  return solape > 0 ? bruto - solape : bruto;
}

export const JORNADA_DESDE = 8;

/**
 * Los cinco horarios de salida que cubren el 99,2% de las líneas cargadas. Todos arrancan
 * a las 8. La etiqueta de fracción los conecta con el vocabulario del tablero: quien
 * planificó "media jornada" reconoce el 12:00 como esa media.
 */
export const ATAJOS_SALIDA: { hora: number; fraccion: string; horas: number }[] = [
  { hora: 9.5, fraccion: "mín", horas: 1.5 },
  { hora: 10, fraccion: "¼", horas: 2 },
  { hora: 12, fraccion: "½", horas: 4 },
  { hora: 15, fraccion: "¾", horas: 6 },
  { hora: 17, fraccion: "1", horas: 8 },
];

/** Qué fracción de jornada representan esas horas-hombre, para comparar con lo planificado. */
export function fraccionDeHoras(horas: number): number {
  return Math.round((horas / 8) * 100) / 100;
}
