// Calculador de Socios (reservado). Pantalla /direccion/socios.
//
// Qué calcula: retiros por mes y por socio (Jorge, Gabriel) en pesos de cada mes y en USD al
// dólar de cada movimiento; dividendos pagados; retiros en dólares cargados como gasto;
// meses sin pasar a dólares en Odoo; retiros / resultado de gestión de los meses cerrados;
// saldo acumulado de la cuenta particular en USD; cuenta 1608 sin asignar; facturación por
// circuito (Contingencias). Las reglas puras están en socios-reglas.ts (con test).
// Fuente: Odoo-Claude/direccion/datos/finanzas_definiciones.md §6–§7.
//
// SÓLO SE CALCULA CON direccion-socios (servidor.ts no la pide sin permiso) y toda la salida
// va marcada reservada. La semana la consume con resumenSocios() (abajo).

import { tcPromedioMes } from "../dolar.ts";
import { readGroup, searchReadTodo } from "../odoo-lectura.ts";
import { monto, sinDato } from "../formato.ts";
import type { Aviso, Cifra, Decision, Frase, Monto, Oracion } from "../tipos.ts";
import { definirCalculador, type CtxCalculo } from "./contrato.ts";
import { leerResultadoMensual } from "./pyg.ts";
import { codigoDeCuenta, mesDeGrupo } from "./pyg-reglas.ts";
import {
  agregarCircuitos, agregarRetiros, avisosRetiros, CUENTAS_SOCIOS, etiquetaRango, listaMeses, moverMes, retirosSobreResultado, sumarMontos,
  type AgregadoRetiros, type FilaCircuito, type GrupoCircuito, type LineaSocios, type ResultadoMes, type RetirosSobreResultado,
} from "./socios-reglas.ts";

export type DetalleSocios = AgregadoRetiros & {
  /** Año en curso ('AAAA') y mes en curso ('AAAA-MM'). */
  anio: string;
  mesActual: string;
  /** Primer mes con historia en Odoo (el de la primera cotización del dólar). */
  inicio: string;
  /** Retiros + dividendos del año (los dos socios). */
  totalAnio: Monto;
  dividendosAnio: Monto;
  /** Resultado de gestión de cada mes CERRADO (USD al dólar promedio del mes). [] si no se pudo leer. */
  resultado: ResultadoMes[];
  motivoResultado: string | null;
  /** Retiros / resultado de los meses cerrados del año. */
  retSobreRes: (RetirosSobreResultado & { etiqueta: string }) | null;
  /** Últimos 12 meses cerrados (para La semana y el contexto). */
  doce: (RetirosSobreResultado & { etiqueta: string }) | null;
  /** Facturación por circuito (Contingencias). null si no se pudo leer. */
  circuitos: { mes: FilaCircuito[]; doce: FilaCircuito[] } | null;
  motivoCircuitos: string | null;
};

type FilaOdoo = {
  id: number;
  date: string;
  account_id: [number, string] | false;
  move_id: [number, string] | false;
  name: string | false;
  balance: number;
  amount_currency: number;
  currency_id: [number, string] | false;
  create_date: string | false;
  create_uid: [number, string] | false;
};

const CAMPOS_LINEA = ["date", "account_id", "move_id", "name", "balance", "amount_currency", "currency_id", "create_date", "create_uid"];

export function normalizarLinea(f: FilaOdoo): LineaSocios {
  return {
    id: f.id,
    fecha: String(f.date).slice(0, 10),
    codigo: codigoDeCuenta(f.account_id),
    asiento: f.move_id ? f.move_id[1] : "",
    asientoId: f.move_id ? f.move_id[0] : null,
    nombre: f.name || "",
    balance: Number(f.balance) || 0,
    montoMoneda: Number(f.amount_currency) || 0,
    moneda: f.currency_id ? f.currency_id[1] : "ARS",
    creada: f.create_date || null,
    creador: f.create_uid ? f.create_uid[1] : null,
  };
}

/** Líneas de las cuentas de socios (todas las fechas: hacen falta los saldos). `extra` acota el dominio. */
export async function leerLineasSocios(extra: unknown[] = [], cuentas: readonly string[] = CUENTAS_SOCIOS): Promise<LineaSocios[]> {
  const filas = await searchReadTodo<FilaOdoo>(
    "account.move.line",
    [["account_id.code", "in", [...cuentas]], ["parent_state", "=", "posted"], ...extra],
    CAMPOS_LINEA,
    { order: "date asc, id asc" },
  );
  return filas.map(normalizarLinea);
}

