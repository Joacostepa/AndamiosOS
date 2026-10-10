"use client";

// Una fila por camión (§9): a la izquierda quién lo maneja, la patente y dónde anda en
// palabras; a la derecha los viajes como fichas sobre una línea de tiempo aproximada de
// 7 a 18 (el ancho es la duración típica, no la real). La línea coral es "ahora".
//
// La misma información en LISTA (tecla L, o sola en pantallas angostas): la línea de tiempo
// sirve para ver huecos; la lista, para leer. En el celular no se arrastra: todo con toques.

import { useMemo, useRef, useState } from "react";
import { Check, MoreHorizontal, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  avisosChofer, avisosVeh, calcVeh, camionesQueSirven, cap, choferDelCamion, cNombre, cortoV, cTag, dondeAnda, estadoEnvio,
  fletesDeAfuera, haciaDe, hm, hm5, horaTxt, kmTxt, lowFirst, lugar, nombreDe, obrasCon, sinCamionDe, textoViaje, toMin,
  todoVeh, vehiculo, viajeSinAvisar, type Aviso, type CamionesQueSirven, type ViajeCalc, hojaDeCuadrilla,
} from "@/lib/hoja-dia/estado";
import { filasOrden, ordenEnFila } from "@/lib/hoja-dia/camiones";
import type { DiaHoja, Viaje } from "@/lib/hoja-dia/tipos";
import { arrastre, TIPO_ARRASTRE, useCamiones } from "./contexto";
import { LineaAviso } from "./botones";

export const T0 = 7 * 60;
export const T1 = 18 * 60;
const SPAN = T1 - T0;
const xp = (t: number) => Math.max(0, Math.min(100, ((t - T0) / SPAN) * 100));
const wp = (m: number) => (m / SPAN) * 100;
const HORAS = Array.from({ length: 12 }, (_, i) => T0 + i * 60);

// Color por tipo (los mismos tokens del tablero, que ya tienen su versión oscura).
const TIPO_CLS: Record<string, string> = {
  cuadrilla: "bg-[var(--tb-azul-bg)] text-[var(--tb-azul-text)] border-[color-mix(in_oklch,var(--tb-azul-text)_30%,transparent)]",
  material: "bg-[var(--tb-teal-bg)] text-[var(--tb-teal-text)] border-[color-mix(in_oklch,var(--tb-teal-text)_30%,transparent)]",
  trae: "bg-[var(--tb-ambar-bg)] text-[var(--tb-ambar-text)] border-[color-mix(in_oklch,var(--tb-ambar-text)_30%,transparent)]",
  compra: "bg-[var(--tb-violeta-bg)] text-[var(--tb-violeta-text)] border-[color-mix(in_oklch,var(--tb-violeta-text)_30%,transparent)]",
  neutro: "bg-[var(--tb-neutro-bg)] text-[var(--tb-neutro-text)] border-[color-mix(in_oklch,var(--tb-neutro-text)_30%,transparent)]",
};
const claseTipo = (v: Viaje) =>
  v.fleteExterno ? TIPO_CLS.neutro
    : v.tipo === "lleva" || v.tipo === "busca" || v.tipo === "mueve" ? TIPO_CLS.cuadrilla
    : v.tipo === "lleva_material" || v.tipo === "entre_depositos" ? TIPO_CLS.material
    : v.tipo === "trae_material" ? TIPO_CLS.trae
    : v.tipo === "compra" ? TIPO_CLS.compra
    : TIPO_CLS.neutro;

const TONO_DA = { "": "text-muted-foreground", ok: "text-hd-verde", amb: "font-semibold text-hd-ambar", rojo: "font-semibold text-hd-rojo" } as const;

/** Las iniciales de quien marcó "Hecho" por el chofer ("Juan Agustín" → "JA"). */
const iniciales = (s: string) => s.split(/\s+/).filter(Boolean).map((x) => x[0]!.toUpperCase()).join("").slice(0, 3);

