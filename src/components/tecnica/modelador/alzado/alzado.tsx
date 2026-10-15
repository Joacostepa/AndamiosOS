"use client";

// Alzado SVG de la estructura seleccionada, dibujado desde el esqueleto resuelto y las celdas
// del Resultado: la cara elegida (exterior por defecto) desplegada en un plano, con diagonales
// roseta a roseta, plataformas, barandas, aberturas y cerramientos. Clic selecciona la celda
// (Shift suma), arrastrar elige un rectángulo, N1…/V1… eligen un nivel o un vano entero, la rueda hace
// zoom y Alt+arrastrar mueve. Con el pincel se pinta arrastrando. Los textos van a tamaño fijo en pantalla.

import { useEffect, useMemo, useRef, useState } from "react";
import type { CeldaResuelta, Diseno, EstructuraResuelta, Vano } from "@/lib/tecnica/modelo";
import { cn } from "@/lib/utils";
import { useEditor } from "../estado/store";
import { pintarDiseno } from "../estado/acciones";
import { fmt } from "../util/formato";

type Cara = Vano["cara"];
const NOMBRE_CARA: Record<Cara, string> = { exterior: "Exterior", interior: "Lado fachada", transversal: "Transversales", interna: "Internas" };

interface Tramo {
  vano: Vano;
  x0: number;
  x1: number;
  /** true si la cadena recorre el vano de a → b */
  directo: boolean;
}

/** Despliega los vanos de una cara en cadenas continuas (por columnas compartidas). */
function desplegar(r: EstructuraResuelta, cara: Cara): Tramo[] {
  const vanos = r.esqueleto.vanos.filter((v) => v.cara === cara);
  const usados = new Set<string>();
  const porCol = new Map<string, Vano[]>();
  for (const v of vanos) for (const c of [v.a, v.b]) porCol.set(c, [...(porCol.get(c) ?? []), v]);
  const out: Tramo[] = [];
  let x = 0;
  const pendientes = [...vanos];
  // arrancar por las puntas (columnas con un solo vano de esta cara)
  pendientes.sort((p, q) => {
    const gp = Math.min(porCol.get(p.a)?.length ?? 0, porCol.get(p.b)?.length ?? 0);
    const gq = Math.min(porCol.get(q.a)?.length ?? 0, porCol.get(q.b)?.length ?? 0);
    return gp - gq;
  });
  for (const ini of pendientes) {
    if (usados.has(ini.id)) continue;
    if (out.length) x += 1;
    let col = (porCol.get(ini.a)?.length ?? 0) <= (porCol.get(ini.b)?.length ?? 0) ? ini.a : ini.b;
    let v: Vano | undefined = ini;
    while (v && !usados.has(v.id)) {
      usados.add(v.id);
      const directo = v.a === col;
      out.push({ vano: v, x0: x, x1: x + v.medida, directo });
      x += v.medida;
      col = directo ? v.b : v.a;
      v = (porCol.get(col) ?? []).find((w) => !usados.has(w.id));
    }
  }
  return out;
}

const LETRAS = "ABCDEFGHIJKLMNOP";
const PX_TEXTO = 11;

/** «Frente A · vano 3 · nivel 2 (2,00–4,00 m)» en vez de la clave cruda. */
function nombreCelda(tramos: Tramo[], cotas: number[], clave: string, cara: Cara): string {
  const [vid, ks] = clave.split("@");
  const k = Number(ks);
  const i = tramos.findIndex((t) => t.vano.id === vid);
  const m = /^f(\d+)/.exec(vid);
  const dondeFrente = m ? `Frente ${LETRAS[Number(m[1])] ?? m[1]}` : NOMBRE_CARA[cara];
  const lo = cotas[k - 1];
  const hi = cotas[k];
  return `${dondeFrente} · vano ${i + 1} · banda ${k} (${fmt(lo)}–${fmt(hi)} m)`;
}

