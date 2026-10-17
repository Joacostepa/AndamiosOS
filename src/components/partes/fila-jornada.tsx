"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, ArrowDown, ArrowUp, Camera, Check, ChevronDown, ChevronRight, Loader2, MoreHorizontal, Square, Users, X } from "lucide-react";
import { addDays, format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { AVISO, colorTipo, CORAL, PELIGRO_TEXTO } from "@/lib/tablero/colores";
import { textoChipApoyo } from "@/lib/tablero/apoyo";
import { direccionDeObra } from "@/lib/tablero/titulo";
import { fraccionLabel } from "@/lib/tablero/fracciones";
import {
  ATAJOS_SALIDA,
  cruzaMedianoche,
  duracionTurno,
  formatHora,
  horasEfectivas,
  MAX_HORAS_TURNO,
  parseHora,
} from "@/lib/tablero/horas";
import {
  MOMENTOS_FOTO, MOTIVOS_NO_EJEC, TIPOS_INCIDENCIA, DEJAN_ESTRUCTURA, faltaAsBuilt,
} from "@/lib/tablero/tipos-parte";
import { comprimirFoto, pesoLegible, type FotoComprimida } from "@/lib/tablero/imagenes";
import { useEditarParte, useEmpleados } from "@/hooks/use-parte";
import { usePrecargaCierre } from "@/hooks/use-hoja-dia";
import { ComoQuedoArmado } from "@/components/partes/como-quedo-armado";
import { SelectorCapataz } from "@/components/partes/selector-capataz";
import { apoyosSinGente, datosDeParteCargado } from "@/lib/partes/apoyos";
import type { ApoyoListado, JornadaListado } from "@/lib/tablero/tipos-jornada";
import type { ParteCargado } from "@/lib/tablero/tipos-parte";

// Una fila del listado de partes. Se edita EN LÍNEA, sin modal: abrir y cerrar un diálogo
// cinco veces cada mañana es la fricción que hace que la gente vuelva a la planilla.
//
// Plegada muestra lo que ya sabemos del plan; se despliega sólo la excepción.

export type Borrador = {
  estado: "ejecutado" | "no_ejecutado";
  motivo: string;
  reprogramarA: string;
  /**
   * La cuadrilla NO se pregunta: se arrastra de lo planificado. Sigue viajando al parte
   * porque el informe de obra la usa, pero elegir "Cuadrilla 1..5" a mano no describía
   * nada — las cuadrillas se arman y se desarman todos los días.
   */
  cuadrillaId: string;
  /** Quién estuvo a cargo. Es el dato que sí identifica quién hizo la jornada. */
  capatazId: string;
  /** El camión no volvió: se quedó en la obra. Con el desde/hasta salen las horas paradas. */
  camionEnObra: boolean;
  /** Texto y no número: tiene que poder estar VACÍO cuando la OT no trae dotación. */
  personas: string;
  desde: string;
  hasta: string;
  fletes: string;
  /**
   * Viajes de OTRO camión, una línea de flete cada uno: el del apoyo, si fue con el suyo
   * (decisión 5 del 17/10). A mano: nunca se precargan ni se duplican.
   */
  fletesExtra?: string[];
  tercerizado: boolean;
  costoFlete: string;
  observaciones: string;
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
  /** El as-built: ¿quedó como estaba previsto? null = todavía no contestó. */
  armadoCoincide: boolean | null;
  /** Qué quedó armado, cuando NO coincide con lo previsto. */
  armadoReal: string;
  /**
   * Las cuadrillas de apoyo de la obra ese día (docs/tablero-planificacion/apoyo.md). El
   * parte es uno solo: la gente de cada apoyo va en su propio renglón, con su cuadrilla, y
   * al guardar se cierra también su jornada. Vacío casi siempre.
   */
  apoyos: BorradorApoyo[];
};

/**
 * Un apoyo dentro del borrador. Mismos campos de texto que la principal, por lo mismo:
 * las personas tienen que poder estar VACÍAS.
 */
export type BorradorApoyo = {
  asignacionId: number;
  cuadrillaId: number | null;
  /** "Cuadrilla 3", para los avisos y la sub-fila. */
  nombre: string;
  fraccion: number;
  /**
   * El tilde "fue". Destildado, la jornada del apoyo SE BORRA al guardar (decisión del
   * 17/10): no queda pegada a un parte en el que no trabajó, ni se reprograma sola.
   */
  fue: boolean;
  /**
   * Si el parte sale "no ejecutado" y se reprograma, ¿se vuelve a crear este apoyo en la
   * fecha nueva? Tildado de entrada (apoyo.md, etapa 3): el día que se perdió necesitaba
   * las dos cuadrillas, y el que se reprograma también, salvo que se diga lo contrario.
   */
  recrear: boolean;
  /** Las personas y el horario ya los completó la Hoja del día de esa cuadrilla (una vez). */
  deHoja?: boolean;
  personas: string;
  desde: string;
  hasta: string;
};

/**
 * El apoyo, listo para el borrador.
 *
 * Las personas arrancan VACÍAS: las completa la Hoja del día de la otra cuadrilla cuando se
 * abre la fila (ver FilaJornada) y, si no tuvo hoja, quedan para cargar a mano: inventar
 * una dotación es inventar horas-hombre que van al costo. El horario sí se precarga, según
 * la fracción: el día entero de 8 a 17, ½ de 13 a 17.
 */
export function borradorApoyoDe(a: ApoyoListado): BorradorApoyo {
  return {
    asignacionId: a.asignacionId,
    cuadrillaId: a.cuadrillaId,
    nombre: a.cuadrillaNombre ?? "Cuadrilla de apoyo",
    fraccion: a.fraccion,
    fue: true,
    recrear: true,
    personas: "",
    desde: formatHora(a.horarioSugerido.horaDesde),
    hasta: formatHora(a.horarioSugerido.horaHasta),
  };
}

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
    capatazId: "",
    camionEnObra: false,
    personas: j.personalPrevisto > 0 ? String(j.personalPrevisto) : "",
    desde: "08:00",
    hasta: "17:00",
    fletes: String(j.fleteSugerido),
    fletesExtra: [],
    tercerizado: false,
    costoFlete: "",
    observaciones: "",
    incidenciaTipo: "",
    incidenciaDesc: "",
    fotos: [],
    finalizarOt: null,
    armadoCoincide: null,
    armadoReal: "",
    // Sólo los que todavía no tienen parte: uno colgado de otro parte es historia (los
    // casos viejos de dos cuadrillas con dos partes) y el cierre no lo toca.
    apoyos: (j.apoyos ?? []).filter((a) => a.parteId === null).map(borradorApoyoDe),
  };
}

