"use client";

// Alzado SVG de la estructura seleccionada, dibujado desde el esqueleto resuelto y las celdas
// del Resultado: la cara elegida (exterior por defecto) desplegada en un plano, con diagonales
// roseta a roseta, plataformas, barandas, aberturas y cerramientos. Clic selecciona la celda
// (Shift suma), y con el pincel se pinta arrastrando.

import { useMemo, useRef, useState } from "react";
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

export function Alzado({ className, grande }: { className?: string; grande?: boolean }) {
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
  const svgRef = useRef<SVGSVGElement>(null);

  if (!r) return <div className={cn("grid place-items-center text-xs text-muted-foreground", className)}>Elegí una estructura para ver su alzado.</div>;
  if (!tramos.length) return <div className={cn("grid place-items-center text-xs text-muted-foreground", className)}>Esta estructura no tiene caras para mostrar.</div>;

  const esq = r.esqueleto;
  const cols = new Map(esq.columnas.map((c) => [c.id, c]));
  const W = tramos[tramos.length - 1].x1;
  const H = Math.max(...esq.columnas.map((c) => c.yTope), 1);
  const ml = 0.9, mb = 0.6, mt = 0.3, mr = 0.3;
  const vb = `${-ml} ${-(H + mt)} ${W + ml + mr} ${H + mt + mb}`;
  const sel = new Set(celdasSel);
  const sw = Math.max(W, H) / 400;
  const pintando = herramienta === "pincel";

  const empezar = (clave: string, e: React.PointerEvent) => {
    const s = useEditor.getState();
    if (pintando && !s.soloLectura) {
      (e.target as Element).setPointerCapture?.(e.pointerId);
      pintura.current = { base: s.diseno, celdas: new Set([clave]) };
      s.preview(pintarDiseno(s.diseno, s.res, r.id, [clave], s.pincel));
      return;
    }
    const celdas = e.shiftKey ? (sel.has(clave) ? celdasSel.filter((c) => c !== clave) : [...celdasSel, clave]) : [clave];
    s.seleccionar({ celdas });
  };
  const mover = (clave: string) => {
    const s = useEditor.getState();
    if (clave !== s.hover) s.setHover(clave);
    const p = pintura.current;
    if (p && !p.celdas.has(clave)) {
      p.celdas.add(clave);
      s.preview(pintarDiseno(p.base, s.res, r.id, [...p.celdas], s.pincel));
    }
  };
  const terminar = () => {
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
        <span className="ml-auto font-mono text-muted-foreground">
          {celdasSel.length ? `${celdasSel.length} celda${celdasSel.length === 1 ? "" : "s"}` : hover ?? ""}
        </span>
      </div>
      <svg
        ref={svgRef}
        viewBox={vb}
        preserveAspectRatio="xMidYMid meet"
        className={cn("min-h-0 w-full flex-1 select-none touch-none", grande ? "" : "")}
        onPointerLeave={() => useEditor.getState().setHover(null)}
        onPointerUp={terminar}
        onPointerMove={(e) => {
          if (!pintura.current) return;
          const c = claveEn(e);
          if (c) mover(c);
        }}
        role="img"
        aria-label={`Alzado ${NOMBRE_CARA[cara].toLowerCase()} de ${r.nombre}`}
      >
        <g transform="scale(1,-1)">
          {/* celdas */}
          {tramos.map((t) =>
            esq.cotas.map((_, k) => {
              if (k === 0) return null;
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
                    className={cn(
                      "cursor-pointer",
                      esSel ? "fill-primary/25" : esHover ? "fill-foreground/10" : c.estado === "error" ? "fill-destructive/15" : c.estado === "aviso" ? "fill-amber-500/10" : "fill-transparent",
                      ce.cerramiento === "lona" || ce.cerramiento === "media_sombra" ? "fill-muted-foreground/15" : "",
                    )}
                    onPointerDown={(e) => empezar(clave, e)}
                    onPointerEnter={() => mover(clave)}
                  >
                    <title>{`${clave} · banda ${fmt(lo)}–${fmt(hi)} m${ce.diagonal ? " · diagonal" : ""}${c.contenido?.abertura ? " · abertura" : ""}`}</title>
                  </rect>
                  {diag && (
                    <line
                      x1={subeIzq ? t.x0 : t.x1}
                      y1={lo}
                      x2={subeIzq ? t.x1 : t.x0}
                      y2={hi}
                      className={ce.diagonalCano || ce.cano ? "stroke-amber-600" : "stroke-sky-600 dark:stroke-sky-400"}
                      strokeWidth={sw * 1.6}
                      pointerEvents="none"
                    />
                  )}
                  {c.contenido?.plataforma && <line x1={t.x0} y1={hi} x2={t.x1} y2={hi} className="stroke-amber-800 dark:stroke-amber-600" strokeWidth={sw * 4} pointerEvents="none" />}
                  {(ce.baranda ?? 0) > 0 && (
                    <line x1={t.x0} y1={lo + (hi - lo) * 0.5} x2={t.x1} y2={lo + (hi - lo) * 0.5} className="stroke-yellow-600" strokeWidth={sw} pointerEvents="none" />
                  )}
                  {c.contenido?.abertura && (
                    <rect x={t.x0 + 0.08} y={lo + 0.05} width={t.x1 - t.x0 - 0.16} height={hi - lo - 0.1} className="fill-none stroke-foreground/50" strokeWidth={sw} strokeDasharray={`${sw * 4} ${sw * 3}`} pointerEvents="none" />
                  )}
                  {(c.contenido?.override || ov) && <circle cx={t.x1 - 0.15} cy={hi - 0.15} r={0.07} className="fill-primary" pointerEvents="none" />}
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
        {/* cotas (fuera del flip para que el texto no salga espejado) */}
        {esq.cotas.map((y, k) => (
          <text key={k} x={-0.12} y={-y + 0.06} textAnchor="end" className="fill-muted-foreground font-mono" fontSize={Math.max(0.16, H / 60)}>
            {fmt(y)}
          </text>
        ))}
        {tramos.map((t) => (
          <text key={t.vano.id} x={(t.x0 + t.x1) / 2} y={0.4} textAnchor="middle" className={cn("font-mono", t.vano.libre ? "fill-amber-600" : "fill-muted-foreground")} fontSize={Math.max(0.16, H / 60)}>
            {fmt(t.vano.medida)}
          </text>
        ))}
      </svg>
    </div>
  );
}
