"use client";

// El menú de un contratista (decisiones del dueño del 10/10, noche: de su gente sólo se sabe
// la cantidad, y van dentro de las cuadrillas del tablero). En una columna del Pizarrón:
// Poner a cargo (su referente recibe la hoja), Ver como…, Nota, Editar y Quitar; sin
// cuadrilla: "Agregar a la Cuadrilla N…" con la cantidad.
//
// Los textos y las cuentas salen de src/lib/hoja-dia/contratistas.ts y estado.ts.

import { useState } from "react";
import { Minus, Plus } from "lucide-react";
import { aCargoDe, cNombre, contratista, contratistasDe, hojaDeCuadrilla, recibeDe } from "@/lib/hoja-dia/estado";
import { destinosContratista } from "@/lib/hoja-dia/contratistas";
import { useAccionHoja } from "@/hooks/use-hoja-dia";
import { Button } from "@/components/ui/button";
import { ItemMenu, MenuFlotante, MenuSep, MenuTexto } from "@/components/hoja-dia/comunes/menu-flotante";
import type { CtlMenus } from "./control";

/** El menú de un contratista: en una tarjeta (Poner a cargo, Nota, Quitar) o en el panel ("Agregar a…"). */
export function MenuContratista({
  ctl, c, kid, anchor, onCerrar,
}: { ctl: CtlMenus; c: number | null; kid: string; anchor: HTMLElement | null; onCerrar: () => void }) {
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
