"use client";

// El panel derecho del Pizarrón: los pedidos del día (F4) y el mini-mapa con las obras, el
// depósito y los pedidos a otra dirección.
//
// Un pedido se arrastra (o se toca y se toca el camión) a un camión: el servidor lo pone en
// el hueco de MENOR DESVÍO del recorrido (estado.ts `mejorHueco`, la misma cuenta acá y allá).
// "¿Quién lo lleva?" ordena los camiones por desvío (recorrido.ts `quienPasaCerca`). Soltarlo
// de vuelta en el panel lo saca del camión. "+ Pedido" pregunta qué y adónde; una dirección
// escrita se ubica en el mapa sola (o tocando el mapa si Google no la encuentra).
//
// Todo gesto es una acción de siempre (pedidos: crear, editar, esperar, pasar a mañana,
// anular, aceptar/descartar sugerido; viajes: poner_pedido, mover, volver_a_cola, crear con
// flete) con historial y Deshacer, y se ve al instante (optimista.ts).

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { Check, Clock, MapPin, MoreHorizontal, Package, Plus, Route, Sparkles, Truck } from "lucide-react";
import type { DiaHoja, Pedido, Punto } from "@/lib/hoja-dia/tipos";
import {
  ahoraItems, choferDe, cola, desvioTxt, estadoPedido, hm, hm5, horaTxt, lugar, nombreDe, sugeridosDe, vehTxt, viajeCalc, type Boton,
} from "@/lib/hoja-dia/estado";
import { quienPasaCerca } from "@/lib/hoja-dia/recorrido";
import type { AccionPedido } from "@/lib/hoja-dia/acciones";
import type { VistaPizarron } from "@/lib/hoja-dia/pizarron";
import { colorCuadrilla } from "@/lib/tablero/colores";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Chips, ItemMenu, MenuCabeza, MenuFlotante, MenuTexto } from "@/components/hoja-dia/comunes/menu-flotante";
import { InputHora, horaDe } from "@/components/hoja-dia/comunes/campo-hora";
import { PRI } from "@/components/hoja-dia/comunes/boton-coral";
import { useFicha, usePizarron, useZona } from "./contexto";
import { ElegirLugar } from "./elegir-lugar";
import type { PuntoMapa } from "./mini-mapa";

// MapLibre sólo en el navegador (necesita window y WebGL).
const MiniMapa = dynamic(() => import("./mini-mapa").then((m) => m.MiniMapa), {
  ssr: false,
  loading: () => <div className="h-[220px] animate-pulse rounded-md bg-muted" aria-hidden />,
});

const MOTIVOS_ANULAR = ["Lo resolvió la obra", "Se canceló", "Pedido repetido", "Otro"];
const esTexto = (p: Punto) => !!p.texto && p.otId == null && !p.lugarId;

type Menu =
  | { t: "lleva"; id: string; el: HTMLElement; paso?: "flete" }
  | { t: "mas"; id: string; el: HTMLElement; paso?: "esperar" | "anular" | "corregir" }
  | { t: "lugar"; id: string | "nuevo"; el: HTMLElement }
  | null;