/** Todos los viajes del parte: el flete del parte y los de otro camión (el del apoyo). */
function fletesDelParte(parte: ParteCargado): number {
  return (parte.flete?.cantidad ?? 0) + (parte.fletesExtra ?? []).reduce((s, f) => s + f.cantidad, 0);
}

/** Horas-hombre de un renglón de texto. 0 si todavía no se entiende. */
function horasHombreRenglon(personas: string, desdeTxt: string, hastaTxt: string): number {
  const d = parseHora(desdeTxt);
  const h = parseHora(hastaTxt);
  const p = Number(personas);
  if (d === null || h === null || !Number.isFinite(p) || p <= 0) return 0;
  return horasEfectivas(d, h) * p;
}

/**
 * Horas-hombre del borrador, con el mismo cálculo que hace Odoo (sin la hora de almuerzo).
 * Incluye a los apoyos que fueron: el parte es uno solo y su total es el de toda la gente.
 */
export function horasHombreDe(b: Borrador): number {
  const principal = horasHombreRenglon(b.personas, b.desde, b.hasta);
  if (b.estado !== "ejecutado") return principal;
  return (b.apoyos ?? []).reduce(
    (s, a) => (a.fue ? s + horasHombreRenglon(a.personas, a.desde, a.hasta) : s),
    principal,
  );
}

/** Lo que le falta a un renglón de horario. Compartido entre la principal y los apoyos. */
function erroresHorario(desdeTxt: string, hastaTxt: string): string[] {
  const e: string[] = [];
  const d = parseHora(desdeTxt);
  const h = parseHora(hastaTxt);
  if (d === null) e.push("Hora de entrada inválida");
  if (h === null) e.push("Hora de salida inválida");
  // Una salida ANTERIOR a la entrada ya no es un error: es el turno de noche, que termina
  // al día siguiente. Lo que sí se rechaza es lo que no se puede interpretar.
  if (d !== null && h !== null) {
    if (h === d) {
      e.push("La entrada y la salida no pueden ser la misma hora");
    } else if (duracionTurno(d, h) > MAX_HORAS_TURNO) {
      // El error natural al aceptar turnos nocturnos: escribir 17 en "desde" y 8 en
      // "hasta". El mensaje nombra el caso en vez de decir sólo que está mal.
      // Horas decimales y no "15:00": acá el número es una CANTIDAD, no un horario, y
      // escribirlo con dos puntos lo haría leer como una hora del reloj.
      const horas = duracionTurno(d, h).toFixed(1).replace(".0", "").replace(".", ",");
      e.push(`El turno da ${horas} h: ¿se cambiaron de lugar la entrada y la salida?`);
    }
  }
  return e;
}

