"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Camera, Check, ChevronDown, ChevronRight, Loader2, MoreHorizontal, Square, X } from "lucide-react";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { colorTipo, CORAL } from "@/lib/tablero/colores";
import { partesTitulo } from "@/lib/tablero/titulo";
import { fraccionLabel } from "@/lib/tablero/fracciones";
import { ATAJOS_SALIDA, formatHora, horasEfectivas, parseHora } from "@/lib/tablero/horas";
import { MOMENTOS_FOTO, MOTIVOS_NO_EJEC, TIPOS_INCIDENCIA } from "@/lib/tablero/tipos-parte";
import { comprimirFoto, pesoLegible, type FotoComprimida } from "@/lib/tablero/imagenes";
import type { JornadaListado } from "@/lib/tablero/tipos-jornada";

// Una fila del listado de partes. Se edita EN LÍNEA, sin modal: abrir y cerrar un diálogo
// cinco veces cada mañana es la fricción que hace que la gente vuelva a la planilla.
//
// Plegada muestra lo que ya sabemos del plan; se despliega sólo la excepción.

export type Borrador = {
  estado: "ejecutado" | "no_ejecutado";
  motivo: string;
  reprogramarA: string;
  cuadrillaId: string;
  /** Texto y no número: tiene que poder estar VACÍO cuando la OT no trae dotación. */
  personas: string;
  desde: string;
  hasta: string;
  fletes: string;
  tercerizado: boolean;
  costoFlete: string;
  sector: string;
  notas: string;
  incidenciaTipo: string;
  incidenciaDesc: string;
  /**
   * Fotos del día, ya comprimidas del lado del cliente.
   *
   * Faltaban acá aunque el resto del camino estaba entero —compresión, subida a
   * x_aba_foto, reporte de las que fallan—: la UI existía sólo en el modal del tablero,
   * que desde el repunte quedó para VER o corregir un parte ya cargado. O sea que el
   * lugar donde efectivamente se cargan los partes era el único sin fotos.
   */
  fotos: FotoEnBorrador[];
  /** Respuesta a "¿la OT está finalizada?". null = todavía no contestó. */
  finalizarOt: boolean | null;
};

export type FotoEnBorrador = FotoComprimida & { momento: string };

/**
 * Borrador inicial de una fila. El personal se precarga con la dotación prevista de la OT
 * y queda VACÍO si la OT no la tiene: un default de 1 persona es plausible, no se nota, y
 * multiplica las horas-hombre que van al costo de mano de obra.
 */
export function borradorDe(j: JornadaListado): Borrador {
  return {
    estado: "ejecutado",
    motivo: "",
    reprogramarA: "",
    cuadrillaId: j.cuadrillaId ? String(j.cuadrillaId) : "",
    personas: j.personalPrevisto > 0 ? String(j.personalPrevisto) : "",
    desde: "08:00",
    hasta: "17:00",
    fletes: String(j.fleteSugerido),
    tercerizado: false,
    costoFlete: "",
    sector: "",
    notas: "",
    incidenciaTipo: "",
    incidenciaDesc: "",
    fotos: [],
    finalizarOt: null,
  };
}

/** Horas-hombre del borrador, con el mismo cálculo que hace Odoo (sin la hora de almuerzo). */
export function horasHombreDe(b: Borrador): number {
  const d = parseHora(b.desde);
  const h = parseHora(b.hasta);
  const p = Number(b.personas);
  if (d === null || h === null || !Number.isFinite(p) || p <= 0) return 0;
  return horasEfectivas(d, h) * p;
}

/** Qué le falta al borrador para poder guardarse. Vacío = está listo. */
export function erroresDe(b: Borrador, j: JornadaListado): string[] {
  const e: string[] = [];
  if (b.estado === "no_ejecutado") {
    if (!b.motivo) e.push("Falta el motivo");
    return e;
  }
  const d = parseHora(b.desde);
  const h = parseHora(b.hasta);
  if (d === null) e.push("Hora de entrada inválida");
  if (h === null) e.push("Hora de salida inválida");
  if (d !== null && h !== null && h <= d) e.push("La salida tiene que ser posterior a la entrada");
  const p = Number(b.personas);
  if (!b.personas.trim() || !Number.isFinite(p) || p <= 0) e.push("Falta la cantidad de personas");
  if (!b.cuadrillaId) e.push("Falta la cuadrilla");
  if (j.ultimaDeLaOt && b.finalizarOt === null) e.push("Falta decir si la OT está finalizada");
  return e;
}

