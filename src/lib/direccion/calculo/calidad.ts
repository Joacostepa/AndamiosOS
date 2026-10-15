// Calidad de los datos (diseno.md §9.2): lee de Odoo (sólo lectura) lo que necesita cada
// detector, corre los detectores puros (calidad-reglas.ts) y suma los avisos cargados a mano
// en Supabase (direccion_avisos_calidad). Lo usa el calculador de Datos y definiciones.
//
// Cada detector es independiente: si una lectura falla, ese detector no corre y queda en
// `sinRevisar` (la pantalla lo dice). Si fallan TODAS, tira: servidor.ts muestra el último
// snapshot con la banda "No pudimos leer Odoo".
//
// Los avisos de retiros (reservados) salen del resultado de Socios (ctx.pantalla("socios")):
// el recorte por usuario lo hace servidor.ts después de la caché.

import { readGroup, searchCount, searchRead, OdooError } from "../odoo-lectura.ts";
import { fraseAPlano, sumarDias } from "../formato.ts";
import { esTablaFaltante } from "../supabase.ts";
import type { Aviso, MarcaConfianza } from "../tipos.ts";
import type { CtxCalculo } from "./contrato.ts";
import type { DetalleCaja } from "./caja.ts";
import type { DetalleCalle } from "./calle-reglas.ts";
import { leerResultadoMensual } from "./pyg.ts";
import type { MesPyg } from "./pyg-reglas.ts";
import { codigoDeCuenta } from "./pyg-reglas.ts";
import { mesesEntre, moverMes } from "./socios-reglas.ts";
import {
  avisoManual, confianzaPorKpi, detectarArmadoDevuelto, detectarCajaUsdSinRevaluar, detectarCheques, detectarCuadre, detectarCuentasQuietas,
  detectarExtractos, detectarFacturasSinPlazo, detectarFinSinFecha, detectarIibbFaltante, detectarOrdenesPorObra, detectarRechazosManuales,
  detectarSinAmortizar, detectarSinHistoria, detectarSinImputar, unirAvisos, type CuentaCaja, type FilaAvisoManual, type OrdenObra,
} from "./calidad-reglas.ts";

/** Cuentas fijas del plan (finanzas_definiciones.md). */
const CTA = {
  cajaUsd: "1.1.1.01.002",
  valoresADepositar: "1.1.1.01.06",
  deudores: "1.1.3.01.010",
  andamios: ["1.2.5.08.01", "1.2.5.08.03"],
  amortAndamios: "1.2.5.08.02",
} as const;
/** Diario "Cheques de Terceros". */
const DIARIO_CHEQUES_TERCEROS = 21;

/** Contratos en la calle (alquiler_definiciones.md §1). */
const EN_LA_CALLE = [
  ["is_rental_order", "=", true], ["state", "=", "sale"], "|",
  "&", ["rental_status", "=", "return"], ["x_studio_estado_de_obra", "!=", "Desarmado"],
  "&", ["rental_status", "=", "pickup"], ["x_studio_estado_de_obra", "in", ["Armado", "Pendiente de Desarme"]],
];

export type ResultadoCalidad = {
  avisos: Aviso[];
  /** Confianza de hoy por indicador (sólo con avisos no reservados). */
  confianza: Record<string, MarcaConfianza>;
  /** Confianza que sale de avisos reservados (va en detalle.reservado). */
  confianzaReservada: Record<string, MarcaConfianza>;
  /** Detectores que no se pudieron correr (Odoo no respondió esa parte). */
  sinRevisar: string[];
  /** false = la tabla de avisos manuales todavía no existe. */
  manualesDisponibles: boolean;
};

type Detector = { nombre: string; correr: () => Promise<(Aviso | null)[] | Aviso | null> };

async function leerCaja(hoy: string): Promise<CuentaCaja[]> {
  const g = await readGroup<Record<string, unknown>>(
    "account.move.line",
    [["account_id.account_type", "=", "asset_cash"], ["parent_state", "=", "posted"], ["date", "<=", hoy]],
    ["balance:sum", "amount_currency:sum", "date:max"],
    ["account_id"],
  );
  return g.map((x) => {
    const cuenta = Array.isArray(x.account_id) ? String(x.account_id[1]) : "";
    const codigo = codigoDeCuenta(x.account_id);
    return { codigo, nombre: cuenta.slice(codigo.length).trim() || codigo, saldo: Number(x.balance) || 0, saldoMoneda: Number(x.amount_currency) || 0, ultimo: typeof x.date === "string" ? x.date.slice(0, 10) : null };
  });
}

