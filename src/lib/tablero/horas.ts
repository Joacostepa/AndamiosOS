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
 * Horas efectivas de un rango, descontando el solapamiento con el almuerzo (12 a 13).
 * Replica lo que calcula Odoo en x_aba_mano_obra.x_horas, para poder previsualizar las
 * horas-hombre sin ida y vuelta al servidor.
 */
export function horasEfectivas(desde: number, hasta: number): number {
  if (!(hasta > desde)) return 0;
  const bruto = hasta - desde;
  const solape = Math.min(hasta, 13) - Math.max(desde, 12);
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
