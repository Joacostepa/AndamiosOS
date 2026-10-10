"use client";

// "Mandar a mano" a UNA persona (o al depósito): el mensaje para copiar o abrir en WhatsApp,
// por qué no salió por Telegram si falló, "Ya lo mandé" (lo marca, con Deshacer) y los
// avisos que siguen ("Avisar a Conte", "Avisar al depósito"). La lista de envío
// (lista-envio.tsx) hace lo mismo fila por fila.

import { useState } from "react";
import { toast } from "sonner";
import { Copy, MessageCircle, Send } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { PRI } from "./boton-coral";

export type Mensaje = {
  titulo: string;
  /** "Para Gómez · 11 5555-0000" */
  para: string;
  texto: string;
  waLink: string | null;
  /** Lo que salió mal con Telegram, en palabras. */
  error?: string | null;
  /** "Ya lo mandé": marca enviado (el chofer) o anota el aviso. */
  alMandar?: () => void;
  /** Botones para seguir avisando ("Avisar a Conte", "Avisar al depósito"). */
  otros?: { l: string; onClick: () => void }[];
  nota?: string;
};

export function DialogoMensaje({ m, onClose }: { m: Mensaje | null; onClose: () => void }) {
  const [copiado, setCopiado] = useState(false);
  const copiar = async () => {
    if (!m) return;
    try {
      await navigator.clipboard.writeText(m.texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      toast.error("No se pudo copiar: seleccioná el texto y copialo a mano");
    }
  };
  return (
    <Dialog open={!!m} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        {m && (
          <>
            <DialogTitle>{m.titulo}</DialogTitle>
            {m.error && <p className="text-sm font-medium text-hd-rojo">Telegram no lo mandó: {m.error}</p>}
            <DialogDescription>Para <b className="font-semibold text-foreground">{m.para}</b></DialogDescription>
            <div className="max-h-[40dvh] overflow-auto rounded-lg bg-muted px-3 py-2 text-[13.5px] leading-relaxed whitespace-pre-wrap select-all">{m.texto}</div>
            {m.nota && <p className="text-xs text-muted-foreground">{m.nota}</p>}
            {m.otros && m.otros.length > 0 && (
              <div className="grid gap-1.5">
                <p className="text-xs text-muted-foreground">También podés avisar:</p>
                <div className="flex flex-wrap gap-1.5">
                  {m.otros.map((o) => (
                    <Button key={o.l} size="sm" variant="outline" onClick={() => { onClose(); o.onClick(); }}>
                      {o.l}
                    </Button>
                  ))}
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={copiar}>
                <Copy /> {copiado ? "Copiado" : "Copiar"}
              </Button>
              {m.waLink ? (
                <a
                  href={m.waLink}
                  target="_blank"
                  rel="noreferrer"
                  className={buttonVariants({ variant: "outline" })}
                  onClick={() => { m.alMandar?.(); onClose(); }}
                >
                  <MessageCircle /> Abrir WhatsApp
                </a>
              ) : null}
              {m.alMandar && (
                <Button onClick={() => { m.alMandar?.(); onClose(); }} className={PRI}>
                  <Send /> Ya lo mandé
                </Button>
              )}
              {!m.alMandar && <Button variant="outline" onClick={onClose}>Listo</Button>}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
