"use client";

import { useDraggable, useDroppable } from "@dnd-kit/core";
import { ChevronLeft, ChevronRight, Check, CircleDashed, MoreVertical, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { FRACCIONES, fraccionLabel, type FraccionStr } from "@/lib/tablero/fracciones";
import { colorCuadrilla, semaforo, URGENCIA_ALTA_BORDE, CORAL } from "@/lib/tablero/colores";
import { partesTitulo } from "@/lib/tablero/titulo";
import type { Bloque, Colocacion } from "@/lib/tablero/bloques";
import type { OtTablero } from "@/lib/tablero/tipos";

// Tarjeta de una asignación en la grilla. Una obra de varias jornadas es UNA tarjeta
// que abarca las celdas contiguas (grid-column: span N): se arrastra completa.
//
// Lenguaje visual (spec §2):
//   confirmada → fondo sólido con el color de la cuadrilla
//   tentativa  → borde punteado y fondo transparente (borrador, pero ocupa capacidad)
//   urgencia alta → franja roja a la izquierda
//   habilitación  → punto de color en la esquina

/**
 * Cuerpo de la tarjeta. Densidad pensada para que entren 3 o 4 apiladas en una celda:
 * una línea con dirección y fracción, otra con tipo y técnico. La habilitación y la
 * urgencia son señales de color, sin texto que compita por el ancho.
 *
 * El bloque multi-jornada afloja la densidad: tiene todo el ancho de sus días.
 */
export function ContenidoTarjeta({
  ot,
  bloque,
  indiceColor,
  compacta = false,
  vieneDeAntes = false,
  sigueDespues = false,
}: {
  ot: OtTablero | undefined;
  bloque: Pick<Bloque, "estado" | "fraccion" | "fechas" | "multiDia">;
  indiceColor: number;
  compacta?: boolean;
  /** El bloque empieza antes / termina después de la semana visible. */
  vieneDeAntes?: boolean;
  sigueDespues?: boolean;
}) {
  const color = colorCuadrilla(indiceColor);
  const confirmada = bloque.estado === "confirmada";
  const sem = semaforo(ot?.habSemaforo);
  const urgente = ot?.urgencia === "alta";
  const partes = partesTitulo(ot?.titulo ?? "OT");

  return (
    <div
      className={cn(
        "flex h-full min-w-0 flex-col justify-center gap-px rounded-[4px] px-1.5 py-0.5",
        compacta && "shadow-md",
      )}
      style={{
        backgroundColor: confirmada ? color.bg : color.suave,
        border: confirmada ? `1px solid ${color.borde}` : `1px dashed ${color.borde}`,
        borderLeft: urgente ? `3px solid ${URGENCIA_ALTA_BORDE}` : `3px solid ${color.borde}`,
      }}
    >
      <div className="flex items-baseline gap-1">
        {/* Las flechas de continuidad van EN LÍNEA y no absolutas: colgadas del borde
            se salían de la grilla y generaban scroll horizontal. */}
        {vieneDeAntes && (
          <ChevronLeft className="h-3 w-3 shrink-0 self-center" style={{ color: color.text }} />
        )}
        <span
          className="min-w-0 flex-1 truncate text-[11px] font-medium leading-tight"
          style={{ color: color.text }}
          title={ot?.titulo}
        >
          {partes.principal}
        </span>
        <span className="shrink-0 text-[10px] font-semibold tabular-nums" style={{ color: color.text }}>
          {bloque.multiDia ? `${bloque.fechas.length}j` : fraccionLabel(bloque.fraccion)}
        </span>
        <span
          className="h-1.5 w-1.5 shrink-0 self-center rounded-full"
          style={{ backgroundColor: sem.color }}
          title={sem.label}
        />
        {sigueDespues && (
          <ChevronRight className="h-3 w-3 shrink-0 self-center" style={{ color: color.text }} />
        )}
      </div>

      <p className="truncate text-[9px] leading-tight" style={{ color: color.text, opacity: 0.75 }}>
        {[
          partes.tipo,
          bloque.multiDia && partes.cliente ? partes.cliente : null,
          ot?.tecnico,
          confirmada ? null : "tentativa",
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
    </div>
  );
}

export function TarjetaAsignacion({
  bloque,
  ot,
  colocacion,
  carril,
  indiceColor,
  seleccionada,
  ejecutada,
  onAbrir,
  onFraccion,
  onEstado,
  onQuitar,
}: {
  bloque: Bloque;
  ot: OtTablero | undefined;
  colocacion: Colocacion;
  carril: number;
  indiceColor: number;
  seleccionada: boolean;
  ejecutada: boolean;
  onAbrir: () => void;
  onFraccion: (f: FraccionStr) => void;
  onEstado: (e: "tentativa" | "confirmada") => void;
  onQuitar: () => void;
}) {
  const { setNodeRef: dragRef, attributes, listeners, isDragging } = useDraggable({
    id: `bloque:${bloque.key}`,
    data: { bloque },
  });
  // La tarjeta también es zona de drop: soltar sobre ella reordena el día.
  const { setNodeRef: dropRef, isOver } = useDroppable({
    id: `tarjeta:${bloque.key}`,
    data: { bloque },
  });

  return (
    <div
      ref={(node) => {
        dragRef(node);
        dropRef(node);
      }}
      style={{
        gridColumn: `${colocacion.colInicio + 1} / span ${colocacion.span}`,
        gridRow: carril + 1,
        opacity: isDragging ? 0.35 : ejecutada ? 0.75 : 1,
        outline: seleccionada ? `2px solid ${CORAL}` : isOver ? `2px dashed ${CORAL}` : undefined,
        outlineOffset: "-1px",
      }}
      className="group/tarjeta relative z-10 m-0.5 cursor-grab rounded-[4px] active:cursor-grabbing"
      {...attributes}
      {...listeners}
      role="button"
      tabIndex={0}
      onClick={onAbrir}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onAbrir();
        }
      }}
    >
      <ContenidoTarjeta
        ot={ot}
        bloque={bloque}
        indiceColor={indiceColor}
        vieneDeAntes={colocacion.vieneDeAntes}
        sigueDespues={colocacion.sigueDespues}
      />

      <div className="absolute right-0.5 top-0.5 hidden group-hover/tarjeta:block">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                className="rounded bg-white/70 p-0.5 text-foreground/70 hover:bg-white hover:text-foreground"
                aria-label="Opciones de la asignación"
              />
            }
          >
            <MoreVertical className="h-3 w-3" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem
              onClick={() => onEstado(bloque.estado === "confirmada" ? "tentativa" : "confirmada")}
            >
              {bloque.estado === "confirmada" ? (
                <CircleDashed className="mr-2 h-4 w-4" />
              ) : (
                <Check className="mr-2 h-4 w-4" />
              )}
              {bloque.estado === "confirmada" ? "Volver a tentativa" : "Confirmar"}
            </DropdownMenuItem>

            {!bloque.multiDia && (
              <>
                <DropdownMenuSeparator />
                {/* El label necesita un Group padre: sin el, base-ui lanza al abrir. */}
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Fracción de jornada</DropdownMenuLabel>
                  {FRACCIONES.map((f) => (
                    <DropdownMenuItem key={f.value} onClick={() => onFraccion(f.value)}>
                      <span className="mr-2 w-4 text-center">{f.label}</span>
                      {f.detalle}
                      {Number(f.value) === bloque.fraccion && <Check className="ml-auto h-3.5 w-3.5" />}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
              </>
            )}

            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onQuitar} style={{ color: CORAL }}>
              <Trash2 className="mr-2 h-4 w-4" />
              Quitar del tablero
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
