"use client";

// La barra de arriba del Pizarrón (maqueta: drawTop): el día con ‹ › y los chips
// Hoy / Mañana / pasado, la etiqueta "Hoy · en curso" / "Mañana · se está armando", el
// contador de avisos (tocarlo resalta las columnas que tienen), Deshacer, "Copiar del día
// anterior" y "Mandar a los capataces y choferes".

import { Check, ChevronLeft, ChevronRight, Copy, Send, Undo2 } from "lucide-react";
import { cap, diaSemana } from "@/lib/hoja-dia/estado";
import { diaHabil } from "@/lib/hoja-dia/dias";
import type { Fecha } from "@/lib/hoja-dia/tipos";
import { cn } from "@/lib/utils";
import { PestanasPlanificacion } from "@/components/hoja-dia/comunes/pestanas-planificacion";
import { diaCorto } from "@/components/hoja-dia/comunes/encabezado-hoja";

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

export type EstadoMandar = { texto: string; hecho: boolean };

export function BarraDia(p: {
  fecha: Fecha;
  hoy: Fecha;
  manana: Fecha;
  montado: boolean;
  irA: (f: Fecha) => void;
  avisos: number;
  vacio: boolean;
  onResaltar: () => void;
  puedeDeshacer: boolean;
  onDeshacer: () => void;
  copiarDe: Fecha | null;
  onCopiar: () => void;
  copiando: boolean;
  mandar: EstadoMandar;
  onMandar: () => void;
  soloLectura: boolean;
}) {
  const { fecha, hoy, manana } = p;
  const pasado = diaHabil(manana, 1);
  const esHoy = fecha === hoy;
  const etiqueta = esHoy
    ? { t: "Hoy · en curso", c: "bg-hd-verde/15 text-hd-verde", vivo: true }
    : fecha === manana
      ? { t: "Mañana · se está armando", c: "bg-primary/12 text-primary" }
      : fecha < hoy
        ? { t: "Ya pasó · sólo lectura", c: "border bg-muted text-muted-foreground" }
        : { t: fecha === pasado ? "Pasado mañana" : "Más adelante", c: "border bg-muted text-muted-foreground" };
  const chips: { f: Fecha; r: string }[] = [{ f: hoy, r: "Hoy" }, { f: manana, r: "Mañana" }, { f: pasado, r: "" }];
  const fuera = !chips.some((x) => x.f === fecha);
  const btn = "inline-flex min-h-[38px] items-center gap-1.5 rounded-md border border-foreground/30 bg-card px-3 text-[13.5px] font-semibold transition-colors hover:bg-muted disabled:cursor-default disabled:opacity-45";
  return (
    <header className={cn("flex flex-wrap items-center gap-x-3.5 gap-y-2.5 rounded-lg border bg-card px-3 py-2.5 sm:px-4", esHoy && "shadow-[inset_0_3px_0_var(--hd-verde)]")}>
      <PestanasPlanificacion className="max-sm:order-first max-sm:w-full max-sm:justify-start" />
      <div className="min-w-0">
        <div className="text-[22px] leading-none font-bold tracking-tight sm:text-2xl">
          {p.montado ? `${cap(diaSemana(fecha))} ${Number(fecha.slice(8))}` : " "}
          {p.montado && (
            <span className={cn("ml-2 inline-flex items-center gap-1.5 rounded px-1.5 py-1 align-[4px] text-[10.5px] leading-none font-bold tracking-[.07em] whitespace-nowrap uppercase", etiqueta.c)}>
              {etiqueta.vivo && <i className="size-[7px] rounded-full bg-hd-verde motion-safe:animate-pulse" />}
              {etiqueta.t}
            </span>
          )}
        </div>
        <small className="mt-1 block text-xs text-muted-foreground">Pizarrón · {Number(fecha.slice(8))} de {MESES[Number(fecha.slice(5, 7)) - 1]}</small>
      </div>
      {p.montado && (
        <nav aria-label="Cambiar de día" className="flex flex-wrap items-center gap-1">
          <button type="button" onClick={() => p.irA(diaHabil(fecha, -1))} aria-label="Día anterior" className="grid size-8 place-items-center rounded-full border border-foreground/30 bg-card">
            <ChevronLeft className="size-4" />
          </button>
          {chips.map((x) => (
            <button
              key={x.f}
              type="button"
              onClick={() => p.irA(x.f)}
              aria-current={x.f === fecha ? "date" : undefined}
              className={cn("min-h-8 rounded-full border border-foreground/30 bg-card px-2.5 text-[13px] font-bold whitespace-nowrap hover:bg-muted aria-[current=date]:border-foreground aria-[current=date]:bg-foreground aria-[current=date]:text-background")}
            >
              {x.r && <span className="font-medium opacity-75">{x.r} · </span>}
              {diaCorto(x.f)}
            </button>
          ))}
          {fuera && <span aria-current="date" className="inline-flex min-h-8 items-center rounded-full bg-foreground px-2.5 text-[13px] font-bold text-background">{diaCorto(fecha)}</span>}
          <button type="button" onClick={() => p.irA(diaHabil(fecha, 1))} aria-label="Día siguiente" className="grid size-8 place-items-center rounded-full border border-foreground/30 bg-card">
            <ChevronRight className="size-4" />
          </button>
        </nav>
      )}
      <div className="hidden flex-1 md:block" />
      <div className="flex flex-wrap items-center gap-2">
        {p.vacio ? (
          <span className="inline-flex min-h-[38px] items-center gap-2 rounded-full border-[1.5px] border-hd-ambar bg-hd-ambar-bg px-3.5 text-[13.5px] font-bold text-hd-ambar">Sin armar</span>
        ) : (
          <button
            type="button"
            data-avisos={p.avisos}
            onClick={p.onResaltar}
            aria-label={p.avisos ? `${p.avisos} ${p.avisos === 1 ? "cosa" : "cosas"} para resolver. Tocá para verlas` : "Todo en orden"}
            className={cn(
              "inline-flex min-h-[38px] items-center gap-2 rounded-full border-[1.5px] py-1.5 pr-3.5 pl-2.5 text-[13.5px] font-bold",
              p.avisos ? "border-hd-ambar bg-hd-ambar-bg text-hd-ambar" : "border-hd-verde bg-hd-verde/10 text-hd-verde",
            )}
          >
            {p.avisos ? (
              <>
                <span className="grid h-[22px] min-w-[22px] place-items-center rounded bg-hd-ambar px-1 text-[13px] text-background">{p.avisos}</span>
                {p.avisos === 1 ? "cosa para resolver" : "cosas para resolver"}
              </>
            ) : (
              <><Check className="size-4" /> Todo en orden</>
            )}
          </button>
        )}
        <button type="button" className={btn} disabled={!p.puedeDeshacer || p.soloLectura} onClick={p.onDeshacer} title="Deshacer (Ctrl+Z)" aria-label="Deshacer">
          <Undo2 className="size-4" />
        </button>
        {p.copiarDe && !p.soloLectura && (
          <button type="button" className={btn} onClick={p.onCopiar} disabled={p.copiando} title={`Copiar la gente, camiones y contratistas del ${diaCorto(p.copiarDe)} a las cuadrillas que todavía no tienen hoja`}>
            <Copy className="size-4" />
            <span className="hidden xl:inline">Copiar del día anterior</span>
          </button>
        )}
        {!p.soloLectura && (
          <button
            type="button"
            data-mandar=""
            onClick={p.onMandar}
            className={cn(btn, !p.mandar.hecho && "border-hd-boton bg-hd-boton text-white hover:bg-hd-boton-hover")}
          >
            {p.mandar.hecho ? <Check className="size-4" /> : <Send className="size-4" />}
            <span>{p.mandar.texto}</span>
          </button>
        )}
      </div>
    </header>
  );
}
