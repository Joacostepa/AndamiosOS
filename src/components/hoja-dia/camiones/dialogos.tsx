"use client";

// Los diálogos chicos de Camiones: cambiar la hora de un viaje, anularlo con motivo, la VTV
// o el taller de un camión, un flete de afuera, "X está todo el día con la Cuadrilla N" y
// "No se hizo" (el viaje que nadie marcó).

import { PRI } from "@/components/hoja-dia/comunes/boton-coral";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  aCargoDe, calcVeh, cap, choferDelCamion, filaTodoVeh, cNombre, cortoV, elViajeTxt, hm5, hojaDeCuadrilla, lugar, nombreDe, normHora, obrasCon, elVeh, vehiculo,
} from "@/lib/hoja-dia/estado";
import type { Punto, TipoViaje } from "@/lib/hoja-dia/tipos";
import { Chips } from "@/components/hoja-dia/comunes/menu-flotante";
import { InputHora, horaDe } from "@/components/hoja-dia/comunes/campo-hora";
import { useCamiones } from "./contexto";

export type Dlg =
  | { t: "hora"; id: string }
  | { t: "anular"; id: string }
  | { t: "noSeHizo"; id: string }
  | { t: "taller"; veh: string }
  | { t: "flete"; pedidoId?: string }
  | { t: "todo"; veh: string; c: number; pedidoId: string; orden: number | null };


export function Dialogos({ d, cerrar, volverA, alSacarUnRato, alElegirOtro }: {
  d: Dlg | null;
  cerrar: () => void;
  volverA: HTMLElement | null;
  alSacarUnRato: (d: Extract<Dlg, { t: "todo" }>) => void;
  alElegirOtro: () => void;
}) {
  return (
    <Dialog open={!!d} onOpenChange={(o) => !o && cerrar()}>
      <DialogContent
        className="sm:max-w-md"
        finalFocus={() => (volverA && volverA.isConnected ? volverA : true)}
      >
        {d?.t === "hora" && <DlgHora id={d.id} cerrar={cerrar} />}
        {d?.t === "anular" && <DlgAnular id={d.id} cerrar={cerrar} />}
        {d?.t === "noSeHizo" && <DlgNoSeHizo id={d.id} cerrar={cerrar} />}
        {d?.t === "taller" && <DlgTaller veh={d.veh} cerrar={cerrar} />}
        {d?.t === "flete" && <DlgFlete pedidoId={d.pedidoId} cerrar={cerrar} />}
        {d?.t === "todo" && <DlgTodo d={d} cerrar={cerrar} alSacarUnRato={alSacarUnRato} alElegirOtro={alElegirOtro} />}
      </DialogContent>
    </Dialog>
  );
}

function DlgHora({ id, cerrar }: { id: string; cerrar: () => void }) {
  const { dia, viaje } = useCamiones();
  const v = dia.viajes.find((x) => x.id === id);
  const vc = v?.vehiculoId ? calcVeh(dia, v.vehiculoId).find((x) => x.id === id) : null;
  const [val, setVal] = useState(v?.hora ? normHora(v.hora)! : vc ? hm5(vc.t) : normHora(v?.noAntesDe) ?? "");
  const [mal, setMal] = useState(false);
  if (!v) return null;
  const c = v.cuadrillaOdooId ?? dia.hojas.find((h) => h.id === v.hojaId)?.cuadrillaOdooId ?? null;
  const ok = () => {
    const h = horaDe(val);
    if (!h) return setMal(true);
    cerrar();
    viaje(v.hora ? { accion: "hora", viajeId: id, hora: h } : { accion: "hora", viajeId: id, hora: null, noAntesDe: h });
  };
  return (
    <>
      <DialogTitle>Cambiar hora · {cortoV(dia, v)}</DialogTitle>
      <DialogDescription>
        {v.hora ? "Hora fija: hay alguien esperando a esa hora." : "Estimada: «no antes de». Las siguientes se recalculan."}
        {v.hojaId && c != null ? ` Cambia también la hoja de la ${cNombre(dia, c)}.` : ""}
      </DialogDescription>
      <InputHora
        etiqueta={v.hora ? "Hora" : "No antes de"}
        value={val}
        mal={mal}
        autoFocus
        onFocus={(e) => e.currentTarget.select()}
        onChange={(x) => { setVal(x); setMal(false); }}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); ok(); } }}
      />
      <DialogFooter>
        <Button variant="outline" onClick={cerrar}>Cancelar</Button>
        <Button className={PRI} onClick={ok}>Guardar</Button>
      </DialogFooter>
    </>
  );
}