/** Detectores de Odoo. `pyg` y `caja` se leen una vez y los comparten varios. */
function detectores(ctx: CtxCalculo, inicio: string): Detector[] {
  const mesActual = ctx.hoy.slice(0, 7);
  let caja: Promise<CuentaCaja[]> | null = null;
  const cajaUna = () => (caja ??= leerCaja(ctx.hoy));
  let pyg: Promise<Record<string, MesPyg>> | null = null;
  const pygUna = () => (pyg ??= leerResultadoMensual(`${inicio}-01`, ctx.hoy));
  const cerrados = mesesEntre(inicio, moverMes(mesActual, -1));

  return [
    {
      nombre: "Cuentas de caja quietas",
      correr: async () => {
        // El % sobre el mismo total que usa Caja ("toda la plata"); si Caja falla, la caja contable.
        const todaLaPlata = await ctx
          .pantalla<DetalleCaja>("caja")
          .then((r) => (r.detalle?.totales ? r.detalle.totales.disponibleArs + r.detalle.totales.aVerificarArs : null))
          .catch(() => null);
        return detectarCuentasQuietas(await cajaUna(), ctx.hoy, { todaLaPlata });
      },
    },
    { nombre: "Caja en dólares", correr: async () => detectarCajaUsdSinRevaluar((await cajaUna()).find((c) => c.codigo === CTA.cajaUsd), ctx.tc?.valor ?? null) },
    {
      nombre: "Cheques en cartera",
      correr: async () => {
        const [cheques, cuentas] = await Promise.all([
          searchRead<{ amount: number; payment_date: string | false }>("l10n_latam.check", [["current_journal_id", "=", DIARIO_CHEQUES_TERCEROS]], ["amount", "payment_date"], { limit: 5000 }),
          cajaUna(),
        ]);
        const limite = sumarDias(ctx.hoy, -7);
        const viejos = cheques.filter((c) => c.payment_date && c.payment_date < limite);
        const contable = cuentas.find((c) => c.codigo === CTA.valoresADepositar);
        return detectarCheques({
          registroArs: cheques.reduce((a, c) => a + (Number(c.amount) || 0), 0),
          registroCant: cheques.length,
          aVerificarCant: viejos.length,
          aVerificarArs: viejos.reduce((a, c) => a + (Number(c.amount) || 0), 0),
          contableArs: contable ? contable.saldo : null,
        });
      },
    },
    { nombre: "Ingresos Brutos de los meses cerrados", correr: async () => detectarIibbFaltante(await pygUna(), cerrados) },
    { nombre: "Cuenta de cuadre", correr: async () => detectarCuadre(await pygUna(), mesesEntre(inicio, mesActual)) },
    {
      nombre: "Amortización de andamios",
      correr: async () => {
        const g = await readGroup<Record<string, unknown>>("account.move.line", [["account_id.code", "in", [...CTA.andamios, CTA.amortAndamios]], ["parent_state", "=", "posted"]], ["balance:sum"], ["account_id"]);
        let activoArs = 0;
        let amortizadoArs = 0;
        for (const x of g) {
          const c = codigoDeCuenta(x.account_id);
          if (c === CTA.amortAndamios) amortizadoArs += Number(x.balance) || 0;
          else activoArs += Number(x.balance) || 0;
        }
        return detectarSinAmortizar({ activoArs, amortizadoArs });
      },
    },
    {
      nombre: "Plazo de pago de las facturas",
      correr: async () => {
        const anio = ctx.hoy.slice(0, 4);
        const base = [["move_type", "=", "out_invoice"], ["state", "=", "posted"], ["invoice_date", ">=", `${anio}-01-01`], ["invoice_date", "<=", ctx.hoy]];
        const [total, sinPlazo] = await Promise.all([searchCount("account.move", base), searchCount("account.move", [...base, ["invoice_payment_term_id", "=", false]])]);
        return detectarFacturasSinPlazo({ anio, total, sinPlazo });
      },
    },
    {
      nombre: "Cobros sin imputar y cheques rechazados",
      correr: async () => {
        const l = await searchRead<{ amount_residual: number; name: string | false }>(
          "account.move.line",
          [["account_id.code", "=", CTA.deudores], ["parent_state", "=", "posted"], ["reconciled", "=", false], ["move_id.move_type", "=", "entry"]],
          ["amount_residual", "name"],
          { limit: 5000 },
        );
        const neg = l.filter((x) => x.amount_residual < -1);
        const rech = l.filter((x) => x.amount_residual > 1 && /rech|rchz/i.test(x.name || ""));
        return [
          detectarSinImputar({ cant: neg.length, ars: neg.reduce((a, x) => a + x.amount_residual, 0) }),
          detectarRechazosManuales({ cant: rech.length, ars: rech.reduce((a, x) => a + x.amount_residual, 0) }),
        ];
      },
    },
    {
      nombre: "Extractos bancarios",
      correr: async () => {
        const g = await readGroup<Record<string, unknown>>("account.bank.statement.line", [["is_reconciled", "=", false]], ["amount:sum"], ["journal_id"]);
        return detectarExtractos(g.map((x) => ({ diario: Array.isArray(x.journal_id) ? String(x.journal_id[1]) : "Sin diario", cant: Number(x.__count) || 0, ars: Number(x.amount) || 0 })));
      },
    },
    {
      nombre: "Órdenes por obra",
      correr: async () => {
        const o = await searchRead<{ name: string; x_obra_id: [number, string] | false }>("sale.order", [...EN_LA_CALLE, ["x_obra_id", "!=", false]], ["name", "x_obra_id"], { limit: 5000 });
        const filas: OrdenObra[] = o.filter((x) => x.x_obra_id).map((x) => ({ obraId: (x.x_obra_id as [number, string])[0], obra: (x.x_obra_id as [number, string])[1], orden: x.name }));
        return detectarOrdenesPorObra(filas);
      },
    },
    {
      // Los mismos conteos que muestra En la calle (una sola fuente): armados o pendientes de
      // desarme que figuran devueltos, y obras armadas sin fin estimado sin las órdenes
      // reemplazadas por otra de la misma obra.
      nombre: "Estado de las órdenes armadas",
      correr: async () => {
        const c = await ctx.pantalla<DetalleCalle>("calle");
        if (!c.detalle) throw new OdooError("En la calle no respondió.");
        return [detectarArmadoDevuelto(c.detalle.armadoDevuelto.total), detectarFinSinFecha(c.detalle.finObra.sinFecha)];
      },
    },
  ];
}

