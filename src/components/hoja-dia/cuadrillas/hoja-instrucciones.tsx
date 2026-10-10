"use client";

// La hoja lateral "Instrucciones" de una cuadrilla (sheetInstr): la nota para toda la
// cuadrilla y, por obra, la hora de inicio, el "Hoy" y los motivos rápidos. Lo de la OT
// (qué hacer, observaciones, planos) viene de Comercial y se muestra sin editar.
// Se guarda solo al salir de cada campo (y al tocar un motivo).

import { useState } from "react";
import type { DiaHoja } from "@/lib/hoja-dia/tipos";
import { cNombre, fechaLarga, frJ, hojaDeCuadrilla, obrasCon } from "@/lib/hoja-dia/estado";
import { useAccionHoja } from "@/hooks/use-hoja-dia";
import { Button } from "@/components/ui/button";
import { CampoHora } from "@/components/hoja-dia/comunes/campo-hora";
import { ChipOpcion } from "@/components/hoja-dia/comunes/menu-flotante";
import { Caja, HojaLateral } from "@/components/hoja-dia/comunes/hoja-lateral";

const AREA = "min-h-[54px] w-full resize-y rounded-[7px] border border-input bg-hd-card2 px-2 py-1.5 text-[13px] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60 max-md:text-[15px]";

function Texto({ valor, onGuardar, placeholder, disabled, id }: { valor: string; onGuardar: (v: string | null) => void; placeholder: string; disabled?: boolean; id: string }) {
  const [t, setT] = useState<string | null>(null);
  return (
    <textarea
      id={id}
      className={AREA}
      value={t ?? valor}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(e) => setT(e.target.value)}
      onBlur={() => {
        if (t != null && t.trim() !== valor.trim()) onGuardar(t.trim() || null);
        setT(null);
      }}
    />
  );
}

export function HojaInstrucciones({ abierta, onCerrar, dia, c, pasado }: { abierta: boolean; onCerrar: () => void; dia: DiaHoja; c: number; pasado: boolean }) {
  const fecha = dia.fecha;
  const hoja = useAccionHoja(fecha);
  const h = hojaDeCuadrilla(dia, c);
  const ob = obrasCon(dia, c);
  if (!h) return null;
  return (
    <HojaLateral
      abierta={abierta}
      onCerrar={onCerrar}
      titulo={`Instrucciones · ${cNombre(dia, c)}`}
      sub={`${fechaLarga(fecha)}. Lo de la OT (qué hay que hacer, observaciones, planos) ya viene de Comercial: acá va lo de este día.`}
      pie={
        <>
          <span className="mr-auto flex-[1_1_200px] text-xs text-muted-foreground">Se guarda solo. Las instrucciones siguen a la obra si el tablero la pasa a otra cuadrilla. El material no va acá: va en los viajes.</span>
          <Button variant="outline" onClick={onCerrar}>Listo</Button>
        </>
      }
    >
      <Caja titulo={<label htmlFor="in-nota">Nota para toda la cuadrilla</label>}>
        <Texto id="in-nota" valor={h.nota ?? ""} disabled={pasado} placeholder="Los tablones para Cabildo van en el camión de las 7:00" onGuardar={(nota) => hoja.mutate({ accion: "nota", fecha, cuadrilla: c, nota })} />
        <p className="text-xs text-muted-foreground">Va arriba de todo en el celular del capataz.</p>
      </Caja>
      {ob.map((x) => {
        const ins = dia.instrucciones.find((i) => i.otId === x.o.otId);
        const chips = ins?.chips ?? [];
        const guardar = (cambio: { horaInicio?: string | null; hoy?: string | null; chips?: string[] }) =>
          hoja.mutate({ accion: "instrucciones", fecha, otId: x.o.otId, cuadrilla: c, horaInicio: ins?.horaInicio ?? null, hoy: ins?.hoy ?? null, chips, ...cambio });
        return (
          <Caja key={x.o.otId} titulo={<>{x.o.tipo} · {frJ(x.o.fraccion)} · {x.o.corto}</>}>
            {x.o.detalleTecnico && <div className="text-[13px] text-muted-foreground"><b className="font-medium text-foreground">Qué hay que hacer:</b> {x.o.detalleTecnico}</div>}
            {x.o.observaciones && <div className="text-[13px] text-muted-foreground"><b className="font-medium text-foreground">Observaciones de Comercial:</b> {x.o.observaciones}</div>}
            <div className="text-[13px] text-muted-foreground">
              <b className="font-medium text-foreground">Planos y fotos:</b> {x.o.cantArchivos} · <b className="font-medium text-foreground">Contacto:</b> {x.o.contactoObra ?? "—"}{x.o.telObra ? ` · ${x.o.telObra}` : ""}
            </div>
            <CampoHora
              label={`Hora de inicio (estimada ${x.est ? "~" : ""}${x.hora} si la dejás vacía)`}
              valor={ins?.horaInicio ?? null}
              disabled={pasado}
              className="flex-wrap"
              onCambiar={(horaInicio) => guardar({ horaInicio })}
            />
            <label className="grid gap-1">
              <span className="text-xs text-muted-foreground">Hoy (lo que toca este día)</span>
              <Texto id={`in-hoy-${x.o.otId}`} valor={ins?.hoy ?? ""} disabled={pasado} placeholder="Hoy: bajar hasta el 2.º piso; la pantalla de PB queda armada." onGuardar={(hoy) => guardar({ hoy })} />
            </label>
            <div className="grid gap-1">
              <span className="text-xs text-muted-foreground">Motivos rápidos</span>
              <div className="flex flex-wrap gap-1.5">
                {dia.parametros.chipsInstrucciones.map((ch) => {
                  const on = chips.includes(ch);
                  return (
                    <ChipOpcion key={ch} aria-pressed={on} activo={on} disabled={pasado} onClick={() => guardar({ chips: on ? chips.filter((z) => z !== ch) : [...chips, ch] })}>
                      {ch}
                    </ChipOpcion>
                  );
                })}
              </div>
            </div>
          </Caja>
        );
      })}
    </HojaLateral>
  );
}
