"use client";

import { useState } from "react";
import { X, UserPlus, Truck, RefreshCw, AlertTriangle, Loader2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { InicialesAvatar } from "@/components/computos/iniciales-avatar";
import { RecursoAvatar } from "./recurso-avatar";
import { TIPO_OT_TOKENS, capacidadColor, type TipoOtKey } from "@/lib/planificacion/colores";
import { tipoOtKey, asignacionCompleta } from "@/lib/planificacion/estado";
import {
  posicionPct,
  anchoPct,
  duracionHoras,
  haySuperposicion,
  capacidadCuadrilla,
  aHHMM,
  aMinutos,
  JORNADA_FIN,
} from "@/lib/planificacion/jornada";
import type { Asignacion } from "@/hooks/use-planificacion";
import type { Personal } from "@/hooks/use-personal";
import type { Vehiculo } from "@/hooks/use-vehiculos";

type LocalViaje = {
  key: string;
  camion_id: string;
  chofer_id: string | null;
  franja_desde: string;
  franja_hasta: string;
};

export type JornadaBlock = { label: string; horaInicio: string; horas: number; tipoKey: TipoOtKey };
export type ViajeExterno = { camion_id: string; desde: string; hasta: string; obra: string };

export function JornadaPanel({
  asignacion,
  cuadrillaNombre,
  fechaLabel,
  personalObra,
  choferes,
  camiones,
  camionInicialId,
  otrasJornadasCuadrilla,
  bloqueosFranjas,
  personalOcupado,
  viajesExternos,
  saving,
  onGuardar,
  onCancel,
}: {
  asignacion: Asignacion;
  nuevaPorDrop: boolean;
  cuadrillaNombre: string;
  fechaLabel: string;
  personalObra: Personal[];
  choferes: Personal[];
  camiones: Vehiculo[];
  camionInicialId?: string | null;
  otrasJornadasCuadrilla: JornadaBlock[];
  bloqueosFranjas: { desde: string; hasta: string }[];
  personalOcupado: Set<string>;
  viajesExternos: ViajeExterno[];
  saving: boolean;
  onGuardar: (data: {
    horasJornada: number;
    horaInicio: string;
    personalIds: string[];
    viajes: { camion_id: string; chofer_id: string | null; franja_desde: string; franja_hasta: string }[];
    estado: string;
  }) => void;
  onCancel: () => void;
}) {
  const ot = asignacion.ordenes_trabajo;
  const tKey = tipoOtKey(ot?.tipo ?? "otro", ot?.es_adicional ?? false);
  const t = TIPO_OT_TOKENS[tKey];
  const obraNombre = ot?.obras?.nombre ?? ot?.codigo ?? "OT";

  const horaInicio = asignacion.hora_inicio.slice(0, 5);

  const [horasJornada, setHorasJornada] = useState(asignacion.horas_jornada);
  const [personalIds, setPersonalIds] = useState<string[]>(
    (asignacion.planificacion_asignacion_personal ?? []).map((p) => p.personal_id),
  );
  const [viajes, setViajes] = useState<LocalViaje[]>(() => {
    const base: LocalViaje[] = (asignacion.planificacion_viajes ?? []).map((v) => ({
      key: v.id,
      camion_id: v.camion_id,
      chofer_id: v.chofer_id,
      franja_desde: v.franja_desde.slice(0, 5),
      franja_hasta: v.franja_hasta.slice(0, 5),
    }));
    // Drop sobre fila de camión: seedea ese camión como viaje (con su chofer habitual).
    if (camionInicialId && !base.some((b) => b.camion_id === camionInicialId)) {
      const cam = camiones.find((c) => c.id === camionInicialId);
      if (cam) {
        base.push({
          key: `seed-${cam.id}`,
          camion_id: cam.id,
          chofer_id: cam.chofer_habitual_id,
          franja_desde: horaInicio,
          franja_hasta: aHHMM(Math.min(aMinutos(horaInicio) + 120, aMinutos(JORNADA_FIN))),
        });
      }
    }
    return base;
  });
  const [forzar, setForzar] = useState(false);

  const nombrePersonal = (id: string) => {
    const p = personalObra.find((x) => x.id === id) ?? choferes.find((x) => x.id === id);
    return p ? `${p.nombre} ${p.apellido}` : "—";
  };

  // ----- Barra visual de jornada (cuadrilla) -----
  const jornadaBlocks: JornadaBlock[] = [
    { label: obraNombre, horaInicio, horas: horasJornada, tipoKey: tKey },
    ...otrasJornadasCuadrilla,
  ];
  const capCuad = capacidadCuadrilla(
    jornadaBlocks.map((b) => b.horas),
    bloqueosFranjas,
  );
  const sobreasignado = capCuad.disponibles < 0;

  // ----- Validación de superposición de viajes (por camión, ese día) -----
  function conflictoViaje(v: LocalViaje): ViajeExterno | null {
    const otros = [
      ...viajesExternos.filter((e) => e.camion_id === v.camion_id),
      ...viajes
        .filter((o) => o.key !== v.key && o.camion_id === v.camion_id)
        .map((o) => ({ camion_id: o.camion_id, desde: o.franja_desde, hasta: o.franja_hasta, obra: "otra jornada" })),
    ];
    const conflict = otros.find((e) =>
      haySuperposicion({ desde: v.franja_desde, hasta: v.franja_hasta }, [{ desde: e.desde, hasta: e.hasta }]),
    );
    return conflict ?? null;
  }
  const hayConflicto = viajes.some((v) => conflictoViaje(v) !== null);

  // ----- Acciones de personal -----
  const disponiblesParaAgregar = personalObra.filter((p) => !personalIds.includes(p.id));

  // ----- Acciones de viajes -----
  function agregarCamion(camion: Vehiculo) {
    const hasta = aHHMM(Math.min(aMinutos(horaInicio) + 120, aMinutos(JORNADA_FIN)));
    setViajes((prev) => [
      ...prev,
      {
        key: crypto.randomUUID(),
        camion_id: camion.id,
        chofer_id: camion.chofer_habitual_id, // MEJORA: prellenar chofer habitual
        franja_desde: horaInicio,
        franja_hasta: hasta,
      },
    ]);
  }
  function actualizarViaje(key: string, patch: Partial<LocalViaje>) {
    setViajes((prev) => prev.map((v) => (v.key === key ? { ...v, ...patch } : v)));
  }
  function quitarViaje(key: string) {
    setViajes((prev) => prev.filter((v) => v.key !== key));
  }

  // ----- Guardar -----
  const sinPersonal = personalIds.length === 0;
  const sinCamion = viajes.length === 0;
  const tieneAdvertencia = sinPersonal || sinCamion;

  function handleGuardar() {
    if (hayConflicto) return; // bloqueante
    if (tieneAdvertencia && !forzar) {
      setForzar(true);
      return;
    }
    const estado = asignacionCompleta(personalIds.length, viajes) ? "completa" : "sin_completar";
    onGuardar({
      horasJornada,
      horaInicio,
      personalIds,
      viajes: viajes.map((v) => ({
        camion_id: v.camion_id,
        chofer_id: v.chofer_id,
        franja_desde: v.franja_desde,
        franja_hasta: v.franja_hasta,
      })),
      estado,
    });
  }

  return (
    <div className="flex w-[236px] shrink-0 flex-col border-l">
      {/* Header */}
      <div className="space-y-1 bg-secondary px-3 py-2.5">
        <p className="text-[13px] font-medium leading-tight">
          {obraNombre} — {t.label}
        </p>
        <p className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <span className="rounded px-1.5 py-0.5" style={{ backgroundColor: t.bg, color: t.text }}>
            {t.label}
          </span>
          {fechaLabel} · {cuadrillaNombre}
        </p>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-3">
        {/* ===== Columna Cuadrilla ===== */}
        <section className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {cuadrillaNombre} — esta jornada
          </p>

          {/* Barra visual de jornada */}
          <div className="relative h-7 overflow-hidden rounded-md bg-secondary">
            {/* almuerzo 12-13 */}
            <div
              className="absolute top-0 h-full bg-muted-foreground/20"
              style={{ left: `${posicionPct("12:00")}%`, width: `${anchoPct(1)}%` }}
              title="Almuerzo 12:00–13:00"
            />
            {jornadaBlocks.map((b, i) => {
              const bt = TIPO_OT_TOKENS[b.tipoKey];
              return (
                <div
                  key={i}
                  className="absolute top-0.5 flex h-6 items-center overflow-hidden rounded px-1 text-[8px] font-medium"
                  style={{
                    left: `${posicionPct(b.horaInicio)}%`,
                    width: `${anchoPct(b.horas)}%`,
                    backgroundColor: bt.bg,
                    color: bt.text,
                    border: i === 0 ? `1px solid ${bt.borde}` : undefined,
                  }}
                  title={`${b.label} · ${b.horas}h`}
                >
                  <span className="truncate">{b.label} {b.horas}h</span>
                </div>
              );
            })}
          </div>

          {/* Capacidad resumen */}
          <div className="space-y-1">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full"
                style={{ width: `${Math.min(100, capCuad.pct)}%`, backgroundColor: capacidadColor(capCuad.pct) }}
              />
            </div>
            <p className="text-[9px]" style={{ color: capCuad.pct >= 100 ? "#D85A30" : undefined }}>
              {sobreasignado
                ? `+${Math.abs(capCuad.disponibles)}h sobreasignado`
                : capCuad.disponibles <= 0
                  ? "0h disponibles · jornada completa"
                  : `${capCuad.disponibles}h disponibles de 8h`}
            </p>
          </div>

          {/* Horas esta jornada */}
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={1}
                value={horasJornada}
                onChange={(e) => setHorasJornada(Math.max(0, Number(e.target.value)))}
                className="h-7 w-16"
              />
              <span className="text-xs text-muted-foreground">hs esta jornada</span>
            </div>
            <p className="text-[9px] text-muted-foreground">
              Duración original: {ot?.horas_estimadas ?? "—"}hs (de técnica) — no se modifica
            </p>
          </div>

          {/* Personal */}
          <div className="space-y-1.5">
            <p className="text-[10px] font-medium text-muted-foreground">Personal asignado</p>
            {personalIds.map((id) => (
              <div key={id} className="flex items-center gap-2 rounded-md border px-2 py-1">
                <InicialesAvatar nombre={nombrePersonal(id)} size={20} />
                <span className="min-w-0 flex-1 truncate text-xs">{nombrePersonal(id)}</span>
                <button
                  type="button"
                  onClick={() => setPersonalIds((prev) => prev.filter((x) => x !== id))}
                  className="text-muted-foreground hover:text-destructive"
                  aria-label="Quitar"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            <Popover>
              <PopoverTrigger
                render={
                  <Button variant="outline" size="sm" className="w-full justify-start text-muted-foreground" />
                }
              >
                <UserPlus className="mr-1.5 h-3.5 w-3.5" />
                Agregar operario
              </PopoverTrigger>
              <PopoverContent className="w-56 max-h-64 overflow-y-auto p-1">
                {disponiblesParaAgregar.length === 0 && (
                  <p className="p-2 text-xs text-muted-foreground">Sin operarios disponibles.</p>
                )}
                {disponiblesParaAgregar.map((p) => {
                  const ocupado = personalOcupado.has(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      disabled={ocupado}
                      title={ocupado ? "Ya asignado a otra cuadrilla este día" : undefined}
                      onClick={() => setPersonalIds((prev) => [...prev, p.id])}
                      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <InicialesAvatar nombre={`${p.nombre} ${p.apellido}`} size={18} />
                      <span className="truncate">{p.nombre} {p.apellido}</span>
                      {ocupado && <span className="ml-auto text-[9px] text-muted-foreground">ya asignado</span>}
                    </button>
                  );
                })}
              </PopoverContent>
            </Popover>
          </div>
        </section>

        {/* ===== Columna Camión y chofer ===== */}
        <section className="space-y-2 border-t pt-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Camión y chofer — este viaje
          </p>

          {viajes.map((v) => (
            <ViajeCard
              key={v.key}
              viaje={v}
              camion={camiones.find((c) => c.id === v.camion_id)}
              choferNombre={v.chofer_id ? nombrePersonal(v.chofer_id) : null}
              choferes={choferes}
              conflicto={conflictoViaje(v)}
              viajesExternos={viajesExternos.filter((e) => e.camion_id === v.camion_id)}
              otrosLocales={viajes.filter((o) => o.key !== v.key && o.camion_id === v.camion_id)}
              onChange={(patch) => actualizarViaje(v.key, patch)}
              onQuitar={() => quitarViaje(v.key)}
            />
          ))}

          <Popover>
            <PopoverTrigger
              render={<Button variant="outline" size="sm" className="w-full justify-start text-muted-foreground" />}
            >
              <Truck className="mr-1.5 h-3.5 w-3.5" />
              {viajes.length === 0 ? "Asignar camión" : "Asignar otro camión"}
            </PopoverTrigger>
            <PopoverContent className="w-56 max-h-64 overflow-y-auto p-1">
              {camiones.length === 0 && <p className="p-2 text-xs text-muted-foreground">Sin camiones.</p>}
              {camiones.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => agregarCamion(c)}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-muted"
                >
                  <RecursoAvatar codigo={c.patente.slice(0, 2).toUpperCase()} variant="camion" size={18} />
                  <span className="truncate">{[c.marca, c.modelo].filter(Boolean).join(" ") || c.patente}</span>
                  <span className="ml-auto font-mono text-[9px] text-muted-foreground">{c.patente}</span>
                </button>
              ))}
            </PopoverContent>
          </Popover>
        </section>

        {tieneAdvertencia && forzar && (
          <div className="flex items-start gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-[10px] text-amber-700">
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
            <span>
              {sinPersonal && "Esta jornada no tiene operarios asignados. "}
              {sinCamion && "Esta jornada no tiene camión asignado. "}
              Tocá de nuevo el botón para confirmar.
            </span>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center gap-2 border-t p-3">
        <Button variant="outline" size="sm" className="flex-1" onClick={onCancel} disabled={saving}>
          Cancelar
        </Button>
        <Button
          size="sm"
          className="flex-1"
          onClick={handleGuardar}
          disabled={saving || hayConflicto}
          style={{ backgroundColor: "#D85A30", color: "#fff" }}
          title={hayConflicto ? "Resolvé la superposición de franjas" : undefined}
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <Check className="mr-1.5 h-4 w-4" />
              {tieneAdvertencia && forzar ? "Guardar igual" : "Guardar jornada"}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

/* ---------- Card de un viaje de camión ---------- */

function ViajeCard({
  viaje,
  camion,
  choferNombre,
  choferes,
  conflicto,
  viajesExternos,
  otrosLocales,
  onChange,
  onQuitar,
}: {
  viaje: LocalViaje;
  camion?: Vehiculo;
  choferNombre: string | null;
  choferes: Personal[];
  conflicto: ViajeExterno | null;
  viajesExternos: ViajeExterno[];
  otrosLocales: LocalViaje[];
  onChange: (patch: Partial<LocalViaje>) => void;
  onQuitar: () => void;
}) {
  const dur = duracionHoras(viaje.franja_desde, viaje.franja_hasta);
  // Mini-timeline: viaje actual + viajes externos + otros locales del mismo camión.
  const timeline = [
    { desde: viaje.franja_desde, hasta: viaje.franja_hasta, obra: "este viaje", actual: true },
    ...viajesExternos.map((e) => ({ desde: e.desde, hasta: e.hasta, obra: e.obra, actual: false })),
    ...otrosLocales.map((o) => ({ desde: o.franja_desde, hasta: o.franja_hasta, obra: "otra jornada", actual: false })),
  ].sort((a, b) => aMinutos(a.desde) - aMinutos(b.desde));

  return (
    <div className="space-y-2 rounded-md border p-2" style={{ borderColor: "#B5D4F4" }}>
      <div className="flex items-center gap-2">
        <RecursoAvatar codigo={(camion?.patente ?? "T").slice(0, 2).toUpperCase()} variant="camion" size={20} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium">
            {[camion?.marca, camion?.modelo].filter(Boolean).join(" ") || camion?.patente || "Camión"}
          </p>
          <p className="truncate font-mono text-[9px] text-muted-foreground">{camion?.patente}</p>
        </div>
        <button type="button" onClick={onQuitar} className="text-muted-foreground hover:text-destructive" aria-label="Quitar camión">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Chofer */}
      <div className="flex items-center gap-2 border-t pt-2">
        <span className="text-[10px] text-muted-foreground">Chofer:</span>
        {choferNombre ? (
          <span className="flex items-center gap-1 text-xs">
            <InicialesAvatar nombre={choferNombre} size={18} />
            {choferNombre}
          </span>
        ) : (
          <span className="text-[10px] text-muted-foreground">sin asignar</span>
        )}
        <Popover>
          <PopoverTrigger render={<Button variant="ghost" size="xs" className="ml-auto" />}>
            <RefreshCw className="mr-1 h-3 w-3" />
            Cambiar
          </PopoverTrigger>
          <PopoverContent className="w-52 max-h-56 overflow-y-auto p-1">
            {choferes.length === 0 && <p className="p-2 text-xs text-muted-foreground">Sin choferes.</p>}
            {choferes.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => onChange({ chofer_id: c.id })}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-muted"
              >
                <InicialesAvatar nombre={`${c.nombre} ${c.apellido}`} size={18} />
                {c.nombre} {c.apellido}
              </button>
            ))}
          </PopoverContent>
        </Popover>
      </div>

      {/* Franja del viaje */}
      <div className="space-y-1 border-t pt-2">
        <p className="text-[9px] text-muted-foreground">El chofer no permanece toda la jornada en obra.</p>
        <div className="flex items-center gap-1.5">
          <Input
            type="time"
            value={viaje.franja_desde}
            onChange={(e) => onChange({ franja_desde: e.target.value })}
            className="h-7 flex-1 text-xs"
          />
          <span className="text-muted-foreground">→</span>
          <Input
            type="time"
            value={viaje.franja_hasta}
            onChange={(e) => onChange({ franja_hasta: e.target.value })}
            className="h-7 flex-1 text-xs"
          />
          <span className="w-10 text-right text-[10px] text-muted-foreground">{dur}h</span>
        </div>
      </div>

      {/* Mini-timeline */}
      <div className="space-y-1 border-t pt-2">
        <p className="text-[9px] text-muted-foreground">Viajes de este camión el día</p>
        {timeline.map((tr, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <span className="w-20 shrink-0 font-mono text-[9px] text-muted-foreground">
              {tr.desde.slice(0, 5)}–{tr.hasta.slice(0, 5)}
            </span>
            <div className="h-2 flex-1 rounded-full" style={{ backgroundColor: tr.actual ? "#378ADD" : "#B5D4F4" }} />
            <span className="w-16 shrink-0 truncate text-[9px] text-muted-foreground">{tr.obra}</span>
          </div>
        ))}
        {conflicto ? (
          <p className="flex items-center gap-1 text-[10px] font-medium" style={{ color: "#D85A30" }}>
            <AlertTriangle className="h-3 w-3" /> Superposición con {conflicto.obra}
          </p>
        ) : (
          <p className="flex items-center gap-1 text-[10px] font-medium text-emerald-600">
            <Check className="h-3 w-3" /> Sin superposición
          </p>
        )}
      </div>
    </div>
  );
}