/** Avisos cargados a mano. Sin la tabla (migración sin aplicar): [] y disponible=false. */
async function leerManuales(ctx: CtxCalculo): Promise<{ avisos: Aviso[]; disponible: boolean }> {
  try {
    const { data, error } = await ctx
      .supabase()
      .from("direccion_avisos_calidad")
      .select("id, clave, nivel, aviso, detalle, desde, afecta, quien, que, reservado")
      .eq("activo", true)
      .order("created_at", { ascending: true })
      .limit(200);
    if (error) {
      if (!esTablaFaltante(error)) console.warn("[direccion] avisos manuales:", error.message);
      return { avisos: [], disponible: !esTablaFaltante(error) };
    }
    return { avisos: (data as FilaAvisoManual[]).map(avisoManual).filter((a): a is Aviso => !!a), disponible: true };
  } catch (e) {
    // Sin service role en este entorno (script, test): sin manuales, sin romper.
    console.warn("[direccion] avisos manuales:", e instanceof Error ? e.message : e);
    return { avisos: [], disponible: false };
  }
}

/** Corre todos los detectores y une los avisos. */
export async function calcularCalidad(ctx: CtxCalculo, inicio: string): Promise<ResultadoCalidad> {
  const lista = detectores(ctx, inicio);
  const resultados = await Promise.allSettled(lista.map((d) => d.correr()));
  const auto: Aviso[] = [];
  const sinRevisar: string[] = [];
  resultados.forEach((r, i) => {
    if (r.status === "fulfilled") {
      const v = r.value;
      for (const a of Array.isArray(v) ? v : [v]) if (a) auto.push(a);
    } else {
      sinRevisar.push(lista[i].nombre);
      console.warn(`[direccion] calidad · ${lista[i].nombre}:`, r.reason instanceof Error ? r.reason.message : r.reason);
    }
  });
  // Si Odoo no respondió nada, mejor el último snapshot que una lista vacía engañosa.
  if (sinRevisar.length === lista.length) {
    const r0 = resultados[0];
    throw r0.status === "rejected" && r0.reason instanceof OdooError ? r0.reason : new OdooError("No se pudo revisar la calidad de los datos.");
  }

  const historia = detectarSinHistoria(inicio, ctx.hoy);
  if (historia) auto.push(historia);

  // Los de retiros salen de Socios (ya calculado y cacheado). Si falla, se dice.
  try {
    const s = await ctx.pantalla("socios");
    for (const a of s.avisos) auto.push({ ...a, reservado: true });
  } catch (e) {
    sinRevisar.push("Retiros de socios");
    console.warn("[direccion] calidad · socios:", e instanceof Error ? e.message : e);
  }

  const manuales = await leerManuales(ctx);
  const avisos = unirAvisos(auto, manuales.avisos);
  const texto = (a: Aviso) => fraseAPlano(a.aviso, { moneda: "USD", tc: ctx.tc });
  return {
    avisos,
    confianza: confianzaPorKpi(avisos.filter((a) => !a.reservado), texto),
    confianzaReservada: confianzaPorKpi(avisos.filter((a) => a.reservado), texto),
    sinRevisar,
    manualesDisponibles: manuales.disponible,
  };
}
