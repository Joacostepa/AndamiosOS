// La ventana de 24 h de WhatsApp. Puro, con tests (ventana.test.ts).
//
// Meta deja mandar texto libre (y documentos) sólo dentro de las 24 h desde el ÚLTIMO
// mensaje del cliente. Pasado eso, sólo plantillas aprobadas; si igual se manda, Meta lo
// rechaza con el error 131047 (llega en el aviso de estado, no en la respuesta del envío).
// La app no deja ni intentarlo, y lo dice.

export const VENTANA_MS = 24 * 3_600_000;
/** Margen para no mandar en el último minuto: entre el botón y Meta pasan unos segundos. */
export const MARGEN_MS = 2 * 60_000;
/** Con menos de esto, la ventana se muestra en ámbar (§6: «si faltan menos de 2 h, avisa»). */
export const POR_VENCER_MS = 2 * 3_600_000;

export type Ventana = {
  /** Nunca escribió (o no se sabe): no hay ventana. */
  sinMensajes: boolean;
  abierta: boolean;
  /** Ms que le quedan (0 si está cerrada). */
  restanteMs: number;
  /** Ms desde que se cerró (0 si está abierta). */
  cerradaHaceMs: number;
  porVencer: boolean;
};

export function ventana(ultimoEntranteAt: string | Date | null | undefined, ahora: number = Date.now()): Ventana {
  const t = ultimoEntranteAt ? new Date(ultimoEntranteAt).getTime() : NaN;
  if (!Number.isFinite(t)) return { sinMensajes: true, abierta: false, restanteMs: 0, cerradaHaceMs: 0, porVencer: false };
  const vence = t + VENTANA_MS;
  const restanteMs = Math.max(0, vence - ahora);
  return {
    sinMensajes: false,
    abierta: restanteMs > 0,
    restanteMs,
    cerradaHaceMs: Math.max(0, ahora - vence),
    porVencer: restanteMs > 0 && restanteMs < POR_VENCER_MS,
  };
}

/** ¿Se puede mandar texto libre o un documento? Con margen. */
export function puedeTextoLibre(ultimoEntranteAt: string | Date | null | undefined, ahora: number = Date.now()): boolean {
  return ventana(ultimoEntranteAt, ahora).restanteMs > MARGEN_MS;
}

/** «3 h 20 min», «45 min», «menos de 1 min». */
export function duracion(ms: number): string {
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "menos de 1 min";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** Para la pastilla: «Ventana 24 h: quedan 3 h 20 min» o «Ventana cerrada (64 h)». */
export function textoVentana(ultimoEntranteAt: string | Date | null | undefined, ahora: number = Date.now()): string {
  const v = ventana(ultimoEntranteAt, ahora);
  if (v.sinMensajes) return "Sin mensajes del cliente";
  if (!v.abierta) return `Ventana cerrada (${Math.floor((v.cerradaHaceMs + VENTANA_MS) / 3_600_000)} h)`;
  return `Ventana 24 h: quedan ${duracion(v.restanteMs)}`;
}

/** Por qué no se puede mandar, en palabras de quien lo lee. null si se puede. */
export function motivoVentanaCerrada(ultimoEntranteAt: string | Date | null | undefined, ahora: number = Date.now()): string | null {
  if (puedeTextoLibre(ultimoEntranteAt, ahora)) return null;
  const v = ventana(ultimoEntranteAt, ahora);
  if (v.sinMensajes) return "El cliente todavía no escribió: WhatsApp sólo deja empezar una charla con una plantilla aprobada.";
  if (v.abierta) return "A la ventana de 24 h le quedan menos de 2 minutos: ya no da para mandar texto libre. Cuando el cliente vuelva a escribir, se abre de nuevo.";
  const horas = Math.floor((v.cerradaHaceMs + VENTANA_MS) / 3_600_000);
  return `Pasaron ${horas} h desde el último mensaje del cliente: WhatsApp no deja mandar texto libre ni archivos fuera de las 24 h, sólo plantillas aprobadas. Cuando el cliente vuelva a escribir, se abre de nuevo.`;
}
