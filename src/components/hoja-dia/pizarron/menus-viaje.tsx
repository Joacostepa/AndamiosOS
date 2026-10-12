"use client";

// Los menús de un viaje que el Pizarrón necesita para no mandar a Camiones (F4): "¿Quién lo
// hace?" (el chofer de un viaje), "Pasar a otro camión" (un lleva/busca sin camión: "Nadie
// busca a la 3") y "No se hizo" (el seguimiento: más tarde, a la cola o anular). Mismas
// acciones y mismos textos que los de Camiones (camiones/menus.tsx, dialogos.tsx).

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { DiaHoja } from "@/lib/hoja-dia/tipos";
import {
  ausenciaDe, cap, choferDe, choferesParaVehiculo, choferSugerido, cortoV, dondeAnda, elVeh, elViajeTxt, filasCamiones, hm5, nombreDe, vehiculo, vehTxt,
  viajeCalc, viajesChofer,
} from "@/lib/hoja-dia/estado";
import type { AccionViaje } from "@/lib/hoja-dia/acciones";
import { ItemMenu, MenuCabeza, MenuFlotante, MenuTexto } from "@/components/hoja-dia/comunes/menu-flotante";
import { InputHora, horaDe } from "@/components/hoja-dia/comunes/campo-hora";
import { PRI } from "@/components/hoja-dia/comunes/boton-coral";
import { VehiculoNombre } from "@/components/hoja-dia/comunes/vehiculo-nombre";

type Props = { dia: DiaHoja; ahora: number; id: string; anchor: HTMLElement; onCerrar: () => void; viaje: (a: AccionViaje) => void };

/** "¿Quién lo hace?": el chofer de UN viaje (el habitual primero, marcado; nunca se pone solo). */
export function MenuChoferViaje({ dia, id, anchor, onCerrar, viaje }: Props) {
  const v = dia.viajes.find((x) => x.id === id);
  if (!v) return null;
  const ch = choferDe(dia, v);
  const hacer = (a: AccionViaje) => () => { onCerrar(); viaje(a); };
  return (
    <MenuFlotante anchor={anchor} onCerrar={onCerrar} label="Elegir chofer" ancho={320}>
      <MenuCabeza titulo="¿Quién lo hace?" sub={`${cortoV(dia, v)}${v.vehiculoId ? ` · ${vehTxt(dia, v.vehiculoId)}` : ""}`} />
      {v.choferId && !v.hojaId && v.vehiculoId && (
        <ItemMenu detalle={nombreDe(dia, choferDe(dia, { ...v, choferId: null })) || "sin chofer"} onClick={hacer({ accion: "chofer", viajeId: id, choferId: null })}>
          El que maneje {elVeh(dia, v.vehiculoId)}
        </ItemMenu>
      )}
      {choferesParaVehiculo(dia, v.vehiculoId).map(({ id: x, habitual }) => {
        const a = ausenciaDe(dia, x);
        const n = viajesChofer(dia, x).length;
        const det = a ? "no viene" : x === ch ? "lo hace ahora" : n ? `${n} ${n === 1 ? "viaje" : "viajes"}` : "libre";
        return (
          <ItemMenu key={x} disabled={x === ch || !!a} detalle={habitual ? `habitual · ${det}` : det} onClick={hacer({ accion: "chofer", viajeId: id, choferId: x })}>
            {nombreDe(dia, x)}
          </ItemMenu>
        );
      })}
    </MenuFlotante>
  );
}

