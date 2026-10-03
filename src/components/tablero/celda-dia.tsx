"use client";

import type { ReactNode } from "react";
import { useDroppable } from "@dnd-kit/core";
import { CloudRain, Ban, X } from "lucide-react";
import { ocupacionCelda } from "@/lib/tablero/fracciones";
import {
  colorOcupacion,
  ACENTO_BG,
  CANALETA,
  CORAL,
  FERIADO_COLUMNA,
  PASADO,
  RIEL_OCUPACION,
  SUSPENDIDO,
} from "@/lib/tablero/colores";

// Celda cuadrilla × día: es el fondo droppable de la columna y lleva la barra de
// ocupación al pie. Ocupa el alto entero de la fila (grid-row 1 / -1), así que las
// tarjetas se dibujan encima; la última pista de la grilla queda reservada para la barra.
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
  feriado = false,
  pasada = false,
  fracciones,
  marcaNota = null,
  suspension = null,
  onQuitarSuspension,
  onCrearTarea,
}: {
  cuadrillaId: number;
  fecha: string;
  columna: number;
  esDomingo: boolean;
  /** Domingo sin trabajo: canaleta angosta, no acepta drop. */
  colapsada?: boolean;
  /** Lunes: lleva el separador de semana, que baja por toda la grilla. */
  inicioSemana?: boolean;
  /**
   * Feriado nacional: la columna se tiñe para que el día se lea de un vistazo. Es SÓLO
   * eso — la celda sigue aceptando drop y sumando capacidad como cualquier día hábil.
   */
  feriado?: boolean;
  /** Anterior a hoy: fondo apenas distinto para ver dónde corta el presente. */
  pasada?: boolean;
  fracciones: number[];
  /**
   * Marca de que ESTA cuadrilla tiene una nota este día ("arranca 10 h"). Llega armada
   * desde la grilla —es un popover— porque la celda no tiene por qué saber de notas: acá
   * sólo se le hace lugar.
   *
   * Va en la franja de abajo, que es la única parte de la celda donde no cae una tarjeta:
   * las tarjetas viven en la pista de la jornada y esta franja queda reservada para el riel.
   */
  marcaNota?: ReactNode;
  /**
   * El día se suspendió para esta cuadrilla ("correr el día"): la celda lleva una tapa
   * rayada con el motivo. Sin ella el hueco que deja el corrimiento se leía como un día
   * libre (Juan Agustín, 01/10). Es sólo marca: la celda sigue aceptando drop, y si
   * después se le asigna algo, la tarjeta se dibuja encima.
   */
  suspension?: { motivo: string; autorNombre: string | null } | null;
  /** Quitar la marca puesta por error. Las jornadas no se tocan. */
  onQuitarSuspension?: () => void;
  /**
   * Doble clic en la celda: crea una tarjeta de operaciones acá.
   *
   * DOBLE Y NO SIMPLE a propósito. La celda es zona de drop y el clic simple no hace
   * nada hoy, pero soltar una obra termina en un clic sobre la celda y abriría el
   * diálogo cada vez que alguien planifica. El doble clic es el gesto de "crear acá"
   * en cualquier calendario, y no se pisa con el arrastre.
   */
  onCrearTarea?: () => void;
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
        // El pasado lleva un velo neutro MUY tenue: sirve para ver de un vistazo dónde
        // corta el presente y nada más. No compite con el pill coral de hoy ni con los
        // estados de capacidad, porque no significa nada — sólo "esto ya fue".
        // El feriado gana sobre el velo del pasado: uno dice "esto ya fue" y el otro es
        // un dato del día que vale igual antes y después de hoy.
        backgroundColor: dropActivo
          ? ACENTO_BG
          : colapsada
            ? CANALETA
            : feriado
              ? FERIADO_COLUMNA
              : pasada
                ? PASADO
                : undefined,
        // El separador de semana recorre la altura completa: en el encabezado solo, a
        // 40px, no alcanza para ubicarse cuando se scrollea entre semanas.
        borderLeft: inicioSemana ? "2px solid var(--border)" : undefined,
        outline: dropActivo ? `2px dashed ${CORAL}` : undefined,
        outlineOffset: "-2px",
      }}
      // group/celda: la cruz de la tapa aparece al pasar por la celda (la tapa no toma el puntero).
      className="group/celda relative border-b border-r"
      // La celda colapsada (canaleta del domingo) no crea nada: no acepta drop y no
      // tiene alto para mostrar lo que se cree.
      onDoubleClick={colapsada ? undefined : onCrearTarea}
      title={!colapsada && onCrearTarea ? "Doble clic para agregar una tarea acá" : undefined}
    >
      {!colapsada && suspension && (
        <TapaSuspension
          motivo={suspension.motivo}
          autorNombre={suspension.autorNombre}
          onQuitar={onQuitarSuspension}
        />
      )}

      {/* El riel va SIEMPRE (salvo en la canaleta): una barra que aparece y desaparece
          hace saltar la línea de base de la fila al asignar. */}
      {!colapsada && (
        <div
          className="absolute bottom-1 left-1 h-1 overflow-hidden rounded-full"
          // El riel se corre cuando hay marca de nota: comparten la franja de abajo y
          // superpuestos el ícono se leía sobre la barra roja de la sobreasignación.
          style={{ right: marcaNota ? 18 : 4, backgroundColor: RIEL_OCUPACION }}
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

      {!colapsada && marcaNota}
    </div>
  );
}