/** Qué le falta al borrador para poder guardarse. Vacío = está listo. */
export function erroresDe(b: Borrador, j: JornadaListado): string[] {
  const e: string[] = [];
  if (b.estado === "no_ejecutado") {
    if (!b.motivo) e.push("Falta el motivo");
    return e;
  }
  e.push(...erroresHorario(b.desde, b.hasta));
  const p = Number(b.personas);
  if (!b.personas.trim() || !Number.isFinite(p) || p <= 0) e.push("Falta la cantidad de personas");
  // Cada apoyo que fue necesita su gente: guardarlo vacío sería cerrarle la jornada con
  // cero horas-hombre, una cuadrilla entera trabajando gratis en el costo de la obra. El
  // que no sabe si fue destilda "fue" o deja la fila como borrador.
  for (const a of b.apoyos ?? []) {
    if (!a.fue) continue;
    const pa = Number(a.personas);
    if (!a.personas.trim() || !Number.isFinite(pa) || pa <= 0) e.push(`Faltan las personas del apoyo ${a.nombre}`);
    for (const err of erroresHorario(a.desde, a.hasta)) e.push(`${a.nombre}: ${err.charAt(0).toLowerCase()}${err.slice(1)}`);
  }
  if (!b.capatazId) e.push("Falta el capataz");
  if (j.ultimaDeLaOt && b.finalizarOt === null) e.push("Falta decir si la OT está finalizada");
  const faltaAs = faltaAsBuilt(
    j.tipo, j.ultimaDeLaOt && b.finalizarOt === true, b.armadoCoincide, b.armadoReal, j.detalleTecnico,
  );
  if (faltaAs) e.push(faltaAs);
  return e;
}

const ICONO_TIPO = { arriba: ArrowUp, abajo: ArrowDown, otro: MoreHorizontal } as const;

/** "Cuadrilla 3" → "C3", para el chip "+C3 ½" de la fila plegada (igual que la tarjeta del tablero). */
function cuadrillaCorta(nombre: string | null): string {
  if (!nombre) return "apoyo";
  return nombre.replace(/^cuadrilla\s*/i, "C");
}

/**
 * Ámbar de aviso: lo mismo que el "sin confirmar" de la fila. Los tokens y no hex fijos:
 * con el tema oscuro el beige claro quedaba con letras casi blancas encima.
 */
