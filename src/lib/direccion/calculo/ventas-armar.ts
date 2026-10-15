// Arma la pantalla Ventas (cifras, detalle, avisos, decisiones) y el resumen para La semana
// a partir de las lecturas de Odoo ya hechas (ventas-datos.ts). PURO: sin red ni Next, así
// lo prueba ventas-armar.test.ts con datos sintéticos.
//
// Reglas (diseno.md §3 y §5.2; handoff §2):
//  · Venta = facturado neto posteado, sin IVA; en USD cada comprobante al dólar de su fecha.
//  · El período en curso se compara a igual día; sin historia, "Sin dato" con el motivo.
//  · Las comparaciones de las cifras van en USD; las de pesos viajan en
//    detalle.comparacionesArs (el toggle de moneda no pide nada al servidor).
//  · Resultado: sólo meses cerrados en los cocientes; el mes en curso no tiene sueldos ni
//    Ingresos Brutos devengados. En USD, cada mes al dólar promedio del mes.
//  · Lo de socios (ajustes con retiros cargados como gasto y circuitos especiales) va en
//    detalle.reservado: el servidor lo recorta a quien no tiene direccion-socios.

import { tcEn, tcPromedioMes, type SerieDolar } from "../dolar.ts";
import { MES_C, finMes, mesEtq, mesNombre, monto, nf, nombreLindo, sinDato, sumarDias } from "../formato.ts";
import { polaridadDe } from "../diccionario.ts";
import type { Aviso, Cifra, Comparacion, Decision, Frase, Monto, NodoRef, Oracion, TcDia, Valor } from "../tipos.ts";
import type { SalidaCalculo } from "./contrato.ts";
import type { BaseComercial, BaseComposicion, BaseFacturas, BaseResultado } from "./ventas-datos.ts";
import {
  INICIO_ODOO,
  RUBROS,
  armarResultado,
  bandaRitmo,
  composicion,
  cuotasSalteadas,
  facturado,
  facturadoComparado,
  mesCorto,
  mesesCompletos,
  mesesSinIibb,
  moverPer,
  notasCredito,
  paramsDePeriodo,
  perValido,
  periodoDeParams,
  rango,
  rangoComparado,
  rubroDeCuenta,
  ultimos12,
  variacion,
  type Banda,
  type Comparado,
  type Doc,
  type Gran,
  type MesResultado,
  type Periodo,
  type RubroId,
  type TipoVenta,
  type Vs,
} from "./ventas-reglas.ts";

/** Vida útil de REFERENCIA para la amortización de los andamios (no contable; la definen los socios con el contador). */
export const VIDA_UTIL_REF_MESES = 120;

const suma = <T,>(xs: readonly T[], f: (x: T) => number | null | undefined) => xs.reduce((a, x) => a + (f(x) ?? 0), 0);
const pctValor = (n: number | null, decimales = 0, motivo = "No hay base para calcularlo"): Valor =>
  n == null || !Number.isFinite(n) ? sinDato(motivo) : { tipo: "pct", n, decimales };
const m = (ars: number, usd?: number | null): Monto => (usd === undefined ? { ars } : { ars, usd });
const titulo = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// ─── Entrada y detalle ──────────────────────────────────────────────────────────────────

/** Una lectura que puede faltar: si falla, esa parte de la pantalla dice "Sin dato" con el motivo. */
export type Parte<T> = { ok: true; datos: T } | { ok: false; motivo: string };

export type EntradaVentas = {
  hoy: string;
  params: Record<string, string>;
  dolar: SerieDolar;
  tc: TcDia | null;
  facturas: BaseFacturas;
  composicion: Parte<BaseComposicion>;
  resultado: Parte<BaseResultado>;
  comercial: Parte<BaseComercial>;
  /** La cifra "Abono mensual en la calle" de la pantalla En la calle, si ya está. */
  abono: Parte<Cifra>;
};

export type OpcionVs = { valor: Vs; etiqueta: string; disponible: boolean; motivo?: string };

export type PeriodoVista = {
  g: Gran;
  vs: Vs;
  etq: string;
  desde: string;
  hasta: string;
  finNat: string;
  enCurso: boolean;
  transcurridos: number;
  total: number;
  recortadoInicio: boolean;
  /** Parámetros de URL del período elegido, del anterior y del siguiente (null = sin datos). */
  params: Record<string, string>;
  anterior: Record<string, string> | null;
  siguiente: Record<string, string> | null;
  /** Al tocar una granularidad: el período en curso de esa granularidad. */
  granularidades: Record<Gran, Record<string, string>>;
  vsOpciones: OpcionVs[];
  /** Con qué se compara ("a igual día sep") o por qué no hay comparación. */
  comparacion: { etq: string; motivo?: string };
  inicio: string;
  hoy: string;
};

export type MesSerie = { mes: string; etq: string; monto: Monto; enCurso: boolean; sel: boolean; params: Record<string, string> };

export type FilaComposicionVista = { tipo: TipoVenta; nombre: string; monto: Monto; pct: number | null };

export type FilaGanamos = {
  mes: string;
  etq: string;
  parcial: boolean;
  ingresos: Monto;
  costoDirecto: Monto;
  estructura: Monto;
  /** null en el mes en curso (sin sueldos devengados). */
  gestion: Monto | null;
  margenPct: number | null;
  sinIibb: boolean;
};

