// La semana, la parte pura: arma tarjetas, narrativa, "Para decidir" y Calidad a partir de
// los resumen<Area>() de cada pantalla. No lee Odoo ni Supabase (eso lo hace semana.ts) y
// tiene test (semana-armar.test.ts).
//
// Reglas (diseno.md §4, maqueta renderSemana/tarjetasSemana):
//  · Nada inventado: si un área no respondió, su tarjeta es "Sin dato" con el motivo (nunca
//    0) y la oración fija lo dice.
//  · Retiros (Socios) va `reservado`: la tarjeta, el pie de la narrativa, los avisos y lo que
//    cuelga de `detalle.reservado`. El servidor lo recorta por usuario (reservado.ts).
//  · Los ids de las cifras llevan el prefijo "semana_" para que la historia del snapshot no
//    se mezcle con la de las pantallas de detalle.

import { mesNombre, sinDato } from "../formato.ts";
import type { Aviso, Cifra, Comparacion, Decision, Frase, Monto, Oracion, PantallaId } from "../tipos.ts";
import type { SalidaCalculo } from "./contrato.ts";
import type { ResumenCaja } from "./caja.ts";
import type { ResumenCobranzas } from "./cobranzas.ts";
import type { ResumenCalle } from "./calle-reglas.ts";
import type { ResumenVentas } from "./ventas-armar.ts";
import type { ResumenSocios } from "./socios.ts";
import type { ResumenCalidad } from "./datos.ts";
import { ordenarAvisos } from "./calidad-reglas.ts";
import { armarNarrativa, oracionNc } from "./narrativa.ts";
import { ordenarDecisiones } from "./decisiones.ts";
import { variantes } from "../reservado.ts";

/** Lo que devolvió un área: su resumen o por qué no se pudo leer. */
export type Parte<T> = { ok: true; v: T } | { ok: false; motivo: string };

export type ClienteLlamar = { partnerId: number; nombre: string; publico: boolean; vencidoArs: number; diasMax: number | null };

export type EntradaSemana = {
  hoy: string;
  caja: Parte<ResumenCaja & { chequesPropios: Cifra | null }>;
  ventas: Parte<ResumenVentas>;
  cobranzas: Parte<ResumenCobranzas & { llamar: ClienteLlamar[] }>;
  calle: Parte<ResumenCalle | null>;
  socios: Parte<ResumenSocios & { anio: string }>;
  calidad: Parte<ResumenCalidad>;
};

/** Títulos de cada tarjeta (la pregunta y el nombre del indicador), por id de cifra. */
export type TituloTarjeta = { pregunta: string; titulo: string; unidadExtra?: string };

export type DetalleSemana = {
  hoy: string;
  titulos: Record<string, TituloTarjeta>;
  /** Mini-gráfico de Cobertura: plata en pesos al cierre de cada semana y el colchón. */
  cobertura: { escenario: string; spark: { n: number; desde: string; pesos: number }[]; colchonArs: number | null } | null;
  /** Barra de tramos de la tarjeta de Cobranzas y el % del por cobrar. */
  cobranzas: { tramos: { clave: string; etiqueta: string; monto: Monto }[]; pctPorCobrar: number | null } | null;
  /** Lo que la tarjeta de facturado necesita para el toggle de moneda y el mini-gráfico. */
  facturado: {
    comparacionArs: Comparacion | null;
    sinMayor: { cliente: string; deltaUsd: number | null; deltaArs: number | null } | null;
    serie: { mes: string; monto: Monto; enCurso: boolean }[];
  } | null;
  /** Modo reunión: a quién llamar (top 5), las devoluciones más grandes y cifras de apoyo. */
  reunion: {
    llamar: ClienteLlamar[];
    calle: ResumenCalle["reunion"];
    porCobrar: Cifra | null;
    chequesPropios: Cifra | null;
    finVencido: { obras: number; sinFecha: number } | null;
  };
  /** Qué áreas no se pudieron leer (la pantalla lo dice). */
  faltan: { pantalla: PantallaId; motivo: string }[];
  /**
   * Sólo socios: se borra entero para quien no tiene direccion-socios. `cobertura`: el
   * mini-gráfico con los retiros en el flujo (el de arriba es el público, sin ellos).
   */
  reservado?: {
    retiros?: { titulo: string; pctResultado: number | null; mesesSinDolarizar: string[] };
    cobertura?: DetalleSemana["cobertura"];
  };
};

export const NOMBRE_AREA: Record<PantallaId, string> = {
  semana: "La semana", caja: "Caja", ventas: "Ventas", cobranzas: "Cobranzas", calle: "En la calle", socios: "Socios", datos: "Datos",
};

const motivoArea = (p: PantallaId, motivo: string) => `No pudimos leer ${NOMBRE_AREA[p]}: ${motivo}`;

/** Una tarjeta sin dato (el área no respondió): nunca 0. */
function cifraSinDato(kpi: string, id: string, motivo: string, reservado?: boolean): Cifra {
  return { kpi, id, valor: sinDato(motivo), confianza: { nivel: "inc", motivo }, ...(reservado ? { reservado: true } : {}) };
}

