"use client";

import { useState } from "react";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { Wrench } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FRACCIONES, type FraccionStr } from "@/lib/tablero/fracciones";
import { CORAL, TAREA } from "@/lib/tablero/colores";
import { TIPOS_TAREA, type TipoTarea } from "@/lib/tablero/tipos";
import type { CuadrillaTablero } from "@/lib/tablero/tipos";

// Alta y edición de una tarjeta de operaciones.
//
// CUATRO CAMPOS Y NADA MÁS. El gesto que tiene que ser barato es "la 3 va al depósito el
// martes": si crear una tarea cuesta más que mandar un WhatsApp, se sigue mandando el
// WhatsApp y el tablero sigue mintiendo que el martes está libre.
//
// Por eso se abre con la cuadrilla y el día YA PUESTOS —vienen de la celda donde se hizo
// clic— y el foco arranca en el título, que es lo único que no se puede adivinar.

export type ValoresTarea = {
  titulo: string;
  tipo: TipoTarea;
  notas: string;
  fraccion: FraccionStr;
  dias: number;
};

const INICIAL: ValoresTarea = {
  titulo: "",
  tipo: "deposito",
  notas: "",
  // Media jornada por defecto y no una entera: lo que motiva la tarjeta —una vuelta al
  // depósito, un traslado— rara vez se come el día. Arrancar en 1 hacía que la celda se
  // viera completa de más y que nadie corrigiera el valor.
  fraccion: "0.50",
  dias: 1,
};

export function DialogoTarea({
  abierto,
  /** Celda donde se hizo clic. En edición, el día y la cuadrilla que ya tenía. */
  fecha,
  cuadrillaId,
  cuadrillas,
  /** Con valor, el diálogo edita en vez de crear. */
  edicion = null,
  guardando,
  onGuardar,
  onOpenChange,
}: {
  abierto: boolean;
  fecha: string | null;
  cuadrillaId: number | null;
  cuadrillas: CuadrillaTablero[];
  edicion?: (ValoresTarea & { grupoId: number }) | null;
  guardando: boolean;
  onGuardar: (v: ValoresTarea) => void;
  onOpenChange: (abierto: boolean) => void;
}) {
  // Se siembra al abrir derivando en el render, igual que DialogoJornadas: así no hay un
  // ciclo extra con el formulario vacío, y al cerrar se descarta para que la próxima
  // apertura no muestre lo tipeado la vez anterior.
  const [estado, setEstado] = useState<{ clave: string; v: ValoresTarea } | null>(null);
  const clave = abierto ? `${edicion?.grupoId ?? "nueva"}:${fecha ?? ""}:${cuadrillaId ?? ""}` : null;
  if (clave == null) {
    if (estado !== null) setEstado(null);
  } else if (estado?.clave !== clave) {
    setEstado({ clave, v: edicion ? { ...edicion } : INICIAL });
  }
  const v = estado?.clave === clave ? estado.v : INICIAL;
  const set = (parcial: Partial<ValoresTarea>) =>
    setEstado((prev) => (prev ? { ...prev, v: { ...prev.v, ...parcial } } : prev));

  if (!fecha) return null;

  const cuadrilla = cuadrillas.find((c) => c.id === cuadrillaId);
  const puedeGuardar = v.titulo.trim().length > 0 && !guardando;

  return (
    <Dialog open={abierto} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="text-left">
          <DialogTitle className="flex items-center gap-2 pr-6 text-base leading-snug">
            <Wrench className="h-4 w-4" style={{ color: TAREA.text }} />
            {edicion ? "Editar tarea" : "Nueva tarea de operaciones"}
          </DialogTitle>
          {/* Dónde va a caer, en palabras. Es lo que evita crear la tarea en la fila
              equivocada cuando el clic se fue una celda de más. */}
          <p className="text-xs text-muted-foreground">
            {cuadrilla?.nombre ?? "Sin cuadrilla"} ·{" "}
            {format(parseISO(fecha), "EEEE d 'de' MMMM", { locale: es })}
          </p>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <label htmlFor="tarea-titulo" className="text-xs font-medium">
              Qué hay que hacer
            </label>
            <Input
              id="tarea-titulo"
              autoFocus
              value={v.titulo}
              onChange={(e) => set({ titulo: e.target.value })}
              placeholder="Desarmar cañería en el depósito"
              maxLength={200}
              onKeyDown={(e) => {
                if (e.key === "Enter" && puedeGuardar) onGuardar(v);
              }}
            />
          </div>

          <div className="flex gap-2">
            <div className="flex-1 space-y-1">
              <label className="text-xs font-medium">Tipo</label>
              <Select
                items={TIPOS_TAREA}
                value={v.tipo}
                onValueChange={(x) => x && set({ tipo: x as TipoTarea })}
              >
                <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(TIPOS_TAREA).map(([valor, label]) => (
                    <SelectItem key={valor} value={valor}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex-1 space-y-1">
              {/* La misma escala que las obras: media jornada significa lo mismo en las
                  dos tarjetas, y es lo que descuenta de la capacidad del día. */}
              <label className="text-xs font-medium">Cuánto ocupa</label>
              <Select
                items={Object.fromEntries(FRACCIONES.map((f) => [f.value, f.detalle]))}
                value={v.fraccion}
                onValueChange={(x) => x && set({ fraccion: x as FraccionStr })}
              >
                <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FRACCIONES.map((f) => (
                    <SelectItem key={f.value} value={f.value}>{f.detalle}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Los días sólo se eligen al CREAR: en edición, agregar o quitar días cambia
              qué filas existen, y eso se hace arrastrando o desde el menú de la tarjeta. */}
          {!edicion && (
            <div className="space-y-1">
              <label htmlFor="tarea-dias" className="text-xs font-medium">
                Días corridos
              </label>
              <div className="flex items-center gap-2">
                <Input
                  id="tarea-dias"
                  type="number"
                  min={1}
                  max={30}
                  value={v.dias}
                  onChange={(e) => set({ dias: Math.max(1, Math.min(30, Number(e.target.value) || 1)) })}
                  className="h-9 w-20"
                />
                <span className="text-xs text-muted-foreground">
                  {v.dias === 1 ? "Sólo ese día" : `Saltea el domingo, como una obra`}
                </span>
              </div>
            </div>
          )}

          <div className="space-y-1">
            <label htmlFor="tarea-notas" className="text-xs font-medium">
              Notas <span className="font-normal text-muted-foreground">(opcional)</span>
            </label>
            <Textarea
              id="tarea-notas"
              value={v.notas}
              onChange={(e) => set({ notas: e.target.value })}
              placeholder="Llevar la amoladora chica"
              rows={2}
              maxLength={1000}
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={guardando}>
            Cancelar
          </Button>
          <Button
            className="ml-auto"
            style={{ backgroundColor: CORAL, color: "#fff" }}
            disabled={!puedeGuardar}
            onClick={() => onGuardar(v)}
          >
            {guardando ? "Guardando…" : edicion ? "Guardar" : "Crear tarea"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