/**
 * "No se hizo" del aviso de seguimiento ("El viaje de las 8:00 a Ing. Huergo no está marcado
 * como hecho"): el coordinador llamó y no se hizo. Se hace más tarde (cambiar la hora),
 * vuelve a la cola para ponerlo en otro camión, o ya no hace falta (anular, con motivo).
 */
function DlgNoSeHizo({ id, cerrar }: { id: string; cerrar: () => void }) {
  const { dia, viaje } = useCamiones();
  const [paso, setPaso] = useState<"hora" | "anular" | null>(null);
  const v = dia.viajes.find((x) => x.id === id);
  const vc = v?.vehiculoId ? calcVeh(dia, v.vehiculoId).find((x) => x.id === id) : null;
  if (!v) return null;
  if (paso === "hora") return <DlgHora id={id} cerrar={cerrar} />;
  if (paso === "anular") return <DlgAnular id={id} cerrar={cerrar} />;
  return (
    <>
      <DialogTitle>No se hizo · {cortoV(dia, v)}</DialogTitle>
      <DialogDescription>{vc ? `${cap(elViajeTxt(dia, vc))} no se hizo.` : "El viaje no se hizo."} ¿Qué hacemos?</DialogDescription>
      <div className="grid gap-2">
        <Button variant="outline" className="justify-start" onClick={() => setPaso("hora")}>Hacerlo más tarde (cambiar la hora)</Button>
        <Button variant="outline" className="justify-start" onClick={() => { cerrar(); viaje({ accion: "volver_a_cola", viajeId: id }); }}>
          {v.hojaId ? "Sacarlo del camión (elegir otro después)" : "Volver a la cola (ponerlo en otro camión)"}
        </Button>
        <Button variant="outline" className="justify-start text-hd-rojo" onClick={() => setPaso("anular")}>Ya no hace falta (anular)</Button>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={cerrar}>Cancelar</Button>
      </DialogFooter>
    </>
  );
}

const MOTIVOS_ANULAR =["Ya no hace falta", "Lo resolvió el cliente", "Se suspendió la obra", "Otro"];

function DlgAnular({ id, cerrar }: { id: string; cerrar: () => void }) {
  const { viaje } = useCamiones();
  const [mot, setMot] = useState<string | null>(null);
  return (
    <>
      <DialogTitle>Anular el viaje</DialogTitle>
      <DialogDescription>Nada se borra: queda en el historial con el motivo.</DialogDescription>
      <Chips opciones={MOTIVOS_ANULAR} valor={mot} onChange={setMot} label="Motivo" />
      <DialogFooter>
        <Button variant="outline" onClick={cerrar}>Cancelar</Button>
        <Button className={PRI} disabled={!mot} onClick={() => { if (!mot) return; cerrar(); viaje({ accion: "anular", viajeId: id, motivo: mot }); }}>Anular</Button>
      </DialogFooter>
    </>
  );
}

const QUE_TALLER = ["VTV", "Service", "Trámite"];

function DlgTaller({ veh, cerrar }: { veh: string; cerrar: () => void }) {
  const { dia, fecha, viaje } = useCamiones();
  const [que, setQue] = useState("VTV");
  const [hora, setHora] = useState("14:00");
  const [mal, setMal] = useState(false);
  const dur = dia.parametros.duracionViaje.taller;
  const ok = () => {
    const h = horaDe(hora);
    if (!h) return setMal(true);
    const l = dia.lugares.find((x) => x.activo && x.tipo === (que === "VTV" ? "vtv" : "taller"));
    const hacia: Punto = l ? { otId: null, lugarId: l.id, texto: null } : { otId: null, lugarId: null, texto: que === "VTV" ? "Planta de VTV" : que === "Service" ? "Taller" : "Trámite" };
    cerrar();
    viaje({ accion: "crear", fecha, vehiculoId: veh, tipo: "taller", hacia, hora: h, carga: que });
  };
  return (
    <>
      <DialogTitle>VTV o taller {elVeh(dia, veh, "del")}</DialogTitle>
      <DialogDescription>Ocupa el camión ese rato (~{Math.floor(dur / 60)} h{dur % 60 ? ` ${dur % 60}` : ""}).</DialogDescription>
      <div className="grid gap-1">
        <span className="text-xs font-medium text-muted-foreground">Qué</span>
        <Chips opciones={QUE_TALLER} valor={que} onChange={setQue} label="Qué" />
      </div>
      <InputHora etiqueta="Turno (hora fija)" value={hora} mal={mal} onChange={(x) => { setHora(x); setMal(false); }} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); ok(); } }} />
      <DialogFooter>
        <Button variant="outline" onClick={cerrar}>Cancelar</Button>
        <Button className={PRI} onClick={ok}>Agregar</Button>
      </DialogFooter>
    </>
  );
}

