/**
 * Choques andamio ↔ volumen: las piezas que se meten dentro de un volumen del contexto (el edificio, una
 * marquesina, un balcón, una cornisa, un tanque). Se agrupan por estructura y volumen y se avisa con una
 * reparación de un clic:
 * - fachada contra un saliente (marquesina, balcón, cornisa): retirar el andamio y acercarlo con ménsulas
 *   hacia la fachada por encima del saliente (o solo retirar);
 * - cualquier estructura metida en un cuerpo: correrla hacia afuera lo justo.
 * Los huecos (patios) no chocan. Anclajes y colgadores tocan el volumen a propósito: no cuentan.
 */
import type { Accion, Aviso, Diseno, Estructura, Pieza, Resultado, V2 } from '../tipos.ts';
import { medidasPorDefecto, type MedidasCatalogo } from '../catalogo/catalogo.ts';
import { PREDIMENSIONADO } from '../constantes.ts';
import { clone, fmt, r3 } from '../util.ts';
import { dentroSolido, distanciaAdentro, ladoMasCercano, solidosDe } from './geometria.ts';
import type { Solido, VolumenModelado } from './tipos.ts';

const NO_CHOCAN = new Set(['anclaje', 'colgador', 'lona', 'media_sombra']);

/**
 * Acciones para retirar una fachada de la pared: en la fachada la línea interior es el origen y la pared está
 * a `retiro` detrás, así que retirar es correr el origen hacia afuera y estirar (esquina convexa) o acortar
 * (esquina entrante) los frentes en la diferencia.
 */
export function accionesRetiro(est: Estructura, nuevo: number): Accion[] {
  const actual = Number(est.params.retiro ?? 0.2);
  const d = r3(nuevo - actual);
  const frentes = clone((est.params.frentes as { largo: number; angulo?: number; vanos?: number[] }[]) || [{ largo: 10 }]);
  for (let i = 0; i < frentes.length; i++) {
    const ini = i > 0 ? (frentes[i].angulo ?? 90) : 0;
    const fin = i < frentes.length - 1 ? (frentes[i + 1].angulo ?? 90) : 0;
    const k = (ini > 0 ? 1 : ini < 0 ? -1 : 0) + (fin > 0 ? 1 : fin < 0 ? -1 : 0);
    frentes[i].largo = r3(frentes[i].largo + k * d);
    delete frentes[i].vanos;
  }
  const n: V2 = [-Math.sin((est.rumbo * Math.PI) / 180), Math.cos((est.rumbo * Math.PI) / 180)];
  return [
    { tipo: 'param', estructuraId: est.id, ruta: 'params.retiro', valor: nuevo },
    { tipo: 'param', estructuraId: est.id, ruta: 'origen', valor: [r3(est.origen[0] + n[0] * d), r3(est.origen[1] + n[1] * d)] },
    { tipo: 'param', estructuraId: est.id, ruta: 'params.frentes', valor: frentes },
  ];
}

export interface Choque {
  estructuraId: string;
  volumenId: string;
  solidoId: string;
  rol: Solido['rol'];
  clase?: string;
  piezas: string[];
  yMin: number;
  yMax: number;
  /** cuánto hay que correr la estructura para salir (m) y hacia dónde */
  profundidad: number;
  normal: V2;
}

function muestras(p: Pieza): [number, number, number][] {
  const out: [number, number, number][] = [];
  const L = Math.hypot(p.b[0] - p.a[0], p.b[1] - p.a[1], p.b[2] - p.a[2]);
  const ts = L < 0.05 ? [0] : [0.15, 0.5, 0.85];
  for (const t of ts) out.push([p.a[0] + (p.b[0] - p.a[0]) * t, p.a[1] + (p.b[1] - p.a[1]) * t, p.a[2] + (p.b[2] - p.a[2]) * t]);
  return out;
}

