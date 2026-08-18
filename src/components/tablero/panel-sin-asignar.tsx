"use client";

import { useMemo, useState } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { PanelRightClose, PanelRightOpen, Search, Inbox } from "lucide-react";
import { Input } from "@/components/ui/input";
import { semaforo, CORAL, ACENTO_BG, URGENCIA_ALTA_BORDE } from "@/lib/tablero/colores";
import { fraccionLabel } from "@/lib/tablero/fracciones";
import { partesTitulo, normalizar } from "@/lib/tablero/titulo";
import type { OtTablero } from "@/lib/tablero/tipos";

// Panel lateral de obras sin asignar. Es una COLUMNA y no una franja horizontal
// porque la tarjeta de obra es vertical por naturaleza: en la franja, la dirección
// —que es lo que Operaciones usa para identificar la obra— quedaba siempre cortada.
//
// Se arrastra desde acá a una celda de la grilla; soltar una tarjeta de la grilla acá
// la devuelve a la bandeja.

export const ID_BANDEJA = "bandeja";

function TarjetaOt({ ot }: { ot: OtTablero }) {
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({
    id: `ot:${ot.id}`,
    data: { ot },
  });
  const sem = semaforo(ot.habSemaforo);
  const urgente = ot.urgencia === "alta";
  const partes = partesTitulo(ot.titulo);

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className="cursor-grab rounded-md border bg-card p-2 transition-colors hover:border-foreground/25 active:cursor-grabbing"
      style={{
        opacity: isDragging ? 0.35 : 1,
        borderLeft: urgente ? `3px solid ${URGENCIA_ALTA_BORDE}` : undefined,
      }}
    >
      <div className="flex items-start gap-1.5">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {partes.tipo ?? "OT"}
            {partes.numero ? ` · ${partes.numero}` : ""}
          </p>
          {partes.cliente && (
            <p className="truncate text-[11px] text-muted-foreground" title={partes.cliente}>
              {partes.cliente}
            </p>
          )}
          {/* La dirección entra completa: para eso el panel es vertical. */}
          <p className="text-[12px] font-medium leading-snug">{partes.principal}</p>
        </div>
        <span
          className="mt-1 h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: sem.color }}
          title={sem.label}
        />
      </div>

      <p className="mt-1 truncate text-[10px] text-muted-foreground">
        {ot.jornadas >= 1
          ? `${ot.jornadas} jornada${ot.jornadas === 1 ? "" : "s"}`
          : `${fraccionLabel(ot.jornadas)} de jornada`}
        {ot.tecnico ? ` · ${ot.tecnico}` : ""}
        {ot.fechaProgramada
          ? ` · prev. ${format(parseISO(ot.fechaProgramada), "d MMM", { locale: es })}`
          : ""}
      </p>
    </div>
  );
}

export function PanelSinAsignar({
  ots,
  colapsado,
  onColapsar,
}: {
  ots: OtTablero[];
  colapsado: boolean;
  onColapsar: (valor: boolean) => void;
}) {
  const [busqueda, setBusqueda] = useState("");
  const { setNodeRef, isOver, active } = useDroppable({ id: ID_BANDEJA });
  const soltando = isOver && String(active?.id ?? "").startsWith("bloque:");

  const filtradas = useMemo(() => {
    const orden = [...ots].sort((a, b) => {
      if ((a.urgencia === "alta") !== (b.urgencia === "alta")) return a.urgencia === "alta" ? -1 : 1;
      return (a.fechaProgramada ?? "9999").localeCompare(b.fechaProgramada ?? "9999");
    });
    const q = normalizar(busqueda.trim());
    if (!q) return orden;
    // Con 46 obras, encontrar una puntual escaneando no funciona.
    return orden.filter((o) => normalizar(`${o.titulo} ${o.tecnico ?? ""}`).includes(q));
  }, [ots, busqueda]);

  if (colapsado) {
    return (
      <div className="flex w-11 shrink-0 flex-col items-center gap-2 border-l py-2">
        <button
          type="button"
          onClick={() => onColapsar(false)}
          className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          title="Mostrar obras sin asignar"
          aria-label="Mostrar obras sin asignar"
        >
          <PanelRightOpen className="h-4 w-4" />
        </button>
        <span
          className="rounded-full px-1.5 text-[11px] font-medium"
          style={{ backgroundColor: "#FAEEDA", color: "#854F0B" }}
        >
          {ots.length}
        </span>
        <span className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground [writing-mode:vertical-rl]">
          Sin asignar
        </span>
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      className="flex w-[300px] shrink-0 flex-col border-l transition-colors"
      style={{
        backgroundColor: soltando ? ACENTO_BG : undefined,
        outline: soltando ? `2px dashed ${CORAL}` : undefined,
        outlineOffset: "-4px",
      }}
    >
      <div className="flex items-center gap-2 border-b px-2.5 py-2">
        <Inbox className="h-3.5 w-3.5 text-muted-foreground" />
        <p className="text-[11px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
          Sin asignar
        </p>
        <span
          className="rounded-full px-1.5 text-[11px] font-medium"
          style={{ backgroundColor: "#FAEEDA", color: "#854F0B" }}
        >
          {filtradas.length === ots.length ? ots.length : `${filtradas.length}/${ots.length}`}
        </span>
        <button
          type="button"
          onClick={() => onColapsar(true)}
          className="ml-auto rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          title="Ocultar panel"
          aria-label="Ocultar panel"
        >
          <PanelRightClose className="h-4 w-4" />
        </button>
      </div>

      <div className="relative border-b px-2.5 py-2">
        <Search className="absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar obra, cliente o técnico…"
          className="h-7 pl-7 text-[12px]"
        />
      </div>

      {soltando && (
        <p className="px-2.5 py-1.5 text-[11px]" style={{ color: CORAL }}>
          Soltá para devolver la obra a sin asignar
        </p>
      )}

      {filtradas.length > 0 ? (
        <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-2">
          {filtradas.map((ot) => (
            <TarjetaOt key={ot.id} ot={ot} />
          ))}
        </div>
      ) : (
        <p className="flex flex-1 items-center justify-center px-4 text-center text-[11px] text-muted-foreground">
          {ots.length === 0 ? "No quedan obras sin asignar." : "Ninguna obra coincide con la búsqueda."}
        </p>
      )}
    </div>
  );
}
