// Nodos de desglose de Caja (cifra → desglose → lista → Odoo).
//
// Nivel 1 (salen del resultado cacheado de la pantalla, sin volver a leer Odoo):
//   caja_disponible · cheques_cartera · cheques_propios · por_pagar
//   cobertura y semanaFlujo (v = número de semana, e = escenario): el flujo público, SIN retiros;
//   coberturaSocios y semanaFlujoSocios: el flujo con los retiros (reservados).
// Nivel 2 (en vivo, paginado):
//   cuenta (v = id de una cuenta de CAJA: no abre cualquier cuenta contable)
//   proveedor (v = id del proveedor): sus facturas abiertas.
//
// OJO: ctx.pantalla("caja") viene SIN recortar. Los nodos públicos nunca muestran
// `detalle.reservado`; sólo lo hacen coberturaSocios y semanaFlujoSocios, marcados `reservado`.

import { definirNodo, paginar, type CtxNodo, type DefNodo } from "./contrato.ts";
import { searchCount, searchRead, searchReadTodo } from "../odoo-lectura.ts";
import { aUsd } from "../dolar.ts";
import { diasEntre, fcorta, fdia, flarga, monto, nf, nombreLindo, sinDato } from "../formato.ts";
import { ESCENARIOS, TRAMOS, conRetiros, indiceSemana, tramoPorDias, vencimiento, type Concepto, type Escenario } from "../calculo/caja-reglas.ts";
import type { DetalleCaja } from "../calculo/caja.ts";
import type { FilaDesglose, NodoDesglose, NodoRef, TonoEtiqueta } from "../tipos.ts";

const caja = async (ctx: CtxNodo): Promise<DetalleCaja> => (await ctx.pantalla<DetalleCaja>("caja")).detalle;
const sumar = <T>(xs: readonly T[], f: (x: T) => number): number => xs.reduce((a, x) => a + f(x), 0);
const esc = (e: string | undefined, d: DetalleCaja): Escenario => (e === "proyectado" || e === "comprometido" ? e : d.flujo.escenarioDefecto);
type M2O = [number, string] | false;

const ETQ_CUENTA: Record<string, { texto: string; tono: TonoEtiqueta }> = {
  confiable: { texto: "✓", tono: "bien" },
  quieta: { texto: "● quieta", tono: "neutro" },
  a_verificar: { texto: "⚠ a verificar", tono: "aten" },
  no_es_caja: { texto: "no es caja", tono: "neutro" },
};

// ─── Caja disponible → cuentas → movimientos ───────────────────────────────────────────

const cajaDisponible = definirNodo({
  tipo: "caja_disponible",
  pantalla: "caja",
  async resolver(_ref, ctx) {
    const d = await caja(ctx);
    const en = d.cuentas.filter((c) => c.enTotal);
    const fuera = d.cuentas.filter((c) => !c.enTotal && Math.abs(c.saldoArs) > 1);
    const fila = (c: DetalleCaja["cuentas"][number]): FilaDesglose => ({
      id: String(c.id),
      titulo: c.nombre,
      sub: `${c.codigo} · últ. mov. ${fcorta(c.ultimoMovimiento)}${c.moneda === "USD" && c.saldoUsd != null ? ` · USD ${nf(c.saldoUsd)}` : ""}`,
      valor: monto(c.saldoArs),
      ...(c.enTotal && d.totales.disponibleArs > 0 ? { valorSub: `${nf((c.saldoArs / d.totales.disponibleArs) * 100)} %` } : {}),
      etiqueta: c.sinArqueo ? { texto: "⚠ sin arqueo", tono: "aten" } : ETQ_CUENTA[c.estado],
      hijo: { tipo: "cuenta", v: String(c.id) },
      atenuada: !c.enTotal,
    });
    return {
      titulo: "Caja disponible",
      cifra: monto(d.totales.disponibleArs),
      sub: `${en.length} cuentas confiables · saldo al dólar de hoy`,
      secciones: [
        { filas: en.map(fila), cierre: { suma: { ars: sumar(en, (c) => c.saldoArs) }, cifra: { ars: d.totales.disponibleArs }, texto: "la cifra de Caja disponible" } },
        ...(fuera.length
          ? [{ titulo: "Fuera del total", filas: fuera.map(fila), nota: "Una cuenta sin movimientos hace más de 30 días se marca \"quieta\"; si además pesa más del 5 % del total, queda a verificar y no se suma." }]
          : []),
      ],
    };
  },
});

