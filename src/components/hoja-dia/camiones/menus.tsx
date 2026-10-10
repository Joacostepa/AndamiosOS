"use client";

// Los menús de Camiones: el de una ficha (Marcar hecho · Pasar a otro camión · Volver a la
// cola · Cambiar hora · Fijar hora · Anular…), el de una fila (Avisar · Correr horas · VTV o
// taller · Ver como · Llamar), el de un pedido (Poner en un camión · Esperar… · Pasar a
// mañana · Ya no hace falta…) y el del cajón del tablero.

import { PRI } from "@/components/hoja-dia/comunes/boton-coral";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  calcVeh, choferDe, choferDelCamion, cortoV, dondeAnda, estadoEnvio, haciaDe, hCorta, hm, hm5, horaTxt, lowFirst, lugar,
  nombreDe, normHora, patente, pedidosDeViaje, persona, textoViaje, toMin, vehiculoNombre, viajeCalc,
} from "@/lib/hoja-dia/estado";
import { pedidoDesdeCajon, pidioTxt } from "@/lib/hoja-dia/camiones";
import { TIPOS_VIAJE } from "@/lib/hoja-dia/tipos";
import { Chips, ItemMenu, MenuCabeza, MenuFlotante, MenuSep, MenuTexto, noDevolverFoco } from "@/components/hoja-dia/comunes/menu-flotante";
import { InputHora, horaDe } from "@/components/hoja-dia/comunes/campo-hora";
import { useCamiones, type MenuAbierto } from "./contexto";

export type AbrirDialogo =
  | { t: "hora"; id: string }
  | { t: "anular"; id: string }
  | { t: "taller"; veh: string }
  | { t: "flete"; pedidoId?: string };

export function Menus({ m, cerrar, dialogo, verComo, llamar }: {
  m: MenuAbierto | null;
  cerrar: () => void;
  dialogo: (d: AbrirDialogo, volverA: HTMLElement) => void;
  verComo: (pid: string) => void;
  llamar: (pid: string | null) => void;
}) {
  if (!m) return null;
  if (m.t === "viaje") return <MenuViaje m={m} cerrar={cerrar} dialogo={dialogo} verComo={verComo} />;
  if (m.t === "fila") return <MenuFila m={m} cerrar={cerrar} dialogo={dialogo} verComo={verComo} llamar={llamar} />;
  if (m.t === "ped") return <MenuPedido key={`${m.id}-${m.paso ?? ""}`} m={m} cerrar={cerrar} />;
  return <MenuCajon m={m} cerrar={cerrar} />;
}

