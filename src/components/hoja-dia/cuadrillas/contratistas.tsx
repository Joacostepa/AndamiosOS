"use client";

// Los contratistas en la vista Cuadrillas (decisiones del dueño del 10/10, noche): de su
// gente sólo se sabe la cantidad, y van dentro de las cuadrillas del tablero.
//
// - En la tarjeta, un chip "+3 de Quintana" con − / + (cada toque es un gesto con Deshacer);
//   tocando el nombre, su menú: Poner a cargo (su referente recibe la hoja), Nota, Quitar.
// - En el panel Gente, el grupo "Contratistas": arrastrar uno a una tarjeta suma 1; tocarlo
//   abre "Agregar a la Cuadrilla N…" con la cantidad.
//
// Los textos y las cuentas salen de src/lib/hoja-dia/contratistas.ts y estado.ts.

import { useState } from "react";
import { Minus, Plus } from "lucide-react";
import { aCargoDe, cNombre, contratista, contratistasDe, hojaDeCuadrilla, recibeDe } from "@/lib/hoja-dia/estado";
import { chipsContratistas, destinosContratista, panelContratistas } from "@/lib/hoja-dia/contratistas";
import { useAccionHoja } from "@/hooks/use-hoja-dia";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ItemMenu, MenuFlotante, MenuSep, MenuTexto } from "@/components/hoja-dia/comunes/menu-flotante";
import { TIPO_ARRASTRE, type Control } from "./control";

// ═══════════════════════════ La tarjeta ═══════════════════════════════════════

/** Los chips "+3 de Quintana" de una tarjeta, con su − / +. */
export function ChipsContratistas({ ctl, c }: { ctl: Control; c: number }) {
  const { dia, pasado } = ctl;
  return (
    <>
      {chipsContratistas(dia, c).map((x) => (
        <span
          key={x.contratistaId}
          className={cn(
            "inline-flex min-h-6 items-stretch overflow-hidden rounded-md border border-dashed border-foreground/30 bg-card text-[13px] font-medium max-md:min-h-9 max-md:text-[15px]",
            x.aCargo && "border-solid border-foreground/20 bg-accent",
            x.cantidad === 0 && "border-hd-ambar/70 bg-hd-ambar-bg",
          )}
        >
          <button
            type="button"
            id={`kc-${c}-${x.contratistaId}`}
            disabled={pasado}
            aria-haspopup={pasado ? undefined : "menu"}
            title={pasado ? undefined : `Opciones de ${x.nombre}`}
            onClick={(e) => ctl.abrirMenuContratista(c, x.contratistaId, e.currentTarget)}
            className="inline-flex items-baseline gap-[5px] px-[7px] py-0.5 outline-none hover:bg-muted focus-visible:bg-muted disabled:hover:bg-transparent max-md:items-center max-md:px-2.5"
          >
            <span className="tabular-nums">{x.texto}</span>
            {x.tag && <span className={cn("text-[11.5px] font-medium text-muted-foreground", x.aCargo && "text-foreground", x.cantidad === 0 && "text-hd-ambar")}>{x.tag}</span>}
          </button>
          {!pasado && (
            <>
              <button
                type="button"
                aria-label={x.cantidad > 0 ? `Uno menos de ${x.nombre} (van ${x.cantidad})` : `${x.nombre}: ya está en 0`}
                disabled={x.cantidad === 0}
                onClick={() => ctl.sumarContratista(c, x.contratistaId, -1)}
                className="grid w-6 place-items-center border-l border-dashed border-foreground/20 text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:bg-muted disabled:opacity-40 max-md:w-9"
              >
                <Minus className="size-3 max-md:size-4" />
              </button>
              <button
                type="button"
                aria-label={`Uno más de ${x.nombre} (van ${x.cantidad})`}
                disabled={x.cantidad >= 60}
                onClick={() => ctl.sumarContratista(c, x.contratistaId, 1)}
                className="grid w-6 place-items-center border-l border-dashed border-foreground/20 text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:bg-muted disabled:opacity-40 max-md:w-9"
              >
                <Plus className="size-3 max-md:size-4" />
              </button>
            </>
          )}
        </span>
      ))}
    </>
  );
}

/** Las notas de los contratistas de la tarjeta ("Quintana: traen su arnés"). */
export function NotasContratistas({ ctl, c }: { ctl: Control; c: number }) {
  const xs = chipsContratistas(ctl.dia, c).filter((x) => x.nota);
  if (!xs.length) return null;
  return (
    <>
      {xs.map((x) => (
        <div key={x.contratistaId}>
          <b className="font-medium text-foreground">{x.nombre}</b> {x.nota}
        </div>
      ))}
    </>
  );
}

