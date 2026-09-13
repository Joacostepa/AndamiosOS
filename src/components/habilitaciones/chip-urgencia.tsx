"use client";

import { AVISO, PELIGRO_SOLIDO } from "@/lib/tablero/colores";
import type { UrgenciaOt } from "@/lib/habilitaciones/tipos";

// La prioridad de la OT (x_urgencia), para que se vea en el primer pantallazo.
//
// SÓLO ALTA Y MEDIA. La baja no lleva nada: son 58 de 65 OTs activas, y un chip en cada
// fila sería ruido que entrena a no mirar la columna el día que dice algo.
//
// ALTA EN ROJO LLENO, como el borde de la urgencia en el tablero: es la señal más fuerte
// de la pantalla y se reserva para eso. Media va en ámbar, el mismo tono de los avisos,
// para que se note sin competir.
//
// El motivo va en el title (en la ficha, además, escrito al lado): "Compromiso con el
// cliente" explica por qué esta obra va primero.

export function ChipUrgencia({
  urgencia,
  motivo,
}: {
  urgencia: UrgenciaOt;
  motivo?: string | null;
}) {
  if (urgencia === "baja") return null;
  const alta = urgencia === "alta";

  return (
    <span
      className="inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[11px] font-semibold"
      style={
        alta
          ? { backgroundColor: PELIGRO_SOLIDO, color: "#fff" }
          : { backgroundColor: AVISO.fondo, color: AVISO.texto }
      }
      title={`Prioridad ${urgencia}${motivo ? ` — ${motivo}` : ""}`}
    >
      {alta ? "Prioridad alta" : "Prioridad media"}
    </span>
  );
}
