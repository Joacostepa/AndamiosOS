"use client";

// Una columna del Pizarrón (maqueta: drawBoard): el número grande del color de la cuadrilla,
// "4 de 5", la obra (o la secuencia de obras con hora y cómo llegan) de solo lectura con qué
// se ejecuta e instrucciones, los avisos como insignias con su botón, la gente, los
// contratistas y la franja de camiones. Una cuadrilla sin obra queda grisada y no recibe.
// El ⋯ abre lo de la cuadrilla (Copiar como hoy, Ver como, Cerrar jornada, Instrucciones,
// Historial); abajo de las obras, el encuentro y, a la tarde de hoy, cerrar la jornada.

import { useState } from "react";
import { ArrowDown, Lock, MoreHorizontal, StickyNote, TriangleAlert } from "lucide-react";
import { esHoy, hojaDeCuadrilla, nombreDe, obrasDe } from "@/lib/hoja-dia/estado";
import { encuentroTxt } from "@/lib/hoja-dia/vista-cuadrillas";
import type { Columna, ObraColumna } from "@/lib/hoja-dia/pizarron";
import { colorCuadrilla } from "@/lib/tablero/colores";
import { cn } from "@/lib/utils";
import { MenuFlotante, MenuTexto } from "@/components/hoja-dia/comunes/menu-flotante";
import { JornadaCerrada } from "@/components/hoja-dia/cuadrillas/cerrar-jornada";
import { mismoDestino, usePizarron, useZona } from "./contexto";
import { FichaCamionUI, FichaContratistaColumna, FichaPersonaUI } from "./fichas";

function Obra({ o, multi, color }: { o: ObraColumna; multi: boolean; color: string }) {
  const [nota, setNota] = useState<HTMLElement | null>(null);
  return (
    <div className={cn(multi && "grid grid-cols-[38px_minmax(0,1fr)] gap-x-1.5")}>
      {multi && <span className="pt-px font-mono text-xs leading-snug font-bold" style={{ color }}>{o.horaEstimada ? "~" : ""}{o.hora}</span>}
      <div className="min-w-0">
        <div className="flex items-center gap-1 text-[13.5px] leading-tight font-semibold [overflow-wrap:anywhere]" title={`${o.direccion} · viene del tablero, no se cambia acá`}>
          {!multi && <Lock className="size-[11px] shrink-0 text-muted-foreground" aria-hidden />}
          {o.corto}
        </div>
        <div className="mt-0.5 text-xs leading-snug text-muted-foreground">
          <b className="font-bold text-foreground">{o.tipo}</b>
          {o.detalle && <> · {o.detalle}</>}
          {o.jornada && <> <span className="rounded-[3px] border bg-muted px-1 font-semibold whitespace-nowrap text-foreground">{o.jornada}</span></>}
          {o.hasta && <> · hasta ~{o.hasta}</>}
          {o.notas.length > 0 && (
            <button
              type="button"
              data-no-drag=""
              onClick={(e) => {
                e.stopPropagation();
                setNota(nota ? null : e.currentTarget);
              }}
              aria-label={`Ver instrucciones de ${o.corto}`}
              title="Instrucciones"
              className="ml-1 inline-grid h-5 w-[22px] place-items-center rounded border border-primary bg-primary/10 align-[-3px] text-primary"
            >
              <StickyNote className="size-3" />
            </button>
          )}
        </div>
      </div>
      {nota && (
        <MenuFlotante anchor={nota} onCerrar={() => setNota(null)} label="Instrucciones" encabezado={<b className="font-semibold">Instrucciones · {o.corto}</b>} ancho={290}>
          {o.notas.map((t, i) => <MenuTexto key={i}><span className="text-[13px] text-foreground">{t}</span></MenuTexto>)}
        </MenuFlotante>
      )}
    </div>
  );
}

