"use client";

import { format, isSameDay, getISOWeek } from "date-fns";
import { es } from "date-fns/locale";
import { Users, Truck } from "lucide-react";
import { RecursoAvatar } from "./recurso-avatar";
import { semanasDelMes } from "@/lib/planificacion/mes";
import { capacidadCuadrilla, HORAS_NETAS } from "@/lib/planificacion/jornada";
import { tipoOtKey } from "@/lib/planificacion/estado";
import { TIPO_OT_TOKENS } from "@/lib/planificacion/colores";
import type { Asignacion, Bloqueo, Cuadrilla } from "@/hooks/use-planificacion";
import type { Vehiculo } from "@/hooks/use-vehiculos";

const VERDE = { bg: "#EAF3DE", color: "#3B6D11" };
const AMBAR = { bg: "#FAEEDA", color: "#854F0B" };
const CORAL = { bg: "#FAECE7", color: "#993C1D" };

function Pill({ label, bg, color }: { label: string; bg: string; color: string }) {
  return (
    <span className="rounded px-1.5 py-0.5 text-[9px] font-medium" style={{ backgroundColor: bg, color }}>
      {label}
    </span>
  );
}

function Dot({ tipoKey }: { tipoKey: ReturnType<typeof tipoOtKey> }) {
  return (
    <span
      className="inline-block h-2 w-2 rounded-[2px]"
      style={{ backgroundColor: TIPO_OT_TOKENS[tipoKey].borde }}
    />
  );
}

