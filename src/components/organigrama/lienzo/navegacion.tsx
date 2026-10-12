"use client";

// Zoom (+ / − / encuadrar) y el minimapa. El rectángulo del minimapa sigue a la cámara con
// motion values (sin re-render); tocar o arrastrar en el minimapa mueve la cámara.

import { memo, useEffect, useRef } from "react";
import { motion, useMotionValue, useMotionValueEvent, useTransform } from "motion/react";
import { Expand, Maximize, Minus, Plus, Shrink } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Caja, Limites } from "@/lib/organigrama/layout";
import type { ColorArea } from "@/lib/organigrama/tipos";
import type { ApiCamara } from "./camara";

export function ControlesZoom({
  cam,
  onEncuadrar,
  completa,
  onPantallaCompleta,
}: {
  cam: ApiCamara;
  onEncuadrar: () => void;
  completa: boolean;
  onPantallaCompleta: () => void;
}) {
  const porcentaje = useTransform(cam.k, (k) => `${Math.round(k * 100)}%`);
  return (
    <div data-sin-pan className="pointer-events-auto flex flex-col items-center gap-0.5 rounded-lg border bg-card/95 p-1 shadow-lg backdrop-blur">
      <Button variant="ghost" size="icon" className="max-sm:size-10" onClick={() => cam.zoom(1.25)} aria-label="Acercar" title="Acercar (+)">
        <Plus aria-hidden />
      </Button>
      <motion.span aria-hidden className="text-[10.5px] text-muted-foreground tabular-nums">
        {porcentaje}
      </motion.span>
      <Button variant="ghost" size="icon" className="max-sm:size-10" onClick={() => cam.zoom(0.8)} aria-label="Alejar" title="Alejar (−)">
        <Minus aria-hidden />
      </Button>
      <Button variant="ghost" size="icon" className="max-sm:size-10" onClick={onEncuadrar} aria-label="Encuadrar todo" title="Encuadrar (0)">
        <Maximize aria-hidden />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="max-sm:size-10"
        onClick={onPantallaCompleta}
        aria-label={completa ? "Salir de pantalla completa" : "Pantalla completa"}
        aria-pressed={completa}
        title={completa ? "Salir de pantalla completa (F)" : "Pantalla completa (F)"}
      >
        {completa ? <Shrink aria-hidden /> : <Expand aria-hidden />}
      </Button>
    </div>
  );
}

const ANCHO = 184;
const ALTO = 116;

function MinimapaBase({
  cajas,
  colores,
  limites,
  cam,
  vista,
}: {
  cajas: [string, Caja][];
  colores: Record<string, ColorArea>;
  limites: Limites;
  cam: ApiCamara;
  vista: { w: number; h: number };
}) {
  const ref = useRef<SVGSVGElement>(null);
  const pad = 40;
  const mundo = { x: limites.minX - pad, y: limites.minY - pad, w: limites.maxX - limites.minX + pad * 2, h: limites.maxY - limites.minY + pad * 2 };
  const s = Math.min(ANCHO / mundo.w, ALTO / mundo.h);
  const ox = (ANCHO - mundo.w * s) / 2;
  const oy = (ALTO - mundo.h * s) / 2;
  const aMini = (wx: number, wy: number) => ({ x: ox + (wx - mundo.x) * s, y: oy + (wy - mundo.y) * s });

  // El rectángulo de la vista se escribe directo en motion values en cada cambio de cámara.
  const rx = useMotionValue(0);
  const ry = useMotionValue(0);
  const rw = useMotionValue(0);
  const rh = useMotionValue(0);
  const actualizar = () => {
    const k = cam.k.get();
    rx.set(ox + (-cam.x.get() / k - mundo.x) * s);
    ry.set(oy + (-cam.y.get() / k - mundo.y) * s);
    rw.set((vista.w / k) * s);
    rh.set((vista.h / k) * s);
  };
  useMotionValueEvent(cam.x, "change", actualizar);
  useMotionValueEvent(cam.y, "change", actualizar);
  useMotionValueEvent(cam.k, "change", actualizar);
  useEffect(() => {
    actualizar();
    const r = requestAnimationFrame(actualizar);
    return () => cancelAnimationFrame(r);
  });

  const llevar = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const mx = e.clientX - r.left;
    const my = e.clientY - r.top;
    const wx = (mx - ox) / s + mundo.x;
    const wy = (my - oy) / s + mundo.y;
    const k = cam.k.get();
    cam.ir({ k, x: vista.w / 2 - wx * k, y: vista.h / 2 - wy * k }, { animar: e.type === "pointerdown" });
  };

  return (
    <div data-sin-pan className="pointer-events-auto relative overflow-hidden rounded-lg border bg-card/95 shadow-lg backdrop-blur">
      <svg
        ref={ref}
        width={ANCHO}
        height={ALTO}
        role="img"
        aria-label="Minimapa: tocá para mover la vista"
        className="block cursor-pointer touch-none"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          llevar(e);
        }}
        onPointerMove={(e) => e.buttons && llevar(e)}
      >
        {cajas.map(([clave, c]) => {
          const p = aMini(c.x, c.y);
          return (
            <motion.rect
              key={clave}
              initial={false}
              animate={{ attrX: p.x, attrY: p.y }}
              width={Math.max(2, c.w * s)}
              height={Math.max(2, c.h * s)}
              rx={1.5}
              style={{ fill: `var(--tb-${colores[clave] ?? "gris"}-borde)` }}
              opacity={0.75}
            />
          );
        })}
      </svg>
      {/* El rectángulo de la vista: un div con transform (en SVG, motion trata x/y como transform). */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute top-0 left-0 rounded-[3px] border-[1.5px] border-foreground bg-foreground/5"
        style={{ x: rx, y: ry, width: rw, height: rh }}
      />
    </div>
  );
}

export const Minimapa = memo(MinimapaBase);
