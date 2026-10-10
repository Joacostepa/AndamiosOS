// La cuenta del consumo del Pañol: cuánto se llevó cada obra, cuadrilla o persona, neto y
// valorizado. Lógica pura: la usan la ruta /api/panol/consumo, la ficha del artículo (las
// barras de 8 semanas) y los tests (consumo.test.ts).
//
// QUÉ ES CONSUMO. Sólo los insumos se consumen: un retiro de insumo va de un estante a
// "consumo" y la devolución de un sobrante vuelve de "consumo" al estante, con la obra DE LA
// QUE VUELVE (así el sobrante descuenta de esa obra y no de la última). Lo prestado
// (herramientas) no es consumo: sigue a nombre de alguien.
//
// LAS ANULACIONES NO RESTAN: CANCELAN. Una anulación saca de la cuenta a su original y a sí
// misma, aunque se haya cargado otro día. Si el retiro de septiembre se anuló en octubre
// porque era de otra obra, septiembre deja de mostrarlo y octubre no muestra un "−100" que
// nadie se llevó. El informe de un mes cambia hacia atrás, que es lo correcto: se cargó mal.

import { hoyBA } from "./estado.ts";
import type { Movimiento } from "./tipos.ts";

export type MovConsumo = Pick<
  Movimiento,
  "id" | "vale_id" | "tipo" | "articulo_id" | "cantidad" | "desde" | "hacia" | "odoo_ot_id" | "cuadrilla_id"
  | "quien_tipo" | "quien_id" | "anula_a" | "created_at"
>;

export type PorConsumo = "obra" | "cuadrilla" | "persona";

export type ArticuloCosto = { id: string; nombre: string; unidad: string; ultimo_costo: number | null };

export type LineaConsumo = {
  articuloId: string;
  nombre: string;
  unidad: string;
  cantidad: number;
  /** null: el artículo no tiene costo cargado todavía. */
  valor: number | null;
};

export type GrupoConsumo = {
  /** `o:<ot>` · `c:<id>` · `p:<id>`/`x:<id>`, o `sin_obra` / `sin_cuadrilla` / `sin_persona`. */
  clave: string;
  /** Vales de retiro (no anulados) que aportaron al grupo. */
  retiros: number;
  lineas: LineaConsumo[];
  valor: number;
  /** Cuántas líneas no se pudieron valorizar. */
  sinCosto: number;
  /** Quién más retiró (persona → cantidad de vales), de mayor a menor. */
  quienes: { clave: string; retiros: number }[];
  /** En qué obras (OT) se usó: para las vistas por cuadrilla y por persona. */
  obras: number[];
};

export type ResumenConsumo = { grupos: GrupoConsumo[]; valor: number; retiros: number; sinCosto: number };

/** +1 si el movimiento se lleva al consumo, −1 si vuelve de él, 0 si no lo toca. */
export function signoConsumo(m: Pick<MovConsumo, "desde" | "hacia">): 1 | -1 | 0 {
  if (m.hacia === "consumo" && m.desde !== "consumo") return 1;
  if (m.desde === "consumo" && m.hacia !== "consumo") return -1;
  return 0;
}

export const lugarDeQuien = (m: Pick<MovConsumo, "quien_tipo" | "quien_id">) =>
  m.quien_id ? `${m.quien_tipo === "externa" ? "x" : "p"}:${m.quien_id}` : null;

export function claveConsumo(m: MovConsumo, por: PorConsumo): string {
  if (por === "obra") return m.odoo_ot_id ? `o:${m.odoo_ot_id}` : "sin_obra";
  if (por === "cuadrilla") return m.cuadrilla_id ? `c:${m.cuadrilla_id}` : "sin_cuadrilla";
  return lugarDeQuien(m) ?? "sin_persona";
}

/** Los ids anulados: los de la lista más los que se pasen (anulaciones de otro período). */
export function anuladosDe(movs: readonly Pick<MovConsumo, "tipo" | "anula_a">[], extra: Iterable<string> = []): Set<string> {
  const s = new Set(extra);
  for (const m of movs) if (m.tipo === "anulacion" && m.anula_a) s.add(m.anula_a);
  return s;
}

const redondear = (n: number) => Math.round(n * 1000) / 1000;
const SIN = new Set(["sin_obra", "sin_cuadrilla", "sin_persona"]);

/**
 * Agrupa el consumo neto (retiros − sobrantes, sin lo anulado) y lo valoriza con el último
 * costo cargado de cada artículo. Las líneas que dan 0 o menos (devolvieron más de lo que se
 * llevaron en el período) se muestran igual si son negativas: es un dato a mirar, no a tapar.
 */
