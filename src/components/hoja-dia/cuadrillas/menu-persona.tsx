"use client";

// El menú de un nombre de la tarjeta (menuHTML de la maqueta): Poner a cargo, Ver como…,
// Pasar a…, No viene… (motivo y hasta cuándo), Nota y Sacar.

import { useState } from "react";
import {
  aCargoDe, addDia, cNombre, cuadrillasActivas, hojaDeCuadrilla, nombreDe, persona, prevista, recibeDe, vanDe,
} from "@/lib/hoja-dia/estado";
import { encabezadoPersona, opcionesHasta } from "@/lib/hoja-dia/vista-cuadrillas";
import { TIPOS_AUSENCIA, type TipoAusencia } from "@/lib/hoja-dia/tipos";
import { useAccionAusencia, useAccionHoja } from "@/hooks/use-hoja-dia";
import { Button } from "@/components/ui/button";
import { ChipOpcion, ItemMenu, MenuFlotante } from "@/components/hoja-dia/comunes/menu-flotante";
import type { Control } from "./control";
import { PRI } from "@/components/hoja-dia/comunes/boton-coral";

type Paso = null | "pasar" | "noviene" | "nota";

export function MenuPersona({ ctl, c, pid, anchor, onCerrar }: { ctl: Control; c: number; pid: string; anchor: HTMLElement | null; onCerrar: () => void }) {
  const { dia, ahora } = ctl;
  const fecha = dia.fecha;
  const hoja = useAccionHoja(fecha);
  const aus = useAccionAusencia(fecha);
  const [paso, setPaso] = useState<Paso>(null);
  const [motivo, setMotivo] = useState<TipoAusencia | null>(null);
  const [conFecha, setConFecha] = useState(false);
  const [hastaElegida, setHastaElegida] = useState(addDia(fecha, 2));
  const h = hojaDeCuadrilla(dia, c);
  const integrante = h?.integrantes.find((i) => i.personaId === pid) ?? null;
  const [nota, setNota] = useState(integrante?.nota ?? "");
  if (!h) return null;
  const N = nombreDe(dia, pid);
  const esCargo = aCargoDe(h) === pid;
  const pr = persona(dia, pid);

  const hecho = () => onCerrar();
  const noViene = (hasta: string) => {
    if (!motivo) return;
    aus.mutate({ accion: "crear", personaId: pid, desde: fecha, hasta: hasta < fecha ? fecha : hasta, tipo: motivo, fechaVista: fecha });
    hecho();
  };

  return (
    <MenuFlotante
      abierto
      anchor={anchor}
      onCerrar={onCerrar}
      label={`Opciones de ${N}`}
      ancho={paso === "noviene" ? 300 : 260}
      encabezado={
        <>
          <b className="font-semibold">{N}</b>
          {esCargo && " · a cargo"}
          <div className="text-xs text-muted-foreground">{encabezadoPersona(dia, c, pid)}</div>
        </>
      }
    >
      {paso === null && (
        <>
          {esCargo ? (
            <ItemMenu onClick={() => { hoja.mutate({ accion: "a_cargo", fecha, cuadrilla: c, personaId: null }); hecho(); }}>Ya no está a cargo</ItemMenu>
          ) : (
            <ItemMenu detalle={pr?.puedeEstarACargo ? undefined : "no suele estar a cargo"} onClick={() => { hoja.mutate({ accion: "a_cargo", fecha, cuadrilla: c, personaId: pid }); hecho(); }}>
              Poner a cargo
            </ItemMenu>
          )}
          {(esCargo || recibeDe(dia, c) === pid) && (
            <ItemMenu onClick={() => { onCerrar(); ctl.verComo(c, pid); }}>Ver como {N}</ItemMenu>
          )}
          <ItemMenu detalle="›" onClick={() => setPaso("pasar")}>Pasar a…</ItemMenu>
          <ItemMenu detalle="›" onClick={() => setPaso("noviene")}>No viene…</ItemMenu>
          <ItemMenu detalle={integrante?.nota ? "editar" : "«va directo a…»"} onClick={() => setPaso("nota")}>Nota</ItemMenu>
          <ItemMenu rojo onClick={() => { hoja.mutate({ accion: "sacar", fecha, personaId: pid }); hecho(); }}>Sacar</ItemMenu>
        </>
      )}

      {paso === "pasar" && (
        <>
          <div className="px-1.5 pt-1 text-xs text-muted-foreground">Pasar a {N} a…</div>
          {cuadrillasActivas(dia).filter((x) => x !== c).map((x) => (
            <ItemMenu key={x} detalle={`${vanDe(dia, x)} de ${prevista(dia, x)}`} onClick={() => { hoja.mutate({ accion: "agregar", fecha, cuadrilla: x, personaId: pid }); hecho(); }}>
              {cNombre(dia, x)}
            </ItemMenu>
          ))}
        </>
      )}

      {paso === "noviene" && (
        <>
          <div className="px-1.5 pt-1 text-xs text-muted-foreground">¿Por qué no viene {N}?</div>
          <div role="group" aria-label="Motivo" className="flex flex-wrap gap-1 p-1">
            {TIPOS_AUSENCIA.map(([k, l]) => (
              <ChipOpcion key={k} role="menuitemradio" aria-checked={motivo === k} activo={motivo === k} onClick={() => setMotivo(k)}>
                {l}
              </ChipOpcion>
            ))}
          </div>
          {motivo && (
            <>
              <div className="px-1.5 pt-1 text-xs text-muted-foreground">¿Hasta cuándo?</div>
              <div className="flex flex-wrap items-center gap-1.5 p-1">
                {opcionesHasta(fecha, ahora).map((o, i) => (
                  <Button key={o.l} data-mi="" size="sm" variant={i === 0 ? "default" : "outline"} className={i === 0 ? `${PRI} max-md:h-11 max-md:flex-auto` : "max-md:h-11 max-md:flex-auto"} onClick={() => noViene(o.hasta)}>
                    {o.l}
                  </Button>
                ))}
                <Button data-mi="" size="sm" variant="outline" className="max-md:h-11 max-md:flex-auto" onClick={() => setConFecha(true)}>
                  Elegir fecha…
                </Button>
              </div>
              {conFecha && (
                <div className="flex flex-wrap items-center gap-1.5 p-1">
                  <input
                    type="date"
                    aria-label="Hasta (incluido)"
                    min={fecha}
                    value={hastaElegida}
                    onChange={(e) => setHastaElegida(e.target.value)}
                    className="h-8 min-w-0 flex-1 rounded-md border border-input bg-card px-2 text-[13px] max-md:h-11"
                    autoFocus
                  />
                  <Button size="sm" variant="outline" className="max-md:h-11" onClick={() => noViene(hastaElegida)}>Guardar</Button>
                </div>
              )}
            </>
          )}
        </>
      )}

      {paso === "nota" && (
        <form
          className="grid gap-1.5 p-1"
          onSubmit={(e) => {
            e.preventDefault();
            hoja.mutate({ accion: "nota_persona", fecha, personaId: pid, nota: nota.trim() || null });
            hecho();
          }}
        >
          <label htmlFor="nota-persona" className="px-0.5 text-xs text-muted-foreground">Nota para {N} (se ve en el celular)</label>
          <div className="flex gap-1.5">
            <input
              id="nota-persona"
              autoFocus
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder={`va directo a la 2.ª obra, 13:00`}
              className="h-8 min-w-0 flex-1 rounded-md border border-input bg-card px-2 text-[13px] max-md:h-11 max-md:text-[15px]"
            />
            <Button type="submit" size="sm" variant="outline" className="max-md:h-11">Guardar</Button>
          </div>
        </form>
      )}
    </MenuFlotante>
  );
}