/** Un viaje sin camión ("Sin camión") o de un flete, con lo mínimo para dibujarlo como ficha. */
function comoCalc(dia: DiaHoja, v: Viaje, i: number): ViajeCalc {
  const haciaEf = haciaDe(dia, v);
  const t = toMin(v.hora) ?? toMin(v.noAntesDe) ?? T0;
  const dur = v.duracionMin ?? dia.parametros.duracionViaje[v.tipo] ?? 60;
  return { ...v, i, haciaEf, haciaKey: lugar(dia, haciaEf).key, desdeKey: "", t, fin: t + dur, dur, conflicto: null, finParada: t + dur };
}

export function FilasCamiones() {
  const { dia, ahora, hoy, lista, angosta, poner, pasado, abrirFlete } = useCamiones();
  const f = useMemo(() => filasOrden(dia), [dia]);
  const ped = poner ? dia.pedidos.find((p) => p.id === poner) ?? null : null;
  const q = useMemo(() => (ped ? camionesQueSirven(dia, ped, ahora) : null), [dia, ped, ahora]);
  const sinCam = useMemo(() => sinCamionDe(dia), [dia]);
  const fletes = useMemo(() => fletesDeAfuera(dia), [dia]);
  const verLista = lista || angosta;
  const nowOn = hoy && ahora >= T0 && ahora <= T1;

  return (
    <section
      aria-label={`Camiones del ${dia.fecha}`}
      className="relative min-w-0 rounded-xl border bg-card [--namew:214px]"
      data-lista={verLista || undefined}
    >
      {/* Eje de horas: pegado arriba mientras se baja. */}
      <div className={cn("sticky top-0 z-[6] grid grid-cols-[var(--namew)_minmax(0,1fr)] rounded-t-xl border-b bg-card", angosta && "grid-cols-1")}>
        <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground">
          {hoy ? (
            <>
              Ahora <b className="text-[13px] font-semibold text-hd-ctx tabular-nums">{hm(ahora)}</b>
            </>
          ) : (
            "Camión"
          )}
        </div>
        {!angosta && (
          <div className={cn("relative h-[30px]", verLista && "invisible")} aria-hidden>
            {HORAS.map((t) => (
              <span key={t} className="absolute top-1.5 -translate-x-1/2 text-[11.5px] text-muted-foreground tabular-nums" style={{ left: `${xp(t)}%` }}>
                {t / 60}
              </span>
            ))}
            <span className="absolute top-1.5 -translate-x-1/2 text-[11.5px] text-muted-foreground tabular-nums" style={{ left: "100%" }}>18</span>
            {nowOn && (
              <span className="absolute top-1 z-[7] -translate-x-1/2 rounded bg-primary px-1.5 text-[11px] font-bold text-primary-foreground tabular-nums" style={{ left: `${xp(ahora)}%` }}>
                {hm(ahora)}
              </span>
            )}
          </div>
        )}
      </div>

      {sinCam.length > 0 && <FilaSinCamion viajes={sinCam} />}
      {f.conViajes.map((veh) => <Fila key={veh} veh={veh} q={q} />)}
      {f.todo.map((veh) => <Fila key={veh} veh={veh} q={q} />)}

      {f.sinUsar.length > 0 && (
        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 border-b px-3 py-2.5 text-[13px] text-muted-foreground">
          <b className="font-semibold text-foreground">Sin usar:</b>
          {f.sinUsar.map((s, i) => (
            <span key={s.veh}>
              <span className={cn(/^[A-Z]{1,3} ?\d{3} ?[A-Z]{0,3}$/.test(s.txt) && "font-mono text-[12px]")}>{s.txt}</span>
              {s.nota && <span className={cn(s.amb && "text-hd-ambar")}> ({s.nota})</span>}
              {i < f.sinUsar.length - 1 && <span aria-hidden> ·</span>}
            </span>
          ))}
        </div>
      )}

      {/* Fletes de afuera: la última fila (§6). */}
      <div id="row-flete" className={cn("grid grid-cols-[var(--namew)_minmax(0,1fr)]", (verLista || angosta) && "grid-cols-1")}>
        <div className={cn("grid content-start gap-0.5 px-3 py-2", !angosta && "border-r")}>
          <div className="text-[13.5px] font-semibold">Fletes de afuera</div>
          <div className="text-xs text-muted-foreground">{fletes.length ? fletes.map((v) => v.fleteExterno).join(" · ") : "Ninguno"}</div>
          {!pasado && (
            <div className="mt-1">
              <Button type="button" variant="outline" size="xs" className="max-md:h-9 max-md:text-sm" onClick={() => abrirFlete()}>
                <Plus /> Flete de afuera
              </Button>
            </div>
          )}
        </div>
        {!verLista && !angosta && (
          <Pista>
            {fletes.map((v) => <Ficha key={v.id} v={v} cur={null} conflictos={[]} sinAv={[]} />)}
          </Pista>
        )}
        {(verLista || angosta) && <ListaViajes ts={fletes} cur={null} sinAv={[]} />}
      </div>
    </section>
  );
}

