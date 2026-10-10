"use client";

import { A4, LARGO_NOMBRE, posicion, recortar, type Grilla, type Tamano } from "@/lib/panol/etiquetas";

// La hoja A4 tal como va a salir. Todo en porcentajes de la hoja (y la letra en cqw, el
// ancho del contenedor), así la misma cuenta en milímetros sirve a cualquier ancho de
// pantalla. LA HOJA ES BLANCA TAMBIÉN EN MODO OSCURO: es papel, no interfaz.

export type EtiquetaVista = { clave: string; codigo: string | null; nombre: string; path: string | null; lado: number };

const LETRA_MM: Record<Tamano, { codigo: number; nombre: number }> = {
  // Los mismos puntos que el PDF (9/5,5 y 15/8 pt), pasados a mm.
  25: { codigo: 3.18, nombre: 1.94 },
  50: { codigo: 5.29, nombre: 2.82 },
};

const pct = (mm: number, total: number) => `${(mm / total) * 100}%`;
const cqw = (mm: number) => `${(mm / A4.ancho) * 100}cqw`;

export function VistaPrevia({
  etiquetas, grilla: g, tamano, separacion, guias,
}: {
  etiquetas: (EtiquetaVista | null)[];
  grilla: Grilla;
  tamano: Tamano;
  separacion: number;
  guias: boolean;
}) {
  const letra = LETRA_MM[tamano];
  return (
    <div className="@container relative mx-auto aspect-[210/297] w-full max-w-[560px] bg-white text-black shadow-sm ring-1 ring-border">
      {etiquetas.map((e, i) => {
        const p = posicion(g, i, separacion);
        const caja = {
          left: pct(p.x, A4.ancho), top: pct(p.y, A4.alto),
          width: pct(g.celdaAncho, A4.ancho), height: pct(g.celdaAlto, A4.alto),
          paddingTop: cqw(g.relleno),
        };
        if (!e) {
          return <div key={`vacia-${i}`} aria-hidden style={caja} className="absolute border border-dotted border-zinc-300" />;
        }
        return (
          <div
            key={e.clave}
            style={caja}
            className={`absolute flex flex-col items-center overflow-hidden ${guias ? "border border-dashed border-zinc-300" : ""}`}
          >
            {e.path && e.codigo ? (
              <svg role="img" aria-label={`QR ${e.codigo}`} viewBox={`0 0 ${e.lado} ${e.lado}`} shapeRendering="crispEdges" style={{ width: cqw(tamano), height: cqw(tamano) }}>
                <rect width={e.lado} height={e.lado} fill="white" />
                <path d={e.path} fill="black" />
              </svg>
            ) : (
              <div
                style={{ width: cqw(tamano), height: cqw(tamano), fontSize: cqw(letra.nombre) }}
                className="grid place-items-center border border-dashed border-zinc-400 text-center leading-tight text-zinc-600"
              >
                Código nuevo
              </div>
            )}
            <span className="font-mono font-semibold tracking-wider" style={{ fontSize: cqw(letra.codigo), lineHeight: 1.2 }}>
              {e.codigo ?? "······"}
            </span>
            <span className="max-w-full truncate px-[2%] text-zinc-700" style={{ fontSize: cqw(letra.nombre), lineHeight: 1.2 }}>
              {recortar(e.nombre, LARGO_NOMBRE[tamano])}
            </span>
          </div>
        );
      })}
    </div>
  );
}
