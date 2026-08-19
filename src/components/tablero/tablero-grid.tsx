"use client";

import { format, isSameDay, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { AlertTriangle, MousePointerClick } from "lucide-react";
import { CeldaDia } from "./celda-dia";
import { TarjetaAsignacion } from "./tarjeta-asignacion";
import { agruparBloques, esDomingo, repartirEnCarriles } from "@/lib/tablero/bloques";
import { accionDeCierre, bloqueCerrado, type AccionCierre } from "@/lib/tablero/cierre";
import { MOTIVOS_NO_EJEC } from "@/lib/tablero/tipos-parte";
import { colorCuadrilla, CORAL } from "@/lib/tablero/colores";
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
/** Domingo sin trabajo: una canaleta, no una columna. */
const ANCHO_CANALETA = 28;
/** Franja al pie de la celda donde vive el riel de ocupación. */
const ALTO_BARRA = 10;
/**
 * Alto de una tarjeta. El mínimo da lugar a las dos líneas (dirección + cliente) sin que
 * se toquen; el máximo evita que una fila con una sola obra estire esa tarjeta a media
 * pantalla. Entre ambos, la fila reparte lo que sobra.
 */
const ALTO_CARRIL = 34;
const ALTO_CARRIL_MAX = 46;
/** Piso del alto de fila. La fila crece con sus carriles; esto es sólo el mínimo. */
const ALTO_MIN_FILA = 64;

const DECIMAL = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 });

function esLunes(fecha: string): boolean {
  return parseISO(fecha).getDay() === 1;
}

export function TableroGrid({
  cuadrillas,
  fechas,
  semanaCentrada,
  asignaciones,
  ots,
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
}: {
  cuadrillas: CuadrillaTablero[];
  fechas: string[];
  /**
   * Los 7 días de la semana centrada en el viewport: el período contra el que se mide la
   * carga de cada fila. No alcanza con `fechas`, que es todo el rango cargado y crece al
   * scrollear: dividir por él diluye la sobreasignación hasta hacerla invisible.
   */
  semanaCentrada: string[];
  asignaciones: AsignacionTablero[];
  ots: Map<number, OtTablero>;
  partes: ParteTablero[];
  bloqueSeleccionado: string | null;
  /** Fecha de hoy en yyyy-MM-dd: define desde cuándo se puede cerrar una jornada. */
  hoy: string;
  /** El board maneja el scroll (snap de semana, semana centrada en el label). */
  contenedorRef?: React.Ref<HTMLDivElement>;
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
}) {
  const hoy = new Date();

  const enCelda = (cuadrillaId: number, fecha: string) =>
    asignaciones.filter((a) => a.cuadrillaId === cuadrillaId && a.fecha === fecha);

  // Un domingo se colapsa si NINGUNA cuadrilla visible tiene algo asignado. Así el ritmo
  // de la semana no se mueve al scrollear —la columna está siempre— y un domingo
  // trabajado se vuelve notorio justamente porque se ensancha.
  const domingosActivos = new Set(
    fechas.filter((f) => esDomingo(f) && cuadrillas.some((c) => enCelda(c.id, f).length > 0)),
  );
  const colapsado = (f: string) => esDomingo(f) && !domingosActivos.has(f);

  // La plantilla externa impone los anchos; la interna los repite para que las celdas de
  // cada fila caigan exactamente bajo su encabezado. En las columnas elásticas la interna
  // usa minmax(0,1fr) y no el ancho mínimo: declararlo en las dos hace que difieran por
  // redondeo y aparezca un scroll horizontal de 2px.
  const plantillaExterna = fechas
    .map((f) => (colapsado(f) ? `${ANCHO_CANALETA}px` : `minmax(${ANCHO_MIN_DIA}px, 1fr)`))
    .join(" ");
  const plantillaInterna = fechas
    .map((f) => (colapsado(f) ? `${ANCHO_CANALETA}px` : "minmax(0, 1fr)"))
    .join(" ");
  const anchoMinimo =
    ANCHO_RECURSO + fechas.reduce((s, f) => s + (colapsado(f) ? ANCHO_CANALETA : ANCHO_MIN_DIA), 0);

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
    <div ref={contenedorRef} className="relative min-h-0 min-w-0 flex-1 overflow-auto">
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
          return (
            <div
              key={`h-${f}`}
              data-fecha={f}
              className="sticky top-0 z-20 flex h-10 items-center justify-center gap-1.5 border-b border-r bg-card"
              style={{
                // Separador de semana: ubicarse sin tener que leer las fechas.
                borderLeft: esLunes(f) ? "2px solid var(--border)" : undefined,
                backgroundColor: canaleta ? "#F1EFE8" : "var(--card)",
              }}
            >
              {canaleta ? (
                <span className="text-[11px] text-muted-foreground" title={`Domingo ${format(d, "d MMM", { locale: es })} · sin trabajo`}>
                  D
                </span>
              ) : (
                <>
                  {domingoActivo ? (
                    // El domingo trabajado se nombra entero: es la excepción y tiene que
                    // cantarse, no confundirse con un día más.
                    <span className="flex flex-col items-center leading-none">
                      <span className="text-[11px] text-muted-foreground">domingo</span>
                      <span className="mt-0.5 text-[13px] font-medium">{format(d, "d")}</span>
                    </span>
                  ) : (
                    <>
                      <span className="text-[10px] uppercase text-muted-foreground">
                        {format(d, "EEE", { locale: es })}
                      </span>
                      {/* Hoy sale del canal de FONDO: pintar la columna de rosado usaba el
                          mismo canal que el estado de error y el día de hoy parecía roto. */}
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