export type SinDatoParte = { estado: "sin_dato"; motivo: string };

export type DetalleVentas = {
  periodo: PeriodoVista;
  /** Las comparaciones de cada cifra en PESOS (las de `cifras` van en dólares). id de cifra → comparaciones. */
  comparacionesArs: Record<string, Comparacion[]>;
  serie: MesSerie[];
  /** Promedio de los meses cerrados del gráfico. */
  promedioCerrados: Monto | null;
  banda: (Banda & { mes: string }) | null;
  composicion:
    | { estado: "ok"; filas: FilaComposicionVista[]; total: Monto; facturado: Monto; etqPeriodo: string; nodo: NodoRef }
    | SinDatoParte;
  comercial:
    | {
        estado: "ok";
        vencen7: Valor;
        vencen15: Valor;
        sinActividad: Valor;
        abiertas: number | null;
        medianaObra: Valor;
        promedioObra: number | null;
        pct7Dias: number | null;
        vivo: Monto;
        vivoCantidad: number;
        esperado: Valor;
        conversionPct: number | null;
        conversionDesde: string;
        conversionHasta: string;
        /** % del cotizado vivo de un solo usuario que casi no convierte (sin nombres). */
        concentracionPct: number | null;
      }
    | SinDatoParte;
  vendido:
    | {
        estado: "ok";
        conIva: Monto;
        ordenes: number;
        reconfPeriodo: number;
        reconf30: { cantidad: number; sinIva: Monto; mayor: { orden: string; cliente: string; sinIva: Monto } | null };
        facturado: Monto;
        nodo: NodoRef;
      }
    | SinDatoParte;
  ganamos:
    | {
        estado: "ok";
        filas: FilaGanamos[];
        andamios: Monto | null;
        amortizacionRef: Monto | null;
        amortizado: boolean;
        mesesSinIibb: { mes: string; estimado: Monto }[];
        cuadre: Monto | null;
      }
    | SinDatoParte
    | null;
  /** Sólo socios: el resultado contable (con los ajustes excluidos) por mes. */
  reservado?: { ajustesPorMes: { mes: string; ajustes: Monto; contable: Monto }[] };
};

// ─── Período ────────────────────────────────────────────────────────────────────────────

function vistaPeriodo(per: Periodo, vs: Vs, hoy: string, c: Comparado): PeriodoVista {
  const r = rango(per, hoy);
  const ant = moverPer(per, -1);
  const sig = moverPer(per, 1);
  const ref = hoy;
  const granularidades: Record<Gran, Record<string, string>> = {
    semana: paramsDePeriodo({ g: "semana", ref: sumarDias(ref, -((new Date(`${ref}T12:00:00Z`).getUTCDay() + 6) % 7)) }, "anterior"),
    mes: paramsDePeriodo({ g: "mes", ref: ref.slice(0, 7) }, vs === "promedio6" ? "promedio6" : "anterior"),
    trimestre: paramsDePeriodo({ g: "trimestre", ref: `${ref.slice(0, 4)}-Q${Math.ceil(Number(ref.slice(5, 7)) / 3)}` }, "anterior"),
    anio: paramsDePeriodo({ g: "anio", ref: ref.slice(0, 4) }, "anterior"),
    pers: paramsDePeriodo({ g: "pers", ref: "", desde: sumarDias(hoy, -29), hasta: hoy }, "anterior"),
  };
  const anioAnt = rangoComparado(per, "anioAnterior", hoy);
  return {
    g: per.g, vs, etq: r.etq, desde: r.desde, hasta: r.hasta, finNat: r.finNat, enCurso: r.enCurso,
    transcurridos: r.transcurridos, total: r.total, recortadoInicio: r.recortadoInicio,
    params: paramsDePeriodo(per, vs),
    anterior: perValido(ant, hoy) ? paramsDePeriodo(ant, vs) : null,
    siguiente: perValido(sig, hoy) ? paramsDePeriodo(sig, vs) : null,
    granularidades,
    vsOpciones: [
      { valor: "anterior", etiqueta: r.enCurso ? "Período anterior a igual día" : "Período anterior", disponible: true },
      anioAnt.tipo === "sd"
        ? { valor: "anioAnterior", etiqueta: `Mismo período del año anterior · desde ${mesCorto(sumarDias(INICIO_ODOO, 365))}`, disponible: false, motivo: anioAnt.motivo }
        : { valor: "anioAnterior", etiqueta: "Mismo período del año anterior", disponible: true },
      per.g === "mes"
        ? { valor: "promedio6", etiqueta: "Promedio últimos 6 meses", disponible: true }
        : { valor: "promedio6", etiqueta: "Promedio últimos 6 meses", disponible: false, motivo: "El promedio de 6 períodos está disponible para meses." },
    ],
    comparacion: c.tipo === "sd" ? { etq: c.etq, motivo: c.motivo } : { etq: c.etq },
    inicio: INICIO_ODOO,
    hoy,
  };
}

/** Comparación (chip) a partir de dos números. Sin base: sin dato con el motivo. */
function comparacion(actual: number, anterior: number | null, c: Comparado, kpi: string): Comparacion {
  if (c.tipo === "sd") return { delta: null, base: c.etq, polaridad: polaridadDe(kpi), motivo: c.motivo };
  const d = variacion(actual, anterior);
  return d == null
    ? { delta: null, base: c.etq, polaridad: polaridadDe(kpi), motivo: "No hubo facturación en el período de comparación" }
    : { delta: d, base: c.etq, polaridad: polaridadDe(kpi) };
}

