"use client";

import { useState, type ReactNode } from "react";
import { useDraggable } from "@dnd-kit/core";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { ChevronDown, ChevronRight, MapPin, Spade } from "lucide-react";
import { colorTipo, NAIPE, PELIGRO, PELIGRO_SUAVE, PELIGRO_TEXTO } from "@/lib/tablero/colores";
import { textoChipComodin } from "@/lib/tablero/comodines";
import { direccionDeObra, nombrePropio } from "@/lib/tablero/titulo";
import type { Comodin } from "@/lib/tablero/guardias-tipos";
import type { OtTablero } from "@/lib/tablero/tipos";

// El grupo "Comodines (N · X j)" arriba de la bandeja (guardias-contrato.md §2.3).
//
// UN COMODÍN es un desarme de una jornada o menos que ya puede ir cualquier día: el cliente
// lo pidió "a partir de" una fecha y esa fecha ya llegó. Es lo que rellena una guardia que
// nadie usó, y lo que se mete en un hueco. Se calcula (comodines.ts), no se guarda.
//
// INCLUYE LOS QUE YA ESTÁN EN LA GRILLA, y es a propósito: un comodín puesto el jueves sigue
// siendo un comodín —se puede adelantar a la guardia del martes si se libera— y la pregunta
// "¿qué tengo para rellenar?" tiene que contestarse en un solo lugar. Los que ya tienen
// fecha dicen dónde están hoy ("mar 21/10 · C3") y se pueden arrastrar desde acá igual que
// desde su tarjeta: el comodín SE MUEVE, no se copia. Los que no tienen fecha son la tarjeta
// de siempre de la bandeja, con el chip.
//
// ORDENADOS POR CUÁNTO ESPERAN (el que más espera, primero): es el mismo orden que usa la
// alerta de las 13 h para proponer el relleno, así la bandeja y el aviso dicen lo mismo.
//
// LOS VENCIDOS NO ESTÁN ACÁ: pasados 7 días hábiles dejan de ser comodín y la bandeja los
// muestra con las urgentes ("Esperando hace 8 días hábiles", en rojo).

/** Un comodín, como lo muestra la bandeja. */
export type ComodinEnBandeja = {
  comodin: Comodin;
  ot: OtTablero;
  /** Sin fecha: le quedan jornadas por planificar y se arrastra como cualquier obra. */
  pendiente: boolean;
  /** Ya en la grilla: la tarjeta de su primer día, para ir y para arrastrarla desde acá. */
  bloqueKey: string | null;
  cuadrillaNombre: string | null;
};

const DECIMAL = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 });
const ddmm = (f: string) => format(parseISO(f), "dd/MM", { locale: es });
const diaCorto = (f: string) => format(parseISO(f), "EEE dd/MM", { locale: es });

/** El chip "comodín · desde 20/10" (o "quedan 2 d"), con el naipe. Rojo si ya venció. */
export function ChipComodin({ comodin, compacto = false }: { comodin: Comodin; compacto?: boolean }) {
  const texto = textoChipComodin(comodin);
  const vencido = comodin.vencido;
  return (
    <span
      className="inline-flex max-w-full shrink-0 items-center gap-0.5 whitespace-nowrap rounded-[3px] border px-[3px] text-[10px] font-semibold leading-[14px]"
      style={
        vencido
          ? { backgroundColor: PELIGRO_SUAVE, color: PELIGRO_TEXTO, borderColor: PELIGRO }
          : { backgroundColor: NAIPE.fondo, color: NAIPE.texto, borderColor: NAIPE.borde }
      }
      title={
        vencido
          ? `${texto}: ya no es comodín, va como urgente. El cliente la pidió desde el ${ddmm(comodin.piso)}.`
          : `Desarme que ya puede ir cualquier día (desde el ${ddmm(comodin.piso)}${
              comodin.pisoDeCreacion ? ", el día que se cargó" : ""
            }). Lleva ${comodin.espera} día${comodin.espera === 1 ? "" : "s"} hábil${comodin.espera === 1 ? "" : "es"} esperando.`
      }
    >
      <Spade className="h-2.5 w-2.5 shrink-0" aria-hidden />
      {compacto ? (vencido ? `${comodin.espera} d` : "comodín") : texto}
    </span>
  );
}

/** La fila de un comodín que ya está en la grilla. Se arrastra como su tarjeta. */
function FilaEnGrilla({ item, onIr }: { item: ComodinEnBandeja; onIr: (bloqueKey: string, fecha: string) => void }) {
  const { comodin: c, ot, bloqueKey, cuadrillaNombre } = item;
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
          <ChipComodin comodin={c} />
          <span>hoy: {donde}</span>
          {c.jornadas < 1 && <span>· {DECIMAL.format(c.jornadas)} j</span>}
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
  /** Ya sin los vencidos y ordenados por espera (el que más espera primero). */
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
        title="Desarmes de una jornada o menos que ya pueden ir cualquier día: sirven para rellenar una guardia o un hueco"
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
