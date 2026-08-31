"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as PointerEventReact } from "react";
import { format, isSameDay, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { AlertTriangle, MousePointerClick } from "lucide-react";
import { CeldaDia } from "./celda-dia";
import { TarjetaAsignacion } from "./tarjeta-asignacion";
import { agruparBloques, esDomingo, repartirEnCarriles } from "@/lib/tablero/bloques";
import { accionDeCierre, bloqueCerrado, type AccionCierre } from "@/lib/tablero/cierre";
import { MOTIVOS_NO_EJEC } from "@/lib/tablero/tipos-parte";
import { colorCuadrilla, CORAL, FERIADO_ENCABEZADO, FERIADO_TEXTO } from "@/lib/tablero/colores";
import { ocupacionCelda, capacidadDelRango } from "@/lib/tablero/fracciones";
import type { FraccionStr } from "@/lib/tablero/fracciones";
import type { Bloque } from "@/lib/tablero/bloques";
import type { AsignacionTablero, CuadrillaTablero, OtTablero, ParteTablero } from "@/lib/tablero/tipos";

// Grilla del tablero: filas = cuadrillas, columnas = días, celdas = asignaciones.
//
// El problema que resuelve la forma: una obra de varias jornadas se ve en TODOS los
// días que ocupa, no solo el que arranca. Por eso cada fila es una sub-grilla de días
// y las tarjetas se colocan con grid-column: span N sobre carriles (filas internas)
// que evitan que dos obras del mismo día se pisen.
//
// El rango visible son varias semanas y la grilla scrollea en horizontal (v3): un bloque
// que arranca el viernes y sigue el lunes se ve entero. Quedan fijos el encabezado de
// días (vertical) y la columna de cuadrillas (horizontal); sin eso, scrollear a la
// semana siguiente hace perder de vista de quién es cada fila.
//
// El alto de fila lo define el contenido —la cuadrilla con más carriles ocupados— con un
// mínimo bajo. Antes el mínimo era 132px y con 5 cuadrillas había que scrollear en
// vertical, que es justo la comparación que el planificador viene a hacer.

const ANCHO_RECURSO = 168;
/**
 * A 132px las direcciones se cortaban casi siempre ("Corrientes 144…", "Ángel Gallard…")
 * y la tarjeta perdía justo el dato que sirve para identificar la obra. El ancho manda
 * sobre la cantidad de días a la vista: para eso está el scroll.
 */
const ANCHO_MIN_DIA = 168;

/**
 * Días que tienen que entrar en pantalla sin scrollear: hoy más los siete siguientes,
 * o sea hasta el mismo día de la semana que viene INCLUSIVE.
 *
 * Es la ventana con la que se planifica: se mira desde hoy hacia adelante, no desde el
 * lunes. Un miércoles a la mañana el lunes pasado ya no es una decisión.
 */
export const DIAS_VENTANA = 8;

/**
 * Piso del ancho de columna. Por debajo de esto el título de la obra deja de decir nada
 * —"Consorcio de Prop…" se repite en media grilla— y la tarjeta pasa a ser un color.
 * Si la pantalla es tan angosta que la ventana no entra a este ancho, vuelve el scroll:
 * es preferible scrollear a no poder leer.
 */
const ANCHO_DIA_MINIMO = 150;
/** Domingo sin trabajo: una canaleta, no una columna. */
const ANCHO_CANALETA = 28;
/** Franja al pie de la celda donde vive el riel de ocupación. */
const ALTO_BARRA = 10;
/**
 * Alto de una tarjeta. El mínimo da lugar a las dos líneas (dirección + cliente) sin que
 * se toquen; el máximo evita que una fila con una sola obra estire esa tarjeta a media
 * pantalla. Entre ambos, la fila reparte lo que sobra.
 *
 * Los valores subieron un escalón junto con el ancho de columna: con pocas cuadrillas
 * visibles sobra alto, y usarlo para que la tarjeta respire es mejor que dejarlo en
 * blanco. Lo que NO se hace es estirar las filas hasta llenar la pantalla — eso da tres
 * franjas enormes con las tarjetas pegadas arriba y un hueco muerto abajo, que se ve más
 * lleno y se lee peor. Para eso está el techo.
 */
const ALTO_CARRIL = 38;
const ALTO_CARRIL_MAX = 54;
/** Piso del alto de fila. La fila crece con sus carriles; esto es sólo el mínimo. */
const ALTO_MIN_FILA = 72;

const DECIMAL = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 });

