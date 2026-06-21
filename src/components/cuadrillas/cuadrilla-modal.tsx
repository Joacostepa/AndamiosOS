"use client";

import { useState } from "react";
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

export function CuadrillaModal({
  open,
  onOpenChange,
  modo,
  nombreInicial = "",
  saving,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  modo: "crear" | "editar";
  nombreInicial?: string;
  saving: boolean;
  onSubmit: (nombre: string) => void;
}) {
  const [nombre, setNombre] = useState(nombreInicial);
  const [prevOpen, setPrevOpen] = useState(false);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setNombre(nombreInicial);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{modo === "crear" ? "Nueva cuadrilla" : "Editar nombre"}</DialogTitle>
          {modo === "crear" && (
            <DialogDescription>El responsable y el personal se asignan después.</DialogDescription>
          )}
        </DialogHeader>
        <div className="space-y-1.5">
          <Label>Nombre</Label>
          <Input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Ej: Cuadrilla 5, Cuadrilla 1B"
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            disabled={!nombre.trim() || saving}
            onClick={() => onSubmit(nombre.trim())}
            style={{ backgroundColor: "#D85A30", color: "#fff" }}
          >
            {modo === "crear" ? "Crear" : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
