// Los contratistas de la Hoja del día (mano de obra tercerizada): lo que se dice de ellos en
// la tarjeta y en el panel Gente, y el resumen del mes para pagarles.
//
// DECISIONES DEL DUEÑO (10/10, noche): los contratistas no son empleados (ni Legajos ni
// Odoo); de su gente sólo se sabe la cantidad; van dentro de las cuadrillas del tablero
// (solos o con gente nuestra); se les paga por persona y jornada; el parte de Odoo no
// cambia (su gente cuenta en "cantidad de personas" como la nuestra). La cuenta del día
// (cuántos van, a cargo, problemas, precarga, diferencias) está en estado.ts; acá, lo que
// es sólo de ellos.
//
// PURO (sin React ni servidor), con tests (contratistas.test.ts). Imports relativos y con
// extensión: corre en `node --test` sin Next.

import type { Contratista, DiaHoja, Fecha } from "./tipos.ts";
import {
  aCargoContratista, aCargoDeContratista, cantidadDe, cuadrillasActivas, cuadrillasDeContratista, contratistasDe, ddmm,
  diaSemana, hojaDeCuadrilla, laC, nombreDe, prevista, vanDe,
} from "./estado.ts";

// ═══════════════════════════ La tarjeta ═══════════════════════════════════════

/** Un chip de contratista en la tarjeta: "+3 de Quintana", con su marca. */
export type ChipContratista = {
  contratistaId: string;
  nombre: string;
  cantidad: number;
  /** "+3 de Quintana" o "Quintana · ¿cuántos?". */
  texto: string;
  aCargo: boolean;
  /** "a cargo", "¿cuántos?", "de baja" o null. */
  tag: string | null;
  nota: string | null;
  baja: boolean;
};

export function chipsContratistas(dia: DiaHoja, c: number): ChipContratista[] {
  const h = hojaDeCuadrilla(dia, c);
  const cargo = aCargoContratista(h);
  return contratistasDe(h).map((x) => {
    const k = dia.contratistas.find((y) => y.id === x.contratistaId);
    const nombre = k?.nombre ?? "Contratista";
    const baja = k?.activo === false;
    const aCargo = cargo === x.contratistaId;
    return {
      contratistaId: x.contratistaId, nombre, cantidad: x.cantidad,
      texto: x.cantidad > 0 ? `+${x.cantidad} de ${nombre}` : nombre,
      aCargo, tag: x.cantidad === 0 ? "¿cuántos?" : aCargo ? "a cargo" : baja ? "de baja" : null, nota: x.nota, baja,
    };
  });
}

/** "3 de Quintana" (para "Quiénes van 5 de 5 (3 de Quintana)"). null si no van contratistas. */
export function resumenContratistas(dia: DiaHoja, c: number): string | null {
  const xs = contratistasDe(hojaDeCuadrilla(dia, c));
  return xs.length ? xs.map((x) => cantidadDe(dia, x)).join(" y ") : null;
}

/**
 * "Van: 3 de Quintana + Ramírez, Pérez" — los de los contratistas primero y después los
 * nuestros por nombre. Es lo que lee el referente en su celular y en el mensaje.
 */
export function vanEnPalabras(dia: DiaHoja, c: number, gente: string[]): string {
  const ks = contratistasDe(hojaDeCuadrilla(dia, c)).map((x) => cantidadDe(dia, x));
  const ns = gente.map((p) => nombreDe(dia, p)).filter(Boolean);
  if (!ks.length) return ns.join(", ");
  return [ks.join(" + "), ns.join(", ")].filter(Boolean).join(" + ");
}

// ═══════════════════════════ El panel Gente ═══════════════════════════════════

export type LineaContratista = {
  id: string;
  nombre: string;
  /** "en la 4 (3) · a cargo" / "sin cuadrilla" */
  t: string;
  /** Cuántos van en total ese día (sumando todas las cuadrillas). */
  total: number;
  enUso: boolean;
};

/** Los contratistas activos (y los de baja que igual figuran ese día), para el grupo "Contratistas". */
export function panelContratistas(dia: DiaHoja): LineaContratista[] {
  return dia.contratistas
    .filter((k) => k.activo || cuadrillasDeContratista(dia, k.id).length > 0)
    .map((k) => {
      const en = cuadrillasDeContratista(dia, k.id);
      const cargo = aCargoDeContratista(dia, k.id);
      const total = en.reduce((s, x) => s + x.cantidad, 0);
      const t = en.length
        ? en.map((x) => `${laC(dia, x.c)} (${x.cantidad || "¿?"})${cargo === x.c ? " a cargo" : ""}`).join(" · ").replace(/^la /, "en la ")
        : k.activo ? "sin cuadrilla" : "dado de baja";
      return { id: k.id, nombre: k.nombre, t, total, enUso: en.length > 0 };
    })
    .sort((a, b) => Number(b.enUso) - Number(a.enUso) || a.nombre.localeCompare(b.nombre, "es"));
}

/** Las cuadrillas a las que se puede sumar gente de un contratista, con "van 3 de 5" y cuántos de él ya hay. */
export function destinosContratista(dia: DiaHoja, kid: string): { c: number; detalle: string; yaVan: number }[] {
  return cuadrillasActivas(dia).map((c) => {
    const ya = contratistasDe(hojaDeCuadrilla(dia, c)).find((x) => x.contratistaId === kid)?.cantidad ?? 0;
    return { c, detalle: `${vanDe(dia, c)} de ${prevista(dia, c)}${ya ? ` · ya van ${ya}` : ""}`, yaVan: ya };
  });
}