function useTamano(ref: React.RefObject<Element | null>) {
  const [t, setT] = useState({ w: 600, h: 200 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setT({ w: Math.max(1, e.contentRect.width), h: Math.max(1, e.contentRect.height) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return t;
}

export function Alzado({ className }: { className?: string; grande?: boolean }) {
  const res = useEditor((s) => s.res);
  const estId = useEditor((s) => s.sel.estructuraId);
  const celdasSel = useEditor((s) => s.sel.celdas);
  const hover = useEditor((s) => s.hover);
  const herramienta = useEditor((s) => s.herramienta);
  const overrides = useEditor((s) => s.diseno.estructuras.find((e) => e.id === s.sel.estructuraId)?.overrides);
  const r = res.estructuras.find((e) => e.id === estId) ?? null;
  const carasDisp = useMemo(() => {
    if (!r) return [] as Cara[];
    const set = new Set(r.esqueleto.vanos.map((v) => v.cara));
    return (["exterior", "interior", "transversal", "interna"] as Cara[]).filter((c) => set.has(c));
  }, [r]);
  const [caraElegida, setCara] = useState<Cara>("exterior");
  const cara = carasDisp.includes(caraElegida) ? caraElegida : carasDisp[0] ?? "exterior";
  const tramos = useMemo(() => (r ? desplegar(r, cara) : []), [r, cara]);
  const celdas = useMemo(() => {
    const m = new Map<string, CeldaResuelta>();
    for (const c of res.celdas) if (c.estructuraId === estId && c.tipo === "cara") m.set(c.id.slice(c.estructuraId.length + 1), c);
    return m;
  }, [res, estId]);
  const pintura = useRef<{ base: Diseno; celdas: Set<string> } | null>(null);
  const rect = useRef<{ i0: number; k0: number; add: string[]; movido: boolean } | null>(null);
  const paneo = useRef<{ x: number; y: number; vista: { cx: number; cy: number } } | null>(null);
  const caja = useRef<HTMLDivElement>(null);
  const tam = useTamano(caja);
  // zoom y paneo: z = 1 muestra todo; doble clic vuelve
  // la vista (zoom/paneo) vale para una estructura y una cara: al cambiar, vuelve a «ver todo»
  const claveVista = `${estId}|${cara}`;
  const [vistaSt, setVistaSt] = useState<{ clave: string; v: { z: number; cx: number; cy: number } } | null>(null);
  const vista = vistaSt?.clave === claveVista ? vistaSt.v : null;
  const setVista = (v: { z: number; cx: number; cy: number } | null) => setVistaSt(v ? { clave: claveVista, v } : null);

  if (!r) return <div className={cn("grid place-items-center text-xs text-muted-foreground", className)}>Elegí una estructura para ver su alzado.</div>;
  if (!tramos.length) return <div className={cn("grid place-items-center text-xs text-muted-foreground", className)}>Esta estructura no tiene caras para mostrar.</div>;

  const esq = r.esqueleto;
  const cols = new Map(esq.columnas.map((c) => [c.id, c]));
  const W = tramos[tramos.length - 1].x1;
  const H = Math.max(...esq.columnas.map((c) => c.yTope), 1);
  // márgenes en metros para los encabezados (N1… a la izquierda, V1… abajo)
  const ml = 1.4, mb = 0.9, mt = 0.3, mr = 0.3;
  const W0 = W + ml + mr;
  const H0 = H + mt + mb;
  const z = vista?.z ?? 1;
  const cx = vista?.cx ?? -ml + W0 / 2;
  const cy = vista?.cy ?? -(H + mt) + H0 / 2;
  // meet: la escala la pone el eje más justo
  const escala0 = Math.min(tam.w / W0, tam.h / H0);
  const ppm = escala0 * z; // píxeles por metro
  const vw = tam.w / ppm;
  const vh = tam.h / ppm;
  const vb = `${cx - vw / 2} ${cy - vh / 2} ${vw} ${vh}`;
  const upp = 1 / ppm; // metros por píxel
  const fs = PX_TEXTO * upp;
  const sw = upp;
  const sel = new Set(celdasSel);
  const pintando = herramienta === "pincel";
  const ks = esq.cotas.map((_, k) => k).filter((k) => k > 0);

  const celdasRango = (i0: number, i1: number, k0: number, k1: number): string[] => {
    const out: string[] = [];
    for (let i = Math.min(i0, i1); i <= Math.max(i0, i1); i++) for (let k = Math.min(k0, k1); k <= Math.max(k0, k1); k++) {
      const clave = `${tramos[i].vano.id}@${k}`;
      if (celdas.has(clave)) out.push(clave);
    }
    return out;
  };
  const elegir = (claves: string[], sumar: boolean) => {
    const s = useEditor.getState();
    s.seleccionar({ celdas: sumar ? [...new Set([...s.sel.celdas, ...claves])] : claves });
  };

  const empezar = (clave: string, i: number, k: number, e: React.PointerEvent) => {
    if (e.button !== 0 || e.altKey) return;
    const s = useEditor.getState();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    if (pintando && !s.soloLectura) {
      pintura.current = { base: s.diseno, celdas: new Set([clave]) };
      s.preview(pintarDiseno(s.diseno, s.res, r.id, [clave], s.pincel));
      return;
    }
    rect.current = { i0: i, k0: k, add: e.shiftKey ? celdasSel : [], movido: false };
    const celdasN = e.shiftKey ? (sel.has(clave) ? celdasSel.filter((c) => c !== clave) : [...celdasSel, clave]) : [clave];
    s.seleccionar({ celdas: celdasN });
  };
  const mover = (clave: string) => {
    const s = useEditor.getState();
    if (clave !== s.hover) s.setHover(clave);
    const p = pintura.current;
    if (p && !p.celdas.has(clave)) {
      p.celdas.add(clave);
      s.preview(pintarDiseno(p.base, s.res, r.id, [...p.celdas], s.pincel));
      return;
    }
    const q = rect.current;
    if (q) {
      const [vid, kk] = clave.split("@");
      const i = tramos.findIndex((t) => t.vano.id === vid);
      if (i < 0) return;
      if (i !== q.i0 || Number(kk) !== q.k0) q.movido = true;
      if (q.movido) s.seleccionar({ celdas: [...new Set([...q.add, ...celdasRango(q.i0, i, q.k0, Number(kk))])] });
    }
  };
  const terminar = () => {
    rect.current = null;
    paneo.current = null;
    const p = pintura.current;
    if (!p) return;
    pintura.current = null;
    const s = useEditor.getState();
    const d = pintarDiseno(p.base, s.res, r.id, [...p.celdas], s.pincel);
    if (d !== p.base) s.commit(d, `Pincel en ${p.celdas.size} celda${p.celdas.size === 1 ? "" : "s"}`, p.base);
    else s.preview(p.base);
  };
  /** Celda bajo el puntero (para el arrastre con captura, que no dispara enter en otras celdas). */
  const claveEn = (e: React.PointerEvent): string | null => {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    return el?.getAttribute("data-celda") ?? null;
  };
  const rueda = (e: React.WheelEvent) => {
    const f = e.deltaY < 0 ? 1.2 : 1 / 1.2;
    const nz = Math.max(1, Math.min(12, z * f));
    if (nz === z) return;
    // zoom alrededor del puntero
    const bx = caja.current!.getBoundingClientRect();
    const mx = cx - vw / 2 + ((e.clientX - bx.left) / tam.w) * vw;
    const my = cy - vh / 2 + ((e.clientY - bx.top) / tam.h) * vh;
    const k = z / nz;
    setVista(nz === 1 ? null : { z: nz, cx: mx + (cx - mx) * k, cy: my + (cy - my) * k });
  };
  // encabezados con separación mínima en píxeles (no se pisan)
  const cotasVis: number[] = [];
  for (const [k, y] of esq.cotas.entries()) if (!cotasVis.length || (y - esq.cotas[cotasVis[cotasVis.length - 1]]) * ppm >= PX_TEXTO + 2) cotasVis.push(k);
  const hoverTxt = hover && celdas.has(hover) ? nombreCelda(tramos, esq.cotas, hover, cara) : "";

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <div className="flex items-center gap-1.5 px-2 pt-1.5 text-xs">
        <span className="text-muted-foreground">Alzado ·</span>
        {carasDisp.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCara(c)}
            aria-pressed={c === cara}
            className="rounded-md px-1.5 py-0.5 text-muted-foreground hover:bg-muted aria-pressed:bg-muted aria-pressed:font-medium aria-pressed:text-foreground"
          >
            {NOMBRE_CARA[c]}
          </button>
        ))}
        {vista && (
          <button type="button" className="rounded-md px-1.5 py-0.5 text-muted-foreground hover:bg-muted" onClick={() => setVista(null)}>
            Ver todo
          </button>
        )}
        <span className="ml-auto truncate text-muted-foreground">
          {celdasSel.length ? `${celdasSel.length} celda${celdasSel.length === 1 ? "" : "s"}${celdasSel.length === 1 ? ` · ${nombreCelda(tramos, esq.cotas, celdasSel[0], cara)}` : ""}` : hoverTxt || "Arrastrá para elegir varias · N/V elige un nivel o un vano · rueda: zoom · Alt+arrastrar: mover"}
        </span>
      </div>
      <div ref={caja} className="relative min-h-0 flex-1">
        <svg
          viewBox={vb}
          preserveAspectRatio="xMidYMid meet"
          className="absolute inset-0 size-full select-none touch-none"
          onPointerLeave={() => useEditor.getState().setHover(null)}
          onPointerUp={terminar}
          onPointerCancel={terminar}
          onWheel={rueda}
          onDoubleClick={() => setVista(null)}
          onPointerDown={(e) => {
            if (e.button === 1 || e.altKey) {
              e.preventDefault();
              (e.target as Element).setPointerCapture?.(e.pointerId);
              paneo.current = { x: e.clientX, y: e.clientY, vista: { cx, cy } };
            }
          }}
          onPointerMove={(e) => {
            const pn = paneo.current;
            if (pn) {
              setVista({ z, cx: pn.vista.cx - (e.clientX - pn.x) * upp, cy: pn.vista.cy - (e.clientY - pn.y) * upp });
              return;
            }
            if (!pintura.current && !rect.current) return;
            const c = claveEn(e);
            if (c) mover(c);
          }}
          role="img"
          aria-label={`Alzado ${NOMBRE_CARA[cara].toLowerCase()} de ${r.nombre}`}
        >
          <g transform="scale(1,-1)">
            {/* celdas */}
            {tramos.map((t, i) =>
              ks.map((k) => {
                const clave = `${t.vano.id}@${k}`;
                const c = celdas.get(clave);
                if (!c) return null;
                const lo = esq.cotas[k - 1];
                const hi = esq.cotas[k];
                const ce = esq.celdas[clave] ?? {};
                const ov = overrides?.[clave];
                const esSel = sel.has(clave);
                const esHover = hover === clave;
                const diag = ce.diagonal;
                const subeIzq = diag ? (diag === "sube") === t.directo : false;
                return (
                  <g key={clave}>
                    <rect
                      data-celda={clave}
                      x={t.x0}
                      y={lo}
                      width={t.x1 - t.x0}
                      height={hi - lo}
                      className="cursor-pointer"
                      style={{
                        fill: esSel
                          ? "color-mix(in oklch, var(--primary) 32%, transparent)"
                          : esHover
                            ? "color-mix(in oklch, var(--foreground) 10%, transparent)"
                            : c.estado === "error"
                              ? "color-mix(in oklch, var(--destructive) 15%, transparent)"
                              : c.estado === "aviso"
                                ? "var(--tb-aviso-bg)"
                                : ce.cerramiento === "lona" || ce.cerramiento === "media_sombra"
                                  ? "color-mix(in oklch, var(--muted-foreground) 15%, transparent)"
                                  : "transparent",
                      }}
                      onPointerDown={(e) => empezar(clave, i, k, e)}
                      onPointerEnter={() => mover(clave)}
                    >
                      <title>{`${nombreCelda(tramos, esq.cotas, clave, cara)}${ce.diagonal ? " · diagonal" : ""}${c.contenido?.abertura ? " · abertura" : ""}`}</title>
                    </rect>
                    {diag && (
                      <line
                        x1={subeIzq ? t.x0 : t.x1}
                        y1={lo}
                        x2={subeIzq ? t.x1 : t.x0}
                        y2={hi}
                        className={ce.diagonalCano || ce.cano ? "stroke-[var(--tb-aviso-icono)]" : "stroke-primary"}
                        strokeWidth={sw * 1.6}
                        pointerEvents="none"
                      />
                    )}
                    {c.contenido?.plataforma && <line x1={t.x0} y1={hi} x2={t.x1} y2={hi} className="stroke-[var(--tb-aviso-text)]" strokeWidth={sw * 4} pointerEvents="none" />}
                    {(ce.baranda ?? 0) > 0 && (
                      <line x1={t.x0} y1={lo + (hi - lo) * 0.5} x2={t.x1} y2={lo + (hi - lo) * 0.5} className="stroke-[var(--tb-aviso-icono)]" strokeWidth={sw} pointerEvents="none" />
                    )}
                    {c.contenido?.abertura && (
                      <rect x={t.x0 + 0.08} y={lo + 0.05} width={Math.max(0, t.x1 - t.x0 - 0.16)} height={Math.max(0, hi - lo - 0.1)} className="fill-none stroke-foreground/50" strokeWidth={sw} strokeDasharray={`${sw * 4} ${sw * 3}`} pointerEvents="none" />
                    )}
                    {(c.contenido?.override || ov) && <circle cx={t.x1 - 0.15} cy={hi - 0.15} r={Math.max(0.05, 3 * upp)} className="fill-primary" pointerEvents="none" />}
                    {ce.horizontal !== false && <line x1={t.x0} y1={hi} x2={t.x1} y2={hi} className="stroke-foreground/45" strokeWidth={sw} pointerEvents="none" />}
                  </g>
                );
              }),
            )}
            {/* verticales */}
            {tramos.flatMap((t, i) => {
              const prev = tramos[i - 1];
              const ids = [t.directo ? t.vano.a : t.vano.b, t.directo ? t.vano.b : t.vano.a];
              const xs = [t.x0, t.x1];
              return ids.map((id, j) => {
                if (j === 0 && prev && prev.x1 === t.x0) return null;
                const c = cols.get(id);
                if (!c) return null;
                return (
                  <g key={`${t.vano.id}-${j}`} pointerEvents="none">
                    <line x1={xs[j]} y1={c.yBase} x2={xs[j]} y2={c.yTope} className="stroke-foreground/80" strokeWidth={sw * 1.8} />
                    {(c.ySuelo ?? 0) < c.yBase - 0.01 && <line x1={xs[j]} y1={c.ySuelo ?? 0} x2={xs[j]} y2={c.yBase} className="stroke-muted-foreground" strokeWidth={sw * 2.5} />}
                    {c.apoyo.startsWith("rueda") && <circle cx={xs[j]} cy={(c.ySuelo ?? 0) + 0.08} r={0.1} className="fill-muted-foreground" />}
                  </g>
                );
              });
            })}
            {/* suelo */}
            <line x1={-0.3} y1={0} x2={W + 0.3} y2={0} className="stroke-muted-foreground/60" strokeWidth={sw} />
          </g>
          {/* cotas a tamaño fijo en pantalla (fuera del flip para que el texto no salga espejado) */}
          {cotasVis.map((k) => (
            <text key={k} x={-0.12} y={-esq.cotas[k] + fs * 0.35} textAnchor="end" className="fill-muted-foreground font-mono" fontSize={fs}>
              {fmt(esq.cotas[k])}
            </text>
          ))}
          {/* N1…: elegir el nivel (banda) entero */}
          {ks.map((k) => {
            const yMid = -(esq.cotas[k - 1] + esq.cotas[k]) / 2;
            if ((esq.cotas[k] - esq.cotas[k - 1]) * ppm < PX_TEXTO) return null;
            return (
              <text
                key={`n${k}`}
                x={-ml + 0.1}
                y={yMid + fs * 0.35}
                className="cursor-pointer fill-muted-foreground font-mono hover:fill-foreground"
                fontSize={fs}
                onClick={(e) => elegir(celdasRango(0, tramos.length - 1, k, k), e.shiftKey)}
              >
                <title>{`Elegir la banda ${k} entera (${fmt(esq.cotas[k - 1])}–${fmt(esq.cotas[k])} m)`}</title>
                N{k}
              </text>
            );
          })}
          {/* medidas de vano y V1…: elegir el vano entero */}
          {tramos.map((t, i) => {
            const ancho = (t.x1 - t.x0) * ppm;
            return (
              <g key={t.vano.id}>
                {ancho >= 30 && (
                  <text x={(t.x0 + t.x1) / 2} y={fs * 1.3} textAnchor="middle" className={cn("font-mono", t.vano.libre ? "fill-[var(--tb-aviso-icono)]" : "fill-muted-foreground")} fontSize={fs}>
                    {fmt(t.vano.medida)}
                  </text>
                )}
                {ancho >= 18 && (
                  <text
                    x={(t.x0 + t.x1) / 2}
                    y={fs * 2.6}
                    textAnchor="middle"
                    className="cursor-pointer fill-muted-foreground font-mono hover:fill-foreground"
                    fontSize={fs}
                    onClick={(e) => elegir(celdasRango(i, i, 1, esq.cotas.length - 1), e.shiftKey)}
                  >
                    <title>{`Elegir el vano ${i + 1} entero (${fmt(t.vano.medida)} m)`}</title>
                    V{i + 1}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
