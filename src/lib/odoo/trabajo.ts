// Lo que Comercial clasifica en la solapa "Trabajo a ejecutar" de la orden de venta.
//
// SOLO server-side. Lo leen dos módulos que no se conocen entre sí —el tablero, para el
// panel de la OT, y habilitaciones, para la bandeja y la ficha— y por eso el mapeo vive
// acá y no en cada uno: si mañana cambia una regla, cambia en un archivo.
//
// LOS CAMPOS VIVEN EN LA VENTA, NO EN LA OT, igual que el permiso: son de la obra, y el
// armado y el desarme de la misma obra los comparten. Ver scripts/odoo-tipo-de-trabajo.mjs.
//
// ACÁ SE RESUELVE EL BORDE DEL ALAMBRE. En Odoo, x_alambre_concertina puede quedar en "sí"
// y escondido: la vista sólo lo muestra en los tres tipos que llevan bandeja de protección,
// pero si alguien lo contesta y después cambia el tipo a Torre, el valor queda. Devolver
// ese "sí" haría que el tablero le pida concertina a una torre. Se cruza con el tipo una
// sola vez, acá, en vez de tener que acordarse en cada pantalla.

import type { TrabajoOt } from "@/lib/tablero/tipos";
import { TIPOS_TRABAJO_EVENTO, TIPOS_TRABAJO_OBRA } from "@/lib/tablero/tipos";

/** Los únicos tipos con bandeja de protección, o sea los únicos que pueden llevar alambre. */
const CON_BANDEJA = new Set(["pantalla_proteccion", "estructura_pantalla", "estructura_sin_pantalla"]);

/** Para sumar a los `fields` de cualquier lectura de sale.order. */
export const CAMPOS_TRABAJO = [
  "x_trabajo_ambito",
  "x_trabajo_obra",
  "x_trabajo_evento",
  "x_alambre_concertina",
  "x_syh_presencial",
];

export type FilaTrabajo = {
  x_trabajo_ambito: string | false;
  x_trabajo_obra: string | false;
  x_trabajo_evento: string | false;
  x_alambre_concertina: string | false;
  x_syh_presencial: string | false;
};

const txt = (v: string | false | null | undefined): string | null =>
  typeof v === "string" && v.trim() !== "" ? v : null;

/** Sin clasificar. Es un estado real —las 2400 órdenes viejas están así— y no un error. */
export const TRABAJO_VACIO: TrabajoOt = {
  ambito: null,
  tipo: null,
  tipoLabel: null,
  alambre: false,
  syhPresencial: null,
};

export function leerTrabajo(v: Partial<FilaTrabajo> | undefined | null): TrabajoOt {
  if (!v) return TRABAJO_VACIO;

  const ambito = txt(v.x_trabajo_ambito) as "obra" | "evento" | null;
  const tipo =
    ambito === "obra" ? txt(v.x_trabajo_obra)
    : ambito === "evento" ? txt(v.x_trabajo_evento)
    : null;

  const tipoLabel = !tipo
    ? null
    : ambito === "obra"
      ? (TIPOS_TRABAJO_OBRA[tipo as keyof typeof TIPOS_TRABAJO_OBRA] ?? tipo)
      : (TIPOS_TRABAJO_EVENTO[tipo as keyof typeof TIPOS_TRABAJO_EVENTO] ?? tipo);

  return {
    ambito,
    tipo,
    tipoLabel,
    // El cruce con el tipo, que es lo que evita pedirle concertina a una torre.
    alambre: ambito === "obra" && !!tipo && CON_BANDEJA.has(tipo) && txt(v.x_alambre_concertina) === "si",
    // null y false son distintos: nadie contestó vs. contestaron que no.
    syhPresencial: txt(v.x_syh_presencial) === null ? null : txt(v.x_syh_presencial) === "si",
  };
}