/** El fondo de la línea de tiempo: cuadrícula por hora y la línea coral de "ahora". */
function Pista({ children }: { children: React.ReactNode }) {
  const { hoy, ahora } = useCamiones();
  return (
    <div className="relative my-2 min-h-[46px]">
      {HORAS.map((t) => <span key={t} aria-hidden className="absolute -top-2 -bottom-2 w-px bg-border" style={{ left: `${xp(t)}%` }} />)}
      {hoy && ahora >= T0 && ahora <= T1 && <div aria-hidden className="pointer-events-none absolute -top-2 -bottom-2 z-[5] w-0.5 bg-primary" style={{ left: `${xp(ahora)}%` }} />}
      {children}
    </div>
  );
}

function Fila({ veh, q }: { veh: string; q: CamionesQueSirven | null }) {
  const ctx = useCamiones();
  const { dia, ahora, hoy, pasado, lista, angosta, abrirMenu, ponerEn, moverViaje } = ctx;
  const ch = choferDelCamion(dia, veh);
  const V = vehiculo(dia, veh)!;
  const ts = calcVeh(dia, veh);
  const td = todoVeh(dia, veh);
  const avs: Aviso[] = useMemo(() => [...avisosVeh(dia, veh, ahora), ...(ch ? avisosChofer(dia, ch, ahora) : [])], [dia, veh, ch, ahora]);
  const conflictos = avs.filter((x) => x.nivel === "rojo").flatMap((x) => x.ids ?? []).filter((x): x is string => !!x);
  const sinAv = ts.filter((v) => viajeSinAvisar(dia, v)).map((v) => v.id);
  const cur0 = hoy ? ts.find((v) => v.estado === "planeado") : null;
  const cur = cur0 && cur0.t <= ahora + 60 ? cur0 : null;
  const da = dondeAnda(dia, veh, ahora);
  const pend = ch ? estadoEnvio(dia, { pid: ch, rol: "chofer" }) : null;
  const nCambios = pend?.k === "cambiada" ? pend.ds.length : 0;
  const verLista = lista || angosta;

  const k = q ? q.orden.findIndex((x) => x.veh === veh) : -1;
  const sug = k >= 0 ? q!.orden[k] : null;
  const no = q && k < 0 ? q.no.find((x) => x.veh === veh) ?? null : null;

  // Soltar: la marca de posición sigue al puntero; al soltar, el orden entre las fichas vecinas.
  const pista = useRef<HTMLDivElement>(null);
  const [marca, setMarca] = useState<number | null>(null);
  const [sobre, setSobre] = useState(false);
  const minDe = (x: number) => {
    const r = pista.current?.getBoundingClientRect();
    if (!r || !r.width) return null;
    return T0 + Math.max(0, Math.min(1, (x - r.left) / r.width)) * SPAN;
  };
  const puedeSoltar = !pasado && !angosta;
  const dropRow: React.HTMLAttributes<HTMLDivElement> = puedeSoltar
    ? {
        onDragOver: (e) => {
          if (!arrastre.actual()) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          setSobre(true);
          const m = verLista ? null : minDe(e.clientX);
          setMarca(m);
        },
        onDragLeave: (e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) { setSobre(false); setMarca(null); }
        },
        onDrop: (e) => {
          const a = arrastre.actual();
          setSobre(false);
          setMarca(null);
          if (!a) return;
          e.preventDefault();
          arrastre.terminar();
          const m = verLista ? null : minDe(e.clientX);
          if (a.k === "ped") {
            const p = dia.pedidos.find((x) => x.id === a.id);
            // Sobre una ficha que va al mismo lugar: se suma a ese viaje.
            const fichaId = (e.target as HTMLElement).closest<HTMLElement>("[data-viaje]")?.dataset.viaje;
            const fv = fichaId ? ts.find((v) => v.id === fichaId) : null;
            if (p && fv && fv.estado === "planeado" && fv.haciaKey === lugar(dia, p.hacia).key) return ponerEn(veh, null, fv.id, a.id);
            ponerEn(veh, m != null ? ordenEnFila(dia, veh, m) : null, null, a.id);
          } else moverViaje(a.id, veh, m);
        },
      }
    : {};

  const band = td != null ? (() => {
    const h = hojaDeCuadrilla(dia, td)!;
    const a = toMin(h.encuentro.hora) ?? T0;
    const b = toMin(dia.parametros.finJornada) ?? 17 * 60;
    return (
      <div
        className="absolute top-1 z-[1] grid h-[38px] content-center overflow-hidden rounded-[7px] border border-input px-2 text-xs"
        style={{ left: `${xp(a)}%`, width: `${wp(b - a)}%`, background: "repeating-linear-gradient(135deg, var(--muted) 0 8px, var(--hd-card2) 8px 16px)" }}
      >
        <b className="truncate font-semibold">Todo el día con la {cNombre(dia, td)}</b>
        <span className="truncate text-muted-foreground">{obrasCon(dia, td).map((o) => o.o.corto).join(" · ")}</span>
      </div>
    );
  })() : null;

  return (
    <div
      id={`row-${veh}`}
      data-row={veh}
      {...dropRow}
      className={cn(
        "relative grid min-h-[54px] grid-cols-[var(--namew)_minmax(0,1fr)] border-b",
        (verLista || angosta) && "grid-cols-1",
        verLista && !angosta && "grid-cols-[var(--namew)_minmax(0,1fr)]",
        q && (sug ? "bg-[color-mix(in_oklch,var(--hd-verde)_8%,transparent)]" : "[&>*:not(.r-av)]:opacity-50"),
        sobre && "shadow-[inset_0_0_0_2px_var(--primary)]",
      )}
    >
      <div className={cn("relative grid min-w-0 content-start gap-px py-1.5 pr-1.5 pl-3", !angosta && "border-r")}>
        <div className="flex flex-wrap items-baseline gap-x-1.5 pr-8 text-[13.5px] font-semibold">
          {ch ? nombreDe(dia, ch) : "Sin chofer"}
          <span className="font-mono text-xs font-medium text-muted-foreground">{V.patente}</span>
          <span className="text-xs font-medium text-muted-foreground">{V.tipo === "hidrogrua" ? "hidrogrúa" : V.marca}</span>
        </div>
        <div className={cn("line-clamp-3 text-xs leading-snug", TONO_DA[da.tono])}>{da.t}</div>
        {sug && (
          <>
            <div className="flex min-w-0 items-center gap-1.5 text-xs text-hd-verde">
              <span className="grid size-[18px] flex-none place-items-center rounded-[5px] bg-[color-mix(in_oklch,var(--hd-verde)_18%,transparent)] text-[11px] font-bold">{k + 1}</span>
              <span>
                {sug.por === "cerca" ? `Cerca: en ${cercaDonde(dia, sug.loc)}, a ${kmTxt(sug.km ?? 0)}` : sug.por === "libre" ? `Libre ${sug.libreDesde <= q!.ahora + 5 ? "ahora" : `~${hm(Math.ceil(sug.libreDesde / 5) * 5)}`}` : `Libre ~${hm5(sug.libreDesde)}`}
              </span>
            </div>
            <div className="mt-0.5">
              <Button type="button" variant="outline" size="xs" data-poner-aca={veh} data-k={k + 1} className="max-md:h-9 max-md:text-sm" onClick={() => ponerEn(veh)}>
                Poner acá
              </Button>
            </div>
          </>
        )}
        {no && (
          <>
            <div className="text-xs text-muted-foreground">{cap(no.t)}</div>
            {no.todo != null && (
              <div className="mt-0.5">
                <Button type="button" variant="ghost" size="xs" onClick={() => ponerEn(veh)}>Ponerlo igual…</Button>
              </div>
            )}
          </>
        )}
        {!q && !pasado && nCambios > 0 && ch && (
          <div className="mt-0.5">
            <Button type="button" variant="outline" size="xs" className="max-md:h-9 max-md:text-sm" onClick={() => ctx.avisar(ch)}>
              Avisar a {nombreDe(dia, ch)}{nCambios > 1 ? ` (${nCambios} cambios)` : ""}
            </Button>
          </div>
        )}
        {!q && !pasado && (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="absolute top-1 right-1 max-md:size-9"
            aria-label={`Más opciones del camión de ${ch ? nombreDe(dia, ch) : V.patente}`}
            aria-haspopup="menu"
            id={`fm-${veh}`}
            onClick={(e) => abrirMenu({ t: "fila", veh, anchor: e.currentTarget })}
          >
            <MoreHorizontal />
          </Button>
        )}
      </div>

      {!verLista && !angosta && (
        <div ref={pista} className="relative">
          <Pista>
            {band}
            {ts.map((v) => <Ficha key={v.id} v={v} cur={cur} conflictos={conflictos} sinAv={sinAv} />)}
            {marca != null && <div aria-hidden className="pointer-events-none absolute -top-1 -bottom-1 z-[8] w-0 border-l-2 border-dashed border-foreground" style={{ left: `${xp(marca)}%` }} />}
          </Pista>
        </div>
      )}
      {(verLista || angosta) && (
        <div className={cn(!angosta && "pt-2")}>
          {td != null && ts.length === 0 && <p className="px-3 pb-2.5 text-[13px] text-muted-foreground">Sin viajes.</p>}
          {(td == null || ts.length > 0) && <ListaViajes ts={ts} cur={cur} sinAv={sinAv} />}
        </div>
      )}
      {avs.length > 0 && (
        <div className="r-av col-span-full grid gap-[3px] px-3 pb-2">
          {avs.map((a) => <LineaAviso key={a.k} a={a} />)}
        </div>
      )}
    </div>
  );
}

