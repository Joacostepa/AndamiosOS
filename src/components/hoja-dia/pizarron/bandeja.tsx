"use client";

// La bandeja de abajo del Pizarrón (maqueta: .tray): Sin asignar, Contratistas, Camiones
// libres y No vienen. Soltar en "No vienen" pregunta el motivo (hd_ausencias, sólo ese día);
// sacar de ahí es "Ya tiene el alta".

import { Plus } from "lucide-react";
import type { Destino } from "@/lib/hoja-dia/gestos-pizarron";
import { cn } from "@/lib/utils";
import { usePizarron, useZona } from "./contexto";
import { FichaCamionUI, FichaContratistaBandeja, FichaPersonaUI } from "./fichas";

function Caja({ titulo, n, destino, id, children, className, extra }: {
  titulo: string;
  n: number;
  destino: Destino | null;
  id: string;
  children: React.ReactNode;
  className?: string;
  extra?: React.ReactNode;
}) {
  const ctx = usePizarron();
  const { setNodeRef, isOver } = useZona(id, destino ?? { k: "sin" }, !destino || ctx.soloLectura);
  const recibe = !!destino && !!ctx.sel && ctx.sel.origen.k !== "contratista" && (destino.k === "libres" ? ctx.sel.origen.k === "camion" : ctx.sel.origen.k !== "camion");
  return (
    <section
      ref={setNodeRef}
      data-caja={destino?.k ?? "contratistas"}
      aria-label={titulo}
      onClick={(e) => {
        if (!destino || !ctx.sel) return;
        e.stopPropagation();
        ctx.tocar(destino);
      }}
      className={cn(
        "flex min-w-0 flex-col gap-1.5 rounded-lg border bg-card px-3 pt-2.5 pb-3 transition-shadow",
        recibe && "cursor-copy ring-2 ring-primary/60",
        isOver && "ring-[2.5px] ring-primary",
        ctx.resaltar && "opacity-40",
        className,
      )}
    >
      <h3 className="flex items-center gap-2 text-xs font-bold tracking-[.08em] text-muted-foreground uppercase">
        {titulo} <span className="font-mono tracking-normal text-muted-foreground/80">{n}</span>
      </h3>
      {children}
      {extra}
    </section>
  );
}

const Vacio = ({ children }: { children: React.ReactNode }) => (
  <div className="w-full rounded-md border-[1.5px] border-dashed px-2 py-2 text-center text-xs text-muted-foreground">{children}</div>
);

export function Bandeja({ onNuevoContratista }: { onNuevoContratista: () => void }) {
  const ctx = usePizarron();
  const v = ctx.vista;
  return (
    <div className="grid gap-2.5 @min-[1250px]:grid-cols-[1fr_.85fr_1.6fr_.9fr] @min-[700px]:grid-cols-2">
      <Caja titulo="Sin asignar" n={v.sinAsignar.length} destino={{ k: "sin" }} id="caja:sin">
        <div className="flex flex-wrap content-start gap-1.5 pt-1">
          {v.sinAsignar.map((f) => <FichaPersonaUI key={f.pid} f={f} donde="sin" />)}
          {!v.sinAsignar.length && <Vacio>Nadie suelto</Vacio>}
        </div>
      </Caja>
      <Caja
        titulo="Contratistas"
        n={v.contratistas.length}
        destino={null}
        id="caja:contratistas"
        extra={!ctx.soloLectura && (
          <div>
            <button type="button" onClick={onNuevoContratista} className="inline-flex h-[30px] items-center gap-1 rounded-md border border-foreground/30 bg-card px-2.5 text-[12.5px] font-semibold hover:bg-muted">
              <Plus className="size-3.5" /> Contratista
            </button>
          </div>
        )}
      >
        <div className="flex flex-wrap content-start gap-1.5 pt-1">
          {v.contratistas.map((k) => <FichaContratistaBandeja key={k.kid} kid={k.kid} nombre={k.nombre} puestos={k.puestos} />)}
          {!v.contratistas.length && <Vacio>Todavía no hay contratistas dados de alta</Vacio>}
        </div>
      </Caja>
      <Caja titulo="Camiones libres" n={v.camionesLibres.length} destino={{ k: "libres" }} id="caja:libres">
        <div className="flex flex-wrap content-start gap-1.5 pt-1">
          {v.camionesLibres.map((k) => <FichaCamionUI key={k.k} f={k} />)}
          {!v.camionesLibres.length && <Vacio>Todos los camiones están con una cuadrilla</Vacio>}
        </div>
      </Caja>
      <Caja titulo="No vienen" n={v.noVienen.length} destino={{ k: "no" }} id="caja:no">
        <div className="flex flex-wrap content-start gap-1.5 pt-1">
          {v.noVienen.map((x) => (
            <FichaPersonaUI
              key={x.pid}
              f={{ pid: x.pid, nombre: x.nombre, completo: x.completo, aCargo: false, maneja: x.maneja, chofer: false, ausente: true }}
              donde="no"
              motivo={x.motivo}
              ausenciaId={x.ausenciaId}
            />
          ))}
          {!v.noVienen.length && <Vacio>Vienen todos</Vacio>}
        </div>
      </Caja>
    </div>
  );
}
