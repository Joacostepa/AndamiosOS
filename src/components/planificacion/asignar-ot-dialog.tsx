"use client";

import { useState } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Cuadrilla, ColaOT } from "@/hooks/use-planificacion";

// Alternativa al drag & drop: elegir OT habilitada + cuadrilla + día.
export function AsignarOtDialog({
  open,
  onOpenChange,
  otsHabilitadas,
  cuadrillas,
  dias,
  prefill,
  lockedOt,
  saving,
  onAsignar,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  otsHabilitadas: ColaOT[];
  cuadrillas: Cuadrilla[];
  dias: Date[];
  prefill?: { cuadrillaId: string; fecha: string } | null;
  // Cuando viene de "asignar fuera de orden": OT fija (jornada ya elegida por el board).
  lockedOt?: { id: string; label: string } | null;
  saving: boolean;
  onAsignar: (otId: string, cuadrillaId: string, fecha: string) => void;
}) {
  const [otId, setOtId] = useState("");
  const [cuadrillaId, setCuadrillaId] = useState("");
  const [fecha, setFecha] = useState("");

  // Resetear el formulario cada vez que el diálogo se abre (patrón de ajuste en render).
  const [prevOpen, setPrevOpen] = useState(false);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setOtId(lockedOt?.id ?? "");
      setCuadrillaId(prefill?.cuadrillaId ?? "");
      setFecha(prefill?.fecha ?? "");
    }
  }

  const puede = otId && cuadrillaId && fecha;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Asignar OT a una cuadrilla</DialogTitle>
          <DialogDescription>Solo se listan las OTs habilitadas (sin gate pendiente).</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Orden de trabajo</Label>
            {lockedOt ? (
              <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">{lockedOt.label}</div>
            ) : (
              <Select value={otId} onValueChange={(v) => v && setOtId(v)}>
                <SelectTrigger><SelectValue placeholder="Seleccionar OT..." /></SelectTrigger>
                <SelectContent>
                  {otsHabilitadas.length === 0 && <SelectItem value="_" disabled>No hay OTs habilitadas</SelectItem>}
                  {otsHabilitadas.map((o) => (
                    <SelectItem key={o.id} value={o.id}>{o.obras?.nombre ?? o.codigo} — {o.codigo}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Cuadrilla</Label>
            <Select value={cuadrillaId} onValueChange={(v) => v && setCuadrillaId(v)}>
              <SelectTrigger><SelectValue placeholder="Seleccionar cuadrilla..." /></SelectTrigger>
              <SelectContent>
                {cuadrillas.map((c) => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Día</Label>
            <Select value={fecha} onValueChange={(v) => v && setFecha(v)}>
              <SelectTrigger><SelectValue placeholder="Seleccionar día..." /></SelectTrigger>
              <SelectContent>
                {dias.map((d) => {
                  const f = format(d, "yyyy-MM-dd");
                  return <SelectItem key={f} value={f}>{format(d, "EEE d MMM", { locale: es })}</SelectItem>;
                })}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            disabled={!puede || saving}
            onClick={() => onAsignar(otId, cuadrillaId, fecha)}
            style={{ backgroundColor: "#D85A30", color: "#fff" }}
          >
            Asignar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