// ─── Resultado (por mes) ────────────────────────────────────────────────────────────────

function mesesResultado(base: BaseResultado, hoy: string, dolar: SerieDolar): MesResultado[] {
  const meses = [...new Set(base.filas.map((f) => f.mes))].sort();
  return armarResultado(base.filas, meses, hoy, (ym) => tcPromedioMes(dolar, ym));
}

const enUsdMes = (ars: number, mr: MesResultado): Monto => m(ars, mr.tcPromedio ? ars / mr.tcPromedio : null);

/** Suma montos de resultado (cada mes ya a su dólar promedio). */
const sumaMontos = (xs: readonly Monto[]): Monto => {
  const faltaUsd = xs.some((x) => x.usd == null);
  return m(suma(xs, (x) => x.ars), faltaUsd ? null : suma(xs, (x) => x.usd));
};

// ─── La pantalla ────────────────────────────────────────────────────────────────────────

export function armarVentas(e: EntradaVentas): SalidaCalculo<DetalleVentas> {
  const { hoy, dolar } = e;
  const { per, vs } = periodoDeParams(e.params, hoy);
  const r = rango(per, hoy);
  const docs = e.facturas.docs;
  const refact = new Map(e.facturas.refact);
  const c = rangoComparado(per, vs, hoy);
  const periodo = vistaPeriodo(per, vs, hoy, c);
  const comparacionesArs: Record<string, Comparacion[]> = {};
  const avisos: Aviso[] = [];
  const cifras: Cifra[] = [];
  const nodoPeriodo = (tipo: string): NodoRef => ({ tipo, desde: r.desde, hasta: r.hasta });

  // 1. Facturado neto.
  const f = facturado(docs, r.desde, r.hasta);
  const fc = facturadoComparado(docs, c);
  cifras.push({
    kpi: "facturado_neto",
    id: "facturado",
    valor: monto(f.ars, f.usd),
    regla: "periodo",
    confianza: f.sinTc ? { nivel: "ver", motivo: `${f.sinTc} comprobantes sin dólar de su fecha` } : { nivel: "ok" },
    comparaciones: [comparacion(f.usd, fc?.usd ?? null, c, "facturado_neto")],
    contexto: [`${nf(f.n)} comprobantes${r.enCurso ? ` · al día ${r.transcurridos} de ${r.total}` : ""}`],
    nodo: nodoPeriodo("facturado_neto"),
  });
  comparacionesArs.facturado = [comparacion(f.ars, fc?.ars ?? null, c, "facturado_neto")];

  // 2. Notas de crédito reales (las que no se refacturaron), en puntos contra la comparación.
  const nc = notasCredito(docs, refact, r.desde, r.hasta);
  const ncComp: Comparacion[] = [];
  if (c.tipo === "rango") {
    const ncAnt = notasCredito(docs, refact, c.desde, c.hasta);
    if (nc.pctReales != null && ncAnt.pctReales != null) ncComp.push({ delta: nc.pctReales - ncAnt.pctReales, base: c.etq, polaridad: polaridadDe("pct_nc"), unidad: "pp" });
  }
  cifras.push({
    kpi: "pct_nc",
    id: "nc",
    valor: pctValor(nc.pctReales, 1, "No hubo facturas en el período"),
    confianza: { nivel: "ok" },
    comparaciones: ncComp,
    contexto: nc.pctBrutas == null ? undefined : [
      "De lo facturado, las que no se refacturaron: ", { valor: monto(nc.realesArs, nc.realesUsd) },
      ". Brutas, incluida la refacturación: ", { valor: pctValor(nc.pctBrutas, 0) }, " · ", { valor: monto(nc.totalArs, nc.totalUsd) },
    ],
    nodo: nodoPeriodo("pct_nc"),
  });
  comparacionesArs.nc = ncComp;

  // 3. Abono mensual en la calle (lo calcula En la calle; es foto de hoy, no depende del período).
  if (e.abono.ok) {
    cifras.push({ ...e.abono.datos, id: "abono", contexto: e.abono.datos.contexto ?? ["No depende del período"] });
  } else {
    cifras.push({ kpi: "abono_vigente", id: "abono", valor: sinDato(e.abono.motivo), regla: "foto", confianza: { nivel: "inc", motivo: e.abono.motivo } });
  }

  // 4. Renovaciones (qué facturamos).
  let composicionVista: DetalleVentas["composicion"];
  if (e.composicion.ok) {
    const filas = composicion(e.composicion.datos.filas, r.desde, r.hasta);
    const tot = m(suma(filas, (x) => x.ars), suma(filas, (x) => x.usd));
    const ren = filas.find((x) => x.tipo === "renovacion");
    cifras.push({
      kpi: "nueva_vs_renov",
      id: "renovacion",
      valor: tot.ars > 0 ? pctValor(((ren?.ars ?? 0) / tot.ars) * 100) : sinDato("No hubo facturación en el período"),
      confianza: { nivel: "inc", motivo: "Los anticipos no se pueden separar entre nuevo y renovación" },
      contexto: ["de lo facturado · ", { valor: monto(ren?.ars ?? 0, ren?.usd ?? 0) }],
      nodo: nodoPeriodo("nueva_vs_renov"),
    });
    composicionVista = {
      estado: "ok",
      filas: filas.map((x) => ({ tipo: x.tipo, nombre: x.nombre, monto: m(x.ars, x.usd), pct: tot.ars ? (x.ars / tot.ars) * 100 : null })),
      total: tot,
      facturado: m(f.ars, f.usd),
      etqPeriodo: r.etq,
      nodo: nodoPeriodo("nueva_vs_renov"),
    };
  } else {
    cifras.push({ kpi: "nueva_vs_renov", id: "renovacion", valor: sinDato(e.composicion.motivo), confianza: { nivel: "inc", motivo: e.composicion.motivo } });
    composicionVista = { estado: "sin_dato", motivo: e.composicion.motivo };
  }

  // 5. Resultado de gestión y "¿Ganamos?".
  const alineado = per.g === "mes" || per.g === "trimestre" || per.g === "anio";
  const mesesPeriodo = alineado ? mesesCompletos(r.desde, r.finNat).filter((x) => `${x}-01` <= hoy) : [];
  let ganamos: DetalleVentas["ganamos"] = null;
  let reservado: DetalleVentas["reservado"];
  if (!e.resultado.ok) {
    cifras.push({ kpi: "resultado", id: "resultado", valor: sinDato(e.resultado.motivo), regla: "resultado", confianza: { nivel: "inc", motivo: e.resultado.motivo } });
    if (alineado) ganamos = { estado: "sin_dato", motivo: e.resultado.motivo };
  } else {
    const todos = mesesResultado(e.resultado.datos, hoy, dolar);
    const porMes = new Map(todos.map((x) => [x.mes, x]));
    const sinIibb = mesesSinIibb(todos);
    const sinIibbSet = new Set(sinIibb.map((x) => x.mes));
    const delPeriodo = mesesPeriodo.map((x) => porMes.get(x)).filter((x): x is MesResultado => !!x);
    const cerrados = delPeriodo.filter((x) => !x.parcial);
    const incluyeCurso = delPeriodo.some((x) => x.parcial);
    const base = e.resultado.datos;
    const amortizado = (base.amortizacionAcumArs ?? 0) > 0;
    const motivoConf = ["Sin amortización de andamios", ...cerrados.filter((x) => sinIibbSet.has(x.mes)).map((x) => `${mesNombre(x.mes)} sin Ingresos Brutos devengados`)].join("; ");
    if (!alineado) {
      cifras.push({ kpi: "resultado", id: "resultado", valor: sinDato("El resultado se cierra por mes: elegí un mes, trimestre o año"), regla: "resultado", confianza: { nivel: "inc", motivo: "Sin amortización de andamios" } });
    } else if (!cerrados.length) {
      cifras.push({ kpi: "resultado", id: "resultado", valor: sinDato(incluyeCurso ? "El mes en curso todavía no tiene sueldos ni Ingresos Brutos devengados" : "No hay meses cerrados con datos en el período"), regla: "resultado", confianza: { nivel: "inc", motivo: "Sin amortización de andamios" } });
    } else {
      const gestion = sumaMontos(cerrados.map((x) => enUsdMes(x.gestion, x)));
      const ingresos = suma(cerrados, (x) => x.ingresos);
      const margen = ingresos > 0 ? (gestion.ars / ingresos) * 100 : null;
      const ctx: Frase = ["Margen ", { valor: pctValor(margen, 1) }];
      if (incluyeCurso || cerrados.length > 1) ctx.push(` · ${mesEtq(cerrados[0].mes)} a ${mesEtq(cerrados[cerrados.length - 1].mes)}${incluyeCurso ? `, sin ${mesNombre(hoy.slice(0, 7))} en curso` : ""}`);
      cifras.push({
        kpi: "resultado",
        id: "resultado",
        valor: { tipo: "monto", monto: gestion },
        regla: "resultado",
        confianza: { nivel: "inc", motivo: motivoConf },
        contexto: ctx,
        nodo: { tipo: "resultado", desde: cerrados[0].mes, hasta: cerrados[cerrados.length - 1].mes },
      });
    }
    if (alineado) {
      const andamios = base.andamiosArs != null ? m(base.andamiosArs) : null;
      const cuadre = suma(base.filas.filter((x) => x.codigo.trim() === "888888" && mesesPeriodo.includes(x.mes)), (x) => x.balance);
      ganamos = {
        estado: "ok",
        filas: delPeriodo.map((x) => ({
          mes: x.mes,
          etq: mesEtq(x.mes),
          parcial: x.parcial,
          ingresos: enUsdMes(x.ingresos, x),
          costoDirecto: enUsdMes(x.costoDirecto, x),
          estructura: enUsdMes(x.estructura, x),
          gestion: x.parcial ? null : enUsdMes(x.gestion, x),
          margenPct: x.parcial ? null : x.margenPct,
          sinIibb: sinIibbSet.has(x.mes),
        })),
        andamios,
        amortizacionRef: base.andamiosArs != null && base.andamiosArs > 0 ? m(base.andamiosArs / VIDA_UTIL_REF_MESES) : null,
        amortizado,
        mesesSinIibb: sinIibb.filter((x) => mesesPeriodo.includes(x.mes)).map((x) => ({ mes: x.mes, estimado: m(x.estimado) })),
        cuadre: Math.abs(cuadre) >= 1 ? m(cuadre) : null,
      };
      reservado = {
        ajustesPorMes: delPeriodo.filter((x) => !x.parcial).map((x) => ({ mes: x.mes, ajustes: enUsdMes(x.ajustes, x), contable: enUsdMes(x.gestion + x.ajustes, x) })),
      };
    }
    avisos.push(...avisosResultado(todos, sinIibb, base, hoy));
  }
  avisos.push(...avisosCuotas(docs, e.facturas.clientes, hoy));

  // Gráfico de 12 meses, promedio y banda de ritmo.
  const serie: MesSerie[] = ultimos12(hoy).map((mes) => {
    const fin = finMes(mes) > hoy ? hoy : finMes(mes);
    const fm = facturado(docs, `${mes}-01`, fin);
    return { mes, etq: mesEtq(mes), monto: m(fm.ars, fm.usd), enCurso: finMes(mes) > hoy, sel: `${mes}-01` <= r.hasta && finMes(mes) >= r.desde, params: paramsDePeriodo({ g: "mes", ref: mes }, vs === "promedio6" ? "promedio6" : "anterior") };
  });
  const cerradosSerie = serie.filter((x) => !x.enCurso);
  const banda = bandaRitmo(docs, hoy.slice(0, 7), hoy);

  // Vendido según Odoo y comercial.
  let vendido: DetalleVentas["vendido"];
  let comercial: DetalleVentas["comercial"];
  if (e.comercial.ok) {
    const k = e.comercial.datos;
    const conf = k.confirmadas.filter(([d]) => d >= r.desde && d <= r.hasta);
    const confArs = suma(conf, ([, v]) => v);
    const confUsd = suma(conf, ([d, v]) => { const t = tcEn(dolar, d); return t ? v / t.valor : 0; });
    const desde30 = sumarDias(hoy, -29);
    const r30 = [...new Set(k.reconfirmaciones.filter(([d]) => d >= desde30 && d <= hoy).map(([, o]) => o))];
    const may = r30.map((o) => k.reconfirmadas[o]).filter(Boolean).sort((a, b) => b.sinIva - a.sinIva)[0];
    vendido = {
      estado: "ok",
      conIva: m(confArs, confUsd),
      ordenes: conf.length,
      reconfPeriodo: k.reconfirmaciones.filter(([d]) => d >= r.desde && d <= r.hasta).length,
      reconf30: { cantidad: r30.length, sinIva: m(suma(r30, (o) => k.reconfirmadas[o]?.sinIva)), mayor: may ? { orden: may.nombre, cliente: nombreLindo(may.cliente), sinIva: m(may.sinIva) } : null },
      facturado: m(f.ars, f.usd),
      nodo: nodoPeriodo("vendido_ordenes"),
    };
    comercial = {
      estado: "ok",
      vencen7: k.vencen ? { tipo: "cantidad", n: k.vencen.d7 } : sinDato("No se pudieron leer los contratos"),
      vencen15: k.vencen ? { tipo: "cantidad", n: k.vencen.d15 } : sinDato("No se pudieron leer los contratos"),
      sinActividad: k.crm ? { tipo: "cantidad", n: k.crm.sinActividad } : sinDato("No se pudo leer el CRM"),
      abiertas: k.crm?.abiertas ?? null,
      medianaObra: k.tiempo.medianaObra != null ? { tipo: "texto", texto: `${nf(k.tiempo.medianaObra, 1)} días` } : sinDato("No hubo contratos de Obra confirmados en 12 meses"),
      promedioObra: k.tiempo.promedioObra,
      pct7Dias: k.tiempo.pct7Dias,
      vivo: m(k.vivo.ars),
      vivoCantidad: k.vivo.cantidad,
      esperado: k.conversion.pct != null ? monto((k.vivo.ars * k.conversion.pct) / 100) : sinDato("Todavía no hay cohortes con 60 días cumplidos"),
      conversionPct: k.conversion.pct,
      conversionDesde: k.conversion.desde,
      conversionHasta: k.conversion.hasta,
      concentracionPct: k.concentracion?.pct ?? null,
    };
  } else {
    vendido = { estado: "sin_dato", motivo: e.comercial.motivo };
    comercial = { estado: "sin_dato", motivo: e.comercial.motivo };
  }

  // Avisos propios de Ventas.
  if (sumarDias(INICIO_ODOO, 365) > hoy) {
    avisos.push({
      id: "sin_historia", nivel: "inc", origen: "auto", desde: null, afecta: ["facturado_neto"],
      aviso: [`Sin datos anteriores a ${mesNombre(INICIO_ODOO)} ${INICIO_ODOO.slice(0, 4)}`],
      quien: `(se resuelve solo en ${mesNombre(INICIO_ODOO)} ${Number(INICIO_ODOO.slice(0, 4)) + 1})`,
      que: "Nada: las comparaciones con el año anterior aparecen solas.",
    });
  }
  const sinTcTotal = docs.filter((d) => d.usd == null).length;
  if (sinTcTotal) {
    avisos.push({
      id: "ventas_sin_dolar", nivel: "ver", origen: "auto", desde: null, afecta: ["facturado_neto"],
      aviso: [`${sinTcTotal} comprobantes sin cotización del dólar de su fecha`], quien: "Administración", que: "Cargar la cotización del día en Odoo.",
      detalle: ["En dólares esos comprobantes no suman: la cifra en USD queda baja."],
    });
  }

  const resumen = armarResumen(e);
  return {
    cifras,
    detalle: {
      periodo,
      comparacionesArs,
      serie,
      promedioCerrados: cerradosSerie.length ? m(suma(cerradosSerie, (x) => x.monto.ars) / cerradosSerie.length, suma(cerradosSerie, (x) => x.monto.usd) / cerradosSerie.length) : null,
      banda: banda ? { ...banda, mes: hoy.slice(0, 7) } : null,
      composicion: composicionVista,
      comercial,
      vendido,
      ganamos,
      ...(reservado ? { reservado } : {}),
    },
    avisos,
    decisiones: resumen.decisiones,
    oraciones: resumen.oraciones,
  };
}

