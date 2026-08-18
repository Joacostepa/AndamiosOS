"use client";

import { useState } from "react";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { CircleCheck, Lock } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FRACCIONES, ocupacionCelda, type FraccionStr, aFraccionStr } from "@/lib/tablero/fracciones";
import { CORAL } from "@/lib/tablero/colores";
import type { Bloque } from "@/lib/tablero/bloques";
import type { OtTablero } from "@/lib/tablero/tipos";

// Fracción de cada jornada de una obra de varios días.
//
// El menú de la tarjeta solo puede editar la fracción cuando la obra es de un día: en
// una de varios, "la fracción" no es un número sino uno por día. Acá se ven todos
// juntos, que además es como se entiende si el último día es medio o entero.
//
// Las jornadas ya cerradas no se tocan: su fracción quedó registrada en el parte.

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
  /** Solo los días que cambiaron, para no reescribir de más. */
  onGuardar: (cambios: { asignacionId: number; fraccion: FraccionStr }[]) => void;
  onOpenChange: (abierto: boolean) => void;
}) {
  // Se siembra al abrir sobre un bloque distinto, derivando en el render en vez de con
  // un efecto: así no hay un ciclo extra con la lista vacía.
  const [edicion, setEdicion] = useState<{ clave: string; fracciones: string[] } | null>(null);
  const clave = abierto && bloque ? bloque.key : null;
  if (clave && bloque && edicion?.clave !== clave) {
    setEdicion({ clave, fracciones: bloque.fechas.map((_, i) => aFraccionStr(fraccionDe(bloque, i))) });
  }
  const fracciones = edicion?.clave === clave ? edicion.fracciones : [];
  const setFracciones = (fn: (prev: string[]) => string[]) =>
    setEdicion((prev) => (prev ? { ...prev, fracciones: fn(prev.fracciones) } : prev));

  if (!bloque) return null;

  const total = ocupacionCelda(fracciones.map(Number)).total;
  const cambios = bloque.ids
    .map((asignacionId, i) => ({ asignacionId, fraccion: fracciones[i] as FraccionStr, indice: i }))
    .filter((c) => c.fraccion && Number(c.fraccion) !== fraccionDe(bloque, c.indice))
    .filter((c) => bloque.partes[c.indice] == null)
    .map(({ asignacionId, fraccion }) => ({ asignacionId, fraccion }));

  return (
    <Dialog open={abierto} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="text-left">
          <DialogTitle className="pr-6 text-base leading-snug">Jornadas de la obra</DialogTitle>
          <p className="text-xs text-muted-foreground">{ot?.titulo}</p>
        </DialogHeader>

        <div className="max-h-[50vh] space-y-2 overflow-y-auto">
          {bloque.fechas.map((fecha, i) => {
            const cerrada = bloque.partes[i] != null;
            return (
              <div key={fecha} className="flex items-center gap-2">
                <span className="w-32 shrink-0 text-sm">
                  {format(parseISO(fecha), "EEE d MMM", { locale: es })}
                </span>
                {cerrada ? (
                  <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <CircleCheck className="h-3.5 w-3.5" style={{ color: "#639922" }} />
                    Cerrada · {FRACCIONES.find((f) => Number(f.value) === fraccionDe(bloque, i))?.label ?? ""}
                    <Lock className="h-3 w-3" />
                  </span>
                ) : (
                  <Select
                    items={Object.fromEntries(FRACCIONES.map((f) => [f.value, f.detalle]))}
                    value={fracciones[i] ?? ""}
                    onValueChange={(v) =>
                      v && setFracciones((prev) => prev.map((x, idx) => (idx === i ? v : x)))
                    }
                  >
                    <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {FRACCIONES.map((f) => (
                        <SelectItem key={f.value} value={f.value}>{f.detalle}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            );
          })}
        </div>

        <p className="text-xs text-muted-foreground">
          Total: {total} jornada{total === 1 ? "" : "s"} en {bloque.fechas.length} día
          {bloque.fechas.length === 1 ? "" : "s"}. Para agregar o quitar días, arrastrá la obra o
          usá &quot;Suspender&quot; y volvé a asignarla.
        </p>

        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={guardando}>
            Cancelar
          </Button>
          <Button
            className="ml-auto"
            style={{ backgroundColor: CORAL, color: "#fff" }}
            disabled={guardando || cambios.length === 0}
            onClick={() => onGuardar(cambios)}
          >
            {cambios.length === 0 ? "Sin cambios" : `Guardar ${cambios.length} cambio${cambios.length === 1 ? "" : "s"}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Fracción real de un día del bloque. El bloque muestra 1 para los multi-día, pero cada
 * asignación conserva la suya, que es la que hay que editar.
 */
function fraccionDe(bloque: Bloque, indice: number): number {
  return bloque.fraccionesPorDia?.[indice] ?? bloque.fraccion;
}
