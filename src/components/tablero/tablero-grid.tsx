"use client";

import { format, isSameDay, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { AlertTriangle, MousePointerClick } from "lucide-react";
import { CeldaDia } from "./celda-dia";
import { TarjetaAsignacion } from "./tarjeta-asignacion";
import { agruparBloques, esDomingo, repartirEnCarriles } from "@/lib/tablero/bloques";
import { accionDeCierre, bloqueCerrado, type AccionCierre } from "@/lib/tablero/cierre";
import { MOTIVOS_NO_EJEC } from "@/lib/tablero/tipos-parte";
import { colorCuadrilla } from "@/lib/tablero/colores";
import { ocupacionCelda, CAPACIDAD_DIARIA } from "@/lib/tablero/fracciones";
import type { FraccionStr } from "@/lib/tablero/fracciones";
import type { Bloque } from "@/lib/tablero/bloques";
import type { AsignacionTablero, CuadrillaTablero, OtTablero, ParteTablero } from "@/lib/tablero/tipos";

// Grilla semanal: filas = cuadrillas, columnas = días, celdas = asignaciones.
//
// El problema que resuelve la forma: una obra de varias jornadas se ve en TODOS los
// días que ocupa, no solo el que arranca. Por eso cada fila es una sub-grilla de días
// y las tarjetas se colocan con grid-column: span N sobre carriles (filas internas)
// que evitan que dos obras del mismo día se pisen.
//
// Con 3 o 4 cuadrillas —el uso real— las filas se reparten todo el alto disponible.
// Con muchas, la grilla scrollea y quedan fijos el encabezado y la columna izquierda.

const ANCHO_RECURSO = 168;
const ANCHO_MIN_DIA = 132;
const ALTO_BARRA = 20;
/** Alto mínimo de fila: entran 3 o 4 tarjetas apiladas sin scroll interno. */
const ALTO_MIN_FILA = 132;

const DECIMAL = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 });