export function consumo(
  movs: readonly MovConsumo[],
  articulos: readonly ArticuloCosto[],
  por: PorConsumo,
  anuladosExtra: Iterable<string> = [],
): ResumenConsumo {
  const anulados = anuladosDe(movs, anuladosExtra);
  const art = new Map(articulos.map((a) => [a.id, a]));
  type Acum = { cant: Map<string, number>; vales: Set<string>; quien: Map<string, Set<string>>; obras: Set<number> };
  const grupos = new Map<string, Acum>();

  for (const m of movs) {
    if (m.tipo === "anulacion" || anulados.has(m.id)) continue;
    const signo = signoConsumo(m);
    if (signo === 0) continue;
    const clave = claveConsumo(m, por);
    let g = grupos.get(clave);
    if (!g) {
      g = { cant: new Map(), vales: new Set(), quien: new Map(), obras: new Set() };
      grupos.set(clave, g);
    }
    g.cant.set(m.articulo_id, (g.cant.get(m.articulo_id) ?? 0) + signo * Number(m.cantidad));
    if (m.odoo_ot_id) g.obras.add(Number(m.odoo_ot_id));
    if (signo > 0) {
      const vale = m.vale_id ?? m.id;
      g.vales.add(vale);
      const q = lugarDeQuien(m);
      if (q) {
        if (!g.quien.has(q)) g.quien.set(q, new Set());
        g.quien.get(q)!.add(vale);
      }
    }
  }

  const salida: GrupoConsumo[] = [];
  for (const [clave, g] of grupos) {
    const lineas: LineaConsumo[] = [];
    for (const [articuloId, cantidad] of g.cant) {
      const c = redondear(cantidad);
      if (c === 0) continue;
      const a = art.get(articuloId);
      const costo = a?.ultimo_costo ?? null;
      lineas.push({
        articuloId,
        nombre: a?.nombre ?? "Artículo borrado",
        unidad: a?.unidad ?? "u.",
        cantidad: c,
        valor: costo === null ? null : Math.round(c * Number(costo) * 100) / 100,
      });
    }
    if (lineas.length === 0 && g.vales.size === 0) continue;
    lineas.sort((x, y) => (y.valor ?? -Infinity) - (x.valor ?? -Infinity) || y.cantidad - x.cantidad);
    salida.push({
      clave,
      retiros: g.vales.size,
      lineas,
      valor: Math.round(lineas.reduce((s, l) => s + (l.valor ?? 0), 0) * 100) / 100,
      sinCosto: lineas.filter((l) => l.valor === null).length,
      quienes: [...g.quien].map(([q, v]) => ({ clave: q, retiros: v.size })).sort((a, b) => b.retiros - a.retiros),
      obras: [...g.obras].sort((a, b) => a - b),
    });
  }
  // Lo de más plata arriba; "sin obra" / "sin cuadrilla" siempre al final.
  salida.sort((a, b) => Number(SIN.has(a.clave)) - Number(SIN.has(b.clave)) || b.valor - a.valor || b.retiros - a.retiros);

  return {
    grupos: salida,
    valor: Math.round(salida.reduce((s, g) => s + g.valor, 0) * 100) / 100,
    retiros: salida.reduce((s, g) => s + g.retiros, 0),
    sinCosto: salida.reduce((s, g) => s + g.sinCosto, 0),
  };
}

// ─── Por semana (la ficha del artículo) ─────────────────────────────────────

/** El lunes (YYYY-MM-DD) de la semana de una fecha YYYY-MM-DD. */
export function lunesDe(fecha: string): string {
  const d = new Date(fecha.slice(0, 10) + "T00:00:00Z");
  const dia = (d.getUTCDay() + 6) % 7; // lunes = 0
  d.setUTCDate(d.getUTCDate() - dia);
  return d.toISOString().slice(0, 10);
}

export type Semana = { lunes: string; cantidad: number };

/**
 * Consumo neto de un artículo en las últimas `semanas` semanas (la actual incluida, aunque
 * esté por la mitad), por fecha de Buenos Aires. Lo anulado no cuenta.
 */
export function consumoPorSemana(
  movs: readonly MovConsumo[],
  articuloId: string,
  hoy: string,
  semanas = 8,
): Semana[] {
  const anulados = anuladosDe(movs);
  const ultimo = lunesDe(hoy);
  const base = new Date(ultimo + "T00:00:00Z");
  const salida: Semana[] = [];
  for (let i = semanas - 1; i >= 0; i--) {
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() - 7 * i);
    salida.push({ lunes: d.toISOString().slice(0, 10), cantidad: 0 });
  }
  const indice = new Map(salida.map((s, i) => [s.lunes, i]));
  for (const m of movs) {
    if (m.articulo_id !== articuloId || m.tipo === "anulacion" || anulados.has(m.id)) continue;
    const signo = signoConsumo(m);
    if (signo === 0) continue;
    const i = indice.get(lunesDe(hoyBA(new Date(m.created_at))));
    if (i !== undefined) salida[i].cantidad = redondear(salida[i].cantidad + signo * Number(m.cantidad));
  }
  return salida;
}

/**
 * Promedio semanal de las semanas COMPLETAS (sin la actual, que va por la mitad y tiraría el
 * promedio para abajo un lunes a la mañana).
 */
export function promedioSemanal(semanas: readonly Semana[]): number {
  const completas = semanas.slice(0, -1);
  if (completas.length === 0) return 0;
  return redondear(completas.reduce((s, x) => s + Math.max(0, x.cantidad), 0) / completas.length);
}

/** ¿Para cuántas semanas alcanza lo que hay, al ritmo del promedio? null si no se usa. */
export function semanasQueAlcanza(enPanol: number, promedio: number): number | null {
  if (promedio <= 0) return null;
  return Math.max(0, Math.floor((enPanol / promedio) * 10) / 10);
}
