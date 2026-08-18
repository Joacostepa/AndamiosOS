"use client";

import { useState } from "react";
import { addDays, format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { CalendarPlus, CircleCheck, Lock, Plus, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FRACCIONES, ocupacionCelda, type FraccionStr, aFraccionStr } from "@/lib/tablero/fracciones";
import { esDomingo, siguienteDiaLaboral } from "@/lib/tablero/bloques";
import { CORAL } from "@/lib/tablero/colores";
import type { Bloque } from "@/lib/tablero/bloques";
import type { OtTablero } from "@/lib/tablero/tipos";

// Días de una obra: cuántos son y qué fracción ocupa cada uno.
//
// POR QUÉ EXISTE: una obra estimada en una jornada se extiende a dos y no había forma
// de sumarle el día. Una vez asignada sale de la bandeja, así que no se podía volver a
// arrastrar. Acá se agregan y se quitan jornadas, y se edita la fracción de cada una,
// que en una obra de varios días no es un número sino uno por día.
//
// Las jornadas ya cerradas no se tocan: su fracción quedó registrada en el parte, y
// cambiarla dejaría el tablero diciendo una cosa y el parte otra.

export type CambiosJornadas = {
  /** Días existentes que cambiaron de fracción. */
  fracciones: { asignacionId: number; fraccion: FraccionStr }[];
  /** Días nuevos a crear. */
  nuevas: { fecha: string; fraccion: FraccionStr }[];
  /** Días que se sacan del tablero. */
  borradas: number[];
};

type Fila = {
  /** Sin id = jornada nueva, todavía no existe en Odoo. */
  asignacionId: number | null;
  fecha: string;
  fraccion: string;
  cerrada: boolean;
};

function filasDe(bloque: Bloque): Fila[] {
  return bloque.fechas.map((fecha, i) => ({
    asignacionId: bloque.ids[i],
    fecha,
    fraccion: aFraccionStr(bloque.fraccionesPorDia?.[i] ?? bloque.fraccion),
    cerrada: bloque.partes[i] != null,
  }));
}

export function DialogoJornadas({
  abierto,
  bloque,
  ot,
  guardando,
  onGuardar,
  onOpenChange,
}: {
  abierto: boolean;
  bloque: Bloque | null;
  ot: OtTablero | undefined;
  guardando: boolean;
  onGuardar: (cambios: CambiosJornadas) => void;
  onOpenChange: (abierto: boolean) => void;
}) {
  // Se siembra al abrir sobre un bloque distinto, derivando en el render en vez de con
  // un efecto: así no hay un ciclo extra con la lista vacía.
  const [edicion, setEdicion] = useState<{ clave: string; filas: Fila[] } | null>(null);
  const clave = abierto && bloque ? bloque.key : null;
  if (clave && bloque && edicion?.clave !== clave) {
    setEdicion({ clave, filas: filasDe(bloque) });
  }
  const filas = edicion?.clave === clave ? edicion.filas : [];
  const setFilas = (fn: (prev: Fila[]) => Fila[]) =>
    setEdicion((prev) => (prev ? { ...prev, filas: fn(prev.filas) } : prev));

  if (!bloque) return null;

  const original = filasDe(bloque);
  const total = ocupacionCelda(filas.map((f) => Number(f.fraccion))).total;

  const cambios: CambiosJornadas = {
    fracciones: filas
      .filter((f): f is Fila & { asignacionId: number } => f.asignacionId !== null && !f.cerrada)
      .filter((f) => f.fraccion !== original.find((o) => o.asignacionId === f.asignacionId)?.fraccion)
      .map((f) => ({ asignacionId: f.asignacionId, fraccion: f.fraccion as FraccionStr })),
    nuevas: filas
      .filter((f) => f.asignacionId === null)
      .map((f) => ({ fecha: f.fecha, fraccion: f.fraccion as FraccionStr })),
    borradas: original
      .filter((o) => !o.cerrada && !filas.some((f) => f.asignacionId === o.asignacionId))
      .map((o) => o.asignacionId as number),
  };
  const hayCambios =
    cambios.fracciones.length + cambios.nuevas.length + cambios.borradas.length > 0;

  function agregarJornada() {
    setFilas((prev) => {
      const ultima = prev[prev.length - 1];
      // Se agrega al final, en días corridos: es como se extiende una obra en la calle.
      const fecha = ultima ? siguienteDiaLaboral(ultima.fecha) : bloque!.fechas[0];
      return [...prev, { asignacionId: null, fecha, fraccion: "1", cerrada: false }];
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
      const base = ultima ? ultima.fecha : bloque!.fechas[0];
      const siguiente = format(addDays(parseISO(base), 1), "yyyy-MM-dd");
      return [...prev, { asignacionId: null, fecha: siguiente, fraccion: "1", cerrada: false }];
    });
  }

  // Sólo se ofrece cuando el día que sigue al último ES domingo: en cualquier otro caso
  // "agregar jornada" ya cae en el día correcto y un segundo botón sería ruido.
  const ultimaFila = filas[filas.length - 1];
  const sigueDomingo = ultimaFila
    ? esDomingo(format(addDays(parseISO(ultimaFila.fecha), 1), "yyyy-MM-dd"))
    : false;

  return (
    <Dialog open={abierto} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader className="text-left">
          <DialogTitle className="pr-6 text-base leading-snug">Jornadas de la obra</DialogTitle>
          <p className="text-xs text-muted-foreground">{ot?.titulo}</p>
        </DialogHeader>

        <div className="max-h-[50vh] space-y-2 overflow-y-auto">
          {filas.map((fila, i) => (
            <div key={`${fila.fecha}-${i}`} className="flex items-center gap-2">
              <span className="w-32 shrink-0 text-sm">
                {format(parseISO(fila.fecha), "EEE d MMM", { locale: es })}
                {fila.asignacionId === null && (
                  <span className="ml-1 text-[10px] uppercase" style={{ color: CORAL }}>nueva</span>
                )}
              </span>

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
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
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
          </div>
          <span className="text-xs text-muted-foreground">
            {total} jornada{total === 1 ? "" : "s"} en {filas.length} día{filas.length === 1 ? "" : "s"}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={guardando}>
            Cancelar
          </Button>
          <Button
            className="ml-auto"
            style={{ backgroundColor: CORAL, color: "#fff" }}
            disabled={guardando || !hayCambios}
            onClick={() => onGuardar(cambios)}
          >
            {hayCambios ? "Guardar" : "Sin cambios"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