/** "A septiembre le falta la cuota de X": ver cuotasSalteadas (ventas-reglas.ts). */
function avisosCuotas(docs: readonly Doc[], clientes: Readonly<Record<string, string>>, hoy: string): Aviso[] {
  return cuotasSalteadas(docs, hoy).slice(0, 5).map((c) => {
    const cli = nombreLindo(clientes[c.cli] ?? `Cliente ${c.cli}`);
    return {
      id: `cuota_salteada_${c.cli}_${c.mes}`, nivel: "inf", origen: "auto", desde: null, afecta: ["facturado_neto", "resultado"],
      aviso: [`${cli}: ${mesNombre(c.mes)} sin factura (cuota habitual ~`, { valor: monto(c.cuota), kpi: "facturado_neto" }, `) y ${c.despues.facturas} en ${mesNombre(c.despues.mes)}`],
      quien: "Administración", que: "Confirmar a qué mes corresponde cada factura antes de reclamar.",
      detalle: [`Factura todos los meses y en ${mesNombre(c.mes)} no tiene ninguna; después tiene ${c.despues.facturas}. Por la fecha, ${mesNombre(c.mes)} queda sin la cuota (~`, { valor: monto(c.cuota) }, `) y ${mesNombre(c.despues.mes)} queda inflado. El número no se corrige: es lo que dice Odoo.`],
    };
  });
}

