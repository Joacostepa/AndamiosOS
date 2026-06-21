"use client";

import { useState } from "react";
import { useDraggable } from "@dnd-kit/core";
import { GripVertical, Lock, Check, ChevronDown, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { TIPO_OT_TOKENS } from "@/lib/planificacion/colores";
import { tipoOtKey } from "@/lib/planificacion/estado";
import { jornadaArrastrable, indiceSiguienteSugerida, contarAsignadas } from "@/lib/planificacion/jornadas";
import type { ColaOT, JornadaColaRow } from "@/hooks/use-planificacion";

function TipoBadge({ ot }: { ot: ColaOT }) {
  const t = TIPO_OT_TOKENS[tipoOtKey(ot.tipo, ot.es_adicional)];
  return (
    <span className="rounded px-1.5 py-0.5 text-[9px] font-medium" style={{ backgroundColor: t.bg, color: t.text }}>
      {t.label}
    </span>
  );
}

// Grupo de una OT habilitada con sus jornadas anidadas.
export function QueueGroup({
  ot,
  jornadas,
  onAsignarFueraDeOrden,
}: {
  ot: ColaOT;
  jornadas: JornadaColaRow[];
  onAsignarFueraDeOrden: (ot: ColaOT, jornada: JornadaColaRow) => void;
}) {
  const [open, setOpen] = useState(true);
  const orden = [...jornadas].sort((a, b) => a.numero - b.numero);
  const total = orden.length;
  const asignadas = contarAsignadas(orden);
  const iSiguiente = indiceSiguienteSugerida(orden);

  return (
    <div className="rounded-md border bg-card">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-start gap-1 p-2 text-left"
      >
        {open ? <ChevronDown className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" /> : <ChevronRight className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />}
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-1">
            <p className="min-w-0 truncate text-[11px] font-medium">{ot.obras?.nombre ?? ot.codigo}</p>
            <TipoBadge ot={ot} />
          </div>
          <p className="text-[9px] text-muted-foreground">
            {total} jornadas · {asignadas} asignadas
          </p>
        </div>
      </button>

      {open && (
        <div className="space-y-1 px-2 pb-2">
          {orden.map((j, i) => (
            <JornadaRow
              key={j.id}
              ot={ot}
              jornada={j}
              arrastrable={jornadaArrastrable(orden, i)}
              esSiguiente={i === iSiguiente}
              onClickBloqueada={() => onAsignarFueraDeOrden(ot, j)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function JornadaRow({
  ot,
  jornada,
  arrastrable,
  esSiguiente,
  onClickBloqueada,
}: {
  ot: ColaOT;
  jornada: JornadaColaRow;
  arrastrable: boolean;
  esSiguiente: boolean;
  onClickBloqueada: () => void;
}) {
  const asignada = jornada.estado !== "pendiente";
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `jornada:${jornada.id}`,
    data: { ot, jornada },
    disabled: !arrastrable,
  });

  if (asignada) {
    const dia = jornada.asignacion?.fecha
      ? format(new Date(`${jornada.asignacion.fecha}T00:00:00`), "EEE d", { locale: es })
      : null;
    return (
      <div className="flex items-center gap-2 rounded px-1 py-0.5 opacity-40">
        <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: "#EAF3DE", color: "#3B6D11" }}>
          <Check className="h-3 w-3" />
        </span>
        <span className="text-[10px] line-through">Jornada {jornada.numero}{dia ? ` · ${dia}` : ""}</span>
      </div>
    );
  }

  if (!arrastrable) {
    return (
      <button
        type="button"
        onClick={onClickBloqueada}
        className="flex w-full cursor-not-allowed items-center gap-2 rounded px-1 py-0.5 opacity-45"
        title="Esta jornada aún no tiene las anteriores asignadas"
      >
        <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border text-[10px]">
          {jornada.numero}
        </span>
        <span className="text-[10px]">Jornada {jornada.numero}</span>
        <Lock className="ml-auto h-3 w-3 text-muted-foreground" />
      </button>
    );
  }

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={cn("flex cursor-grab items-center gap-2 rounded px-1 py-0.5 hover:bg-muted/50", isDragging && "opacity-40")}
    >
      <span
        className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border text-[10px] font-medium"
        style={esSiguiente ? { borderColor: "#D85A30", color: "#D85A30" } : undefined}
      >
        {jornada.numero}
      </span>
      <span className="text-[10px]">Jornada {jornada.numero}</span>
      {esSiguiente && <span className="text-[9px] font-medium" style={{ color: "#D85A30" }}>← siguiente</span>}
      <GripVertical className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
    </div>
  );
}

// Grupo de OT pendiente de habilitación: bloqueado, sin jornadas arrastrables.
export function BlockedGroup({ ot }: { ot: ColaOT }) {
  return (
    <div className="rounded-md border bg-card p-2 opacity-60" title="Habilitaciones aún no aprobó esta OT">
      <div className="flex items-center justify-between gap-1">
        <p className="min-w-0 truncate text-[11px] font-medium">{ot.obras?.nombre ?? ot.codigo}</p>
        <Lock className="h-3 w-3 shrink-0 text-muted-foreground" />
      </div>
      <div className="mt-1 flex items-center gap-1.5">
        <TipoBadge ot={ot} />
        <span className="text-[9px] text-muted-foreground">Esperando hab.</span>
      </div>
    </div>
  );
}
