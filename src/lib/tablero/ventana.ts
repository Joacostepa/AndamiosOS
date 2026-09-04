// La ventana de la obra: "entre el 12 y el 15".
//
// UN SOLO LUGAR PARA LAS DOS REGLAS. Cada borde se consulta desde tres lados —la línea de
// la tarjeta, el aviso al soltar y la fricción al confirmar— y si cada uno lo calculara
// por su cuenta terminarían discrepando: la tarjeta diciendo que está bien y el diálogo
// frenando, o al revés. Cuando eso pasa, la que pierde credibilidad es la pantalla.
//
// LAS TRES FECHAS DE UNA OT, porque confundirlas es el modo de falla obvio:
//
//   fechaDesde        → PISO.  "No antes del 12."           ─┐ la VENTANA del cliente:
//   fechaAntesDe      → TECHO. "Terminado antes del 15."     ┤ son restricciones y acá
//                                                            ┘ se validan
//   fechaComprometida → NUESTRA promesa dentro de esa ventana. Ordena la cola del panel
//                       de sin asignar y mide el desvío; no restringe nada y no vive acá.
//
// EL PISO Y EL TECHO NO SE MIDEN EN EL MISMO DÍA, y es lo que hace que este archivo no sea
// simétrico:
//
//   · el piso restringe el PRIMER día: antes de esa fecha no te reciben;
//   · el techo restringe el ÚLTIMO, porque lo que el cliente pide es que el trabajo esté
//     TERMINADO. Una obra de tres jornadas que arranca el 14 con techo el 15 cumple el
//     piso y se pasa igual.
//
// Por eso `violaTecho` recibe el último día planificado de la obra ENTERA y no el bloque
// que se está tocando: una obra puede estar partida en tramos y el que manda es el que
// termina más tarde.

import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import type { Friccion } from "@/lib/habilitaciones/derivacion";

/** Lo mínimo que hace falta para saber si una obra tiene ventana. */
export type ConVentana = { fechaDesde: string | null; fechaAntesDe: string | null };

const dia = (f: string) => format(parseISO(f), "d MMM", { locale: es });

/**
 * ¿Poner la obra este día rompe el piso acordado?
 *
 * Compara ISO contra ISO (yyyy-MM-dd), que ordena lexicográficamente igual que
 * cronológicamente. Sin piso cargado nunca hay violación: el campo es opcional y la
 * mayoría de las obras entran cuando hay lugar.
 */
export function violaPiso(ot: Pick<ConVentana, "fechaDesde">, fecha: string): boolean {
  return !!ot.fechaDesde && fecha < ot.fechaDesde;
}

/**
 * ¿La obra termina después de la fecha límite del cliente?
 *
 * `ultimoDia` es el último día planificado de la obra COMPLETA, no el del bloque que se
 * está mirando. Ver el encabezado: el techo es sobre el trabajo terminado.
 */
export function violaTecho(
  ot: Pick<ConVentana, "fechaAntesDe">,
  ultimoDia: string | null,
): boolean {
  return !!ot.fechaAntesDe && !!ultimoDia && ultimoDia > ot.fechaAntesDe;
}

/** El piso, escrito como lo lee una persona. "12 sep". */
export function piso(ot: Pick<ConVentana, "fechaDesde">): string | null {
  return ot.fechaDesde ? dia(ot.fechaDesde) : null;
}

/** El techo, escrito como lo lee una persona. "15 sep". */
export function techo(ot: Pick<ConVentana, "fechaAntesDe">): string | null {
  return ot.fechaAntesDe ? dia(ot.fechaAntesDe) : null;
}

/**
 * La línea de la tarjeta en la bandeja de sin asignar.
 *
 * CUANDO ESTÁN LAS DOS, UNA SOLA LÍNEA: "entre el 12 y el 15". Dos renglones separados
 * ocupan el doble y esconden lo único que importa, que es el ancho de la ventana — con
 * tres días de margen la obra se planifica distinto que con treinta.
 *
 * SE VE SIEMPRE QUE HAYA VENTANA, pero en rojo SÓLO cuando está violada. En este tablero
 * el rojo ya significa "algo está mal" —compromiso vencido, sobreasignación— y gastarlo en
 * "tomá nota" lo devaluaría para lo que sí está mal. Una obra con ventana todavía sin
 * planificar no tiene ningún problema: tiene una restricción.
 */
export function lineaVentana(
  ot: ConVentana,
  plan: { primerDia: string | null; ultimoDia: string | null },
): { texto: string; alerta: boolean } | null {
  const desde = piso(ot);
  const hasta = techo(ot);
  if (!desde && !hasta) return null;

  const rompePiso = !!plan.primerDia && violaPiso(ot, plan.primerDia);
  const rompeTecho = violaTecho(ot, plan.ultimoDia);

  if (desde && hasta) {
    return {
      texto: rompePiso
        ? `planificada ANTES del ${desde}`
        : rompeTecho
          ? `TERMINA después del ${hasta}`
          : `entre el ${desde} y el ${hasta}`,
      alerta: rompePiso || rompeTecho,
    };
  }
  if (desde) {
    return {
      texto: rompePiso ? `planificada ANTES del ${desde}` : `no antes del ${desde}`,
      alerta: rompePiso,
    };
  }
  return {
    texto: rompeTecho ? `TERMINA después del ${hasta}` : `terminada antes del ${hasta}`,
    alerta: rompeTecho,
  };
}

/**
 * La fricción al CONFIRMAR una jornada que cae fuera de la ventana.
 *
 * Acá sí frena —pidiendo un motivo escrito— y al soltar no. La diferencia no es de grado
 * sino de significado: mientras la jornada es tentativa, ponerla fuera de la ventana es
 * una hipótesis de trabajo; confirmarla es prometerle esa fecha al cliente y tomar la
 * cuadrilla. Una cuadrilla que sale un día que no la reciben es un viaje pago que vuelve
 * vacío, y una obra que termina tarde es una condición incumplida.
 *
 * EL PISO PRIMERO cuando los dos están rotos: es el que se descubre antes —la cuadrilla
 * llega y no entra— y evaluar de a una por vez es a propósito. Dos diálogos encadenados
 * para un clic se leen como que el sistema no quiere que trabajes.
 *
 * Devuelve null si no hay ventana o si el plan la respeta: la enorme mayoría de las obras.
 */
export function friccionDeVentana(
  ot: ConVentana,
  plan: { primerDia: string; ultimoDia: string | null },
): Friccion {
  if (violaPiso(ot, plan.primerDia)) {
    return {
      tipo: "antes_de_piso",
      motivo: `El cliente recibe la obra a partir del ${piso(ot)}.`,
      piso: piso(ot) ?? "",
      fecha: dia(plan.primerDia),
    };
  }
  if (violaTecho(ot, plan.ultimoDia)) {
    return {
      tipo: "despues_de_techo",
      motivo: `El cliente pidió el trabajo terminado antes del ${techo(ot)}.`,
      techo: techo(ot) ?? "",
      // El día en que la obra termina según el plan de HOY, que es contra lo que se mide.
      fecha: dia(plan.ultimoDia!),
    };
  }
  return null;
}