export function MonthView({
  mesRef,
  cuadrillas,
  camiones,
  asignaciones,
  bloqueos,
  onSelectWeek,
}: {
  mesRef: Date;
  cuadrillas: Cuadrilla[];
  camiones: Vehiculo[];
  asignaciones: Asignacion[];
  bloqueos: Bloqueo[];
  onSelectWeek: (weekStart: Date) => void;
}) {
  const semanas = semanasDelMes(mesRef);
  const viajesFlat = asignaciones.flatMap((a) =>
    (a.planificacion_viajes ?? []).map((v) => ({ v, a })),
  );

  const asigsDe = (cuadrillaId: string, fecha: string) =>
    asignaciones.filter((a) => a.cuadrilla_id === cuadrillaId && a.fecha === fecha);
  const bloqsDe = (cuadrillaId: string, fecha: string) =>
    bloqueos.filter((b) => b.cuadrilla_id === cuadrillaId && b.fecha === fecha);
  const viajesDe = (camionId: string, fecha: string) =>
    viajesFlat.filter((x) => x.v.camion_id === camionId && x.a.fecha === fecha);

  function pillCuadrilla(cuadrillaId: string, fecha: string) {
    const horas = asigsDe(cuadrillaId, fecha).map((a) => a.horas_jornada);
    const blo = bloqsDe(cuadrillaId, fecha).map((b) => ({ desde: b.franja_desde, hasta: b.franja_hasta }));
    const { ocupadas, bloqueadas } = capacidadCuadrilla(horas, blo);
    const used = ocupadas + bloqueadas;
    if (used <= 0) return { label: "8h libre", ...VERDE };
    if (used >= HORAS_NETAS) return { label: "8h ocup.", ...CORAL };
    return { label: `${used}h ocup.`, ...AMBAR };
  }

  const colTemplate = `80px repeat(${semanas[0]?.length ?? 6}, minmax(0, 1fr))`;

  return (
    <div className="flex-1 overflow-auto">
      <div className="space-y-4 pb-4">
        {semanas.map((dias, si) => (
          <div key={si} className="overflow-hidden rounded-lg border">
            {/* Header de semana */}
            <div className="grid items-center border-b bg-secondary" style={{ gridTemplateColumns: colTemplate }}>
              <div className="px-2 py-1 text-[10px] font-medium uppercase text-muted-foreground">
                Sem. {getISOWeek(dias[0])}
              </div>
              {dias.map((d, i) => {
                const hoy = isSameDay(d, new Date());
                return (
                  <div
                    key={i}
                    className="flex flex-col items-center py-1"
                    style={hoy ? { backgroundColor: "#FAECE7" } : undefined}
                  >
                    <span className="text-[9px] uppercase text-muted-foreground">{format(d, "EEE", { locale: es })}</span>
                    <span className="text-[12px] font-medium" style={hoy ? { color: "#D85A30" } : undefined}>
                      {format(d, "d")}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Cuadrillas */}
            <div className="sticky top-0 z-10 flex items-center gap-1.5 border-b bg-secondary px-2 py-0.5 text-[9px] font-medium uppercase text-muted-foreground">
              <Users className="h-3 w-3" /> Cuadrillas
            </div>
            {cuadrillas.map((c) => (
              <div key={c.id} className="grid border-b" style={{ gridTemplateColumns: colTemplate }}>
                <div className="flex items-center gap-1.5 border-r px-2 py-1.5">
                  <RecursoAvatar codigo={`C${c.orden}`} variant="cuadrilla" size={18} />
                  <span className="truncate text-[10px]">{c.nombre}</span>
                </div>
                {dias.map((d, i) => {
                  const fecha = format(d, "yyyy-MM-dd");
                  const pill = pillCuadrilla(c.id, fecha);
                  const asigs = asigsDe(c.id, fecha);
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => onSelectWeek(dias[0])}
                      className="flex min-h-[42px] flex-col items-start gap-1 border-r p-1 text-left hover:bg-muted/40"
                    >
                      <Pill label={pill.label} bg={pill.bg} color={pill.color} />
                      <div className="flex flex-wrap gap-0.5">
                        {asigs.map((a) => (
                          <Dot key={a.id} tipoKey={tipoOtKey(a.ordenes_trabajo?.tipo ?? "otro", a.ordenes_trabajo?.es_adicional ?? false)} />
                        ))}
                      </div>
                    </button>
                  );
                })}
              </div>
            ))}

            {/* Camiones */}
            <div className="sticky top-0 z-10 flex items-center gap-1.5 border-b bg-secondary px-2 py-0.5 text-[9px] font-medium uppercase text-muted-foreground">
              <Truck className="h-3 w-3" /> Camiones
            </div>
            {camiones.map((v, idx) => (
              <div key={v.id} className="grid border-b" style={{ gridTemplateColumns: colTemplate }}>
                <div className="flex items-center gap-1.5 border-r px-2 py-1.5">
                  <RecursoAvatar codigo={`T${idx + 1}`} variant="camion" size={18} />
                  <span className="truncate text-[10px]">{v.patente}</span>
                </div>
                {dias.map((d, i) => {
                  const fecha = format(d, "yyyy-MM-dd");
                  const viajes = viajesDe(v.id, fecha);
                  const n = viajes.length;
                  const pill = n === 0 ? { label: "libre", ...VERDE } : { label: `${n} ${n === 1 ? "viaje" : "viajes"}`, ...AMBAR };
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => onSelectWeek(dias[0])}
                      className="flex min-h-[42px] flex-col items-start gap-1 border-r p-1 text-left hover:bg-muted/40"
                    >
                      <Pill label={pill.label} bg={pill.bg} color={pill.color} />
                      <div className="flex flex-wrap gap-0.5">
                        {viajes.map(({ v: viaje, a }) => (
                          <Dot key={viaje.id} tipoKey={tipoOtKey(a.ordenes_trabajo?.tipo ?? "otro", a.ordenes_trabajo?.es_adicional ?? false)} />
                        ))}
                      </div>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        ))}

        {/* Leyenda */}
        <div className="flex flex-wrap items-center gap-3 px-1 text-[10px] text-muted-foreground">
          <LegendSwatch color={VERDE.bg} label="Disponible" />
          <LegendSwatch color={AMBAR.bg} label="Parcial" />
          <LegendSwatch color={CORAL.bg} label="Completo" />
          <span className="mx-1 h-3 w-px bg-border" />
          <LegendDot tipoKey="armado" />
          <LegendDot tipoKey="desarme" />
          <LegendDot tipoKey="mantenimiento" />
          <LegendDot tipoKey="adicional" />
        </div>
      </div>
    </div>
  );
}

function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className="h-3 w-3 rounded" style={{ backgroundColor: color, border: "1px solid var(--border)" }} />
      {label}
    </span>
  );
}

function LegendDot({ tipoKey }: { tipoKey: "armado" | "desarme" | "mantenimiento" | "adicional" }) {
  return (
    <span className="flex items-center gap-1">
      <Dot tipoKey={tipoKey} />
      {TIPO_OT_TOKENS[tipoKey].label}
    </span>
  );
}
