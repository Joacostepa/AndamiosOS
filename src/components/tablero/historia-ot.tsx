"use client";

import { useState } from "react";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { ArrowRight, ChevronRight, CircleCheck, CircleDashed, Plus, Trash2, Undo2 } from "lucide-react";
import { useActividadDeOt } from "@/hooks/use-actividad";
import { useConfirmaciones } from "@/hooks/use-confirmaciones";
import { CORAL, INACTIVO, OK, PELIGRO } from "@/lib/tablero/colores";
import { cuando, fraseMovimiento, type Movimiento } from "@/lib/tablero/tipos-movimiento";
import type { Confirmacion } from "@/lib/tablero/tipos-confirmacion";

// Qué le pasó a ESTA obra: de qué día se movió, quién la planificó, quién la confirmó o la
// devolvió a tentativa, quién le sacó jornadas.
//
// UNA SOLA LÍNEA DE TIEMPO, aunque los datos vivan en dos tablas (plan_movimientos y
// plan_confirmaciones, por razones históricas). Antes eran dos listas con dos formatos de
// fecha ("8 oct, 10:39" arriba, "hoy 10:40" abajo) que contaban el mismo gesto dos veces:
// quitar una obra confirmada deja una vuelta a tentativa y un "quitó del tablero" con un
// minuto de diferencia. Leídas por separado, la de arriba parecía el estado actual.
//
// PLEGADA, CON EL ÚLTIMO EVENTO A LA VISTA. El estado vigente ya lo dice la línea de estado
// del encabezado; esto contesta "¿por qué está así?", y para eso alcanza casi siempre con lo
// último que pasó. El resto queda a un clic.
//
// NO SE MUESTRA CUANDO NO HAY NADA. Las obras planificadas antes de que existiera el
// registro no tienen historia, y un "sin movimientos" en cada ficha sería ruido permanente
// por algo que se llena solo con el uso.

type Evento =
  | { clave: string; fecha: string; tipo: "movimiento"; m: Movimiento }
  | { clave: string; fecha: string; tipo: "confirmacion"; c: Confirmacion };

function Icono({ e }: { e: Evento }) {
  const clase = "mt-0.5 h-3.5 w-3.5 shrink-0";
  if (e.tipo === "confirmacion") {
    return e.c.estado === "confirmada"
      ? <CircleCheck className={clase} style={{ color: OK }} />
      : <CircleDashed className={clase} style={{ color: INACTIVO }} />;
  }
  const m = e.m;
  if (m.deshaceA) return <Undo2 className={clase} style={{ color: INACTIVO }} />;
  if (m.accion === "crear") return <Plus className={clase} style={{ color: OK }} />;
  if (m.accion === "quitar") return <Trash2 className={clase} style={{ color: PELIGRO }} />;
  return <ArrowRight className={clase} style={{ color: CORAL }} />;
}

function Texto({ e }: { e: Evento }) {
  if (e.tipo === "confirmacion") {
    const c = e.c;
    return (
      <>
        {c.estado === "confirmada" ? "Confirmó" : "Volvió a tentativa"}
        {c.fecha && ` la jornada del ${format(parseISO(c.fecha), "d MMM", { locale: es })}`}
      </>
    );
  }
  // Tachado y no escondido: que alguien se haya equivocado y lo haya corregido también es
  // información, y esconderlo dejaría un salto inexplicable.
  return <span style={e.m.deshecho ? { textDecoration: "line-through" } : undefined}>{fraseMovimiento(e.m)}</span>;
}

function Linea({ e }: { e: Evento }) {
  const autor = e.tipo === "confirmacion" ? e.c.autorNombre : e.m.autorNombre;
  return (
    <li className="flex gap-2">
      <Icono e={e} />
      <div className="min-w-0 text-[13px] leading-snug">
        <p><Texto e={e} /></p>
        <p className="text-xs text-muted-foreground">
          {autor ?? "—"} · {cuando(e.fecha)}
        </p>
      </div>
    </li>
  );
}

export function HistoriaOt({ otId }: { otId: number }) {
  const { data: actividad } = useActividadDeOt(otId);
  const { data: confirmaciones } = useConfirmaciones(otId);
  const [abierta, setAbierta] = useState(false);

  const eventos: Evento[] = [
    ...(actividad ?? []).flatMap((a): Evento[] =>
      a.tipo === "movimiento"
        ? [{ clave: `m${a.movimiento.id}`, fecha: a.movimiento.createdAt, tipo: "movimiento", m: a.movimiento }]
        : [],
    ),
    ...(confirmaciones ?? []).map((c): Evento => ({ clave: `c${c.id}`, fecha: c.createdAt, tipo: "confirmacion", c })),
  ].sort((a, b) => b.fecha.localeCompare(a.fecha));

  if (eventos.length === 0) return null;
  const mostrados = abierta ? eventos : eventos.slice(0, 1);

  return (
    <section className="space-y-2.5 border-t pt-3.5">
      <button
        type="button"
        onClick={() => setAbierta((v) => !v)}
        aria-expanded={abierta}
        className="flex w-full items-center gap-2 text-left"
      >
        <ChevronRight
          className="h-3.5 w-3.5 text-muted-foreground transition-transform"
          style={{ transform: abierta ? "rotate(90deg)" : undefined }}
        />
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Historia</span>
        {eventos.length > 1 && (
          <span className="text-xs text-muted-foreground">
            {abierta ? "ocultar" : `${eventos.length} eventos · ver todos`}
          </span>
        )}
      </button>
      <ul className="ml-5.5 space-y-2">
        {mostrados.map((e) => <Linea key={e.clave} e={e} />)}
      </ul>
    </section>
  );
}
