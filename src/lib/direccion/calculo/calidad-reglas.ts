// Detectores PUROS de calidad de datos (diseno.md §9.2). Cada uno recibe lo que ya se leyó de
// Odoo y devuelve el aviso (o nada si la condición no se cumple: un aviso "se cierra solo"
// cuando el dato se corrige en Odoo). Sin Odoo ni Supabase: los prueba calidad-reglas.test.ts.
//
// Niveles: ⚠ "ver" (a verificar: el número puede estar mal) · ◐ "inc" (incompleto: falta
// algo) · ● "inf" (informativo). Dirección no corrige nada: señala qué hay que corregir en Odoo
// y a quién le toca.

import { diasEntre, flarga, mesNombre, nf } from "../formato.ts";
import type { Aviso, Confianza, MarcaConfianza, NivelAviso } from "../tipos.ts";
import { iibbFaltante, type MesPyg } from "./pyg-reglas.ts";

const m = (ars: number) => ({ valor: { tipo: "monto" as const, monto: { ars } } });

// ─── Caja ──────────────────────────────────────────────────────────────────────────────

export type CuentaCaja = { codigo: string; nombre: string; saldo: number; saldoMoneda: number; ultimo: string | null };

/**
 * Cuenta de caja quieta: saldo distinto de cero, sin movimientos hace más de `dias` y con
 * más del `pctMin` % del total (las chicas no son ruido que valga un aviso).
 *
 * El total es el MISMO que usa Caja ("toda la plata" = caja disponible + lo que está a
 * verificar, al dólar de hoy) cuando se lo pasa `todaLaPlata`; así el % del aviso y el de la
 * decisión de Caja coinciden. Sin él (Caja no respondió), la caja contable.
 */
export function detectarCuentasQuietas(cuentas: readonly CuentaCaja[], hoy: string, opts: { dias?: number; pctMin?: number; todaLaPlata?: number | null } = {}): Aviso[] {
  const dias = opts.dias ?? 30;
  const pctMin = opts.pctMin ?? 5;
  const deCaja = opts.todaLaPlata != null && opts.todaLaPlata > 0;
  const total = deCaja ? opts.todaLaPlata! : cuentas.reduce((a, c) => a + Math.max(0, c.saldo), 0);
  const deQue = deCaja ? "de toda la plata (caja disponible más lo que está a verificar)" : "de la caja contable";
  if (total <= 0) return [];
  return cuentas
    .filter((c) => Math.abs(c.saldo) > 1 && c.ultimo && diasEntre(c.ultimo, hoy) > dias && (Math.abs(c.saldo) / total) * 100 > pctMin)
    .map((c) => {
      const d = diasEntre(c.ultimo!, hoy);
      const parte = (Math.abs(c.saldo) / total) * 100;
      return {
        id: `cuenta_quieta_${c.codigo}`,
        nivel: "ver" as const,
        origen: "auto" as const,
        aviso: [`${c.nombre} sin movimientos: `, m(c.saldo)],
        desde: c.ultimo,
        afecta: ["caja_disponible"],
        quien: "Administración / contador",
        que: "Pedir el saldo real y regularizar. Mientras tanto no se suma a la caja.",
        detalle: [`Cuenta ${c.codigo}. Último movimiento el ${flarga(c.ultimo)} (${nf(d)} días). Es el ${nf(parte)} % ${deQue}.`],
      };
    });
}

/**
 * Caja en dólares sin revaluar: el saldo en pesos de los libros no coincide con los dólares
 * al dólar de hoy (más de 5 % de diferencia). Dirección la toma en dólares, al dólar de hoy.
 */
export function detectarCajaUsdSinRevaluar(c: CuentaCaja | undefined, tcHoy: number | null): Aviso | null {
  if (!c || !tcHoy || Math.abs(c.saldoMoneda) < 1) return null;
  const tcLibros = c.saldo / c.saldoMoneda;
  if (!Number.isFinite(tcLibros) || Math.abs(tcLibros / tcHoy - 1) < 0.05) return null;
  return {
    id: "caja_usd_revaluacion",
    nivel: "ver",
    origen: "auto",
    aviso: [`Caja en dólares (USD ${nf(c.saldoMoneda)}) sin arqueo ni revaluación`],
    desde: null,
    afecta: ["caja_disponible"],
    quien: "Socios",
    que: "Arqueo mensual firmado y revaluación a fin de mes.",
    detalle: [`En libros está a ~${nf(tcLibros)} pesos por dólar. Acá se toma en dólares, al dólar de hoy (${nf(tcHoy, 2)}).`],
  };
}

// ─── Cheques ───────────────────────────────────────────────────────────────────────────

export type DatosCheques = { registroArs: number; registroCant: number; aVerificarCant: number; aVerificarArs: number; contableArs: number | null };