/** "Pasar a otro camión": los camiones que salen ese día, con quién lo haría a esa hora. */
export function MenuPasarViaje({ dia, ahora, id, anchor, onCerrar, viaje }: Props) {
  const v = dia.viajes.find((x) => x.id === id);
  if (!v) return null;
  const t = viajeCalc(dia, id)?.t ?? 9 * 60;
  const otros = filasCamiones(dia).filter((veh) => veh !== v.vehiculoId && vehiculo(dia, veh)?.tipo !== "otro");
  return (
    <MenuFlotante anchor={anchor} onCerrar={onCerrar} label="Elegir camión" ancho={320}>
      <MenuCabeza titulo="¿Quién lo hace?" sub={cortoV(dia, v)} />
      {otros.map((veh) => (
        <ItemMenu key={veh} detalle={dondeAnda(dia, veh, ahora).t.slice(0, 34)} onClick={() => { onCerrar(); viaje({ accion: "mover", viajeId: id, vehiculoId: veh }); }}>
          {nombreDe(dia, choferSugerido(dia, veh, t)) || "Sin chofer"} · <VehiculoNombre v={vehiculo(dia, veh)} />
        </ItemMenu>
      ))}
    </MenuFlotante>
  );
}

const MOTIVOS_ANULAR = ["Ya no hace falta", "Lo resolvió el cliente", "Se suspendió la obra", "Otro"];

/** "No se hizo" (el coordinador llamó y no se hizo): más tarde, a la cola o ya no hace falta. */
export function MenuNoSeHizo({ dia, ahora, id, anchor, onCerrar, viaje }: Props) {
  const [paso, setPaso] = useState<"hora" | "anular" | null>(null);
  const [hora, setHora] = useState(hm5(Math.max(ahora + 60, 8 * 60)));
  const [mal, setMal] = useState(false);
  const v = dia.viajes.find((x) => x.id === id);
  const vc = viajeCalc(dia, id);
  if (!v) return null;
  const hacer = (a: AccionViaje) => () => { onCerrar(); viaje(a); };
  if (paso === "hora") {
    const ok = () => {
      const h = horaDe(hora);
      if (!h) return setMal(true);
      onCerrar();
      viaje({ accion: "hora", viajeId: id, hora: h });
    };
    return (
      <MenuFlotante anchor={anchor} onCerrar={onCerrar} label="Hacerlo más tarde" ancho={300}>
        <MenuCabeza titulo="Hacerlo más tarde" sub={cortoV(dia, v)} />
        <div className="flex flex-wrap items-start gap-1.5 px-1 py-1">
          <InputHora value={hora} mal={mal} aria-label="Nueva hora" onChange={(x) => { setHora(x); setMal(false); }} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); ok(); } }} />
          <Button type="button" className={`h-9 ${PRI}`} onClick={ok}>Cambiar</Button>
        </div>
      </MenuFlotante>
    );
  }
  if (paso === "anular") {
    return (
      <MenuFlotante anchor={anchor} onCerrar={onCerrar} label="Anular el viaje" ancho={280}>
        <MenuCabeza titulo="Anular el viaje" sub="Queda en el historial con el motivo" />
        {MOTIVOS_ANULAR.map((m) => <ItemMenu key={m} onClick={hacer({ accion: "anular", viajeId: id, motivo: m })}>{m}</ItemMenu>)}
      </MenuFlotante>
    );
  }
  return (
    <MenuFlotante anchor={anchor} onCerrar={onCerrar} label="No se hizo" ancho={320}>
      <MenuCabeza titulo={`No se hizo · ${cortoV(dia, v)}`} />
      <MenuTexto>{vc ? `${cap(elViajeTxt(dia, vc))} no se hizo.` : "El viaje no se hizo."} ¿Qué hacemos?</MenuTexto>
      <ItemMenu detalle="›" onClick={() => setPaso("hora")}>Hacerlo más tarde (cambiar la hora)</ItemMenu>
      <ItemMenu onClick={hacer({ accion: "volver_a_cola", viajeId: id })}>{v.hojaId ? "Sacarlo del camión (elegir otro después)" : "Volver a la cola (ponerlo en otro camión)"}</ItemMenu>
      <ItemMenu rojo detalle="›" onClick={() => setPaso("anular")}>Ya no hace falta (anular)</ItemMenu>
    </MenuFlotante>
  );
}

