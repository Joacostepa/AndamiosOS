// Nodos de desglose de Cobranzas (§7.3: cifra → desglose → lista → Odoo).
//
// Nivel 1 (un nodo por indicador, tipo = id del diccionario): por_cobrar, vencido_30,
// concentracion, dso, rechazados, sin_imputar, cobrado. Salen del resultado cacheado de la
// pantalla (ctx.pantalla("cobranzas")): el número del panel es el mismo de la tarjeta.
// Nivel 2: "cliente" (v = id de res.partner): sus partidas tal cual están en Odoo, sin
// netear, con el vencimiento de Odoo y el efectivo, y el link a cada comprobante.

import { fcorta, flarga, mesEtq, nf, nombreLindo, pct } from "../formato.ts";
import { TRAMOS, TRAMOS_MAS_30 } from "../calculo/cobranzas-reglas.ts";
import type { ClienteCob, DetalleCobranzas, MovSinImputar, PartidaCob } from "../calculo/cobranzas.ts";
import type { FilaDesglose, NodoDesglose, NodoRef, SeccionDesglose } from "../tipos.ts";
import { definirNodo, paginar, type CtxNodo, type DefNodo } from "./contrato.ts";

const SIN_VENDEDORA = "Sin vendedora (rechazos y débitos)";
const ETQ_TRAMO: Record<string, string> = Object.fromEntries(TRAMOS.map((t) => [t.clave, t.etiqueta]));
const mon = (ars: number) => ({ tipo: "monto" as const, monto: { ars } });
const suma = <T,>(l: readonly T[], f: (x: T) => number) => l.reduce((a, x) => a + f(x), 0);
const refCliente = (c: { partnerId: number }): NodoRef => ({ tipo: "cliente", v: String(c.partnerId) });
const millones = (ars: number) => `ARS ${nf(ars / 1e6, 1)} M`;

async function detalle(ctx: CtxNodo): Promise<DetalleCobranzas | null> {
  const r = await ctx.pantalla<DetalleCobranzas>("cobranzas");
  return r.detalle ?? null;
}

const SIN_DETALLE: NodoDesglose = { titulo: "Cobranzas", cifra: { tipo: "sin_dato", motivo: "Odoo no respondió" }, secciones: [] };

const AGRUPAR = [
  { valor: "cliente", etiqueta: "Cliente" },
  { valor: "vendedora", etiqueta: "Vendedora" },
  { valor: "tramo", etiqueta: "Tramo" },
  { valor: "sector", etiqueta: "Estado/Priv." },
];
const grupoValido = (g: string | undefined) => (g && AGRUPAR.some((o) => o.valor === g) ? g : "cliente");

/**
 * Por cobrar (todo) o vencido +30, agrupado por cliente, vendedora, tramo o sector. Cada
 * agrupación suma exactamente la cifra (el saldo a favor de clientes va como renglón propio).
 */
