"use client";

import { useState } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { HORAS_NETAS } from "@/lib/planificacion/jornada";
import type { Asignacion } from "@/hooks/use-planificacion";

export function MoverDiaDialog({
  open,
  onOpenChange,
  asignacion,
  horasUsadasEn,
  saving,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  asignacion: Asignacion | null;
  // Horas ya ocupadas por la cuadrilla en una fecha (excluyendo esta asignación).
  horasUsadasEn: (cuadrillaId: string, fecha: string) => number;
  saving: boolean;
  onConfirm: (fecha: string) => void;
}) {
  const [sel, setSel] = useState<Date | undefined>(undefined);

  // Reset al abrir.
  const [prevOpen, setPrevOpen] = useState(false);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setSel(asignacion ? new Date(`${asignacion.fecha}T00:00:00`) : undefined);
  }

  const fechaStr = sel ? format(sel, "yyyy-MM-dd") : "";
  const sobreCapacidad =
    !!asignacion && !!fechaStr
      ? horasUsadasEn(asignacion.cuadrilla_id, fechaStr) + asignacion.horas_jornada > HORAS_NETAS
      : false;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mover a otro día</DialogTitle>
          <DialogDescription>
            Se mantiene el recurso (cuadrilla/camión); solo cambia el día.
          </DialogDescription>
        </DialogHeader>

        <div className="flex justify-center">
          <Calendar mode="single" selected={sel} onSelect={setSel} weekStartsOn={1} />
        </div>

        {sobreCapacidad && (
          <p className="flex items-center gap-1.5 text-[11px]" style={{ color: "#D85A30" }}>
            <AlertTriangle className="h-3.5 w-3.5" />
            Ese día la cuadrilla quedaría sobreasignada. Se puede mover igual.
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            disabled={!fechaStr || saving}
            onClick={() => onConfirm(fechaStr)}
            style={{ backgroundColor: "#D85A30", color: "#fff" }}
          >
            Mover {sel ? `al ${format(sel, "EEE d MMM", { locale: es })}` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