export function TableroGrid({
  cuadrillas,
  fechas,
  asignaciones,
  ots,
  partes,
  bloqueSeleccionado,
  hoy: hoyISO,
  onCerrarJornada,
  onAbrirBloque,
  onFraccion,
  onEditarJornadas,
  onEstado,
  onQuitar,
}: {
  cuadrillas: CuadrillaTablero[];
  fechas: string[];
  asignaciones: AsignacionTablero[];
  ots: Map<number, OtTablero>;
  partes: ParteTablero[];
  bloqueSeleccionado: string | null;
  /** Fecha de hoy en yyyy-MM-dd: define desde cuándo se puede cerrar una jornada. */
  hoy: string;
  onCerrarJornada: (bloque: Bloque, accion: NonNullable<AccionCierre>) => void;
  onAbrirBloque: (bloque: Bloque) => void;
  onFraccion: (bloque: Bloque, f: FraccionStr) => void;
  onEditarJornadas: (bloque: Bloque) => void;
  onEstado: (bloque: Bloque, e: "tentativa" | "confirmada") => void;
  onQuitar: (bloque: Bloque) => void;
}) {
  const hoy = new Date();
  const columnas = `${ANCHO_RECURSO}px repeat(${fechas.length}, minmax(${ANCHO_MIN_DIA}px, 1fr))`;
  const anchoMinimo = ANCHO_RECURSO + fechas.length * ANCHO_MIN_DIA;

  // Jornadas ya ejecutadas (parte diario cargado): la tarjeta se atenúa.
  const ejecutadas = new Set(
    partes.filter((p) => p.estado === "ejecutado").map((p) => `${p.otId}:${p.fecha}`),
  );
  const partesPorId = new Map(partes.map((p) => [p.id, p]));
  const etiquetaMotivo = (valor: string | null) =>
    MOTIVOS_NO_EJEC.find((m) => m.value === valor)?.label ?? valor;

  const enCelda = (cuadrillaId: number, fecha: string) =>
    asignaciones.filter((a) => a.cuadrillaId === cuadrillaId && a.fecha === fecha);

  // La sobreasignación es la señal más importante del tablero, y dentro de una celda
  // llena se pierde. Por eso sube también al encabezado del día y a la cuadrilla.
  const diasSobreasignados = new Set(
    fechas.filter((f) =>
      cuadrillas.some((c) => ocupacionCelda(enCelda(c.id, f).map((a) => a.fraccion)).nivel === "sobre"),
    ),
  );

  const hayAlgoAsignado = cuadrillas.some((c) =>
    fechas.some((f) => enCelda(c.id, f).length > 0),
  );

  return (
    <div className="relative min-h-0 min-w-0 flex-1 overflow-auto">
      <div
        className="grid min-h-full"
        style={{
          gridTemplateColumns: columnas,
          // Las filas crecen para repartirse el alto; con muchas cuadrillas cae al
          // mínimo y aparece el scroll vertical.
          gridTemplateRows: `40px repeat(${cuadrillas.length}, minmax(${ALTO_MIN_FILA}px, 1fr))`,
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
          const sobre = diasSobreasignados.has(f);
          return (
            <div
              key={`h-${f}`}
              className="sticky top-0 z-20 flex h-10 items-center justify-center gap-1.5 border-b border-r"
              style={{ backgroundColor: esHoy ? "#FAECE7" : "var(--card)" }}
            >
              <span className="text-[10px] uppercase text-muted-foreground">
                {format(d, "EEE", { locale: es })}
              </span>
              <span className="text-[13px] font-medium" style={esHoy ? { color: "#D85A30" } : undefined}>
                {format(d, "d")}
              </span>
              {sobre && (
                <span
                  className="flex items-center gap-0.5 rounded px-1 text-[9px] font-semibold"
                  style={{ backgroundColor: "#FDECEA", color: "#D92D20" }}
                  title="Alguna cuadrilla está sobreasignada este día"
                >
                  <AlertTriangle className="h-2.5 w-2.5" />
                  SOBRE
                </span>
              )}
            </div>
          );
        })}

        {/* ── Una fila por cuadrilla ── */}
        {cuadrillas.map((cuadrilla, indice) => {
          const deLaCuadrilla = asignaciones.filter((a) => a.cuadrillaId === cuadrilla.id);
          const ubicados = repartirEnCarriles(agruparBloques(deLaCuadrilla), fechas);
          const carriles = Math.max(1, ...ubicados.map((u) => u.carril + 1));
          const color = colorCuadrilla(indice);

          // Carga de la semana visible (las asignaciones llegan con una semana de más a
          // cada lado, para que los bloques que cruzan el borde lleguen enteros).
          const delRango = deLaCuadrilla.filter((a) => fechas.includes(a.fecha));
          const jornadas = ocupacionCelda(delRango.map((a) => a.fraccion)).total;
          const sobreEnLaSemana = fechas.some(
            (f) => ocupacionCelda(enCelda(cuadrilla.id, f).map((a) => a.fraccion)).nivel === "sobre",
          );
          const capacidadSemana = fechas.length * CAPACIDAD_DIARIA;

          return (
            <div key={cuadrilla.id} className="contents">
              <div
                className="sticky left-0 z-20 flex flex-col justify-center gap-1 border-b border-r bg-card px-2 py-1.5"
                style={{ borderLeft: `3px solid ${color.borde}` }}
              >
                <p className="truncate text-[12px] font-medium" title={cuadrilla.nombre}>
                  {cuadrilla.nombre}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {DECIMAL.format(jornadas)} de {capacidadSemana} jornadas
                  {cuadrilla.tercerizada ? " · terc." : ""}
                </p>
                {sobreEnLaSemana && (
                  <span
                    className="flex w-fit items-center gap-1 rounded px-1 text-[9px] font-semibold"
                    style={{ backgroundColor: "#FDECEA", color: "#D92D20" }}
                    title="Sobreasignada en algún día de la semana"
                  >
                    <AlertTriangle className="h-2.5 w-2.5" />
                    SOBREASIGNADA
                  </span>
                )}
              </div>

              <div style={{ gridColumn: "2 / -1" }}>
                <div
                  className="grid h-full"
                  style={{
                    // minmax(0,1fr) y no el ancho mínimo: ese ya lo impone la grilla
                    // externa. Declararlo en las dos hace que difieran por redondeo y
                    // aparezca un scroll horizontal de 2px.
                    gridTemplateColumns: `repeat(${fechas.length}, minmax(0, 1fr))`,
                    gridTemplateRows: `repeat(${carriles}, minmax(30px, auto)) 1fr ${ALTO_BARRA}px`,
                  }}
                >
                  {fechas.map((f, i) => (
                    <CeldaDia
                      key={`${cuadrilla.id}-${f}`}
                      cuadrillaId={cuadrilla.id}
                      fecha={f}
                      columna={i}
                      esHoy={isSameDay(parseISO(f), hoy)}
                      esDomingo={esDomingo(f)}
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
                      indiceColor={indice}
                      seleccionada={bloqueSeleccionado === bloque.key}
                      ejecutada={bloque.fechas.some((f) => ejecutadas.has(`${bloque.otId}:${f}`))}
                      cierre={
                        parteDelBloque
                          ? {
                              estado: parteDelBloque.estado === "no_ejecutado" ? "no_ejecutado" : "ejecutado",
                              motivoLabel: etiquetaMotivo(parteDelBloque.motivoNoEjec),
                            }
                          : null
                      }
                      accionCierre={accion}
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

      {/* Semana sin nada planificado: en vez de una grilla muda, qué hacer. No captura
          el puntero, así que las celdas de abajo siguen aceptando el arrastre. */}
      {!hayAlgoAsignado && (
        <div className="pointer-events-none absolute inset-0 top-10 flex items-center justify-center">
          <div className="flex items-center gap-2 rounded-lg border bg-card/95 px-4 py-3 text-sm text-muted-foreground shadow-sm">
            <MousePointerClick className="h-4 w-4" />
            Semana sin planificar: arrastrá una obra del panel derecho a un día.
          </div>
        </div>
      )}
    </div>
  );
}