function agrupado(d: DetalleCobranzas, modo: "todo" | "v30", g: string, titulo: string): NodoDesglose {
  const valorDe = (c: ClienteCob) => (modo === "todo" ? c.saldo : c.venc30);
  const tramosV30 = d.tramos.filter((t) => TRAMOS_MAS_30.includes(t.clave));
  const total = modo === "todo" ? d.saldo : suma(tramosV30, (t) => t.monto.ars);
  const base = d.clientes.map((c) => ({ c, v: valorDe(c) })).filter((x) => Math.abs(x.v) >= 1);
  type F = { id: string; titulo: string; v: number; sub?: string; hijo?: NodoRef; atenuada?: boolean };
  let filas: F[];
  if (g === "tramo") {
    filas = (modo === "todo" ? d.tramos : tramosV30).map((t) => ({ id: t.clave, titulo: t.etiqueta, v: t.monto.ars, sub: `${t.partidas} ${t.partidas === 1 ? "partida" : "partidas"}` }));
    if (modo === "todo" && Math.abs(d.saldoAFavor.ars) >= 1) {
      filas.push({ id: "a_favor", titulo: "Saldo a favor de clientes", v: d.saldoAFavor.ars, sub: d.saldoAFavor.clientes.map((c) => nombreLindo(c.nombre)).join(", ") });
    }
  } else if (g === "cliente") {
    filas = base.map((x) => ({
      id: String(x.c.partnerId),
      titulo: `${x.c.publico ? "🏛 " : ""}${nombreLindo(x.c.nombre)}`,
      v: x.v,
      sub: [x.c.facturas ? `${x.c.facturas} fact.` : "", x.c.diasMax ? `${x.c.diasMax} d de atraso` : "al día", x.c.noLlamar && x.c.saldo > 0 ? "no llamar: pagó sin imputar" : ""].filter(Boolean).join(" · "),
      hijo: refCliente(x.c),
      atenuada: x.c.noLlamar,
    }));
  } else {
    const clave = g === "vendedora" ? (c: ClienteCob) => c.vendedora ?? SIN_VENDEDORA : (c: ClienteCob) => (c.publico ? "Estado" : "Privados");
    const m = new Map<string, { v: number; n: number }>();
    for (const x of base) {
      const k = clave(x.c);
      const a = m.get(k) ?? { v: 0, n: 0 };
      m.set(k, { v: a.v + x.v, n: a.n + 1 });
    }
    filas = [...m.entries()].map(([k, a]) => ({ id: k, titulo: k, v: a.v, sub: `${a.n} ${a.n === 1 ? "cliente" : "clientes"}` }));
  }
  filas.sort((a, b) => b.v - a.v);
  const max = Math.max(0, ...filas.map((f) => f.v));
  return {
    titulo,
    cifra: mon(total),
    sub: modo === "todo"
      ? `${d.clientesConSaldo} clientes · con IVA`
      : `${suma(tramosV30, (t) => t.partidas)} partidas · con IVA · vencimiento = plazo o emisión + ${d.diasSinPlazo} días`,
    agrupar: { param: "g", activo: g, opciones: AGRUPAR },
    secciones: [
      {
        filas: filas.map((f) => ({
          id: f.id,
          titulo: f.titulo,
          sub: f.sub,
          valor: mon(f.v),
          valorSub: total ? pct((f.v / total) * 100) : undefined,
          barra: max > 0 && f.v > 0 ? f.v / max : undefined,
          hijo: f.hijo,
          atenuada: f.atenuada,
        })),
        cierre: { suma: { ars: suma(filas, (f) => f.v) }, cifra: { ars: total }, texto: "la cifra de la tarjeta" },
        nota:
          g === "vendedora" ? "La vendedora sirve para saber quién llama, no para comparar."
          : g === "sector" ? "Estado = clasificación provisoria por nombre (Ministerio, Garrahan, ANMAT…) más lo marcado a mano."
          : undefined,
      },
    ],
    csv: true,
  };
}

const porCobrar = definirNodo({
  tipo: "por_cobrar",
  pantalla: "cobranzas",
  async resolver(ref, ctx) {
    const d = await detalle(ctx);
    return d ? agrupado(d, "todo", grupoValido(ref.g), "Por cobrar") : SIN_DETALLE;
  },
});

const vencido30 = definirNodo({
  tipo: "vencido_30",
  pantalla: "cobranzas",
  async resolver(ref, ctx) {
    const d = await detalle(ctx);
    return d ? agrupado(d, "v30", grupoValido(ref.g), "Por cobrar vencido +30 días") : SIN_DETALLE;
  },
});

const concentracionN = definirNodo({
  tipo: "concentracion",
  pantalla: "cobranzas",
  async resolver(ref, ctx) {
    const d = await detalle(ctx);
    if (!d) return SIN_DETALLE;
    const n = agrupado(d, "todo", grupoValido(ref.g), "Concentración");
    const c = d.concentracion;
    return {
      ...n,
      cifra: c.mayor ? { tipo: "pct", n: c.mayor.pct } : { tipo: "sin_dato", motivo: "No hay saldo por cobrar" },
      sub: `${c.mayor ? `${nombreLindo(c.mayor.nombre)} · ` : ""}los 10 primeros son el ${pct(c.top10Pct, 1)} · índice de concentración ${c.hhi == null ? "Sin dato" : nf(c.hhi)} (desde 2.500 es muy concentrado)`,
    };
  },
});