function avisosResultado(todos: readonly MesResultado[], sinIibb: { mes: string; estimado: number }[], base: BaseResultado, hoy: string): Aviso[] {
  const avisos: Aviso[] = [];
  for (const s of sinIibb.slice(-2)) {
    const mr = todos.find((x) => x.mes === s.mes);
    avisos.push({
      id: `iibb_${s.mes}`, nivel: "inc", origen: "auto", desde: null, afecta: ["resultado"],
      aviso: [`${titulo(mesNombre(s.mes))} sin Ingresos Brutos devengados (~`, { valor: monto(s.estimado), kpi: "resultado", nodo: { tipo: "resultado", mes: s.mes } }, ")"],
      quien: "Contador", que: `Devengar el IIBB de ${mesNombre(s.mes)}.`,
      detalle: [
        `Impuestos de ${mesNombre(s.mes)}: `, { valor: monto(mr ? -mr.rubros.impuestos : null) },
        `, contra un promedio de `, { valor: monto(s.estimado) }, ` de Ingresos Brutos en los meses anteriores. Hasta que se cargue, el resultado de ${mesNombre(s.mes)} está sobreestimado en ese monto.`,
      ],
    });
  }
  if (base.andamiosArs != null && base.andamiosArs > 0 && !((base.amortizacionAcumArs ?? 0) > 0)) {
    avisos.push({
      id: "sin_amort", nivel: "inc", origen: "auto", desde: null, afecta: ["resultado"],
      aviso: ["Resultado sin amortización de andamios"], quien: "Contador", que: "Amortizar los andamios del activo.",
      detalle: ["Andamios y estructuras ", { valor: monto(base.andamiosArs) }, ` a valor histórico, sin amortizar. Como referencia, a ${VIDA_UTIL_REF_MESES / 12} años de vida útil son `, { valor: monto(base.andamiosArs / VIDA_UTIL_REF_MESES) }, " por mes."],
    });
  }
  const desde12 = ultimos12(hoy);
  const cuadre = suma(base.filas.filter((x) => x.codigo.trim() === "888888" && desde12.includes(x.mes)), (x) => x.balance);
  if (Math.abs(cuadre) >= 1_000_000) {
    avisos.push({
      id: "cuadres", nivel: "inc", origen: "auto", desde: null, afecta: ["resultado"],
      aviso: ["Cuenta de cuadre 888888 con ", { valor: monto(Math.abs(cuadre)) }, " en 12 meses"], quien: "Contador", que: "Depurar la cuenta.",
      detalle: ["Queda fuera del resultado de gestión. Si son gastos reales, el resultado está sobreestimado."],
    });
  }
  return avisos;
}