// ═══════════════════════════ Los menús ════════════════════════════════════════

/** El menú de un contratista: en una tarjeta (Poner a cargo, Nota, Quitar) o en el panel ("Agregar a…"). */
export function MenuContratista({
  ctl, c, kid, anchor, onCerrar,
}: { ctl: Control; c: number | null; kid: string; anchor: HTMLElement | null; onCerrar: () => void }) {
  const { dia } = ctl;
  const fecha = dia.fecha;
  const hoja = useAccionHoja(fecha);
  const k = contratista(dia, kid);
  const h = c != null ? hojaDeCuadrilla(dia, c) : null;
  const enHoja = contratistasDe(h).find((x) => x.contratistaId === kid) ?? null;
  const [paso, setPaso] = useState<null | "nota">(null);
  const [nota, setNota] = useState(enHoja?.nota ?? "");
  const [cuantos, setCuantos] = useState(1);
  if (!k) return null;
  const listo = () => onCerrar();
  const sub = [k.referente ? `referente ${k.referente}` : "sin referente", k.celular ?? "sin celular", k.telegram ? "Telegram" : null].filter(Boolean).join(" · ");

  // En el panel: "Agregar a la Cuadrilla N…" con la cantidad.
  if (c == null || !enHoja) {
    const destinos = destinosContratista(dia, kid);
    return (
      <MenuFlotante
        abierto
        anchor={anchor}
        onCerrar={onCerrar}
        label={`Agregar gente de ${k.nombre}`}
        ancho={280}
        encabezado={
          <>
            <b className="font-semibold">{k.nombre}</b> · contratista
            <div className="text-xs text-muted-foreground">{sub}</div>
          </>
        }
      >
        <div className="flex items-center gap-2 px-1.5 py-1 text-[13px]">
          <span className="text-muted-foreground">¿Cuántos?</span>
          <Button data-mi="" variant="outline" size="icon-xs" aria-label="Uno menos" disabled={cuantos <= 1} onClick={() => setCuantos((n) => Math.max(1, n - 1))} className="max-md:size-10">
            <Minus />
          </Button>
          <input
            aria-label={`Cuántos de ${k.nombre}`}
            inputMode="numeric"
            value={cuantos}
            onChange={(e) => setCuantos(Math.max(1, Math.min(60, Number(e.target.value.replace(/\D/g, "")) || 1)))}
            className="h-6 w-10 rounded-md border border-input bg-card text-center text-[13px] tabular-nums max-md:h-10 max-md:w-14 max-md:text-[15px]"
          />
          <Button data-mi="" variant="outline" size="icon-xs" aria-label="Uno más" disabled={cuantos >= 60} onClick={() => setCuantos((n) => Math.min(60, n + 1))} className="max-md:size-10">
            <Plus />
          </Button>
        </div>
        {destinos.length ? (
          destinos.map((x) => (
            <ItemMenu key={x.c} detalle={x.detalle} onClick={() => { ctl.sumarContratista(x.c, kid, cuantos); listo(); }}>
              Agregar a la {cNombre(dia, x.c)}
            </ItemMenu>
          ))
        ) : (
          <MenuTexto>Todavía no hay hojas ese día.</MenuTexto>
        )}
        {ctl.editor && (
          <>
            <MenuSep />
            <ItemMenu onClick={() => { onCerrar(); ctl.abrirContratistas(kid); }}>Editar contratista</ItemMenu>
          </>
        )}
      </MenuFlotante>
    );
  }

  const esCargo = aCargoDe(h) === kid;
  const N = k.nombre;
  return (
    <MenuFlotante
      abierto
      anchor={anchor}
      onCerrar={onCerrar}
      label={`Opciones de ${N}`}
      encabezado={
        <>
          <b className="font-semibold">{enHoja.cantidad > 0 ? `${enHoja.cantidad} de ${N}` : N}</b>
          {esCargo && " · a cargo"}
          <div className="text-xs text-muted-foreground">{cNombre(dia, c)} · {sub}</div>
        </>
      }
    >
      {paso === null && (
        <>
          {esCargo ? (
            <ItemMenu onClick={() => { hoja.mutate({ accion: "a_cargo", fecha, cuadrilla: c, personaId: null }); listo(); }}>Ya no está a cargo</ItemMenu>
          ) : (
            <ItemMenu detalle={k.referente ? `la recibe ${k.referente.split(" ")[0]}` : "la recibe su referente"} onClick={() => { hoja.mutate({ accion: "a_cargo", fecha, cuadrilla: c, personaId: kid }); listo(); }}>
              Poner a cargo
            </ItemMenu>
          )}
          {recibeDe(dia, c) === kid && <ItemMenu onClick={() => { onCerrar(); ctl.verComo(c, kid); }}>Ver como {N}</ItemMenu>}
          <ItemMenu detalle={enHoja.nota ? "editar" : "«traen su arnés»"} onClick={() => setPaso("nota")}>Nota</ItemMenu>
          {ctl.editor && <ItemMenu onClick={() => { onCerrar(); ctl.abrirContratistas(kid); }}>Editar contratista</ItemMenu>}
          <ItemMenu rojo onClick={() => { hoja.mutate({ accion: "contratista_quitar", fecha, cuadrilla: c, contratistaId: kid }); listo(); }}>
            Quitar de la {cNombre(dia, c)}
          </ItemMenu>
        </>
      )}
      {paso === "nota" && (
        <form
          className="grid gap-1.5 p-1"
          onSubmit={(e) => {
            e.preventDefault();
            hoja.mutate({ accion: "contratista_nota", fecha, cuadrilla: c, contratistaId: kid, nota: nota.trim() || null });
            listo();
          }}
        >
          <label htmlFor="nota-contratista" className="px-0.5 text-xs text-muted-foreground">Nota para la gente de {N} (se ve en el celular)</label>
          <div className="flex gap-1.5">
            <input
              id="nota-contratista"
              autoFocus
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder="traen su arnés"
              className="h-8 min-w-0 flex-1 rounded-md border border-input bg-card px-2 text-[13px] max-md:h-11 max-md:text-[15px]"
            />
            <Button type="submit" size="sm" variant="outline" className="max-md:h-11">Guardar</Button>
          </div>
        </form>
      )}
    </MenuFlotante>
  );
}