/** Los movimientos de UNA cuenta de caja, del más nuevo al más viejo, de a 50. */
const cuenta = definirNodo({
  tipo: "cuenta",
  pantalla: "caja",
  async resolver(ref, ctx) {
    const d = await caja(ctx);
    const c = d.cuentas.find((x) => String(x.id) === ref.v);
    if (!c) return { titulo: "Cuenta", cifra: sinDato("No es una cuenta de caja"), secciones: [{ filas: [], cierre: { nota: "Desde Caja sólo se abren las cuentas de caja." } }] };
    const dominio = [["account_id", "=", c.id], ["parent_state", "=", "posted"], ["date", "<=", d.hoy]];
    const pagina = Math.max(1, ctx.pagina);
    const [total, lineas] = await Promise.all([
      searchCount("account.move.line", dominio),
      searchRead<{ id: number; date: string; move_id: M2O; name: string | false; partner_id: M2O; journal_id: M2O; balance: number; amount_currency: number; currency_id: M2O }>(
        "account.move.line",
        dominio,
        ["date", "move_id", "name", "partner_id", "journal_id", "balance", "amount_currency", "currency_id"],
        { order: "date desc, id desc", limit: 50, offset: (pagina - 1) * 50 },
      ),
    ]);
    const paginas = Math.max(1, Math.ceil(total / 50));
    const filas: FilaDesglose[] = lineas.map((l) => {
      const enUsd = Array.isArray(l.currency_id) && l.currency_id[1] === "USD";
      return {
        id: String(l.id),
        titulo: (l.name || (Array.isArray(l.move_id) ? l.move_id[1] : "") || "Movimiento").slice(0, 120),
        sub: [flarga(l.date), Array.isArray(l.move_id) ? l.move_id[1] : "", Array.isArray(l.partner_id) ? nombreLindo(l.partner_id[1]) : "", Array.isArray(l.journal_id) ? l.journal_id[1] : ""].filter(Boolean).join(" · "),
        // En pesos: cada movimiento a su dólar. En dólares: el monto en dólares, tal cual.
        valor: enUsd ? { tipo: "texto", texto: `USD ${nf(l.amount_currency, 2)}` } : { tipo: "monto", monto: { ars: l.balance, usd: aUsd(ctx.dolar, l.balance, l.date) } },
        ...(Array.isArray(l.move_id) ? { odoo: { modelo: "account.move", id: l.move_id[0] } } : {}),
      };
    });
    return {
      titulo: c.nombre,
      cifra: monto(c.saldoArs),
      sub: `${c.codigo} · ${c.moneda}${c.moneda === "USD" && c.saldoUsd != null ? ` · USD ${nf(c.saldoUsd, 2)}` : ""} · ${c.enTotal ? "suma a la caja" : "fuera del total"}`,
      ...(c.nota ? { avisos: [{ texto: c.nota, tono: c.enTotal ? ("gris" as const) : ("aten" as const) }] } : {}),
      csv: true,
      pagina: { actual: Math.min(pagina, paginas), total: paginas, filas: total },
      secciones: [
        {
          titulo: `Movimientos (${nf(total)})`,
          filas,
          cierre: { nota: "Del más nuevo al más viejo. El saldo es la suma de todos los movimientos de la cuenta hasta hoy." },
        },
      ],
    };
  },
});

// ─── Cheques ───────────────────────────────────────────────────────────────────────────

const ETQ_CHEQUE: Record<string, { texto: string; tono: TonoEtiqueta }> = {
  a_fecha: { texto: "a fecha", tono: "neutro" },
  vencido_reciente: { texto: "vencido ≤ 7 días", tono: "neutro" },
  vencido_a_verificar: { texto: "⚠ a verificar", tono: "aten" },
};