/** Lluvia, viento o tormenta se pintan con el azul del clima; cualquier otro motivo, en gris. */
const ES_CLIMA = /llov|lluvi|torment|vient|granizo|clima/i;

/**
 * Opción B (JS, 02/10): rayado con borde punteado y un sello lleno con el motivo. Se eligió
 * sobre un bloque azul lleno porque en el tablero todo rectángulo lleno es una obra: el
 * rayado se ve igual de lejos y dice "acá no se trabajó" sin mezclarse con el trabajo.
 */
function TapaSuspension({
  motivo,
  autorNombre,
  onQuitar,
}: {
  motivo: string;
  autorNombre: string | null;
  onQuitar?: () => void;
}) {
  const clima = ES_CLIMA.test(motivo);
  const c = clima ? SUSPENDIDO.clima : SUSPENDIDO.otro;
  const Icono = clima ? CloudRain : Ban;
  return (
    <div
      // Encima del fondo de la celda y debajo de las tarjetas. No captura el puntero: la
      // celda sigue siendo zona de drop y de doble clic.
      className="pointer-events-none absolute inset-x-1 top-1 bottom-3 flex flex-col items-center justify-center gap-1 rounded border-2 border-dashed px-1.5 text-center"
      style={{
        borderColor: c.borde,
        backgroundColor: c.fondo,
        backgroundImage: `repeating-linear-gradient(135deg, ${c.raya} 0 8px, transparent 8px 16px)`,
      }}
      title={`Suspendido: ${motivo}${autorNombre ? ` · lo marcó ${autorNombre}` : ""}`}
    >
      <span
        className="flex max-w-full items-center gap-1.5 rounded-full py-1 pl-2 pr-2.5 text-[12px] font-bold text-white shadow-sm"
        style={{ backgroundColor: c.sello }}
      >
        <Icono className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{motivo}</span>
      </span>
      <span
        className="rounded-sm px-1 text-[9px] font-bold uppercase tracking-[0.12em]"
        style={{ backgroundColor: c.fondo, color: c.texto }}
      >
        Suspendido
      </span>
      {onQuitar && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onQuitar();
          }}
          onDoubleClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          title="Quitar la marca (las jornadas no se mueven)"
          aria-label="Quitar la marca de día suspendido"
          className="pointer-events-auto absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded opacity-0 transition-opacity hover:bg-foreground/10 focus-visible:opacity-100 group-hover/celda:opacity-100"
          style={{ color: c.texto }}
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}
