// Narrativa de La semana ("Esta semana: …", diseno.md §4.3 y maqueta narrativa()).
// Reglas puras, deterministas y con test (narrativa.test.ts): el mismo dato da la misma frase.
//
//  · Siempre van la oración de facturación ("fact", de Ventas) y la de caja ("caja", de Caja),
//    en ese orden, aunque sean neutras. Si una no se pudo calcular, la oración lo DICE (con el
//    motivo) en vez de omitirla: nunca un 0.
//  · Después, hasta 2 candidatas por prioridad (de mayor a menor) entre las que mandan las
//    áreas con `resumen<Area>()`. Nada se inventa acá: cada cifra viene del área.
//  · Sin candidatas: "Sin alertas nuevas esta semana."
//  · Lo reservado (retiros) NUNCA entra al cuerpo: va al pie, marcado `reservado`, y el
//    servidor lo recorta a quien no tiene direccion-socios (reservado.ts).
//
// Sin imports de Next ni de Supabase: lo leen los tests de node.

import { fraseAPlano, fcorta, lunesDe, type CtxFormato } from "../formato.ts";
import type { Frase, Oracion } from "../tipos.ts";

/** Cuántas candidatas se suman a las dos fijas (maqueta: 2). */
export const MAX_CANDIDATAS = 2;

/** Umbral de notas de crédito para la candidata "nc" (§4.3: % NC del mes > 15 %). */
export const UMBRAL_NC_PCT = 15;

export const FIJAS = ["fact", "caja"] as const;

export type EntradaNarrativa = {
  /** La oración "fact" de Ventas, o el motivo por el que no se pudo calcular. */
  fact: Oracion | { motivo: string };
  /** La oración "caja" de Caja, o el motivo. */
  caja: Oracion | { motivo: string };
  /** Las candidatas de todas las áreas (las fijas y las reservadas se descartan solas). */
  candidatas: Oracion[];
  /** Las oraciones de Socios: van al pie, siempre reservadas. */
  pie: Oracion[];
};

const esOracion = (o: Oracion | { motivo: string }): o is Oracion => "frase" in o;

/** La oración fija cuando el área no respondió: lo dice, con el motivo. */
function fijaSinDato(id: "fact" | "caja", motivo: string): Oracion {
  const que = id === "fact" ? "No pudimos calcular la facturación del mes" : "No pudimos calcular la caja disponible";
  return { id, prioridad: 100, frase: [`${que}: `, { valor: { tipo: "sin_dato", motivo } }, "."] };
}

/** Orden de las candidatas: prioridad (mayor primero) y, a igual prioridad, el id (estable). */
export function ordenarCandidatas(cand: Oracion[]): Oracion[] {
  return [...cand].sort((a, b) => (b.prioridad ?? 0) - (a.prioridad ?? 0) || a.id.localeCompare(b.id));
}

/**
 * Arma la narrativa. Devuelve las oraciones en orden: cuerpo (2 fijas + hasta 2 candidatas,
 * o "Sin alertas nuevas") y después el pie reservado. La UI pinta en el pie las `reservado`.
 */
export function armarNarrativa(e: EntradaNarrativa): Oracion[] {
  const fact = esOracion(e.fact) ? { ...e.fact, id: "fact", reservado: false } : fijaSinDato("fact", e.fact.motivo);
  const caja = esOracion(e.caja) ? { ...e.caja, id: "caja", reservado: false } : fijaSinDato("caja", e.caja.motivo);
  const vistos = new Set<string>(FIJAS);
  const cand: Oracion[] = [];
  for (const o of ordenarCandidatas(e.candidatas)) {
    if (o.reservado || vistos.has(o.id)) continue;
    vistos.add(o.id);
    cand.push(o);
  }
  const cuerpo: Oracion[] = [fact, caja, ...cand.slice(0, MAX_CANDIDATAS)];
  if (!cand.length) cuerpo.push({ id: "tranquila", frase: ["Sin alertas nuevas esta semana."] });
  const pie = ordenarCandidatas(e.pie).map((o) => ({ ...o, reservado: true }));
  return [...cuerpo, ...pie];
}

/**
 * Candidata de notas de crédito (§4.3, prioridad 60): "Las notas de crédito son el x % de lo
 * facturado este mes." Sólo si el % de NC reales supera el umbral. null si no aplica o no hay dato.
 */
export function oracionNc(pctReales: number | null | undefined): Oracion | null {
  if (pctReales == null || !Number.isFinite(pctReales) || pctReales <= UMBRAL_NC_PCT) return null;
  return {
    id: "nc",
    prioridad: 60,
    frase: ["Las notas de crédito son el ", { valor: { tipo: "pct", n: pctReales }, kpi: "pct_nc" }, " de lo facturado este mes."],
  };
}

/** El cuerpo de la narrativa (sin el pie reservado). */
export const cuerpoNarrativa = (o: Oracion[]): Oracion[] => o.filter((x) => !x.reservado);
/** El pie (reservado: sólo llega a quien tiene direccion-socios). */
export const pieNarrativa = (o: Oracion[]): Oracion[] => o.filter((x) => x.reservado);

/** La narrativa en texto plano (modo reunión, aria). Sin el pie. */
export function narrativaPlana(o: Oracion[], ctx: CtxFormato): string {
  return cuerpoNarrativa(o).map((x) => fraseAPlano(x.frase, ctx)).join(" ");
}

/**
 * El texto de "Compartir" (WhatsApp o mail): la semana, la narrativa SIN nada de socios
 * (aunque quien comparte tenga el permiso) y el link.
 */
export function textoCompartir(o: Oracion[], ctx: CtxFormato, hoy: string, url: string): string {
  return `Dirección · semana del ${fcorta(lunesDe(hoy))}\n${narrativaPlana(o, ctx)}\n${url}`;
}

/** ¿La frase tiene alguna cifra sin dato? (para avisar en la UI). */
export const fraseConSinDato = (f: Frase): boolean => f.some((p) => typeof p !== "string" && p.valor.tipo === "sin_dato");
