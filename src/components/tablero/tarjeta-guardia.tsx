"use client";

import { useRef, useState } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { CalendarRange, KeyRound, MoreVertical, PanelRightOpen, ShieldCheck, ShieldOff } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { CORAL, GUARDIA, RAYADO_GUARDIA } from "@/lib/tablero/colores";
import { ETIQUETA_USO, type UsoGuardia } from "@/lib/tablero/guardias-tipos";
import type { Bloque, Colocacion } from "@/lib/tablero/bloques";

// La GUARDIA en la grilla (guardias-contrato.md §1.6; la maqueta es maqueta-guardias.html).
//
// Una jornada entera de una cuadrilla propia que el sistema guarda para lo que no se puede
// prever. OCUPA LUGAR como cualquier tarjeta —por eso es una tarjeta y no una marca de la
// celda— pero no es trabajo: no tiene cliente, ni dirección, ni parte. Se dibuja así:
//
//   · bloque ÁMBAR CLARO RAYADO con borde lleno: nunca rojo, que en el tablero es "algo salió
//     mal", y una guardia es lo contrario (ver GUARDIA en colores.ts);
//   · sello "GUARDIA" y un escudo, para que se lea sin color (daltonismo, blanco y negro);
//   · "1 j" a la derecha, como cualquier tarjeta: ocupa una jornada;
//   · abajo, qué pasa si nadie la usa: "si no entra nada: Depósito", o el comodín que la
//     regla de las 13 h tiene primero en la fila. Es lo que contesta "¿y esto se pierde?".
//
// LA PALABRA "GUARDIA" ES INTERNA y está bien acá: el tablero es de Planificación. Al capataz
// le llega "Depósito · mantenimiento de material" (tareaParaCapataz en guardias.ts).
//
// Va en su propio componente y no como otra rama de TarjetaAsignacion porque no comparte
// casi nada con una obra: ni el menú (no se confirma, no se fija, no tiene jornadas de obra
// ni fracción), ni el clic (abre su ficha, no la de una OT), ni el contenido.

/** Mientras se arrastra un comodín: si puede ir acá sin pedir nada, o pidiendo a JS. */
export type DestinoGuardia = "puede" | "pide" | null;

/** El cuerpo de la tarjeta: también lo usa el fantasma del arrastre. */
export function ContenidoGuardia({
  relleno,
  unaLinea = false,
  compacta = false,
  destino = null,
}: {
  /** Qué va si nadie la usa: "Depósito" o el comodín previsto. */
  relleno: string;
  unaLinea?: boolean;
  compacta?: boolean;
  destino?: DestinoGuardia;
}) {
  return (
    <div
      className={cn(
        "flex h-full min-w-0 flex-col justify-center gap-0.5 overflow-hidden rounded-[4px] px-2",
        unaLinea ? "py-0" : "py-1",
        compacta && "shadow-md",
      )}
      style={{
        backgroundColor: GUARDIA.fondo,
        backgroundImage: RAYADO_GUARDIA,
        border: `1px solid ${GUARDIA.borde}`,
        color: GUARDIA.texto,
      }}
    >
      <div className="flex items-center gap-1">
        <ShieldCheck className="h-3.5 w-3.5 shrink-0" style={{ color: GUARDIA.sello }} aria-hidden />
        <span
          className="shrink-0 rounded-[3px] border px-1 text-[11px] font-bold uppercase leading-[14px] tracking-[0.06em]"
          style={{ backgroundColor: GUARDIA.fondo, borderColor: GUARDIA.borde, color: GUARDIA.sello }}
        >
          Guardia
        </span>
        {/* Mientras se arrastra un comodín la tarjeta dice si lo acepta, en palabras: el
            contorno solo es color, y el color solo no alcanza. */}
        {destino && (
          <span className="min-w-0 truncate text-[11px] font-semibold" style={{ color: GUARDIA.sello }}>
            {destino === "puede" ? "puede ir acá" : "pide a JS"}
          </span>
        )}
        <span className="flex-1" />
        <span className="shrink-0 whitespace-nowrap text-[11px] font-medium tabular-nums">1 j</span>
      </div>
      {!unaLinea && (
        <p className="truncate text-[11px] leading-tight">
          si no entra nada: <span className="font-semibold">{relleno}</span>
        </p>
      )}
    </div>
  );
}

