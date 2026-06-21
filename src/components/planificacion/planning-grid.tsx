"use client";

import { format, isSameDay } from "date-fns";
import { es } from "date-fns/locale";
import { Users, Truck } from "lucide-react";
import { ResourceCell } from "./resource-cell";
import { GridCell } from "./grid-cell";
import { OtBlock } from "./ot-block";
import { BloqueoBlock } from "./bloqueo-block";
import { BlockContextMenu } from "./block-context-menu";
import { tipoOtKey } from "@/lib/planificacion/estado";
import { TIPO_OT_TOKENS } from "@/lib/planificacion/colores";
import { capacidadCuadrilla, capacidadCamion, aMinutos, duracionHoras, otDuracionDias } from "@/lib/planificacion/jornada";
import type { Asignacion, Bloqueo, Cuadrilla } from "@/hooks/use-planificacion";
import type { Vehiculo } from "@/hooks/use-vehiculos";

const fmtH = (n: number) => {
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
};

export function PlanningGrid({
  cuadrillas,
  camiones,
  dias,
  asignaciones,
  bloqueos,
  diaFoco,
  selectedAsignacionId,
  onOtClick,
  onMover,
  onVolver,
  onBloqueoClick,
  onAddCuadrilla,
}: {
  cuadrillas: Cuadrilla[];
  camiones: Vehiculo[];
  dias: Date[];
  asignaciones: Asignacion[];
  bloqueos: Bloqueo[];
  diaFoco: string;
  selectedAsignacionId: string | null;
  onOtClick: (a: Asignacion) => void;
  onMover: (a: Asignacion) => void;
  onVolver: (a: Asignacion) => void;
  onBloqueoClick: (b: Bloqueo) => void;
  onAddCuadrilla: (cuadrillaId: string, fecha: string) => void;
}) {
  const fechas = dias.map((d) => format(d, "yyyy-MM-dd"));
  const cols = `156px repeat(${dias.length}, minmax(150px, 1fr))`;

  // Viajes aplanados con su fecha y OT (para las filas de camión).
  const viajesFlat = asignaciones.flatMap((a) =>
    (a.planificacion_viajes ?? []).map((v) => ({ v, a })),
  );

  // Helpers por celda
  const asigsDe = (cuadrillaId: string, fecha: string) =>
    asignaciones
      .filter((a) => a.cuadrilla_id === cuadrillaId && a.fecha === fecha)
      .sort((x, y) => aMinutos(x.hora_inicio) - aMinutos(y.hora_inicio));
  const bloqsDe = (cuadrillaId: string, fecha: string) =>
    bloqueos.filter((b) => b.cuadrilla_id === cuadrillaId && b.fecha === fecha);
  const viajesDe = (camionId: string, fecha: string) =>
    viajesFlat.filter((x) => x.v.camion_id === camionId && x.a.fecha === fecha);

  // Capacidad de cuadrilla en el día en foco
  function capCuadrilla(c: Cuadrilla) {
    const horas = asigsDe(c.id, diaFoco).map((a) => a.horas_jornada);
    const blo = bloqsDe(c.id, diaFoco).map((b) => ({ desde: b.franja_desde, hasta: b.franja_hasta }));
    const cap = capacidadCuadrilla(horas, blo);
    const label =
      cap.disponibles <= 0
        ? cap.disponibles < 0
          ? `+${fmtH(-cap.disponibles)}h sobreasignado`
          : "0h disp. · jornada completa"
        : `${fmtH(cap.disponibles)}h disp. de 8h · ${fmtH(cap.ocupadas + cap.bloqueadas)}h asign.`;
    return { pct: cap.pct, label, sobre: cap.disponibles < 0 };
  }

  // Personal del día (sublabel de cuadrilla)
  function personalDia(c: Cuadrilla) {
    const aps = asigsDe(c.id, diaFoco)
      .flatMap((a) => a.planificacion_asignacion_personal ?? [])
      .map((p) => p.personal?.apellido)
      .filter(Boolean);
    return aps.length ? [...new Set(aps)].join(" · ") : "Sin personal";
  }

  function capCamion(v: Vehiculo) {
    const franjas = viajesDe(v.id, diaFoco).map((x) => ({
      desde: x.v.franja_desde,
      hasta: x.v.franja_hasta,
    }));
    const cap = capacidadCamion(franjas);
    const label = cap.ocupadas > 0 ? `${fmtH(cap.ocupadas)}h en viajes · ${fmtH(cap.disponibles)}h disp.` : "Sin viajes";
    return { pct: cap.pct, label };
  }

  const cells: React.ReactNode[] = [];

  // ----- Fila de header -----
  cells.push(
    <div
      key="corner"
      className="sticky left-0 top-0 z-30 flex h-10 items-center border-b border-r bg-card px-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
    >
      Recursos
    </div>,
  );
  dias.forEach((d, i) => {
    const hoy = isSameDay(d, new Date());
    cells.push(
      <div
        key={`h-${i}`}
        className="sticky top-0 z-20 flex h-10 flex-col items-center justify-center border-b border-r"
        style={hoy ? { backgroundColor: "#FAECE7" } : { backgroundColor: "var(--card)" }}
      >
        <span className="text-[10px] uppercase text-muted-foreground">{format(d, "EEE", { locale: es })}</span>
        <span className="text-[13px] font-medium" style={hoy ? { color: "#D85A30" } : undefined}>
          {format(d, "d")}
        </span>
      </div>,
    );
  });

  // ----- Separador Cuadrillas -----
  cells.push(
    <div key="sep-c" className="sticky left-0 z-10 flex h-6 items-center gap-1.5 border-b border-r bg-secondary px-2 text-[10px] font-medium uppercase text-muted-foreground">
      <Users className="h-3 w-3" /> Cuadrillas
    </div>,
  );
  fechas.forEach((_, i) => cells.push(<div key={`sep-c-${i}`} className="h-6 border-b border-r bg-secondary" />));

  // ----- Filas de cuadrillas -----
  cuadrillas.forEach((c) => {
    const cap = capCuadrilla(c);
    cells.push(
      <ResourceCell
        key={`c-${c.id}`}
        codigo={`C${c.orden}`}
        variant="cuadrilla"
        nombre={c.nombre}
        sublabel={personalDia(c)}
        capacidadPct={cap.pct}
        capacidadLabel={cap.label}
        sobreasignado={cap.sobre}
      />,
    );
    fechas.forEach((fecha, i) => {
      const asigs = asigsDe(c.id, fecha);
      const blos = bloqsDe(c.id, fecha);
      cells.push(
        <GridCell
          key={`c-${c.id}-${i}`}
          recursoTipo="cuadrilla"
          recursoId={c.id}
          fecha={fecha}
          esHoy={isSameDay(dias[i], new Date())}
          canAdd
          onAdd={() => onAddCuadrilla(c.id, fecha)}
        >
          {asigs.map((a) => {
            const key = tipoOtKey(a.ordenes_trabajo?.tipo ?? "otro", a.ordenes_trabajo?.es_adicional ?? false);
            const total = otDuracionDias(a.ordenes_trabajo?.horas_estimadas) ?? 1;
            const jLabel = a.jornada ? `J${a.jornada.numero}/${total} · ` : "";
            return (
              <OtBlock
                key={a.id}
                titulo={a.ordenes_trabajo?.obras?.nombre ?? a.ordenes_trabajo?.codigo ?? "OT"}
                tipoKey={key}
                subtitulo={`${TIPO_OT_TOKENS[key].label} · ${jLabel}${fmtH(a.horas_jornada)}h`}
                estado={a.estado}
                selected={a.id === selectedAsignacionId}
                onClick={() => onOtClick(a)}
                menu={<BlockContextMenu onEditar={() => onOtClick(a)} onMover={() => onMover(a)} onVolver={() => onVolver(a)} />}
              />
            );
          })}
          {blos.map((b) => (
            <BloqueoBlock
              key={b.id}
              motivo={b.motivo}
              desde={b.franja_desde}
              hasta={b.franja_hasta}
              onClick={() => onBloqueoClick(b)}
            />
          ))}
        </GridCell>,
      );
    });
  });

  // ----- Separador Camiones -----
  cells.push(
    <div key="sep-t" className="sticky left-0 z-10 flex h-6 items-center gap-1.5 border-b border-r bg-secondary px-2 text-[10px] font-medium uppercase text-muted-foreground">
      <Truck className="h-3 w-3" /> Camiones
    </div>,
  );
  fechas.forEach((_, i) => cells.push(<div key={`sep-t-${i}`} className="h-6 border-b border-r bg-secondary" />));

  // ----- Filas de camiones -----
  camiones.forEach((v, idx) => {
    const cap = capCamion(v);
    cells.push(
      <ResourceCell
        key={`t-${v.id}`}
        codigo={`T${idx + 1}`}
        variant="camion"
        nombre={[v.marca, v.modelo].filter(Boolean).join(" ") || v.patente}
        sublabel={v.patente}
        capacidadPct={cap.pct}
        capacidadLabel={cap.label}
      />,
    );
    fechas.forEach((fecha, i) => {
      const viajes = viajesDe(v.id, fecha);
      cells.push(
        <GridCell
          key={`t-${v.id}-${i}`}
          recursoTipo="camion"
          recursoId={v.id}
          fecha={fecha}
          esHoy={isSameDay(dias[i], new Date())}
          canAdd={false}
        >
          {viajes.map(({ v: viaje, a }) => (
            <OtBlock
              key={viaje.id}
              titulo={a.ordenes_trabajo?.obras?.nombre ?? a.ordenes_trabajo?.codigo ?? "OT"}
              tipoKey={tipoOtKey(a.ordenes_trabajo?.tipo ?? "otro", a.ordenes_trabajo?.es_adicional ?? false)}
              subtitulo={`${viaje.franja_desde.slice(0, 5)}–${viaje.franja_hasta.slice(0, 5)} · ${fmtH(duracionHoras(viaje.franja_desde, viaje.franja_hasta))}h`}
              selected={a.id === selectedAsignacionId}
              onClick={() => onOtClick(a)}
              menu={<BlockContextMenu onEditar={() => onOtClick(a)} onMover={() => onMover(a)} onVolver={() => onVolver(a)} />}
            />
          ))}
        </GridCell>,
      );
    });
  });

  return (
    <div className="flex-1 overflow-auto">
      <div className="grid" style={{ gridTemplateColumns: cols }}>
        {cells}
      </div>
    </div>
  );
}
