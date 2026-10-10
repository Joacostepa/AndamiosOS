"use client";

import { useRef } from "react";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// El diálogo de confirmación del módulo de permisos (reemplaza a los window.confirm, 09/10).
// La forma (docs/permisos/rediseno.md § 4.4):
//   - Título: pregunta con verbo y la obra.
//   - Una o dos frases: qué pasa, a quién le llega, si se puede deshacer.
//   - Si sale hacia afuera, qué se manda (children).
//   - Botones: Cancelar y un verbo concreto. Lo irreversible va en rojo y arranca con el foco en
//     Cancelar, para que un Enter apurado no pague ni presente nada.

export function Dialogo({
  open,
  onOpenChange,
  titulo,
  texto,
  children,
  confirmar,
  cancelar = "Cancelar",
  onConfirmar,
  cargando = false,
  peligroso = false,
  deshabilitado = false,
  etiqueta,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  titulo: string;
  texto?: React.ReactNode;
  children?: React.ReactNode;
  confirmar: string;
  cancelar?: string;
  onConfirmar: () => void;
  cargando?: boolean;
  /** Irreversible: botón rojo y foco inicial en Cancelar. */
  peligroso?: boolean;
  deshabilitado?: boolean;
  /** Chip arriba del título: "Sale un mail afuera", "No se deshace". */
  etiqueta?: { texto: string; tono: "marcha" | "bloqueo" | "aviso" };
}) {
  const cancelarRef = useRef<HTMLButtonElement>(null);
  return (
    <Dialog open={open} onOpenChange={(o) => !cargando && onOpenChange(o)}>
      <DialogContent className="sm:max-w-lg" initialFocus={peligroso ? cancelarRef : undefined}>
        <DialogHeader>
          {etiqueta && (
            <span
              className={cn(
                "inline-flex h-5 w-fit items-center rounded-full px-2 text-[12px] font-medium",
                etiqueta.tono === "bloqueo" && "bg-red-500/10 text-red-700 dark:text-red-300",
                etiqueta.tono === "marcha" && "bg-blue-500/10 text-blue-700 dark:text-blue-300",
                etiqueta.tono === "aviso" && "bg-amber-500/10 text-amber-800 dark:text-amber-300",
              )}
            >
              {etiqueta.texto}
            </span>
          )}
          <DialogTitle className="text-[17px] leading-snug">{titulo}</DialogTitle>
          {texto && <DialogDescription className="text-[14px] text-foreground/80">{texto}</DialogDescription>}
        </DialogHeader>
        {children && <div className="space-y-2 text-[13px]">{children}</div>}
        <DialogFooter>
          <Button ref={cancelarRef} variant="outline" onClick={() => onOpenChange(false)} disabled={cargando}>
            {cancelar}
          </Button>
          <Button variant={peligroso ? "destructive" : "default"} onClick={onConfirmar} disabled={cargando || deshabilitado}>
            {cargando && <Loader2 className="size-4 animate-spin" />}
            {confirmar}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Los datos que salen hacia afuera, en una caja gris. */
export function DatosQueSalen({ filas }: { filas: { etiqueta: string; valor: React.ReactNode; aviso?: React.ReactNode }[] }) {
  return (
    <dl className="space-y-2 rounded-md bg-muted px-3 py-2.5">
      {filas.map((f) => (
        <div key={f.etiqueta} className="grid gap-0.5">
          <dt className="text-[12px] text-muted-foreground">{f.etiqueta}</dt>
          <dd className="break-words text-[13px]">{f.valor}</dd>
          {f.aviso && <dd>{f.aviso}</dd>}
        </div>
      ))}
    </dl>
  );
}
