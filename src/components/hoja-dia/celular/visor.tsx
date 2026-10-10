"use client";

import { useLayoutEffect, useRef, useState } from "react";
import type { ArchivoPublico } from "@/lib/hoja-dia/vista";
import { Capa } from "./capa";
import s from "./celular.module.css";

// El visor de planos y fotos a pantalla completa (maqueta visorHTML): deslizar para pasar,
// Anterior / Siguiente, Acercar (o doble toque) y, acercado, se mueve con el dedo. Los PDF
// no se dibujan acá: "Abrir el PDF" lo abre con el visor del teléfono.

export const esPdf = (a: ArchivoPublico) => a.mimetype === "application/pdf" || /\.pdf$/i.test(a.nombre);

export function Visor({ archivos, inicio, titulo, onCerrar }: { archivos: ArchivoPublico[]; inicio: number; titulo: string; onCerrar: () => void }) {
  const [i, setI] = useState(Math.max(0, Math.min(archivos.length - 1, inicio)));
  const [zoom, setZoom] = useState(false);
  const toque = useRef<{ x: number; y: number; t: number } | null>(null);
  const area = useRef<HTMLDivElement>(null);
  // Dónde acercar (0–1 del área): el punto del doble toque, o el centro con el botón.
  const foco = useRef<{ fx: number; fy: number }>({ fx: 0.5, fy: 0.5 });
  useLayoutEffect(() => {
    const el = area.current;
    if (!zoom || !el) return;
    el.scrollLeft = (el.scrollWidth - el.clientWidth) * foco.current.fx;
    el.scrollTop = (el.scrollHeight - el.clientHeight) * foco.current.fy;
  }, [zoom, i]);
  const acercar = (fx = 0.5, fy = 0.5) => { foco.current = { fx, fy }; setZoom((z) => !z); };
  const ultimoTap = useRef<{ x: number; y: number; t: number } | null>(null);
  const a = archivos[i];
  const ir = (n: number) => {
    setI((x) => Math.max(0, Math.min(archivos.length - 1, x + n)));
    setZoom(false);
  };

  const onDown = (e: React.PointerEvent) => { toque.current = { x: e.clientX, y: e.clientY, t: Date.now() }; };
  const onUp = (e: React.PointerEvent) => {
    const t0 = toque.current;
    toque.current = null;
    if (!t0) return;
    const dx = e.clientX - t0.x;
    const dy = e.clientY - t0.y;
    if (!zoom && Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) { ir(dx < 0 ? 1 : -1); return; }
    // Doble toque: acerca o aleja.
    if (Math.abs(dx) < 12 && Math.abs(dy) < 12) {
      const u = ultimoTap.current;
      const ahora = Date.now();
      if (u && ahora - u.t < 320 && Math.abs(u.x - e.clientX) < 30 && Math.abs(u.y - e.clientY) < 30) {
        ultimoTap.current = null;
        const r = area.current?.getBoundingClientRect();
        if (a && !esPdf(a)) acercar(r ? (e.clientX - r.left) / r.width : 0.5, r ? (e.clientY - r.top) / r.height : 0.5);
      } else ultimoTap.current = { x: e.clientX, y: e.clientY, t: ahora };
    }
  };

  return (
    <Capa
      className={s.viewer}
      etiqueta="Planos y fotos"
      onCerrar={onCerrar}
      onTecla={(e) => {
        if (e.key === "ArrowRight") ir(1);
        else if (e.key === "ArrowLeft") ir(-1);
      }}
    >
      <div className={s.vt}>
        <span aria-live="polite">{i + 1} de {archivos.length} · {titulo}</span>
        <button type="button" className={s.vb} onClick={onCerrar} data-autofoco>Cerrar</button>
      </div>
      <div ref={area} className={`${s.va} ${zoom ? s.zoom : ""}`} onPointerDown={onDown} onPointerUp={onUp} onPointerCancel={() => { toque.current = null; }}>
        {a && esPdf(a) ? (
          <div className={s.vpdf}>
            <b aria-hidden>PDF</b>
            <span>{a.nombre}</span>
            <a className={s.vb} href={a.url} target="_blank" rel="noreferrer">Abrir el PDF</a>
          </div>
        ) : a ? (
          // eslint-disable-next-line @next/next/no-img-element -- archivo de Odoo servido por la app, sin optimizar
          <img src={a.url} alt={`${a.nombre} (${i + 1} de ${archivos.length})`} draggable={false} />
        ) : null}
      </div>
      <div className={s.vf2}>
        <button type="button" className={s.vb} onClick={() => ir(-1)} disabled={i === 0}>Anterior</button>
        <button type="button" className={s.vb} onClick={() => acercar()} disabled={!a || esPdf(a)} aria-pressed={zoom}>{zoom ? "Alejar" : "Acercar"}</button>
        <button type="button" className={s.vb} onClick={() => ir(1)} disabled={i >= archivos.length - 1}>Siguiente</button>
      </div>
    </Capa>
  );
}