// ─── Resumen para La semana ─────────────────────────────────────────────────────────────

/**
 * Lo que La semana toma de Ventas (tarjetas "¿Facturamos?" y "¿Ganamos?", narrativa y
 * decisiones). Todo calculado en vivo; nada reservado.
 */
export type ResumenVentas = {
  /** Mes en curso 'AAAA-MM' y día transcurrido. */
  mes: string;
  dia: number;
  /** Tarjeta "¿Facturamos?": facturado neto del mes en curso. Comparación a igual día del mes anterior, en USD. */
  facturadoMes: Cifra;
  /** La misma comparación en pesos (para el toggle de moneda). */
  comparacionArs: Comparacion | null;
  /**
   * Variación sin el cliente que más facturó en el mes, cuando cambia la lectura en 3 puntos
   * o más (p. ej. un organismo que factura cuotas atrasadas). null si no cambia.
   */
  sinMayorCliente: { cliente: string; partnerId: number; monto: Monto; deltaUsd: number | null; deltaArs: number | null } | null;
  /** Mini-gráfico: facturado neto de los últimos 12 meses (el último, en curso). */
  serie: { mes: string; monto: Monto; enCurso: boolean }[];
  /** Notas de crédito del mes en curso: reales (no refacturadas) y brutas, en % de lo facturado. */
  nc: { pctReales: number | null; pctBrutas: number | null; reales: Monto };
  /** Tarjeta "¿Ganamos?": resultado de gestión del último mes cerrado. null si no se pudo leer. */
  resultado: Cifra | null;
  /** Margen del último mes cerrado y del anterior (el chip gris "margen 34 % · ago 45 %"). */
  margen: { mes: string; pct: number | null; anterior: { mes: string; pct: number | null } | null } | null;
  oraciones: Oracion[];
  decisiones: Decision[];
  avisos: Aviso[];
};

