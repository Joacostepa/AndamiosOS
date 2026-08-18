"use client";

import { useDroppable } from "@dnd-kit/core";
import { ocupacionCelda } from "@/lib/tablero/fracciones";
import { colorOcupacion, ACENTO_BG, CORAL } from "@/lib/tablero/colores";

// Celda cuadrilla × día: es el fondo droppable de la columna y lleva la barra de
// ocupación al pie. Ocupa todos los carriles de la fila (grid-row 1 / -1), así que las
// tarjetas se dibujan encima; la última fila de la grilla queda reservada para la barra.
//
// DECISIÓN (densidad): la celda vacía no dice "libre". Lo vacío ya se lee como vacío, y
// repetir la palabra en cada celda era ruido que competía con lo que sí importa. La
// diferencia se da por fondo, y la barra aparece solo cuando hay algo asignado.
//
// REGLA DE NEGOCIO: la sobreasignación se permite y se advierte (no se bloquea): a
// veces la jornada se estira. Las tentativas SÍ ocupan capacidad: son borrador, no
// reserva ficticia.

export function CeldaDia({
  cuadrillaId,
  fecha,
  columna,
  esHoy,
  esDomingo,
  fracciones,
}: {
  cuadrillaId: number;
  fecha: string;
  columna: number;
  esHoy: boolean;
  esDomingo: boolean;
  fracciones: number[];
}) {
  const { setNodeRef, isOver, active } = useDroppable({
    id: `celda:${cuadrillaId}:${fecha}`,
    data: { cuadrillaId, fecha },
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
        backgroundColor: dropActivo
          ? ACENTO_BG
          : esDomingo
            ? "var(--muted)"
            : ocupada
              ? "color-mix(in oklch, var(--foreground) 3.5%, transparent)"
              : esHoy
                ? "rgba(216,90,48,0.03)"
                : undefined,
        outline: dropActivo ? `2px dashed ${CORAL}` : undefined,
        outlineOffset: "-2px",
      }}
      className="relative border-b border-r"
    >
      {ocupada && (
        <div className="absolute inset-x-1 bottom-0.5 space-y-0.5">
          <div className="h-1 w-full overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${Math.min(100, ocupacion.pct)}%`,
                backgroundColor: colorOcupacion(ocupacion.nivel),
              }}
            />
          </div>
          <p
            className="truncate text-[9px] leading-tight"
            style={{
              color: ocupacion.nivel === "sobre" ? "#D92D20" : "var(--muted-foreground)",
              fontWeight: ocupacion.nivel === "sobre" ? 600 : 400,
            }}
          >
            {ocupacion.label}
          </p>
        </div>
      )}
    </div>
  );
}
