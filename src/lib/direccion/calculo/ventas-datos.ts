// Lecturas de Odoo de Ventas (SÓLO LECTURA, todo por ../odoo-lectura.ts). Cada función trae
// lo mínimo y lo devuelve compacto y JSON serializable, para que calculo/ventas.ts lo cachee
// (10 min, tag direccion:ventas) y lo compartan la pantalla, sus desgloses y La semana.
//
// Recetas: comercial_definiciones.md (§1 facturado, §1.3 NC, §3 renglones, §5 cotizaciones,
// §6 CRM), finanzas_definiciones.md (§6 resultado) y alquiler_definiciones.md (§8 vencen).

import { readGroup, read, searchCount, searchRead, searchReadTodo } from "../odoo-lectura.ts";
import { aUsd, type SerieDolar } from "../dolar.ts";
import { diaBA, sumarDias } from "../formato.ts";
import {
  INICIO_ODOO,
  concentracionCotizado,
  conversionHistorica,
  cotizadoVivo,
  emparejarNC,
  familiaDominante,
  historiaOrdenes,
  primeraConfirmacion,
  tiempoAprobacion,
  tipoDeFamilia,
  tipoDeRenglon,
  type CambioEstado,
  type Conversion,
  type CotizadoVivo,
  type Doc,
  type EstadoOportunidad,
  type FilaComposicion,
  type FilaCuentaMes,
  type Orden,
  type TiempoAprobacion,
  type TipoVenta,
} from "./ventas-reglas.ts";

type M2o = [number, string] | false;
const id = (v: M2o): number | null => (Array.isArray(v) ? v[0] : null);
const txt = (v: M2o): string => (Array.isArray(v) ? v[1] : "");
/** Datetime de Odoo (UTC, "AAAA-MM-DD HH:MM:SS") → ISO. */
const instante = (s: string | false | null | undefined): string | null => (s ? `${String(s).replace(" ", "T")}Z` : null);

// ─── Facturas y NC ──────────────────────────────────────────────────────────────────────

export type BaseFacturas = {
  docs: Doc[];
  /** commercial_partner_id → nombre. */
  clientes: Record<string, string>;
  /** [NC, factura que la reemplaza] ("probable refacturación"). */
  refact: [number, number][];
};

/** Todas las facturas y NC de cliente posteadas desde el inicio hasta hoy, cada una a su dólar. */
export async function leerFacturas(hoy: string, dolar: SerieDolar): Promise<BaseFacturas> {
  const filas = await searchReadTodo<{
    id: number; name: string; invoice_date: string; amount_untaxed_signed: number; move_type: string;
    commercial_partner_id: M2o; reversed_entry_id: M2o;
  }>(
    "account.move",
    [["move_type", "in", ["out_invoice", "out_refund"]], ["state", "=", "posted"], ["invoice_date", ">=", INICIO_ODOO], ["invoice_date", "<=", hoy]],
    ["name", "invoice_date", "amount_untaxed_signed", "move_type", "commercial_partner_id", "reversed_entry_id"],
  );
  const clientes: Record<string, string> = {};
  const docs: Doc[] = filas.map((f) => {
    const cli = id(f.commercial_partner_id) ?? 0;
    if (cli && !clientes[cli]) clientes[cli] = txt(f.commercial_partner_id);
    const ars = Number(f.amount_untaxed_signed) || 0;
    const usd = aUsd(dolar, ars, f.invoice_date);
    return { id: f.id, fecha: f.invoice_date, ars, usd: usd == null ? null : Math.round(usd * 100) / 100, nc: f.move_type === "out_refund", cli, nombre: f.name, rev: id(f.reversed_entry_id) };
  });
  docs.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.id - b.id);
  return { docs, clientes, refact: [...emparejarNC(docs).entries()] };
}

// ─── Qué facturamos (renglones) ─────────────────────────────────────────────────────────

export type BaseComposicion = { filas: FilaComposicion[]; renglones: number; sinClasificar: number };