export function armarResumen(e: Omit<EntradaVentas, "params" | "abono" | "comercial" | "composicion"> & Partial<Pick<EntradaVentas, "comercial" | "composicion" | "abono">>): ResumenVentas {
  const { hoy, dolar } = e;
  const docs = e.facturas.docs;
  const mes = hoy.slice(0, 7);
  const per: Periodo = { g: "mes", ref: mes };
  const r = rango(per, hoy);
  const c = rangoComparado(per, "anterior", hoy);
  const f = facturado(docs, r.desde, r.hasta);
  const fc = facturadoComparado(docs, c);
  const compUsd = comparacion(f.usd, fc?.usd ?? null, c, "facturado_neto");
  const compArs = comparacion(f.ars, fc?.ars ?? null, c, "facturado_neto");

  // Sin el cliente que más facturó en el mes.
  let sinMayorCliente: ResumenVentas["sinMayorCliente"] = null;
  const porCli = new Map<number, { ars: number; usd: number }>();
  for (const d of docs) if (d.fecha >= r.desde && d.fecha <= r.hasta) {
    const x = porCli.get(d.cli) ?? { ars: 0, usd: 0 };
    x.ars += d.ars; x.usd += d.usd ?? 0;
    porCli.set(d.cli, x);
  }
  const mayor = [...porCli.entries()].sort((a, b) => b[1].ars - a[1].ars)[0];
  if (mayor && c.tipo === "rango") {
    const sa = facturado(docs, r.desde, r.hasta, mayor[0]);
    const sb = facturado(docs, c.desde, c.hasta, mayor[0]);
    const deltaUsd = variacion(sa.usd, sb.usd);
    const deltaArs = variacion(sa.ars, sb.ars);
    if (deltaUsd != null && compUsd.delta != null && Math.abs(deltaUsd - compUsd.delta) >= 3) {
      sinMayorCliente = { cliente: nombreLindo(e.facturas.clientes[mayor[0]] ?? ""), partnerId: mayor[0], monto: m(mayor[1].ars, mayor[1].usd), deltaUsd, deltaArs };
    }
  }

  const ref = new Map(e.facturas.refact);
  const nc = notasCredito(docs, ref, r.desde, r.hasta);
  const serie = ultimos12(hoy).map((x) => {
    const fin = finMes(x) > hoy ? hoy : finMes(x);
    const fm = facturado(docs, `${x}-01`, fin);
    return { mes: x, monto: m(fm.ars, fm.usd), enCurso: finMes(x) > hoy };
  });

  const facturadoMes: Cifra = {
    kpi: "facturado_neto",
    id: "facturado_mes",
    valor: monto(f.ars, f.usd),
    regla: "periodo",
    confianza: f.sinTc ? { nivel: "ver", motivo: `${f.sinTc} comprobantes sin dólar de su fecha` } : { nivel: "ok" },
    comparaciones: [compUsd],
    contexto: sinMayorCliente ? ["Incluye ", { valor: { tipo: "monto", monto: sinMayorCliente.monto }, nodo: { tipo: "factCliente", v: String(sinMayorCliente.partnerId), desde: r.desde, hasta: r.hasta } }, ` netos de ${sinMayorCliente.cliente}.`] : undefined,
    nodo: { tipo: "facturado_neto", desde: r.desde, hasta: r.hasta },
  };

  // Resultado del último mes cerrado.
  let resultado: Cifra | null = null;
  let margen: ResumenVentas["margen"] = null;
  const decisiones: Decision[] = [];
  const avisos: Aviso[] = [];
  if (e.resultado.ok) {
    const todos = mesesResultado(e.resultado.datos, hoy, dolar);
    const cerrados = todos.filter((x) => !x.parcial);
    const ult = cerrados[cerrados.length - 1];
    const ant = cerrados[cerrados.length - 2];
    const sinIibb = mesesSinIibb(todos);
    if (ult) {
      const faltaIibb = sinIibb.find((x) => x.mes === ult.mes);
      resultado = {
        kpi: "resultado",
        id: "resultado_ultimo",
        valor: { tipo: "monto", monto: enUsdMes(ult.gestion, ult) },
        regla: "resultado",
        confianza: { nivel: "inc", motivo: ["Sin amortización de andamios", faltaIibb ? `${mesNombre(ult.mes)} sin Ingresos Brutos devengados` : null].filter(Boolean).join("; ") },
        comparaciones: ant && ult.margenPct != null && ant.margenPct != null
          ? [{ delta: ult.margenPct - ant.margenPct, base: `margen vs ${MES_C[Number(ant.mes.slice(5, 7)) - 1]}`, polaridad: null, unidad: "pp" }]
          : [],
        contexto: ["Margen ", { valor: pctValor(ult.margenPct, 1) }, ant ? ` · ${MES_C[Number(ant.mes.slice(5, 7)) - 1]} ` : "", ...(ant ? [{ valor: pctValor(ant.margenPct, 1) }] : [])],
        nodo: { tipo: "resultado", mes: ult.mes },
      };
      margen = { mes: ult.mes, pct: ult.margenPct, anterior: ant ? { mes: ant.mes, pct: ant.margenPct } : null };
    }
    const b = e.resultado.datos;
    if (b.andamiosArs != null && b.andamiosArs > 0 && !((b.amortizacionAcumArs ?? 0) > 0)) {
      const ref2: NodoRef = ult ? { tipo: "resultado", mes: ult.mes } : { tipo: "resultado" };
      decisiones.push({
        id: "amortizacion",
        sev: "gris",
        pantalla: "ventas",
        duenoSugerido: null,
        vence: null,
        corto: ["Andamios ", { valor: monto(b.andamiosArs), nodo: ref2 }, " en el activo, sin amortizar"],
        que: ["Los andamios suman ", { valor: monto(b.andamiosArs), nodo: ref2 }, " a valor histórico y ninguno se amortiza (referencia: ", { valor: monto(b.andamiosArs / VIDA_UTIL_REF_MESES) }, " por mes)"],
        pregunta: "¿Qué vida útil acordamos con el contador?",
        ver: ref2,
      });
    }
    avisos.push(...avisosResultado(todos, sinIibb, b, hoy));
  }
  avisos.push(...avisosCuotas(docs, e.facturas.clientes, hoy));

  // Narrativa: la oración fija de facturación (en dólares, la moneda de la tendencia).
  const comp = (x: number) => (Math.abs(x) < 3 ? "casi lo mismo que" : `${nf(Math.abs(x))} % ${x > 0 ? "más" : "menos"} que`);
  const frase: Frase = ["Facturamos ", { valor: monto(f.ars, f.usd), kpi: "facturado_neto", nodo: facturadoMes.nodo }, ` en lo que va de ${mesNombre(mes)}`];
  if (compUsd.delta != null && c.tipo === "rango") {
    frase.push(`, ${comp(compUsd.delta)} a esta altura de ${mesNombre(c.desde.slice(0, 7))}`);
    if (sinMayorCliente?.deltaUsd != null) frase.push(`; sin ${sinMayorCliente.cliente}, ${comp(sinMayorCliente.deltaUsd).replace(" que", "")}`);
  }
  frase.push(".");
  const oraciones: Oracion[] = [{ id: "fact", frase, prioridad: 100 }];

  return {
    mes, dia: r.transcurridos, facturadoMes, comparacionArs: compArs, sinMayorCliente, serie,
    nc: { pctReales: nc.pctReales, pctBrutas: nc.pctBrutas, reales: m(nc.realesArs, nc.realesUsd) },
    resultado, margen, oraciones, decisiones, avisos,
  };
}