/** Día del encabezado: "mié 26". Se usa suelto y también dentro del rótulo del feriado. */
function DiaDelEncabezado({ d, esHoy }: { d: Date; esHoy: boolean }) {
  return (
    <>
      <span className="text-[10px] uppercase text-muted-foreground">
        {format(d, "EEE", { locale: es })}
      </span>
      {/* Hoy sale del canal de FONDO: pintar la columna de rosado usaba el mismo canal
          que el estado de error y el día de hoy parecía roto. */}
      {esHoy ? (
        <span
          className="flex items-center justify-center px-1 text-[12px] font-semibold tabular-nums text-white"
          style={{ backgroundColor: CORAL, borderRadius: 10, height: 19, minWidth: 19 }}
        >
          {format(d, "d")}
        </span>
      ) : (
        <span className="text-[13px] font-medium">{format(d, "d")}</span>
      )}
    </>
  );
}

function esLunes(fecha: string): boolean {
  return parseISO(fecha).getDay() === 1;
}

/**
 * Cuánto mide una columna de día para que la ventana entre justa en el contenedor.
 *
 * Los domingos colapsados miden fijo (28px) y no participan del reparto, así que se
 * descuentan antes de dividir. Devuelve el ancho fijo de siempre mientras no se haya
 * medido el contenedor —el primer render, antes de que corra el ResizeObserver— para no
 * pintar una grilla degenerada de 0px.
 */
function anchoDeColumna(
  anchoContenedor: number | null,
  fechas: string[],
  hoy: string,
  colapsado: (f: string) => boolean,
): number {
  if (!anchoContenedor) return ANCHO_MIN_DIA;

  // La ventana arranca en hoy. Si hoy quedó fuera del rango cargado (el usuario se fue
  // muy atrás y volvió), se toma el principio: lo que importa es el ancho, no cuál día.
  const desde = Math.max(0, fechas.indexOf(hoy));
  const ventana = fechas.slice(desde, desde + DIAS_VENTANA);
  if (ventana.length === 0) return ANCHO_MIN_DIA;

  const canaletas = ventana.filter(colapsado).length;
  const anchos = ventana.length - canaletas;
  if (anchos <= 0) return ANCHO_MIN_DIA;

  const disponible = anchoContenedor - ANCHO_RECURSO - canaletas * ANCHO_CANALETA;
  return Math.max(ANCHO_DIA_MINIMO, Math.floor(disponible / anchos));
}