/**
 * El chip "de guardia" que lleva la obra que usó una guardia (contrato §1.6: "usada o
 * rellenada: se ve la obra que la usa, con un chip 'de guardia'"). Mismo par que el sello,
 * así la marca se reconoce como de la misma familia. El para qué va en el tooltip.
 */
export function ChipDeGuardia({ uso, onAbrir }: { uso: UsoGuardia | null; onAbrir?: () => void }) {
  const clases =
    "shrink-0 self-center whitespace-nowrap rounded-[3px] border px-[3px] text-[10px] font-bold uppercase leading-[14px] tracking-[0.04em]";
  const estilo = { backgroundColor: GUARDIA.fondo, borderColor: GUARDIA.borde, color: GUARDIA.sello };
  const titulo = uso ? `Usó una guardia: ${ETIQUETA_USO[uso]}` : "Usó una guardia";
  if (!onAbrir) {
    return (
      <span className={clases} style={estilo} title={titulo}>
        de guardia
      </span>
    );
  }
  // TOCARLO ABRE LA GUARDIA, con su historia (contrato §1.6: "su historia (usada,
  // autorizaciones)"). Antes era sólo un rótulo: tocar la obra abre la ficha de la OT, que no
  // dice nada de la guardia, y una guardia usada no está en la grilla para tocarla. No arrastra
  // ni abre la tarjeta de abajo: corta el puntero y el clic.
  return (
    <button
      type="button"
      className={cn(clases, "cursor-pointer hover:underline focus-visible:outline-2 focus-visible:outline-offset-1")}
      style={estilo}
      title={`${titulo}. Ver la guardia`}
      aria-label={`${titulo}. Ver la guardia`}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onAbrir();
      }}
    >
      de guardia
    </button>
  );
}

/** Por debajo de esto entra un solo renglón (mismo corte que TarjetaAsignacion). */
const ALTO_DOS_LINEAS = 40;
const SEPARACION = 3;
const ALTO_MINIMO = 18;