/**
 * Los renglones de producto de las facturas y NC, clasificados por tipo (§3.2) y sumados
 * por día. Lo que no se clasifica por producto ni por texto toma la familia dominante de su
 * orden de venta (por sale_line_ids o el "S00000" del origen); sin orden, "sin clasificar".
 * La suma de los renglones es el facturado neto (cuadra con la cabecera).
 */
export async function leerComposicion(hoy: string, dolar: SerieDolar, docs: readonly Doc[]): Promise<BaseComposicion> {
  const fechaDe = new Map(docs.map((d) => [d.id, d.fecha]));
  const lineas = await searchReadTodo<{ id: number; move_id: M2o; product_id: M2o; name: string | false; balance: number; sale_line_ids: number[] }>(
    "account.move.line",
    [["display_type", "=", "product"], ["parent_state", "=", "posted"], ["move_id.move_type", "in", ["out_invoice", "out_refund"]], ["move_id.invoice_date", ">=", INICIO_ODOO], ["move_id.invoice_date", "<=", hoy]],
    ["move_id", "product_id", "name", "balance", "sale_line_ids"],
  );
  const clasif: { fecha: string; ars: number; tipo: TipoVenta | null; linea: (typeof lineas)[number] }[] = [];
  for (const l of lineas) {
    const fecha = fechaDe.get(id(l.move_id) ?? -1);
    if (!fecha) continue;
    clasif.push({ fecha, ars: -(Number(l.balance) || 0), tipo: tipoDeRenglon(txt(l.product_id) || null, l.name || null), linea: l });
  }

  // Renglones sin tipo: la familia dominante de su orden.
  const pendientes = clasif.filter((c) => c.tipo == null);
  if (pendientes.length) {
    const lineaVenta = [...new Set(pendientes.flatMap((c) => c.linea.sale_line_ids.slice(0, 1)))];
    const ordenDeLinea = new Map<number, number>();
    for (const sl of await read<{ id: number; order_id: M2o }>("sale.order.line", lineaVenta, ["order_id"])) {
      const o = id(sl.order_id);
      if (o != null) ordenDeLinea.set(sl.id, o);
    }
    const sinLinea = [...new Set(pendientes.filter((c) => !c.linea.sale_line_ids.length).map((c) => id(c.linea.move_id)!).filter(Boolean))];
    const origenDe = new Map<number, string>();
    for (const m of await read<{ id: number; invoice_origin: string | false }>("account.move", sinLinea, ["invoice_origin"])) {
      const s = /S\d{5}/.exec(m.invoice_origin || "")?.[0];
      if (s) origenDe.set(m.id, s);
    }
    const nombres = [...new Set(origenDe.values())];
    const ordenDeNombre = new Map<string, number>();
    if (nombres.length) for (const o of await searchRead<{ id: number; name: string }>("sale.order", [["name", "in", nombres]], ["name"])) ordenDeNombre.set(o.name, o.id);
    const ordenDe = (c: (typeof pendientes)[number]): number | null => {
      const sl = c.linea.sale_line_ids[0];
      if (sl != null && ordenDeLinea.has(sl)) return ordenDeLinea.get(sl)!;
      const s = origenDe.get(id(c.linea.move_id) ?? -1);
      return s ? ordenDeNombre.get(s) ?? null : null;
    };
    const ordenes = [...new Set(pendientes.map(ordenDe).filter((o): o is number => o != null))];
    const renglones = ordenes.length
      ? await searchReadTodo<{ order_id: M2o; product_id: M2o; name: string | false; price_subtotal: number }>(
          "sale.order.line",
          [["order_id", "in", ordenes], ["is_downpayment", "=", false], ["display_type", "=", false]],
          ["order_id", "product_id", "name", "price_subtotal"],
        )
      : [];
    const porOrden = new Map<number, { producto: string | null; texto: string | null; monto: number }[]>();
    for (const r of renglones) {
      const o = id(r.order_id);
      if (o == null) continue;
      (porOrden.get(o) ?? porOrden.set(o, []).get(o)!).push({ producto: txt(r.product_id) || null, texto: r.name || null, monto: Number(r.price_subtotal) || 0 });
    }
    for (const c of pendientes) {
      const o = ordenDe(c);
      c.tipo = o != null ? tipoDeFamilia(familiaDominante(porOrden.get(o) ?? [])) : "sin_clasificar";
    }
  }

  const acc = new Map<string, FilaComposicion>();
  for (const c of clasif) {
    const tipo = c.tipo ?? "sin_clasificar";
    const k = `${c.fecha}|${tipo}`;
    const f = acc.get(k) ?? [c.fecha, tipo, 0, 0];
    f[2] += c.ars;
    f[3] += aUsd(dolar, c.ars, c.fecha) ?? 0;
    acc.set(k, f);
  }
  return {
    filas: [...acc.values()].sort((a, b) => a[0].localeCompare(b[0])),
    renglones: clasif.length,
    sinClasificar: clasif.filter((c) => c.tipo === "sin_clasificar").length,
  };
}

