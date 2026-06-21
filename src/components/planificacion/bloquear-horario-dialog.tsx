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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Cuadrilla } from "@/hooks/use-planificacion";

export function BloquearHorarioDialog({
  open,
  onOpenChange,
  cuadrillas,
  dias,
  saving,
  onCrear,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  cuadrillas: Cuadrilla[];
  dias: Date[];
  saving: boolean;
  onCrear: (data: { cuadrilla_id: string; fecha: string; franja_desde: string; franja_hasta: string; motivo?: string }) => void;
}) {
  const [cuadrillaId, setCuadrillaId] = useState("");
  const [fecha, setFecha] = useState("");
  const [desde, setDesde] = useState("12:00");
  const [hasta, setHasta] = useState("13:00");
  const [motivo, setMotivo] = useState("");

  const puedeBloquear = cuadrillaId && fecha && desde && hasta && desde < hasta;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Bloquear franja horaria</DialogTitle>
          <DialogDescription>Impide asignar OTs que se superpongan con esa franja.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
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
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Desde</Label>
              <Input type="time" value={desde} onChange={(e) => setDesde(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Hasta</Label>
              <Input type="time" value={hasta} onChange={(e) => setHasta(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Motivo (opcional)</Label>
            <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Almuerzo, capacitación, feriado…" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            disabled={!puedeBloquear || saving}
            onClick={() => onCrear({ cuadrilla_id: cuadrillaId, fecha, franja_desde: desde, franja_hasta: hasta, motivo: motivo || undefined })}
            style={{ backgroundColor: "#D85A30", color: "#fff" }}
          >
            Bloquear
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
