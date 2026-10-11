"use client";

// "+ Agregar" de la tarjeta: un combobox con autocompletar (sugHTML de la maqueta). Enter
// agrega el primero (o el marcado con ↑ ↓); Escape limpia. Si la persona está en otra
// cuadrilla, la vista pregunta "¿Lo pasás a la N?" antes de moverla. Un contratista suma 1
// de su gente ("+1 de Quintana").

import { useState } from "react";
import { cNombre } from "@/lib/hoja-dia/estado";
import { sugerenciasAgregar, type Sugerencia } from "@/lib/hoja-dia/vista-cuadrillas";
import { cn } from "@/lib/utils";
import type { Control } from "./control";

export function AgregarPersona({ ctl, c }: { ctl: Control; c: number }) {
  const [q, setQ] = useState("");
  const [activo, setActivo] = useState(0);
  const lista = sugerenciasAgregar(ctl.dia, c, q);
  const habilitadas = lista.filter((x) => !x.deshabilitada);
  const abierta = q.trim().length > 0;
  const idLista = `ag-lista-${c}`;
  const marcado = habilitadas[Math.min(activo, habilitadas.length - 1)] ?? null;

  const elegir = (x: Sugerencia) => {
    setQ("");
    setActivo(0);
    if (x.contratista) ctl.sumarContratista(c, x.pid, 1);
    else ctl.agregar(c, x.pid);
  };

  return (
    <span className="relative">
      <input
        id={`ag-${c}`}
        role="combobox"
        aria-expanded={abierta}
        aria-controls={idLista}
        aria-autocomplete="list"
        aria-activedescendant={abierta && marcado ? `ag-${c}-${marcado.pid}` : undefined}
        aria-label={`Agregar a la ${cNombre(ctl.dia, c)}`}
        placeholder="+ Agregar"
        autoComplete="off"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setActivo(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            if (!habilitadas.length) return;
            e.preventDefault();
            setActivo((a) => (a + (e.key === "ArrowDown" ? 1 : -1) + habilitadas.length) % habilitadas.length);
          } else if (e.key === "Enter") {
            e.preventDefault();
            if (marcado) elegir(marcado);
          } else if (e.key === "Escape" && q) {
            e.stopPropagation();
            setQ("");
          }
        }}
        onBlur={() => setTimeout(() => setQ((x) => (document.activeElement?.closest(`#${idLista}`) ? x : "")), 150)}
        className="h-6 w-[84px] rounded-md border border-dashed border-foreground/25 bg-transparent px-[7px] text-[12.5px] outline-none placeholder:text-muted-foreground focus:w-[140px] focus:border-solid focus-visible:ring-3 focus-visible:ring-ring/50 max-md:h-9 max-md:w-[110px] max-md:text-[15px] max-md:focus:w-[170px]"
      />
      {abierta && (
        <div
          id={idLista}
          role="listbox"
          aria-label="Personas"
          className="absolute top-[calc(100%+4px)] left-0 z-30 grid min-w-[220px] rounded-lg border border-foreground/20 bg-popover p-1 shadow-xl"
        >
          {lista.length === 0 ? (
            <div className="px-2 py-1.5 text-[13px] text-muted-foreground">Nadie con «{q.trim()}»</div>
          ) : (
            lista.map((x) => (
              <button
                key={x.pid}
                id={`ag-${c}-${x.pid}`}
                type="button"
                role="option"
                tabIndex={-1}
                aria-selected={marcado?.pid === x.pid}
                disabled={x.deshabilitada}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => elegir(x)}
                className={cn(
                  "flex justify-between gap-2.5 rounded-[5px] px-2 py-1.5 text-left text-[13px] hover:bg-muted disabled:cursor-default disabled:opacity-55 max-md:min-h-11 max-md:items-center max-md:text-[15px]",
                  marcado?.pid === x.pid && "bg-muted",
                )}
              >
                {x.nombre}
                <small className="text-muted-foreground">{x.s}</small>
              </button>
            ))
          )}
        </div>
      )}
    </span>
  );
}