const chequesCartera = definirNodo({
  tipo: "cheques_cartera",
  pantalla: "caja",
  async resolver(_ref, ctx) {
    const d = await caja(ctx);
    const ch = d.cheques;
    const fin = d.flujo.semanas[d.flujo.semanas.length - 1]?.hasta ?? d.hoy;
    const noCierra = Math.abs(ch.registro.ars - ch.contableArs) > 1_000_000;
    const { filas, pagina } = paginar(ch.lista, ctx.pagina);
    return {
      titulo: "Cheques en cartera",
      cifra: noCierra ? sinDato("El registro y la contabilidad no coinciden") : monto(ch.registro.ars),
      sub: noCierra ? "registro y contabilidad no coinciden" : `${ch.registro.cant} cheques`,
      ...(noCierra ? { avisos: [{ texto: "Ninguno de los dos números es confiable hasta regularizar. En el flujo se usa el registro, sin los vencidos a verificar.", tono: "aten" as const }] } : {}),
      csv: true,
      pagina,
      secciones: [
        {
          titulo: "Resumen",
          filas: [
            { id: "registro", titulo: "Según el registro de cheques", sub: `${ch.registro.cant} cheques · diario Cheques de Terceros`, valor: monto(ch.registro.ars) },
            { id: "contable", titulo: "Según la contabilidad", sub: "cuenta 1.1.1.01.06 Valores a depositar", valor: monto(ch.contableArs) },
            { id: "diferencia", titulo: "Diferencia", valor: monto(ch.registro.ars - ch.contableArs) },
            { id: "a_fecha", titulo: "A fecha (se pueden depositar)", sub: `${ch.aFecha.cant} cheques`, valor: monto(ch.aFecha.ars) },
            { id: "despues", titulo: `A fecha después del ${fcorta(fin)}`, sub: "no entran al flujo de 8 semanas", valor: monto(ch.despuesArs), atenuada: true },
            { id: "recientes", titulo: "Vencidos hace 7 días o menos", sub: `${ch.recientes.cant} cheques · se depositan esta semana`, valor: monto(ch.recientes.ars) },
            {
              id: "a_verificar",
              titulo: "Vencidos hace más de 7 días, a verificar",
              sub: `${ch.aVerificar.cant} cheques${ch.aVerificar.principal ? `, casi todos de ${ch.aVerificar.principal}` : ""}`,
              valor: monto(ch.aVerificar.ars),
              etiqueta: { texto: "⚠ fuera del flujo", tono: "aten" },
            },
          ],
        },
        {
          titulo: "Cheques del registro",
          filas: filas.map((c) => ({
            id: String(c.id),
            titulo: `${fdia(c.fecha)} · ${c.cliente}`,
            sub: `cheque ${c.numero}`,
            valor: monto(c.ars),
            etiqueta: ETQ_CHEQUE[c.estado],
            ...(c.pagoId ? { odoo: { modelo: "account.payment", id: c.pagoId } } : {}),
          })),
          cierre: { suma: { ars: sumar(ch.lista, (c) => c.ars) }, cifra: { ars: ch.registro.ars }, texto: "el registro" },
        },
      ],
    };
  },
});

const chequesPropios = definirNodo({
  tipo: "cheques_propios",
  pantalla: "caja",
  async resolver(_ref, ctx) {
    const d = await caja(ctx);
    const p = d.propios;
    const fin = d.flujo.semanas[d.flujo.semanas.length - 1]?.hasta ?? d.hoy;
    const debito = d.cuentas.find((c) => c.id === d.cuentaDebitoId);
    const s1 = d.flujo.escenarios.comprometido[0];
    const lista = p.lista.slice().sort((a, b) => a.fecha.localeCompare(b.fecha));
    return {
      titulo: "Cheques propios a debitar",
      cifra: monto(p.ars),
      sub: `${p.cant} ${p.cant === 1 ? "cheque" : "cheques"} · la factura ya figura pagada, la plata todavía no salió`,
      ...(debito && s1 && s1.sale > debito.saldoArs ? { avisos: [{ texto: `Lo comprometido de esta semana supera el saldo de ${debito.nombre}: hay que fondearla.`, tono: "aten" as const }] } : {}),
      secciones: [
        {
          filas: lista.map((c) => ({
            id: String(c.id),
            titulo: `${fdia(c.fecha)} · ${c.proveedor}`,
            sub: `cheque ${c.numero}${c.enFlujo ? "" : " · después del flujo de 8 semanas"}`,
            valor: monto(c.ars),
            ...(c.enFlujo ? {} : { etiqueta: { texto: "fuera del flujo", tono: "neutro" as const } }),
            ...(c.pagoId ? { odoo: { modelo: "account.payment", id: c.pagoId } } : {}),
          })),
          cierre: { suma: { ars: sumar(p.lista, (c) => c.ars) }, cifra: { ars: p.ars } },
        },
        {
          titulo: "Contra el flujo",
          filas: [
            { id: "en_flujo", titulo: `En el flujo de 8 semanas (hasta el ${fcorta(fin)})`, valor: monto(p.enFlujoArs) },
            { id: "despues", titulo: `Después del ${fcorta(fin)}`, sub: "en \"Queda fuera del flujo\"", valor: monto(p.despuesArs) },
            ...(s1 ? [{ id: "s1", titulo: "Comprometido para salir esta semana", sub: "cheques, impuestos y proveedores con fecha", valor: monto(s1.sale) }] : []),
            ...(debito ? [{ id: "debito", titulo: `${debito.nombre} hoy`, sub: "de ahí se debitan los cheques", valor: monto(debito.saldoArs), hijo: { tipo: "cuenta", v: String(debito.id) } }] : []),
          ],
        },
      ],
    };
  },
});