/** Registro de cheques de terceros ≠ cuenta Valores a depositar por más de ARS 1 M. */
export function detectarCheques(d: DatosCheques, umbral = 1_000_000): Aviso | null {
  if (d.contableArs == null || Math.abs(d.registroArs - d.contableArs) <= umbral) return null;
  return {
    id: "cheques",
    nivel: "ver",
    origen: "auto",
    aviso: ["Cheques: registro ", m(d.registroArs), " vs contabilidad ", m(d.contableArs)],
    desde: null,
    afecta: ["cheques_cartera", "cobertura"],
    quien: "Administración",
    que: "Contar los cheques y revisar eCheq en el banco; registrar depósitos y rechazos con el circuito de cheques.",
    detalle: d.aVerificarCant
      ? [`${nf(d.aVerificarCant)} ${d.aVerificarCant === 1 ? "cheque" : "cheques"} por `, m(d.aVerificarArs), " tienen fecha vencida hace más de una semana y siguen \"en cartera\"."]
      : [`${nf(d.registroCant)} cheques en el registro.`],
  };
}

// ─── Resultado ─────────────────────────────────────────────────────────────────────────

/**
 * Mes cerrado sin Ingresos Brutos devengados. MISMA regla que Ventas (ventas-reglas.ts →
 * mesesSinIibb, vía iibbFaltante de pyg-reglas.ts): el IIBB del mes es menos del 20 % del
 * promedio de los hasta 3 meses anteriores que sí lo tienen, y ese promedio es el estimado
 * ("~"): así Calidad y Ventas dicen el mismo número.
 */
export function detectarIibbFaltante(pyg: Readonly<Record<string, MesPyg>>, meses: readonly string[]): Aviso[] {
  const avisos: Aviso[] = [];
  for (let i = 0; i < meses.length; i++) {
    const mes = meses[i];
    const actual = pyg[mes]?.iibb ?? 0;
    const ref = iibbFaltante(meses.slice(0, i).map((x) => pyg[x]?.iibb ?? 0), actual);
    if (ref == null) continue;
    const nombre = mesNombre(mes);
    avisos.push({
      id: `iibb_${mes}`,
      nivel: "inc",
      origen: "auto",
      aviso: [`${nombre[0].toUpperCase()}${nombre.slice(1)} sin Ingresos Brutos devengados (~`, m(ref), ")"],
      desde: null,
      afecta: ["resultado"],
      quien: "Contador",
      que: `Devengar el IIBB de ${nombre}.`,
      detalle: ["IIBB devengado en el mes: ", m(actual), "; los meses anteriores, en promedio ", m(ref), `. Hasta que se cargue, el resultado de ${nombre} está sobreestimado.`],
    });
  }
  return avisos;
}

/** Cuenta de cuadre 888888 con saldo en el período (podría tener gastos reales). */
export function detectarCuadre(pyg: Readonly<Record<string, MesPyg>>, meses: readonly string[], umbral = 1_000_000): Aviso | null {
  const total = meses.reduce((a, x) => a + (pyg[x]?.cuadre ?? 0), 0);
  if (Math.abs(total) < umbral) return null;
  return {
    id: "cuadres",
    nivel: "inc",
    origen: "auto",
    aviso: ["Cuenta de cuadre 888888 con ", m(total)],
    desde: null,
    afecta: ["resultado"],
    quien: "Contador",
    que: "Depurar la cuenta.",
    detalle: [`Movimientos de ${meses.length} meses. Se deja fuera del resultado de gestión; si son gastos reales, el resultado está sobreestimado.`],
  };
}

/** Andamios en el activo sin amortización registrada. */
export function detectarSinAmortizar(d: { activoArs: number; amortizadoArs: number }): Aviso | null {
  if (d.activoArs <= 0 || Math.abs(d.amortizadoArs) >= 1) return null;
  return {
    id: "sin_amort",
    nivel: "inc",
    origen: "auto",
    aviso: ["Resultado sin amortización de andamios"],
    desde: null,
    afecta: ["resultado"],
    quien: "Contador",
    que: "Amortizar los andamios del activo.",
    detalle: ["Andamios y estructuras ", m(d.activoArs), " a valor histórico, sin amortización acumulada. Como referencia, 10 años de vida útil son ", m(d.activoArs / 120), " por mes."],
  };
}

// ─── Cobranzas y facturación ───────────────────────────────────────────────────────────

/** Facturas del año sin plazo de pago (vencen el día de emisión). Avisa desde el 20 %. */
export function detectarFacturasSinPlazo(d: { anio: string; total: number; sinPlazo: number }, pctMin = 20): Aviso | null {
  if (d.total <= 0) return null;
  const p = (d.sinPlazo / d.total) * 100;
  if (p < pctMin) return null;
  return {
    id: "sin_plazo",
    nivel: "inc",
    origen: "auto",
    aviso: [`${nf(p)} % de las facturas ${d.anio} sin plazo de pago`],
    desde: null,
    afecta: ["vencido_30", "cobertura"],
    quien: "Administración",
    que: "Cargar el plazo de pago en cada cliente.",
    detalle: [`${nf(d.sinPlazo)} de ${nf(d.total)} facturas. Sin plazo, se usa emisión + 30 días para el vencido.`],
  };
}

