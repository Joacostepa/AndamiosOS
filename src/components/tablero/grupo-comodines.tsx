"use client";

import { useState, type ReactNode } from "react";
import { useDraggable } from "@dnd-kit/core";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { ChevronDown, ChevronRight, MapPin, Spade } from "lucide-react";
import { colorTipo, NAIPE } from "@/lib/tablero/colores";
import { TEXTO_CHIP_COMODIN, tituloComodin } from "@/lib/tablero/comodines";
import { direccionDeObra, nombrePropio } from "@/lib/tablero/titulo";
import type { Comodin } from "@/lib/tablero/guardias-tipos";
import type { OtTablero } from "@/lib/tablero/tipos";

// El grupo "Comodines (N · X j)" arriba de la bandeja (guardias-contrato.md §2.3).
//
// UN COMODÍN es una obra que Planificación MARCÓ porque puede ir cualquier día (contrato §2,
// decidido por JS el 18/10: es una decisión de cada obra, no una regla). Es lo que rellena una
// guardia que nadie usó, y lo que se mete en un hueco. La marca vive en plan_comodines; sin
// fecha ni vencimiento, es comodín hasta que alguien lo quite.
//
// INCLUYE LOS QUE YA ESTÁN EN LA GRILLA, y es a propósito: un comodín puesto el jueves sigue
// siendo un comodín —se puede adelantar a la guardia del martes si se libera— y la pregunta
// "¿qué tengo para rellenar?" tiene que contestarse en un solo lugar. Los que ya tienen
// fecha dicen dónde están hoy ("mar 21/10 · C3") y se pueden arrastrar desde acá igual que
// desde su tarjeta: el comodín SE MUEVE, no se copia. Los que no tienen fecha son la tarjeta
// de siempre de la bandeja, con el chip.
//
// ORDENADOS POR CUÁNDO SE MARCARON (el más viejo, primero): es el mismo orden que usa la
// alerta de las 13 h para proponer el relleno, así la bandeja y el aviso dicen lo mismo.
//
// UNA URGENTE SIN FECHA QUE ADEMÁS ES COMODÍN no está acá sino en "Urgentes", con el chip: la
// bandeja muestra cada obra en un solo grupo y la urgencia manda (ver panel-sin-asignar).

/** Un comodín, como lo muestra la bandeja. */
export type ComodinEnBandeja = {
  comodin: Comodin;
  ot: OtTablero;
  /** Sin fecha: le quedan jornadas por planificar y se arrastra como cualquier obra. */
  pendiente: boolean;
  /** Ya en la grilla: la tarjeta de su primer día, para ir y para arrastrarla desde acá. */
  bloqueKey: string | null;
  cuadrillaNombre: string | null;
  /** Quién la marcó (para el tooltip del chip). null si no se sabe. */
  marcadoPor: string | null;
};

const DECIMAL = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 });
const diaCorto = (f: string) => format(parseISO(f), "EEE dd/MM", { locale: es });

/**
 * El chip "comodín", con el naipe. Dice sólo eso: desde el 18/10 no hay piso ni cuenta atrás
 * que mostrar. Cuándo se marcó (y quién, si se sabe) va en el tooltip.
 */
export function ChipComodin({ comodin, marcadoPor = null }: { comodin: Comodin; marcadoPor?: string | null }) {
  return (
    <span
      className="inline-flex max-w-full shrink-0 items-center gap-0.5 whitespace-nowrap rounded-[3px] border px-[3px] text-[10px] font-semibold leading-[14px]"
      style={{ backgroundColor: NAIPE.fondo, color: NAIPE.texto, borderColor: NAIPE.borde }}
      title={tituloComodin(comodin) + (marcadoPor ? ` Lo marcó ${marcadoPor}.` : "")}
    >
      <Spade className="h-2.5 w-2.5 shrink-0" aria-hidden />
      {TEXTO_CHIP_COMODIN}
    </span>
  );
}