const dsoN = definirNodo({
  tipo: "dso",
  pantalla: "cobranzas",
  async resolver(_ref, ctx) {
    const d = await detalle(ctx);
    if (!d?.dso) return { titulo: "Días que tardan en pagar", cifra: { tipo: "sin_dato", motivo: d?.faltan.dso ?? "Odoo no respondió" }, secciones: [] };
    const s = d.dso;
    const filas: FilaDesglose[] = [...s.serie].reverse().map((m) => ({
      id: m.mes,
      titulo: `Cierre ${mesEtq(m.mes)}`,
      sub: `saldo ${millones(m.saldo)} ÷ facturado con IVA de ${m.ventana} días ${millones(m.ventas)}${m.ventana < 90 ? " (ventana corta: Odoo arranca en oct-25)" : ""}`,
      valor: m.dias == null ? { tipo: "sin_dato", motivo: "Sin facturación en la ventana" } : { tipo: "dias", n: m.dias },
    }));
    return {
      titulo: "Días que tardan en pagar (DSO)",
      cifra: s.hoy == null ? { tipo: "sin_dato", motivo: "Sin facturación en la ventana" } : { tipo: "dias", n: s.hoy },
      sub: `Hoy: saldo ÷ facturado con IVA de los últimos ${s.ventanaHoy} días × ${s.ventanaHoy} · promedio 12 meses ${s.promedio12 == null ? "Sin dato" : `${nf(s.promedio12, 1)} días`}`,
      avisos: [{ texto: "El promedio esconde a los clientes que pagan muy tarde (como el Estado): miralo junto a la concentración.", tono: "gris" }],
      secciones: [{ titulo: "Al cierre de cada mes", filas, cierre: { nota: "Cada mes es su propio cálculo: no se suman." } }],
    };
  },
});

const rechazadosN = definirNodo({
  tipo: "rechazados",
  pantalla: "cobranzas",
  async resolver(_ref, ctx) {
    const d = await detalle(ctx);
    if (!d) return SIN_DETALLE;
    const R = d.rechazados;
    const cli = new Map(d.clientes.map((c) => [c.partnerId, c]));
    const filas: FilaDesglose[] = R.lista.map((r) => {
      const riesgo = (cli.get(r.partnerId)?.rechazoRiesgo ?? 0) > 0;
      return {
        id: String(r.moveId),
        titulo: nombreLindo(r.cliente),
        sub: `${flarga(r.fecha)} · ${r.comprobante} · ${r.dias} d · ${r.detalle}`,
        valor: mon(r.ars),
        etiqueta: riesgo ? { texto: "en riesgo", tono: "mal" } : { texto: "compensado", tono: "bien" },
        hijo: refCliente(r),
        odoo: { modelo: "account.move", id: r.moveId },
      };
    });
    const enRiesgo = d.clientes.filter((c) => c.rechazoRiesgo > 0).map((c) => nombreLindo(c.nombre));
    return {
      titulo: "Cheques rechazados",
      cifra: mon(R.total),
      sub: `${R.lista.length} ${R.lista.length === 1 ? "cheque" : "cheques"} · sin regularizar · con IVA`,
      avisos: R.lista.length
        ? [{ texto: `En riesgo real: ${enRiesgo.join(", ") || "ninguno"}, sin pagos posteriores. Los compensados tienen cobros posteriores sin imputar del mismo cliente: falta conciliar.`, tono: "gris" }]
        : undefined,
      secciones: [
        {
          filas,
          cierre: { suma: { ars: suma(R.lista, (r) => r.ars) }, cifra: { ars: R.total }, texto: "la cifra de la tarjeta" },
          nota: "Se detectan por el texto del asiento (\"rechaz\", \"rchz\") hasta que se use el circuito de cheques.",
        },
      ],
      csv: true,
    };
  },
});