// ═══════════════════════════ El resumen del mes ═══════════════════════════════

/** Una fila de hd_hoja_contratistas con su día, su cuadrilla y las obras del tablero de ese día. */
export type JornadaContratista = {
  fecha: Fecha;
  cuadrillaOdooId: number;
  cuadrilla: string;
  contratistaId: string;
  cantidad: number;
  /** Las obras de la cuadrilla ese día, con su fracción de jornada (para prorratear). */
  obras: { otId: number; nombre: string; fraccion: number }[];
};

export type ResumenContratista = {
  id: string;
  nombre: string;
  referente: string | null;
  valorJornada: number | null;
  /** Jornadas-persona del mes: la suma de las cantidades de cada día y cuadrilla. */
  jornadas: number;
  /** Días distintos en que fue gente suya. */
  dias: number;
  /** jornadas × valor por jornada; null si no tiene valor cargado. */
  total: number | null;
  /** "0 sin cantidad": filas con cantidad 0 (no suman: falta cargar cuántos fueron). */
  sinCantidad: number;
  detalle: { fecha: Fecha; dia: string; cuadrilla: string; cantidad: number; obras: string }[];
  /**
   * Prorrateo por obra: en un día con varias obras, la cantidad se reparte por la fracción
   * de jornada de cada obra (2 personas en ½ + ½ = 1 jornada-persona en cada una). Las del
   * día sin obras en el tablero van a "Sin obra en el tablero".
   */
  porObra: { otId: number | null; nombre: string; jornadas: number }[];
};

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * El resumen de un mes por contratista (decisión 4: se le paga por persona y jornada). Un
 * contratista en dos cuadrillas el mismo día suma las dos.
 */
export function resumenMes(contratistas: Contratista[], filas: JornadaContratista[]): ResumenContratista[] {
  const out: ResumenContratista[] = [];
  for (const k of contratistas) {
    const mias = filas.filter((f) => f.contratistaId === k.id).sort((a, b) => a.fecha.localeCompare(b.fecha) || a.cuadrillaOdooId - b.cuadrillaOdooId);
    if (!mias.length) continue;
    const jornadas = mias.reduce((s, f) => s + f.cantidad, 0);
    const obras = new Map<string, { otId: number | null; nombre: string; jornadas: number }>();
    for (const f of mias) {
      const sum = f.obras.reduce((s, o) => s + (o.fraccion > 0 ? o.fraccion : 0), 0);
      if (!f.obras.length || sum <= 0) {
        const x = obras.get("-") ?? { otId: null, nombre: "Sin obra en el tablero", jornadas: 0 };
        x.jornadas += f.cantidad;
        obras.set("-", x);
        continue;
      }
      for (const o of f.obras) {
        const x = obras.get(String(o.otId)) ?? { otId: o.otId, nombre: o.nombre, jornadas: 0 };
        x.jornadas += (f.cantidad * Math.max(0, o.fraccion)) / sum;
        obras.set(String(o.otId), x);
      }
    }
    out.push({
      id: k.id, nombre: k.nombre, referente: k.referente, valorJornada: k.valorJornada, jornadas,
      dias: new Set(mias.filter((f) => f.cantidad > 0).map((f) => f.fecha)).size,
      total: k.valorJornada != null ? r2(jornadas * k.valorJornada) : null,
      sinCantidad: mias.filter((f) => f.cantidad === 0).length,
      detalle: mias.map((f) => ({
        fecha: f.fecha, dia: `${diaSemana(f.fecha)} ${ddmm(f.fecha)}`, cuadrilla: f.cuadrilla, cantidad: f.cantidad,
        obras: f.obras.map((o) => o.nombre).join(" · ") || "sin obra en el tablero",
      })),
      porObra: [...obras.values()].map((x) => ({ ...x, jornadas: r2(x.jornadas) })).sort((a, b) => b.jornadas - a.jornadas),
    });
  }
  return out.sort((a, b) => b.jornadas - a.jornadas || a.nombre.localeCompare(b.nombre, "es"));
}

/** "$ 1.250.000" (pesos, sin decimales si no hacen falta). */
export function pesos(n: number): string {
  return `$ ${n.toLocaleString("es-AR", { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })}`;
}

/** "octubre 2026" */
export function mesTexto(mes: string): string {
  const [a, m] = mes.split("-").map(Number);
  const nombres = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  return `${nombres[(m ?? 1) - 1] ?? ""} ${a}`;
}

/** El primer y el último día de un mes "2026-10". */
export function rangoMes(mes: string): { desde: Fecha; hasta: Fecha } {
  const [a, m] = mes.split("-").map(Number);
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return { desde: `${mes}-01`, hasta: `${mes}-${String(ultimo).padStart(2, "0")}` };
}

/** "25.000", "25000", "$ 25.000,50" → 25000 / 25000.5. "" → null; algo que no es un número → NaN. */
export function leerPesos(txt: string): number | null {
  const t = txt.replace(/[$\s]/g, "");
  if (!t) return null;
  const limpio = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : /^\d{1,3}(\.\d{3})+$/.test(t) ? t.replace(/\./g, "") : t;
  return /^\d+(\.\d{1,2})?$/.test(limpio) ? Number(limpio) : NaN;
}
