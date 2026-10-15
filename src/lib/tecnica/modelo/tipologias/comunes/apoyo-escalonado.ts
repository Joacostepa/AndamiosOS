/** Apoyos a distinto nivel (escaleras, desniveles): cada columna arranca en la roseta alcanzable. */
import type { Aviso, Esqueleto, V2, Volumen } from '../../tipos.ts';
import { CRITERIOS } from '../../criterios.ts';
import { fmt, r3 } from '../../util.ts';

/**
 * MUTA el esqueleto: pone `ySuelo` por columna (peldaño o descanso) y fija `yBase` en la roseta de la grilla
 * (fase de las cotas) que queda entre arranqueMin y tornillonMax sobre el suelo. Base regulable.
 */
export function apoyoEscalonado(esq: Esqueleto, ySueloDe: (p: V2) => number, o: { estructuraId?: string } = {}): Omit<Aviso, 'id'>[] {
  const avisos: Omit<Aviso, 'id'>[] = [];
  const fase = esq.cotas.length ? esq.cotas[0] : 0.25;
  const paso = CRITERIOS.pasoRoseta;
  for (const c of esq.columnas) {
    if (c.apoyo === 'colgada' || c.apoyo === 'sobre') continue;
    const ys = r3(ySueloDe(c.p));
    const min = ys + CRITERIOS.arranqueMin;
    const j = Math.ceil((min - fase) / paso - 1e-6);
    const yb = r3(fase + j * paso);
    c.ySuelo = ys;
    c.yBase = yb;
    c.apoyo = 'base_regulable';
    if (yb - ys > CRITERIOS.tornillonMax + 1e-6) avisos.push({ regla: 'apoyo.tornillon', nivel: 'aviso', estructuraId: o.estructuraId || null, texto: `Columna ${c.id}: el tornillón queda extendido ${fmt(yb - ys)} m (máx. ${fmt(CRITERIOS.tornillonMax)} ⚠).`, reparaciones: [] });
    if (c.yBase >= c.yTope) avisos.push({ regla: 'apoyo.columna_corta', nivel: 'error', estructuraId: o.estructuraId || null, texto: `Columna ${c.id}: el apoyo queda por encima del tope.`, reparaciones: [] });
  }
  return avisos;
}

/** (p) ⇒ cota del suelo a partir de Volumen.escalera (peldaños y descansos), en las coords del volumen. */
export function muestrearEscalera(v: Volumen): (p: V2) => number {
  const e = v.escalera;
  if (!e) return () => v.yBase;
  const r = (e.rumbo * Math.PI) / 180;
  const u: V2 = [Math.cos(r), Math.sin(r)];
  return (p: V2) => {
    const s = (p[0] - e.origen[0]) * u[0] + (p[1] - e.origen[1]) * u[1];
    for (const d of e.descansos) if (s >= d.s0 - 1e-6 && s <= d.s1 + 1e-6) return d.cota;
    let y = v.yBase;
    for (const pe of e.peldanos) {
      if (s < pe.s - 1e-6) break;
      y += pe.contrahuella;
    }
    return r3(y);
  };
}
