"use client";

import { useRef, useState } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, AlertTriangle, CalendarRange, Check, CircleCheck, CircleDashed, ClipboardCheck, MoreHorizontal, MoreVertical, Trash2 } from "lucide-react";
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
import { colorTipo, semaforo, URGENCIA_ALTA_BORDE, CORAL } from "@/lib/tablero/colores";
import { partesTitulo } from "@/lib/tablero/titulo";
import { jornadasLiberables } from "@/lib/tablero/cierre";
import type { Bloque, Colocacion } from "@/lib/tablero/bloques";
import type { OtTablero } from "@/lib/tablero/tipos";

/** Cierre de la jornada visible en la tarjeta. */
export type EstadoCierre = {
  estado: "ejecutado" | "no_ejecutado";
  motivoLabel?: string | null;
};

/** Qué día del bloque se puede cerrar, o cuál ya está cerrado. */
export type AccionCierre =
  | { tipo: "cerrar"; asignacionId: number; fecha: string }
  | { tipo: "ver"; parteId: number; asignacionId: number; fecha: string }
  | null;

// Tarjeta de una asignación en la grilla. Una obra de varias jornadas es UNA tarjeta
// que abarca las celdas contiguas (grid-column: span N): se arrastra completa.
//
// Lenguaje visual (v3). Cada canal codifica UNA cosa y sólo una:
//   fondo + ícono → TIPO de OT (armado sube, desarme baja, resto neutro)
//   borde punteado + fondo transparente → tentativa (borrador, pero ocupa capacidad)
//   franja izquierda → semáforo de habilitación
//   triángulo rojo   → urgencia alta
//
// El tipo y el estado son canales INDEPENDIENTES: una tentativa de armado conserva el
// ícono y el color de texto del armado, y sólo pierde el relleno.

const ICONO_TIPO = { arriba: ArrowUp, abajo: ArrowDown, otro: MoreHorizontal } as const;

const LABEL_TIPO: Record<string, string> = {
  armado: "Armado",
  desarme: "Desarme",
};

