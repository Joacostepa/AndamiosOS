"use client";

import { useMemo } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import type { ObraMapa } from "@/lib/mapa-obras/tipos";
import {
  categoriaCalle, coincide, COLOR_CATEGORIA, desarmadasPorMes, lineaCalle, lineaHistorico,
  ordenarCalle, tieneUbicacion, type Decision, type Vista,
} from "@/lib/mapa-obras/categorias";
import { foco, rotulo, tag, tagAviso, vidrio } from "./estilos";

// La lista de la izquierda. En la calle: "Para decidir" arriba (si no se está buscando) y
// después "Todas en la calle". En el histórico: las desarmadas por mes de desarme.
// Son ~460 filas: no hace falta virtualizar.

export function ListaObras({
  vista,
  obras,
  decisiones,
  busqueda,
  onBusqueda,
  seleccionada,
  onElegir,
  className,
}: {
  vista: Vista;
  obras: ObraMapa[];
  decisiones: Decision[];
  busqueda: string;
  onBusqueda: (q: string) => void;
  seleccionada: number | null;
  onElegir: (o: ObraMapa) => void;
  className?: string;
}) {
  const q = busqueda.trim();
  const filtradas = useMemo(() => obras.filter((o) => coincide(o, q)), [obras, q]);
  const calle = useMemo(() => (vista === "calle" ? ordenarCalle(filtradas) : []), [vista, filtradas]);
  const porMes = useMemo(() => (vista === "historico" ? desarmadasPorMes(filtradas) : []), [vista, filtradas]);
  const totalDesarmadas = porMes.reduce((s, g) => s + g.obras.length, 0);

  return (
    <aside aria-label="Lista de obras" className={cn(vidrio, "flex min-h-0 flex-col overflow-hidden", className)}>
      <div className="relative px-2.5 pb-1.5 pt-2.5">
        <Search className="pointer-events-none absolute left-5 top-1/2 size-3.5 -translate-y-[35%] text-muted-foreground" aria-hidden />
        <Input
          type="search"
          value={busqueda}
          onChange={(e) => onBusqueda(e.target.value)}
          placeholder={vista === "calle" ? "Buscar calle o dirección…" : "Buscar una obra desarmada…"}
          aria-label="Buscar calle o dirección"
          autoComplete="off"
          className="h-9 border-white/12 bg-white/5 pl-8"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2.5">
        {vista === "calle" ? (
          <>
            {!q && decisiones.length > 0 && (
              <>
                <Grupo titulo="Para decidir" n={decisiones.length} />
                {decisiones.map((d) => (
                  <Fila
                    key={`d-${d.obra.ventaId}`}
                    obra={d.obra}
                    color={COLOR_CATEGORIA[categoriaCalle(d.obra)]}
                    seleccionada={seleccionada === d.obra.ventaId}
                    onElegir={onElegir}
                    destacada
                    accion={d.accion}
                  >
                    {d.motivo}
                  </Fila>
                ))}
              </>
            )}
            <Grupo titulo={q ? "Resultados" : "Todas en la calle"} n={calle.length} />
            {calle.map((o) => (
              <Fila
                key={o.ventaId}
                obra={o}
                color={COLOR_CATEGORIA[categoriaCalle(o)]}
                seleccionada={seleccionada === o.ventaId}
                onElegir={onElegir}
              >
                {lineaCalle(o)}
                {o.fotos.length > 0 && <span className={tag}>{o.fotos.length} fotos</span>}
                {!tieneUbicacion(o) ? (
                  <span className={tagAviso}>sin ubicación</span>
                ) : (
                  o.vencida && <span className={tagAviso}>fin vencido</span>
                )}
              </Fila>
            ))}
            {!calle.length && <Vacio>{q ? <>No hay obras en la calle con &quot;{q}&quot;.</> : "No hay obras en la calle."}</Vacio>}
          </>
        ) : (
          <>
            <Grupo titulo="Desarmadas" n={totalDesarmadas} />
            {porMes.map((g) => (
              <div key={g.mes}>
                <Grupo titulo={g.mes} />
                {g.obras.map((o) => {
                  const ubicada = tieneUbicacion(o);
                  return (
                    <Fila
                      key={o.ventaId}
                      obra={o}
                      color={ubicada ? COLOR_CATEGORIA.desarmada : "transparent"}
                      seleccionada={seleccionada === o.ventaId}
                      onElegir={onElegir}
                    >
                      {lineaHistorico(o)}
                      {!ubicada && <span className={tag}>sin ubicación</span>}
                    </Fila>
                  );
                })}
              </div>
            ))}
            {!totalDesarmadas && (
              <Vacio>{q ? <>No hay desarmadas con &quot;{q}&quot;.</> : "No hay obras desarmadas."}</Vacio>
            )}
          </>
        )}
      </div>
    </aside>
  );
}

function Grupo({ titulo, n }: { titulo: string; n?: number }) {
  return (
    <div className={cn(rotulo, "mx-1 mb-1.5 mt-2.5 flex items-baseline justify-between")}>
      <span>{titulo}</span>
      {n != null && <span className="font-mono text-[11px] font-medium normal-case tracking-normal text-muted-foreground/70">{n}</span>}
    </div>
  );
}

function Fila({
  obra,
  color,
  seleccionada,
  onElegir,
  destacada,
  accion,
  children,
}: {
  obra: ObraMapa;
  color: string;
  seleccionada: boolean;
  onElegir: (o: ObraMapa) => void;
  destacada?: boolean;
  accion?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={() => onElegir(obra)}
      aria-current={seleccionada || undefined}
      className={cn(
        "grid w-full grid-cols-[8px_minmax(0,1fr)] gap-x-2.5 gap-y-0.5 rounded-lg border border-transparent px-2.5 py-[7px] text-left transition-colors",
        "hover:border-white/10 hover:bg-white/5",
        seleccionada && "border-white/10 bg-white/[0.07]",
        destacada && "mb-[3px] bg-white/[0.035]",
        foco,
      )}
    >
      <span aria-hidden className="row-span-3 mt-1.5 size-2 rounded-full" style={{ background: color }} />
      <span className="truncate text-[14.5px] font-semibold leading-tight">{obra.direccionCorta}</span>
      <span className="text-[12.5px] leading-snug text-muted-foreground">{children}</span>
      {accion && (
        <span className="text-[11px] font-semibold uppercase leading-tight tracking-wider text-primary">
          {accion} →
        </span>
      )}
    </button>
  );
}

function Vacio({ children }: { children: React.ReactNode }) {
  return <p className="px-2.5 py-2 text-[12.5px] text-muted-foreground">{children}</p>;
}
