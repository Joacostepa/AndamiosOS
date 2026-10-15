"use client";

// Vista en planta (SVG): huellas de las estructuras y volúmenes de referencia. Clic selecciona;
// el volumen seleccionado se mueve arrastrándolo y, si es un prisma, sus vértices también.
// Además exporta EditorPoligono, el editor de planta poligonal de los campos tipo 'poligono'
// (envolventes): vértices por tipeo o arrastrando.

import { useMemo, useRef, useState } from "react";
import type { Poligono, V2 } from "@/lib/tecnica/modelo";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useEditor } from "../estado/store";
import { formaDe, formaDeGrupo, ponerForma, type FormaVolumen, type VolumenRef } from "../volumenes/geometria";
import { evalExpr, fmt } from "../util/formato";
import { Plus, Trash2 } from "lucide-react";

const r2 = (v: number) => Math.round(v * 100) / 100;

function caja(puntos: V2[], margen = 2): { x: number; z: number; w: number; h: number } {
  if (!puntos.length) return { x: -5, z: -5, w: 10, h: 10 };
  const xs = puntos.map((p) => p[0]);
  const zs = puntos.map((p) => p[1]);
  const x0 = Math.min(...xs) - margen, x1 = Math.max(...xs) + margen;
  const z0 = Math.min(...zs) - margen, z1 = Math.max(...zs) + margen;
  return { x: x0, z: z0, w: Math.max(4, x1 - x0), h: Math.max(4, z1 - z0) };
}

/** Punto del SVG (coordenadas de usuario) bajo el puntero. */
function puntoSvg(svg: SVGSVGElement, e: { clientX: number; clientY: number }): V2 {
  const pt = svg.createSVGPoint();
  pt.x = e.clientX;
  pt.y = e.clientY;
  const m = svg.getScreenCTM();
  if (!m) return [0, 0];
  const q = pt.matrixTransform(m.inverse());
  return [q.x, q.y];
}

function moverForma(f: FormaVolumen, dx: number, dz: number): FormaVolumen {
  switch (f.forma) {
    case "caja":
    case "escalonado":
    case "hueco":
      return { ...f, origen: [r2(f.origen[0] + dx), r2(f.origen[1] + dz)] };
    case "prisma":
      return { ...f, puntos: f.puntos.map((p) => [r2(p[0] + dx), r2(p[1] + dz)] as V2) };
    case "cilindro":
      return { ...f, centro: [r2(f.centro[0] + dx), r2(f.centro[1] + dz)] };
    default:
      return f;
  }
}

