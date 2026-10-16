"use client";

import { useMemo } from "react";
import { formatDistanceToNowStrict, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { filtrar, telefonoLegible, type CharlaListada, type Filtro } from "@/lib/clientes/vista";
import { PastillaEstado, PastillaGamaAlta, PastillaVentana } from "./pastillas";

// La lista de charlas (docs/sofia/crm-propuesta.md §7): filtros «Para vos», «Todas» y
// «Cerradas». Todos ven todas: es una familia, no hay paredes, sólo filtros. Cada fila: quién,
// la pastilla del estado, la última línea, hace cuánto y lo que le queda a la ventana de 24 h.
// Las de gama alta (multidireccional, Layher, instituciones…) llevan su pastilla y, si esperan a una persona, van
// arriba (filtrar en vista.ts).

const FILTROS: { id: Filtro; texto: string }[] = [
  { id: "vos", texto: "Para vos" },
  { id: "todas", texto: "Todas" },
  { id: "cerradas", texto: "Cerradas" },
];

function iniciales(t: string) {
  const p = t.replace(/[^\p{L}\s]/gu, " ").trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase() || "#";
}

function hace(fecha: string | null): string {
  if (!fecha) return "";
  const d = formatDistanceToNowStrict(parseISO(fecha), { locale: es });
  return d.startsWith("0 ") || /segundo/.test(d) ? "recién" : `hace ${d}`;
}

export function ListaCharlas({
  charlas,
  yo,
  filtro,
  onFiltro,
  actual,
  onElegir,
  ahora,
}: {
  charlas: CharlaListada[];
  yo: string;
  filtro: Filtro;
  onFiltro: (f: Filtro) => void;
  actual: string | null;
  onElegir: (id: string) => void;
  ahora: number;
}) {
  const cuentas = useMemo(() => Object.fromEntries(FILTROS.map((f) => [f.id, filtrar(charlas, f.id, yo).length])) as Record<Filtro, number>, [charlas, yo]);
  const filas = useMemo(() => filtrar(charlas, filtro, yo), [charlas, filtro, yo]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-border p-2">
        <div role="group" aria-label="Filtro de charlas" className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
          {FILTROS.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={filtro === f.id}
              onClick={() => onFiltro(f.id)}
              className={cn(
                "flex h-9 items-center justify-center gap-1.5 rounded-md text-[14px] font-medium text-muted-foreground transition-colors",
                filtro === f.id && "bg-background text-foreground shadow-sm",
              )}
            >
              {f.texto}
              <span className="text-[12px] tabular-nums opacity-70">{cuentas[f.id]}</span>
            </button>
          ))}
        </div>
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto">
        {filas.length === 0 && (
          <li className="px-4 py-10 text-center text-[14px] text-muted-foreground">
            {filtro === "vos" ? "Nada para vos por ahora." : filtro === "cerradas" ? "No hay charlas cerradas." : "Todavía no escribió nadie."}
          </li>
        )}
        {filas.map((c) => {
          const nombre = c.nombre || telefonoLegible(c.telefono);
          return (
            <li key={c.id} className="border-b border-border">
              <button
                type="button"
                onClick={() => onElegir(c.id)}
                aria-current={actual === c.id ? "true" : undefined}
                className={cn(
                  "flex min-h-[4.5rem] w-full items-start gap-3 px-3 py-2.5 text-left hover:bg-muted/60",
                  actual === c.id && "bg-hd-boton/10 shadow-[inset_3px_0_0_var(--hd-boton)]",
                )}
              >
                <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-[14px] font-semibold text-muted-foreground" aria-hidden>
                  {c.nombre ? iniciales(c.nombre) : "#"}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="flex items-baseline gap-2">
                    <b className={cn("min-w-0 flex-1 truncate text-[15px]", c.sinLeer > 0 ? "font-semibold" : "font-medium")}>{nombre}</b>
                    <span className={cn("shrink-0 text-[12px] tabular-nums", c.sinLeer > 0 ? "font-semibold text-hd-verde" : "text-muted-foreground")}>{hace(c.ultimoMensajeAt)}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className={cn("min-w-0 flex-1 truncate text-[13.5px]", c.sinLeer > 0 ? "text-foreground" : "text-muted-foreground")}>{c.ultimoResumen ?? "—"}</span>
                    {c.sinLeer > 0 && (
                      <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-hd-verde px-1.5 text-[11px] font-bold text-white" aria-label={`${c.sinLeer} sin leer`}>
                        {c.sinLeer}
                      </span>
                    )}
                  </span>
                  <span className="flex flex-wrap items-center gap-1.5">
                    <PastillaGamaAlta segmento={c.segmento} />
                    <PastillaEstado charla={c} yo={yo} />
                    {c.estado !== "cerrada" && <PastillaVentana ultimoEntranteAt={c.ultimoEntranteAt} ahora={ahora} corta />}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
