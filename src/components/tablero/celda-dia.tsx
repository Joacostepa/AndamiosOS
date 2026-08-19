"use client";

import { useDroppable } from "@dnd-kit/core";
import { ocupacionCelda } from "@/lib/tablero/fracciones";
import { colorOcupacion, ACENTO_BG, CORAL, RIEL_OCUPACION } from "@/lib/tablero/colores";

// Celda cuadrilla × día: es el fondo droppable de la columna y lleva la barra de
// ocupación al pie. Ocupa todos los carriles de la fila (grid-row 1 / -1), así que las
// tarjetas se dibujan encima; la última fila de la grilla queda reservada para la barra.
//
// DECISIÓN (densidad): la celda vacía no dice "libre". Lo vacío ya se lee como vacío, y
// repetir la palabra en cada celda era ruido que competía con lo que sí importa. Por lo
// mismo se fue el texto "completa" / "SOBREASIGNADA": el ancho y el color del relleno ya
// lo dicen, y repetido en 5 celdas por fila era puro ruido.
//
// El fondo de la celda quedó reservado para el drop target del arrastre. Ni "hoy" ni la
// ocupación lo usan: hoy se marca en el encabezado, y la ocupación en la barra.
//
// REGLA DE NEGOCIO: la sobreasignación se permite y se advierte (no se bloquea): a
// veces la jornada se estira. Las tentativas SÍ ocupan capacidad: son borrador, no
// reserva ficticia.

export function CeldaDia({
  cuadrillaId,
  fecha,
  columna,
  esDomingo,
  colapsada = false,
  inicioSemana = false,
  pasada = false,
  fracciones,
}: {
  cuadrillaId: number;
  fecha: string;
  columna: number;
  esDomingo: boolean;
  /** Domingo sin trabajo: canaleta angosta, no acepta drop. */
  colapsada?: boolean;
  /** Lunes: lleva el separador de semana, que baja por toda la grilla. */
  inicioSemana?: boolean;
  /** Anterior a hoy: fondo apenas distinto para ver dónde corta el presente. */
  pasada?: boolean;
  fracciones: number[];
}) {
  const { setNodeRef, isOver, active } = useDroppable({
    id: `celda:${cuadrillaId}:${fecha}`,
    data: { cuadrillaId, fecha, esDomingo },
    disabled: colapsada,
  });
  const dropActivo = isOver && !!active;
  const ocupacion = ocupacionCelda(fracciones);
  const ocupada = ocupacion.total > 0;

  return (
    <div
      ref={setNodeRef}
      style={{
        gridColumn: columna + 1,
        gridRow: "1 / -1",
        // El pasado lleva un gris neutro MUY tenue: sirve para ver de un vistazo dónde
        // corta el presente y nada más. No compite con el pill coral de hoy ni con los
        // estados de capacidad, porque no significa nada — sólo "esto ya fue".
        backgroundColor: dropActivo
          ? ACENTO_BG
          : colapsada
            ? "#F1EFE8"
            : pasada
              ? "color-mix(in oklch, var(--foreground) 2.5%, transparent)"
              : undefined,
        // El separador de semana recorre la altura completa: en el encabezado solo, a
        // 40px, no alcanza para ubicarse cuando se scrollea entre semanas.
        borderLeft: inicioSemana ? "2px solid var(--border)" : undefined,
        outline: dropActivo ? `2px dashed ${CORAL}` : undefined,
        outlineOffset: "-2px",
      }}
      className="relative border-b border-r"
    >
      {/* El riel va SIEMPRE (salvo en la canaleta): una barra que aparece y desaparece
          hace saltar la línea de base de la fila al asignar. */}
      {!colapsada && (
        <div
          className="absolute inset-x-1 bottom-1 h-1 overflow-hidden rounded-full"
          style={{ backgroundColor: RIEL_OCUPACION }}
          title={ocupada ? ocupacion.label : undefined}
        >
          <div
            className="h-full rounded-full transition-all"
            style={{
              // El exceso llena el riel entero: pasado el 100% lo que importa es que se
              // pasó, no cuánto — eso lo dice el número del encabezado de fila.
              width: ocupacion.nivel === "sobre" ? "100%" : `${Math.min(100, ocupacion.pct)}%`,
              backgroundColor: colorOcupacion(ocupacion.nivel),
            }}
          />
        </div>
      )}
    </div>
  );
}