/** Facturación sin IVA por diario y mes (los tres circuitos de venta). */
async function leerCircuitos(desde: string, hasta: string): Promise<GrupoCircuito[]> {
  const grupos = await readGroup<Record<string, unknown>>(
    "account.move",
    [["move_type", "in", ["out_invoice", "out_refund"]], ["state", "=", "posted"], ["invoice_date", ">=", desde], ["invoice_date", "<=", hasta]],
    ["amount_untaxed_signed:sum"],
    ["journal_id", "invoice_date:month"],
  );
  const salida: GrupoCircuito[] = [];
  for (const g of grupos) {
    const mes = mesDeGrupo(g, "invoice_date:month");
    const diario = Array.isArray(g.journal_id) ? String(g.journal_id[1]) : null;
    if (mes && diario) salida.push({ diario, mes, ars: Number(g.amount_untaxed_signed) || 0 });
  }
  return salida;
}

/** Primer mes con historia: el de la primera cotización (antes son asientos de apertura). */
export function inicioHistoria(ctx: Pick<CtxCalculo, "dolar" | "hoy">): string {
  return (ctx.dolar[0]?.fecha ?? ctx.hoy).slice(0, 7);
}

const conEtiqueta = (r: RetirosSobreResultado | null) => (r ? { ...r, etiqueta: etiquetaRango(r.desde, r.hasta) } : null);

export const calculador = definirCalculador<DetalleSocios>({
  pantalla: "socios",
  async calcular(ctx) {
    const mesActual = ctx.hoy.slice(0, 7);
    const anio = ctx.hoy.slice(0, 4);
    const inicio = inicioHistoria(ctx);

    // Las líneas son imprescindibles: si Odoo falla acá, que tire (snapshot + banda).
    const [lineas, pyg, circ] = await Promise.all([
      leerLineasSocios(),
      leerResultadoMensual(`${inicio}-01`, ctx.hoy).catch((e: unknown) => (e instanceof Error ? e : new Error(String(e)))),
      leerCircuitos(`${moverMes(mesActual, -11)}-01`, ctx.hoy).catch((e: unknown) => (e instanceof Error ? e : new Error(String(e)))),
    ]);
    const ag = agregarRetiros(lineas, ctx.dolar, { desde: inicio, hasta: mesActual });

    // Resultado de gestión de los meses CERRADOS (el mes en curso no tiene sueldos devengados).
    let resultado: ResultadoMes[] = [];
    let motivoResultado: string | null = null;
    if (pyg instanceof Error) motivoResultado = "No se pudo leer el resultado en Odoo";
    else {
      resultado = Object.values(pyg)
        .filter((m) => m.mes >= inicio && m.mes < mesActual)
        .sort((a, b) => a.mes.localeCompare(b.mes))
        .map((m) => {
          const tcm = tcPromedioMes(ctx.dolar, m.mes);
          return { mes: m.mes, gestion: { ars: Math.round(m.gestion), usd: tcm ? Math.round(m.gestion / tcm) : null } };
        });
    }

    const delAnio = ag.meses.filter((m) => m.mes.startsWith(anio));
    const cerradosAnio = delAnio.filter((m) => !m.parcial);
    const retSobreRes = conEtiqueta(retirosSobreResultado(cerradosAnio, resultado));
    const doce = conEtiqueta(retirosSobreResultado(ag.meses.filter((m) => !m.parcial && m.mes >= moverMes(mesActual, -12)), resultado));
    const totalAnio = sumarMontos(delAnio.map((m) => m.total));
    const dividendosAnio = sumarMontos(ag.socios.map((s) => s.anio.dividendos));

    const detalle: DetalleSocios = {
      ...ag,
      anio,
      mesActual,
      inicio,
      totalAnio,
      dividendosAnio,
      resultado,
      motivoResultado,
      retSobreRes,
      doce,
      circuitos: circ instanceof Error ? null : agregarCircuitos(circ, mesActual),
      motivoCircuitos: circ instanceof Error ? "No se pudo leer la facturación por circuito en Odoo" : null,
    };

    const sinDol = ag.mesesSinDolarizar;
    const confRetiros = sinDol.length
      ? { nivel: "inc" as const, motivo: `${listaMeses(sinDol)} sin pasar a dólares en Odoo`, desde: `${sinDol[0]}-01` }
      : ag.sinDolar > 0
        ? { nivel: "inc" as const, motivo: "Movimientos sin cotización del dólar para su fecha" }
        : { nivel: "ok" as const };

    const cifras: Cifra[] = [
      {
        kpi: "retiros",
        id: "retiros_anio",
        reservado: true,
        regla: "socios",
        valor: delAnio.length ? monto(totalAnio.ars, totalAnio.usd) : sinDato(`Todavía no hay movimientos en ${anio}`),
        confianza: confRetiros,
        contexto: ["Incluye dividendos ", { valor: { tipo: "monto", monto: dividendosAnio } }],
      },
      {
        kpi: "resultado",
        id: "retiros_resultado",
        reservado: true,
        valor: retSobreRes?.pctUsd != null
          ? { tipo: "pct", n: retSobreRes.pctUsd, decimales: 1 }
          : sinDato(motivoResultado ?? (cerradosAnio.length ? "El resultado de esos meses no es positivo" : `Todavía no hay meses cerrados en ${anio}`)),
        confianza: { nivel: "inc", motivo: "El resultado no tiene amortización" },
        ...(retSobreRes ? { contexto: ["Resultado de gestión ", { valor: { tipo: "monto", monto: retSobreRes.resultado } }, " · meses cerrados"] as Frase } : {}),
      },
      {
        kpi: "retiros",
        id: "retiros_caja",
        reservado: true,
        valor: sinDato("Falta el flujo de caja histórico"),
        confianza: { nivel: "inc", motivo: "El flujo existe sólo hacia adelante" },
      },
    ];

    return { cifras, detalle, avisos: avisosRetiros(ag, mesActual) };
  },
});