export function PanelLateral({ dia, vista, rotulo, onFoco }: { dia: DiaHoja; vista: VistaPizarron; rotulo: string; onFoco: (c: number) => void }) {
  const ctx = usePizarron();
  const { ahora, soloLectura } = ctx;
  const [menu, setMenu] = useState<Menu>(null);
  const [nuevo, setNuevo] = useState<{ que: string; hacia: Punto | null } | null>(null);
  // Ubicar en el mapa: el pedido (o el nuevo) que espera un toque en el mini-mapa.
  const [ubicar, setUbicar] = useState<string | "nuevo" | null>(null);
  const { setNodeRef: refZona, isOver: sobreZona } = useZona("panel-pedidos", { k: "pedidos" }, soloLectura);
  const pedido = (a: AccionPedido) => ctx.ejecutar([{ k: "pedido", a }]);

  const C = useMemo(() => cola(dia, ahora), [dia, ahora]);
  const sugeridos = useMemo(() => (soloLectura ? [] : sugeridosDe(dia, ahora)), [dia, ahora, soloLectura]);
  // Los avisos de un pedido (frena la obra, no pudo, nadie libre…) van en su tarjeta.
  const avisos = useMemo(() => {
    const m = new Map<string, { t: string; nivel: string; bs: Boton[] }[]>();
    for (const a of ahoraItems(dia, ahora)) if (a.ped) m.set(a.ped, [...(m.get(a.ped) ?? []), a]);
    return m;
  }, [dia, ahora]);
  const lista = useMemo(() => [...C.vos, ...C.esp, ...C.camino, ...C.hechos].map((x) => x.p), [C]);
  const porHacer = C.vos.length + C.esp.length;

  const puntos = useMemo<PuntoMapa[]>(() => {
    const out: PuntoMapa[] = [];
    for (const col of vista.columnas) {
      const color = colorCuadrilla(col.color).borde;
      for (const o of dia.obras.filter((x) => x.cuadrillaOdooId === col.c && x.lat != null && x.lng != null)) {
        out.push({ k: `o:${o.otId}`, lat: o.lat!, lng: o.lng!, rotulo: col.rotulo, color, titulo: `${col.nombre} · ${o.corto}`, c: col.c });
      }
    }
    const dep = dia.lugares.find((l) => l.tipo === "deposito" && l.activo && l.lat != null && l.lng != null);
    if (dep) out.push({ k: "dep", lat: dep.lat!, lng: dep.lng!, rotulo: "D", color: "var(--muted-foreground)", titulo: `Depósito · ${dep.direccion ?? dep.nombre}`, c: null, deposito: true });
    // Los pedidos a otra dirección ubicada (los de una obra o un lugar ya tienen su punto).
    for (const p of lista) {
      if (!esTexto(p.hacia)) continue;
      const L = lugar(dia, p.hacia);
      if (L.lat == null || L.lng == null) continue;
      out.push({ k: `q:${p.id}`, lat: L.lat, lng: L.lng, rotulo: "P", color: "var(--hd-ambar, #b45309)", titulo: `Pedido: ${p.que} · ${L.n}`, c: null, pedido: p.id, hecho: p.estado === "hecho" });
    }
    if (nuevo?.hacia && esTexto(nuevo.hacia) && nuevo.hacia.lat != null && nuevo.hacia.lng != null) {
      out.push({ k: "q:nuevo", lat: nuevo.hacia.lat, lng: nuevo.hacia.lng, rotulo: "+", color: "var(--primary)", titulo: `Nuevo pedido · ${nuevo.hacia.texto}`, c: null, pedido: "nuevo" });
    }
    return out;
  }, [dia, vista.columnas, lista, nuevo]);

  const colocar = ubicar ? {
    onColocar: (ll: { lat: number; lng: number }) => {
      const id = ubicar;
      setUbicar(null);
      if (id === "nuevo") {
        setNuevo((n) => (n?.hacia ? { ...n, hacia: { ...n.hacia, lat: ll.lat, lng: ll.lng } } : n));
        return;
      }
      const p = dia.pedidos.find((x) => x.id === id);
      if (p) pedido({ accion: "editar", pedidoId: p.id, hacia: { ...p.hacia, lat: ll.lat, lng: ll.lng } });
    },
  } : null;

  const guardarNuevo = () => {
    if (!nuevo?.que.trim() || !nuevo.hacia) return;
    pedido({ accion: "crear", fecha: dia.fecha, que: nuevo.que.trim(), hacia: nuevo.hacia, urgencia: "hoy", necesita: "cualquiera", canal: "oficina" });
    setNuevo(null);
    setUbicar((u) => (u === "nuevo" ? null : u));
  };

  const pMenu = menu && menu.t !== "lugar" ? dia.pedidos.find((x) => x.id === menu.id) ?? null : null;

  return (
    <aside className="grid min-w-0 content-start gap-3 @min-[700px]:@max-[1099px]:grid-cols-[minmax(0,1fr)_minmax(0,280px)]">
      <section
        ref={refZona}
        aria-label={`Pedidos de ${rotulo}`}
        data-caja="pedidos"
        className={cn("rounded-lg border bg-card p-3 transition-colors", sobreZona && ctx.arrastre?.origen.k === "pedido" && "border-primary bg-primary/5")}
      >
        <h2 className="mb-2 flex items-baseline justify-between gap-2 text-[17px] font-bold">
          Pedidos de {rotulo}
          <span className="text-xs font-medium text-muted-foreground">{lista.length ? (porHacer ? `${porHacer} sin camión` : "todos en camino") : "ninguno todavía"}</span>
        </h2>

        {sugeridos.length > 0 && (
          <ul aria-label="Sugeridos por el tablero" className="mb-2 grid gap-1.5">
            {sugeridos.map((s) => (
              <li key={s.key} className="grid gap-1.5 rounded-md border border-dashed bg-muted/40 px-2 py-2 text-[13px]">
                <span className="flex gap-1.5"><Sparkles className="mt-0.5 size-4 shrink-0 text-muted-foreground" /><span className="leading-snug">{s.txt}</span></span>
                <span className="flex flex-wrap gap-1.5 pl-5">
                  <Button size="sm" className={PRI} onClick={() => pedido({ accion: "aceptar_sugerido", fecha: dia.fecha, key: s.key })}>Aceptar</Button>
                  <Button size="sm" variant="outline" onClick={() => pedido({ accion: "descartar_sugerido", fecha: dia.fecha, key: s.key })}>No hace falta</Button>
                </span>
              </li>
            ))}
          </ul>
        )}

        <ul className="grid gap-1.5">
          {lista.map((p) => (
            <FichaPedido
              key={p.id}
              p={p}
              avisos={avisos.get(p.id) ?? []}
              ubicando={ubicar === p.id}
              onLleva={(el) => setMenu({ t: "lleva", id: p.id, el })}
              onMas={(el) => setMenu({ t: "mas", id: p.id, el })}
            />
          ))}
        </ul>
        {!soloLectura && ctx.arrastre?.origen.k === "pedido" && (
          <p className="mt-1.5 text-xs text-muted-foreground">Soltalo en un camión; acá vuelve a «sin camión».</p>
        )}

        {!soloLectura && (nuevo ? (
          <form
            className="mt-2 grid gap-1.5 rounded-md border bg-muted/40 p-2"
            onSubmit={(e) => { e.preventDefault(); guardarNuevo(); }}
            aria-label="Nuevo pedido"
          >
            <label className="sr-only" htmlFor="np-que">Qué</label>
            <input
              id="np-que"
              autoFocus
              value={nuevo.que}
              onChange={(e) => setNuevo({ ...nuevo, que: e.target.value })}
              placeholder="Qué (ej. 6 bases regulables)"
              maxLength={120}
              className="h-9 min-w-0 rounded-md border border-input bg-card px-2 text-[13.5px]"
            />
            <button
              type="button"
              onClick={(e) => setMenu({ t: "lugar", id: "nuevo", el: e.currentTarget })}
              className={cn("flex min-h-9 items-center gap-1.5 rounded-md border border-dashed bg-card px-2 text-left text-[13px] hover:border-foreground", !nuevo.hacia && "text-muted-foreground")}
            >
              <MapPin className="size-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate">{nuevo.hacia ? lugar(dia, nuevo.hacia).n : "¿Adónde va?"}</span>
              {nuevo.hacia && esTexto(nuevo.hacia) && <span className="text-xs text-muted-foreground">{nuevo.hacia.lat != null ? "ubicada" : "sin ubicar"}</span>}
            </button>
            {nuevo.hacia && esTexto(nuevo.hacia) && nuevo.hacia.lat == null && (
              <button type="button" onClick={() => setUbicar(ubicar === "nuevo" ? null : "nuevo")} className="text-left text-xs font-semibold underline decoration-foreground/30 underline-offset-[3px]">
                {ubicar === "nuevo" ? "Tocá el mapa donde va (o acá para cancelar)" : "Ubicarla tocando el mapa"}
              </button>
            )}
            <span className="flex gap-1.5">
              <Button type="submit" size="sm" className={PRI} disabled={!nuevo.que.trim() || !nuevo.hacia}>Agregar</Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => { setNuevo(null); if (ubicar === "nuevo") setUbicar(null); }}>Cancelar</Button>
            </span>
          </form>
        ) : (
          <Button variant="outline" size="sm" className="mt-2" onClick={() => setNuevo({ que: "", hacia: null })}><Plus /> Pedido</Button>
        ))}
      </section>

      <section aria-label="Dónde están las obras" className="rounded-lg border bg-card p-3">
        <h2 className="mb-2 flex items-baseline justify-between gap-2 text-[17px] font-bold">
          Dónde están las obras <span className="text-xs font-medium text-muted-foreground">{ubicar ? "tocá para ubicar el pedido" : "tocá una"}</span>
        </h2>
        <MiniMapa puntos={puntos} onTocar={onFoco} colocar={colocar} />
        {puntos.length === 0 && <p className="mt-1.5 text-xs text-muted-foreground">Las obras de este día no tienen coordenadas.</p>}
      </section>

      {menu?.t === "lugar" && (
        <ElegirLugar
          dia={dia}
          anchor={menu.el}
          label="Adónde va el pedido"
          onCerrar={() => setMenu(null)}
          onElegir={(hacia) => {
            const id = menu.id;
            setMenu(null);
            if (id === "nuevo") setNuevo((n) => (n ? { ...n, hacia } : n));
            else pedido({ accion: "editar", pedidoId: id, hacia });
          }}
        />
      )}
      {menu?.t === "lleva" && pMenu && <MenuLleva p={pMenu} m={menu} onCerrar={() => setMenu(null)} onPaso={(paso) => setMenu({ ...menu, paso })} />}
      {menu?.t === "mas" && pMenu && (
        <MenuMas
          p={pMenu}
          m={menu}
          onCerrar={() => setMenu(null)}
          onPaso={(paso) => setMenu({ ...menu, paso })}
          onLugar={(el) => setMenu({ t: "lugar", id: pMenu.id, el })}
          onFlete={(el) => setMenu({ t: "lleva", id: pMenu.id, el, paso: "flete" })}
          onUbicar={() => { setMenu(null); setUbicar(pMenu.id); }}
        />
      )}
    </aside>
  );
}