// ─── Resultado de gestión (finanzas §6) ─────────────────────────────────────────────────

export type BaseResultado = {
  filas: FilaCuentaMes[];
  /** Andamios y estructuras en el activo (1.2.5.08.*), a valor histórico. */
  andamiosArs: number | null;
  /** Amortización acumulada de esas cuentas (0 = nunca se amortizó). */
  amortizacionAcumArs: number | null;
};

const TIPOS_RESULTADO = ["income", "income_other", "expense", "expense_depreciation", "expense_direct_cost"];

/** Saldos por cuenta y mes (−balance = ingreso), desde el inicio hasta hoy, por fecha contable. */
export async function leerResultado(hoy: string): Promise<BaseResultado> {
  const grupos = await readGroup<{ account_id: M2o; balance: number; __range?: Record<string, { from: string }> }>(
    "account.move.line",
    [["parent_state", "=", "posted"], ["date", ">=", INICIO_ODOO], ["date", "<=", hoy], ["account_id.account_type", "in", TIPOS_RESULTADO]],
    ["balance:sum"],
    ["account_id", "date:month"],
  );
  const cuentas = new Map(
    (await searchRead<{ id: number; code: string; name: string; account_type: string }>("account.account", [["account_type", "in", TIPOS_RESULTADO]], ["code", "name", "account_type"], { context: { active_test: false } })).map((c) => [c.id, c]),
  );
  const filas: FilaCuentaMes[] = [];
  for (const g of grupos) {
    const cuenta = id(g.account_id);
    const desde = g.__range?.["date:month"]?.from;
    if (cuenta == null || !desde) continue;
    const c = cuentas.get(cuenta);
    filas.push({ mes: desde.slice(0, 7), cuenta, codigo: c?.code ?? txt(g.account_id).split(" ")[0], nombre: c?.name ?? txt(g.account_id), tipo: c?.account_type ?? "expense", balance: Number(g.balance) || 0 });
  }
  let andamiosArs: number | null = null;
  let amortizacionAcumArs: number | null = null;
  try {
    const activos = await readGroup<{ account_id: M2o; balance: number }>(
      "account.move.line",
      [["parent_state", "=", "posted"], ["account_id.code", "=like", "1.2.5.08%"], ["date", "<=", hoy]],
      ["balance:sum"],
      ["account_id"],
    );
    andamiosArs = 0;
    amortizacionAcumArs = 0;
    for (const a of activos) {
      if (/amortiz/i.test(txt(a.account_id))) amortizacionAcumArs += -(Number(a.balance) || 0);
      else andamiosArs += Number(a.balance) || 0;
    }
  } catch (e) {
    console.warn("[direccion] ventas: no se leyó el valor de los andamios:", e instanceof Error ? e.message : e);
  }
  return { filas, andamiosArs, amortizacionAcumArs };
}

// ─── Comercial: órdenes, confirmaciones, CRM ────────────────────────────────────────────