const ICONO_TIPO = { arriba: ArrowUp, abajo: ArrowDown, otro: MoreHorizontal } as const;

export function FilaJornada({
  jornada,
  cuadrillas,
  borrador,
  abierta,
  resaltada,
  onToggle,
  onCambio,
}: {
  jornada: JornadaListado;
  cuadrillas: { id: number; nombre: string }[];
  /** null = la fila todavía no se tocó (o ya tiene parte). */
  borrador: Borrador | null;
  abierta: boolean;
  resaltada: boolean;
  onToggle: () => void;
  onCambio: (b: Borrador) => void;
}) {
  const tipo = colorTipo(jornada.tipo);
  const IconoTipo = ICONO_TIPO[tipo.icono];
  const partes = partesTitulo(jornada.titulo);
  const cuadrillaPlan = cuadrillas.find((c) => c.id === jornada.cuadrillaId)?.nombre ?? "sin cuadrilla";
  const parte = jornada.parte;
  const cargado = !!parte;
  const noEjecutado = parte?.estado === "no_ejecutado";

  const set = (cambio: Partial<Borrador>) => borrador && onCambio({ ...borrador, ...cambio });
  const hh = borrador ? horasHombreDe(borrador) : 0;

  // La fracción real del día es tiempo, no gente: la capacidad del tablero es por
  // cuadrilla-día. Comparar contra lo planificado es el desvío del día, visible en el
  // único momento en que quien tiene el dato real lo puede notar.
  const desde = borrador ? parseHora(borrador.desde) : null;
  const hasta = borrador ? parseHora(borrador.hasta) : null;
  const fraccionReal =
    desde !== null && hasta !== null ? horasEfectivas(desde, hasta) / 8 : null;

  return (
    <div
      className={cn("border-b transition-colors", resaltada && "ring-2 ring-inset")}
      style={{
        backgroundColor: noEjecutado ? "#FDECEA" : cargado ? undefined : "color-mix(in oklch, var(--foreground) 2.5%, transparent)",
        ...(resaltada ? { boxShadow: `inset 0 0 0 2px ${CORAL}` } : {}),
      }}
    >
      {/* ── Línea plegada ── */}
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/40"
      >
        {abierta ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}

        {noEjecutado ? (
          <X className="h-4 w-4 shrink-0" style={{ color: "#D92D20" }} />
        ) : cargado ? (
          <Check className="h-4 w-4 shrink-0" style={{ color: "#639922" }} />
        ) : (
          <Square className="h-4 w-4 shrink-0 text-muted-foreground" strokeDasharray="3 2" />
        )}

        <span className="w-24 shrink-0 truncate text-[12px] font-medium">{cuadrillaPlan}</span>

        <IconoTipo className="h-3.5 w-3.5 shrink-0" style={{ color: tipo.text }} aria-hidden />

        <span className="min-w-0 flex-1 truncate text-[13px]" title={jornada.titulo}>
          {partes.principal}
        </span>

        {jornada.tentativaVencida && (
          <span className="shrink-0 rounded px-1 text-[10px] font-semibold" style={{ backgroundColor: "#FAEEDA", color: "#854F0B" }}>
            sin confirmar
          </span>
        )}

        <span className="shrink-0 text-right text-[12px] text-muted-foreground">
          {noEjecutado ? (
            <>
              {MOTIVOS_NO_EJEC.find((m) => m.value === parte?.motivoNoEjec)?.label ?? "no ejecutada"}
            </>
          ) : cargado ? (
            <>
              {parte.manoObra[0]?.personas ?? 0}p ·{" "}
              {formatHora(parte.manoObra[0]?.horaDesde ?? 8)}–{formatHora(parte.manoObra[0]?.horaHasta ?? 17)}
              {parte.flete ? ` · ${parte.flete.cantidad} flete` : ""}
              {"  "}
              <span className="font-medium text-foreground">{parte.horasHombre} hh</span>
            </>
          ) : borrador ? (
            <span style={{ color: CORAL }}>{hh > 0 ? `${hh} hh sin guardar` : "editando"}</span>
          ) : (
            "sin cargar"
          )}
        </span>
      </button>

      {/* ── Expandida ── */}
      {abierta && borrador && (
        <div className="space-y-3 border-t bg-card px-3 py-3">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant={borrador.estado === "ejecutado" ? "default" : "outline"}
              style={borrador.estado === "ejecutado" ? { backgroundColor: CORAL, color: "#fff" } : undefined}
              onClick={() => set({ estado: "ejecutado" })}
            >
              Se ejecutó
            </Button>
            <Button
              type="button"
              size="sm"
              variant={borrador.estado === "no_ejecutado" ? "default" : "outline"}
              style={borrador.estado === "no_ejecutado" ? { backgroundColor: "#D92D20", color: "#fff" } : undefined}
              onClick={() => set({ estado: "no_ejecutado" })}
            >
              No se ejecutó
            </Button>
            <span className="ml-auto text-[11px] text-muted-foreground">
              planificado: {fraccionLabel(jornada.fraccion)} de jornada
            </span>
          </div>

          {borrador.estado === "no_ejecutado" ? (
            // Se colapsa a dos cosas: por qué, y qué pasa con la jornada. Mano de obra,
            // fletes e incidencias no aplican.
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1">
                <span className="text-[11px] font-medium">Motivo</span>
                <Select
                  items={Object.fromEntries(MOTIVOS_NO_EJEC.map((m) => [m.value, m.label]))}
                  value={borrador.motivo}
                  onValueChange={(v) => v && set({ motivo: v })}
                >
                  <SelectTrigger className="h-8"><SelectValue placeholder="Elegí el motivo" /></SelectTrigger>
                  <SelectContent>
                    {MOTIVOS_NO_EJEC.map((m) => (
                      <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <label className="space-y-1">
                <span className="text-[11px] font-medium">Reprogramar para</span>
                <Input
                  type="date"
                  className="h-8"
                  value={borrador.reprogramarA}
                  onChange={(e) => set({ reprogramarA: e.target.value })}
                />
                <span className="block text-[10px] text-muted-foreground">
                  Se agrega una jornada nueva en esa fecha. La de hoy queda registrada como
                  perdida, con su motivo. Vacío = la obra vuelve a la bandeja.
                </span>
              </label>
              <label className="space-y-1 sm:col-span-2">
                <span className="text-[11px] font-medium">Notas</span>
                <Textarea
                  rows={2}
                  value={borrador.notas}
                  onChange={(e) => set({ notas: e.target.value })}
                  placeholder="Lo que mandó el capataz"
                />
              </label>
            </div>
          ) : (
            <>
              {/* ── Personal y horario ── */}
              <div className="flex flex-wrap items-end gap-2">
                <label className="space-y-1">
                  <span className="text-[11px] font-medium">Personas</span>
                  <Input
                    className="h-8 w-20"
                    inputMode="numeric"
                    value={borrador.personas}
                    onChange={(e) => set({ personas: e.target.value.replace(/[^\d]/g, "") })}
                    placeholder={jornada.personalPrevisto > 0 ? undefined : "?"}
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-[11px] font-medium">Desde</span>
                  <Input
                    className="h-8 w-20 tabular-nums"
                    value={borrador.desde}
                    onChange={(e) => set({ desde: e.target.value })}
                    onBlur={() => {
                      const v = parseHora(borrador.desde);
                      if (v !== null) set({ desde: formatHora(v) });
                    }}
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-[11px] font-medium">Hasta</span>
                  <Input
                    className="h-8 w-20 tabular-nums"
                    value={borrador.hasta}
                    onChange={(e) => set({ hasta: e.target.value })}
                    onBlur={() => {
                      const v = parseHora(borrador.hasta);
                      if (v !== null) set({ hasta: formatHora(v) });
                    }}
                  />
                </label>

                {/* Los atajos son la entrada principal: 5 horarios cubren el 99% de lo
                    cargado y todos arrancan a las 8. Escribir es la excepción. */}
                <div className="flex flex-wrap items-center gap-1">
                  {ATAJOS_SALIDA.map((a) => (
                    <Button
                      key={a.hora}
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 px-2 text-[11px] tabular-nums"
                      onClick={() => set({ desde: "08:00", hasta: formatHora(a.hora) })}
                    >
                      {formatHora(a.hora)} · {a.fraccion}
                    </Button>
                  ))}
                </div>
              </div>

              <p className="text-[11px]">
                <span className="font-medium">{hh || 0} horas-hombre</span>
                <span className="text-muted-foreground"> · no se cuenta la hora de almuerzo</span>
                {fraccionReal !== null && (
                  <span
                    className="ml-2"
                    style={{ color: Math.abs(fraccionReal - jornada.fraccion) < 0.01 ? undefined : CORAL }}
                  >
                    {Math.abs(fraccionReal - jornada.fraccion) < 0.01
                      ? "coincide con lo planificado"
                      : fraccionReal > jornada.fraccion
                        ? `más que lo planificado (${fraccionLabel(jornada.fraccion)})`
                        : `menos que lo planificado (${fraccionLabel(jornada.fraccion)})`}
                  </span>
                )}
              </p>

              {/* ── Cuadrilla real, fletes, sector ── */}
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="space-y-1">
                  <span className="text-[11px] font-medium">Cuadrilla que fue</span>
                  <Select
                    items={Object.fromEntries(cuadrillas.map((c) => [String(c.id), c.nombre]))}
                    value={borrador.cuadrillaId}
                    onValueChange={(v) => v && set({ cuadrillaId: v })}
                  >
                    <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {cuadrillas.map((c) => (
                        <SelectItem key={c.id} value={String(c.id)}>{c.nombre}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
                <label className="space-y-1">
                  <span className="text-[11px] font-medium">Viajes de flete</span>
                  <Input
                    className="h-8 w-20"
                    inputMode="numeric"
                    value={borrador.fletes}
                    onChange={(e) => set({ fletes: e.target.value.replace(/[^\d]/g, "") })}
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-[11px] font-medium">Sector / frente</span>
                  <Input
                    className="h-8"
                    value={borrador.sector}
                    onChange={(e) => set({ sector: e.target.value })}
                    placeholder="Contrafrente, medianera…"
                  />
                </label>
              </div>

              <label className="flex items-center gap-2 text-[11px]">
                <Checkbox
                  checked={borrador.tercerizado}
                  onCheckedChange={(v) => set({ tercerizado: v === true })}
                />
                Flete tercerizado
              </label>
              {borrador.tercerizado && (
                <label className="space-y-1">
                  <span className="text-[11px] font-medium">Costo del flete</span>
                  <Input
                    className="h-8 w-36"
                    inputMode="decimal"
                    value={borrador.costoFlete}
                    onChange={(e) => set({ costoFlete: e.target.value.replace(/[^\d.]/g, "") })}
                  />
                </label>
              )}

              <label className="space-y-1 block">
                <span className="text-[11px] font-medium">Notas</span>
                <Textarea
                  rows={2}
                  value={borrador.notas}
                  onChange={(e) => set({ notas: e.target.value })}
                  placeholder="Lo que mandó el capataz por WhatsApp"
                />
              </label>

              <Fotos fotos={borrador.fotos} onCambio={(fotos) => set({ fotos })} />

              {/* La incidencia es rara (2% de los partes) y por eso no ocupa lugar hasta
                  que se pide. */}
              {borrador.incidenciaTipo ? (
                <div className="grid gap-2 sm:grid-cols-[200px_1fr]">
                  <Select
                    items={Object.fromEntries(TIPOS_INCIDENCIA.map((t) => [t.value, t.label]))}
                    value={borrador.incidenciaTipo}
                    onValueChange={(v) => v && set({ incidenciaTipo: v })}
                  >
                    <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TIPOS_INCIDENCIA.map((t) => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="flex gap-1">
                    <Input
                      className="h-8"
                      value={borrador.incidenciaDesc}
                      onChange={(e) => set({ incidenciaDesc: e.target.value })}
                      placeholder="Qué pasó"
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => set({ incidenciaTipo: "", incidenciaDesc: "" })}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => set({ incidenciaTipo: "otro" })}
                >
                  Agregar incidencia
                </Button>
              )}

              {/* ── ¿Terminó la obra? ── */}
              {jornada.ultimaDeLaOt && (
                <div className="space-y-2 rounded-md border p-3" style={{ borderColor: CORAL }}>
                  <p className="text-[12px] font-medium">Es la última jornada pendiente de esta obra</p>
                  <p className="text-[11px] text-muted-foreground">
                    ¿La orden de trabajo está finalizada, o quedan más jornadas?
                  </p>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={borrador.finalizarOt === false ? "default" : "outline"}
                      style={borrador.finalizarOt === false ? { backgroundColor: CORAL, color: "#fff" } : undefined}
                      onClick={() => set({ finalizarOt: false })}
                    >
                      Quedan más jornadas
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={borrador.finalizarOt === true ? "default" : "outline"}
                      style={borrador.finalizarOt === true ? { backgroundColor: CORAL, color: "#fff" } : undefined}
                      onClick={() => set({ finalizarOt: true })}
                    >
                      Finalizar OT
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}

          {erroresDe(borrador, jornada).length > 0 && (
            <p className="text-[11px] font-medium" style={{ color: "#B42318" }}>
              {erroresDe(borrador, jornada).join(" · ")}
            </p>
          )}
        </div>
      )}

      {/* Un parte ya cargado se muestra, no se edita desde acá: para corregirlo está el
          formulario completo del tablero. */}
      {abierta && !borrador && parte && (
        <div className="space-y-1 border-t bg-card px-3 py-3 text-[12px]">
          <p className="font-medium">Parte cargado el {format(parseISO(parte.fecha), "d 'de' MMMM", { locale: es })}</p>
          {parte.manoObra.map((l, i) => (
            <p key={i} className="text-muted-foreground">
              {l.personas} personas · {formatHora(l.horaDesde)}–{formatHora(l.horaHasta)} · {l.horasHombre} hh
            </p>
          ))}
          {parte.flete && <p className="text-muted-foreground">{parte.flete.cantidad} viaje(s) de flete</p>}
          {parte.sector && <p className="text-muted-foreground">Sector: {parte.sector}</p>}
          {parte.observaciones && <p className="text-muted-foreground">{parte.observaciones}</p>}
        </div>
      )}
    </div>
  );
}

/**
 * Fotos del día.
 *
 * Se comprimen EN EL BROWSER antes de guardarse en el borrador: las fotos de celular
 * pesan varios MB y se suben de a muchas (ver lib/tablero/imagenes.ts). Mandarlas
 * crudas a Odoo Online es lo que hace que un parte con ocho fotos tarde minutos.
 *
 * El momento —antes / durante / terminado / incidencia / entrega— se elige por foto y no
 * por parte: en una jornada de armado conviven la foto del frente antes de empezar y la
 * de la conformidad firmada al final, y son dos cosas distintas para quien las busca
 * después.
 */
function Fotos({
  fotos,
  onCambio,
}: {
  fotos: FotoEnBorrador[];
  onCambio: (fotos: FotoEnBorrador[]) => void;
}) {
  const [comprimiendo, setComprimiendo] = useState(false);

  async function agregar(archivos: FileList | null) {
    if (!archivos?.length) return;
    setComprimiendo(true);
    try {
      const nuevas: FotoEnBorrador[] = [];
      for (const archivo of Array.from(archivos)) {
        try {
          nuevas.push({ ...(await comprimirFoto(archivo)), momento: "final" });
        } catch {
          // Una foto rota no puede tirar abajo las otras siete ni el parte entero.
        }
      }
      if (nuevas.length > 0) onCambio([...fotos, ...nuevas]);
    } finally {
      setComprimiendo(false);
    }
  }

  return (
    <div className="space-y-2">
      <label className="flex w-fit cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[13px] hover:bg-muted">
        {comprimiendo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
        {comprimiendo ? "Procesando…" : fotos.length > 0 ? "Agregar más fotos" : "Agregar fotos"}
        <input
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            agregar(e.target.files);
            e.target.value = "";
          }}
        />
      </label>

      {fotos.length > 0 && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-6">
          {fotos.map((f, i) => (
            <div key={`${f.nombre}-${i}`} className="space-y-1 rounded-md border p-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={f.dataUrl} alt={f.nombre} className="h-16 w-full rounded object-cover" />
              <Select
                items={Object.fromEntries(MOMENTOS_FOTO.map((m) => [m.value, m.label]))}
                value={f.momento}
                onValueChange={(v) =>
                  v && onCambio(fotos.map((x, idx) => (idx === i ? { ...x, momento: v } : x)))
                }
              >
                <SelectTrigger className="h-6 text-[10px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MOMENTOS_FOTO.map((m) => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex items-center justify-between">
                <span className="text-[9px] text-muted-foreground">{pesoLegible(f.bytes)}</span>
                <button
                  type="button"
                  onClick={() => onCambio(fotos.filter((_, idx) => idx !== i))}
                  className="rounded p-0.5 text-muted-foreground hover:bg-muted"
                  aria-label="Quitar foto"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