// ─── Por pagar → proveedor → facturas ──────────────────────────────────────────────────

const porPagar = definirNodo({
  tipo: "por_pagar",
  pantalla: "caja",
  async resolver(_ref, ctx) {
    const d = await caja(ctx);
    const pp = d.porPagar;
    const top = pp.top.slice(0, 20);
    const max = Math.max(1, ...top.map((t) => t.saldoArs));
    return {
      titulo: "Por pagar a proveedores",
      cifra: monto(pp.ars),
      sub: `${pp.facturas} facturas · con IVA · no incluye sueldos, impuestos ni cheques propios ya entregados`,
      secciones: [
        { titulo: "Antigüedad", filas: pp.aging.map((a) => ({ id: a.clave, titulo: a.etiqueta, valor: monto(a.ars) })), cierre: { suma: { ars: sumar(pp.aging, (a) => a.ars) }, cifra: { ars: pp.ars } } },
        {
          titulo: `Principales proveedores${pp.top.length > top.length ? ` (${top.length} de ${pp.top.length})` : ""}`,
          filas: top.map((t) => ({
            id: String(t.partnerId ?? t.proveedor),
            titulo: t.proveedor,
            sub: `${t.facturas} ${t.facturas === 1 ? "factura" : "facturas"}${t.vencidoArs > 0 && t.venceMin ? ` · vencida desde el ${fcorta(t.venceMin)}` : ""}`,
            valor: monto(t.saldoArs),
            barra: Math.max(0, t.saldoArs) / max,
            ...(t.partnerId ? { hijo: { tipo: "proveedor", v: String(t.partnerId) } } : {}),
          })),
          nota: "Casi ninguna factura de proveedor tiene plazo de pago: figuran vencidas desde la fecha de la factura.",
        },
      ],
    };
  },
});

