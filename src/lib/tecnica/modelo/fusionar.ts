/**
 * Fusión de nodos entre estructuras: verticales, bases y accesorios de columna que coinciden en planta se
 * cuentan una sola vez; los tubos idénticos (mismo código y extremos) también.
 */
import type { Familia, Pieza } from './tipos.ts';
import { EPS, mm } from './util.ts';

const DE_COLUMNA = new Set<Familia>(['vertical', 'base_regulable', 'base_fija', 'collarin', 'rueda', 'rueda_freno', 'recubrimiento', 'esfera', 'accesorio']);
const NO_DEDUP = new Set<Familia>(['lona', 'media_sombra', 'chapa', 'anclaje', 'fenolico']);

const claveCodigo = (p: Pieza) => p.codigo ?? `SIN:${p.familia}:${p.medidas.largo ?? ''}x${p.medidas.alto ?? ''}x${p.medidas.ancho ?? ''}:${p.medidas.variante ?? ''}`;

export function fusionarNodos(piezas: Pieza[]): { piezas: Pieza[]; fusionadas: number; compartidas: Record<string, number> } {
  const porNodo = new Map<string, Pieza[]>();
  const resto: Pieza[] = [];
  for (const p of piezas) {
    if (DE_COLUMNA.has(p.familia) && mm(p.a[0]) === mm(p.b[0]) && mm(p.a[2]) === mm(p.b[2]) && !p.ajuste) {
      const k = `${mm(p.a[0])}|${mm(p.a[2])}`;
      const g = porNodo.get(k);
      if (g) g.push(p);
      else porNodo.set(k, [p]);
    } else resto.push(p);
  }
  const quitar = new Set<string>();
  const compartidas: Record<string, number> = {};
  for (const grupo of porNodo.values()) {
    const owners = [...new Set(grupo.map((p) => p.owner))];
    if (owners.length < 2) continue;
    const kept = grupo.filter((p) => p.owner === owners[0]);
    for (const ow of owners.slice(1)) {
      let solapa = false;
      for (const p of grupo.filter((x) => x.owner === ow)) {
        if (p.familia === 'vertical') {
          const y0 = Math.min(p.a[1], p.b[1]);
          const y1 = Math.max(p.a[1], p.b[1]);
          let cubierto = 0;
          for (const k of kept) if (k.familia === 'vertical') cubierto += Math.max(0, Math.min(y1, Math.max(k.a[1], k.b[1])) - Math.max(y0, Math.min(k.a[1], k.b[1])));
          if (y1 - y0 - cubierto <= 0.25 + EPS) {
            quitar.add(p.id);
            solapa = true;
          } else kept.push(p);
        } else {
          const dup = kept.find((k) => claveCodigo(k) === claveCodigo(p) && Math.abs(k.a[1] - p.a[1]) < 0.05);
          if (dup) quitar.add(p.id);
          else kept.push(p);
        }
      }
      if (solapa) {
        const key = `${owners[0]}|${ow}`;
        compartidas[key] = (compartidas[key] || 0) + 1;
      }
    }
  }
  const vistos = new Set<string>();
  for (const p of resto) {
    if (NO_DEDUP.has(p.familia)) continue;
    const ka = `${mm(p.a[0])},${mm(p.a[1])},${mm(p.a[2])}`;
    const kb = `${mm(p.b[0])},${mm(p.b[1])},${mm(p.b[2])}`;
    const key = `${claveCodigo(p)}|${ka < kb ? ka + '|' + kb : kb + '|' + ka}`;
    if (vistos.has(key)) quitar.add(p.id);
    else vistos.add(key);
  }
  return { piezas: piezas.filter((p) => !quitar.has(p.id)), fusionadas: quitar.size, compartidas };
}
