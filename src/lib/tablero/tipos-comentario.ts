// Comentarios de la OT: lo que Operaciones habló con el cliente y no entra en un campo.
//
// "Entramos 8am el martes, portero avisado", "si llueve corre al jueves", "el encargado
// pide avisar el día anterior". Viven en Supabase (ot_comentarios); ver la migración
// 20260912000001.
//
// NO CONFUNDIR CON NotaJornada (tipos-nota.ts), que es lo que pasa un DÍA con una
// CUADRILLA —"el chofer de la 2 se va 14h"— y no tiene obra detrás. Un comentario es de
// la obra y viaja con ella a cualquier fecha y cualquier cuadrilla.
//
// Los tipos van acá y no en el servicio para que el bundle del browser no tenga que
// tocar el módulo server-only, igual que tipos.ts.

import { format, isToday, isYesterday, parseISO } from "date-fns";
import { es } from "date-fns/locale";

export type ComentarioOt = {
  id: string;
  otId: number;
  texto: string;
  /** Queda arriba de todo, por encima de los recientes. Para lo permanente. */
  fijado: boolean;
  autorId: string | null;
  autorNombre: string | null;
  createdAt: string;
};

/**
 * Lo que la TARJETA necesita saber de una OT: que hay comentarios, cuántos y cuál fue el
 * último. El hilo entero se lee en el panel.
 *
 * Se resuelve para todas las OTs del tablero de una sola vez, como el candado: una
 * consulta por tarjeta en una grilla de cien sería cien consultas.
 */
export type ResumenComentarios = {
  cantidad: number;
  ultimo: { texto: string; autorNombre: string | null; createdAt: string };
};

/**
 * "hoy 14:32", "ayer 09:10", "3 sep 08:15".
 *
 * La hora va SIEMPRE, incluso en los viejos: buena parte de lo que se anota son horarios
 * acordados, y un comentario sin hora no deja saber si lo que dice ya caducó.
 */
export function cuando(iso: string): string {
  const d = parseISO(iso);
  if (isToday(d)) return `hoy ${format(d, "HH:mm")}`;
  if (isYesterday(d)) return `ayer ${format(d, "HH:mm")}`;
  return format(d, "d MMM HH:mm", { locale: es });
}

/**
 * Lo que sopla la tarjeta al pasar el mouse: el último comentario entero, con quién y
 * cuándo. Es el `title` de un ícono de 12px, así que no hay dónde poner más — y con esto
 * alcanza para decidir si vale la pena abrir el panel.
 */
export function tituloResumen(r: ResumenComentarios): string {
  const pie = `${r.ultimo.autorNombre ?? "—"} · ${cuando(r.ultimo.createdAt)}`;
  const otros = r.cantidad > 1 ? `\n\n(${r.cantidad} comentarios en total)` : "";
  return `${r.ultimo.texto}\n${pie}${otros}`;
}
