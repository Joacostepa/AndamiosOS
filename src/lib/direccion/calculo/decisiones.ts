// "Para decidir esta semana" (diseno.md §4.6 y maqueta decs()/renderDecisiones()).
// Reglas puras con test (decisiones.test.ts). Las decisiones las arma cada área en su
// resumen<Area>(); acá se juntan, se ordenan y se cruzan con lo guardado en Supabase
// (dueño vigente y notas). Nada se inventa.
//
//  · Severidad: ⬤ rojo (plata en riesgo o atraso > 90 días), ▲ ámbar (pasa en ≤ 8 semanas),
//    ● gris (informativo). Ícono + texto, nunca sólo color.
//  · Orden: severidad, después las que tienen fecha (la más próxima primero), después el
//    orden en que llegaron (estable).
//  · Máximo 5 visibles; el resto en "Ver todas (n)".
//  · Dueño: el guardado (direccion_duenos) gana; si no hay fila, el sugerido por la regla.
//    Una fila con dueño null es "sin dueño" a propósito.

import { diasEntre, fdia } from "../formato.ts";
import type { Decision, Severidad } from "../tipos.ts";

export const MAX_VISIBLES = 5;

export const SEV_ORDEN: Record<Severidad, number> = { rojo: 0, ambar: 1, gris: 2 };
export const SEV_ICONO: Record<Severidad, string> = { rojo: "⬤", ambar: "▲", gris: "●" };
export const SEV_TEXTO: Record<Severidad, string> = { rojo: "Plata en riesgo", ambar: "Pasa en ≤ 8 semanas", gris: "Informativo" };

/** Las personas que pueden ser dueñas de una decisión (socios + gerencia). */
export { DUENOS } from "../propios.ts";

/** Junta las decisiones de las áreas: sin repetidas (gana la primera) y ordenadas. */
export function ordenarDecisiones(listas: Decision[][]): Decision[] {
  const vistas = new Set<string>();
  const todas: { d: Decision; i: number }[] = [];
  for (const l of listas) {
    for (const d of l) {
      if (vistas.has(d.id)) continue;
      vistas.add(d.id);
      todas.push({ d, i: todas.length });
    }
  }
  todas.sort((a, b) => SEV_ORDEN[a.d.sev] - SEV_ORDEN[b.d.sev] || (a.d.vence ?? "9999").localeCompare(b.d.vence ?? "9999") || a.i - b.i);
  return todas.map((x) => x.d);
}

/** Las que se ven sin "Ver todas". */
export const visibles = (ds: Decision[], todas: boolean): Decision[] => (todas ? ds : ds.slice(0, MAX_VISIBLES));

/** "vence vie 16/10 · mañana". null si no tiene fecha. */
export function textoVence(vence: string | null, hoy: string): string | null {
  if (!vence) return null;
  const n = diasEntre(hoy, vence);
  const cuando = n < 0 ? `hace ${-n} ${n === -1 ? "día" : "días"}` : n === 0 ? "hoy" : n === 1 ? "mañana" : `en ${n} días`;
  return `${n < 0 ? "venció" : "vence"} ${fdia(vence)} · ${cuando}`;
}

/** El dueño vigente: lo guardado gana (aunque sea null = sin dueño); si no, el sugerido. */
export function duenoVigente(d: Pick<Decision, "id" | "duenoSugerido">, duenos: Record<string, string | null>): string | null {
  return Object.prototype.hasOwnProperty.call(duenos, d.id) ? duenos[d.id] : d.duenoSugerido;
}

export type NotaDecision = { id: string; alertaId: string; texto: string; dueno: string | null; reunion: boolean; autor: string | null; fecha: string };

/** Las notas de una decisión, de la más vieja a la más nueva (se leen como un acta). */
export function notasDe(id: string, notas: NotaDecision[]): NotaDecision[] {
  return notas.filter((n) => n.alertaId === id).sort((a, b) => a.fecha.localeCompare(b.fecha));
}