// ═══════════════════════════ El panel Gente ═══════════════════════════════════

/** El grupo "Contratistas" del panel Gente. */
export function GrupoContratistas({ ctl, filtro }: { ctl: Control; filtro: (nombre: string) => boolean }) {
  const { dia, pasado } = ctl;
  const todas = panelContratistas(dia);
  const lineas = todas.filter((x) => filtro(x.nombre));
  if (!todas.length && !ctl.editor) return null;
  return (
    <div className="pt-2">
      <h3 className="mx-1 mb-0.5 flex justify-between text-[11px] font-semibold tracking-[.07em] text-muted-foreground uppercase">
        <span>Contratistas</span>
        <span>{todas.length}</span>
      </h3>
      <p className="mx-1 mb-1 flex flex-wrap gap-x-3 text-xs">
        <button type="button" onClick={ctl.abrirResumenContratistas} className="text-muted-foreground underline underline-offset-[3px] outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50">
          Resumen del mes
        </button>
        {ctl.editor && (
          <button type="button" onClick={() => ctl.abrirContratistas()} className="text-muted-foreground underline underline-offset-[3px] outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50">
            Administrar
          </button>
        )}
      </p>
      {!todas.length ? (
        <p className="mx-1 mb-1 text-xs text-muted-foreground">Ninguno cargado. Con «Administrar» se da de alta uno (no va a Legajos ni a Odoo).</p>
      ) : (
        <>
          {!pasado && <p className="mx-1 mb-1 text-xs text-muted-foreground">Arrastralo a una cuadrilla (suma 1) o tocalo para elegir cuántos.</p>}
          {lineas.map((x) => (
            <button
              key={x.id}
              type="button"
              id={`pk-${x.id}`}
              draggable={!pasado}
              disabled={pasado}
              aria-haspopup="menu"
              onClick={(e) => ctl.abrirMenuContratista(null, x.id, e.currentTarget)}
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = "copy";
                e.dataTransfer.setData(TIPO_ARRASTRE, x.id);
                ctl.setArrastre({ pid: x.id, from: null, esChofer: false, contratista: true });
              }}
              onDragEnd={() => ctl.setArrastre(null)}
              className="flex w-full cursor-grab items-baseline gap-2 rounded-[7px] border border-transparent px-1.5 py-1 text-left text-[13px] outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-default max-md:min-h-11 max-md:items-center max-md:text-[15px]"
            >
              <span className="font-medium whitespace-nowrap">{x.nombre}</span>
              <span className={cn("ml-auto text-right text-xs text-muted-foreground", x.enUso && "text-foreground")}>{x.t}</span>
            </button>
          ))}
        </>
      )}
    </div>
  );
}