/** Cobros que entraron y no se aplicaron a su factura. */
export function detectarSinImputar(d: { cant: number; ars: number }): Aviso | null {
  if (d.cant === 0 || Math.abs(d.ars) < 1) return null;
  return {
    id: "sin_imputar",
    nivel: "ver",
    origen: "auto",
    aviso: ["Cobros sin imputar: ", m(Math.abs(d.ars)), ` en ${nf(d.cant)} ${d.cant === 1 ? "partida" : "partidas"}`],
    desde: null,
    afecta: ["por_cobrar", "sin_imputar"],
    quien: "Administración",
    que: "Imputar cada cobro a su factura.",
    detalle: ["Mientras no se imputen, esos clientes figuran como deudores aunque ya pagaron."],
  };
}

/** Cheques rechazados cargados como asientos manuales (no reabren la factura). */
export function detectarRechazosManuales(d: { cant: number; ars: number }): Aviso | null {
  if (d.cant === 0) return null;
  return {
    id: "rechazos_manual",
    nivel: "inc",
    origen: "auto",
    aviso: [`Cheques rechazados cargados como asientos manuales (${nf(d.cant)}, `, m(d.ars), ")"],
    desde: null,
    afecta: ["rechazados", "por_cobrar"],
    quien: "Administración",
    que: "Registrar el rechazo con el circuito de cheques y nota de débito.",
    detalle: ["No reabren la factura: quedan fuera de los reportes que miran sólo facturas."],
  };
}

/** Movimientos de extracto sin conciliar por diario (desde ARS 1 M). */
export function detectarExtractos(grupos: readonly { diario: string; cant: number; ars: number }[], umbral = 1_000_000): Aviso[] {
  return grupos
    .filter((g) => g.cant > 0 && Math.abs(g.ars) >= umbral)
    .map((g) => ({
      id: `extracto_${g.diario.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")}`,
      nivel: "inf" as const,
      origen: "auto" as const,
      aviso: [`${g.diario}: ${nf(g.cant)} ${g.cant === 1 ? "movimiento" : "movimientos"} sin conciliar (`, m(g.ars), ")"],
      desde: null,
      afecta: ["caja_disponible"],
      quien: "Administración",
      que: "Conciliar semanalmente.",
    }));
}

// ─── Alquiler ──────────────────────────────────────────────────────────────────────────

export type OrdenObra = { obraId: number; obra: string; orden: string };

/**
 * Obras con más de una orden abierta en la calle (Odoo las cuenta varias veces; Dirección
 * agrupa por obra). Puede ser legítimo (dos contratos en la misma obra): se informa.
 */
export function detectarOrdenesPorObra(ordenes: readonly OrdenObra[]): Aviso | null {
  const porObra = new Map<number, { obra: string; ordenes: string[] }>();
  for (const o of ordenes) {
    const x = porObra.get(o.obraId) ?? { obra: o.obra, ordenes: [] };
    x.ordenes.push(o.orden);
    porObra.set(o.obraId, x);
  }
  const dup = [...porObra.values()].filter((x) => x.ordenes.length > 1).sort((a, b) => b.ordenes.length - a.ordenes.length);
  if (!dup.length) return null;
  return {
    id: "ordenes_por_obra",
    nivel: "inc",
    origen: "auto",
    aviso: [dup.length === 1 ? `${dup[0].obra}: ${dup[0].ordenes.length} órdenes abiertas para una misma obra` : `${nf(dup.length)} obras con más de una orden abierta en la calle`],
    desde: null,
    afecta: ["en_la_calle", "dev_vencida", "abono_vigente"],
    quien: "Comercial",
    que: "Cerrar las órdenes que fueron reemplazadas.",
    detalle: [`${dup.map((x) => `${x.obra} (${x.ordenes.join(", ")})`).join("; ")}. Dirección cuenta cada obra una vez.`],
  };
}

export function detectarArmadoDevuelto(n: number): Aviso | null {
  if (n <= 0) return null;
  return {
    id: "armado_devuelto",
    nivel: "inc",
    origen: "auto",
    aviso: [`${nf(n)} ${n === 1 ? "orden \"Armado\" o \"Pendiente de desarme\" figura devuelta" : "órdenes \"Armado\" o \"Pendiente de desarme\" figuran devueltas"} en Alquiler`],
    desde: null,
    afecta: ["en_la_calle"],
    quien: "Comercial / Depósito",
    que: "Corregir el estado de obra o el de alquiler.",
  };
}

