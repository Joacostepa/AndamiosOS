"use client";

// La cola de Pedidos (§7), siempre abierta a la izquierda: agrupada por de quién es la
// pelota (Para hacer vos · Esperando a otro · En camino · Hechos), con los sugeridos de la
// noche anterior y lo que vino del cajón del tablero arriba de todo. La app ordena; el
// coordinador decide: cada pedido dice qué camión está "Cerca" y cuál queda "Libre".

import { useMemo, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Kbd } from "./kbd";
import {
  camionesQueSirven, cola, diaSemana, hm, horaTxt, lowFirst, lugar, nombreDe, patente, choferDe, choferDelCamion,
  sugeridosDe, txtCerca, txtLibre, txtNadieLibre, esHoy, type ItemCola,
} from "@/lib/hoja-dia/estado";
import { TIPOS_VIAJE } from "@/lib/hoja-dia/tipos";
import { cuadrillaDeDestino, pedidoDesdeCajon, pidioTxt, urgenciaTxt } from "@/lib/hoja-dia/camiones";
import { arrastre, TIPO_ARRASTRE, useCamiones } from "./contexto";

export function ColaPedidos() {
  const { dia, ahora, fecha, pasado, poner, nuevoPedido, volverACola, angosta } = useCamiones();
  const C = useMemo(() => cola(dia, ahora), [dia, ahora]);
  const sg = useMemo(() => sugeridosDe(dia, ahora), [dia, ahora]);
  const [verCamino, setVerCamino] = useState(false);
  const [verHechos, setVerHechos] = useState(false);
  const [drop, setDrop] = useState(false);
  const { setPoner, pedido } = useCamiones();

  return (
    <aside
      id="cola"
      aria-label="Pedidos"
      onDragOver={(e) => {
        if (pasado || arrastre.actual()?.k !== "v") return;
        e.preventDefault();
        setDrop(true);
      }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDrop(false); }}
      onDrop={(e) => {
        setDrop(false);
        const a = arrastre.actual();
        if (a?.k !== "v") return;
        e.preventDefault();
        arrastre.terminar();
        volverACola(a.id);
      }}
      className={cn(
        "flex min-w-0 flex-col rounded-xl border bg-hd-card2",
        !angosta && "lg:sticky lg:top-0 lg:max-h-[calc(100dvh-7.5rem)]",
        drop && "border-primary",
      )}
    >
      <div className="flex items-baseline gap-2 border-b px-3 pt-2.5 pb-2">
        <h2 className="text-[15px] font-semibold">Pedidos</h2>
        <span className="text-xs text-muted-foreground">{C.vos.length} para hacer vos</span>
        <span className="flex-1" />
        {!pasado && (
          <Button type="button" variant="outline" size="sm" className="max-md:h-9" onClick={() => nuevoPedido()}>
            Nuevo <Kbd>N</Kbd>
          </Button>
        )}
      </div>
      <div className="grid content-start gap-1.5 overflow-auto px-2 pt-1 pb-3">
        {poner && (
          <p role="status" className="px-1 pt-1 text-xs text-muted-foreground">
            Elegí el camión: tecla <b className="text-foreground">1–4</b> o «Poner acá» en la fila. {angosta ? "" : "También podés arrastrarlo. "}Esc cancela.
          </p>
        )}

        {sg.length > 0 && (
          <>
            <Grupo t={`Sugeridos para el ${diaSemana(dia.fecha)}`} n={sg.length} />
            {sg.map((s) => (
              <div key={s.key} className="grid gap-[3px] rounded-[9px] border border-dashed border-input bg-card px-2.5 py-2 text-[13px]">
                <div className="text-xs font-semibold text-muted-foreground">Sugerido · {s.regla === "arranca" ? "arranca un armado" : "termina un desarme"}</div>
                <div className="leading-snug font-semibold">{s.txt}</div>
                <div className="text-xs leading-snug text-muted-foreground">
                  {s.enCamion ? `Ya va en el camión de ${nombreDe(dia, choferDelCamion(dia, s.enCamion))} (${patente(dia, s.enCamion)}) al terminar` : s.que}
                  {s.horaFija ? ` · ${s.horaFija}${s.cargaDeposito ? ` (carga ${s.cargaDeposito})` : ""}` : s.noAntesDe ? ` · ~${s.noAntesDe}` : ""}
                </div>
                {!pasado && (
                  <div className="mt-[3px] flex flex-wrap gap-1.5">
                    <Button
                      type="button" variant="outline" size="xs" className="max-md:h-9 max-md:text-sm"
                      onClick={() => pedido({ accion: "aceptar_sugerido", fecha, key: s.key }, (r) => { if (!s.enCamion && typeof r.pedidoId === "string") setPoner(r.pedidoId); })}
                    >
                      Aceptar
                    </Button>
                    <Button type="button" variant="ghost" size="xs" className="max-md:h-9 max-md:text-sm" onClick={() => pedido({ accion: "descartar_sugerido", fecha, key: s.key })}>
                      No hace falta
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </>
        )}

        {dia.cajon.length > 0 && !pasado && (
          <div className="grid gap-1 rounded-[9px] border border-dashed border-input px-2.5 py-2 text-[13px]">
            <span className="text-xs text-muted-foreground">Cajón del tablero:</span>
            {dia.cajon.map((k) => (
              <div key={k.id} className="grid gap-1">
                <span className="font-mono text-xs break-words">{k.texto}</span>
                <span>
                  <Button
                    type="button" variant="outline" size="xs" className="max-md:h-9 max-md:text-sm"
                    onClick={() => nuevoPedido({ ...pedidoDesdeCajon(k.texto, dia.lugares), cajonPendienteId: k.id })}
                  >
                    Pasar a pedido
                  </Button>
                </span>
              </div>
            ))}
          </div>
        )}

        <Grupo t="Para hacer vos" n={C.vos.length} />
        {C.vos.length ? C.vos.map((it) => <Pedido key={it.p.id} it={it} grupo="vos" />) : <p className="px-1 text-xs text-muted-foreground">Nada sin camión.</p>}
        <Grupo t="Esperando a otro" n={C.esp.length} />
        {C.esp.map((it) => <Pedido key={it.p.id} it={it} grupo="esp" />)}
        <Grupo t="En camino" n={C.camino.length} ver={C.camino.length ? verCamino : undefined} onVer={() => setVerCamino(!verCamino)} />
        {verCamino && C.camino.map((it) => <Pedido key={it.p.id} it={it} grupo="camino" />)}
        <Grupo t={esHoy(ahora) ? "Hechos hoy" : "Hechos"} n={C.hechos.length} ver={C.hechos.length ? verHechos : undefined} onVer={() => setVerHechos(!verHechos)} />
        {verHechos && C.hechos.map((it) => <Pedido key={it.p.id} it={it} grupo="hechos" />)}
        {!pasado && !angosta && <p className="px-1 pt-1 text-xs text-muted-foreground">Arrastrá una ficha acá para volver a la cola.</p>}
      </div>
    </aside>
  );
}

function Grupo({ t, n, ver, onVer }: { t: string; n: number; ver?: boolean; onVer?: () => void }) {
  return (
    <div className="mx-1 mt-2 flex items-baseline justify-between text-[11px] font-semibold tracking-[.07em] text-muted-foreground uppercase">
      <span>{t} ({n})</span>
      {ver !== undefined && (
        <button type="button" onClick={onVer} aria-expanded={ver} className="rounded text-xs font-normal tracking-normal normal-case underline decoration-input underline-offset-2 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 max-md:py-2">
          {ver ? "plegar" : "ver"}
        </button>
      )}
    </div>
  );
}

function Pedido({ it, grupo }: { it: ItemCola; grupo: "vos" | "esp" | "camino" | "hechos" }) {
  const { dia, ahora, pasado, poner, setPoner, abrirMenu, avisar, boton, angosta, pedido } = useCamiones();
  const { p, st } = it;
  const sel = poner === p.id;
  const dest = lugar(dia, p.hacia);

  if (grupo === "camino" && st.k === "en") {
    const ch = choferDe(dia, st.v);
    const e = ch ? dia.envios.find((x) => x.personaId === ch && !x.anulado) : null;
    return (
      <div id={`ped-${p.id}`} className="rounded-[9px] border bg-card px-2.5 py-1.5 text-[13px] text-muted-foreground">
        {p.que} → {dest.corto} · {st.v.fleteExterno ? `en camino · flete de ${st.v.fleteExterno}` : `lo lleva ${nombreDe(dia, ch)}`} · {horaTxt(st.v)}
        {e?.cambioMin != null ? ` · avisado ${hm(e.cambioMin)}` : ""}
        {e?.recibidaMin != null && e.cambioMin != null && e.recibidaMin >= e.cambioMin ? ` · visto ${hm(e.recibidaMin)}` : ""}
      </div>
    );
  }
  if (grupo === "hechos" && st.k === "hecho") {
    return (
      <div id={`ped-${p.id}`} className="rounded-[9px] border bg-card px-2.5 py-1.5 text-[13px] text-muted-foreground">
        {p.que} → {dest.corto} · entregado {hm(st.v.hechoMin ?? st.v.t)} · {st.v.fleteExterno ?? nombreDe(dia, choferDe(dia, st.v))}
        {st.v.foto ? " · + foto" : ""}
      </div>
    );
  }

  const u = urgenciaTxt(dia, p, ahora);
  const cd = cuadrillaDeDestino(dia, p.hacia);
  const L = p.hacia.lugarId ? dia.lugares.find((l) => l.id === p.hacia.lugarId) : null;
  const rojo = (p.ultimoNoPudo && !p.noPudoVisto) || p.urgencia === "frena";
  let ayuda: React.ReactNode = null;
  let bs: React.ReactNode = null;

  if (grupo === "esp") {
    if (it.noVisto) {
      const e = dia.envios.find((x) => x.personaId === it.noVisto && !x.anulado);
      ayuda = <div className="text-xs text-muted-foreground">{nombreDe(dia, it.noVisto)} no abrió el viaje nuevo ({e?.cambioMin != null ? hm(e.cambioMin) : ""})</div>;
      bs = <Button type="button" variant="outline" size="xs" className="max-md:h-9 max-md:text-sm" onClick={(ev) => boton({ l: "", a: "llamar", p: it.noVisto }, ev.currentTarget)}>Llamar a {nombreDe(dia, it.noVisto)}</Button>;
    } else {
      ayuda = (
        <div className="text-xs leading-snug text-muted-foreground">
          {TIPOS_VIAJE[p.tipo].nombre} · <b className="font-medium text-foreground">{lowFirst(p.esperandoMotivo || "esperando")}</b>
          {p.esperandoHastaMin != null ? ` · lo tienen a las ${hm(p.esperandoHastaMin)}` : ""}
        </div>
      );
      bs = <Button type="button" variant="outline" size="xs" className="max-md:h-9 max-md:text-sm" onClick={() => pedido({ accion: "ya_esta", pedidoId: p.id })}>Ya está</Button>;
    }
  } else if (it.sinAvisar && st.k === "en") {
    ayuda = (
      <div className="text-xs text-muted-foreground">
        En el <span className="font-mono">{patente(dia, st.v.vehiculoId)}</span> · {nombreDe(dia, it.sinAvisar)} todavía no sabe · {horaTxt(st.v)}
      </div>
    );
    bs = <Button type="button" variant="outline" size="xs" className="max-md:h-9 max-md:text-sm" onClick={() => avisar(it.sinAvisar!)}>Avisar a {nombreDe(dia, it.sinAvisar)}</Button>;
  } else {
    const q = camionesQueSirven(dia, p, ahora);
    const lines: React.ReactNode[] = [];
    if (p.ultimoNoPudo && !p.noPudoVisto) lines.push(<div key="np" className="text-[12.5px] font-medium text-hd-rojo">{nombreDe(dia, p.ultimoNoPudo.choferId)} no pudo en {lugar(dia, p.ultimoNoPudo.hacia).n}: {lowFirst(p.ultimoNoPudo.motivo)} ({hm(p.ultimoNoPudo.min)})</div>);
    else if (p.ultimoNoPudo) lines.push(<div key="np" className="text-xs text-muted-foreground">Antes: {nombreDe(dia, p.ultimoNoPudo.choferId)} no pudo ({lowFirst(p.ultimoNoPudo.motivo)}, {hm(p.ultimoNoPudo.min)})</div>);
    if (q.nadieLibre && esHoy(ahora)) lines.push(<div key="nl" className="text-[12.5px] font-medium text-hd-rojo">{txtNadieLibre(dia, q)}</div>);
    else {
      if (q.cerca) lines.push(<div key="c" className="text-xs text-muted-foreground"><b className="font-medium text-foreground">Cerca:</b> {txtCerca(dia, q.cerca)}</div>);
      if (q.libre && (!q.cerca || q.libre.veh !== q.cerca.veh || !esHoy(ahora))) lines.push(<div key="l" className="text-xs text-muted-foreground"><b className="font-medium text-foreground">Libre:</b> {txtLibre(dia, q.libre, q.ahora)}</div>);
    }
    if (sel && q.no.length) lines.push(<div key="no" className="text-xs leading-snug text-muted-foreground">No sirven: {q.no.map((x) => x.t).join(" · ")}</div>);
    ayuda = lines;
    bs = pasado ? null : sel ? (
      <Button type="button" variant="outline" size="xs" className="max-md:h-9 max-md:text-sm" onClick={() => setPoner(null)}>Cancelar</Button>
    ) : (
      <>
        <Button type="button" variant="outline" size="xs" data-poner={p.id} className="max-md:h-9 max-md:text-sm" onClick={() => setPoner(p.id)}>Poner en un camión</Button>
        {p.ultimoNoPudo && !p.noPudoVisto && (
          <Button type="button" variant="outline" size="xs" className="max-md:h-9 max-md:text-sm" onClick={(ev) => abrirMenu({ t: "ped", id: p.id, anchor: document.getElementById(`pm-${p.id}`) ?? ev.currentTarget, paso: "esperar" })}>
            Esperar…
          </Button>
        )}
      </>
    );
  }

  const arrastrable = grupo === "vos" && !it.sinAvisar && !pasado && !angosta;
  return (
    <div
      id={`ped-${p.id}`}
      draggable={arrastrable}
      onDragStart={(e) => {
        arrastre.empezar({ k: "ped", id: p.id });
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData(TIPO_ARRASTRE, JSON.stringify(arrastre.actual()));
      }}
      onDragEnd={() => { arrastre.terminar(); }}
      className={cn(
        "grid min-w-0 gap-[3px] rounded-[9px] border bg-card px-2.5 py-2 text-[13px]",
        arrastrable && "cursor-grab",
        rojo && "border-[color-mix(in_oklch,var(--hd-rojo)_55%,transparent)]",
        sel && "border-primary shadow-[inset_0_0_0_1px_var(--primary)]",
      )}
    >
      <div className={cn("flex flex-wrap gap-1.5 text-xs font-semibold text-muted-foreground", u.tono === "rojo" && "text-hd-rojo", u.tono === "amb" && "text-hd-ambar")}>{u.t}</div>
      <div className="leading-snug font-semibold">{p.que}</div>
      <div className="leading-snug">
        → {dest.n}
        {cd ? <small className="text-xs text-muted-foreground"> · {cd.txt}</small> : L?.horario ? <small className="text-xs text-muted-foreground"> · {L.horario}</small> : null}
      </div>
      <div className="text-xs leading-snug text-muted-foreground">
        {TIPOS_VIAJE[p.tipo].nombre} · {pidioTxt(dia, p)}
        {p.necesita === "hidrogrua" && <> · <b className="font-medium text-foreground">necesita hidrogrúa</b></>}
        {p.necesita === "camion" && <> · <b className="font-medium text-foreground">necesita camión</b></>}
      </div>
      {ayuda}
      <div className="mt-[3px] flex flex-wrap items-center gap-1.5">
        {bs}
        <span className="flex-1" />
        {!pasado && (
          <Button
            type="button" variant="ghost" size="icon-xs" id={`pm-${p.id}`} className="max-md:size-9"
            aria-label="Más opciones del pedido" aria-haspopup="menu"
            onClick={(e) => abrirMenu({ t: "ped", id: p.id, anchor: e.currentTarget })}
          >
            <MoreHorizontal />
          </Button>
        )}
      </div>
    </div>
  );
}