export function TarjetaGuardia({
  bloque,
  colocacion,
  top,
  alto,
  etiqueta,
  relleno,
  seleccionada,
  destino = null,
  atenuada = false,
  puedeAutorizar,
  editable = true,
  onAbrir,
  onCorrer,
  onPedirSacar,
  onSacar,
}: {
  bloque: Bloque;
  colocacion: Colocacion;
  top: number;
  alto: number;
  /** "Guardia de la C3 el jue 22 oct", para el lector de pantalla. */
  etiqueta: string;
  relleno: string;
  seleccionada: boolean;
  /** Mientras se arrastra un comodín u otra obra: si esta guardia lo acepta. */
  destino?: DestinoGuardia;
  /** Mientras se arrastra algo que no puede ir acá. */
  atenuada?: boolean;
  /** JS ve "Sacar" directo; los demás, "Pedir autorización". */
  puedeAutorizar: boolean;
  /**
   * false en una guardia de un día que ya pasó (sigue activa hasta que la corrida de las 13 h
   * la cierra como depósito): el menú no ofrece correrla ni sacarla, igual que la ficha.
   */
  editable?: boolean;
  onAbrir: () => void;
  /** Abre la ficha en la parte de correrla. */
  onCorrer: () => void;
  onPedirSacar: () => void;
  onSacar: () => void;
}) {
  // Recién corrida o recién vuelta del deshacer: todavía con id temporal no hay nada que tocar.
  const guardando = bloque.ids.some((id) => id < 0);
  const altoReal = Math.max(alto - SEPARACION, ALTO_MINIMO);
  const { setNodeRef: dragRef, attributes, listeners, isDragging } = useDraggable({
    id: `bloque:${bloque.key}`,
    data: { bloque },
    disabled: guardando,
  });
  // También es destino: soltar una obra encima es USAR la guardia (el board decide si se puede).
  const { setNodeRef: dropRef, isOver } = useDroppable({ id: `tarjeta:${bloque.key}`, data: { bloque } });
  const [menuAbierto, setMenuAbierto] = useState(false);
  const menuCerradoEn = useRef(0);

  return (
    <div
      ref={(node) => {
        dragRef(node);
        dropRef(node);
      }}
      style={{
        gridColumn: `${colocacion.colInicio + 1} / span ${colocacion.span}`,
        gridRow: 1,
        alignSelf: "start",
        marginTop: top,
        height: altoReal,
        opacity: isDragging ? 0.35 : atenuada ? 0.4 : 1,
        // El destino válido se dice con el contorno del sello (y en palabras adentro); el
        // coral sigue siendo "seleccionada" y "acá caés", como en cualquier tarjeta.
        outline: seleccionada
          ? `2px solid ${CORAL}`
          : isOver
            ? `2px dashed ${CORAL}`
            : destino === "puede"
              ? `2px solid ${GUARDIA.sello}`
              : destino === "pide"
                ? `2px dashed ${GUARDIA.sello}`
                : undefined,
        outlineOffset: "-1px",
        touchAction: "manipulation",
        WebkitTouchCallout: "none",
      }}
      className={cn(
        "group/tarjeta relative z-10 mx-0.5 select-none rounded-[4px] transition-opacity",
        guardando ? "cursor-progress" : "cursor-grab active:cursor-grabbing",
      )}
      {...attributes}
      {...listeners}
      role="button"
      tabIndex={0}
      aria-label={`${etiqueta}. Lugar guardado para lo imprevisto; si no entra nada, ${relleno}. Abrir la guardia o arrastrar para correrla.`}
      title="Guardia: lugar guardado para lo que no se puede prever"
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
      <ContenidoGuardia relleno={relleno} unaLinea={altoReal < ALTO_DOS_LINEAS} destino={destino} />

      <div
        className={cn(
          "absolute right-0.5 top-0.5 transition-opacity",
          guardando && "hidden",
          menuAbierto
            ? "opacity-100"
            : "pointer-events-none opacity-0 group-hover/tarjeta:pointer-events-auto group-hover/tarjeta:opacity-100 group-focus-within/tarjeta:pointer-events-auto group-focus-within/tarjeta:opacity-100 [@media(hover:none)]:pointer-events-auto [@media(hover:none)]:opacity-100",
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
                onKeyDown={(e) => e.stopPropagation()}
                className="rounded bg-card/80 p-0.5 text-foreground/80 hover:bg-card hover:text-foreground"
                aria-label="Opciones de la guardia"
              />
            }
          >
            <MoreVertical className="h-3 w-3" />
          </DropdownMenuTrigger>
          {/* LO QUE CADA UNO PUEDE HACER, y nada más (contrato §1.3 y §1.6): correrla dentro
              de la semana lo puede Planificación sin pedir nada; sacarla, sólo JS. Al resto
              se le ofrece pedirlo, no un botón que rebota. */}
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuItem onClick={onAbrir}>
              <PanelRightOpen className="mr-2 h-4 w-4" />
              Ver la guardia
            </DropdownMenuItem>
            {editable && (
              <>
                <DropdownMenuItem onClick={onCorrer}>
                  <CalendarRange className="mr-2 h-4 w-4" />
                  Correrla a otro día o cuadrilla…
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {puedeAutorizar ? (
                  <DropdownMenuItem onClick={onSacar} style={{ color: CORAL }}>
                    <ShieldOff className="mr-2 h-4 w-4" />
                    Sacar la guardia…
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onClick={onPedirSacar}>
                    <KeyRound className="mr-2 h-4 w-4" />
                    Pedir autorización para sacarla…
                  </DropdownMenuItem>
                )}
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