/** La fila de un comodín que ya está en la grilla. Se arrastra como su tarjeta. */
function FilaEnGrilla({ item, onIr }: { item: ComodinEnBandeja; onIr: (bloqueKey: string, fecha: string) => void }) {
  const { comodin: c, ot, bloqueKey, cuadrillaNombre, marcadoPor } = item;
  // Otro id que el de la tarjeta (dnd-kit no admite dos con el mismo); el board lo traduce
  // al mismo bloque, así que soltarlo es exactamente moverlo.
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({
    id: `comodin:${bloqueKey}`,
    disabled: !bloqueKey,
  });
  const tipo = colorTipo(ot.tipo);
  const donde = c.ubicacion
    ? `${diaCorto(c.ubicacion.fecha)} · ${cuadrillaNombre ? nombrePropio(cuadrillaNombre) : "sin cuadrilla"}`
    : "sin fecha";
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={() => bloqueKey && c.ubicacion && onIr(bloqueKey, c.ubicacion.fecha)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && bloqueKey && c.ubicacion) {
          e.preventDefault();
          onIr(bloqueKey, c.ubicacion.fecha);
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={`${direccionDeObra(ot)}, comodín ya planificado el ${donde}. Ir a la tarjeta o arrastrar a una guardia.`}
      className="flex cursor-grab select-none items-start gap-1.5 rounded-lg border px-2 py-1.5 text-left outline-none hover:border-foreground/25 focus-visible:ring-2 focus-visible:ring-ring/60 active:cursor-grabbing"
      style={{ opacity: isDragging ? 0.35 : 1, touchAction: "manipulation", WebkitTouchCallout: "none" }}
    >
      <Spade className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: tipo.text }} aria-hidden />
      <span className="min-w-0 flex-1 space-y-0.5">
        <span className="block truncate text-sm font-medium">{direccionDeObra(ot)}</span>
        <span className="flex flex-wrap items-center gap-x-1 gap-y-0.5 text-xs text-foreground/75">
          <ChipComodin comodin={c} marcadoPor={marcadoPor} />
          <span>hoy: {donde}</span>
          {/* Cualquier obra puede ser comodín: si no es de una jornada justa, se dice cuánto. */}
          {c.jornadas !== 1 && <span>· {DECIMAL.format(c.jornadas)} j</span>}
        </span>
      </span>
      <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
    </div>
  );
}

export function GrupoComodines({
  comodines,
  tarjeta,
  onIrABloque,
}: {
  /** Ordenados por cuándo se marcaron (el más viejo primero), sin los urgentes sin fecha. */
  comodines: ComodinEnBandeja[];
  /** La tarjeta de la bandeja para los que no tienen fecha (vive en panel-sin-asignar). */
  tarjeta: (item: ComodinEnBandeja) => ReactNode;
  onIrABloque: (bloqueKey: string, fecha: string) => void;
}) {
  const [abierto, setAbierto] = useState(true);
  if (comodines.length === 0) return null;
  const jornadas = comodines.reduce((s, x) => s + x.comodin.jornadas, 0);

  return (
    <div>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="flex w-full items-center gap-1.5 rounded px-1 py-1 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/60"
        aria-expanded={abierto}
        title="Obras que Planificación marcó como comodín: pueden ir cualquier día y sirven para rellenar una guardia o un hueco"
      >
        {abierto ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        <Spade className="h-3.5 w-3.5" aria-hidden />
        Comodines
        <span className="rounded-full bg-muted px-1.5 text-xs font-medium normal-case tracking-normal">
          {comodines.length} · {DECIMAL.format(jornadas)} j
        </span>
      </button>
      {abierto && (
        <div className="mt-1 space-y-1.5">
          {comodines.map((item) =>
            item.pendiente ? (
              <div key={item.ot.id}>{tarjeta(item)}</div>
            ) : (
              <FilaEnGrilla key={item.ot.id} item={item} onIr={onIrABloque} />
            ),
          )}
        </div>
      )}
    </div>
  );
}