export function Planta({ className }: { className?: string }) {
  const diseno = useEditor((s) => s.diseno);
  const res = useEditor((s) => s.res);
  const sel = useEditor((s) => s.sel);
  const soloLectura = useEditor((s) => s.soloLectura);
  const svgRef = useRef<SVGSVGElement>(null);
  const [arrastre, setArrastre] = useState<{ grupo: string; vertice: number | null; desde: V2; actual: V2 } | null>(null);
  const vols = diseno.contexto.volumenes as VolumenRef[];
  const vb = useMemo(() => caja([...res.estructuras.flatMap((e) => e.huella), ...vols.flatMap((v) => v.planta)]), [res, vols]);
  const sw = Math.max(vb.w, vb.h) / 500;

  const delta: V2 = arrastre ? [arrastre.actual[0] - arrastre.desde[0], arrastre.actual[1] - arrastre.desde[1]] : [0, 0];
  const plantaDe = (v: VolumenRef): Poligono => {
    if (!arrastre || v.id !== arrastre.grupo) return v.planta;
    if (arrastre.vertice === null) return v.planta.map((p) => [p[0] + delta[0], p[1] + delta[1]] as V2);
    if (formaDe(v)?.forma !== "prisma") return v.planta;
    return v.planta.map((p, i) => (i === arrastre.vertice ? ([p[0] + delta[0], p[1] + delta[1]] as V2) : p));
  };

  const soltar = () => {
    const a = arrastre;
    setArrastre(null);
    if (!a || (Math.abs(delta[0]) < 0.02 && Math.abs(delta[1]) < 0.02)) return;
    const s = useEditor.getState();
    const fg = formaDeGrupo(s.diseno, a.grupo);
    if (!fg) return;
    let forma: FormaVolumen;
    if (a.vertice !== null && fg.forma.forma === "prisma") {
      forma = { ...fg.forma, puntos: fg.forma.puntos.map((p, i) => (i === a.vertice ? ([r2(p[0] + delta[0]), r2(p[1] + delta[1])] as V2) : p)) };
    } else forma = moverForma(fg.forma, delta[0], delta[1]);
    s.commit(ponerForma(s.diseno, a.grupo, forma, fg.nombre).diseno, a.vertice !== null ? `Mover vértice de ${fg.nombre}` : `Mover ${fg.nombre}`);
  };

  return (
    <svg
      ref={svgRef}
      viewBox={`${vb.x} ${vb.z} ${vb.w} ${vb.h}`}
      preserveAspectRatio="xMidYMid meet"
      className={cn("h-full w-full select-none touch-none", className)}
      onPointerMove={(e) => {
        if (!arrastre || !svgRef.current) return;
        const q = puntoSvg(svgRef.current, e);
        setArrastre({ ...arrastre, actual: [Math.round(q[0] * 20) / 20, Math.round(q[1] * 20) / 20] });
      }}
      onPointerUp={soltar}
      onPointerDown={(e) => {
        if (e.target === svgRef.current) useEditor.getState().seleccionar({ volumen: null, celdas: [] });
      }}
      role="img"
      aria-label="Planta"
    >
      {/* grilla de 1 m */}
      <defs>
        <pattern id="grilla-planta" width="1" height="1" patternUnits="userSpaceOnUse">
          <path d="M 1 0 L 0 0 0 1" className="fill-none stroke-border" strokeWidth={sw * 0.6} />
        </pattern>
      </defs>
      <rect x={vb.x} y={vb.z} width={vb.w} height={vb.h} fill="url(#grilla-planta)" pointerEvents="none" />
      {vols.map((v) => {
        const g = v.id;
        const esSel = sel.volumen === g;
        const pts = plantaDe(v);
        return (
          <g key={v.id}>
            <polygon
              points={pts.map((p) => p.join(",")).join(" ")}
              className={cn(
                v.hueco ? "fill-sky-500/10 stroke-sky-600" : "fill-muted-foreground/20 stroke-muted-foreground",
                esSel && "stroke-primary",
                !soloLectura && "cursor-move",
              )}
              strokeWidth={sw * (esSel ? 2.5 : 1.2)}
              strokeDasharray={v.hueco ? `${sw * 6} ${sw * 4}` : undefined}
              onPointerDown={(e) => {
                e.stopPropagation();
                useEditor.getState().seleccionar({ volumen: g });
                if (soloLectura || !svgRef.current) return;
                (e.target as Element).setPointerCapture?.(e.pointerId);
                const q = puntoSvg(svgRef.current, e);
                setArrastre({ grupo: g, vertice: null, desde: q, actual: q });
              }}
            >
              <title>{`${v.nombre || v.id} · ${fmt(v.yBase)}–${fmt(v.yTope)} m`}</title>
            </polygon>
            {esSel && formaDe(v)?.forma === "prisma" && !soloLectura &&
              pts.map((p, i) => (
                <circle
                  key={i}
                  cx={p[0]}
                  cy={p[1]}
                  r={sw * 6}
                  className="cursor-grab fill-primary stroke-background"
                  strokeWidth={sw}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    if (!svgRef.current) return;
                    (e.target as Element).setPointerCapture?.(e.pointerId);
                    const q = puntoSvg(svgRef.current, e);
                    setArrastre({ grupo: g, vertice: i, desde: q, actual: q });
                  }}
                />
              ))}
          </g>
        );
      })}
      {res.estructuras.map((e) => (
        <polygon
          key={e.id}
          points={e.huella.map((p) => p.join(",")).join(" ")}
          className={cn("cursor-pointer", e.id === sel.estructuraId ? "fill-primary/25 stroke-primary" : "fill-foreground/10 stroke-foreground/60")}
          strokeWidth={sw * 1.5}
          onPointerDown={(ev) => {
            ev.stopPropagation();
            useEditor.getState().seleccionar({ estructuraId: e.id, celdas: [], volumen: null });
          }}
        >
          <title>{e.nombre}</title>
        </polygon>
      ))}
    </svg>
  );
}