/** Una tarjeta de pedido: se arrastra (o se toca y se toca el camión) a un camión. */
function FichaPedido({ p, avisos, ubicando, onLleva, onMas }: {
  p: Pedido;
  avisos: { t: string; nivel: string; bs: Boton[] }[];
  ubicando: boolean;
  onLleva: (el: HTMLElement) => void;
  onMas: (el: HTMLElement) => void;
}) {
  const ctx = usePizarron();
  const { dia, ahora } = ctx;
  const st = estadoPedido(dia, p, ahora);
  const hecho = st.k === "hecho";
  const id = `q:${p.id}`;
  const { ref, attributes, listeners, arrastrando } = useFicha(id, { k: "pedido", id: p.id }, null, ctx.soloLectura || hecho);
  const elegida = ctx.sel?.k === id;
  const v = p.viajeId ? dia.viajes.find((x) => x.id === p.viajeId && x.estado !== "anulado") ?? null : null;
  const vc = v?.vehiculoId ? viajeCalc(dia, v.id) : null;
  const L = lugar(dia, p.hacia);
  const estado = hecho ? `hecho${st.v.hechoMin != null ? ` ${hm(st.v.hechoMin)}` : ""}`
    : st.k === "esperando" ? `esperando${p.esperandoMotivo ? `: ${p.esperandoMotivo.toLowerCase()}` : ""}${p.esperandoHastaMin != null ? ` · hasta ${hm(p.esperandoHastaMin)}` : ""}`
    : v?.fleteExterno ? `flete de ${v.fleteExterno}`
    : v ? [vehTxt(dia, v.vehiculoId), nombreDe(dia, choferDe(dia, v)) || "sin chofer", vc ? horaTxt(vc) : null].filter(Boolean).join(" · ")
    : "sin camión";
  return (
    <li
      ref={ref}
      {...attributes}
      {...listeners}
      data-flip={id}
      data-pedido={p.id}
      onClick={(e) => {
        e.stopPropagation();
        if (ctx.soloLectura || hecho) return;
        ctx.elegir({ k: "pedido", id: p.id }, id);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") { e.preventDefault(); (e.currentTarget as HTMLElement).click(); return; }
        (listeners as { onKeyDown?: (e: React.KeyboardEvent) => void } | undefined)?.onKeyDown?.(e);
      }}
      aria-label={`Pedido ${p.que} a ${L.n}, ${estado}. Arrastralo a un camión`}
      className={cn(
        "grid cursor-grab touch-manipulation grid-cols-[auto_minmax(0,1fr)_auto] gap-x-2 gap-y-1 rounded-md border bg-card px-2 py-2 shadow-xs outline-none select-none hover:border-foreground/40 focus-visible:ring-3 focus-visible:ring-ring/50",
        hecho && "cursor-default bg-muted shadow-none",
        elegida && "shadow-lg outline-[2.5px] outline-offset-1 outline-primary",
        arrastrando && "opacity-30",
        ctx.focoPedido === p.id && "ring-2 ring-primary",
        ubicando && "ring-2 ring-hd-ambar",
      )}
    >
      <span className="mt-0.5 text-muted-foreground">
        {hecho ? <Check className="size-4 text-hd-verde" /> : st.k === "esperando" ? <Clock className="size-4" /> : v ? <Truck className="size-4" /> : <Package className="size-4" />}
      </span>
      <span className="grid min-w-0 gap-0.5">
        <span className={cn("text-[13.5px] leading-tight font-semibold [overflow-wrap:anywhere]", hecho && "text-muted-foreground line-through")}>{p.que}</span>
        <span className="text-xs text-muted-foreground">
          {L.n}{esTexto(p.hacia) && L.lat == null && !hecho ? " (sin ubicar)" : ""} · <span className={cn(st.k === "sin" && "font-semibold text-hd-ambar")}>{estado}</span>
        </span>
      </span>
      {!ctx.soloLectura && !hecho ? (
        <button
          type="button"
          data-no-drag=""
          onClick={(e) => { e.stopPropagation(); onMas(e.currentTarget); }}
          aria-label={`Más opciones de ${p.que}`}
          className="grid size-7 place-items-center rounded text-muted-foreground hover:bg-muted"
        >
          <MoreHorizontal className="size-4" />
        </button>
      ) : <span />}
      {!ctx.soloLectura && !hecho && !v?.fleteExterno && (
        <button
          type="button"
          data-no-drag=""
          onClick={(e) => { e.stopPropagation(); onLleva(e.currentTarget); }}
          className="col-start-2 flex min-h-7 items-center gap-1.5 justify-self-start rounded-[5px] border border-dashed border-foreground/25 bg-card px-1.5 text-xs font-semibold hover:border-foreground"
        >
          <Route className="size-3.5" /> {v ? "Cambiar de camión" : "¿Quién pasa cerca?"}
        </button>
      )}
      {avisos.map((a, i) => (
        <div key={i} className={cn("col-span-3 grid gap-1 rounded border-l-[3px] px-2 py-1 text-xs", a.nivel === "rojo" ? "border-hd-rojo bg-hd-rojo/5" : "border-hd-ambar bg-hd-ambar-bg")}>
          <span className="leading-snug">{a.t}</span>
          {!ctx.soloLectura && a.bs.length > 0 && (
            <span className="flex flex-wrap gap-1">
              {a.bs.map((b, j) => (
                <button
                  key={j}
                  type="button"
                  data-no-drag=""
                  onClick={(e) => {
                    e.stopPropagation();
                    const el = e.currentTarget;
                    // Los del pedido se abren acá; el resto (llamar, avisar) como en las columnas.
                    if (b.a === "poner") onLleva(el);
                    else if (b.a === "esperar") onMas(el);
                    else if (b.a === "fleteDe") onLleva(el);
                    else ctx.boton(b, el);
                  }}
                  className="rounded border bg-card px-1.5 py-0.5 font-semibold hover:border-foreground"
                >
                  {b.l}
                </button>
              ))}
            </span>
          )}
        </div>
      ))}
    </li>
  );
}