const cercaDonde = (dia: DiaHoja, key: string) => {
  if (key === "dep") return "el depósito";
  const [t, id] = [key.slice(0, 1), key.slice(2)];
  const p = t === "o" ? { otId: Number(id), lugarId: null, texto: null } : t === "l" ? { otId: null, lugarId: id, texto: null } : { otId: null, lugarId: null, texto: id };
  return lugar(dia, p).n;
};

function Ficha({ v, cur, conflictos, sinAv }: { v: ViajeCalc; cur: ViajeCalc | null; conflictos: string[]; sinAv: string[] }) {
  const { dia, pasado, angosta, abrirMenu } = useCamiones();
  const vuelta = dia.parametros.minutosVueltaDeposito;
  const conVu = v.tipo === "trae_material" && v.vuelta;
  const w = wp((v.estado === "hecho" ? Math.max(20, v.dur) : v.dur) + (conVu ? vuelta : 0));
  const angostaF = w * 8.3 < 72;
  const c = v.cuadrillaOdooId ?? (v.hojaId ? dia.hojas.find((h) => h.id === v.hojaId)?.cuadrillaOdooId ?? null : null);
  const l1 = angostaF ? (c != null && (v.tipo === "lleva" || v.tipo === "busca" || v.tipo === "mueve") ? cTag(dia, c) : v.tipo === "taller" ? cortoV(dia, v) : lugar(dia, v.haciaEf).corto) : cortoV(dia, v);
  const sin = sinAv.includes(v.id);
  const l2 = v.estado === "hecho" ? `✓ ${hm(v.hechoMin ?? v.t)}${v.hechoPor && v.hechoPor !== "chofer" ? ` (${iniciales(v.hechoPor)})` : ""}` : v.estado === "no_pudo" ? `no pudo ${hm(v.hechoMin ?? v.t)}` : `${horaTxt(v)}${sin && !angostaF ? " · sin avisar" : ""}`;
  const tit = `${textoViaje(dia, v)} · ${v.estado === "hecho" ? `Hecho ${hm(v.hechoMin ?? v.t)}` : v.estado === "no_pudo" ? `No pudo: ${v.noPudoMotivo ?? ""}` : v.hora ? `a las ${v.hora}` : `estimada ${horaTxt(v)}`}`;
  const arrastrable = v.estado === "planeado" && !v.fleteExterno && !pasado && !angosta;
  return (
    <>
      <button
        type="button"
        id={`vf-${v.id}`}
        data-viaje={v.id}
        title={tit}
        aria-label={tit}
        aria-haspopup="menu"
        draggable={arrastrable}
        onDragStart={(e) => {
          arrastre.empezar({ k: "v", id: v.id });
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData(TIPO_ARRASTRE, JSON.stringify(arrastre.actual()));
        }}
        onDragEnd={() => { arrastre.terminar(); }}
        onClick={(e) => abrirMenu({ t: "viaje", id: v.id, anchor: e.currentTarget })}
        className={cn(
          "absolute top-1 z-[2] grid h-[38px] min-w-[26px] content-center overflow-hidden rounded-[7px] border px-1 py-0.5 text-left text-xs leading-tight outline-none focus-visible:ring-3 focus-visible:ring-ring/60",
          arrastrable ? "cursor-grab" : "cursor-pointer",
          claseTipo(v),
          v.estado === "hecho" && "border-border bg-muted text-muted-foreground",
          v.estado === "no_pudo" && "border-[color-mix(in_oklch,var(--hd-rojo)_50%,transparent)] bg-hd-rojo-bg text-hd-rojo",
          cur?.id === v.id && "z-[3] border-2 border-foreground shadow-[0_0_0_1px_var(--card)]",
          sin && "border-2 border-dashed",
          conflictos.includes(v.id) && "shadow-[0_0_0_2px_var(--hd-rojo)]",
        )}
        style={{ left: `${xp(v.t)}%`, width: `calc(${w}% - 2px)` }}
      >
        <span className={cn("truncate font-semibold", v.estado === "no_pudo" && "line-through")}>{l1}</span>
        <span className="overflow-hidden text-[11.5px] whitespace-nowrap tabular-nums opacity-85">{l2}</span>
      </button>
      {v.vuelta && !conVu && (
        <span aria-hidden className="absolute top-5 z-[1] h-2 border-t-2 border-dotted border-muted-foreground" style={{ left: `${xp(v.finParada)}%`, width: `${wp(vuelta)}%` }}>
          <span className="absolute top-1 right-0 text-[11px] whitespace-nowrap text-muted-foreground">→ depósito</span>
        </span>
      )}
    </>
  );
}