const sinImputarN = definirNodo({
  tipo: "sin_imputar",
  pantalla: "cobranzas",
  async resolver(_ref, ctx) {
    const d = await detalle(ctx);
    if (!d) return SIN_DETALLE;
    const S = d.sinImputar;
    const fila = (r: MovSinImputar): FilaDesglose => ({
      id: String(r.moveId),
      titulo: nombreLindo(r.cliente),
      sub: `${flarga(r.fecha)} · ${r.comprobante} · ${r.diario}`,
      valor: mon(r.ars),
      hijo: refCliente(r),
      odoo: { modelo: "account.move", id: r.moveId },
    });
    const contra = S.lista.filter((x) => !x.compensa);
    const comp = S.lista.filter((x) => x.compensa);
    const secciones: SeccionDesglose[] = [];
    if (contra.length) secciones.push({ titulo: "Contra facturas abiertas (ya pagaron y figuran como deuda)", filas: contra.map(fila) });
    if (comp.length) secciones.push({ titulo: "Compensan cheques rechazados y débitos", filas: comp.map(fila) });
    if (secciones.length) secciones[secciones.length - 1].cierre = { suma: { ars: suma(S.lista, (x) => x.ars) }, cifra: { ars: S.total }, texto: "la cifra de la tarjeta" };
    return { titulo: "Cobros sin imputar", cifra: mon(S.total), sub: `${S.lista.length} partidas · con IVA`, secciones, csv: true };
  },
});

const cobradoN = definirNodo({
  tipo: "cobrado",
  pantalla: "cobranzas",
  async resolver(_ref, ctx) {
    const d = await detalle(ctx);
    if (!d?.cobrado?.length) return { titulo: "Cobrado", cifra: { tipo: "sin_dato", motivo: d?.faltan.cobrado ?? "Odoo no respondió" }, secciones: [] };
    const actual = d.cobrado.find((m) => m.parcial) ?? d.cobrado[d.cobrado.length - 1];
    const etqMes = (m: { mes: string; parcial: boolean }) => `${mesEtq(m.mes)}${m.parcial ? ` al ${fcorta(d.hoy)}` : ""}`;
    const filas: FilaDesglose[] = [...d.cobrado].reverse().map((m) => ({
      id: m.mes,
      titulo: etqMes(m),
      sub: [
        m.retenciones ? `retenciones ${millones(m.retenciones)}` : "",
        m.rechazosDevoluciones ? `rechazos y devoluciones ${millones(m.rechazosDevoluciones)} (aparte)` : "",
        m.diasReales != null ? `pagaron a ${nf(m.diasReales, 1)} días` : "",
      ].filter(Boolean).join(" · "),
      valor: { tipo: "monto", monto: m.monto },
    }));
    const total = { ars: suma(d.cobrado, (m) => m.monto.ars), usd: d.cobrado.some((m) => m.monto.usd == null) ? null : suma(d.cobrado, (m) => m.monto.usd ?? 0) };
    const etq = { transferencia: "Transferencia", cheques: "Cheques y eCheq", efectivo: "Efectivo", otro: "Otro" } as const;
    const medios = (Object.keys(etq) as (keyof typeof etq)[]).map((k) => ({ k, v: actual.porMedio[k] })).filter((x) => x.v > 0);
    return {
      titulo: "Cobrado",
      cifra: { tipo: "monto", monto: actual.monto },
      sub: `${etqMes(actual)} · con IVA · dinero + retenciones`,
      secciones: [
        {
          titulo: `Por medio · ${etqMes(actual)}`,
          filas: medios.map((x) => ({ id: x.k, titulo: etq[x.k], valor: mon(x.v), valorSub: pct((x.v / actual.monto.ars) * 100) })),
          cierre: { suma: { ars: suma(medios, (x) => x.v) }, cifra: { ars: actual.monto.ars }, texto: "lo cobrado en el mes" },
        },
        {
          titulo: "Por mes",
          filas,
          cierre: { suma: total, cifra: total, texto: "lo cobrado en 12 meses" },
          nota: "Un cheque cuenta como cobrado cuando se recibe, no cuando se acredita. Los rechazos y devoluciones no se restan.",
        },
      ],
      csv: true,
    };
  },
});