function MenuViaje({ m, cerrar, dialogo, verComo }: { m: Extract<MenuAbierto, { t: "viaje" }>; cerrar: () => void; dialogo: (d: AbrirDialogo, volverA: HTMLElement) => void; verComo: (pid: string) => void }) {
  const { dia, ahora, pasado, viaje } = useCamiones();
  const [paso, setPaso] = useState(m.paso);
  const v0 = dia.viajes.find((x) => x.id === m.id);
  if (!v0) return null;
  const vc = viajeCalc(dia, m.id);
  const t = vc?.t ?? toMin(v0.hora) ?? toMin(v0.noAntesDe) ?? 0;
  const v = vc ?? { ...v0, t, dur: v0.duracionMin ?? dia.parametros.duracionViaje[v0.tipo], haciaEf: haciaDe(dia, v0), desdeKey: "" };
  const ch = choferDe(dia, v0);
  const e = ch ? dia.envios.find((x) => x.personaId === ch && !x.anulado) : null;
  const ped = pedidosDeViaje(dia, m.id)[0];
  const der = !!v0.hojaId;
  const flete = !!v0.fleteExterno;
  const planeado = v0.estado === "planeado";
  const hacer = (f: () => void) => () => { cerrar(); f(); };
  const hTxt = vc ? horaTxt(vc) : `${v0.hora ? "" : "~"}${hm5(t)}`;

  if (paso === "pasar") {
    const otros = dia.camiones.filter((c) => c.choferId && c.vehiculoId !== v0.vehiculoId).map((c) => c.vehiculoId);
    return (
      <MenuFlotante anchor={m.anchor} onCerrar={cerrar} label="Pasar a otro camión" ancho={320}>
        <MenuCabeza titulo="Pasar a otro camión" sub={cortoV(dia, v0)} />
        {otros.map((veh) => (
          <ItemMenu key={veh} detalle={dondeAnda(dia, veh, ahora).t.slice(0, 34)} onClick={hacer(() => viaje({ accion: "mover", viajeId: m.id, vehiculoId: veh }))}>
            {nombreDe(dia, choferDelCamion(dia, veh))} · <span className="font-mono text-xs">{patente(dia, veh)}</span>
          </ItemMenu>
        ))}
      </MenuFlotante>
    );
  }

  const dur = v.dur;
  return (
    <MenuFlotante anchor={m.anchor} onCerrar={cerrar} label="Viaje" ancho={330}>
      <MenuCabeza titulo={textoViaje(dia, v0)} />
      <MenuTexto>
        {flete ? <>Flete de afuera: <b>{v0.fleteExterno}</b></> : v0.vehiculoId ? <><b>{nombreDe(dia, ch)}</b> · <span className="font-mono">{patente(dia, v0.vehiculoId)}</span></> : <b>Sin camión</b>}
      </MenuTexto>
      <MenuTexto>
        {v0.hora ? <>Hora fija <b>{normHora(v0.hora)}</b></> : <>Estimada <b>{hTxt}</b></>} · {TIPOS_VIAJE[v0.tipo].nombre}
        {dur ? ` · ${Math.floor(dur / 60)} h${dur % 60 ? ` ${dur % 60}` : ""}` : ""}
      </MenuTexto>
      {vc?.desdeKey && (
        <MenuTexto>
          Desde {v0.desde ? lugar(dia, v0.desde).n : vc.desdeKey === "dep" ? "el depósito" : lugar(dia, keyAPunto(vc.desdeKey)).n}
          {v0.vuelta ? " · después vuelve al depósito" : ""}
        </MenuTexto>
      )}
      {ped && (
        <MenuTexto>
          Pedido: {ped.que} · {pidioTxt(dia, ped)}{ped.horaLimite ? ` · antes de las ${hCorta(normHora(ped.horaLimite))}` : ""}
        </MenuTexto>
      )}
      {v0.estado === "hecho" && (
        <MenuTexto>
          <b>Hecho {hm(v0.hechoMin ?? t)}</b>{v0.hechoPor && v0.hechoPor !== "chofer" ? ` · marcado por ${v0.hechoPor}` : ""}{v0.foto ? " · + foto del remito" : ""}
        </MenuTexto>
      )}
      {v0.foto && <FotoRemito viajeId={m.id} />}
      {v0.estado === "no_pudo" && <MenuTexto><b>No pudo {hm(v0.hechoMin ?? t)}</b>: {lowFirst(v0.noPudoMotivo)}</MenuTexto>}
      {e && e.cambioMin != null && e.snap?.tipo === "chofer" && e.snap.viajes.some((x) => x.k === m.id) && !(e.snapPrimero?.tipo === "chofer" && e.snapPrimero.viajes.some((x) => x.k === m.id)) && (
        <MenuTexto>Avisado {hm(e.cambioMin)}{e.recibidaMin != null && e.recibidaMin >= e.cambioMin ? ` · visto ${hm(e.recibidaMin)}` : " · todavía no lo vio"}</MenuTexto>
      )}
      {!pasado && (
        <>
          <MenuSep />
          {planeado && v0.vehiculoId && !flete && <ItemMenu detalle={`por ${nombreDe(dia, ch) || "el chofer"}`} onClick={hacer(() => viaje({ accion: "hecho", viajeId: m.id }))}>Marcar hecho</ItemMenu>}
          {!planeado && <ItemMenu onClick={hacer(() => viaje({ accion: "deshacer_estado", viajeId: m.id }))}>Volver a «por hacer»</ItemMenu>}
          {planeado && !flete && <ItemMenu detalle="›" onClick={() => setPaso("pasar")}>{v0.vehiculoId ? "Pasar a otro camión" : "Elegir chofer"}</ItemMenu>}
          {planeado && !flete && v0.vehiculoId && (der
            ? <ItemMenu detalle={`nadie ${v0.tipo === "busca" ? "los busca" : "los lleva"}`} onClick={hacer(() => viaje({ accion: "volver_a_cola", viajeId: m.id }))}>Sacar del camión</ItemMenu>
            : <ItemMenu onClick={hacer(() => viaje({ accion: "volver_a_cola", viajeId: m.id }))}>Volver a la cola</ItemMenu>)}
          {planeado && <ItemMenu onClick={() => { noDevolverFoco(); cerrar(); dialogo({ t: "hora", id: m.id }, m.anchor); }}>Cambiar hora</ItemMenu>}
          {planeado && !der && !flete && (v0.hora
            ? <ItemMenu onClick={hacer(() => viaje({ accion: "hora", viajeId: m.id, hora: null }))}>Hacerla estimada</ItemMenu>
            : <ItemMenu detalle="alguien espera" onClick={hacer(() => viaje({ accion: "hora", viajeId: m.id, hora: hm5(t) }))}>Fijar hora</ItemMenu>)}
          {planeado && !der && <ItemMenu rojo onClick={() => { noDevolverFoco(); cerrar(); dialogo({ t: "anular", id: m.id }, m.anchor); }}>Anular…</ItemMenu>}
          {ch && (
            <>
              <MenuSep />
              <ItemMenu onClick={hacer(() => verComo(ch))}>Ver como {nombreDe(dia, ch)}</ItemMenu>
            </>
          )}
        </>
      )}
    </MenuFlotante>
  );
}