/** Rubros de un rango de meses, sin los excluidos (que son de socios). Para el desglose. */
export function rubrosDe(base: BaseResultado, hoy: string, dolar: SerieDolar, meses: readonly string[]) {
  const todos = mesesResultado(base, hoy, dolar).filter((x) => meses.includes(x.mes));
  const filas = RUBROS.filter((rb) => rb.grupo !== "excluido").map((rb) => ({
    ...rb,
    monto: sumaMontos(todos.map((x) => enUsdMes(x.rubros[rb.id], x))),
  }));
  const gestion = sumaMontos(todos.map((x) => enUsdMes(x.gestion, x)));
  return { meses: todos, filas, gestion };
}

/** Cuentas de un rubro en un rango de meses (nivel 2 del desglose del resultado). */
export function cuentasDeRubro(base: BaseResultado, hoy: string, dolar: SerieDolar, meses: readonly string[], rubro: RubroId) {
  const todos = new Map(mesesResultado(base, hoy, dolar).map((x) => [x.mes, x]));
  const acc = new Map<number, { codigo: string; nombre: string; montos: Monto[] }>();
  for (const f of base.filas) {
    if (!meses.includes(f.mes)) continue;
    const mr = todos.get(f.mes);
    if (!mr) continue;
    if (rubroDeCuenta(f.codigo, f.tipo) !== rubro) continue;
    const a = acc.get(f.cuenta) ?? { codigo: f.codigo, nombre: f.nombre, montos: [] };
    a.montos.push(enUsdMes(-f.balance, mr));
    acc.set(f.cuenta, a);
  }
  return [...acc.entries()].map(([cuenta, a]) => ({ cuenta, codigo: a.codigo, nombre: a.nombre, monto: sumaMontos(a.montos) })).sort((a, b) => Math.abs(b.monto.ars) - Math.abs(a.monto.ars));
}
