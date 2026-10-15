/**
 * Volumen de contexto para las tipologías que dependen de uno (colgante, torre en azotea, sobre escalera,
 * hueco de escalera): si el diseño no tiene uno compatible, se arma con las medidas de la estructura para
 * que el contexto se vea en el 3D y la estructura quede vinculada (no hay que tipear un id).
 */
import type { Diseno, Estructura, Poligono, V2, Volumen } from '../tipos.ts';
import { normalizarEscalera } from '../tipologias/sobre-escalera.ts';
import { perfilDeEscalera } from '../tipologias/nuevas-comunes.ts';
import { r3 } from '../util.ts';

export type TipoVolumen = Volumen['tipo'];

/** Volúmenes del contexto que sirven para el campo (por tipo). */
export function volumenesCompatibles(diseno: Diseno, tipos: TipoVolumen[]): Volumen[] {
  return (diseno.contexto?.volumenes ?? []).filter((v) => tipos.includes(v.tipo) || (tipos.includes('escalera') && !!v.escalera));
}

const proximoId = (d: Diseno, pref: string) => {
  const usados = new Set((d.contexto?.volumenes ?? []).map((v) => v.id));
  let n = 1;
  while (usados.has(`${pref}${n}`)) n++;
  return `${pref}${n}`;
};

/** Rectángulo en mundo desde (s, t) locales de la estructura. */
function rect(est: Estructura, s0: number, t0: number, s1: number, t1: number): Poligono {
  const r = (est.rumbo * Math.PI) / 180;
  const u: V2 = [Math.cos(r), Math.sin(r)];
  const n: V2 = [-u[1], u[0]];
  const P = (s: number, t: number): V2 => [r3(est.origen[0] + u[0] * s + n[0] * t), r3(est.origen[1] + u[1] * s + n[1] * t)];
  return [P(s0, t0), P(s1, t0), P(s1, t1), P(s0, t1)];
}

/**
 * El volumen que corresponde a la estructura (o null si la tipología no usa uno). `huella` es la huella
 * en mundo de la estructura ya construida (para dimensionar la losa o la azotea).
 */
export function volumenSugerido(diseno: Diseno, est: Estructura, tipos: TipoVolumen[], huella: Poligono = []): Volumen | null {
  const p = est.params as Record<string, unknown>;
  const num = (k: string, def: number) => (typeof p[k] === 'number' && Number.isFinite(p[k] as number) ? (p[k] as number) : def);
  if (tipos.includes('escalera')) {
    const e = normalizarEscalera(p.escalera);
    const perfil = perfilDeEscalera(e).slice(1);
    const largo = r3(Math.max(num('largo', 3), (perfil.at(-1)?.s ?? e.inicio) + e.huella + 0.3));
    const ancho = num('ancho', 1.2);
    return {
      id: proximoId(diseno, 'ESC'), tipo: 'escalera', nombre: 'Escalera', planta: rect(est, Math.min(0, e.inicio), 0, largo, ancho),
      yBase: e.y0 ?? 0, yTope: r3((e.y0 ?? 0) + e.peldanos * e.contrahuella),
      escalera: { origen: [est.origen[0], est.origen[1]], rumbo: est.rumbo, peldanos: perfil.map((t, i) => ({ s: t.s, huella: e.huella, contrahuella: r3(t.y - (i ? perfil[i - 1].y : e.y0 ?? 0)) })), descansos: [] },
    };
  }
  const xs = huella.map((q) => q[0]);
  const zs = huella.map((q) => q[1]);
  const caja = (m: number): Poligono => (huella.length
    ? [[r3(Math.min(...xs) - m), r3(Math.min(...zs) - m)], [r3(Math.max(...xs) + m), r3(Math.min(...zs) - m)], [r3(Math.max(...xs) + m), r3(Math.max(...zs) + m)], [r3(Math.min(...xs) - m), r3(Math.max(...zs) + m)]]
    : rect(est, -m, -m, num('largo', 5) + m, num('ancho', 2.5) + m));
  if (est.tipologia === 'colgante') {
    const cota = num('cotaSoporte', 6);
    const puente = p.soporte === 'acero' || !tipos.includes('losa');
    return { id: proximoId(diseno, puente ? 'PTE' : 'LOSA'), tipo: puente ? 'puente' : 'losa', nombre: puente ? 'Puente' : 'Losa', planta: caja(1), yBase: cota, yTope: r3(cota + (puente ? 0.8 : 0.25)) };
  }
  if (tipos.includes('edificio')) {
    const cota = num('cotaApoyo', 0) > 0.5 ? num('cotaApoyo', 0) : 12;
    return { id: proximoId(diseno, 'ED'), tipo: 'edificio', nombre: 'Edificio (azotea)', planta: caja(2), yBase: 0, yTope: cota };
  }
  if (tipos.includes('losa')) {
    return { id: proximoId(diseno, 'LOSA'), tipo: 'losa', nombre: 'Losa', planta: caja(1), yBase: num('cotaApoyo', 3), yTope: r3(num('cotaApoyo', 3) + 0.25) };
  }
  return null;
}

/** Agrega el volumen sugerido y vincula la estructura (`params.volumenId`). Devuelve el diseño nuevo. */
export function vincularVolumenSugerido(diseno: Diseno, estructuraId: string, tipos: TipoVolumen[], huella: Poligono = []): Diseno {
  const d: Diseno = structuredClone(diseno);
  const est = d.estructuras.find((e) => e.id === estructuraId);
  if (!est) return diseno;
  const v = volumenSugerido(d, est, tipos, huella);
  if (!v) return diseno;
  d.contexto = { ...d.contexto, volumenes: [...(d.contexto?.volumenes ?? []), v] };
  est.params = { ...est.params, volumenId: v.id };
  return d;
}