/** La foto del remito que sacó el chofer (bucket privado: URL firmada por 10 minutos). */
function FotoRemito({ viajeId }: { viajeId: string }) {
  const q = useQuery({
    queryKey: ["hoja-dia", "foto", viajeId],
    queryFn: async () => {
      const r = await fetch(`/api/hoja-dia/foto?viajeId=${viajeId}`);
      if (!r.ok) throw new Error(`Error ${r.status}`);
      return ((await r.json()) as { url: string | null }).url;
    },
    staleTime: 5 * 60_000,
  });
  if (q.isLoading) return <MenuTexto>Cargando la foto del remito…</MenuTexto>;
  if (!q.data) return <MenuTexto>No se pudo traer la foto del remito.</MenuTexto>;
  return (
    <a href={q.data} target="_blank" rel="noreferrer" className="mx-2 my-1 block overflow-hidden rounded-md border outline-none focus-visible:ring-3 focus-visible:ring-ring/50" title="Abrir la foto del remito">
      {/* eslint-disable-next-line @next/next/no-img-element -- URL firmada de Supabase, sin optimizar */}
      <img src={q.data} alt="Foto del remito" className="max-h-48 w-full object-cover" />
    </a>
  );
}

const keyAPunto = (key: string) => {
  const [t, id] = [key.slice(0, 1), key.slice(2)];
  return t === "o" ? { otId: Number(id), lugarId: null, texto: null } : t === "l" ? { otId: null, lugarId: id, texto: null } : { otId: null, lugarId: null, texto: id };
};

function MenuFila({ m, cerrar, dialogo, verComo, llamar }: { m: Extract<MenuAbierto, { t: "fila" }>; cerrar: () => void; dialogo: (d: AbrirDialogo, volverA: HTMLElement) => void; verComo: (pid: string) => void; llamar: (pid: string | null) => void }) {
  const { dia, ahora, fecha, viaje, avisar } = useCamiones();
  const veh = m.veh;
  const ch = choferDelCamion(dia, veh);
  const st = ch ? estadoEnvio(dia, { pid: ch, rol: "chofer" }) : null;
  const N = nombreDe(dia, ch);
  const hacer = (f: () => void) => () => { cerrar(); f(); };
  const hayEstimadas = calcVeh(dia, veh).some((v) => v.estado === "planeado" && !v.hora);
  return (
    <MenuFlotante anchor={m.anchor} onCerrar={cerrar} label="Camión" ancho={290}>
      <MenuCabeza titulo={`${N || "Sin chofer"} · ${vehiculoNombre(dia, veh)}`} sub={dondeAnda(dia, veh, ahora).t} />
      {ch && st?.k === "cambiada" && <ItemMenu detalle={`${st.ds.length} ${st.ds.length === 1 ? "cambio" : "cambios"}`} onClick={hacer(() => avisar(ch))}>Avisar a {N}</ItemMenu>}
      <ItemMenu detalle="las estimadas, desde ahora" disabled={!hayEstimadas} onClick={hacer(() => viaje({ accion: "correr_horas", fecha, vehiculoId: veh }))}>Correr horas</ItemMenu>
      <ItemMenu onClick={() => { noDevolverFoco(); cerrar(); dialogo({ t: "taller", veh }, m.anchor); }}>Agregar VTV o taller</ItemMenu>
      {ch && <ItemMenu onClick={hacer(() => verComo(ch))}>Ver como {N}</ItemMenu>}
      {ch && <ItemMenu detalle={persona(dia, ch)?.celular ?? "sin celular"} disabled={!persona(dia, ch)?.celular} onClick={hacer(() => llamar(ch))}>Llamar a {N}</ItemMenu>}
    </MenuFlotante>
  );
}

const MOTIVOS_ANULAR_PEDIDO = ["Lo resolvió la obra", "Se canceló", "Pedido repetido", "Otro"];

