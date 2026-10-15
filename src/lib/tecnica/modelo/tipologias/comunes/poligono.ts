/** Plantas poligonales: círculos discretizados y utilidades para envolventes. */
import type { Poligono, V2 } from '../../tipos.ts';
import { areaPoligono, r3 } from '../../util.ts';

/** Polígono regular inscripto en un círculo (antihorario). */
export function poligonoCirculo(centro: V2, radio: number, lados: number): Poligono {
  const n = Math.max(3, Math.round(lados));
  const out: Poligono = [];
  for (let i = 0; i < n; i++) {
    const a = (2 * Math.PI * i) / n;
    out.push([r3(centro[0] + radio * Math.cos(a)), r3(centro[1] + radio * Math.sin(a))]);
  }
  return out;
}

/** Devuelve el polígono en sentido antihorario. */
export function antihorario(p: Poligono): Poligono {
  return areaPoligono(p) < 0 ? [...p].reverse() : p;
}

export function rectangulo(x0: number, z0: number, x1: number, z1: number): Poligono {
  return [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
}
