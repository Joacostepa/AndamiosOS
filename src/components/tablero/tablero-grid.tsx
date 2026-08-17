"use client";

import { format, isSameDay, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { CeldaDia } from "./celda-dia";
import { TarjetaAsignacion } from "./tarjeta-asignacion";
import { agruparBloques, esDomingo, repartirEnCarriles } from "@/lib/tablero/bloques";
import { colorCuadrilla } from "@/lib/tablero/colores";
import { ocupacionCelda } from "@/lib/tablero/fracciones";
import type { FraccionStr } from "@/lib/tablero/fracciones";
import type { Bloque } from "@/lib/tablero/bloques";
import type { AsignacionTablero, CuadrillaTablero, OtTablero, ParteTablero } from "@/lib/tablero/tipos";

// Grilla semanal: filas = cuadrillas, columnas = días, celdas = asignaciones.
//
// El problema que resuelve la forma: una obra de varias jornadas se ve en TODOS los
// días que ocupa, no solo el que arranca. Por eso cada fila es una sub-grilla de días
// y las tarjetas se colocan con grid-column: span N sobre carriles (filas internas)
// que evitan que dos obras del mismo día se pisen.

const ANCHO_RECURSO = 168;
const ANCHO_MIN_DIA = 150;
const ALTO_BARRA = 22;

export function TableroGrid({
  cuadrillas,
  fechas,
  asignaciones,
  ots,
  partes,
  bloqueSeleccionado,
  onAbrirBloque,
  onFraccion,
  onEstado,
  onQuitar,
}: {
  cuadrillas: CuadrillaTablero[];
  fechas: string[];
  asignaciones: AsignacionTablero[];
  ots: Map<number, OtTablero>;
  partes: ParteTablero[];
  bloqueSeleccionado: string | null;
  onAbrirBloque: (bloque: Bloque) => void;
  onFraccion: (bloque: Bloque, f: FraccionStr) => void;
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

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <div className="grid" style={{ gridTemplateColumns: columnas, minWidth: anchoMinimo }}>
        {/* ── Encabezado ── */}
        <div className="sticky left-0 top-0 z-30 flex h-10 items-center border-b border-r bg-card px-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Cuadrillas
        </div>
        {fechas.map((f) => {
          const d = parseISO(f);
          const esHoy = isSameDay(d, hoy);
          return (
            <div
              key={`h-${f}`}
              className="sticky top-0 z-20 flex h-10 flex-col items-center justify-center border-b border-r"
              style={{ backgroundColor: esHoy ? "#FAECE7" : "var(--card)" }}
            >
              <span className="text-[10px] uppercase text-muted-foreground">
                {format(d, "EEE", { locale: es })}
              </span>
              <span className="text-[13px] font-medium" style={esHoy ? { color: "#D85A30" } : undefined}>
                {format(d, "d")}
              </span>
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
          const totalSemana = ocupacionCelda(
            deLaCuadrilla.filter((a) => fechas.includes(a.fecha)).map((a) => a.fraccion),
          ).total;

          return (
            <div key={cuadrilla.id} className="contents">
              <div
                className="sticky left-0 z-20 flex flex-col justify-center gap-0.5 border-b border-r bg-card px-2 py-1.5"
                style={{ borderLeft: `3px solid ${color.borde}` }}
              >
                <p className="truncate text-[12px] font-medium" title={cuadrilla.nombre}>
                  {cuadrilla.nombre}
                </p>
                <p className="text-[9px] text-muted-foreground">
                  {totalSemana > 0 ? `${totalSemana} jornada${totalSemana === 1 ? "" : "s"} en la semana` : "Sin carga"}
                  {cuadrilla.tercerizada ? " · tercerizada" : ""}
                </p>
              </div>

              <div style={{ gridColumn: "2 / -1" }}>
                <div
                  className="grid h-full"
                  style={{
                    gridTemplateColumns: `repeat(${fechas.length}, minmax(${ANCHO_MIN_DIA}px, 1fr))`,
                    gridTemplateRows: `repeat(${carriles}, minmax(34px, auto)) ${ALTO_BARRA}px`,
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
                      fracciones={deLaCuadrilla.filter((a) => a.fecha === f).map((a) => a.fraccion)}
                    />
                  ))}

                  {ubicados.map(({ bloque, colocacion, carril }) => (
                    <TarjetaAsignacion
                      key={bloque.key}
                      bloque={bloque}
                      ot={ots.get(bloque.otId)}
                      colocacion={colocacion}
                      carril={carril}
                      indiceColor={indice}
                      seleccionada={bloqueSeleccionado === bloque.key}
                      ejecutada={bloque.fechas.some((f) => ejecutadas.has(`${bloque.otId}:${f}`))}
                      onAbrir={() => onAbrirBloque(bloque)}
                      onFraccion={(f) => onFraccion(bloque, f)}
                      onEstado={(e) => onEstado(bloque, e)}
                      onQuitar={() => onQuitar(bloque)}
                    />
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