// ───────────── editor de planta poligonal (campos 'poligono') ─────────────

type ValorPoligono = V2[] | { tipo: "poligono"; puntos: V2[] } | { tipo: "circulo"; centro: V2; radio: number; lados?: number };

function aPuntos(v: unknown): { puntos: V2[]; forma: "lista" | "poligono" | "circulo"; circulo?: { centro: V2; radio: number; lados: number } } {
  if (Array.isArray(v)) return { puntos: v.filter((p) => Array.isArray(p) && p.length === 2) as V2[], forma: "lista" };
  const o = (v ?? {}) as Record<string, unknown>;
  if (o.tipo === "circulo") {
    const centro = (Array.isArray(o.centro) ? o.centro : [0, 0]) as V2;
    const radio = Number(o.radio) || 3;
    const lados = Number(o.lados) || 16;
    const puntos: V2[] = [];
    for (let i = 0; i < lados; i++) puntos.push([centro[0] + radio * Math.cos((2 * Math.PI * i) / lados), centro[1] + radio * Math.sin((2 * Math.PI * i) / lados)]);
    return { puntos, forma: "circulo", circulo: { centro, radio, lados } };
  }
  return { puntos: (Array.isArray(o.puntos) ? o.puntos : []) as V2[], forma: "poligono" };
}

