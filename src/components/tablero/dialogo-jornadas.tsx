"use client";

import { useState } from "react";
import { addDays, format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { CalendarPlus, CircleCheck, Link2, Lock, Plus, TriangleAlert, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FRACCIONES, ocupacionCelda, type FraccionStr, aFraccionStr } from "@/lib/tablero/fracciones";
import { siguienteDiaLaboral, sonContiguas } from "@/lib/tablero/bloques";
import { CORAL } from "@/lib/tablero/colores";
import type { AsignacionTablero, CuadrillaTablero, OtTablero } from "@/lib/tablero/tipos";

// Días de una obra: cuántos son, qué día cae cada uno y qué fracción ocupa.
//
// POR QUÉ EXISTE: una obra estimada en una jornada se extiende a dos y no había forma
// de sumarle el día. Una vez asignada sale de la bandeja, así que no se podía volver a
// arrastrar. Acá se agregan y se quitan jornadas, y se edita la fracción de cada una,
// que en una obra de varios días no es un número sino uno por día.
//
// ES DE LA OBRA, NO DEL TRAMO. En la grilla, los días de una obra se agrupan en tarjetas
// de días corridos: quitarle el día del medio a una obra de tres la parte en dos tarjetas
// separadas (ver agruparBloques). Cuando este diálogo trabajaba sobre UNA tarjeta, esa
// obra partida quedaba sin arreglo posible: cada tarjeta mostraba su mitad, "agregar
// jornada" sólo sabía sumar al final, y el hueco del medio no se podía volver a llenar.
// Por eso acá entran TODAS las jornadas de la obra, con la fecha de cada una editable y
// un botón que las vuelve a dejar corridas de una.
//
// Las jornadas ya cerradas no se tocan: su fracción y su fecha quedaron registradas en el
// parte, y cambiarlas dejaría el tablero diciendo una cosa y el parte otra.

export type CambiosJornadas = {
  /** Días existentes que cambiaron de fracción. */
  fracciones: { asignacionId: number; fraccion: FraccionStr }[];
  /** Días existentes que se movieron de fecha. */
  fechas: { asignacionId: number; fecha: string }[];
  /** Días nuevos a crear. */
  nuevas: { fecha: string; fraccion: FraccionStr; cuadrillaId: number | null; ordenDia: number }[];
  /** Días que se sacan del tablero. */
  borradas: number[];
};

type Fila = {
  /** Sin id = jornada nueva, todavía no existe en Odoo. */
  asignacionId: number | null;
  fecha: string;
  fraccion: string;
  cerrada: boolean;
  cuadrillaId: number | null;
  ordenDia: number;
};

const porFecha = (a: Fila, b: Fila) =>
  a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : (a.asignacionId ?? 0) - (b.asignacionId ?? 0);

function filasDe(asignaciones: AsignacionTablero[]): Fila[] {
  return asignaciones
    .map((a) => ({
      asignacionId: a.id,
      fecha: a.fecha,
      fraccion: aFraccionStr(a.fraccion),
      cerrada: a.parteId != null,
      cuadrillaId: a.cuadrillaId,
      ordenDia: a.ordenDia,
    }))
    .sort(porFecha);
}

export function DialogoJornadas({
  abierto,
  otId,
  ot,
  asignaciones,
  cuadrillas,
  fueraDeRango,
  guardando,
  onGuardar,
  onOpenChange,
}: {
  abierto: boolean;
  otId: number | null;
  ot: OtTablero | undefined;
  /** TODAS las jornadas de la obra que hay cargadas, sin importar en qué tarjeta caen. */
  asignaciones: AsignacionTablero[];
  cuadrillas: CuadrillaTablero[];
  /**
   * Jornadas de la obra que existen en Odoo pero caen fuera del rango de fechas cargado.
   * No se pueden editar desde acá y hay que decirlo: si no, el diálogo se lee como si la
   * obra tuviera menos días de los que tiene.
   */
  fueraDeRango: number;
  guardando: boolean;
  onGuardar: (cambios: CambiosJornadas) => void;
  onOpenChange: (abierto: boolean) => void;
}) {
  // Se siembra al abrir, derivando en el render en vez de con un efecto: así no hay un
  // ciclo extra con la lista vacía. Una vez sembrado no se vuelve a tocar mientras el
  // diálogo esté abierto, para que un refetch de fondo no se lleve puesta la edición.
  //
  // Y se DESCARTA al cerrar. La clave es el otId, que no cambia: sin este borrado, volver
  // a abrir la misma obra mostraría las filas viejas —incluidas las que se acababan de
  // guardar— porque la condición de siembra ya estaría satisfecha.
  const [edicion, setEdicion] = useState<{ clave: number; filas: Fila[] } | null>(null);
  const clave = abierto && otId != null ? otId : null;
  if (clave == null) {
    if (edicion !== null) setEdicion(null);
  } else if (edicion?.clave !== clave) {
    setEdicion({ clave, filas: filasDe(asignaciones) });
  }
  const filas = edicion?.clave === clave ? edicion.filas : [];
  // Toda escritura de filas las deja ordenadas por fecha: cambiarle la fecha a un día lo
  // reubica en la lista, que es como se lee un plan.
  const setFilas = (fn: (prev: Fila[]) => Fila[]) =>
    setEdicion((prev) => (prev ? { ...prev, filas: [...fn(prev.filas)].sort(porFecha) } : prev));

  if (otId == null) return null;

  const original = filasDe(asignaciones);
  const originalPorId = new Map(original.map((o) => [o.asignacionId, o]));
  const total = ocupacionCelda(filas.map((f) => Number(f.fraccion))).total;
  const nombreCuadrilla = (id: number | null) =>
    id == null ? "sin cuadrilla" : (cuadrillas.find((c) => c.id === id)?.nombre ?? `#${id}`);
  // La columna de cuadrilla sólo aparece si la obra está repartida entre varias: en el
  // caso normal repetiría el mismo nombre en cada fila.
  const variasCuadrillas = new Set(filas.map((f) => f.cuadrillaId)).size > 1;

  const editables = filas.filter((f) => !f.cerrada);
  const cambios: CambiosJornadas = {
    fracciones: editables
      .filter((f): f is Fila & { asignacionId: number } => f.asignacionId !== null)
      .filter((f) => f.fraccion !== originalPorId.get(f.asignacionId)?.fraccion)
      .map((f) => ({ asignacionId: f.asignacionId, fraccion: f.fraccion as FraccionStr })),
    fechas: editables
      .filter((f): f is Fila & { asignacionId: number } => f.asignacionId !== null)
      .filter((f) => f.fecha !== originalPorId.get(f.asignacionId)?.fecha)
      .map((f) => ({ asignacionId: f.asignacionId, fecha: f.fecha })),
    nuevas: filas
      .filter((f) => f.asignacionId === null)
      .map((f) => ({
        fecha: f.fecha,
        fraccion: f.fraccion as FraccionStr,
        cuadrillaId: f.cuadrillaId,
        ordenDia: f.ordenDia,
      })),
    borradas: original
      .filter((o) => !o.cerrada && !filas.some((f) => f.asignacionId === o.asignacionId))
      .map((o) => o.asignacionId as number),
  };
  const hayCambios =
    cambios.fracciones.length + cambios.fechas.length + cambios.nuevas.length + cambios.borradas.length >
    0;

  // Dos jornadas de la misma obra el mismo día no significan nada y encima parten la
  // tarjeta en dos, así que se frena el guardado hasta resolverlo.
  const repetidas = new Set(
    filas.map((f) => f.fecha).filter((f, i, todas) => todas.indexOf(f) !== i),
  );

  const hayHueco = filas.some((f, i) => i > 0 && !sonContiguas(filas[i - 1].fecha, f.fecha));
  // Juntar mueve fechas, y la de una jornada cerrada ya quedó escrita en su parte. Con
  // alguna cerrada, el arreglo es a mano fila por fila.
  const puedeJuntar = hayHueco && filas.length > 1 && !filas.some((f) => f.cerrada);

  function agregarJornada() {
    setFilas((prev) => {
      const ultima = prev[prev.length - 1];
      // Se agrega al final, en días corridos: es como se extiende una obra en la calle.
      // Si se borraron todas las filas, se reengancha a la primera fecha que tenía la obra.
      const base = ultima?.fecha ?? asignaciones[0]?.fecha;
      if (!base) return prev;
      const fecha = ultima ? siguienteDiaLaboral(base) : base;
      return [
        ...prev,
        {
          asignacionId: null,
          fecha,
          fraccion: "1",
          cerrada: false,
          // Hereda la cuadrilla y el apilado del último día: extender una obra no la cambia
          // de cuadrilla.
          cuadrillaId: ultima?.cuadrillaId ?? asignaciones[0]?.cuadrillaId ?? null,
          ordenDia: ultima?.ordenDia ?? asignaciones[0]?.ordenDia ?? 0,
        },
      ];
    });
  }

  /**
   * Agregar el domingo que `agregarJornada` saltea. Es la otra vía —además del drop
   * explícito sobre la columna— para planificar un domingo: a veces se trabaja, y desde
   * acá se puede aunque la obra ya esté asignada y fuera de la bandeja.
   */
  function agregarDomingo() {
    setFilas((prev) => {
      const ultima = prev[prev.length - 1];
      if (!ultima) return prev;
      const siguiente = format(addDays(parseISO(ultima.fecha), 1), "yyyy-MM-dd");
      return [
        ...prev,
        {
          asignacionId: null,
          fecha: siguiente,
          fraccion: "1",
          cerrada: false,
          cuadrillaId: ultima.cuadrillaId,
          ordenDia: ultima.ordenDia,
        },
      ];
    });
  }

  /**
   * Vuelve a dejar los días corridos desde el primero, salteando domingo. Es el arreglo
   * de un solo gesto para la obra que quedó partida: sin esto hay que corregir la fecha
   * de cada día a mano hasta cerrar el hueco.
   */
  function juntarDiasCorridos() {
    setFilas((prev) => {
      let cursor = prev[0]?.fecha;
      if (!cursor) return prev;
      return prev.map((fila, i) => {
        if (i === 0) return fila;
        cursor = siguienteDiaLaboral(cursor);
        return { ...fila, fecha: cursor };
      });
    });
  }

  // Sólo se ofrece cuando el día que sigue al último ES domingo: en cualquier otro caso
  // "agregar jornada" ya cae en el día correcto y un segundo botón sería ruido.
  const ultimaFila = filas[filas.length - 1];
  const sigueDomingo = ultimaFila
    ? parseISO(ultimaFila.fecha).getDay() === 6
    : false;

  return (
    <Dialog open={abierto} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader className="text-left">
          <DialogTitle className="pr-6 text-base leading-snug">Jornadas de la obra</DialogTitle>
          <p className="text-xs text-muted-foreground">{ot?.titulo}</p>
        </DialogHeader>

        {fueraDeRango > 0 && (
          <p className="flex items-start gap-1.5 rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
            <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0" />
            <span>
              La obra tiene {fueraDeRango} jornada{fueraDeRango === 1 ? "" : "s"} más fuera de las
              semanas cargadas. No se editan desde acá: scrolleá el tablero hasta esas fechas.
            </span>
          </p>
        )}

        <div className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
          {filas.map((fila, i) => (
            <div key={fila.asignacionId ?? `nueva-${i}`} className="flex items-center gap-2">
              <span className="w-8 shrink-0 text-xs uppercase text-muted-foreground">
                {format(parseISO(fila.fecha), "EEE", { locale: es })}
              </span>

              {fila.cerrada ? (
                <span className="w-[130px] shrink-0 text-sm">
                  {format(parseISO(fila.fecha), "d MMM yyyy", { locale: es })}
                </span>
              ) : (
                <input
                  type="date"
                  value={fila.fecha}
                  onChange={(e) =>
                    e.target.value &&
                    setFilas((prev) =>
                      prev.map((x, idx) => (idx === i ? { ...x, fecha: e.target.value } : x)),
                    )
                  }
                  aria-label="Fecha de la jornada"
                  className={`h-8 w-[130px] shrink-0 rounded-md border bg-background px-2 text-sm ${
                    repetidas.has(fila.fecha) ? "border-red-500" : "border-input"
                  }`}
                />
              )}

              {fila.asignacionId === null && (
                <span className="text-[10px] uppercase" style={{ color: CORAL }}>
                  nueva
                </span>
              )}

              {variasCuadrillas && (
                <span className="w-24 shrink-0 truncate text-[11px] text-muted-foreground">
                  {nombreCuadrilla(fila.cuadrillaId)}
                </span>
              )}

              {fila.cerrada ? (
                <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <CircleCheck className="h-3.5 w-3.5" style={{ color: "#639922" }} />
                  Cerrada · {FRACCIONES.find((f) => f.value === fila.fraccion)?.label ?? ""}
                  <Lock className="h-3 w-3" />
                </span>
              ) : (
                <>
                  <Select
                    items={Object.fromEntries(FRACCIONES.map((f) => [f.value, f.detalle]))}
                    value={fila.fraccion}
                    onValueChange={(v) =>
                      v && setFilas((prev) => prev.map((x, idx) => (idx === i ? { ...x, fraccion: v } : x)))
                    }
                  >
                    <SelectTrigger className="h-8 flex-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {FRACCIONES.map((f) => (
                        <SelectItem key={f.value} value={f.value}>{f.detalle}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <button
                    type="button"
                    onClick={() => setFilas((prev) => prev.filter((_, idx) => idx !== i))}
                    className="rounded p-1 text-muted-foreground hover:bg-muted"
                    title="Quitar esta jornada"
                    aria-label="Quitar esta jornada"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
            </div>
          ))}
          {filas.length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">
              La obra se queda sin jornadas: al guardar vuelve a la bandeja.
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={agregarJornada}>
              <Plus className="mr-1 h-3.5 w-3.5" />
              Agregar jornada
            </Button>
            {sigueDomingo && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={agregarDomingo}
                title="La obra sigue el domingo en vez de saltear al lunes"
              >
                <CalendarPlus className="mr-1 h-3.5 w-3.5" />
                Trabajar el domingo
              </Button>
            )}
            {puedeJuntar && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={juntarDiasCorridos}
                title="Deja los días seguidos desde el primero, salteando domingo"
              >
                <Link2 className="mr-1 h-3.5 w-3.5" />
                Juntar en días corridos
              </Button>
            )}
          </div>
          <span className="text-xs text-muted-foreground">
            {total} jornada{total === 1 ? "" : "s"} en {filas.length} día{filas.length === 1 ? "" : "s"}
          </span>
        </div>

        {repetidas.size > 0 ? (
          <p className="text-xs text-red-600">
            Hay dos jornadas el mismo día. Cambiá una de fecha o quitala.
          </p>
        ) : (
          hayHueco && (
            <p className="text-xs text-muted-foreground">
              Los días no son corridos: en la grilla la obra se ve como tarjetas separadas, una
              por tramo.
            </p>
          )
        )}

        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={guardando}>
            Cancelar
          </Button>
          <Button
            className="ml-auto"
            style={{ backgroundColor: CORAL, color: "#fff" }}
            disabled={guardando || !hayCambios || repetidas.size > 0}
            onClick={() => onGuardar(cambios)}
          >
            {hayCambios ? "Guardar" : "Sin cambios"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