function tarjeta(base: Cifra | null | undefined, kpi: string, id: string, motivo: string): Cifra {
  return base ? { ...base, id } : cifraSinDato(kpi, id, motivo);
}

export function armarSemana(e: EntradaSemana): SalidaCalculo<DetalleSemana> {
  const faltan: DetalleSemana["faltan"] = [];
  const motivo = (p: PantallaId, x: Parte<unknown>) => {
    if (x.ok) return "";
    faltan.push({ pantalla: p, motivo: x.motivo });
    return motivoArea(p, x.motivo);
  };
  const mCaja = motivo("caja", e.caja);
  const mVentas = motivo("ventas", e.ventas);
  const mCob = motivo("cobranzas", e.cobranzas);
  const mCalle = motivo("calle", e.calle);
  motivo("socios", e.socios);
  motivo("datos", e.calidad);

  const caja = e.caja.ok ? e.caja.v : null;
  const ventas = e.ventas.ok ? e.ventas.v : null;
  const cob = e.cobranzas.ok ? e.cobranzas.v : null;
  const calle = e.calle.ok ? e.calle.v : null;
  const socios = e.socios.ok ? e.socios.v : null;

  const titulos: Record<string, TituloTarjeta> = {};

  // 1. Caja disponible · 2. Cobertura
  const tCaja = tarjeta(caja?.caja, "caja_disponible", "semana_caja", mCaja || "Caja no devolvió la cifra");
  titulos.semana_caja = { pregunta: "¿Cuánta plata hay?", titulo: "Caja disponible" };
  const tCob = tarjeta(caja?.cobertura, "cobertura", "semana_cobertura", mCaja || "Caja no devolvió la cobertura");
  titulos.semana_cobertura = { pregunta: "¿Llegamos?", titulo: "Cobertura de caja" };

  // 3. Por cobrar vencido +30 (con la concentración en el contexto)
  const tV30 = tarjeta(cob?.tarjeta, "vencido_30", "semana_vencido_30", mCob || "Cobranzas no devolvió la cifra");
  titulos.semana_vencido_30 = { pregunta: "¿Quién nos debe?", titulo: "Por cobrar vencido +30 días" };

  // 4. Facturado neto del mes en curso (a igual día del mes anterior)
  let tFact: Cifra;
  if (ventas) {
    const nc = ventas.nc.pctReales;
    tFact = {
      ...ventas.facturadoMes,
      id: "semana_facturado",
      contexto: ventas.facturadoMes.contexto ?? (nc != null ? ["NC: ", { valor: { tipo: "pct", n: nc }, kpi: "pct_nc" }, " de lo facturado"] : undefined),
    };
    titulos.semana_facturado = { pregunta: "¿Facturamos?", titulo: `Facturado neto de ${mesNombre(ventas.mes)}`, unidadExtra: `al día ${ventas.dia}` };
  } else {
    tFact = cifraSinDato("facturado_neto", "semana_facturado", mVentas);
    titulos.semana_facturado = { pregunta: "¿Facturamos?", titulo: "Facturado neto del mes" };
  }

  // 5. Devolución vencida en la calle
  const tDev = tarjeta(calle?.tarjeta, "dev_vencida", "semana_dev_vencida", mCalle || "En la calle no devolvió órdenes de alquiler");
  titulos.semana_dev_vencida = { pregunta: "¿Qué está afuera y vencido?", titulo: "Devolución vencida en la calle" };

  // 6. Resultado del último mes cerrado
  const tRes = tarjeta(ventas?.resultado, "resultado", "semana_resultado", mVentas || "No se pudo leer la contabilidad del resultado");
  titulos.semana_resultado = {
    pregunta: "¿Ganamos?",
    titulo: ventas?.margen ? `Resultado de gestión de ${mesNombre(ventas.margen.mes)}` : "Resultado de gestión",
  };

  // 7. Retiros (reservado)
  const tRet: Cifra = socios
    ? { ...socios.cifra, id: "semana_retiros", reservado: true }
    : cifraSinDato("retiros", "semana_retiros", e.socios.ok ? "Sin dato" : motivoArea("socios", e.socios.motivo), true);

  const cifras: Cifra[] = [tCaja, tCob, tV30, tFact, tDev, tRes, tRet];

  // Narrativa
  const oCaja = caja?.oraciones.find((o) => o.id === "caja");
  const oFact = ventas?.oraciones.find((o) => o.id === "fact");
  const candidatas: Oracion[] = [
    ...(caja?.oraciones ?? []),
    ...(cob?.oraciones ?? []),
    ...(calle?.oraciones ?? []),
    ...(ventas?.oraciones ?? []),
  ];
  const nc = oracionNc(ventas?.nc.pctReales);
  if (nc) candidatas.push(nc);
  const oraciones = armarNarrativa({
    fact: oFact ?? { motivo: mVentas || "Ventas no devolvió la oración" },
    caja: oCaja ?? { motivo: mCaja || "Caja no devolvió la oración" },
    candidatas,
    pie: socios?.oraciones ?? [],
  });

  // Para decidir
  const decisiones: Decision[] = ordenarDecisiones([
    caja?.decisiones ?? [],
    cob?.decisiones ?? [],
    calle?.decisiones ?? [],
    ventas?.decisiones ?? [],
    (socios?.decisiones ?? []).map((d) => ({ ...d, reservado: true })),
  ]);

  // Calidad: el registro de Datos es la fuente única; si Datos no respondió, lo que mandan las áreas.
  let avisos: Aviso[];
  if (e.calidad.ok) avisos = e.calidad.v.avisos;
  else {
    const vistos = new Set<string>();
    avisos = ordenarAvisos(
      [...(caja?.avisos ?? []), ...(cob?.avisos ?? []), ...(ventas?.avisos ?? []), ...(socios?.avisos ?? []).map((a) => ({ ...a, reservado: true }))].filter((a) => {
        if (vistos.has(a.id)) return false;
        vistos.add(a.id);
        return true;
      }),
    );
  }

  const detalle: DetalleSemana = {
    hoy: e.hoy,
    titulos,
    cobertura: caja ? { escenario: caja.escenario, spark: caja.sparkPesos, colchonArs: caja.colchon.ars > 0 ? caja.colchon.ars : null } : null,
    cobranzas: cob ? { tramos: cob.tramos.map((t) => ({ clave: t.clave, etiqueta: t.etiqueta, monto: t.monto })), pctPorCobrar: cob.tarjeta?.valorMeta ?? null } : null,
    facturado: ventas
      ? {
          comparacionArs: ventas.comparacionArs,
          sinMayor: ventas.sinMayorCliente ? { cliente: ventas.sinMayorCliente.cliente, deltaUsd: ventas.sinMayorCliente.deltaUsd, deltaArs: ventas.sinMayorCliente.deltaArs } : null,
          serie: ventas.serie,
        }
      : null,
    reunion: {
      llamar: cob?.llamar ?? [],
      calle: calle?.reunion ?? [],
      porCobrar: cob?.porCobrar ?? null,
      chequesPropios: caja?.chequesPropios ?? null,
      finVencido: calle ? calle.cifras.finVencido : null,
    },
    faltan,
    ...(socios
      ? { reservado: { retiros: { titulo: `Retirado en ${socios.anio} (incluye dividendos)`, pctResultado: socios.pctResultado, mesesSinDolarizar: socios.mesesSinDolarizar } } }
      : {}),
  };

  return { cifras, detalle, avisos, decisiones, oraciones };
}