/** "¿Quién lo lleva?": los camiones por desvío (los libres al final), sacarlo del camión y el flete de afuera. */
function MenuLleva({ p, m, onCerrar, onPaso }: { p: Pedido; m: Extract<Menu, { t: "lleva" }>; onCerrar: () => void; onPaso: (paso: "flete") => void }) {
  const ctx = usePizarron();
  const { dia, ahora } = ctx;
  const q = useMemo(() => quienPasaCerca(dia, p, ahora), [dia, p, ahora]);
  const v = p.viajeId ? dia.viajes.find((x) => x.id === p.viajeId && x.estado === "planeado") ?? null : null;
  const [quien, setQuien] = useState("");
  const [hora, setHora] = useState(ahora >= 0 && ahora < 1440 ? hm5(Math.max(ahora + 30, 7 * 60)) : "8:00");
  const [mal, setMal] = useState(false);

  if (m.paso === "flete") {
    const ok = () => {
      const h = horaDe(hora);
      if (!h) return setMal(true);
      onCerrar();
      ctx.ejecutar([{ k: "viaje", a: { accion: "crear", fecha: dia.fecha, fleteExterno: quien.trim() || "Flete", tipo: p.tipo, hacia: p.hacia, hora: h, carga: `${p.que} · ${lugar(dia, p.hacia).n}`, pedidoId: p.id } }]);
    };
    return (
      <MenuFlotante anchor={m.el} onCerrar={onCerrar} label="Flete de afuera" ancho={300}>
        <MenuCabeza titulo="Flete de afuera" sub={`${p.que} → ${lugar(dia, p.hacia).n}`} />
        <MenuTexto>Lo hace un tercero: el pedido queda «en camino · flete de …» y el parte lo toma como tercerizado.</MenuTexto>
        <div className="grid gap-1.5 px-1 py-1">
          <input autoFocus data-mi="" value={quien} onChange={(e) => setQuien(e.target.value)} placeholder="Quién (ej. semi de Fernando)" aria-label="Quién lo hace" className="h-9 rounded-md border border-input bg-card px-2 text-[13px]" />
          <span className="flex flex-wrap items-start gap-1.5">
            <InputHora value={hora} mal={mal} aria-label="Hora" onChange={(x) => { setHora(x); setMal(false); }} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); ok(); } }} />
            <Button type="button" className={`h-9 ${PRI}`} onClick={ok}>Agregar</Button>
          </span>
        </div>
      </MenuFlotante>
    );
  }
  const poner = (veh: string) => {
    onCerrar();
    ctx.soltarEn({ k: "pedido", id: p.id }, { k: "camion", veh, filaId: null, c: null });
  };
  return (
    <MenuFlotante anchor={m.el} onCerrar={onCerrar} label="Quién lo lleva" ancho={340}>
      <MenuCabeza titulo={`¿Quién pasa cerca de ${q.donde}?`} sub={p.que} />
      {q.si.map((x, i) => (
        <ItemMenu key={x.veh} disabled={v?.vehiculoId === x.veh} onClick={() => poner(x.veh)} detalle={x.min != null ? <span className={cn("font-mono font-semibold", i === 0 && !x.libre && "text-hd-verde")}>{desvioTxt(x.min)}</span> : undefined}>
          <span className="grid min-w-0">
            <b className="truncate font-semibold">{vehTxt(dia, x.veh)}{v?.vehiculoId === x.veh ? " · lo lleva" : ""}</b>
            <small className="truncate text-xs text-muted-foreground">{x.linea}</small>
          </span>
        </ItemMenu>
      ))}
      {q.no.map((x) => (
        <ItemMenu key={x.veh} disabled detalle="no sirve">
          <span className="grid min-w-0"><b className="truncate font-semibold">{vehTxt(dia, x.veh)}</b><small className="truncate text-xs text-muted-foreground">{x.t}</small></span>
        </ItemMenu>
      ))}
      {!esTexto(p.hacia) || lugar(dia, p.hacia).lat != null ? null : <MenuTexto>Sin ubicar en el mapa: no se puede medir el desvío.</MenuTexto>}
      {v && <ItemMenu onClick={() => { onCerrar(); ctx.ejecutar([{ k: "viaje", a: { accion: "volver_a_cola", viajeId: v.id } }]); }}>Sacarlo del camión</ItemMenu>}
      <ItemMenu detalle="›" onClick={() => onPaso("flete")}>Flete de afuera…</ItemMenu>
    </MenuFlotante>
  );
}