export function ColumnaUI({ col }: { col: Columna }) {
  const ctx = usePizarron();
  const color = colorCuadrilla(col.color).borde;
  const { setNodeRef: refCol, isOver: sobreCol } = useZona(`col:${col.c}`, { k: "columna", c: col.c }, ctx.soloLectura);
  const { setNodeRef: refGente } = useZona(`gente:${col.c}`, { k: "gente", c: col.c }, ctx.soloLectura);
  const { setNodeRef: refCam } = useZona(`camiones:${col.c}`, { k: "camiones", c: col.c }, ctx.soloLectura);
  const a = ctx.arrastre?.origen;
  const multi = col.obras.length > 1;
  // El hueco donde va a caer (la ficha "se corre" en la lista): gente sobre la lista o la columna.
  const sobreAca = ctx.sobre && "c" in ctx.sobre && ctx.sobre.c === col.c;
  const huecoGente = col.acepta && a && a.k !== "camion" && a.k !== "contratista" && sobreAca && (ctx.sobre!.k === "gente" ? !ctx.sobre!.sobre : ctx.sobre!.k === "columna")
    && !(a.k === "persona" && col.gente.some((g) => g.pid === a.pid));
  const huecoCamion = col.acepta && a?.k === "camion" && sobreAca && ctx.sobre!.k !== "camion" && a.c !== col.c;
  const destacada = ctx.sel && col.acepta;
  const tocar = (e: React.MouseEvent, d: Parameters<typeof ctx.tocar>[0]) => {
    if (!ctx.sel) return;
    e.stopPropagation();
    ctx.tocar(d);
  };
  const corto = col.conObra && col.van < col.prevista;
  const h = hojaDeCuadrilla(ctx.dia, col.c);
  // B1: las obras que ya tienen parte NO ofrecen "Cerrar jornada": muestran el parte.
  const obras = obrasDe(ctx.dia, col.c);
  const conParte = obras.filter((o) => o.parteId != null);
  const sinParte = obras.filter((o) => o.parteId == null);
  const ofrecerCierre = esHoy(ctx.ahora) && ctx.ahora >= 16 * 60 && !ctx.vista.pasado && !col.suspendida && sinParte.length > 0 && !!h;
  const notas = [
    ...(h?.integrantes.filter((i) => i.nota).map((i) => ({ k: i.id, quien: nombreDe(ctx.dia, i.personaId), t: i.nota! })) ?? []),
    ...(h?.contratistas.filter((x) => x.nota).map((x) => ({ k: x.id, quien: nombreDe(ctx.dia, x.contratistaId), t: x.nota! })) ?? []),
  ];
  return (
    <article
      ref={refCol}
      data-col={col.c}
      aria-label={`${col.nombre}${col.conObra ? "" : ", sin obra en el tablero"}`}
      onClick={(e) => tocar(e, { k: "columna", c: col.c })}
      className={cn(
        "@container/col relative flex min-w-0 flex-col rounded-lg border bg-card shadow-xs transition-[opacity,box-shadow]",
        !col.conObra && "opacity-60",
        destacada && "cursor-copy ring-2 ring-primary/60",
        (sobreCol || (huecoGente || huecoCamion)) && col.acepta && "ring-[2.5px] ring-primary",
        a && !col.acepta && sobreCol && "ring-2 ring-hd-rojo/60",
        ctx.resaltar && col.avisos.length === 0 && "opacity-40",
        ctx.foco === col.c && "ring-[3px]",
      )}
      style={ctx.foco === col.c ? ({ ["--tw-ring-color" as string]: color } as React.CSSProperties) : undefined}
    >
      <span aria-hidden className="absolute -inset-x-px -top-px h-[5px] rounded-t-lg" style={{ background: col.conObra ? color : "var(--muted-foreground)" }} />
      <header className="flex flex-col gap-2 border-b border-dashed px-2.5 pt-3.5 pb-2">
        <div className="flex items-end gap-2">
          <span aria-hidden className="min-w-[22px] text-[34px] leading-[.85] font-extrabold tracking-tight" style={{ color: col.conObra ? color : undefined }}>{col.rotulo}</span>
          <div className="min-w-0 flex-1 pb-0.5">
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] leading-none font-bold tracking-[.09em] text-muted-foreground uppercase">
              {/* En una columna angosta no entra con el "4 de 5" y el ⋯: el número grande ya lo dice. */}
              <span className="@max-[214px]/col:sr-only">Cuadrilla</span>
              {multi && <span className="rounded-full px-1.5 py-0.5 text-[10.5px] font-bold tracking-normal normal-case text-white" style={{ background: color }}>{col.obras.length} obras</span>}
            </div>
          </div>
          {col.conObra && (
            <span className={cn("inline-flex items-center gap-1 pt-0.5 text-xs font-semibold whitespace-nowrap text-muted-foreground", corto && "text-hd-ambar")} aria-label={`Van ${col.van} de ${col.prevista}`}>
              {corto && <TriangleAlert className="size-3.5" />}
              <b className={cn("font-mono text-[15px] font-bold text-foreground", corto && "text-hd-ambar")}>{col.van}</b> de {col.prevista}
            </span>
          )}
          {(col.conObra || h) && (
            <button
              type="button"
              data-no-drag=""
              aria-label={`Más opciones de la ${col.nombre}`}
              aria-haspopup="menu"
              onClick={(e) => {
                e.stopPropagation();
                ctx.menuColumna(col.c, e.currentTarget);
              }}
              className="-mr-1 grid size-7 shrink-0 place-items-center self-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <MoreHorizontal className="size-4" />
            </button>
          )}
        </div>
        {!col.conObra ? (
          <p className="text-[13px] font-semibold text-muted-foreground">Sin obra en el tablero</p>
        ) : col.suspendida ? (
          <p className="text-[13px] font-semibold text-hd-ambar">Suspendida · {col.suspendida}</p>
        ) : null}
        {col.obras.length > 0 && (
          <div className="flex flex-col gap-1.5">
            {col.obras.map((o, i) => (
              <div key={o.otId} className={cn(!multi && i > 0 && "border-t border-dotted border-foreground/30 pt-1.5")}>
                {multi && i > 0 && (
                  <div className="flex items-center gap-1 py-1 pl-2.5 text-[11.5px] leading-tight font-semibold text-muted-foreground">
                    <ArrowDown className="size-3.5" style={{ color }} /> {o.llega}
                  </div>
                )}
                <Obra o={o} multi={multi} color={color} />
              </div>
            ))}
          </div>
        )}
        {col.conObra && h && (
          <div className="flex flex-wrap items-baseline gap-x-1.5 text-xs text-muted-foreground">
            Encuentro
            <button
              type="button"
              data-no-drag=""
              disabled={ctx.soloLectura}
              onClick={(e) => {
                e.stopPropagation();
                ctx.menuEncuentro(col.c, e.currentTarget);
              }}
              className="text-left font-semibold text-foreground underline decoration-foreground/25 underline-offset-[3px] hover:decoration-current disabled:no-underline"
            >
              {encuentroTxt(ctx.dia, col.c)}
            </button>
          </div>
        )}
        {(conParte.length > 0 || ofrecerCierre) && (
          <div className="grid gap-1.5 text-xs" data-no-drag="" onClick={(e) => e.stopPropagation()}>
            {conParte.map((o) => (
              <JornadaCerrada key={o.otId} o={o} fecha={ctx.dia.fecha} conObra={obras.length > 1} onVer={() => ctx.cerrarJornada(col.c, o.otId)} />
            ))}
            {ofrecerCierre && (
              <button
                type="button"
                onClick={() => ctx.cerrarJornada(col.c)}
                className="rounded-md border-[1.5px] border-foreground/30 bg-card px-2 py-1.5 text-[12.5px] font-bold hover:bg-muted"
              >
                Cerrar jornada{conParte.length > 0 ? ` · ${sinParte.map((o) => o.corto).join(", ")}` : ""}
              </button>
            )}
          </div>
        )}
        {col.avisos.map((x) => (
          <div
            key={x.k}
            data-aviso={x.k}
            title={x.largo}
            className={cn(
              "flex flex-wrap items-center gap-x-1.5 gap-y-1 rounded-md border border-hd-ambar/60 bg-hd-ambar-bg py-1 pr-1.5 pl-2 text-[12.5px] leading-tight font-bold text-hd-ambar",
              x.rojo && "border-hd-rojo/60 bg-hd-rojo-bg text-hd-rojo",
              ctx.resaltar && "motion-safe:animate-pulse",
            )}
          >
            <TriangleAlert className="size-3.5 shrink-0" />
            <span className="min-w-[60px] flex-1">{x.texto}</span>
            {x.boton && !ctx.soloLectura && (
              <button
                type="button"
                data-no-drag=""
                onClick={(e) => {
                  e.stopPropagation();
                  ctx.boton(x.boton!, e.currentTarget);
                }}
                className={cn("rounded bg-hd-ambar px-2 py-1 text-xs font-bold whitespace-nowrap text-background", x.rojo && "bg-hd-rojo")}
              >
                {x.boton.l}
              </button>
            )}
          </div>
        ))}
      </header>

      <div
        ref={refGente}
        data-zona="gente"
        onClick={(e) => tocar(e, { k: "gente", c: col.c })}
        className="flex min-h-11 flex-1 flex-col gap-1.5 p-2"
      >
        {col.gente.map((g) => <FichaPersonaUI key={g.pid} f={g} c={col.c} donde="col" />)}
        {notas.length > 0 && (
          <div className="grid gap-px px-0.5 text-[11.5px] leading-snug text-muted-foreground">
            {notas.map((n) => <div key={n.k}><b className="font-semibold text-foreground">{n.quien}</b> {n.t}</div>)}
          </div>
        )}
        {huecoGente && <div aria-hidden className="h-9 shrink-0 rounded-md border-2 border-dashed border-primary bg-primary/10 opacity-80" />}
        {!col.gente.length && !huecoGente && (
          <div className="rounded-md border-[1.5px] border-dashed px-2 py-2 text-center text-xs text-muted-foreground">
            {col.acepta ? "Soltá gente acá" : col.conObra ? "No recibe gente" : "Sin obra: no recibe gente"}
          </div>
        )}
      </div>
      {col.contratistas.length > 0 && (
        <div className="flex flex-col gap-1.5 px-2 pb-2">
          {col.contratistas.map((k) => <FichaContratistaColumna key={k.kid} f={k} c={col.c} />)}
        </div>
      )}
      <div
        ref={refCam}
        data-zona="camiones"
        onClick={(e) => tocar(e, { k: "camiones", c: col.c })}
        className={cn("flex min-h-[62px] flex-col gap-1.5 rounded-b-lg border-t bg-muted/60 p-2", mismoDestino(ctx.sobre, { k: "camiones", c: col.c }) && a?.k === "camion" && col.acepta && "bg-primary/10")}
      >
        {col.camiones.map((k) => <FichaCamionUI key={k.k} f={k} />)}
        {huecoCamion && <div aria-hidden className="h-14 shrink-0 rounded-md border-2 border-dashed border-primary bg-primary/10 opacity-80" />}
        {!col.camiones.length && !huecoCamion && (
          <div className="rounded-md border-[1.5px] border-dashed px-2 py-2 text-center text-xs text-muted-foreground">Sin camión · van por su cuenta</div>
        )}
      </div>
    </article>
  );
}