/** A quién llamar (modo reunión): vencidos, sin los que pagaron sin imputar, top 5. */
export function topLlamar(clientes: { partnerId: number; nombre: string; publico: boolean; vencido: number; diasMax: number | null; noLlamar: boolean }[], n = 5): ClienteLlamar[] {
  return clientes
    .filter((c) => c.vencido > 0 && !c.noLlamar)
    .sort((a, b) => b.vencido - a.vencido)
    .slice(0, n)
    .map((c) => ({ partnerId: c.partnerId, nombre: c.nombre, publico: c.publico, vencidoArs: c.vencido, diasMax: c.diasMax }));
}

/** ¿Hay frase con algo? (evita pintar el contexto vacío). */
export const fraseVacia = (f: Frase | undefined): boolean => !f || f.length === 0;

/**
 * La semana armada dos veces, con la caja de los socios (flujo con retiros) y con la pública
 * (sin retiros), en un solo resultado: lo que no cambia va una vez; lo que cambia va en dos
 * versiones (`reservado` y `soloSinSocios`) y filtrarReservado deja a cada usuario la suya.
 * Así la cobertura de quien no tiene direccion-socios nunca incluye los retiros. Pura.
 */
export function combinarSemana(socios: SalidaCalculo<DetalleSemana>, publico: SalidaCalculo<DetalleSemana>): SalidaCalculo<DetalleSemana> {
  const cifras: Cifra[] = [];
  socios.cifras.forEach((c, i) => {
    const p = publico.cifras[i];
    cifras.push(...(p ? variantes([c], [p]) : [c]));
  });
  const cobDistinta = JSON.stringify(socios.detalle.cobertura) !== JSON.stringify(publico.detalle.cobertura);
  const reservado = { ...(socios.detalle.reservado ?? {}), ...(cobDistinta ? { cobertura: socios.detalle.cobertura } : {}) };
  const { reservado: _r, ...detallePublico } = publico.detalle;
  void _r;
  return {
    cifras,
    detalle: { ...detallePublico, ...(Object.keys(reservado).length ? { reservado } : {}) },
    avisos: variantes(socios.avisos, publico.avisos),
    decisiones: variantes(socios.decisiones ?? [], publico.decisiones ?? []),
    oraciones: variantes(socios.oraciones ?? [], publico.oraciones ?? []),
  };
}