const proveedor = definirNodo({
  tipo: "proveedor",
  pantalla: "caja",
  async resolver(ref, ctx) {
    const id = Number(ref.v);
    if (!Number.isInteger(id) || id <= 0) return { titulo: "Proveedor", cifra: sinDato("Proveedor inválido"), secciones: [] };
    const facturas = await searchReadTodo<{ id: number; name: string; partner_id: M2O; invoice_date: string | false; invoice_date_due: string | false; amount_residual_signed: number }>(
      "account.move",
      [["move_type", "in", ["in_invoice", "in_refund"]], ["state", "=", "posted"], ["amount_residual", "!=", 0], ["partner_id", "=", id]],
      ["name", "partner_id", "invoice_date", "invoice_date_due", "amount_residual_signed"],
      { order: "invoice_date asc, id asc" },
    );
    const todas = facturas.map((f) => {
      const vence = vencimiento(f.invoice_date_due, f.invoice_date) ?? ctx.hoy;
      return { f, vence, dias: diasEntre(vence, ctx.hoy), ars: -(Number(f.amount_residual_signed) || 0) };
    });
    const total = sumar(todas, (x) => x.ars);
    const { filas, pagina } = paginar(todas, ctx.pagina);
    const nombre = Array.isArray(facturas[0]?.partner_id) ? nombreLindo(facturas[0].partner_id[1]) : "Proveedor";
    return {
      titulo: nombre,
      cifra: monto(total),
      sub: `${todas.length} ${todas.length === 1 ? "factura abierta" : "facturas abiertas"} · con IVA`,
      csv: true,
      pagina,
      secciones: [
        {
          filas: filas.map(({ f, vence, dias, ars }) => ({
            id: String(f.id),
            titulo: f.name,
            sub: `${f.invoice_date ? `factura del ${flarga(String(f.invoice_date))} · ` : ""}${dias > 0 ? `vencida hace ${dias} días` : `vence el ${fcorta(vence)}`}`,
            valor: monto(ars),
            etiqueta: { texto: TRAMOS.find((t) => t.clave === tramoPorDias(dias))?.etiqueta ?? "", tono: dias > 90 ? "mal" : dias > 0 ? "aten" : "neutro" },
            odoo: { modelo: "account.move", id: f.id },
          })),
          cierre: { suma: { ars: total }, cifra: { ars: total }, texto: "lo que le debemos" },
        },
      ],
    };
  },
});

// ─── Flujo: cobertura → semana → conceptos y documentos ────────────────────────────────

/** El flujo de 8 semanas de un escenario. `socios`: con los retiros (conRetiros). Pura. */
export function nodoCobertura(ref: NodoRef, dCrudo: DetalleCaja, socios: boolean): NodoDesglose {
  const d = socios ? conRetiros(dCrudo) : dCrudo;
  const e = esc(ref.e, d);
  const c = d.flujo.cobertura[e];
  const colchon = d.flujo.colchon.ars;
  return {
    titulo: `Flujo 8 semanas · ${ESCENARIOS[e]}`,
    cifra: colchon > 0 ? { tipo: "fecha", iso: c.fecha, prefijo: c.prefijo } : sinDato("Falta el colchón mínimo"),
    sub: `plata en pesos al cierre de cada semana · colchón mínimo${d.flujo.colchon.editado ? "" : " (1 mes de sueldos)"}`,
    agrupar: { param: "e", activo: e, opciones: (Object.keys(ESCENARIOS) as Escenario[]).map((k) => ({ valor: k, etiqueta: ESCENARIOS[k] })) },
    secciones: [
      {
        filas: [
          { id: "inicial", titulo: "Hoy", sub: "caja disponible sin el dólar billete", valor: monto(d.flujo.saldoInicialPesosArs) },
          ...d.flujo.escenarios[e].map((s) => ({
            id: String(s.n),
            titulo: `S${s.n} · ${s.etiqueta}`,
            sub: "en pesos al cierre",
            valor: monto(s.pesos),
            ...(colchon > 0 && s.pesos < colchon ? { etiqueta: { texto: "▲ debajo del colchón", tono: "aten" as const } } : {}),
            hijo: { tipo: socios ? "semanaFlujoSocios" : "semanaFlujo", v: String(s.n), e },
          })),
          ...(colchon > 0 ? [{ id: "colchon", titulo: "Colchón mínimo", sub: d.flujo.colchon.editado ? "lo fijó un socio" : "sugerido: un mes de sueldos", valor: monto(colchon), atenuada: true }] : []),
        ],
        cierre: {
          nota: `Saldo de hoy + lo que entra − lo que sale = saldo de cada semana. Se mide sobre los pesos: el dólar billete es reserva.${
            !socios && dCrudo.reservado?.flujo ? " No incluye los retiros de socios." : ""
          }`,
        },
      },
    ],
  };
}

const cobertura = definirNodo({
  tipo: "cobertura",
  pantalla: "caja",
  async resolver(ref, ctx) {
    return nodoCobertura(ref, await caja(ctx), false);
  },
});

/** El mismo flujo con los retiros. Sólo socios (la API lo chequea antes de resolver). */
const coberturaSocios = definirNodo({
  tipo: "coberturaSocios",
  pantalla: "caja",
  reservado: true,
  async resolver(ref, ctx) {
    return nodoCobertura(ref, await caja(ctx), true);
  },
});