export function TableroGrid({
  cuadrillas,
  fechas,
  feriados,
  semanaCentrada,
  asignaciones,
  ots,
  planPorObra,
  partes,
  bloqueSeleccionado,
  hoy: hoyISO,
  contenedorRef,
  onCerrarJornada,
  onAbrirBloque,
  onFraccion,
  onEditarJornadas,
  onEstado,
  onQuitar,
  candados,
  domingosAbiertos,
  onToggleDomingo,
}: {
  cuadrillas: CuadrillaTablero[];
  fechas: string[];
  /**
   * Feriados nacionales por fecha (fecha → nombre). Es SÓLO una marca visual: la columna
   * se tiñe y el encabezado lo dice. No cambia la capacidad ni el reparto de jornadas —
   * a diferencia del domingo, un feriado sigue siendo un día hábil para el tablero.
   */
  feriados: Map<string, string>;
  /**
   * Los 7 días de la semana centrada en el viewport: el período contra el que se mide la
   * carga de cada fila. No alcanza con `fechas`, que es todo el rango cargado y crece al
   * scrollear: dividir por él diluye la sobreasignación hasta hacerla invisible.
   */
  semanaCentrada: string[];
  asignaciones: AsignacionTablero[];
  ots: Map<number, OtTablero>;
  /**
   * Plan completo de cada obra: días planificados y en cuántos tramos separados quedaron.
   * La tarjeta muestra un tramo; con esto puede decir que hay más y cuántos.
   */
  planPorObra: Map<number, { dias: number; tramos: number }>;
  partes: ParteTablero[];
  bloqueSeleccionado: string | null;
  /** Fecha de hoy en yyyy-MM-dd: define desde cuándo se puede cerrar una jornada. */
  hoy: string;
  /**
   * El board maneja el scroll (paginado, snap, primer día visible), así que recibe el
   * nodo del contenedor por acá. Va como callback y no como objeto ref porque la grilla
   * también necesita el nodo —para medir su ancho— y escribirle `.current` a un ref que
   * llega por prop es mutar una prop.
   */
  contenedorRef?: (nodo: HTMLDivElement | null) => void;
  onCerrarJornada: (bloque: Bloque, accion: NonNullable<AccionCierre>) => void;
  onAbrirBloque: (bloque: Bloque) => void;
  onFraccion: (bloque: Bloque, f: FraccionStr) => void;
  onEditarJornadas: (bloque: Bloque) => void;
  onEstado: (bloque: Bloque, e: "tentativa" | "confirmada") => void;
  onQuitar: (bloque: Bloque) => void;
  /**
   * OTs cuyo cliente pidió no armar sin el permiso emitido. La tarjeta muestra el
   * candado, pero se arrastra igual: planificar es un borrador y bloquear ahí sería
   * frenar a Operaciones por un dato que depende de terceros. El freno está al confirmar.
   */
  candados?: Set<number>;
  /**
   * Domingos habilitados a mano desde el encabezado, en yyyy-MM-dd. Se suman a los que ya
   * tienen trabajo asignado para decidir qué domingo se despliega. Vive en el board porque
   * se persiste entre sesiones; acá sólo se lee.
   */
  domingosAbiertos: Set<string>;
  /** Alterna la habilitación manual de ese domingo. */
  onToggleDomingo: (fecha: string) => void;
}) {
  const hoy = new Date();

  // El contenedor de scroll lo maneja el board (snap, paginado), pero el ancho de
  // columna se calcula acá, así que hace falta medirlo. Se combinan los dos refs sobre
  // el mismo nodo en vez de duplicar el div: un wrapper extra rompería el `flex-1` y el
  // sticky de la columna de cuadrillas.
  const propio = useRef<HTMLDivElement | null>(null);
  const [anchoContenedor, setAnchoContenedor] = useState<number | null>(null);

  const asignarRef = useCallback(
    (nodo: HTMLDivElement | null) => {
      propio.current = nodo;
      contenedorRef?.(nodo);
    },
    [contenedorRef],
  );

  // Se remide al cambiar el tamaño de la ventana y al colapsar el panel derecho, que es
  // el caso que más cambia el ancho útil.
  useEffect(() => {
    const nodo = propio.current;
    if (!nodo) return;
    const observador = new ResizeObserver(([entrada]) => {
      setAnchoContenedor(entrada.contentRect.width);
    });
    observador.observe(nodo);
    return () => observador.disconnect();
  }, []);

  // ── Desplazamiento arrastrando el encabezado ──────────────────────────────
  //
  // Con el auto-scroll del arrastre apagado, la fila de días pasa a ser el agarre para
  // correr la grilla: se toma cualquier día y se arrastra, como en una tabla de Gantt.
  // La otra forma sigue siendo la barra de scroll.
  //
  // El desplazamiento se aplica de a pasos (contra el evento anterior) y no contra el
  // punto donde arrancó: al llegar al borde el rango carga una semana más y el board
  // corrige `scrollLeft` para que no salte, y una base fija de arranque desharía esa
  // corrección en el movimiento siguiente.
  const pan = useRef<{ x: number } | null>(null);
  // El encabezado es a la vez agarre para desplazar y botón para abrir un domingo. Se
  // distinguen por el movimiento: si el puntero se corrió, fue un arrastre y el clic que
  // el navegador dispara después no tiene que abrir nada.
  const panMovio = useRef(false);

  function iniciarPan(e: PointerEventReact<HTMLDivElement>) {
    // El táctil ya scrollea solo: capturar el puntero ahí rompería el gesto nativo.
    if (e.pointerType === "touch" || e.button !== 0 || !propio.current) return;
    pan.current = { x: e.clientX };
    panMovio.current = false;
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function moverPan(e: PointerEventReact<HTMLDivElement>) {
    const cont = propio.current;
    if (!cont || !pan.current) return;
    const dx = e.clientX - pan.current.x;
    if (Math.abs(dx) > 2) panMovio.current = true;
    cont.scrollLeft -= dx;
    pan.current = { x: e.clientX };
  }

  function terminarPan(e: PointerEventReact<HTMLDivElement>) {
    if (!pan.current) return;
    pan.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }

  const enCelda = (cuadrillaId: number, fecha: string) =>
    asignaciones.filter((a) => a.cuadrillaId === cuadrillaId && a.fecha === fecha);

  // Un domingo se colapsa si NINGUNA cuadrilla visible tiene algo asignado. Así el ritmo
  // de la semana no se mueve al scrollear —la columna está siempre— y un domingo
  // trabajado se vuelve notorio justamente porque se ensancha.
  //
  // Pero eso solo no alcanza: para que un domingo tenga trabajo hay que poder asignarlo, y
  // la canaleta no acepta drop. Antes la única puerta era "Trabajar el domingo" del diálogo
  // de jornadas, que exige una obra que venga del sábado — un domingo suelto quedaba fuera.
  // Por eso el domingo también se puede abrir a mano desde su encabezado: es esporádico, así
  // que la habilitación es por domingo y no una preferencia global.
  const conTrabajo = (f: string) => cuadrillas.some((c) => enCelda(c.id, f).length > 0);
  const domingosActivos = new Set(
    fechas.filter((f) => esDomingo(f) && (conTrabajo(f) || domingosAbiertos.has(f))),
  );
  const colapsado = (f: string) => esDomingo(f) && !domingosActivos.has(f);
  // Se puede volver a plegar mientras esté vacío. Con trabajo asignado no: plegarlo
  // escondería jornadas reales detrás de una canaleta de 28px.
  const puedePlegar = (f: string) => esDomingo(f) && !conTrabajo(f);

  // ── Ancho de columna: la ventana de 8 días entra exacta ────────────────────
  //
  // Antes el ancho era fijo en 168px y el rango cargado son tres semanas, así que en una
  // pantalla común entraban 8,7 columnas: se veía la semana y después un muñón de dos
  // días cortados contra el borde. Ese pedazo no alcanza para planificar nada y es lo
  // que hacía que la grilla se viera chica — las columnas quedaban clavadas en su mínimo
  // en vez de repartirse el ancho disponible.
  //
  // Ahora se mide el contenedor y se reparte para que entren los 8 días de la ventana
  // justos: sin sobrante y sin columna cortada.
  const anchoDia = anchoDeColumna(anchoContenedor, fechas, hoyISO, colapsado);

  // La plantilla externa impone los anchos; la interna los repite para que las celdas de
  // cada fila caigan exactamente bajo su encabezado. En las columnas elásticas la interna
  // usa minmax(0,1fr) y no el ancho mínimo: declararlo en las dos hace que difieran por
  // redondeo y aparezca un scroll horizontal de 2px.
  const plantillaExterna = fechas
    .map((f) => (colapsado(f) ? `${ANCHO_CANALETA}px` : `minmax(${anchoDia}px, 1fr)`))
    .join(" ");
  const plantillaInterna = fechas
    .map((f) => (colapsado(f) ? `${ANCHO_CANALETA}px` : "minmax(0, 1fr)"))
    .join(" ");
  const anchoMinimo =
    ANCHO_RECURSO + fechas.reduce((s, f) => s + (colapsado(f) ? ANCHO_CANALETA : anchoDia), 0);

  // Jornadas ya ejecutadas (parte diario cargado): la tarjeta se atenúa.
  const ejecutadas = new Set(
    partes.filter((p) => p.estado === "ejecutado").map((p) => `${p.otId}:${p.fecha}`),
  );
  const partesPorId = new Map(partes.map((p) => [p.id, p]));
  const etiquetaMotivo = (valor: string | null) =>
    MOTIVOS_NO_EJEC.find((m) => m.value === valor)?.label ?? valor;

  // A nivel día sólo se avisa cuando TODAS las cuadrillas visibles están sobre: ahí el
  // problema es del día y no de una fila. Que una sola esté sobreasignada ya lo dice su
  // propia celda, y repetirlo arriba era el mismo dato dos veces.
  const diasTodasSobre = new Set(
    fechas.filter(
      (f) =>
        cuadrillas.length > 0 &&
        cuadrillas.every(
          (c) => ocupacionCelda(enCelda(c.id, f).map((a) => a.fraccion)).nivel === "sobre",
        ),
    ),
  );

  const hayAlgoAsignado = cuadrillas.some((c) => fechas.some((f) => enCelda(c.id, f).length > 0));

  // El alto de cada fila sale de sus carriles. Se calcula antes del render de las filas
  // porque la plantilla de la grilla los necesita todos juntos.
  const porCuadrilla = cuadrillas.map((cuadrilla, indice) => {
    const deLaCuadrilla = asignaciones.filter((a) => a.cuadrillaId === cuadrilla.id);
    const ubicados = repartirEnCarriles(agruparBloques(deLaCuadrilla), fechas);
    const carriles = Math.max(1, ...ubicados.map((u) => u.carril + 1));
    return {
      cuadrilla,
      indice,
      deLaCuadrilla,
      ubicados,
      carriles,
      alto: Math.max(ALTO_MIN_FILA, carriles * ALTO_CARRIL + ALTO_BARRA + 8),
      // El techo es lo que impide que con 3 cuadrillas cada fila se estire a 240px y
      // deje las tarjetas chiquitas arriba con un hueco muerto abajo.
      altoMax: Math.max(ALTO_MIN_FILA, carriles * ALTO_CARRIL_MAX + ALTO_BARRA + 8),
    };
  });

  return (
    <div ref={asignarRef} className="relative min-h-0 min-w-0 flex-1 overflow-auto">
      {/* Rango sin nada planificado: en vez de una grilla muda, qué hacer.
          Va sticky y de alto cero como PRIMER hijo del contenedor: con el scroll
          horizontal de varias semanas, un `absolute inset-0` se centraría sobre los
          ~2900px de contenido y quedaría fuera de pantalla. No captura el puntero, así
          que las celdas de abajo siguen aceptando el arrastre. */}
      {!hayAlgoAsignado && (
        <div className="pointer-events-none sticky left-0 top-0 z-10 h-0 w-0 overflow-visible">
          <div
            className="absolute flex w-max items-center gap-2 rounded-lg border bg-card/95 px-4 py-3 text-sm text-muted-foreground shadow-sm"
            style={{ left: ANCHO_RECURSO + 24, top: 64 }}
          >
            <MousePointerClick className="h-4 w-4" />
            Nada planificado en este rango: arrastrá una obra del panel derecho a un día.
          </div>
        </div>
      )}

      <div
        className="grid min-h-full"
        style={{
          gridTemplateColumns: `${ANCHO_RECURSO}px ${plantillaExterna}`,
          // El alto sale del contenido, entre un piso y un techo. La pista `1fr` del final
          // se come el sobrante: sin ella el reparto lo absorbían las filas y con pocas
          // cuadrillas quedaban enormes y medio vacías.
          gridTemplateRows: `40px ${porCuadrilla.map((c) => `minmax(${c.alto}px, ${c.altoMax}px)`).join(" ")} 1fr`,
          minWidth: anchoMinimo,
        }}
      >
        {/* ── Encabezado ── */}
        <div className="sticky left-0 top-0 z-30 flex h-10 items-center border-b border-r bg-card px-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Cuadrillas
        </div>
        {fechas.map((f) => {
          const d = parseISO(f);
          const esHoy = isSameDay(d, hoy);
          const canaleta = colapsado(f);
          const domingoActivo = domingosActivos.has(f);
          // Un feriado que cae domingo no se anuncia: la canaleta mide 28px y el dato no
          // agrega nada — ese día ya no se trabaja por domingo.
          const feriado = canaleta ? null : (feriados.get(f) ?? null);
          // El domingo se abre y se cierra desde su propio encabezado. El handler va acá y
          // no en un botón hijo: este div captura el puntero para el desplazamiento, y con
          // la captura activa el navegador dispara el click sobre el elemento que captura,
          // así que un botón adentro nunca se enteraría.
          const alternable = esDomingo(f) && (canaleta || puedePlegar(f));
          const alternar = () => { if (alternable && !panMovio.current) onToggleDomingo(f); };
          const tituloDomingo = canaleta
            ? `Domingo ${format(d, "d MMM", { locale: es })} · sin trabajo — clic para habilitarlo`
            : `Domingo ${format(d, "d MMM", { locale: es })} habilitado a mano · clic para volver a plegarlo`;
          return (
            <div
              key={`h-${f}`}
              data-fecha={f}
              className={`sticky top-0 z-20 flex h-10 select-none items-center justify-center gap-1.5 border-b border-r bg-card active:cursor-grabbing ${
                alternable ? "cursor-pointer hover:bg-black/[0.05]" : "cursor-grab"
              }`}
              onPointerDown={iniciarPan}
              onPointerMove={moverPan}
              onPointerUp={terminarPan}
              onPointerCancel={terminarPan}
              onClick={alternar}
              role={alternable ? "button" : undefined}
              tabIndex={alternable ? 0 : undefined}
              onKeyDown={
                alternable
                  ? (e) => {
                      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggleDomingo(f); }
                    }
                  : undefined
              }
              title={alternable ? tituloDomingo : (feriado ?? undefined)}
              style={{
                // Separador de semana: ubicarse sin tener que leer las fechas.
                borderLeft: esLunes(f) ? "2px solid var(--border)" : undefined,
                backgroundColor: canaleta ? "#F1EFE8" : feriado ? FERIADO_ENCABEZADO : "var(--card)",
              }}
            >
              {canaleta ? (
                <span className="text-[11px] text-muted-foreground">D</span>
              ) : (
                <>
                  {domingoActivo ? (
                    // El domingo trabajado se nombra entero: es la excepción y tiene que
                    // cantarse, no confundirse con un día más.
                    <span className="flex flex-col items-center leading-none">
                      <span className="text-[11px] text-muted-foreground">domingo</span>
                      <span className="mt-0.5 text-[13px] font-medium">{format(d, "d")}</span>
                    </span>
                  ) : feriado ? (
                    // El feriado se NOMBRA, no se insinúa: la palabra arriba y el día
                    // abajo, igual que el domingo trabajado. El nombre entero va en el
                    // title, porque "Puente turístico no laborable" no entra en 168px.
                    <span className="flex flex-col items-center leading-none">
                      <span
                        className="text-[9px] font-semibold uppercase tracking-wide"
                        style={{ color: FERIADO_TEXTO }}
                      >
                        Feriado
                      </span>
                      <span className="mt-0.5 flex items-center gap-1.5">
                        <DiaDelEncabezado d={d} esHoy={esHoy} />
                      </span>
                    </span>
                  ) : (
                    <DiaDelEncabezado d={d} esHoy={esHoy} />
                  )}
                  {diasTodasSobre.has(f) && (
                    <AlertTriangle
                      className="h-3 w-3 shrink-0"
                      style={{ color: "#D92D20" }}
                      aria-label="Todas las cuadrillas visibles están sobreasignadas este día"
                    />
                  )}
                </>
              )}
            </div>
          );
        })}

        {/* ── Una fila por cuadrilla ── */}
        {porCuadrilla.map(({ cuadrilla, indice, deLaCuadrilla, ubicados, carriles }) => {
          const color = colorCuadrilla(indice);

          // Carga de LA SEMANA CENTRADA, no del rango cargado: la comparación que importa
          // es contra los días hábiles de una semana. Se mueve junto con el label de
          // arriba, porque los dos derivan de la misma semana.
          const deLaSemana = deLaCuadrilla.filter((a) => semanaCentrada.includes(a.fecha));
          const jornadas = ocupacionCelda(deLaSemana.map((a) => a.fraccion)).total;
          // El domingo suma capacidad sólo si ESTA cuadrilla trabaja ese domingo.
          const conTrabajo = new Set(deLaSemana.map((a) => a.fecha));
          const capacidad = capacidadDelRango(semanaCentrada, conTrabajo);
          const exceso = Number((jornadas - capacidad).toFixed(2));

          return (
            <div key={cuadrilla.id} className="contents">
              <div
                className="sticky left-0 z-20 flex flex-col justify-center gap-0.5 border-b border-r bg-card px-2 py-1.5"
                style={{ borderLeft: `3px solid ${color.borde}` }}
              >
                <p className="truncate text-[12px] font-medium" title={cuadrilla.nombre}>
                  {cuadrilla.nombre}
                  {cuadrilla.tercerizada && (
                    <span className="ml-1 text-[10px] font-normal text-muted-foreground">terc.</span>
                  )}
                </p>
                {/* La carga como NÚMERO y no como badge. "9,75 de 6 jornadas" se leía mal:
                    el numerador está en jornadas-carga y el denominador en días hábiles. */}
                <p
                  className={`text-[10px] tabular-nums ${exceso > 0 ? "font-semibold text-destructive" : "text-muted-foreground"}`}
                  title={
                    exceso > 0
                      ? "Sobreasignada: la carga de esta semana supera sus días con capacidad"
                      : "Carga de la semana que está centrada en pantalla"
                  }
                >
                  {DECIMAL.format(jornadas)} / {capacidad}
                  {exceso > 0 && ` · +${DECIMAL.format(exceso)}`}
                  {jornadas === 0 && " · libre"}
                </p>
              </div>

              <div style={{ gridColumn: "2 / -1" }}>
                <div
                  className="grid h-full"
                  style={{
                    gridTemplateColumns: plantillaInterna,
                    // Los carriles crecen hasta su techo y recién ahí el sobrante va al
                    // 1fr: así la tarjeta usa el alto que la fila tiene disponible.
                    gridTemplateRows: `repeat(${carriles}, minmax(${ALTO_CARRIL}px, ${ALTO_CARRIL_MAX}px)) 1fr ${ALTO_BARRA}px`,
                  }}
                >
                  {fechas.map((f, i) => (
                    <CeldaDia
                      key={`${cuadrilla.id}-${f}`}
                      cuadrillaId={cuadrilla.id}
                      fecha={f}
                      columna={i}
                      esDomingo={esDomingo(f)}
                      colapsada={colapsado(f)}
                      inicioSemana={esLunes(f)}
                      feriado={feriados.has(f)}
                      pasada={f < hoyISO}
                      fracciones={enCelda(cuadrilla.id, f).map((a) => a.fraccion)}
                    />
                  ))}

                  {ubicados.map(({ bloque, colocacion, carril }) => {
                    const accion = accionDeCierre(bloque, hoyISO);
                    const parteDelBloque = bloqueCerrado(bloque)
                      ? partesPorId.get(bloque.partes.find((x) => x != null) as number)
                      : undefined;
                    return (
                      <TarjetaAsignacion
                        key={bloque.key}
                        bloque={bloque}
                        ot={ots.get(bloque.otId)}
                        plan={planPorObra.get(bloque.otId)}
                        colocacion={colocacion}
                        carril={carril}
                        seleccionada={bloqueSeleccionado === bloque.key}
                        ejecutada={bloque.fechas.some((f) => ejecutadas.has(`${bloque.otId}:${f}`))}
                        // "Ya pasó" no es lo relevante: lo relevante es si tiene parte.
                        // Atenuar todo lo pasado por igual escondía justo las jornadas que
                        // requieren acción — las que se trabajaron y nadie cargó.
                        vencidaSinParte={bloque.fechas.some(
                          (f, i) => f < hoyISO && bloque.partes[i] == null,
                        )}
                        cierre={
                          parteDelBloque
                            ? {
                                estado: parteDelBloque.estado === "no_ejecutado" ? "no_ejecutado" : "ejecutado",
                                motivoLabel: etiquetaMotivo(parteDelBloque.motivoNoEjec),
                              }
                            : null
                        }
                        accionCierre={accion}
                        candado={candados?.has(bloque.otId) ?? false}
                        onCerrarJornada={(a) => onCerrarJornada(bloque, a)}
                        onAbrir={() => onAbrirBloque(bloque)}
                        onFraccion={(f) => onFraccion(bloque, f)}
                        onEditarJornadas={() => onEditarJornadas(bloque)}
                        onEstado={(e) => onEstado(bloque, e)}
                        onQuitar={() => onQuitar(bloque)}
                      />
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
