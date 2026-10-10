"use client";

// Los diálogos chicos de Camiones: cambiar la hora de un viaje, anularlo con motivo, la VTV
// o el taller de un camión, un flete de afuera y "X está todo el día con la Cuadrilla N".

import { PRI } from "@/components/hoja-dia/comunes/boton-coral";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  aCargoDe, calcVeh, choferDelCamion, cNombre, cortoV, hm5, hojaDeCuadrilla, lugar, nombreDe, normHora, obrasCon, patente, vehiculo,
} from "@/lib/hoja-dia/estado";
import type { Punto, TipoViaje } from "@/lib/hoja-dia/tipos";
import { Chips } from "./menu-flotante";
import { InputHora, horaDe } from "./input-hora";
import { useCamiones } from "./contexto";

export type Dlg =
  | { t: "hora"; id: string }
  | { t: "anular"; id: string }
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

const MOTIVOS_ANULAR = ["Ya no hace falta", "Lo resolvió el cliente", "Se suspendió la obra", "Otro"];

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
      <DialogTitle>VTV o taller del {patente(dia, veh)}</DialogTitle>
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
  const { dia, fecha, ahora, hoy, viaje, pedido } = useCamiones();
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
    viaje({ accion: "crear", fecha, fleteExterno: nombre, tipo, hacia, hora: h, carga: carga.trim() || null }, () => {
      // La base no ata un pedido a un flete: el pedido sale de la cola con el motivo.
      if (p) pedido({ accion: "anular", pedidoId: p.id, motivo: `Lo lleva un flete de afuera (${nombre})` }, undefined, false);
    });
  };
  return (
    <>
      <DialogTitle>Flete de afuera</DialogTitle>
      <DialogDescription>Un viaje que hace un tercero. No tiene link; sirve para que la cola no lo muestre «sin camión» y para que el parte lo tome como tercerizado.</DialogDescription>
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
      <DialogTitle>{nombreDe(dia, choferDelCamion(dia, d.veh))} está todo el día con la {cNombre(dia, d.c)}</DialogTitle>
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