/** Choques crudos (sin texto): para la UI (resaltar piezas) y para armar los avisos. */
export function detectarChoques(diseno: Diseno, resultado: Pick<Resultado, 'piezas'>): Choque[] {
  const vols = diseno.contexto?.volumenes || [];
  const todos = vols.flatMap((v) => solidosDe(v, vols));
  const solidos = todos.filter((s) => s.rol !== 'hueco');
  const huecos = todos.filter((s) => s.rol === 'hueco');
  if (!solidos.length) return [];
  const grupos = new Map<string, Choque>();
  for (const p of resultado.piezas) {
    if (NO_CHOCAN.has(p.familia) || (p.elemento && /^colg:/.test(p.elemento)) || p.id.includes(':anc:')) continue;
    for (const s of solidos) {
      let pega: [number, number, number] | null = null;
      for (const q of muestras(p)) {
        if (!dentroSolido(s, q[0], q[1], q[2])) continue;
        if (huecos.some((h) => dentroSolido(h, q[0], q[1], q[2], 0))) continue;
        pega = q;
        break;
      }
      if (!pega) continue;
      const k = `${p.estructuraId}|${s.id}`;
      const lado = ladoMasCercano(s.planta, [pega[0], pega[2]]);
      const prof = distanciaAdentro(s.planta, [pega[0], pega[2]]);
      const g = grupos.get(k);
      if (g) {
        g.piezas.push(p.id);
        g.yMin = Math.min(g.yMin, pega[1]);
        g.yMax = Math.max(g.yMax, pega[1]);
        if (prof > g.profundidad) {
          g.profundidad = prof;
          g.normal = lado.normal;
        }
      } else grupos.set(k, { estructuraId: p.estructuraId, volumenId: s.volumenId, solidoId: s.id, rol: s.rol, clase: s.clase, piezas: [p.id], yMin: pega[1], yMax: pega[1], profundidad: prof, normal: lado.normal });
    }
  }
  // un saliente repetido (balcones) choca una sola vez por estructura
  const porVolumen = new Map<string, Choque>();
  for (const c of grupos.values()) {
    const k = `${c.estructuraId}|${c.volumenId}`;
    const ya = porVolumen.get(k);
    if (!ya) porVolumen.set(k, { ...c, piezas: [...c.piezas] });
    else {
      ya.piezas.push(...c.piezas);
      ya.yMin = Math.min(ya.yMin, c.yMin);
      ya.yMax = Math.max(ya.yMax, c.yMax);
      if (c.profundidad > ya.profundidad) {
        ya.profundidad = c.profundidad;
        ya.normal = c.normal;
      }
    }
  }
  return [...porVolumen.values()];
}

const NOMBRE_CLASE: Record<string, string> = { marquesina: 'la marquesina', balcon: 'los balcones', cornisa: 'la cornisa' };

/** Avisos de choque con reparación de un clic (ids «VC1», «VC2»…). */
export function avisosDeChoque(diseno: Diseno, resultado: Pick<Resultado, 'piezas' | 'estructuras'>, medidas: MedidasCatalogo = medidasPorDefecto()): Aviso[] {
  const out: Aviso[] = [];
  const vols = diseno.contexto?.volumenes || [];
  for (const c of detectarChoques(diseno, resultado)) {
    const est = diseno.estructuras.find((e) => e.id === c.estructuraId);
    if (!est) continue;
    const vol = vols.find((v) => v.id === c.volumenId) as VolumenModelado | undefined;
    const nomVol = vol?.nombre || (c.clase && NOMBRE_CLASE[c.clase]) || c.volumenId;
    const reps: Aviso['reparaciones'] = [];
    const def = vol?.def;
    if (est.tipologia === 'fachada' && def?.tipo === 'saliente') {
      const retiroActual = Number(est.params.retiro ?? 0.2);
      const nuevo = r3(Math.max(retiroActual, def.vuelo + 0.15));
      const ok = [...medidas.multi.mensulas].sort((a, b) => b - a).find((x) => x <= nuevo - 0.05);
      const res = resultado.estructuras.find((e) => e.id === est.id);
      const frentes = (res?.info?.frentes as { niveles?: { cota: number }[] }[] | undefined) || [];
      const niveles = frentes[0]?.niveles || [];
      const topeSaliente = Math.max(c.yMax, ...solidosDe(vol!, vols).map((s) => s.yTope));
      const desde = niveles.findIndex((l) => l.cota >= topeSaliente + 0.3);
      if (ok && desde >= 0 && (def.clase === 'marquesina' || def.clase === 'cornisa')) {
        reps.push({
          etiqueta: `Retirar a ${fmt(nuevo)} y acercar con ménsulas de ${fmt(ok)} desde el nivel ${desde + 1}`,
          accion: { tipo: 'lote', acciones: [
            ...accionesRetiro(est, nuevo),
            { tipo: 'param', estructuraId: est.id, ruta: 'params.mensulas', valor: [{ lado: 'fachada', brazo: ok, desdeNivel: desde }] },
            { tipo: 'param', estructuraId: est.id, ruta: 'params.brazoMensula', valor: ok },
          ] as Accion[] },
        });
      }
      reps.push({ etiqueta: `Retirar a ${fmt(nuevo)}`, accion: { tipo: 'lote', acciones: accionesRetiro(est, nuevo) } });
    } else {
      const d = r3(c.profundidad + 0.2);
      reps.push({ etiqueta: `Correr ${fmt(d)} afuera`, accion: { tipo: 'param', estructuraId: est.id, ruta: 'origen', valor: [r3(est.origen[0] + c.normal[0] * d), r3(est.origen[1] + c.normal[1] * d)] } });
    }
    const n = c.piezas.length;
    out.push({
      id: `VC${out.length + 1}`, regla: 'volumen.choque', nivel: 'error', estructuraId: est.id,
      texto: `${est.nombre} choca con ${nomVol} entre ${fmt(c.yMin)} y ${fmt(c.yMax)} (${n} pieza${n > 1 ? 's' : ''}). ${PREDIMENSIONADO}.`,
      reparaciones: reps,
    });
  }
  return out;
}