// ─── Para La semana ─────────────────────────────────────────────────────────────────────

export type ResumenSocios = {
  /** Tarjeta 7 "¿Cuánto retiramos?": retirado en el año, incluye dividendos (reservada). */
  cifra: Cifra;
  /** Pie de la narrativa (reservadas): retiros / resultado del año y meses sin dolarizar. */
  oraciones: Oracion[];
  /** Hoy Socios no genera decisiones (la política no existe); queda el lugar. */
  decisiones: Decision[];
  /** Avisos de calidad de retiros (reservados), para el panel de Calidad. */
  avisos: Aviso[];
  /** Retiros / resultado de los meses cerrados del año, en % (USD). null = sin dato. */
  pctResultado: number | null;
  /** Meses sin pasar a dólares en Odoo ('AAAA-MM'). */
  mesesSinDolarizar: string[];
};

/**
 * Lo que La semana toma de Socios. TODO lo que devuelve está marcado `reservado: true`: el
 * servidor lo recorta a quien no tiene direccion-socios (reservado.ts).
 *
 *   const s = await ctx.pantalla<DetalleSocios>("socios");   // cacheado, sin recortar
 *   const { cifra, oraciones, avisos } = resumenSocios(s);
 *   // tarjeta: <TarjetaPregunta cifra={cifra} ancha pregunta="Retiros de socios 🔒" titulo="Retirado en 2026 (incluye dividendos)" />
 *
 * Si Socios falla (Odoo), envolvé el ctx.pantalla en try/catch y no muestres la tarjeta.
 */
export function resumenSocios(r: { cifras: Cifra[]; detalle: DetalleSocios; avisos: Aviso[] }): ResumenSocios {
  const d = r.detalle;
  const base = r.cifras.find((c) => c.id === "retiros_anio");
  const cifra: Cifra = base
    ? { ...base, reservado: true, nodo: { tipo: "retiros" } }
    : { kpi: "retiros", id: "retiros_anio", reservado: true, valor: sinDato("No se pudo calcular"), confianza: { nivel: "inc" } };
  const oraciones: Oracion[] = [];
  if (d.retSobreRes && d.retSobreRes.pctUsd != null) {
    oraciones.push({
      id: "retiros_anio",
      prioridad: 40,
      reservado: true,
      frase: [
        `En ${d.anio} los socios retiraron `,
        { valor: { tipo: "monto", monto: d.totalAnio }, nodo: { tipo: "retiros" } },
        `; en ${d.retSobreRes.etiqueta} fue el `,
        { valor: { tipo: "pct", n: d.retSobreRes.pctUsd } },
        " del resultado.",
      ],
    });
  }
  if (d.mesesSinDolarizar.length) {
    oraciones.push({ id: "retiros_sin_dolarizar", frase: [`Retiros de ${listaMeses(d.mesesSinDolarizar)} todavía sin pasar a dólares en Odoo.`], prioridad: 20, reservado: true });
  }
  return {
    cifra,
    oraciones,
    decisiones: [],
    avisos: r.avisos.map((a) => ({ ...a, reservado: true })),
    pctResultado: d.retSobreRes?.pctUsd ?? null,
    mesesSinDolarizar: d.mesesSinDolarizar,
  };
}
