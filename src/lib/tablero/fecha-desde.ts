// El piso de la obra: "a partir del 12 puede entrar".
//
// UN SOLO LUGAR PARA LA REGLA. La violación se consulta desde tres lados —la línea roja
// de la tarjeta, el aviso al soltar en el tablero y el candado al confirmar— y si cada
// uno la calculara por su cuenta terminarían discrepando: la tarjeta diciendo que está
// bien y el candado frenando, o al revés. Cuando eso pasa, la que pierde credibilidad es
// la pantalla, no el código.
//
// NO ES fechaComprometida y no hay que mezclarlas:
//   fechaComprometida → TECHO. "Le prometí el jueves". Llegar después es un desvío.
//   fechaDesde        → PISO.  "No antes del jueves". Ir antes no se puede.

import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import type { Friccion } from "@/lib/habilitaciones/derivacion";

/** Lo mínimo que hace falta para saber si una obra tiene piso. */
type ConPiso = { fechaDesde: string | null };

/**
 * ¿Poner la obra este día rompe el acuerdo con el cliente?
 *
 * Compara ISO contra ISO (yyyy-MM-dd), que ordena lexicográficamente igual que
 * cronológicamente. Sin piso cargado nunca hay violación: el campo es opcional y la
 * mayoría de las obras entran cuando hay lugar.
 */
export function violaPiso(ot: ConPiso, fecha: string): boolean {
  return !!ot.fechaDesde && fecha < ot.fechaDesde;
}

/** El día del piso, escrito como lo lee una persona. "12 sep". */
export function piso(ot: ConPiso): string | null {
  return ot.fechaDesde ? format(parseISO(ot.fechaDesde), "d MMM", { locale: es }) : null;
}

/**
 * La línea de la tarjeta en la bandeja de sin asignar.
 *
 * SE VE SIEMPRE QUE HAYA PISO, pero en rojo SÓLO cuando está violado. En este tablero el
 * rojo ya significa "algo está mal" —compromiso vencido, sobreasignación— y gastarlo en
 * "tomá nota" lo devaluaría para lo que sí está mal. Una obra con piso todavía sin
 * planificar no tiene ningún problema: tiene una restricción, y para eso alcanza el
 * candado al lado del texto.
 */
export function lineaPiso(
  ot: ConPiso,
  fechaPlanificada: string | null,
): { texto: string; alerta: boolean } | null {
  const dia = piso(ot);
  if (!dia) return null;
  const violado = !!fechaPlanificada && violaPiso(ot, fechaPlanificada);
  return {
    texto: violado ? `planificada ANTES del ${dia}` : `no antes del ${dia}`,
    alerta: violado,
  };
}

/**
 * La fricción al CONFIRMAR una jornada que cae antes del piso.
 *
 * Acá sí frena —pidiendo un motivo escrito— y al soltar no. La diferencia no es de grado
 * sino de significado: mientras la jornada es tentativa, ponerla antes es una hipótesis
 * de trabajo; confirmarla es prometerle esa fecha al cliente y tomar la cuadrilla. Una
 * cuadrilla que sale un día que no la reciben es un viaje pago que vuelve vacío.
 *
 * Devuelve null si no hay piso o si la fecha lo respeta: la enorme mayoría de las obras.
 */
export function friccionDePiso(ot: ConPiso, fecha: string): Friccion {
  if (!violaPiso(ot, fecha)) return null;
  return {
    tipo: "antes_de_piso",
    motivo: `El cliente recibe la obra a partir del ${piso(ot)}.`,
    piso: piso(ot) ?? "",
    fecha: format(parseISO(fecha), "d MMM", { locale: es }),
  };
}
