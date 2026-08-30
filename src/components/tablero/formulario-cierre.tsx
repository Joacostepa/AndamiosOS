"use client";

import { useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { AlertTriangle, Camera, Check, Loader2, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { comprimirFoto, pesoLegible, type FotoComprimida } from "@/lib/tablero/imagenes";
import {
  MOTIVOS_NO_EJEC, TAREAS, TIPOS_INCIDENCIA, MOMENTOS_FOTO, horaADecimal, decimalAHora,
  DEJAN_ESTRUCTURA, asBuiltAEnviar, faltaAsBuilt,
  type DatosCierre, type EstadoParte, type LineaManoObra, type LineaIncidencia,
} from "@/lib/tablero/tipos-parte";
import { useParte, useCerrarJornada, useEditarParte, useEmpleados } from "@/hooks/use-parte";
import { useDetalleOt } from "@/hooks/use-detalle-ot";
import { ComoQuedoArmado } from "@/components/partes/como-quedo-armado";
import { CORAL } from "@/lib/tablero/colores";
import type { Bloque } from "@/lib/tablero/bloques";
import type { OtTablero } from "@/lib/tablero/tipos";

// Formulario de cierre de jornada. Se cierra por OBRA, no por jornada de la cuadrilla:
// si una cuadrilla hace tres obras el mismo día, cada una se cierra por separado con
// sus propias horas, incidencias y fotos.
//
// La app nunca manda costos ni horas-hombre: los calcula Odoo con la tarifa vigente.

const JORNADA_DESDE = 8;
const JORNADA_HASTA = 17;

type FotoEnFormulario = FotoComprimida & { momento: string };

/** base-ui muestra el VALOR crudo en el trigger salvo que se le pase el mapa de etiquetas. */
function comoItems(opciones: readonly { value: string; label: string }[]): Record<string, string> {
  return Object.fromEntries(opciones.map((o) => [o.value, o.label]));
}

/** Horas efectivas de un rango, descontando el almuerzo de 12 a 13 (igual que Odoo). */
function horasEfectivas(desde: number, hasta: number): number {
  if (hasta <= desde) return 0;
  const brutas = hasta - desde;
  const solapaAlmuerzo = Math.max(0, Math.min(hasta, 13) - Math.max(desde, 12));
  return Math.max(0, brutas - solapaAlmuerzo);
}

export function FormularioCierre({
  abierto,
  bloque,
  ot,
  /** Fecha de la jornada que se cierra (un bloque multi-día tiene varias). */
  fecha,
  asignacionId,
  parteId,
  esUltimaJornada,
  onOpenChange,
}: {
  abierto: boolean;
  bloque: Bloque | null;
  ot: OtTablero | undefined;
  fecha: string | null;
  asignacionId: number | null;
  parteId: number | null;
  /**
   * Es la última jornada de la OT que quedaba sin parte. Sólo entonces tiene sentido
   * preguntar si la obra terminó: antes la respuesta es siempre "quedan más".
   */
  esUltimaJornada: boolean;
  onOpenChange: (abierto: boolean) => void;
}) {
  const soloLectura = !!parteId;
  // El bloque puede abrirse antes de que el tablero tenga la OT en memoria.
  const tipoOt = ot?.tipo ?? "";
  const { data: parteCargado, isLoading: cargandoParte } = useParte(parteId);
  const { data: empleados } = useEmpleados();
  const cerrar = useCerrarJornada();
  const editar = useEditarParte();
  const guardando = cerrar.isPending || editar.isPending;

  const [editando, setEditando] = useState(false);
  // null = todavía no contestó. Se exige respuesta en vez de asumir: asumir que terminó
  // esconde trabajo, y asumir que no acumula OTs abiertas para siempre, que es lo que
  // venía pasando.
  const [obraFinalizada, setObraFinalizada] = useState<boolean | null>(null);
  // El as-built: si quedó como estaba previsto y, si no, qué quedó. Ver ComoQuedoArmado.
  const [armadoCoincide, setArmadoCoincide] = useState<boolean | null>(null);
  const [armadoReal, setArmadoReal] = useState("");
  const [estado, setEstado] = useState<EstadoParte>("ejecutado");
  const [fechaParte, setFechaParte] = useState("");
  const [motivo, setMotivo] = useState<string>("");
  const [cuadrillaId, setCuadrillaId] = useState<string>("");
  const [punteroId, setPunteroId] = useState<string>("");
  const [sector, setSector] = useState("");
  const [clima, setClima] = useState("");
  const [objetivo, setObjetivo] = useState("");
  const [tareas, setTareas] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [manoObra, setManoObra] = useState<LineaManoObra[]>([]);
  const [viajes, setViajes] = useState(0);
  const [camionEnObra, setCamionEnObra] = useState(false);
  const [tercerizado, setTercerizado] = useState(false);
  const [costoFlete, setCostoFlete] = useState("");
  const [incidencias, setIncidencias] = useState<LineaIncidencia[]>([]);
  const [fotos, setFotos] = useState<FotoEnFormulario[]>([]);
  const [comprimiendo, setComprimiendo] = useState(false);
  const [resultado, setResultado] = useState<{ pasos: { nombre: string; ok: boolean; detalle?: string }[]; fallidas: string[] } | null>(null);

  const enModoEdicion = !soloLectura || editando;

  // Precarga: al abrir sobre una jornada nueva, la cuadrilla de la asignación y la
  // sugerencia de fletes; sobre un parte existente, lo que ya está cargado en Odoo.
  useEffect(() => {
    if (!abierto) return;
    if (parteCargado) {
      setEstado(parteCargado.estado);
      setFechaParte(parteCargado.fecha || (fecha ?? ""));
      setMotivo(parteCargado.motivoNoEjec ?? "");
      setCuadrillaId(parteCargado.cuadrillaId ? String(parteCargado.cuadrillaId) : "");
      setPunteroId(parteCargado.punteroId ? String(parteCargado.punteroId) : "");
      setSector(parteCargado.sector ?? "");
      setClima(parteCargado.clima ?? "");
      setObjetivo(parteCargado.objetivo ?? "");
      setTareas(parteCargado.tareas ?? "");
      setObservaciones(parteCargado.observaciones ?? "");
      setManoObra(parteCargado.manoObra.map(({ tarea, personas, horaDesde, horaHasta }) => ({ tarea, personas, horaDesde, horaHasta })));
      setViajes(parteCargado.flete?.cantidad ?? 0);
      setCamionEnObra(parteCargado.camionEnObra);
      setTercerizado(parteCargado.flete?.tercerizado ?? false);
      setCostoFlete(parteCargado.flete?.costoManual ? String(parteCargado.flete.costoManual) : "");
      setIncidencias(parteCargado.incidencias);
      setFotos([]);
    } else if (!parteId) {
      setEstado("ejecutado");
      // Por defecto la fecha de la jornada que se cierra: cerrando en el día es hoy, y
      // cerrando una atrasada es el día en que realmente se trabajó, no el de la carga.
      setFechaParte(fecha ?? "");
      setMotivo("");
      setCuadrillaId(bloque?.cuadrillaId ? String(bloque.cuadrillaId) : "");
      setPunteroId("");
      setSector(""); setClima(""); setObjetivo(""); setTareas(""); setObservaciones("");
      setManoObra([]);
      setViajes(sugerenciaViajes);
      setTercerizado(false); setCostoFlete("");
      setIncidencias([]); setFotos([]);
    }
    setResultado(null);
    setEditando(false);
    setObraFinalizada(null);
    // El as-built también: el diálogo es uno solo y se reusa para todas las obras. Sin
    // esto, cerrar un armado y abrir el siguiente arrastraría el texto del anterior, que
    // es exactamente el dato que no puede estar mal.
    setArmadoCoincide(null);
    setArmadoReal("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, parteCargado, parteId, fecha]);

  // REGLA VIGENTE: menos de una jornada → 1 viaje redondo; N jornadas → N+1. Se muestra
  // como sugerencia, no se impone.
  const sugerenciaViajes = useMemo(() => {
    const j = bloque?.fechas.length ?? 1;
    return j <= 1 ? 1 : j + 1;
  }, [bloque]);

  const horasHombre = manoObra.reduce(
    (s, l) => s + horasEfectivas(l.horaDesde, l.horaHasta) * (l.personas || 0),
    0,
  );

  function agregarLinea(completa = false) {
    setManoObra((prev) => [
      ...prev,
      {
        tarea: ot?.tipo === "desarme" ? "desarme" : "armado",
        personas: completa ? Math.max(1, ot?.personalPorJornada ?? 1) : 1,
        horaDesde: JORNADA_DESDE,
        horaHasta: JORNADA_HASTA,
      },
    ]);
  }

  function actualizarLinea(i: number, cambio: Partial<LineaManoObra>) {
    setManoObra((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...cambio } : l)));
  }

  async function agregarFotos(archivos: FileList | null) {
    if (!archivos || archivos.length === 0) return;
    setComprimiendo(true);
    try {
      const nuevas: FotoEnFormulario[] = [];
      for (const archivo of Array.from(archivos)) {
        try {
          const comprimida = await comprimirFoto(archivo);
          nuevas.push({ ...comprimida, momento: "durante" });
        } catch {
          toast.error(`No se pudo procesar ${archivo.name}`);
        }
      }
      setFotos((prev) => [...prev, ...nuevas]);
    } finally {
      setComprimiendo(false);
    }
  }

  function armarDatos(): DatosCierre {
    const ejecutado = estado === "ejecutado";
    return {
      fecha: fechaParte || (fecha ?? ""),
      cuadrillaId: cuadrillaId ? Number(cuadrillaId) : null,
      punteroId: punteroId ? Number(punteroId) : null,
      camionEnObra,
      estado,
      motivoNoEjec: ejecutado ? null : motivo || null,
      sector: sector.trim() || null,
      clima: clima.trim() || null,
      objetivo: objetivo.trim() || null,
      tareas: tareas.trim() || null,
      observaciones: observaciones.trim() || null,
      manoObra: ejecutado ? manoObra : [],
      flete: ejecutado && viajes > 0
        ? { cantidad: viajes, tercerizado, costoManual: tercerizado ? Number(costoFlete) || 0 : 0 }
        : null,
      incidencias: ejecutado ? incidencias.filter((i) => i.descripcion.trim()) : [],
      fotos: ejecutado ? fotos.map((f) => ({ nombre: f.nombre, base64: f.base64, momento: f.momento })) : [],
      ejecutadoReal: asBuiltAEnviar(tipoOt, obraFinalizada === true, armadoCoincide, armadoReal, previsto),
    };
  }

  // Se pregunta sólo al CREAR el parte de la última jornada pendiente y sólo si se
  // ejecutó: si la jornada no se hizo, la obra no terminó y no hay nada que preguntar.
  const preguntarPorLaObra = !parteId && esUltimaJornada && estado === "ejecutado";

  // El detalle técnico de la OT precarga el as-built. Se pide sólo cuando hace falta:
  // la ficha es una llamada aparte y no tiene por qué salir al abrir cualquier cierre.
  const necesitaAsBuilt = preguntarPorLaObra && DEJAN_ESTRUCTURA.has(tipoOt);
  const { data: fichaOt } = useDetalleOt(necesitaAsBuilt ? (ot?.id ?? null) : null);
  const previsto = fichaOt?.detalleTecnico ?? null;

  function guardar() {
    if (estado === "no_ejecutado" && !motivo) {
      toast.error("Elegí el motivo por el que no se ejecutó");
      return;
    }
    // Sin líneas de personal el parte queda en 0 horas-hombre y sin costo de mano de
    // obra: se ve completo pero no sirve para medir nada. Se avisa antes de guardar.
    if (estado === "ejecutado" && manoObra.length === 0) {
      toast.error("Falta el personal", {
        description: "Sin líneas de personal el parte queda en 0 horas-hombre. Usá 'Jornada completa' o agregá una línea.",
      });
      return;
    }
    if (estado === "ejecutado" && !punteroId) {
      toast.error("Falta el capataz que estuvo a cargo de la jornada");
      return;
    }
    if (preguntarPorLaObra && obraFinalizada === null) {
      toast.error("Falta indicar si la orden de trabajo está finalizada");
      return;
    }
    const falta = faltaAsBuilt(tipoOt, preguntarPorLaObra && obraFinalizada === true, armadoCoincide, armadoReal, previsto);
    if (falta) {
      toast.error(falta, {
        description: "Es lo que va a leer Comercial cuando emita la OT de desarme.",
      });
      return;
    }
    const datos = armarDatos();
    const alTerminar = {
      onSuccess: (r: { pasos: { nombre: string; ok: boolean; detalle?: string }[]; fotosFallidas: string[]; reutilizado: boolean }) => {
        setResultado({ pasos: r.pasos, fallidas: r.fotosFallidas });
        if (r.fotosFallidas.length > 0) {
          toast.warning(`Jornada cerrada, pero ${r.fotosFallidas.length} foto(s) no subieron`);
        } else if (r.pasos.every((p) => p.ok)) {
          toast.success(r.reutilizado ? "Parte actualizado en Odoo" : "Jornada cerrada");
          onOpenChange(false);
        } else {
          toast.warning("La jornada se cerró con avisos");
        }
      },
      onError: (e: Error) => toast.error("No se pudo cerrar la jornada", { description: e.message }),
    };

    if (parteId && ot) editar.mutate({ parteId, otId: ot.id, datos }, alTerminar);
    else if (asignacionId) {
      cerrar.mutate({ asignacionId, datos, finalizarOt: obraFinalizada === true }, alTerminar);
    }
  }


  const titulo = ot?.titulo ?? "Jornada";
  const fechaLabel = fecha ? format(parseISO(fecha), "EEEE d 'de' MMMM", { locale: es }) : "";

  // disablePointerDismissal: un clic afuera no descarta el formulario. Es largo y
  // perder media carga por un clic al costado es peor que tener que apretar Cancelar.
  // La X, Cancelar y Escape siguen cerrando.
  return (
    <Dialog open={abierto} onOpenChange={onOpenChange} disablePointerDismissal>
      {/* Modal centrado y no panel lateral: el formulario es largo y compite con la
          grilla si comparte pantalla. El alto queda acotado y scrollea por dentro. */}
      <DialogContent className="grid max-h-[88vh] grid-rows-[auto_1fr_auto] gap-0 p-0 sm:max-w-2xl">
        <DialogHeader className="border-b px-4 py-3 text-left">
          <DialogTitle className="pr-6 text-base leading-snug">
            {soloLectura && !editando ? "Parte de la jornada" : "Cerrar jornada"}
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            {titulo} · {fechaLabel}
          </p>
        </DialogHeader>

        {cargandoParte ? (
          <div className="space-y-3 p-4">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : (
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
            {/* ── ¿Se ejecutó? Va primero porque cambia todo el resto. ── */}
            <div className="grid grid-cols-2 gap-2">
              {(["ejecutado", "no_ejecutado"] as const).map((valor) => (
                <button
                  key={valor}
                  type="button"
                  disabled={!enModoEdicion}
                  onClick={() => setEstado(valor)}
                  className={cn(
                    "rounded-md border px-3 py-2 text-sm transition-colors disabled:opacity-70",
                    estado === valor ? "text-white" : "hover:bg-muted",
                  )}
                  style={
                    estado === valor
                      ? { backgroundColor: valor === "ejecutado" ? "#639922" : "#D92D20", borderColor: "transparent" }
                      : undefined
                  }
                >
                  {valor === "ejecutado" ? "Se ejecutó" : "No se ejecutó"}
                </button>
              ))}
            </div>

            <div className="space-y-1.5">
              <Label>Fecha del parte</Label>
              <Input
                type="date"
                value={fechaParte}
                onChange={(e) => setFechaParte(e.target.value)}
                disabled={!enModoEdicion}
                className="w-44"
              />
              {fecha && fechaParte && fechaParte !== fecha && (
                <p className="text-[11px]" style={{ color: CORAL }}>
                  Distinta de la jornada planificada ({format(parseISO(fecha), "EEE d MMM", { locale: es })}).
                  El parte se va a registrar en la fecha elegida.
                </p>
              )}
            </div>

            {estado === "no_ejecutado" ? (
              <>
                <div className="space-y-1.5">
                  <Label>Motivo *</Label>
                  <Select items={comoItems(MOTIVOS_NO_EJEC)} value={motivo} onValueChange={(v) => setMotivo(v ?? "")} disabled={!enModoEdicion}>
                    <SelectTrigger>
                      <SelectValue placeholder="¿Por qué no se ejecutó?" />
                    </SelectTrigger>
                    <SelectContent>
                      {MOTIVOS_NO_EJEC.map((m) => (
                        <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Observaciones</Label>
                  <Textarea
                    value={observaciones}
                    onChange={(e) => setObservaciones(e.target.value)}
                    disabled={!enModoEdicion}
                    rows={3}
                  />
                </div>
                <p className="rounded-md border border-dashed p-2 text-xs text-muted-foreground">
                  No se cargan horas, fletes ni fotos. El costo del día es cero, pero la jornada
                  queda registrada para poder medir cuántas se pierden y por qué.
                </p>
              </>
            ) : (
              <>
                {/* ── Datos del día ── */}
                {/* La cuadrilla no se pregunta: se guarda la que estaba planificada. "Cuadrilla 3"
                    es una etiqueta que cambia de integrantes todos los días; quien responde por la
                    jornada es una persona, y ese es el dato que se carga. La cuadrilla sigue
                    viajando al parte porque el informe de obra la usa. */}
                <div className="space-y-1.5">
                  <Label>Capataz</Label>
                  <Select
                    items={Object.fromEntries((empleados ?? []).map((e) => [String(e.id), e.nombre]))}
                    value={punteroId}
                    onValueChange={(v) => setPunteroId(v ?? "")}
                    disabled={!enModoEdicion}
                  >
                    <SelectTrigger><SelectValue placeholder="Quién estuvo a cargo" /></SelectTrigger>
                    <SelectContent className="max-h-[50vh]">
                      {(empleados ?? []).map((e) => (
                        <SelectItem key={e.id} value={String(e.id)}>
                          {e.nombre}{e.escala ? ` · ${e.escala}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label>Frente / sector</Label>
                  <Input value={sector} onChange={(e) => setSector(e.target.value)} disabled={!enModoEdicion} />
                </div>

                <div className="space-y-1.5">
                  <Label>Clima</Label>
                  <Input value={clima} onChange={(e) => setClima(e.target.value)} disabled={!enModoEdicion} />
                </div>

                <div className="grid grid-cols-1 gap-3">
                  <div className="space-y-1.5">
                    <Label>Objetivo del día</Label>
                    <Textarea value={objetivo} onChange={(e) => setObjetivo(e.target.value)} disabled={!enModoEdicion} rows={2} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Tareas ejecutadas</Label>
                    <Textarea value={tareas} onChange={(e) => setTareas(e.target.value)} disabled={!enModoEdicion} rows={2} />
                  </div>
                </div>

                <Separator />

                {/* ── Personal y horarios ── */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Personal y horarios</Label>
                    <span
                      className="text-xs"
                      style={{ color: horasHombre > 0 ? "var(--muted-foreground)" : CORAL }}
                    >
                      {horasHombre > 0 ? `${horasHombre} horas-hombre` : "falta cargar"}
                    </span>
                  </div>

                  {manoObra.length > 0 && (
                    <div className="grid grid-cols-[minmax(100px,1fr)_68px_128px_128px_28px] gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                      <span>Tarea</span>
                      <span>Personas</span>
                      <span>Desde</span>
                      <span>Hasta</span>
                      <span />
                    </div>
                  )}
                  {manoObra.map((l, i) => (
                    <div key={i} className="grid grid-cols-[minmax(100px,1fr)_68px_128px_128px_28px] items-end gap-1.5">
                      <Select
                        items={comoItems(TAREAS)}
                        value={l.tarea}
                        onValueChange={(v) => v && actualizarLinea(i, { tarea: v })}
                        disabled={!enModoEdicion}
                      >
                        <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {TAREAS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Input
                        type="number" min={1} value={l.personas} disabled={!enModoEdicion}
                        onChange={(e) => actualizarLinea(i, { personas: Number(e.target.value) })}
                        title="Personas"
                      />
                      <Input
                        type="time" value={decimalAHora(l.horaDesde)} disabled={!enModoEdicion}
                        onChange={(e) => actualizarLinea(i, { horaDesde: horaADecimal(e.target.value) })}
                        title="Hora de inicio"
                      />
                      <Input
                        type="time" value={decimalAHora(l.horaHasta)} disabled={!enModoEdicion}
                        onChange={(e) => actualizarLinea(i, { horaHasta: horaADecimal(e.target.value) })}
                        title="Hora de fin"
                      />
                      {enModoEdicion && (
                        <button
                          type="button"
                          onClick={() => setManoObra((p) => p.filter((_, idx) => idx !== i))}
                          className="mb-1 rounded p-1 text-muted-foreground hover:bg-muted"
                          aria-label="Quitar línea"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ))}

                  {enModoEdicion && (
                    <div className="flex gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={() => agregarLinea(false)}>
                        <Plus className="mr-1 h-3.5 w-3.5" /> Línea
                      </Button>
                      <Button type="button" variant="outline" size="sm" onClick={() => agregarLinea(true)}>
                        Jornada completa ({ot?.personalPorJornada || 1}p · 8–17)
                      </Button>
                    </div>
                  )}
                  <p className="text-[11px] text-muted-foreground">
                    Odoo descuenta el almuerzo de 12 a 13 al calcular las horas-hombre.
                  </p>
                </div>

                <Separator />

                {/* ── Fletes ── */}
                <div className="space-y-2">
                  <Label>Fletes</Label>
                  <div className="flex items-center gap-3">
                    <Input
                      type="number" min={0} value={viajes} disabled={!enModoEdicion}
                      onChange={(e) => setViajes(Number(e.target.value))}
                      className="w-20"
                      title="Viajes redondos"
                    />
                    <span className="text-xs text-muted-foreground">
                      viajes redondos · sugerido {sugerenciaViajes}
                    </span>
                  </div>
                  {/* En el parte y no en la línea de flete: la línea no existe con cero
                      viajes, y el camión que se queda es un hecho del día igual. */}
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={camionEnObra}
                      onCheckedChange={(v) => setCamionEnObra(v === true)}
                      disabled={!enModoEdicion}
                      id="camion-en-obra"
                    />
                    <Label htmlFor="camion-en-obra" className="text-sm font-normal">
                      El camión quedó en obra
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={tercerizado}
                      onCheckedChange={(v) => setTercerizado(v === true)}
                      disabled={!enModoEdicion}
                      id="tercerizado"
                    />
                    <Label htmlFor="tercerizado" className="text-sm font-normal">Tercerizado</Label>
                    {tercerizado && (
                      <Input
                        type="number" min={0} value={costoFlete} disabled={!enModoEdicion}
                        onChange={(e) => setCostoFlete(e.target.value)}
                        placeholder="Costo real"
                        className="ml-2 w-32"
                      />
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    El costo del flete propio lo calcula Odoo con la tarifa vigente.
                  </p>
                </div>

                <Separator />

                {/* ── Incidencias ── */}
                <div className="space-y-2">
                  <Label>Incidencias</Label>
                  {incidencias.map((inc, i) => (
                    <div key={i} className="grid grid-cols-[minmax(120px,190px)_1fr_28px] items-end gap-1.5">
                      <Select
                        items={comoItems(TIPOS_INCIDENCIA)}
                        value={inc.tipo}
                        onValueChange={(v) =>
                          v && setIncidencias((p) => p.map((x, idx) => (idx === i ? { ...x, tipo: v } : x)))
                        }
                        disabled={!enModoEdicion}
                      >
                        <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {TIPOS_INCIDENCIA.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Input
                        value={inc.descripcion} disabled={!enModoEdicion}
                        onChange={(e) =>
                          setIncidencias((p) => p.map((x, idx) => (idx === i ? { ...x, descripcion: e.target.value } : x)))
                        }
                        placeholder="Qué pasó"
                      />
                      {enModoEdicion && (
                        <button
                          type="button"
                          onClick={() => setIncidencias((p) => p.filter((_, idx) => idx !== i))}
                          className="mb-1 rounded p-1 text-muted-foreground hover:bg-muted"
                          aria-label="Quitar incidencia"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                  {enModoEdicion && (
                    <Button
                      type="button" variant="outline" size="sm"
                      onClick={() => setIncidencias((p) => [...p, { tipo: "clima", descripcion: "" }])}
                    >
                      <Plus className="mr-1 h-3.5 w-3.5" /> Incidencia
                    </Button>
                  )}
                </div>

                <Separator />

                {/* ── Fotos ── */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Fotos</Label>
                    {parteCargado && parteCargado.fotos.length > 0 && (
                      <span className="text-xs text-muted-foreground">
                        {parteCargado.fotos.length} ya cargada(s) en Odoo
                      </span>
                    )}
                  </div>

                  {enModoEdicion && (
                    <label className="flex w-fit cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm hover:bg-muted">
                      {comprimiendo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                      {comprimiendo ? "Procesando…" : "Agregar fotos"}
                      <input
                        type="file" accept="image/*" multiple className="hidden"
                        onChange={(e) => {
                          agregarFotos(e.target.files);
                          e.target.value = "";
                        }}
                      />
                    </label>
                  )}

                  {fotos.length > 0 && (
                    <div className="grid grid-cols-3 gap-2">
                      {fotos.map((f, i) => (
                        <div key={i} className="space-y-1 rounded-md border p-1">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={f.dataUrl} alt={f.nombre} className="h-16 w-full rounded object-cover" />
                          <Select
                            items={comoItems(MOMENTOS_FOTO)}
                            value={f.momento}
                            onValueChange={(v) =>
                              v && setFotos((p) => p.map((x, idx) => (idx === i ? { ...x, momento: v } : x)))
                            }
                          >
                            <SelectTrigger className="h-6 text-[10px]"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {MOMENTOS_FOTO.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          <div className="flex items-center justify-between">
                            <span className="text-[9px] text-muted-foreground">{pesoLegible(f.bytes)}</span>
                            <button
                              type="button"
                              onClick={() => setFotos((p) => p.filter((_, idx) => idx !== i))}
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
              </>
            )}

            {/* ── ¿Terminó la obra? ──
                Sólo en la última jornada que quedaba sin parte. Es el único momento en
                que quien carga tiene el dato: acaba de leer lo que mandó el capataz. Que
                lo decida una persona y no la duración estimada, que se equivoca seguido:
                cerrar sola una obra que sigue en pie la borraría del tablero. */}
            {preguntarPorLaObra && (
              <div className="space-y-2 rounded-md border p-3" style={{ borderColor: CORAL }}>
                <p className="text-sm font-medium">
                  Es la última jornada planificada de esta obra
                </p>
                <p className="text-xs text-muted-foreground">
                  ¿La orden de trabajo está finalizada o quedan más jornadas?
                </p>
                <div className="flex gap-2 pt-0.5">
                  <Button
                    type="button"
                    variant={obraFinalizada === true ? "default" : "outline"}
                    size="sm"
                    onClick={() => setObraFinalizada(true)}
                    style={obraFinalizada === true ? { backgroundColor: CORAL, color: "#fff" } : undefined}
                  >
                    Está finalizada
                  </Button>
                  <Button
                    type="button"
                    variant={obraFinalizada === false ? "default" : "outline"}
                    size="sm"
                    onClick={() => setObraFinalizada(false)}
                    style={obraFinalizada === false ? { backgroundColor: CORAL, color: "#fff" } : undefined}
                  >
                    Quedan más jornadas
                  </Button>
                </div>
                {obraFinalizada === true && (
                  <p className="text-[11px] text-muted-foreground">
                    La OT pasa a completada y sale del tablero.
                  </p>
                )}
                {obraFinalizada === true && DEJAN_ESTRUCTURA.has(tipoOt) && (
                  <ComoQuedoArmado
                    previsto={previsto}
                    coincide={armadoCoincide}
                    texto={armadoReal}
                    onCoincide={(v) => {
                      setArmadoCoincide(v);
                      if (v === false && !armadoReal) setArmadoReal(previsto ?? "");
                    }}
                    onTexto={setArmadoReal}
                  />
                )}
                {obraFinalizada === false && (
                  <p className="text-[11px] text-muted-foreground">
                    La OT sigue abierta. Agregale las jornadas que faltan desde el tablero.
                  </p>
                )}
              </div>
            )}

            {/* ── Qué se guardó y qué no ── */}
            {resultado && (
              <div className="space-y-1 rounded-md border p-2.5">
                <p className="text-xs font-medium">Resultado del guardado</p>
                {resultado.pasos.map((p, i) => (
                  <p key={i} className="flex items-center gap-1.5 text-xs">
                    {p.ok ? (
                      <Check className="h-3 w-3" style={{ color: "#639922" }} />
                    ) : (
                      <AlertTriangle className="h-3 w-3" style={{ color: "#D92D20" }} />
                    )}
                    <span className={p.ok ? "" : "font-medium"}>{p.nombre}</span>
                    {p.detalle && <span className="text-muted-foreground">· {p.detalle}</span>}
                  </p>
                ))}
                {resultado.fallidas.length > 0 && (
                  <p className="pt-1 text-xs" style={{ color: CORAL }}>
                    No subieron: {resultado.fallidas.join(", ")}. Podés reintentar solo esas.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        <div className="flex items-center gap-2 border-t px-4 py-3">
          {soloLectura && !editando ? (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cerrar</Button>
              <Button className="ml-auto" onClick={() => setEditando(true)}>Editar parte</Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={guardando}>
                Cancelar
              </Button>
              <Button
                className="ml-auto"
                onClick={guardar}
                disabled={guardando || comprimiendo}
                style={{ backgroundColor: CORAL, color: "#fff" }}
              >
                {guardando && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                {parteId ? "Guardar cambios" : "Cerrar jornada"}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