function filaPartida(p: PartidaCob): FilaDesglose {
  const etiqueta: FilaDesglose["etiqueta"] =
    p.tipo === "cheque_rechazado" ? { texto: "cheque rechazado", tono: "mal" }
    : p.tipo === "sin_imputar" ? { texto: "cobro sin imputar", tono: "bien" }
    : p.tipo === "debito" ? { texto: "débito", tono: "aten" }
    : p.tipo === "nc" ? { texto: "nota de crédito", tono: "neutro" }
    : undefined;
  const venc = p.residual < 0 ? "" : ` · vence ${fcorta(p.venc)}${p.vencOdoo && p.vencOdoo !== p.venc ? ` (Odoo: ${fcorta(p.vencOdoo)})` : ""}`;
  const atraso = p.dias > 0 && p.residual > 0 ? ` · ${p.dias} d` : "";
  return {
    id: String(p.id),
    titulo: p.comprobante,
    sub: `${flarga(p.fecha)}${venc}${atraso}${p.pedido ? ` · ${p.pedido}` : ""}${p.tipo !== "factura" && p.detalle ? ` · ${p.detalle}` : ""}`,
    valor: mon(p.residual),
    valorSub: p.residual < 0 ? "a favor" : p.neto < p.residual - 0.5 ? `${p.neto < 1 ? "cubierta" : "en parte cubierta"} por un cobro sin imputar` : ETQ_TRAMO[p.tramo],
    etiqueta,
    odoo: p.moveId ? { modelo: "account.move", id: p.moveId } : undefined,
  };
}

const cliente = definirNodo({
  tipo: "cliente",
  pantalla: "cobranzas",
  async resolver(ref, ctx) {
    const d = await detalle(ctx);
    if (!d) return SIN_DETALLE;
    const id = Number(ref.v);
    const c = d.clientes.find((x) => x.partnerId === id);
    if (!c) return { titulo: "Cliente", cifra: { tipo: "sin_dato", motivo: "Este cliente no tiene partidas abiertas hoy" }, secciones: [] };
    const todas = d.partidas.filter((p) => p.partnerId === id).sort((a, b) => a.fecha.localeCompare(b.fecha) || a.id - b.id);
    const { filas, pagina } = paginar(todas, ctx.pagina);
    const avisos: NonNullable<NodoDesglose["avisos"]> = [];
    if (c.noLlamar && c.saldo > 0) avisos.push({ texto: "No llamar: ya pagó y el cobro todavía no se imputó a su factura (ver «cobro sin imputar» abajo).", tono: "aten" });
    for (const a of c.avisos) avisos.push({ texto: a, tono: "gris" });
    if (c.publico) avisos.push({ texto: `Organismo público ${c.sectorManual ? "(marcado a mano)" : "(por el nombre)"}: paga por expediente.`, tono: "gris" });
    return {
      titulo: nombreLindo(c.nombre),
      cifra: mon(c.saldo),
      sub: [
        `${c.facturas} ${c.facturas === 1 ? "factura" : "facturas"}`,
        c.vendedora ?? "sin vendedora",
        c.diasPago != null ? `paga a ~${nf(c.diasPago)} días` : "",
        `último cobro ${c.ultimoCobro ? fcorta(c.ultimoCobro) : "sin dato en 12 meses"}`,
      ].filter(Boolean).join(" · "),
      avisos: avisos.length ? avisos : undefined,
      secciones: [
        {
          titulo: "Partidas abiertas en Odoo (sin netear)",
          filas: filas.map(filaPartida),
          cierre: { suma: { ars: suma(todas, (p) => p.residual) }, cifra: { ars: c.saldo }, texto: `el saldo de ${nombreLindo(c.nombre)}` },
          nota: `Vencimiento = plazo cargado o emisión + ${d.diasSinPlazo} días; entre paréntesis, el que muestra Odoo.`,
        },
      ],
      pagina,
      csv: true,
    };
  },
});

export const nodos: DefNodo[] = [porCobrar, vencido30, concentracionN, dsoN, rechazadosN, sinImputarN, cobradoN, cliente];
