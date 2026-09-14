"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/**
 * Muestra la contraseña temporal recién generada. Es la ÚNICA vez que se ve: no se guarda
 * en ningún lado que se pueda volver a leer, así que si se pierde, se resetea otra.
 */
export function ClaveTemporalDialog({
  datos,
  onClose,
}: {
  datos: { email: string; clave: string } | null;
  onClose: () => void;
}) {
  const [copiada, setCopiada] = useState(false);

  async function copiar() {
    if (!datos) return;
    try {
      await navigator.clipboard.writeText(datos.clave);
      setCopiada(true);
    } catch {
      toast.error("No se pudo copiar: seleccionala a mano");
    }
  }

  return (
    <Dialog open={!!datos} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Contraseña temporal</DialogTitle>
          <DialogDescription>
            Pasásela a {datos?.email} por un canal privado. Es la única vez que se muestra; al
            entrar le va a pedir que elija una propia.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2">
          <code className="flex-1 select-all rounded-md border bg-muted px-3 py-2 text-center font-mono text-lg tracking-wider">
            {datos?.clave}
          </code>
          <Button variant="outline" size="icon" onClick={copiar} aria-label="Copiar contraseña">
            {copiada ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>
        <DialogFooter>
          <Button onClick={onClose}>Listo</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
