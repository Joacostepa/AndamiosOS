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
  "x_hab_syh_nombre",
  "x_hab_syh_celular",
  "x_hab_syh_email",
];

export type FilaTrabajo = {
  x_trabajo_ambito: string | false;
  x_trabajo_obra: string | false;
  x_trabajo_evento: string | false;
  x_alambre_concertina: string | false;
  x_syh_presencial: string | false;
  x_hab_syh_nombre: string | false;
  x_hab_syh_celular: string | false;
  x_hab_syh_email: string | false;
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
  syhObra: null,
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
    syhObra: leerSyhObra(v),
  };
}

/**
 * A quién de la obra hay que mandarle la documentación de nuestro personal.
 *
 * NO ES lo mismo que `syhPresencial`, que dice si NOSOTROS ponemos un técnico en obra.
 * Éste es el destinatario de los papeles —el que valida y nos deja entrar— y es el que le
 * faltaba al circuito de habilitaciones: el módulo registra que se reclamó tres veces y
 * hasta ahora no podía decir a quién. Se carga en la venta y es obligatorio para confirmar
 * una obra (ver scripts/odoo-contacto-syh-orden.mjs).
 *
 * Devuelve null cuando no hay NINGUNO de los tres, para que la UI pueda preguntar "¿hay
 * contacto?" en vez de mirar tres campos. Con uno solo cargado ya devuelve el objeto: una
 * ficha a medias sirve igual —un teléfono sin apellido se puede llamar— y esconderla sería
 * peor que mostrarla incompleta.
 */
function leerSyhObra(v: Partial<FilaTrabajo>): TrabajoOt["syhObra"] {
  const nombre = txt(v.x_hab_syh_nombre);
  const celular = txt(v.x_hab_syh_celular);
  const email = txt(v.x_hab_syh_email);
  if (!nombre && !celular && !email) return null;
  return { nombre, celular, email };
}