function ListaViajes({ ts, cur, sinAv }: { ts: ViajeCalc[]; cur: ViajeCalc | null; sinAv: string[] }) {
  const { dia, abrirMenu } = useCamiones();
  if (!ts.length) return <p className="px-3 pb-2.5 text-[13px] text-muted-foreground">Sin viajes.</p>;
  return (
    <ol className="grid gap-0.5 px-3 pb-2.5" aria-label="Viajes en orden">
      {ts.map((v) => {
        const sin = sinAv.includes(v.id);
        const conCarga = v.carga && !["lleva_material", "trae_material", "compra", "taller"].includes(v.tipo);
        const s = v.estado === "no_pudo" ? lowFirst(v.noPudoMotivo) : cur?.id === v.id ? "ahora" : sin ? "sin avisar" : v.vuelta ? `vuelve al depósito ~${hm5(v.finParada + 30)}` : "";
        return (
          <li key={v.id}>
            <button
              type="button"
              aria-haspopup="menu"
              onClick={(e) => abrirMenu({ t: "viaje", id: v.id, anchor: e.currentTarget })}
              className={cn(
                "grid w-full grid-cols-[20px_62px_minmax(0,1fr)_auto] items-baseline gap-2 rounded-md px-1 py-[3px] text-left text-[13px] outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 max-md:grid-cols-[18px_58px_minmax(0,1fr)] max-md:py-2 max-md:text-sm",
                v.estado === "hecho" && "text-muted-foreground",
                cur?.id === v.id && "bg-accent",
              )}
            >
              <span className="text-right text-xs text-muted-foreground tabular-nums">{v.i}</span>
              <span className={cn("font-semibold tabular-nums", !v.hora && v.estado === "planeado" && "font-medium text-muted-foreground")}>
                {v.estado === "hecho" ? <><Check className="inline size-3.5" aria-label="Hecho" /> {hm(v.hechoMin ?? v.t)}</> : v.estado === "no_pudo" ? <><X className="inline size-3.5" aria-label="No pudo" /> {hm(v.hechoMin ?? v.t)}</> : horaTxt(v)}
              </span>
              <span className={cn(v.estado === "no_pudo" && "text-hd-rojo line-through")}>
                {textoViaje(dia, v)}
                {conCarga && <span className="text-xs text-muted-foreground"> · {v.carga}</span>}
              </span>
              <span className={cn("text-xs whitespace-nowrap text-muted-foreground max-md:col-start-3 max-md:whitespace-normal", sin && "font-semibold text-hd-ambar")}>{s}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/** Los "lleva" y "busca" de las hojas que quedaron sin camión (§9 Avisos: "Nadie busca a la Cuadrilla 3"). */
function FilaSinCamion({ viajes }: { viajes: Viaje[] }) {
  const { dia, lista, angosta, pasado } = useCamiones();
  const verLista = lista || angosta;
  const ts = viajes.map((v, i) => comoCalc(dia, v, i + 1));
  return (
    <div id="row-sin" className={cn("grid grid-cols-[var(--namew)_minmax(0,1fr)] border-b", angosta && "grid-cols-1")}>
      <div className={cn("grid content-start gap-px px-3 py-1.5", !angosta && "border-r")}>
        <div className="text-[13.5px] font-semibold">Sin camión</div>
        <div className="text-xs font-semibold text-hd-rojo">{ts.length === 1 ? "1 viaje" : `${ts.length} viajes`} de las hojas sin quién lo haga</div>
      </div>
      {!verLista && !angosta ? (
        <Pista>{ts.map((v) => <Ficha key={v.id} v={v} cur={null} conflictos={[v.id]} sinAv={[]} />)}</Pista>
      ) : (
        <ListaViajes ts={ts} cur={null} sinAv={[]} />
      )}
      <div className="col-span-full grid gap-[3px] px-3 pb-2">
        {ts.map((v) => {
          const c = v.cuadrillaOdooId ?? dia.hojas.find((h) => h.id === v.hojaId)?.cuadrillaOdooId ?? null;
          return (
            <LineaAviso
              key={v.id}
              a={{
                k: `nadie-${v.id}`, nivel: "rojo",
                t: `Nadie ${v.tipo === "busca" ? "busca" : "lleva"} a la ${cNombre(dia, c)} ${v.tipo === "busca" ? "en" : "a"} ${lugar(dia, v.haciaEf).n}${v.hora ? ` (${v.hora})` : ""}`,
                bs: pasado ? [] : [{ l: "Elegir chofer", a: "elegirChoferViaje", id: v.id }, ...(v.tipo === "busca" && c != null ? [{ l: "Vuelven por su cuenta", a: "vuelvenSolos", c }] : [])],
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