function MenuPedido({ m, cerrar }: { m: Extract<MenuAbierto, { t: "ped" }>; cerrar: () => void }) {
  const { dia, pedido, setPoner } = useCamiones();
  const [paso, setPaso] = useState(m.paso);
  const motivos = dia.parametros.motivosEsperar;
  const [mot, setMot] = useState<string | null>(m.paso === "esperar" ? motivos[0] ?? null : null);
  const [hora, setHora] = useState("15:00");
  const [mal, setMal] = useState(false);
  const p = dia.pedidos.find((x) => x.id === m.id);
  if (!p) return null;
  const dest = lugar(dia, p.hacia);
  const hacer = (f: () => void) => () => { cerrar(); f(); };

  if (paso === "esperar") {
    const ok = () => {
      const h = hora.trim() ? horaDe(hora) : null;
      if (hora.trim() && !h) return setMal(true);
      if (!mot) return;
      cerrar();
      pedido({ accion: "esperar", pedidoId: p.id, motivo: mot, hasta: h });
    };
    return (
      <MenuFlotante anchor={m.anchor} onCerrar={cerrar} label="Esperar" ancho={300}>
        <MenuCabeza titulo="Esperar…" sub={`${p.que} → ${dest.corto}`} />
        <div className="px-2 pt-1 text-xs font-medium text-muted-foreground">¿Por qué espera?</div>
        <Chips opciones={motivos} valor={mot} onChange={setMot} label="Motivo" />
        <div className="px-2 pt-1 text-xs font-medium text-muted-foreground" id="esp-h-l">¿Desde qué hora vuelve a «Para hacer vos»?</div>
        <div className="flex flex-wrap items-start gap-1.5 px-1 py-1">
          <InputHora value={hora} onChange={(v) => { setHora(v); setMal(false); }} mal={mal} aria-labelledby="esp-h-l" onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); ok(); } }} />
          <Button type="button" className={`h-9 ${PRI}`} disabled={!mot} onClick={ok}>Esperar</Button>
        </div>
      </MenuFlotante>
    );
  }
  if (paso === "anular") {
    return (
      <MenuFlotante anchor={m.anchor} onCerrar={cerrar} label="Ya no hace falta" ancho={280}>
        <MenuCabeza titulo="Ya no hace falta" sub={p.que} />
        {MOTIVOS_ANULAR_PEDIDO.map((x) => <ItemMenu key={x} onClick={hacer(() => pedido({ accion: "anular", pedidoId: p.id, motivo: x }))}>{x}</ItemMenu>)}
      </MenuFlotante>
    );
  }
  const sinCamion = !p.viajeId && p.estado !== "hecho";
  return (
    <MenuFlotante anchor={m.anchor} onCerrar={cerrar} label="Opciones del pedido" ancho={300}>
      <MenuCabeza titulo={p.que} sub={`→ ${dest.n} · ${pidioTxt(dia, p)}`} />
      {p.nota && <MenuTexto>{p.nota}</MenuTexto>}
      {sinCamion && <ItemMenu onClick={hacer(() => setPoner(p.id))}>Poner en un camión</ItemMenu>}
      <ItemMenu detalle="›" onClick={() => { setMot(motivos[0] ?? null); setPaso("esperar"); }}>Esperar…</ItemMenu>
      <ItemMenu detalle="queda primero" onClick={hacer(() => pedido({ accion: "pasar_a_manana", pedidoId: p.id }))}>Pasar a mañana</ItemMenu>
      <ItemMenu rojo detalle="›" onClick={() => setPaso("anular")}>Ya no hace falta…</ItemMenu>
    </MenuFlotante>
  );
}

function MenuCajon({ m, cerrar }: { m: Extract<MenuAbierto, { t: "cajon" }>; cerrar: () => void }) {
  const { dia, nuevoPedido } = useCamiones();
  return (
    <MenuFlotante anchor={m.anchor} onCerrar={cerrar} label="Cajón del tablero" ancho={300}>
      <MenuCabeza titulo="Cajón del tablero" sub="Pendientes que todavía no pasaron a pedido" />
      {dia.cajon.map((k) => (
        <div key={k.id} className="grid gap-0.5">
          <MenuTexto><span className="font-mono break-words">{k.texto}</span></MenuTexto>
          <ItemMenu detalle="queda tildado" onClick={() => { noDevolverFoco(); cerrar(); nuevoPedido({ ...pedidoDesdeCajon(k.texto, dia.lugares), cajonPendienteId: k.id }); }}>Pasar a pedido</ItemMenu>
        </div>
      ))}
      {!dia.cajon.length && <MenuTexto>No hay pendientes en el cajón.</MenuTexto>}
    </MenuFlotante>
  );
}