/**
 * Una semana del flujo. Sin `conReservado`, el flujo público: sin los retiros, ni en los
 * renglones ni en los totales (así no se deducen restando). Con `conReservado`, el de socios. Pura.
 */
export function nodoSemana(ref: NodoRef, dCrudo: DetalleCaja, conReservado: boolean): NodoDesglose {
  const d = conReservado ? conRetiros(dCrudo) : dCrudo;
  const e = esc(ref.e, d);
  const i = Math.max(0, Math.min(d.flujo.semanas.length - 1, (Number(ref.v) || 1) - 1));
  const s = d.flujo.escenarios[e][i];
  const sem = d.flujo.semanas[i];
  const reservados = d.reservado?.conceptos ?? [];
  const todos: Concepto[] = [...d.flujo.conceptos, ...(conReservado ? reservados : [])].filter((c) => c.escenarios.includes(e) && (c.porSemana[i] ?? 0) !== 0);
  const fila = (c: Concepto): FilaDesglose => ({
    id: c.id,
    titulo: c.concepto,
    sub: `${c.origen === "estimado" ? "estimado" : "ya en Odoo"} · ${c.fuente}`,
    valor: monto(c.porSemana[i]),
    ...(c.reservado ? { etiqueta: { texto: "socios", tono: "neutro" as const } } : {}),
  });
  const ent = todos.filter((c) => c.tipo === "ingreso");
  const sal = todos.filter((c) => c.tipo === "egreso");
  const docs = todos
    .flatMap((c) => (c.partidas ?? []).filter((p) => p.fecha != null && indiceSemana(p.fecha, d.flujo.semanas, true) === i).map((p) => ({ c, p })))
    .sort((a, b) => (a.p.fecha ?? "").localeCompare(b.p.fecha ?? ""));
  const bajoColchon = d.flujo.colchon.ars > 0 && s.pesos < d.flujo.colchon.ars;
  return {
    titulo: `Semana ${sem.n} · ${sem.etiqueta}`,
    cifra: monto(s.entra - s.sale),
    sub: `neto de la semana · ${ESCENARIOS[e]}`,
    secciones: [
      { titulo: "Entra", filas: ent.map(fila), cierre: { suma: { ars: sumar(ent, (c) => c.porSemana[i]) }, cifra: { ars: s.entra }, texto: "lo que entra en la semana" } },
      {
        titulo: "Sale",
        filas: sal.map(fila),
        cierre: { suma: { ars: sumar(sal, (c) => c.porSemana[i]) }, cifra: { ars: s.sale }, texto: "lo que sale en la semana" },
      },
      {
        titulo: "Saldo al cierre",
        filas: [
          { id: "pesos", titulo: "Plata en pesos", valor: monto(s.pesos), ...(bajoColchon ? { etiqueta: { texto: "▲ debajo del colchón", tono: "aten" as const } } : {}) },
          { id: "total", titulo: "Saldo total (con el dólar billete)", valor: monto(s.saldo) },
        ],
      },
      ...(docs.length
        ? [
            {
              titulo: "Documentos con fecha en la semana",
              filas: docs.map(({ c, p }, k): FilaDesglose => ({
                id: `${c.id}-${k}`,
                titulo: p.titulo,
                sub: `${p.fecha ? fdia(p.fecha) : ""} · ${c.tipo === "ingreso" ? "entra" : "sale"}`,
                valor: monto(p.ars),
                ...(p.odoo ? { odoo: p.odoo } : {}),
              })),
            },
          ]
        : []),
    ],
  };
}

const semanaFlujo = definirNodo({
  tipo: "semanaFlujo",
  pantalla: "caja",
  async resolver(ref, ctx) {
    return nodoSemana(ref, await caja(ctx), false);
  },
});

/** La misma semana con los retiros a la vista. Sólo socios (la API lo chequea antes de resolver). */
const semanaFlujoSocios = definirNodo({
  tipo: "semanaFlujoSocios",
  pantalla: "caja",
  reservado: true,
  async resolver(ref, ctx) {
    return nodoSemana(ref, await caja(ctx), true);
  },
});

export const nodos: DefNodo[] = [cajaDisponible, cuenta, chequesCartera, chequesPropios, porPagar, proveedor, cobertura, coberturaSocios, semanaFlujo, semanaFlujoSocios];