export function detectarFinSinFecha(n: number): Aviso | null {
  if (n <= 0) return null;
  return {
    id: "fin_sin_fecha",
    nivel: "inc",
    origen: "auto",
    aviso: [`${nf(n)} ${n === 1 ? "obra armada" : "obras armadas"} sin fin de obra estimado`],
    desde: null,
    afecta: ["fin_vencido"],
    quien: "Comercial",
    que: "Pedirlo obligatorio al confirmar.",
  };
}

// ─── Historia ──────────────────────────────────────────────────────────────────────────

/** Sin datos del año anterior hasta que se cumpla un año de historia en Odoo. */
export function detectarSinHistoria(inicio: string, hoy: string): Aviso | null {
  const [y, mm] = inicio.split("-").map(Number);
  const cumple = `${y + 1}-${String(mm).padStart(2, "0")}`;
  if (hoy.slice(0, 7) >= cumple) return null;
  return {
    id: "sin_historia",
    nivel: "inc",
    origen: "auto",
    aviso: [`Sin datos anteriores a ${mesNombre(inicio)} ${y}`],
    desde: null,
    afecta: ["facturado_neto"],
    quien: `(se resuelve solo en ${mesNombre(cumple)} ${y + 1})`,
    que: `Nada: las comparaciones con el año anterior aparecen solas en ${mesNombre(cumple)}.`,
  };
}

// ─── Manuales, orden y confianza ───────────────────────────────────────────────────────

export type FilaAvisoManual = {
  id: string;
  clave: string | null;
  nivel: string;
  aviso: string;
  detalle: string | null;
  desde: string | null;
  afecta: string[] | null;
  quien: string | null;
  que: string | null;
  reservado: boolean | null;
};

/** Un aviso cargado a mano en direccion_avisos_calidad. null si la fila no sirve. */
export function avisoManual(f: FilaAvisoManual): Aviso | null {
  if (!["ver", "inc", "inf"].includes(f.nivel) || !f.aviso?.trim()) return null;
  return {
    id: `manual_${f.clave ?? f.id}`,
    nivel: f.nivel as NivelAviso,
    origen: "manual",
    aviso: [f.aviso.trim()],
    desde: f.desde ?? null,
    afecta: Array.isArray(f.afecta) ? f.afecta : [],
    quien: f.quien?.trim() || "Sin asignar",
    que: f.que?.trim() || "",
    ...(f.detalle?.trim() ? { detalle: [f.detalle.trim()] } : {}),
    ...(f.reservado ? { reservado: true } : {}),
  };
}

const ORDEN_NIVEL: Record<NivelAviso, number> = { ver: 0, inc: 1, inf: 2 };

/** ⚠ primero, después ◐ y ●; dentro de cada nivel, los automáticos antes que los manuales. */
export function ordenarAvisos(avisos: readonly Aviso[]): Aviso[] {
  return [...avisos].sort((a, b) => ORDEN_NIVEL[a.nivel] - ORDEN_NIVEL[b.nivel] || (a.origen === b.origen ? 0 : a.origen === "auto" ? -1 : 1));
}

/** Une automáticos y manuales: un manual con la misma clave que un automático no se repite. */
export function unirAvisos(auto: readonly Aviso[], manuales: readonly Aviso[]): Aviso[] {
  const ids = new Set(auto.map((a) => a.id));
  return ordenarAvisos([...auto, ...manuales.filter((x) => !ids.has(x.id.replace(/^manual_/, "")))]);
}

/**
 * La confianza de HOY de cada indicador según los avisos abiertos que lo afectan: el peor
 * nivel (⚠ antes que ◐) con el texto del aviso como motivo. Los informativos no bajan la
 * confianza. Un indicador sin avisos no aparece (vale el valor por defecto del diccionario).
 */
export function confianzaPorKpi(avisos: readonly Aviso[], textoDe: (a: Aviso) => string): Record<string, MarcaConfianza> {
  const peso: Record<Confianza, number> = { ver: 2, inc: 1, ok: 0 };
  const salida: Record<string, MarcaConfianza> = {};
  for (const a of avisos) {
    if (a.nivel === "inf") continue;
    for (const k of a.afecta) {
      const actual = salida[k];
      if (!actual || peso[a.nivel] > peso[actual.nivel]) salida[k] = { nivel: a.nivel, motivo: textoDe(a), desde: a.desde ?? null };
    }
  }
  return salida;
}

/** Cuántos avisos hay de cada nivel. */
export function contarAvisos(avisos: readonly Aviso[]): Record<NivelAviso, number> {
  const c: Record<NivelAviso, number> = { ver: 0, inc: 0, inf: 0 };
  for (const a of avisos) c[a.nivel]++;
  return c;
}