/**
 * Lo que viaja al cliente de Supabase: sólo los dueños y las notas de las decisiones que
 * esa persona ve (las reservadas ya se recortaron), así no se filtra nada por el costado.
 */
export function propiosDeDecisiones<N extends { alertaId: string }>(ids: string[], duenos: Record<string, string | null>, notas: N[]): { duenos: Record<string, string | null>; notas: N[] } {
  const set = new Set(ids);
  return {
    duenos: Object.fromEntries(Object.entries(duenos).filter(([k]) => set.has(k))),
    notas: notas.filter((n) => set.has(n.alertaId)),
  };
}

// ─── Lo reservado de lo que se guarda (notas y dueños) ─────────────────────────────────

/** Cómo es una decisión en La semana SIN recortar (todas sus versiones). */
export type MarcaDecision = { existe: boolean; reservado: boolean; versionSocios: boolean };

/** La marca de `id` entre las decisiones sin recortar de La semana. */
export function marcaDe(id: string, decisiones: readonly Pick<Decision, "id" | "reservado" | "soloConSocios">[]): MarcaDecision {
  const ds = decisiones.filter((d) => d.id === id);
  return { existe: ds.length > 0, reservado: ds.some((d) => !!d.reservado), versionSocios: ds.some((d) => !!d.soloConSocios) };
}

export type Reserva = { ok: true; reservado: boolean } | { ok: false; status: number; error: string };

/**
 * ¿La nota de esta persona sobre esta decisión es reservada? La decide el SERVIDOR, no el
 * navegador: reservada si la decisión es de socios, o si quien anota es socio y está viendo
 * la versión de socios (p. ej. la cobertura con retiros: la nota puede citar esas cifras).
 * `marca` null = no se pudo leer La semana (Odoo caído): a un socio se le guarda reservada
 * (ante la duda, cerrado); a los demás se les pide reintentar.
 */
export function reservaDeNota(marca: MarcaDecision | null, conSocios: boolean): Reserva {
  if (!marca) return conSocios ? { ok: true, reservado: true } : { ok: false, status: 503, error: "No pudimos confirmar la decisión con Odoo. Probá de nuevo en un rato." };
  if (!marca.existe) return { ok: false, status: 409, error: "Esa decisión ya no está abierta. Actualizá la pantalla." };
  if (marca.reservado && !conSocios) return { ok: false, status: 403, error: "No tenés acceso a esa sección." };
  return { ok: true, reservado: marca.reservado || (conSocios && marca.versionSocios) };
}

/** El dueño de una decisión es reservado si la decisión es de socios (el nombre no cita cifras). */
export function reservaDeDueno(marca: MarcaDecision | null, conSocios: boolean): Reserva {
  if (!marca) return { ok: false, status: 503, error: "No pudimos confirmar la decisión con Odoo. Probá de nuevo en un rato." };
  if (!marca.existe) return { ok: false, status: 409, error: "Esa decisión ya no está abierta. Actualizá la pantalla." };
  if (marca.reservado && !conSocios) return { ok: false, status: 403, error: "No tenés acceso a esa sección." };
  return { ok: true, reservado: marca.reservado };
}

/** Título del cierre de la reunión: "3 acuerdos, 2 dueños". */
export function tituloCierre(notas: { dueno: string | null }[]): string {
  const duenos = new Set(notas.map((n) => n.dueno).filter(Boolean)).size;
  return `${notas.length} ${notas.length === 1 ? "acuerdo" : "acuerdos"}, ${duenos} ${duenos === 1 ? "dueño" : "dueños"}`;
}

/** "Copiar resumen" del cierre de la reunión. Las notas reservadas no salen. */
export function resumenReunion(
  fechaLarga: string,
  notas: { pregunta: string; texto: string; dueno: string | null; reservado?: boolean }[],
): string {
  const lineas = notas.filter((n) => !n.reservado).map((n) => `• ${n.pregunta} ${n.texto} (${n.dueno || "sin dueño"})`);
  return `Reunión de socios ${fechaLarga}\n${lineas.join("\n") || "Sin acuerdos anotados."}`;
}