export type BaseComercial = {
  /** Órdenes confirmadas hoy (state = sale): [día de date_order, total con IVA, id, nombre, cliente]. Lo que mira el tablero de Odoo. */
  confirmadas: [string, number, number, string, string][];
  /** Reconfirmaciones: [día, id de orden]. */
  reconfirmaciones: [string, number][];
  /** Las órdenes reconfirmadas: id → nombre, cliente, sin IVA. */
  reconfirmadas: Record<string, { nombre: string; cliente: string; sinIva: number }>;
  tiempo: TiempoAprobacion;
  vivo: CotizadoVivo;
  conversion: Conversion;
  concentracion: { pct: number; ars: number; cantidad: number; conversionPct: number } | null;
  crm: { abiertas: number; sinActividad: number } | null;
  vencen: { d7: number; d15: number } | null;
};

const ESTADO_SALE = "state";

export async function leerComercial(hoy: string): Promise<BaseComercial> {
  // 1. Cambios de estado de las órdenes (mail.tracking.value del campo state).
  const campo = await searchRead<{ id: number }>("ir.model.fields", [["model", "=", "sale.order"], ["name", "=", ESTADO_SALE]], ["id"], { limit: 1 });
  const cambios: CambioEstado[] = [];
  if (campo[0]) {
    const tv = await searchReadTodo<{ mail_message_id: M2o; old_value_char: string | false; new_value_char: string | false }>(
      "mail.tracking.value",
      [["field_id", "=", campo[0].id]],
      ["mail_message_id", "old_value_char", "new_value_char"],
    );
    const msgIds = [...new Set(tv.map((t) => id(t.mail_message_id)).filter((x): x is number => x != null))];
    const msgs = new Map<number, { res_id: number; date: string; model: string }>();
    for (let i = 0; i < msgIds.length; i += 1000) {
      for (const m of await read<{ id: number; res_id: number; date: string; model: string }>("mail.message", msgIds.slice(i, i + 1000), ["res_id", "date", "model"])) msgs.set(m.id, m);
    }
    for (const t of tv) {
      const m = msgs.get(id(t.mail_message_id) ?? -1);
      if (!m || m.model !== "sale.order") continue;
      cambios.push({ orden: m.res_id, instante: instante(m.date)!, viejo: t.old_value_char || null, nuevo: t.new_value_char || null });
    }
  }
  const historia = historiaOrdenes(cambios);

  // 2. Órdenes.
  const crudas = await searchReadTodo<{
    id: number; name: string; create_date: string; date_order: string | false; state: string; amount_untaxed: number; amount_total: number;
    partner_id: M2o; user_id: M2o; opportunity_id: M2o; x_studio_tipo_de_contrato: string | false;
  }>("sale.order", [], ["name", "create_date", "date_order", "state", "amount_untaxed", "amount_total", "partner_id", "user_id", "opportunity_id", "x_studio_tipo_de_contrato"]);
  const ordenes: Orden[] = crudas.map((o) => ({
    id: o.id,
    nombre: o.name,
    creada: instante(o.create_date)!,
    fechaOrden: instante(o.date_order),
    estado: o.state,
    sinIva: Number(o.amount_untaxed) || 0,
    conIva: Number(o.amount_total) || 0,
    cliente: txt(o.partner_id),
    usuario: id(o.user_id),
    oportunidad: id(o.opportunity_id),
    tipoContrato: o.x_studio_tipo_de_contrato ? String(o.x_studio_tipo_de_contrato).trim() : null,
  }));
  const porId = new Map(ordenes.map((o) => [o.id, o]));

  // 3. Estado de las oportunidades (las perdidas suelen estar archivadas: active_test false).
  const ops = [...new Set(ordenes.filter((o) => o.estado === "draft" && o.oportunidad != null).map((o) => o.oportunidad!))];
  const oportunidades = new Map<number, EstadoOportunidad>();
  for (let i = 0; i < ops.length; i += 1000) {
    const filas = await searchRead<{ id: number; won_status: EstadoOportunidad }>("crm.lead", [["id", "in", ops.slice(i, i + 1000)]], ["won_status"], { context: { active_test: false }, limit: 1000 });
    for (const f of filas) oportunidades.set(f.id, f.won_status);
  }

  // 4. Ganado inicial de las órdenes ganadas: renglones sin anticipos, secciones ni renovaciones.
  const ganadas = ordenes.filter((o) => primeraConfirmacion(o, historia.get(o.id)) != null).map((o) => o.id);
  const ganadoInicial = new Map<number, number>();
  for (let i = 0; i < ganadas.length; i += 1000) {
    const grupos = await readGroup<{ order_id: M2o; price_subtotal: number }>(
      "sale.order.line",
      [["order_id", "in", ganadas.slice(i, i + 1000)], ["is_downpayment", "=", false], ["display_type", "=", false], "|", ["product_id", "=", false], ["product_id.name", "not ilike", "RENOVACI"]],
      ["price_subtotal:sum"],
      ["order_id"],
    );
    for (const g of grupos) { const o = id(g.order_id); if (o != null) ganadoInicial.set(o, Number(g.price_subtotal) || 0); }
  }

  // 5. Lo que mira el tablero de Odoo y las reconfirmaciones.
  const confirmadas: BaseComercial["confirmadas"] = ordenes
    .filter((o) => o.estado === "sale" && o.fechaOrden)
    .map((o) => [diaBA(o.fechaOrden!), o.conIva, o.id, o.nombre, o.cliente]);
  const reconfirmaciones: [string, number][] = [];
  const reconfirmadas: BaseComercial["reconfirmadas"] = {};
  for (const [orden, h] of historia) {
    for (const r of h.reconfirmaciones) {
      reconfirmaciones.push([diaBA(r), orden]);
      const o = porId.get(orden);
      if (o) reconfirmadas[orden] = { nombre: o.nombre, cliente: o.cliente, sinIva: o.sinIva };
    }
  }

  const desde12 = `${sumarDias(hoy, -365)}T03:00:00Z`;
  const vivo = cotizadoVivo(ordenes, historia, oportunidades, hoy);

  // 6. CRM y vencimientos (conteos sueltos: si fallan, esa fila queda sin dato).
  let crm: BaseComercial["crm"] = null;
  try {
    const abiertas: unknown[] = [["type", "=", "opportunity"], ["active", "=", true], ["won_status", "=", "pending"], ["stage_id.name", "!=", "Frizado"]];
    const [n, sin] = await Promise.all([searchCount("crm.lead", abiertas), searchCount("crm.lead", [...abiertas, ["activity_state", "=", false]])]);
    crm = { abiertas: n, sinActividad: sin };
  } catch (e) {
    console.warn("[direccion] ventas: CRM sin leer:", e instanceof Error ? e.message : e);
  }
  let vencen: BaseComercial["vencen"] = null;
  try {
    const enLaCalle: unknown[] = [
      ["is_rental_order", "=", true], ["state", "=", "sale"], "|",
      "&", ["rental_status", "=", "return"], ["x_studio_estado_de_obra", "!=", "Desarmado"],
      "&", ["rental_status", "=", "pickup"], ["x_studio_estado_de_obra", "in", ["Armado", "Pendiente de Desarme"]],
    ];
    // Días de Buenos Aires (UTC−3) pasados a UTC, como guarda Odoo.
    const desde = `${hoy} 03:00:00`;
    const hasta = (n: number) => `${sumarDias(hoy, n + 1)} 02:59:59`;
    const [d7, d15] = await Promise.all([
      searchCount("sale.order", [...enLaCalle, ["rental_return_date", ">=", desde], ["rental_return_date", "<=", hasta(7)]]),
      searchCount("sale.order", [...enLaCalle, ["rental_return_date", ">=", desde], ["rental_return_date", "<=", hasta(15)]]),
    ]);
    vencen = { d7, d15 };
  } catch (e) {
    console.warn("[direccion] ventas: vencimientos sin leer:", e instanceof Error ? e.message : e);
  }

  return {
    confirmadas,
    reconfirmaciones: reconfirmaciones.sort((a, b) => a[0].localeCompare(b[0])),
    reconfirmadas,
    tiempo: tiempoAprobacion(ordenes, historia, desde12),
    vivo,
    conversion: conversionHistorica(ordenes, historia, ganadoInicial, hoy),
    concentracion: concentracionCotizado(vivo, ordenes, historia, hoy),
    crm,
    vencen,
  };
}
