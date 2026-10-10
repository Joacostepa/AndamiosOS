"use client";

// El panel Gente (genteHTML): sin asignar, no disponibles, choferes, vehículos y los ya
// asignados plegados. Se arrastra un nombre a una tarjeta (sobre un nombre, lo reemplaza;
// un chofer entra como chofer), o se elige y se aprieta 1–5. G enfoca el buscador.

import { useState } from "react";
import { hojaDe, nombreDe, normalizar, panelGente, persona, laC } from "@/lib/hoja-dia/estado";
import { noDisponibles, numeroDe, textoChofer, textoVehiculo } from "@/lib/hoja-dia/vista-cuadrillas";
import { cn } from "@/lib/utils";
import { diaCorto } from "@/components/hoja-dia/comunes/encabezado-hoja";
import { TIPO_ARRASTRE, type Control } from "./control";

function Grupo({ titulo, n, children }: { titulo: string; n: number; children: React.ReactNode }) {
  return (
    <div className="pt-2">
      <h3 className="mx-1 mb-0.5 flex justify-between text-[11px] font-semibold tracking-[.07em] text-muted-foreground uppercase">
        <span>{titulo}</span>
        <span>{n}</span>
      </h3>
      {children}
    </div>
  );
}
const Pista = ({ children }: { children: React.ReactNode }) => <p className="mx-1 mb-1 text-xs text-muted-foreground">{children}</p>;

export function PanelGente({ ctl }: { ctl: Control }) {
  const { dia, pasado } = ctl;
  const [buscar, setBuscar] = useState("");
  const [asigAbierto, setAsigAbierto] = useState(false);
  const q = normalizar(buscar.trim());
  const pasa = (pid: string) => !q || normalizar(nombreDe(dia, pid)).includes(q);
  const pg = panelGente(dia);
  const sa = pg.sinAsignar.filter(pasa);
  const nd = noDisponibles(dia).filter((x) => pasa(x.pid));
  const ch = pg.choferes.filter((x) => pasa(x.pid));
  const asig = pg.asignados.filter((x) => !persona(dia, x.pid)?.esChofer && pasa(x.pid));

  const fila = ({ pid, s, tono, chico, esChofer }: { pid: string; s: React.ReactNode; tono?: string; chico?: boolean; esChofer?: boolean }) => {
    const elegido = ctl.sel === pid;
    return (
      <button
        key={pid}
        type="button"
        id={`pp-${pid}`}
        draggable={!pasado}
        aria-pressed={elegido}
        disabled={pasado}
        onClick={() => ctl.setSel(elegido ? null : pid)}
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData(TIPO_ARRASTRE, pid);
          ctl.setArrastre({ pid, from: hojaDe(dia, pid), esChofer: !!esChofer });
        }}
        onDragEnd={() => ctl.setArrastre(null)}
        className={cn(
          "flex cursor-grab items-baseline gap-2 rounded-[7px] border border-transparent px-1.5 py-1 text-left text-[13px] outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-default max-md:min-h-11 max-md:items-center max-md:text-[15px]",
          chico ? "w-auto gap-1 px-1.5 py-0.5 text-[12.5px] text-muted-foreground" : "w-full",
          elegido && "border-primary bg-accent",
        )}
      >
        <span className="font-medium whitespace-nowrap">{nombreDe(dia, pid)}</span>
        <span className={cn("text-xs text-muted-foreground", !chico && "ml-auto text-right", tono)}>{s}</span>
      </button>
    );
  };

  return (
    <aside
      id="gente"
      aria-label="Gente"
      className="flex min-w-0 flex-col rounded-xl border bg-hd-card2 @min-[1000px]:sticky @min-[1000px]:top-0 @min-[1000px]:max-h-[calc(100dvh-8rem)]"
    >
      <div className="grid gap-1.5 border-b px-2.5 pt-2.5 pb-2">
        <h2 className="flex items-baseline justify-between text-[15px] font-semibold">
          Gente <small className="text-xs font-normal text-muted-foreground">{diaCorto(dia.fecha)} · tecla G</small>
        </h2>
        <input
          id="g-buscar"
          value={buscar}
          onChange={(e) => setBuscar(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape" && buscar) {
              e.stopPropagation();
              setBuscar("");
            }
          }}
          placeholder="Buscar…"
          aria-label="Buscar persona"
          className="h-[30px] w-full rounded-[7px] border border-input bg-card px-2.5 text-[13px] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 max-md:h-10 max-md:text-[15px]"
        />
      </div>
      <div className="overflow-auto px-2 pt-0.5 pb-2.5">
        <Grupo titulo="Sin asignar" n={sa.length}>
          {sa.length ? (
            <>
              <Pista>Arrastrá un nombre a una cuadrilla, o elegilo y apretá 1–5.</Pista>
              {sa.map((pid) => (
                fila({ pid, s: persona(dia, pid)?.puedeEstarACargo ? "puede estar a cargo" : "" })
              ))}
            </>
          ) : (
            <Pista>Todos tienen cuadrilla.</Pista>
          )}
        </Grupo>
        <Grupo titulo="No disponibles" n={nd.length}>
          {nd.length ? (
            nd.map((x) => (
              <div key={x.pid} className="flex items-baseline gap-2 px-1.5 py-1 text-[13px]">
                <span className="font-medium whitespace-nowrap">{x.nombre}</span>
                <span className="ml-auto text-right text-xs text-hd-rojo">{x.txt}</span>
              </div>
            ))
          ) : (
            <Pista>Nadie.</Pista>
          )}
        </Grupo>
        <Grupo titulo="Choferes" n={pg.choferes.length}>
          <Pista>Arrastralo a una tarjeta (o elegilo y apretá 1–5) para que la lleve.</Pista>
          {ch.map((x) => {
            const t = textoChofer(dia, x.pid);
            return fila({ pid: x.pid, esChofer: true, s: t.t, tono: t.tono === "rojo" ? "text-hd-rojo" : t.tono === "amb" ? "text-hd-ambar" : undefined });
          })}
        </Grupo>
        <Grupo titulo="Vehículos" n={dia.vehiculos.length}>
          {dia.vehiculos.map((V) => {
            const t = textoVehiculo(dia, V.id);
            return (
              <div key={V.id} className="flex items-baseline gap-2 px-1.5 py-[3px] text-[13px]">
                <span className="font-mono text-xs tracking-tight whitespace-nowrap">{t.nombre}</span>
                <span className={cn("ml-auto text-right text-xs text-muted-foreground", t.tono === "amb" && "text-hd-ambar")}>{t.t}</span>
              </div>
            );
          })}
        </Grupo>
        <div className="pt-2">
          <button
            type="button"
            aria-expanded={asigAbierto || !!q}
            onClick={() => setAsigAbierto((v) => !v)}
            className="mx-1 flex w-[calc(100%-0.5rem)] items-baseline justify-between text-[11px] font-semibold tracking-[.07em] text-muted-foreground uppercase outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <span>Ya asignados · {asig.length}</span>
            <span className="font-medium tracking-normal normal-case underline underline-offset-[3px]">{asigAbierto || q ? "plegar" : "ver"}</span>
          </button>
          {(asigAbierto || !!q) && (
            <div className="flex flex-wrap gap-x-1 gap-y-[3px] px-0.5 pt-1">
              {asig.map((x) => (
                fila({ pid: x.pid, chico: true, s: `· ${numeroDe(dia, x.c) ?? laC(dia, x.c)}` })
              ))}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
