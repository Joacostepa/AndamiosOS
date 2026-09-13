"use client";

import type { TrabajoOt } from "@/lib/tablero/tipos";

// La obra es una pantalla de protección: habilitación rápida.
//
// Sale de la clasificación de la VENTA (x_trabajo_obra = pantalla_proteccion), no de la
// OT, así que el armado y el desarme de la misma obra lo muestran los dos. Es la obra más
// común entre las activas (26 de 65) y la de menor complejidad para habilitar: verla de un
// vistazo permite sacarlas rápido y dedicarle el tiempo a las que no lo son.
//
// SÓLO "Pantalla de protección". "Estructura + pantalla" lleva estructura, y marcarla como
// rápida sería prometer algo que no es.
//
// Violeta a propósito: el azul es del armado, el ámbar del desarme y de los avisos, el rojo
// de la prioridad y el verde de lo habilitado. Un color ya usado se leería como eso.

export function esPantalla(trabajo: TrabajoOt | null | undefined): boolean {
  return trabajo?.ambito === "obra" && trabajo.tipo === "pantalla_proteccion";
}

export function ChipPantalla({ trabajo }: { trabajo: TrabajoOt | null | undefined }) {
  if (!esPantalla(trabajo)) return null;
  return (
    <span
      className="inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[11px] font-semibold"
      style={{ backgroundColor: "#EEEDFE", color: "#3C3489" }}
      title="Pantalla de protección: obra de baja complejidad, habilitación rápida"
    >
      Pantalla
    </span>
  );
}