/** El ⋯ de un pedido: corregir, adónde, ubicar en el mapa, esperar, pasar a mañana, ya no hace falta. */
function MenuMas({ p, m, onCerrar, onPaso, onLugar, onFlete, onUbicar }: {
  p: Pedido;
  m: Extract<Menu, { t: "mas" }>;
  onCerrar: () => void;
  onPaso: (paso: "esperar" | "anular" | "corregir") => void;
  onLugar: (el: HTMLElement) => void;
  onFlete: (el: HTMLElement) => void;
  onUbicar: () => void;
}) {
  const ctx = usePizarron();
  const { dia } = ctx;
  const motivos = dia.parametros.motivosEsperar;
  const [mot, setMot] = useState<string | null>(motivos[0] ?? null);
  const [hora, setHora] = useState("15:00");
  const [mal, setMal] = useState(false);
  const [que, setQue] = useState(p.que);
  const pedido = (a: AccionPedido) => { onCerrar(); ctx.ejecutar([{ k: "pedido", a }]); };
  const L = lugar(dia, p.hacia);

  if (m.paso === "corregir") {
    return (
      <MenuFlotante anchor={m.el} onCerrar={onCerrar} label="Corregir el pedido" ancho={300}>
        <MenuCabeza titulo="Corregir" sub={`→ ${L.n}`} />
        <form className="flex gap-1.5 px-1 py-1" onSubmit={(e) => { e.preventDefault(); if (que.trim() && que.trim() !== p.que) pedido({ accion: "editar", pedidoId: p.id, que: que.trim() }); else onCerrar(); }}>
          <input autoFocus data-mi="" value={que} onChange={(e) => setQue(e.target.value)} maxLength={120} aria-label="Qué" className="h-9 min-w-0 flex-1 rounded-md border border-input bg-card px-2 text-[13px]" />
          <Button type="submit" className={`h-9 ${PRI}`}>Listo</Button>
        </form>
      </MenuFlotante>
    );
  }
  if (m.paso === "esperar") {
    const ok = () => {
      const h = hora.trim() ? horaDe(hora) : null;
      if (hora.trim() && !h) return setMal(true);
      if (!mot) return;
      pedido({ accion: "esperar", pedidoId: p.id, motivo: mot, hasta: h });
    };
    return (
      <MenuFlotante anchor={m.el} onCerrar={onCerrar} label="Esperar" ancho={300}>
        <MenuCabeza titulo="Esperar…" sub={`${p.que} → ${L.corto}`} />
        <div className="px-2 pt-1 text-xs font-medium text-muted-foreground">¿Por qué espera?</div>
        <Chips opciones={motivos} valor={mot} onChange={setMot} label="Motivo" />
        <div className="px-2 pt-1 text-xs font-medium text-muted-foreground">¿Hasta qué hora?</div>
        <div className="flex flex-wrap items-start gap-1.5 px-1 py-1">
          <InputHora value={hora} mal={mal} aria-label="Hasta" onChange={(v) => { setHora(v); setMal(false); }} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); ok(); } }} />
          <Button type="button" className={`h-9 ${PRI}`} disabled={!mot} onClick={ok}>Esperar</Button>
        </div>
      </MenuFlotante>
    );
  }
  if (m.paso === "anular") {
    return (
      <MenuFlotante anchor={m.el} onCerrar={onCerrar} label="Ya no hace falta" ancho={280}>
        <MenuCabeza titulo="Ya no hace falta" sub={p.que} />
        {MOTIVOS_ANULAR.map((x) => <ItemMenu key={x} onClick={() => pedido({ accion: "anular", pedidoId: p.id, motivo: x })}>{x}</ItemMenu>)}
      </MenuFlotante>
    );
  }
  return (
    <MenuFlotante anchor={m.el} onCerrar={onCerrar} label="Opciones del pedido" ancho={300}>
      <MenuCabeza titulo={p.que} sub={`→ ${L.n}${p.pidioTexto ? ` · pidió ${p.pidioTexto}` : p.pidioId ? ` · pidió ${nombreDe(dia, p.pidioId)}` : ""}`} />
      {p.nota && <MenuTexto>{p.nota}</MenuTexto>}
      <ItemMenu detalle="›" onClick={() => onPaso("corregir")}>Corregir qué es</ItemMenu>
      <ItemMenu detalle="›" onClick={() => onLugar(m.el)}>Cambiar adónde va</ItemMenu>
      {esTexto(p.hacia) && <ItemMenu detalle={L.lat != null ? "corregir el pin" : "sin ubicar"} onClick={onUbicar}>Ubicar en el mapa</ItemMenu>}
      {p.estado !== "esperando" ? <ItemMenu detalle="›" onClick={() => onPaso("esperar")}>Esperar…</ItemMenu>
        : <ItemMenu onClick={() => pedido({ accion: "ya_esta", pedidoId: p.id })}>Ya está (dejar de esperar)</ItemMenu>}
      <ItemMenu detalle="queda primero" onClick={() => pedido({ accion: "pasar_a_manana", pedidoId: p.id })}>Pasar a mañana</ItemMenu>
      {!p.viajeId && <ItemMenu detalle="›" onClick={() => onFlete(m.el)}>Flete de afuera…</ItemMenu>}
      <ItemMenu rojo detalle="›" onClick={() => onPaso("anular")}>Ya no hace falta…</ItemMenu>
    </MenuFlotante>
  );
}