function labelTipo(tipo: string | null | undefined): string {
  return LABEL_TIPO[tipo ?? ""] ?? "Sin tipo definido";
}

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
  compacta = false,
  vieneDeAntes = false,
  sigueDespues = false,
  cierre = null,
  vencidaSinParte = false,
}: {
  ot: OtTablero | undefined;
  bloque: Pick<Bloque, "estado" | "fraccion" | "fechas" | "multiDia">;
  compacta?: boolean;
  /** El bloque empieza antes / termina después de la semana visible. */
  vieneDeAntes?: boolean;
  sigueDespues?: boolean;
  /** Cierre de la jornada, si ya se cargó el parte. */
  cierre?: EstadoCierre | null;
  /** Alguna jornada ya pasó y sigue sin parte: reclama acción, no se atenúa. */
  vencidaSinParte?: boolean;
}) {
  const tipo = colorTipo(ot?.tipo);
  const IconoTipo = ICONO_TIPO[tipo.icono];
  const confirmada = bloque.estado === "confirmada";
  const sem = semaforo(ot?.habSemaforo);
  const urgente = ot?.urgencia === "alta";
  const partes = partesTitulo(ot?.titulo ?? "OT");
  const noEjecutada = cierre?.estado === "no_ejecutado";
  // El texto conserva el color del tipo aunque el relleno no esté: el tipo se lee igual
  // en una tentativa. Sobre el fondo blanco de la tentativa estos tonos oscuros
  // contrastan de sobra.
  const colorTexto = noEjecutada ? "#7A271A" : tipo.text;

  return (
    <div
      className={cn(
        "flex h-full min-w-0 flex-col justify-center gap-0.5 rounded-[4px] px-2 py-1",
        compacta && "shadow-md",
      )}
      style={{
        // El relleno es el canal del ESTADO: sólido = confirmada, transparente =
        // tentativa. El tono de ese relleno es el canal del TIPO.
        backgroundColor: noEjecutada ? "#FDECEA" : confirmada ? tipo.bg : "var(--card)",
        // El borde punteado rojo es el mismo lenguaje de "pendiente" del listado de
        // partes: la jornada ya pasó y nadie cargó nada.
        border: noEjecutada
          ? "1px solid #D92D20"
          : vencidaSinParte
            ? "1px dashed #D92D20"
            : confirmada
              ? "1px solid transparent"
              : "1px dashed var(--border)",
        // La franja izquierda es el semáforo de habilitación: aplica siempre y es lo que
        // más se mira. Un punto de 6px se perdía con la grilla llena.
        borderLeft: `5px solid ${noEjecutada ? "#D92D20" : sem.color}`,
      }}
    >
      <div className="flex items-baseline gap-1">
        {/* Las flechas de continuidad van EN LÍNEA y no absolutas: colgadas del borde
            se salían de la grilla y generaban scroll horizontal. */}
        {vieneDeAntes && (
          <ChevronLeft className="h-3 w-3 shrink-0 self-center" style={{ color: colorTexto }} />
        )}
        {/* El ícono de tipo va SIEMPRE, incluso en la variante compacta: es lo último que
            se sacrifica por espacio. Antes se corta el nombre. */}
        <IconoTipo
          className="h-3.5 w-3.5 shrink-0 self-center"
          style={{ color: colorTexto }}
          aria-hidden
        />
        {cierre?.estado === "ejecutado" && (
          <CircleCheck className="h-3 w-3 shrink-0 self-center" style={{ color: "#639922" }} />
        )}
        {noEjecutada && (
          <AlertTriangle className="h-3 w-3 shrink-0 self-center" style={{ color: "#D92D20" }} />
        )}
        <span
          className="min-w-0 flex-1 truncate text-[12px] font-medium leading-tight"
          style={{ color: colorTexto }}
          title={`${labelTipo(ot?.tipo)} — ${ot?.titulo ?? ""} — ${sem.label}`}
        >
          {partes.principal}
        </span>
        <span className="shrink-0 text-[11px] font-semibold tabular-nums" style={{ color: colorTexto }}>
          {bloque.multiDia ? `${bloque.fechas.length}j` : fraccionLabel(bloque.fraccion)}
        </span>
        {urgente && (
          <AlertTriangle
            className="h-3 w-3 shrink-0 self-center"
            style={{ color: URGENCIA_ALTA_BORDE }}
          />
        )}
        {sigueDespues && (
          <ChevronRight className="h-3 w-3 shrink-0 self-center" style={{ color: colorTexto }} />
        )}
      </div>

      <p
        className="truncate text-[10px] leading-tight"
        style={{ color: colorTexto, opacity: 0.75 }}
      >
        {/* El tipo ya no va en texto: lo dice el ícono, y repetirlo gastaba el ancho que
            necesita la dirección. Tampoco dice "tentativa": lo comunica el borde. */}
        {[
          partes.cliente,
          ot?.tecnico,
          noEjecutada ? (cierre?.motivoLabel ?? "no ejecutada") : null,
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
  seleccionada,
  ejecutada,
  vencidaSinParte,
  cierre,
  accionCierre,
  onCerrarJornada,
  onAbrir,
  onFraccion,
  onEditarJornadas,
  onEstado,
  onQuitar,
}: {
  bloque: Bloque;
  ot: OtTablero | undefined;
  colocacion: Colocacion;
  carril: number;
  seleccionada: boolean;
  ejecutada: boolean;
  /** Alguna jornada ya pasó sin parte cargado. */
  vencidaSinParte: boolean;
  cierre: EstadoCierre | null;
  accionCierre: AccionCierre;
  onCerrarJornada: (accion: NonNullable<AccionCierre>) => void;
  onAbrir: () => void;
  onFraccion: (f: FraccionStr) => void;
  onEditarJornadas: () => void;
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
  // El menú se ancla al botón ⋮. Si el botón se ocultara con `hidden` al salir el mouse
  // de la tarjeta —que es justo lo que pasa al ir hacia el menú— perdería su caja y el
  // popup se reubicaría en una esquina. Por eso se oculta con opacidad, que conserva el
  // layout, y se fuerza visible mientras el menú está abierto.
  const [menuAbierto, setMenuAbierto] = useState(false);
  // Al elegir una opcion, el menu se desmonta y el navegador entrega el clic al
  // elemento que quedo debajo: la tarjeta. Se ignora por un instante para que ese
  // clic residual no dispare tambien el panel de la OT.
  const menuCerradoEn = useRef(0);
  // Las jornadas ya cerradas no se tocan: sacarlas del tablero dejaría el parte
  // huérfano y borraría el rastro de lo ejecutado.
  const liberables = jornadasLiberables(bloque).length;
  const cerradas = bloque.partes.filter((p) => p != null).length;

  return (
    <div
      ref={(node) => {
        dragRef(node);
        dropRef(node);
      }}
      style={{
        gridColumn: `${colocacion.colInicio + 1} / span ${colocacion.span}`,
        gridRow: carril + 1,
        // Se atenúa lo TERMINADO, no lo pasado. Una jornada vencida sin parte queda a
        // opacidad plena: es la que reclama que alguien la cargue.
        opacity: isDragging ? 0.35 : vencidaSinParte ? 1 : ejecutada ? 0.55 : 1,
        outline: seleccionada ? `2px solid ${CORAL}` : isOver ? `2px dashed ${CORAL}` : undefined,
        outlineOffset: "-1px",
      }}
      className="group/tarjeta relative z-10 m-0.5 cursor-grab rounded-[4px] active:cursor-grabbing"
      {...attributes}
      {...listeners}
      role="button"
      tabIndex={0}
      // Con el menú abierto —o recién cerrado— la tarjeta no responde: el clic que lo
      // cierra no tiene que abrir además el panel de la OT.
      onClick={() => {
        if (menuAbierto || Date.now() - menuCerradoEn.current < 400) return;
        onAbrir();
      }}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && !menuAbierto) {
          e.preventDefault();
          onAbrir();
        }
      }}
    >
      <ContenidoTarjeta
        ot={ot}
        bloque={bloque}
        vieneDeAntes={colocacion.vieneDeAntes}
        sigueDespues={colocacion.sigueDespues}
        cierre={cierre}
        vencidaSinParte={vencidaSinParte}
      />

      <div
        className={cn(
          "absolute right-0.5 top-0.5 transition-opacity",
          menuAbierto
            ? "opacity-100"
            : "pointer-events-none opacity-0 group-hover/tarjeta:pointer-events-auto group-hover/tarjeta:opacity-100",
        )}
      >
        <DropdownMenu
          open={menuAbierto}
          onOpenChange={(abierto) => {
            setMenuAbierto(abierto);
            if (!abierto) menuCerradoEn.current = Date.now();
          }}
        >
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
          <DropdownMenuContent align="end" className="w-56">
            {/* El cierre se ofrece solo cuando la fecha ya llegó: un parte creado por
                adelantado queda huérfano si después se reprograma. */}
            {accionCierre && (
              <>
                <DropdownMenuItem onClick={() => onCerrarJornada(accionCierre)}>
                  <ClipboardCheck className="mr-2 h-4 w-4" />
                  {accionCierre.tipo === "cerrar" ? "Cerrar jornada" : "Ver parte"}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}
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

            <DropdownMenuSeparator />
            {/* Siempre disponible: es la única forma de estirar una obra de un día a
                dos, porque una vez asignada ya no está en la bandeja para re-arrastrar. */}
            <DropdownMenuItem onClick={onEditarJornadas}>
              <CalendarRange className="mr-2 h-4 w-4" />
              {bloque.multiDia
                ? `Jornadas de la obra (${bloque.fechas.length} días)`
                : "Jornadas de la obra (agregar días)"}
            </DropdownMenuItem>

            {!bloque.multiDia && (
              /* Atajo para el caso común: cambiar la fracción del único día.
                 El label necesita un Group padre; sin él, base-ui lanza al abrir. */
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
            )}

            {liberables > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onQuitar} style={{ color: CORAL }}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  {cerradas > 0
                    ? `Suspender: liberar ${liberables} jornada${liberables === 1 ? "" : "s"}`
                    : "Quitar del tablero"}
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
