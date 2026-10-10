"use client";

// Los diálogos de la vista Cuadrillas: "¿Lo pasás a la 3?", "Celular de …" y la ficha
// corta de una obra.

import { useState } from "react";
import Link from "next/link";
import type { DiaHoja } from "@/lib/hoja-dia/tipos";
import { cuadrillaDeObra, cNombre, nombreDe, obrasCon } from "@/lib/hoja-dia/estado";
import { textoMover } from "@/lib/hoja-dia/vista-cuadrillas";
import { useAccionPersona } from "@/hooks/use-hoja-dia";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { PRI } from "@/components/hoja-dia/comunes/boton-coral";

export type Mover = { pid: string; de: number; c: number; reemplaza: string | null };

export function DialogoMover({ dia, mover, onCerrar, onPasar }: { dia: DiaHoja; mover: Mover | null; onCerrar: () => void; onPasar: (m: Mover) => void }) {
  const t = mover ? textoMover(dia, mover.pid, mover.de, mover.c, mover.reemplaza) : null;
  return (
    <Dialog open={!!mover} onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent showCloseButton={false} className="sm:max-w-[500px]">
        {t && mover && (
          <>
            <DialogTitle className="text-[17px] font-semibold text-balance">{t.titulo}</DialogTitle>
            <DialogDescription className="text-[13px]">{t.texto}</DialogDescription>
            <DialogFooter className="flex-row justify-end gap-2">
              <Button variant="outline" onClick={onCerrar}>Cancelar</Button>
              <Button autoFocus className={PRI} onClick={() => onPasar(mover)}>Pasarlo</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function DialogoCelular({ dia, pid, onCerrar }: { dia: DiaHoja; pid: string | null; onCerrar: () => void }) {
  const persona = useAccionPersona(dia.fecha);
  const [num, setNum] = useState("11 ");
  const [mal, setMal] = useState(false);
  return (
    <Dialog open={!!pid} onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent showCloseButton={false} className="sm:max-w-[440px]">
        <DialogTitle className="text-[17px] font-semibold">Celular de {nombreDe(dia, pid)}</DialogTitle>
        <DialogDescription className="text-[13px]">Se guarda en Legajos. Es para los que todavía no lo tienen cargado.</DialogDescription>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (num.replace(/\D/g, "").length < 8) {
              setMal(true);
              return;
            }
            if (pid) persona.mutate({ accion: "celular", personaId: pid, telefono: num.trim() }, { onSuccess: onCerrar });
          }}
        >
          <label className="grid gap-1 text-[13px]">
            <span className="text-xs text-muted-foreground">Celular</span>
            <input
              autoFocus
              inputMode="tel"
              placeholder="11 5555-5555"
              value={num}
              aria-invalid={mal || undefined}
              onChange={(e) => {
                setNum(e.target.value);
                setMal(false);
              }}
              className="h-9 rounded-[7px] border border-input bg-hd-card2 px-2 text-sm"
            />
            {mal && <span className="text-xs text-hd-rojo">Faltan números: tiene que tener al menos 8.</span>}
          </label>
          <DialogFooter className="flex-row justify-end gap-2">
            <Button type="button" variant="outline" onClick={onCerrar}>Cancelar</Button>
            <Button type="submit" className={PRI} disabled={persona.isPending}>Guardar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DialogoObra({ dia, otId, onCerrar }: { dia: DiaHoja; otId: number | null; onCerrar: () => void }) {
  const c = otId != null ? cuadrillaDeObra(dia, otId) : null;
  const x = c != null ? obrasCon(dia, c).find((o) => o.o.otId === otId) : null;
  return (
    <Dialog open={otId != null} onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent showCloseButton={false} className="sm:max-w-[500px]">
        {x && (
          <>
            <DialogTitle className="text-[17px] font-semibold">OT {x.o.otId} · {x.o.corto}</DialogTitle>
            <DialogDescription className="text-[13px]">
              {x.o.tipo} · {cNombre(dia, c)} · {x.est ? "~" : ""}
              {x.hora}
              {x.o.dia != null && x.o.totalDias != null && ` · día ${x.o.dia} de ${x.o.totalDias}`}
            </DialogDescription>
            <div className="grid gap-1.5 text-[13px] text-muted-foreground">
              {x.o.detalleTecnico && <div><b className="font-medium text-foreground">Qué hay que hacer:</b> {x.o.detalleTecnico}</div>}
              {x.o.observaciones && <div><b className="font-medium text-foreground">Observaciones:</b> {x.o.observaciones}</div>}
              <div><b className="font-medium text-foreground">Contacto:</b> {x.o.contactoObra ?? "—"}{x.o.telObra ? ` · ${x.o.telObra}` : ""} · <b className="font-medium text-foreground">Planos y fotos:</b> {x.o.cantArchivos}</div>
              <p>Las obras de la hoja no se cargan acá: se leen del tablero, en su orden.</p>
            </div>
            <DialogFooter className="flex-row justify-end gap-2">
              <Link href={`/planificacion?fecha=${dia.fecha}`} className={buttonVariants({ variant: "outline" })}>Ver en el tablero</Link>
              <Button autoFocus className={PRI} onClick={onCerrar}>Entendido</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