export function EditorPoligono({ valor, onCambiar, deshabilitado }: { valor: unknown; onCambiar: (v: ValorPoligono, nombre: string) => void; deshabilitado?: boolean }) {
  const { puntos, forma, circulo } = aPuntos(valor);
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<{ i: number; p: V2 } | null>(null);
  const vb = caja(puntos, 1.5);
  const sw = Math.max(vb.w, vb.h) / 220;
  const salida = (pts: V2[]): ValorPoligono => (forma === "lista" ? pts : { tipo: "poligono", puntos: pts });
  const ver = drag ? puntos.map((p, i) => (i === drag.i ? drag.p : p)) : puntos;

  if (forma === "circulo" && circulo) {
    const set = (c: Partial<typeof circulo>, n: string) => onCambiar({ tipo: "circulo", ...circulo, ...c }, n);
    return (
      <div className="space-y-2">
        <div className="grid grid-cols-3 gap-1.5">
          {(["x", "z"] as const).map((eje, j) => (
            <label key={eje} className="text-[11px] text-muted-foreground">
              Centro {eje}
              <CampoNumero valor={circulo.centro[j]} deshabilitado={deshabilitado} onCambiar={(v) => set({ centro: (j === 0 ? [v, circulo.centro[1]] : [circulo.centro[0], v]) as V2 }, `Centro ${eje}`)} />
            </label>
          ))}
          <label className="text-[11px] text-muted-foreground">
            Radio
            <CampoNumero valor={circulo.radio} min={0.3} deshabilitado={deshabilitado} onCambiar={(v) => set({ radio: v }, "Radio")} />
          </label>
        </div>
        <label className="block text-[11px] text-muted-foreground">
          Lados (para partir en vanos)
          <CampoNumero valor={circulo.lados} min={3} deshabilitado={deshabilitado} onCambiar={(v) => set({ lados: Math.round(v) }, "Lados")} />
        </label>
        <Button size="xs" variant="outline" disabled={deshabilitado} onClick={() => onCambiar({ tipo: "poligono", puntos: puntos.map((p) => [r2(p[0]), r2(p[1])] as V2) }, "Planta a polígono")}>
          Pasar a polígono (editar vértices)
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <svg
        ref={svgRef}
        viewBox={`${vb.x} ${vb.z} ${vb.w} ${vb.h}`}
        className="h-36 w-full touch-none rounded-md border border-border bg-muted/30"
        onPointerMove={(e) => {
          if (!drag || !svgRef.current) return;
          const q = puntoSvg(svgRef.current, e);
          setDrag({ i: drag.i, p: [Math.round(q[0] * 20) / 20, Math.round(q[1] * 20) / 20] });
        }}
        onPointerUp={() => {
          if (!drag) return;
          const pts = puntos.map((p, i) => (i === drag.i ? drag.p : p));
          setDrag(null);
          onCambiar(salida(pts), `Mover vértice ${drag.i + 1}`);
        }}
      >
        <polygon points={ver.map((p) => p.join(",")).join(" ")} className="fill-primary/15 stroke-primary" strokeWidth={sw} />
        {ver.map((p, i) => (
          <g key={i}>
            <circle
              cx={p[0]}
              cy={p[1]}
              r={sw * 3.5}
              className={cn("fill-primary stroke-background", !deshabilitado && "cursor-grab")}
              strokeWidth={sw * 0.6}
              onPointerDown={(e) => {
                if (deshabilitado) return;
                (e.target as Element).setPointerCapture?.(e.pointerId);
                setDrag({ i, p });
              }}
            />
            <text x={p[0] + sw * 4} y={p[1] - sw * 4} fontSize={sw * 9} className="fill-muted-foreground font-mono" pointerEvents="none">
              {i + 1}
            </text>
          </g>
        ))}
      </svg>
      <div className="max-h-40 space-y-1 overflow-y-auto pr-1">
        {puntos.map((p, i) => (
          <div key={i} className="grid grid-cols-[1.5rem_1fr_1fr_auto] items-center gap-1">
            <span className="font-mono text-[11px] text-muted-foreground">{i + 1}</span>
            {[0, 1].map((j) => (
              <CampoNumero
                key={j}
                valor={p[j]}
                min={-1000}
                deshabilitado={deshabilitado}
                onCambiar={(v) => onCambiar(salida(puntos.map((q, k) => (k === i ? ((j === 0 ? [v, q[1]] : [q[0], v]) as V2) : q))), `Vértice ${i + 1}`)}
              />
            ))}
            <Button
              size="icon-xs"
              variant="ghost"
              aria-label={`Quitar vértice ${i + 1}`}
              disabled={deshabilitado || puntos.length <= 3}
              onClick={() => onCambiar(salida(puntos.filter((_, k) => k !== i)), `Quitar vértice ${i + 1}`)}
            >
              <Trash2 />
            </Button>
          </div>
        ))}
      </div>
      <Button
        size="xs"
        variant="outline"
        disabled={deshabilitado}
        onClick={() => {
          const a = puntos[puntos.length - 1] ?? [0, 0];
          const b = puntos[0] ?? [1, 0];
          onCambiar(salida([...puntos, [r2((a[0] + b[0]) / 2), r2((a[1] + b[1]) / 2)]]), "Agregar vértice");
        }}
      >
        <Plus /> Vértice
      </Button>
    </div>
  );
}

/** Campo de número con coma decimal y cuentas cortas. Aplica con Enter o al salir. */
export function CampoNumero({
  valor, onCambiar, min = 0, unidad, deshabilitado, className, id, ariaLabel,
}: {
  valor: number | null | undefined;
  onCambiar: (v: number) => void;
  min?: number;
  unidad?: string;
  deshabilitado?: boolean;
  className?: string;
  id?: string;
  ariaLabel?: string;
}) {
  const [texto, setTexto] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const mostrado = texto ?? (valor == null || !Number.isFinite(valor) ? "" : fmt(valor, Math.abs(valor - Math.round(valor)) < 1e-9 ? 0 : 2));
  const aplicar = () => {
    if (texto === null) return;
    const v = evalExpr(texto);
    if (v === null || v < min) {
      setError(true);
      return;
    }
    setError(false);
    setTexto(null);
    if (valor == null || Math.abs(v - valor) > 1e-6) onCambiar(v);
  };
  return (
    <div className={cn("relative", className)}>
      <Input
        id={id}
        aria-label={ariaLabel}
        inputMode="decimal"
        autoComplete="off"
        disabled={deshabilitado}
        value={mostrado}
        aria-invalid={error || undefined}
        title="Admite cuentas: 12+2,5"
        className={cn("h-7 px-2 font-mono text-xs", unidad && "pr-7")}
        onChange={(e) => setTexto(e.target.value)}
        onFocus={(e) => e.target.select()}
        onBlur={aplicar}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            aplicar();
          }
          if (e.key === "Escape") {
            setTexto(null);
            setError(false);
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
      {unidad && <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">{unidad}</span>}
    </div>
  );
}
