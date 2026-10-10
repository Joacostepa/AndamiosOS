"use client";

import { useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { anularMovimiento, useInvalidarPanol } from "@/hooks/use-panol";
import { leerRechazo } from "@/lib/panol/estado";

// Lo irreversible pide motivo (docs/modulo-panol.md §3): anular, perder, dar de baja. El
// diálogo arranca con el foco en Cancelar cuando es peligroso, para que un Enter apurado no
// anule nada, y no deja confirmar sin motivo.

export function DialogoMotivo({
  open,
  onOpenChange,
  titulo,
  texto,
  confirmar,
  peligroso = false,
  motivoObligatorio = true,
  placeholder = "Por qué",
  children,
  listo = true,
  onConfirmar,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  titulo: string;
  texto?: React.ReactNode;
  confirmar: string;
  peligroso?: boolean;
  motivoObligatorio?: boolean;
  placeholder?: string;
  /** Campos extra (n° de denuncia, a dónde vuelve…), arriba del motivo. */
  children?: React.ReactNode;
  /** Los campos extra están completos. */
  listo?: boolean;
  /** Si tira, el error se muestra y el diálogo queda abierto. */
  onConfirmar: (motivo: string) => Promise<void>;
}) {
  const [motivo, setMotivo] = useState("");
  const [cargando, setCargando] = useState(false);
  const cancelarRef = useRef<HTMLButtonElement>(null);
  const falta = motivoObligatorio && !motivo.trim();

  async function confirmarYa() {
    setCargando(true);
    try {
      await onConfirmar(motivo.trim());
      setMotivo("");
      onOpenChange(false);
    } catch (e) {
      toast.error(leerRechazo(e instanceof Error ? e.message : String(e)).texto);
    } finally {
      setCargando(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !cargando && onOpenChange(o)}>
      <DialogContent className="sm:max-w-lg" initialFocus={peligroso ? cancelarRef : undefined}>
        <DialogHeader>
          <DialogTitle className="text-[17px] leading-snug">{titulo}</DialogTitle>
          {texto && <DialogDescription className="text-[14px] text-foreground/80">{texto}</DialogDescription>}
        </DialogHeader>
        <div className="space-y-3">
          {children}
          <label className="block space-y-1">
            <span className="text-[13px] font-medium">Motivo{motivoObligatorio ? "" : " (opcional)"}</span>
            <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder={placeholder} rows={2} />
          </label>
        </div>
        <DialogFooter>
          <Button ref={cancelarRef} variant="outline" onClick={() => onOpenChange(false)} disabled={cargando}>
            Cancelar
          </Button>
          <Button variant={peligroso ? "destructive" : "default"} onClick={confirmarYa} disabled={cargando || falta || !listo}>
            {cargando && <Loader2 className="size-4 animate-spin" />}
            {confirmar}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Anular un movimiento (encargado): se genera el inverso, enlazado al original. Una
 * anulación no se deshace —se carga el movimiento de nuevo—, por eso el aviso no trae
 * "Deshacer".
 */
export function DialogoAnular({
  movimiento,
  onOpenChange,
}: {
  movimiento: { id: string; descripcion: string } | null;
  onOpenChange: (o: boolean) => void;
}) {
  const invalidar = useInvalidarPanol();
  return (
    <DialogoMotivo
      open={!!movimiento}
      onOpenChange={onOpenChange}
      peligroso
      titulo="¿Anular este movimiento?"
      texto={<>{movimiento?.descripcion}. Se genera el movimiento inverso, enlazado a este. Nada se borra.</>}
      confirmar="Anular movimiento"
      placeholder="Ej.: se cargó a la obra equivocada"
      onConfirmar={async (motivo) => {
        await anularMovimiento(movimiento!.id, motivo);
        invalidar();
        toast.success("Movimiento anulado. Se generó el inverso.");
      }}
    />
  );
}