function DlgFlete({ pedidoId, cerrar }: { pedidoId?: string; cerrar: () => void }) {
  const { dia, fecha, ahora, hoy, viaje } = useCamiones();
  const p = pedidoId ? dia.pedidos.find((x) => x.id === pedidoId) ?? null : null;
  const [quien, setQuien] = useState("");
  const [carga, setCarga] = useState(p ? `${p.que} · ${lugar(dia, p.hacia).n}` : "");
  const [hora, setHora] = useState(hoy ? hm5(Math.max(ahora + 30, 7 * 60)) : "8:00");
  const [mal, setMal] = useState(false);
  const ok = () => {
    const h = horaDe(hora);
    if (!h) return setMal(true);
    const nombre = quien.trim() || "Flete";
    const dep = dia.lugares.find((l) => l.activo && l.tipo === "deposito");
    const hacia: Punto = p ? p.hacia : dep ? { otId: null, lugarId: dep.id, texto: null } : { otId: null, lugarId: null, texto: "Depósito" };
    const tipo: TipoViaje = p ? p.tipo : "otro";
    cerrar();
    // Con pedido, un solo gesto: el flete queda atado al pedido ("en camino · flete de X").
    viaje({ accion: "crear", fecha, fleteExterno: nombre, tipo, hacia, hora: h, carga: carga.trim() || null, pedidoId: p?.id ?? null });
  };
  return (
    <>
      <DialogTitle>Flete de afuera</DialogTitle>
      <DialogDescription>Un viaje que hace un tercero. No tiene link; {p ? "el pedido queda «en camino · flete de …»" : "sirve para que la cola no lo muestre «sin camión»"} y el parte lo toma como tercerizado.</DialogDescription>
      <div className="grid gap-3">
        <div className="grid gap-1">
          <Label htmlFor="fl-q">Quién</Label>
          <Input id="fl-q" autoFocus value={quien} placeholder="Semi de Fernando" onChange={(e) => setQuien(e.target.value)} />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="fl-c">Qué</Label>
          <Input id="fl-c" value={carga} placeholder="Mekano al depósito" onChange={(e) => setCarga(e.target.value)} />
        </div>
        <InputHora etiqueta="Hora" value={hora} mal={mal} onChange={(x) => { setHora(x); setMal(false); }} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); ok(); } }} />
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={cerrar}>Cancelar</Button>
        <Button className={PRI} onClick={ok}>Agregar</Button>
      </DialogFooter>
    </>
  );
}

function DlgTodo({ d, cerrar, alSacarUnRato, alElegirOtro }: { d: Extract<Dlg, { t: "todo" }>; cerrar: () => void; alSacarUnRato: (d: Extract<Dlg, { t: "todo" }>) => void; alElegirOtro: () => void }) {
  const { dia } = useCamiones();
  const h = hojaDeCuadrilla(dia, d.c);
  const V = vehiculo(dia, d.veh);
  const capataz = nombreDe(dia, h ? aCargoDe(h) ?? h.recibeId : null);
  const ob = obrasCon(dia, d.c)[0];
  return (
    <>
      <DialogTitle>{nombreDe(dia, filaTodoVeh(dia, d.veh)?.choferId ?? choferDelCamion(dia, d.veh)) || "El chofer"} está todo el día con la {cNombre(dia, d.c)}</DialogTitle>
      <DialogDescription>
        Si lo sacás, la {cNombre(dia, d.c).replace(/^Cuadrilla /, "")} se queda sin {V?.tipo === "hidrogrua" ? "hidrogrúa" : "camión"} un rato{ob ? ` (${ob.o.corto})` : ""}. La app no lo impide: decidís vos.
      </DialogDescription>
      <DialogFooter>
        <Button variant="outline" autoFocus onClick={() => { cerrar(); alElegirOtro(); }}>Elegir otro</Button>
        <Button variant="outline" onClick={() => { cerrar(); alSacarUnRato(d); }}>Sacarlo un rato{capataz ? ` y avisar a ${capataz}` : ""}</Button>
      </DialogFooter>
    </>
  );
}