const AMBAR_FONDO = AVISO.fondo;
const AMBAR_TEXTO = AVISO.texto;

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
  // La lista de empleados cambia muy poco y el hook la cachea, así que pedirla por fila
  // no cuesta: todas las filas comparten la misma query.
  //
  // El error NO se puede ignorar: el capataz es obligatorio para guardar y sale de acá.
  // Con Odoo caído la lista viene vacía, no hay nada para elegir, y el único cartel era
  // "Falta el capataz" en rojo para siempre — sin decir que el problema no es del que
  // está cargando ni que reintentar sirve.
  const { data: empleados, isError: fallaronEmpleados, isLoading: cargandoEmpleados, refetch: recargarEmpleados } =
    useEmpleados();
  const tipo = colorTipo(jornada.tipo);
  const IconoTipo = ICONO_TIPO[tipo.icono];
  const direccion = direccionDeObra(jornada);
  const cuadrillaPlan = cuadrillas.find((c) => c.id === jornada.cuadrillaId)?.nombre ?? "sin cuadrilla";
  const parte = jornada.parte;
  const cargado = !!parte;
  const noEjecutado = parte?.estado === "no_ejecutado";
  const sinGente = parte ? apoyosSinGente(parte, jornada.apoyos ?? []) : [];
  const nombreCuadrilla = (id: number | null) =>
    cuadrillas.find((c) => c.id === id)?.nombre ??
    jornada.apoyos?.find((a) => a.cuadrillaId === id)?.cuadrillaNombre ??
    null;

  const set = (cambio: Partial<Borrador>) => borrador && onCambio({ ...borrador, ...cambio });
  const hh = borrador ? horasHombreDe(borrador) : 0;

  // LA GENTE DEL APOYO SEGÚN SU HOJA DEL DÍA (apoyo.md, etapa 3). Se pide sólo con la fila
  // abierta y algún apoyo todavía sin personas, y se aplica UNA vez por apoyo: si después
  // alguien borra el número, no se le vuelve a escribir encima. Si la hoja de esa cuadrilla
  // trae varios horarios (llegó gente más tarde), se suman las personas y se toma el
  // horario del grupo más grande: el renglón del borrador es uno solo y se puede corregir.
  const faltaGenteApoyo = abierta && !!borrador && borrador.estado === "ejecutado" &&
    borrador.apoyos.some((a) => a.fue && !a.personas.trim());
  const { data: precargaHoja } = usePrecargaCierre(
    faltaGenteApoyo ? jornada.cuadrillaId : null,
    faltaGenteApoyo ? jornada.fecha : null,
    jornada.otId,
  );
  useEffect(() => {
    if (!borrador || !precargaHoja?.apoyos?.length) return;
    let cambio = false;
    const apoyos = borrador.apoyos.map((a) => {
      if (a.personas.trim() || a.deHoja) return a;
      const h = precargaHoja.apoyos.find((x) => x.asignacionId === a.asignacionId);
      if (!h?.hayHoja || h.manoObra.length === 0) return a;
      const total = h.manoObra.reduce((s, l) => s + l.personas, 0);
      const mayor = [...h.manoObra].sort((x, y) => y.personas - x.personas)[0];
      cambio = true;
      return { ...a, personas: String(total), desde: mayor.desde, hasta: mayor.hasta, deHoja: true };
    });
    if (cambio) onCambio({ ...borrador, apoyos });
  }, [precargaHoja, borrador, onCambio]);

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

        {/* Los apoyos van adentro de la obra, no como fila propia: el parte es uno solo.
            El chip dice que hay más gente que la de la cuadrilla de la fila. */}
        {/* El mismo texto que la tarjeta del tablero ("+C3", "+C3 ½"). En pantallas
            angostas se juntan en uno ("+2 apoyos"): de a uno le comían el ancho a la
            dirección hasta hacerla desaparecer. */}
        {jornada.apoyos?.map((a) => (
          <span
            key={a.asignacionId}
            className="hidden shrink-0 rounded border border-dashed px-1 text-[10px] font-medium text-muted-foreground sm:inline"
            title={`Apoyo ${a.cuadrillaNombre ?? ""} · ${fraccionLabel(a.fraccion)} de jornada`}
          >
            {textoChipApoyo(cuadrillaCorta(a.cuadrillaNombre), [a.fraccion], 1)}
          </span>
        ))}
        {(jornada.apoyos?.length ?? 0) > 0 && (
          <span
            className="shrink-0 rounded border border-dashed px-1 text-[10px] font-medium text-muted-foreground sm:hidden"
            title={jornada.apoyos!.map((a) => `Apoyo ${a.cuadrillaNombre ?? ""} · ${fraccionLabel(a.fraccion)} de jornada`).join(" · ")}
          >
            {jornada.apoyos!.length === 1
              ? textoChipApoyo(cuadrillaCorta(jornada.apoyos![0].cuadrillaNombre), [jornada.apoyos![0].fraccion], 1)
              : `+${jornada.apoyos!.length} apoyos`}
          </span>
        )}

        <IconoTipo className="h-3.5 w-3.5 shrink-0" style={{ color: tipo.text }} aria-hidden />

        <span className="min-w-[5rem] flex-1 truncate text-[13px]" title={jornada.titulo}>
          {direccion}
          {/* La referencia va en la MISMA línea y atenuada: la fila es de una sola
              altura y un renglón extra rompería la densidad del listado. */}
          {jornada.referenciaObra && (
            <span className="text-muted-foreground"> · {jornada.referenciaObra}</span>
          )}
        </span>

        {sinGente.length > 0 && (
          <span
            className="flex shrink-0 items-center gap-0.5 rounded px-1 text-[10px] font-semibold"
            style={{ backgroundColor: AMBAR_FONDO, color: AMBAR_TEXTO }}
            title="El apoyo se sumó después de cargar el parte: falta su gente"
          >
            <AlertTriangle className="h-3 w-3" />
            sumá {sinGente.map((a) => cuadrillaCorta(a.cuadrillaNombre)).join(", ")}
          </span>
        )}

        {jornada.tentativaVencida && (
          <span className="shrink-0 rounded px-1 text-[10px] font-semibold" style={{ backgroundColor: AMBAR_FONDO, color: AMBAR_TEXTO }}>
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
              {/* Con apoyo el parte tiene un renglón por cuadrilla: las personas son la
                  suma, el horario el de la principal. */}
              {parte.manoObra.reduce((s, l) => s + l.personas, 0)}p ·{" "}
              {formatHora(parte.manoObra[0]?.horaDesde ?? 8)}–{formatHora(parte.manoObra[0]?.horaHasta ?? 17)}
              {fletesDelParte(parte) > 0 ? ` · ${fletesDelParte(parte)} flete` : ""}
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
          <QueHayQueEjecutar jornada={jornada} />
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
                <span className="text-[11px] font-medium">Observaciones</span>
                <Textarea
                  rows={2}
                  value={borrador.observaciones}
                  onChange={(e) => set({ observaciones: e.target.value })}
                  placeholder="Cualquier cosa del día que valga la pena registrar"
                />
              </label>
              {/* El día se perdió para todos: el apoyo queda registrado con el mismo parte,
                  como la principal. No es un apoyo que "no fue" —ése se borra— y por eso
                  no se ofrece el tilde. */}
              {borrador.apoyos.length > 0 && (
                <div className="space-y-1 sm:col-span-2">
                  <p className="text-[11px] text-muted-foreground">
                    {borrador.apoyos.map((a) => a.nombre).join(" y ")}{" "}
                    {borrador.apoyos.length === 1 ? "iba de apoyo: queda registrado" : "iban de apoyo: quedan registrados"}{" "}
                    con este parte.
                  </p>
                  {/* Al reprogramar se ofrece recrear el apoyo, tildado de entrada. */}
                  {borrador.reprogramarA &&
                    borrador.apoyos.map((a) => (
                      <label key={a.asignacionId} className="flex items-center gap-2 text-[12px]">
                        <Checkbox
                          checked={a.recrear}
                          onCheckedChange={(v) =>
                            set({
                              apoyos: borrador.apoyos.map((x) =>
                                x.asignacionId === a.asignacionId ? { ...x, recrear: v === true } : x,
                              ),
                            })
                          }
                        />
                        Recrear también el apoyo de {a.nombre} ({fraccionLabel(a.fraccion)}) el{" "}
                        {format(parseISO(borrador.reprogramarA), "EEE d MMM", { locale: es })}
                      </label>
                    ))}
                </div>
              )}
            </div>
          ) : (
            <>
              {/* ── Personal y horario ── */}
              {/* Con apoyo, cada renglón dice de qué cuadrilla es: el parte lleva uno por
                  cuadrilla (x_cuadrilla_id en la mano de obra). */}
              {borrador.apoyos.length > 0 && (
                <p className="text-[11px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
                  {cuadrillaPlan}
                </p>
              )}
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

                {/* La única señal de que se entendió que el turno cruza la medianoche.
                    Como no hay casilla que marcar, esto es lo que separa un turno de
                    noche de un error de tipeo: si aparece sin que se haya trabajado de
                    noche, quien carga lo ve y corrige. Va pegado al campo "Hasta", que es
                    el que cambia de significado. */}
                {desde !== null && hasta !== null && cruzaMedianoche(desde, hasta) && (
                  <span className="pb-1.5 text-[11px] font-medium text-muted-foreground">
                    +1 día · termina el {format(addDays(parseISO(jornada.fecha), 1), "d/M")}
                  </span>
                )}

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

              {borrador.apoyos.map((a, i) => (
                <SubFilaApoyo
                  key={a.asignacionId}
                  apoyo={a}
                  fecha={jornada.fecha}
                  deHoja={a.deHoja === true}
                  onCambio={(cambio) =>
                    set({ apoyos: borrador.apoyos.map((x, idx) => (idx === i ? { ...x, ...cambio } : x)) })
                  }
                />
              ))}

              {/* ── Capataz y fletes ── */}
              <div className="grid gap-3 sm:grid-cols-2">
                {/* El capataz reemplaza a la cuadrilla: "Cuadrilla 3" es una etiqueta que
                    cambia de integrantes todos los días, y el que responde por la jornada
                    es una persona. Sale de la base de empleados de Odoo, ordenada por
                    escala, así que los capataces quedan arriba de la lista. */}
                <label className="space-y-1">
                  <span className="text-[11px] font-medium">Capataz</span>
                  <SelectorCapataz
                    empleados={empleados ?? []}
                    valor={borrador.capatazId}
                    onCambio={(id) => set({ capatazId: id })}
                    cargando={cargandoEmpleados}
                    error={fallaronEmpleados}
                    onReintentar={() => recargarEmpleados()}
                  />
                </label>
                <div className="space-y-1">
                  <span className="text-[11px] font-medium">Viajes de flete</span>
                  <div className="flex items-center gap-3">
                    <Input
                      className="h-8 w-20"
                      inputMode="numeric"
                      value={borrador.fletes}
                      onChange={(e) => set({ fletes: e.target.value.replace(/[^\d]/g, "") })}
                    />
                    {/* Va acá y no en la línea de flete: el camión que se queda es un hecho
                        del día, y la línea de flete ni siquiera existe con cero viajes. */}
                    <label className="flex items-center gap-1.5 text-[11px]">
                      <Checkbox
                        checked={borrador.camionEnObra}
                        onCheckedChange={(v) => set({ camionEnObra: v === true })}
                      />
                      Quedó en obra
                    </label>
                  </div>
                  {/* Un solo flete por parte, también con apoyo: el que se precarga es el de
                      la obra y no se duplica por cuadrilla. Si el apoyo fue con su camión,
                      sus viajes se suman acá a mano. */}
                  {(borrador.fletesExtra ?? []).map((v, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Input
                        className="h-8 w-20"
                        inputMode="numeric"
                        value={v}
                        onChange={(e) =>
                          set({
                            fletesExtra: (borrador.fletesExtra ?? []).map((x, idx) =>
                              idx === i ? e.target.value.replace(/[^\d]/g, "") : x,
                            ),
                          })
                        }
                        aria-label="Viajes del camión del apoyo"
                      />
                      <span className="text-[11px] text-muted-foreground">viajes del camión del apoyo</span>
                      <button
                        type="button"
                        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                        onClick={() => set({ fletesExtra: (borrador.fletesExtra ?? []).filter((_, idx) => idx !== i) })}
                        aria-label="Quitar esta línea de flete"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                  {borrador.apoyos.some((a) => a.fue) && (
                    <button
                      type="button"
                      className="block text-[11px] underline underline-offset-2 text-muted-foreground hover:text-foreground"
                      onClick={() => set({ fletesExtra: [...(borrador.fletesExtra ?? []), "1"] })}
                    >
                      + Flete del apoyo (fue con su camión)
                    </button>
                  )}
                </div>
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
                <span className="text-[11px] font-medium">Observaciones</span>
                <Textarea
                  rows={2}
                  value={borrador.observaciones}
                  onChange={(e) => set({ observaciones: e.target.value })}
                  placeholder="Cualquier cosa del día que valga la pena registrar"
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

                  {/* Cerrar un armado sin decir qué quedó armado es perder el dato para
                      siempre: para cuando se emita el desarme, nadie se acuerda. */}
                  {borrador.finalizarOt === true && DEJAN_ESTRUCTURA.has(jornada.tipo) && (
                    <ComoQuedoArmado
                      compacto
                      previsto={jornada.detalleTecnico}
                      coincide={borrador.armadoCoincide}
                      texto={borrador.armadoReal}
                      onCoincide={(v) =>
                        set({
                          armadoCoincide: v,
                          armadoReal:
                            v === false && !borrador.armadoReal
                              ? (jornada.detalleTecnico ?? "")
                              : borrador.armadoReal,
                        })
                      }
                      onTexto={(v) => set({ armadoReal: v })}
                    />
                  )}
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
          <QueHayQueEjecutar jornada={jornada} />
          <p className="font-medium">Parte cargado el {format(parseISO(parte.fecha), "d 'de' MMMM", { locale: es })}</p>
          {parte.manoObra.map((l, i) => (
            <p key={i} className="text-muted-foreground">
              {/* El nombre de la cuadrilla sólo cuando hay más de un renglón: con uno solo
                  es la de la fila y repetirlo es ruido. */}
              {parte.manoObra.length > 1 && (
                <span className="font-medium text-foreground">{nombreCuadrilla(l.cuadrillaId ?? parte.cuadrillaId) ?? "Sin cuadrilla"} · </span>
              )}
              {l.personas} personas · {formatHora(l.horaDesde)}–{formatHora(l.horaHasta)} · {l.horasHombre} hh
            </p>
          ))}
          {parte.flete && <p className="text-muted-foreground">{parte.flete.cantidad} viaje(s) de flete</p>}
          {(parte.fletesExtra ?? []).map((f, i) => (
            <p key={i} className="text-muted-foreground">{f.cantidad} viaje(s) de otro camión</p>
          ))}
          {parte.sector && <p className="text-muted-foreground">Sector: {parte.sector}</p>}
          {parte.observaciones && <p className="text-muted-foreground">{parte.observaciones}</p>}
          {sinGente.map((a) => (
            <AvisoApoyoSinGente key={a.asignacionId} parte={parte} apoyo={a} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * La sub-fila de un apoyo adentro de la obra: el tilde "fue", sus personas y su horario.
 *
 * Es un renglón más del mismo parte, no un parte aparte: capataz, fletes, fotos y notas
 * van una sola vez, en la principal. Sin atajos de salida a propósito: el horario ya viene
 * precargado según la fracción planificada, y el caso normal es no tocarlo.
 */
function SubFilaApoyo({
  apoyo,
  fecha,
  deHoja,
  onCambio,
}: {
  apoyo: BorradorApoyo;
  fecha: string;
  /** Las personas y el horario los completó la Hoja del día de esa cuadrilla. */
  deHoja: boolean;
  onCambio: (cambio: Partial<BorradorApoyo>) => void;
}) {
  const desde = parseHora(apoyo.desde);
  const hasta = parseHora(apoyo.hasta);
  const hh = apoyo.fue ? horasHombreRenglon(apoyo.personas, apoyo.desde, apoyo.hasta) : 0;
  return (
    <div className="space-y-2 rounded-md border border-dashed px-2.5 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <Users className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <span className="text-[12px] font-medium">Apoyo {apoyo.nombre}</span>
        <span className="text-[11px] text-muted-foreground">planificado: {fraccionLabel(apoyo.fraccion)} de jornada</span>
        <label className="ml-auto flex items-center gap-1.5 text-[11px] font-medium">
          <Checkbox checked={apoyo.fue} onCheckedChange={(v) => onCambio({ fue: v === true })} />
          Fue
        </label>
      </div>
      {apoyo.fue ? (
        <div className="flex flex-wrap items-end gap-2">
          <label className="space-y-1">
            <span className="text-[11px] font-medium">Personas</span>
            <Input
              className="h-8 w-20"
              inputMode="numeric"
              value={apoyo.personas}
              onChange={(e) => onCambio({ personas: e.target.value.replace(/[^\d]/g, "") })}
              // Vacío a propósito: sale de la Hoja de la otra cuadrilla, no se inventa.
              placeholder="?"
            />
          </label>
          <label className="space-y-1">
            <span className="text-[11px] font-medium">Desde</span>
            <Input
              className="h-8 w-20 tabular-nums"
              value={apoyo.desde}
              onChange={(e) => onCambio({ desde: e.target.value })}
              onBlur={() => {
                const v = parseHora(apoyo.desde);
                if (v !== null) onCambio({ desde: formatHora(v) });
              }}
            />
          </label>
          <label className="space-y-1">
            <span className="text-[11px] font-medium">Hasta</span>
            <Input
              className="h-8 w-20 tabular-nums"
              value={apoyo.hasta}
              onChange={(e) => onCambio({ hasta: e.target.value })}
              onBlur={() => {
                const v = parseHora(apoyo.hasta);
                if (v !== null) onCambio({ hasta: formatHora(v) });
              }}
            />
          </label>
          {desde !== null && hasta !== null && cruzaMedianoche(desde, hasta) && (
            <span className="pb-1.5 text-[11px] font-medium text-muted-foreground">
              +1 día · termina el {format(addDays(parseISO(fecha), 1), "d/M")}
            </span>
          )}
          <span className="pb-1.5 text-[11px] text-muted-foreground">
            {hh || 0} horas-hombre{deHoja ? " · según su Hoja del día" : ""}
          </span>
        </div>
      ) : (
        // Decir qué va a pasar ANTES de guardar: borrar una jornada del tablero no es algo
        // que se tenga que descubrir después.
        <p className="text-[11px]" style={{ color: AMBAR_TEXTO }}>
          No fue: al guardar, la jornada de apoyo de {apoyo.nombre} se saca del tablero.
        </p>
      )}
    </div>
  );
}

/**
 * "Sumá la gente de C3 al parte".
 *
 * El apoyo se sumó en el tablero DESPUÉS de cargar el parte. Queda vinculado a ese parte
 * (no hay otro: es uno por obra y día), pero el parte no se toca solo: inventaría personas
 * y horas que van al costo de la obra. Acá se completa sin salir del listado —el formulario
 * completo vive en el tablero y pide abrir la tarjeta—, o se dice que al final no fue.
 *
 * Guardar reescribe el parte tal como está más el renglón nuevo (datosDeParteCargado): el
 * PATCH reemplaza todas las líneas y lo que no viaja se borraría.
 */
function AvisoApoyoSinGente({ parte, apoyo }: { parte: ParteCargado; apoyo: ApoyoListado }) {
  const editar = useEditarParte();
  const [abierto, setAbierto] = useState(false);
  const [personas, setPersonas] = useState("");
  const [desdeTxt, setDesdeTxt] = useState(formatHora(apoyo.horarioSugerido.horaDesde));
  const [hastaTxt, setHastaTxt] = useState(formatHora(apoyo.horarioSugerido.horaHasta));
  const nombre = apoyo.cuadrillaNombre ?? "la cuadrilla de apoyo";

  const p = Number(personas);
  const errores = [
    ...(!personas.trim() || !Number.isFinite(p) || p <= 0 ? ["Falta la cantidad de personas"] : []),
    ...erroresHorario(desdeTxt, hastaTxt),
  ];

  function guardar(fue: boolean) {
    const d = parseHora(desdeTxt);
    const h = parseHora(hastaTxt);
    // La tarea es la del parte: el apoyo hace lo mismo que la principal ese día.
    const tarea = parte.manoObra[0]?.tarea ?? "armado";
    const datos = datosDeParteCargado(parte, {
      lineaExtra:
        fue && d !== null && h !== null
          ? { tarea, personas: p, horaDesde: d, horaHasta: h, cuadrillaId: apoyo.cuadrillaId }
          : null,
      apoyos: [{ asignacionId: apoyo.asignacionId, fue }],
    });
    editar.mutate(
      { parteId: parte.id, otId: parte.otId, datos },
      {
        onSuccess: (r) => {
          const fallos = r.pasos.filter((x) => !x.ok);
          if (fallos.length > 0) {
            toast.warning("El parte se guardó, pero algo quedó sin hacer en Odoo", {
              description: fallos.map((x) => (x.detalle ? `${x.nombre}: ${x.detalle}` : x.nombre)).join(" · "),
              duration: Infinity,
              closeButton: true,
            });
          } else {
            toast.success(fue ? `Gente de ${nombre} sumada al parte` : `Apoyo de ${nombre} sacado del tablero`);
          }
        },
        onError: (e) => toast.error("No se pudo actualizar el parte", { description: e.message }),
      },
    );
  }

  return (
    <div className="mt-2 space-y-2 rounded-md px-2.5 py-2" style={{ backgroundColor: AMBAR_FONDO, color: AMBAR_TEXTO }}>
      <div className="flex flex-wrap items-center gap-2">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span className="text-[12px] font-medium">
          Se sumó el apoyo de {nombre} ({fraccionLabel(apoyo.fraccion)}) después de cargar el parte: sumá su gente al parte.
        </span>
        {!abierto && (
          <button
            type="button"
            className="ml-auto text-[12px] font-semibold underline underline-offset-2"
            onClick={() => setAbierto(true)}
          >
            Editar el parte
          </button>
        )}
      </div>
      {/* Sin text-foreground: el recuadro hereda el texto del aviso, que tiene su variante
          oscura. Con foreground, en oscuro las etiquetas quedaban blancas sobre beige. */}
      {abierto && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="space-y-1">
            <span className="text-[11px] font-medium">Personas</span>
            <Input
              className="h-8 w-20 bg-background"
              inputMode="numeric"
              value={personas}
              onChange={(e) => setPersonas(e.target.value.replace(/[^\d]/g, ""))}
              placeholder="?"
            />
          </label>
          <label className="space-y-1">
            <span className="text-[11px] font-medium">Desde</span>
            <Input
              className="h-8 w-20 bg-background tabular-nums"
              value={desdeTxt}
              onChange={(e) => setDesdeTxt(e.target.value)}
              onBlur={() => {
                const v = parseHora(desdeTxt);
                if (v !== null) setDesdeTxt(formatHora(v));
              }}
            />
          </label>
          <label className="space-y-1">
            <span className="text-[11px] font-medium">Hasta</span>
            <Input
              className="h-8 w-20 bg-background tabular-nums"
              value={hastaTxt}
              onChange={(e) => setHastaTxt(e.target.value)}
              onBlur={() => {
                const v = parseHora(hastaTxt);
                if (v !== null) setHastaTxt(formatHora(v));
              }}
            />
          </label>
          <Button
            type="button"
            size="sm"
            style={{ backgroundColor: CORAL, color: "#fff" }}
            disabled={errores.length > 0 || editar.isPending}
            onClick={() => guardar(true)}
          >
            {editar.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Sumar al parte
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={editar.isPending}
            onClick={() => guardar(false)}
            title="La jornada de apoyo se saca del tablero"
          >
            No fue
          </Button>
          {personas.trim() !== "" && errores.length > 0 && (
            <span className="pb-1.5 text-[11px] font-medium" style={{ color: PELIGRO_TEXTO }}>
              {errores.join(" · ")}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Qué hay que ejecutar y de quién es la obra.
 *
 * FALTABA EN TODA LA PANTALLA. El parte se identificaba sólo por la dirección, y con eso
 * no alcanza para saber si lo que se hizo es lo que había que hacer: en la misma obra hay
 * armados, ampliaciones y desmontes parciales, y el que carga a la mañana no estuvo ahí.
 * El dato ya viajaba en la jornada —lo usa la precarga del as-built— pero no se mostraba
 * en ningún lado.
 *
 * El técnico va al lado porque es la respuesta a la pregunta que sigue: cuando lo que
 * está en obra no coincide con lo que dice la OT, hay que preguntarle a alguien. Hoy eso
 * arranca por averiguar de quién es la obra.
 *
 * Si la OT no tiene detalle cargado se dice, en vez de no mostrar nada: "sin detalle" es
 * información —hay que preguntar— y un bloque ausente se lee como que no hacía falta.
 */
function QueHayQueEjecutar({ jornada }: { jornada: JornadaListado }) {
  if (!jornada.detalleTecnico && !jornada.tecnico) return null;
  return (
    <div className="rounded-md border bg-muted/30 px-2.5 py-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Qué hay que ejecutar
        </span>
        {jornada.tecnico && (
          <span className="shrink-0 text-[10px] text-muted-foreground">
            Téc. <span className="font-medium text-foreground">{jornada.tecnico}</span>
          </span>
        )}
      </div>
      <p className="mt-0.5 whitespace-pre-wrap text-[12px] leading-snug">
        {jornada.detalleTecnico ?? (
          <span className="text-muted-foreground">
            La OT no tiene detalle técnico cargado.
          </span>
        )}
      </p>
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
