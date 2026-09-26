// Lo comercial de Odoo para el asistente: clientes, presupuestos, precios y pendientes.
//
// SOLO server-side. Lectura en este archivo; las escrituras (crear la orden, adjuntar el PDF,
// mandar el mail) viven en presupuestos.ts y SÓLO las llama una acción confirmada.
//
// TIMEOUT EN TODO: el asistente está conversando con alguien. Una consulta colgada deja al
// vendedor mirando un chat quieto; con 20 s de tope, el modelo recibe un error legible y
// puede decirlo o reintentar.
//
// LO QUE SE DEVUELVE ES COMPACTO A PROPÓSITO: cada campo que vuelve entra al contexto del
// modelo en cada vuelta. Nombres en vez de tuplas [id, nombre], textos largos recortados.

import { executeKw, searchCount, type OpcionesRpc } from "@/lib/odoo/client";
import { urlOdooVenta } from "@/lib/odoo/habilitaciones";

export const LECTURA: OpcionesRpc = { timeoutMs: 20_000 };

type M2O = [number, string] | false;
const nombre = (v: M2O | undefined) => (Array.isArray(v) ? v[1] : null);
const idDe = (v: M2O | undefined) => (Array.isArray(v) ? v[0] : null);
const txt = (v: unknown, max = 400) => (typeof v === "string" && v.trim() ? (v.length > max ? `${v.slice(0, max)}…` : v.trim()) : null);
const num = (v: unknown) => (typeof v === "number" ? v : null);

function leer<T>(modelo: string, dominio: unknown[], campos: string[], opts: { limit?: number; order?: string; context?: Record<string, unknown> } = {}): Promise<T[]> {
  const { context, ...resto } = opts;
  return executeKw<T[]>(modelo, "search_read", [dominio], { fields: campos, ...resto, ...(context ? { context } : {}) }, LECTURA);
}

/** "30-71111650-4", "30711116504" → los dos formatos, para buscar como esté cargado. */
function variantesCuit(texto: string): string[] {
  const d = texto.replace(/\D/g, "");
  if (d.length !== 11) return [];
  return [d, `${d.slice(0, 2)}-${d.slice(2, 10)}-${d[10]}`];
}

const ESTADO_VENTA: Record<string, string> = { draft: "presupuesto", sent: "presupuesto enviado", sale: "confirmada", cancel: "cancelada" };

// ── Clientes ────────────────────────────────────────────────────────────────────────────

export type ClienteResumen = {
  id: number;
  nombre: string;
  cuit: string | null;
  email: string | null;
  telefono: string | null;
  direccion: string | null;
  esEmpresa: boolean;
  empresa: string | null;
  presupuestos: number | null;
};

type FilaPartner = {
  id: number; name: string; vat: string | false; email: string | false; phone: string | false;
  street: string | false; city: string | false; is_company: boolean; parent_id: M2O; sale_order_count?: number;
};

const CAMPOS_PARTNER = ["id", "name", "vat", "email", "phone", "street", "city", "is_company", "parent_id", "sale_order_count"];

function resumenPartner(p: FilaPartner): ClienteResumen {
  return {
    id: p.id,
    nombre: p.name?.trim() ?? `Odoo #${p.id}`,
    cuit: txt(p.vat),
    email: txt(p.email),
    telefono: txt(p.phone),
    direccion: [txt(p.street), txt(p.city)].filter(Boolean).join(", ") || null,
    esEmpresa: p.is_company,
    empresa: nombre(p.parent_id),
    presupuestos: num(p.sale_order_count),
  };
}

/** Por nombre, CUIT (con o sin guiones), mail o teléfono. Empresas primero. */
export async function buscarClientes(texto: string, limite = 8): Promise<ClienteResumen[]> {
  const t = texto.trim();
  if (t.length < 2) return [];
  const cuits = variantesCuit(t);
  const condiciones: unknown[][] = [["name", "ilike", t], ["email", "ilike", t], ["phone", "ilike", t], ...cuits.map((c) => ["vat", "ilike", c])];
  const dominio = [...Array(condiciones.length - 1).fill("|"), ...condiciones];
  const filas = await leer<FilaPartner>("res.partner", dominio, CAMPOS_PARTNER, { limit: limite, order: "is_company desc, customer_rank desc, id desc" });
  return filas.map(resumenPartner);
}

export type ClienteDetalle = ClienteResumen & {
  contactos: { nombre: string; cargo: string | null; telefono: string | null; email: string | null }[];
  ultimasVentas: VentaResumen[];
  deuda: { vencida: number; total: number; facturasVencidas: number };
};

export async function verCliente(id: number): Promise<ClienteDetalle | null> {
  const [p] = await executeKw<FilaPartner[]>("res.partner", "read", [[id]], { fields: [...CAMPOS_PARTNER, "child_ids"] }, LECTURA);
  if (!p) return null;
  const hoy = new Date().toISOString().slice(0, 10);
  const [contactos, ventas, facturas] = await Promise.all([
    leer<{ name: string; function: string | false; phone: string | false; email: string | false }>(
      "res.partner", [["parent_id", "=", id], ["active", "=", true]], ["name", "function", "phone", "email"], { limit: 12 },
    ),
    buscarPresupuestos({ partnerId: id, limite: 6 }),
    leer<{ amount_residual: number; invoice_date_due: string | false }>(
      "account.move",
      [["commercial_partner_id", "=", id], ["move_type", "in", ["out_invoice", "out_receipt"]], ["state", "=", "posted"], ["payment_state", "in", ["not_paid", "partial"]]],
      ["amount_residual", "invoice_date_due"],
      { limit: 200 },
    ),
  ]);
  const vencidas = facturas.filter((f) => f.invoice_date_due && f.invoice_date_due < hoy);
  return {
    ...resumenPartner(p),
    contactos: contactos.map((c) => ({ nombre: c.name, cargo: txt(c.function), telefono: txt(c.phone), email: txt(c.email) })),
    ultimasVentas: ventas,
    deuda: {
      total: Math.round(facturas.reduce((a, f) => a + f.amount_residual, 0)),
      vencida: Math.round(vencidas.reduce((a, f) => a + f.amount_residual, 0)),
      facturasVencidas: vencidas.length,
    },
  };
}

// ── Presupuestos y ventas ───────────────────────────────────────────────────────────────

export type VentaResumen = {
  id: number;
  numero: string;
  cliente: string | null;
  fecha: string | null;
  estado: string;
  estadoObra: string | null;
  neto: number;
  direccionObra: string | null;
  referencia: string | null;
  tecnico: string | null;
  vendedor: string | null;
  contrato: string | null;
  url: string;
};

type FilaVenta = {
  id: number; name: string; partner_id: M2O; date_order: string | false; state: string; amount_untaxed: number;
  x_direccion_obra: string | false; client_order_ref: string | false; x_studio_tcnico: M2O; user_id: M2O;
  x_studio_estado_de_obra: string | false; x_studio_tipo_de_contrato: string | false;
};

const CAMPOS_VENTA = ["id", "name", "partner_id", "date_order", "state", "amount_untaxed", "x_direccion_obra", "client_order_ref",
  "x_studio_tcnico", "user_id", "x_studio_estado_de_obra", "x_studio_tipo_de_contrato"];

function resumenVenta(v: FilaVenta): VentaResumen {
  return {
    id: v.id,
    numero: v.name,
    cliente: nombre(v.partner_id),
    fecha: v.date_order ? v.date_order.slice(0, 10) : null,
    estado: ESTADO_VENTA[v.state] ?? v.state,
    estadoObra: txt(v.x_studio_estado_de_obra),
    neto: Math.round(v.amount_untaxed),
    direccionObra: txt(v.x_direccion_obra),
    referencia: txt(v.client_order_ref, 160),
    tecnico: nombre(v.x_studio_tcnico),
    vendedor: nombre(v.user_id),
    contrato: txt(v.x_studio_tipo_de_contrato)?.trim() ?? null,
    url: urlOdooVenta(v.id) ?? "",
  };
}

export type FiltroPresupuestos = {
  texto?: string;
  partnerId?: number;
  direccion?: string;
  estado?: "presupuesto" | "enviado" | "confirmado" | "cancelado" | "abiertos" | "todos";
  desde?: string;
  hasta?: string;
  tecnicoEmployeeId?: number;
  limite?: number;
};

export async function buscarPresupuestos(f: FiltroPresupuestos): Promise<VentaResumen[]> {
  const d: unknown[] = [];
  if (f.partnerId) d.push(["partner_id", "child_of", f.partnerId]);
  if (f.direccion?.trim()) d.push(["x_direccion_obra", "ilike", f.direccion.trim()]);
  if (f.texto?.trim()) {
    const t = f.texto.trim();
    d.push("|", "|", "|", ["name", "ilike", t], ["partner_id.name", "ilike", t], ["x_direccion_obra", "ilike", t], ["client_order_ref", "ilike", t]);
  }
  const estados: Record<string, string[]> = {
    presupuesto: ["draft"], enviado: ["sent"], confirmado: ["sale"], cancelado: ["cancel"], abiertos: ["draft", "sent"],
  };
  if (f.estado && f.estado !== "todos") d.push(["state", "in", estados[f.estado]]);
  if (f.desde) d.push(["date_order", ">=", f.desde]);
  if (f.hasta) d.push(["date_order", "<=", `${f.hasta} 23:59:59`]);
  if (f.tecnicoEmployeeId) d.push(["x_studio_tcnico", "=", f.tecnicoEmployeeId]);
  const filas = await leer<FilaVenta>("sale.order", d, CAMPOS_VENTA, { limit: Math.min(f.limite ?? 10, 30), order: "date_order desc, id desc" });
  return filas.map(resumenVenta);
}

export type LineaVenta = {
  id: number;
  productoId: number | null;
  producto: string | null;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  descuentoPct: number;
  subtotal: number;
  opcional: boolean;
  tipo: "linea" | "seccion" | "nota";
};

export type VentaDetalle = VentaResumen & {
  lineas: LineaVenta[];
  trabajo: Record<string, unknown>;
  oportunidad: { id: number; nombre: string } | null;
  alquiler: { desde: string | null; hasta: string | null; estado: string | null };
  adjuntos: { id: number; nombre: string; tipo: string; bytes: number; fecha: string }[];
  alcanceTecnico: string | null;
};

const CAMPOS_TRABAJO_VENTA = ["x_trabajo_ambito", "x_trabajo_obra", "x_trabajo_evento", "x_alambre_concertina", "x_syh_presencial",
  "x_lleva_permiso", "x_permiso_modalidad", "x_dur_armado", "x_dur_desarme", "x_personal_armado", "x_personal_desarme", "x_fecha_fin_obra_estimada"];

/** Por número (S02412) o id. */
export async function verPresupuesto(ref: string | number): Promise<VentaDetalle | null> {
  const dominio = typeof ref === "number" || /^\d+$/.test(String(ref)) ? [["id", "=", Number(ref)]] : [["name", "=ilike", String(ref).trim()]];
  const [v] = await leer<FilaVenta & Record<string, unknown>>(
    "sale.order", dominio,
    [...CAMPOS_VENTA, ...CAMPOS_TRABAJO_VENTA, "opportunity_id", "rental_start_date", "rental_return_date", "rental_status", "x_alcance_tecnico", "order_line"],
    { limit: 1 },
  );
  if (!v) return null;
  const [lineas, adjuntos] = await Promise.all([
    leer<{ id: number; product_id: M2O; name: string; product_uom_qty: number; price_unit: number; discount: number; price_subtotal: number; is_optional?: boolean; display_type: string | false }>(
      "sale.order.line", [["order_id", "=", v.id]],
      ["id", "product_id", "name", "product_uom_qty", "price_unit", "discount", "price_subtotal", "is_optional", "display_type"],
      { order: "sequence, id", limit: 60 },
    ),
    leer<{ id: number; name: string; mimetype: string; file_size: number; create_date: string }>(
      "ir.attachment", [["res_model", "=", "sale.order"], ["res_id", "=", v.id]],
      ["id", "name", "mimetype", "file_size", "create_date"], { order: "id desc", limit: 20 },
    ),
  ]);
  const trabajo: Record<string, unknown> = {};
  for (const c of CAMPOS_TRABAJO_VENTA) if (v[c] !== false && v[c] !== null && v[c] !== undefined) trabajo[c] = v[c];
  return {
    ...resumenVenta(v),
    lineas: lineas.map((l) => ({
      id: l.id,
      productoId: idDe(l.product_id),
      producto: nombre(l.product_id),
      descripcion: l.name,
      cantidad: l.product_uom_qty,
      precioUnitario: l.price_unit,
      descuentoPct: l.discount,
      subtotal: Math.round(l.price_subtotal),
      opcional: !!l.is_optional,
      tipo: l.display_type === "line_section" ? "seccion" : l.display_type === "line_note" ? "nota" : "linea",
    })),
    trabajo,
    oportunidad: Array.isArray(v.opportunity_id) ? { id: (v.opportunity_id as [number, string])[0], nombre: (v.opportunity_id as [number, string])[1] } : null,
    alquiler: {
      desde: typeof v.rental_start_date === "string" ? v.rental_start_date.slice(0, 10) : null,
      hasta: typeof v.rental_return_date === "string" ? v.rental_return_date.slice(0, 10) : null,
      estado: txt(v.rental_status),
    },
    adjuntos: adjuntos.map((a) => ({ id: a.id, nombre: a.name, tipo: a.mimetype, bytes: a.file_size, fecha: a.create_date.slice(0, 10) })),
    alcanceTecnico: txt(v.x_alcance_tecnico, 1500),
  };
}

/** Un adjunto de una venta, en base64 (para pasárselo al modelo). Tope 8 MB. */
export async function leerAdjuntoVenta(id: number): Promise<{ nombre: string; tipo: string; base64: string; bytes: number } | null> {
  const [a] = await executeKw<{ name: string; mimetype: string; datas: string | false; file_size: number; res_model: string }[]>(
    "ir.attachment", "read", [[id]], { fields: ["name", "mimetype", "datas", "file_size", "res_model"] }, { timeoutMs: 45_000 },
  );
  if (!a || a.res_model !== "sale.order" || !a.datas) return null;
  if (a.file_size > 8 * 1024 * 1024) throw new Error(`El adjunto pesa ${Math.round(a.file_size / 1e6)} MB: demasiado para leerlo acá`);
  return { nombre: a.name, tipo: a.mimetype, base64: a.datas, bytes: a.file_size };
}

// ── Precios recientes ───────────────────────────────────────────────────────────────────

export async function preciosRecientes(productId: number, meses = 3): Promise<{
  lineas: { venta: string; fecha: string; cliente: string | null; cantidad: number; precio: number; descuento: number; estado: string }[];
  mediana: number | null;
  minimo: number | null;
  maximo: number | null;
}> {
  const desde = new Date(Date.now() - meses * 31 * 86_400_000).toISOString().slice(0, 10);
  const filas = await leer<{ order_id: M2O; create_date: string; order_partner_id: M2O; product_uom_qty: number; price_unit: number; discount: number; state: string }>(
    "sale.order.line",
    [["product_id", "=", productId], ["price_unit", ">", 1], ["create_date", ">=", desde], ["state", "!=", "cancel"]],
    ["order_id", "create_date", "order_partner_id", "product_uom_qty", "price_unit", "discount", "state"],
    { order: "id desc", limit: 40 },
  );
  const precios = filas.map((f) => f.price_unit).sort((a, b) => a - b);
  const mediana = precios.length ? precios[Math.floor(precios.length / 2)] : null;
  return {
    lineas: filas.map((f) => ({
      venta: nombre(f.order_id) ?? "",
      fecha: f.create_date.slice(0, 10),
      cliente: nombre(f.order_partner_id),
      cantidad: f.product_uom_qty,
      precio: f.price_unit,
      descuento: f.discount,
      estado: ESTADO_VENTA[f.state] ?? f.state,
    })),
    mediana,
    minimo: precios[0] ?? null,
    maximo: precios.at(-1) ?? null,
  };
}

// ── Conflicto de canal (criterio §7) ────────────────────────────────────────────────────

/** "Av. Callao 384, CABA" → "callao 384": calle + altura, que es lo que identifica la obra. */
export function claveDireccion(direccion: string): string | null {
  const limpia = direccion
    .normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/\b(av|avda|avenida|calle|pje|pasaje|gral|general|dr|ing)\.?\s+/g, " ")
    .split(",")[0]
    .replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  const m = /^(.*?)(\d{1,5})\b/.exec(limpia);
  if (!m || !m[1].trim()) return null;
  const calle = m[1].trim().split(" ").slice(-2).join(" ");
  return `${calle} ${m[2]}`;
}

export async function conflictoCanal(direccion: string, excluirVentaId?: number): Promise<{
  clave: string | null;
  ventas: VentaResumen[];
  oportunidades: { id: number; nombre: string; etapa: string | null; tecnico: string | null; vendedor: string | null; fecha: string }[];
}> {
  const clave = claveDireccion(direccion);
  if (!clave) return { clave: null, ventas: [], oportunidades: [] };
  const [calle, altura] = [clave.replace(/ \d+$/, ""), clave.match(/\d+$/)![0]];
  const desde = new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10);
  const [ventas, leads] = await Promise.all([
    leer<FilaVenta>("sale.order",
      ["&", "&", ["date_order", ">=", desde], ["x_direccion_obra", "ilike", calle], ["x_direccion_obra", "ilike", altura]],
      CAMPOS_VENTA, { limit: 15, order: "date_order desc" }),
    leer<{ id: number; name: string; stage_id: M2O; x_studio_tcnico: M2O; user_id: M2O; create_date: string }>("crm.lead",
      ["&", "&", ["create_date", ">=", desde], "|", ["name", "ilike", calle], ["street", "ilike", calle], "|", ["name", "ilike", altura], ["street", "ilike", altura]],
      ["id", "name", "stage_id", "x_studio_tcnico", "user_id", "create_date"], { limit: 15, order: "create_date desc", context: { active_test: false } }),
  ]);
  return {
    clave,
    ventas: ventas.filter((v) => v.id !== excluirVentaId).map(resumenVenta),
    oportunidades: leads.map((l) => ({ id: l.id, nombre: l.name, etapa: nombre(l.stage_id), tecnico: nombre(l.x_studio_tcnico), vendedor: nombre(l.user_id), fecha: l.create_date.slice(0, 10) })),
  };
}

// ── Pendientes del día (los filtros de la capacitación de las asistentes) ──────────────

/**
 * Los cinco chequeos diarios de las asistentes comerciales, con los MISMOS dominios que sus
 * filtros guardados en Odoo (ir.filters 97, 8, 80, 102, 103 y las actividades del CRM), más
 * los presupuestos enviados hace más de 7 días sin respuesta. Filtrado por técnico si se pasa.
 */
export async function pendientesComerciales(tecnicoEmployeeId: number | null) {
  const hoy = new Date().toISOString().slice(0, 10);
  const en7 = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
  const hace7 = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
  const porTecnicoVenta = tecnicoEmployeeId ? [["x_studio_tcnico", "=", tecnicoEmployeeId]] : [];
  const porTecnicoFactura = tecnicoEmployeeId ? [["x_studio_related_field_6cf_1jhm55use", "=", tecnicoEmployeeId]] : [];
  const porTecnicoLead = tecnicoEmployeeId ? [["x_studio_tcnico", "=", tecnicoEmployeeId]] : [];

  const [vencen, vencidos, facturasVencidas, armadasSinFacturar, sinEnviar, actividades, sinRespuesta] = await Promise.all([
    leer<FilaVenta & { rental_return_date: string }>("sale.order",
      [["x_studio_estado_de_obra", "=", "Armado"], ["x_studio_tipo_de_contrato", "=", "Obra "], ["rental_return_date", ">=", hoy], ["rental_return_date", "<=", `${en7} 23:59:59`], ...porTecnicoVenta],
      [...CAMPOS_VENTA, "rental_return_date"], { limit: 30, order: "rental_return_date" }),
    leer<FilaVenta & { rental_return_date: string }>("sale.order",
      [["is_rental_order", "=", true], ["rental_return_date", "<", hoy], ["rental_status", "=", "return"], ...porTecnicoVenta],
      [...CAMPOS_VENTA, "rental_return_date"], { limit: 30, order: "rental_return_date" }),
    leer<{ name: string; partner_id: M2O; invoice_date_due: string; amount_residual: number }>("account.move",
      [["move_type", "in", ["out_invoice", "out_receipt"]], ["invoice_date_due", "<", hoy], ["state", "=", "posted"], ["payment_state", "in", ["not_paid", "partial"]], ...porTecnicoFactura],
      ["name", "partner_id", "invoice_date_due", "amount_residual"], { limit: 40, order: "invoice_date_due" }),
    leer<FilaVenta>("sale.order",
      [["is_rental_order", "=", true], ["x_studio_estado_de_obra", "=", "Armado"], ["invoice_status", "=", "to invoice"], ...porTecnicoVenta],
      CAMPOS_VENTA, { limit: 30 }),
    leer<{ name: string; partner_id: M2O; invoice_date: string; amount_total: number }>("account.move",
      [["move_type", "in", ["out_invoice", "out_receipt"]], ["is_move_sent", "=", false], ["state", "=", "posted"], ["invoice_date", ">=", "2026-03-27"], ...porTecnicoFactura],
      ["name", "partner_id", "invoice_date", "amount_total"], { limit: 30, order: "invoice_date desc" }),
    leer<{ name: string; partner_id: M2O; activity_date_deadline: string | false; activity_summary: string | false; activity_state: string | false }>("crm.lead",
      [["activity_state", "in", ["overdue", "today"]], ...porTecnicoLead],
      // activity_date_deadline no está guardado en la base: no se puede ordenar por él.
      ["name", "partner_id", "activity_date_deadline", "activity_summary", "activity_state"], { limit: 30 }),
    leer<FilaVenta>("sale.order",
      [["state", "=", "sent"], ["date_order", "<", hace7], ["date_order", ">=", new Date(Date.now() - 60 * 86_400_000).toISOString().slice(0, 10)], ...porTecnicoVenta],
      CAMPOS_VENTA, { limit: 30, order: "date_order" }),
  ]);

  return {
    contratosQueVencen7Dias: vencen.map((v) => ({ ...resumenVenta(v), vence: v.rental_return_date.slice(0, 10) })),
    contratosVencidosSinDevolver: vencidos.map((v) => ({ ...resumenVenta(v), vencio: v.rental_return_date.slice(0, 10) })),
    facturasVencidas: {
      cantidad: facturasVencidas.length,
      total: Math.round(facturasVencidas.reduce((a, f) => a + f.amount_residual, 0)),
      detalle: facturasVencidas.slice(0, 15).map((f) => ({ factura: f.name, cliente: nombre(f.partner_id), vencio: f.invoice_date_due, saldo: Math.round(f.amount_residual) })),
    },
    obrasArmadasConSaldoSinFacturar: armadasSinFacturar.map(resumenVenta),
    facturasSinEnviar: sinEnviar.map((f) => ({ factura: f.name, cliente: nombre(f.partner_id), fecha: f.invoice_date, total: Math.round(f.amount_total) })),
    actividadesVencidasCrm: actividades.map((a) => ({ oportunidad: a.name, cliente: nombre(a.partner_id), vence: a.activity_date_deadline || null, que: txt(a.activity_summary), estado: a.activity_state })),
    presupuestosEnviadosSinRespuesta: sinRespuesta.map(resumenVenta),
  };
}

// ── Estado de una obra ──────────────────────────────────────────────────────────────────

export async function estadoObra(ventaId: number) {
  const [v] = await leer<Record<string, unknown>>("sale.order", [["id", "=", ventaId]],
    ["name", "partner_id", "state", "x_studio_estado_de_obra", "x_direccion_obra", "rental_start_date", "rental_return_date", "rental_status",
      "x_lleva_permiso", "x_permiso_modalidad", "x_tramite_estado", "x_expediente_nro", "x_permiso_fecha", "x_estructura_actual", "x_estructura_fecha"],
    { limit: 1 });
  if (!v) return null;
  const ots = await leer<{ x_name: string | false; x_tipo: string | false; x_estado: string | false; x_fecha_programada: string | false; x_hab_semaforo: string | false; x_urgencia: string | false }>(
    "x_aba_orden_trabajo", [["x_order_id", "=", ventaId]],
    ["x_name", "x_tipo", "x_estado", "x_fecha_programada", "x_hab_semaforo", "x_urgencia"], { order: "id desc", limit: 12 },
  );
  return {
    venta: v.name,
    cliente: nombre(v.partner_id as M2O),
    estadoVenta: ESTADO_VENTA[String(v.state)] ?? v.state,
    estadoObra: txt(v.x_studio_estado_de_obra),
    direccion: txt(v.x_direccion_obra),
    alquiler: { desde: txt(v.rental_start_date)?.slice(0, 10) ?? null, hasta: txt(v.rental_return_date)?.slice(0, 10) ?? null, estado: txt(v.rental_status) },
    permiso: { lleva: txt(v.x_lleva_permiso), modalidad: txt(v.x_permiso_modalidad), tramite: txt(v.x_tramite_estado), expediente: txt(v.x_expediente_nro), fechaPermiso: txt(v.x_permiso_fecha) },
    comoQuedoArmado: txt(v.x_estructura_actual, 600),
    ordenesDeTrabajo: ots.map((o) => ({ ot: txt(o.x_name), tipo: txt(o.x_tipo), estado: txt(o.x_estado), programada: txt(o.x_fecha_programada), habilitacion: txt(o.x_hab_semaforo), urgencia: txt(o.x_urgencia) })),
    url: urlOdooVenta(ventaId) ?? "",
  };
}

// ── Consulta genérica, sólo lectura y con lista cerrada ─────────────────────────────────

/**
 * Para contestar "cualquier cosa" sin abrir escritura: search_read / search_count / read_group
 * sobre modelos y campos listados acá. Un campo que no está en la lista no se devuelve (ni
 * se puede filtrar por él). Nada de datos bancarios ni de personal.
 */
export const CONSULTABLE: Record<string, string[]> = {
  "res.partner": ["id", "name", "vat", "email", "phone", "street", "city", "is_company", "parent_id", "customer_rank", "user_id", "create_date"],
  "sale.order": ["id", "name", "partner_id", "date_order", "state", "amount_untaxed", "amount_total", "user_id", "x_studio_tcnico", "x_direccion_obra",
    "client_order_ref", "x_studio_estado_de_obra", "x_studio_tipo_de_contrato", "rental_start_date", "rental_return_date", "rental_status",
    "invoice_status", "opportunity_id", "x_lleva_permiso", "x_tramite_estado", "x_expediente_nro", "create_date", "is_rental_order"],
  "sale.order.line": ["id", "order_id", "product_id", "name", "product_uom_qty", "price_unit", "discount", "price_subtotal", "is_optional", "order_partner_id", "create_date", "state"],
  "crm.lead": ["id", "name", "partner_id", "stage_id", "user_id", "x_studio_tcnico", "expected_revenue", "probability", "create_date", "date_deadline",
    "activity_state", "activity_summary", "street", "city", "type", "active"],
  "account.move": ["id", "name", "partner_id", "invoice_date", "invoice_date_due", "amount_untaxed", "amount_total", "amount_residual", "payment_state",
    "state", "move_type", "invoice_user_id", "is_move_sent", "invoice_origin", "x_studio_related_field_6cf_1jhm55use"],
  "account.payment": ["id", "name", "partner_id", "amount", "date", "state", "payment_type", "journal_id"],
  "x_aba_orden_trabajo": ["id", "x_name", "x_estado", "x_tipo", "x_order_id", "x_fecha_programada", "x_direccion_obra", "x_urgencia", "x_hab_semaforo"],
  "x_aba_obra": ["id", "x_name", "x_cliente_id", "x_estado", "x_fecha_inicio", "x_fecha_fin_estimada"],
  "product.product": ["id", "display_name", "type", "active", "uom_id"],
  "hr.employee": ["id", "name", "user_id", "work_email", "active"],
};

const OPERADORES = new Set(["=", "!=", ">", ">=", "<", "<=", "like", "ilike", "not ilike", "in", "not in", "child_of", "=ilike", "=like"]);

export class ConsultaInvalida extends Error {}

function validarDominio(modelo: string, dominio: unknown[]): unknown[] {
  const permitidos = new Set(CONSULTABLE[modelo]);
  for (const t of dominio) {
    if (t === "&" || t === "|" || t === "!") continue;
    if (!Array.isArray(t) || t.length !== 3) throw new ConsultaInvalida(`Término de dominio inválido: ${JSON.stringify(t)}`);
    const [campo, op] = t as [unknown, unknown, unknown];
    if (typeof campo !== "string" || !OPERADORES.has(String(op))) throw new ConsultaInvalida(`Operador no permitido: ${JSON.stringify(t)}`);
    // "partner_id.name" se permite si partner_id está en la lista.
    if (!permitidos.has(campo.split(".")[0])) throw new ConsultaInvalida(`No se puede filtrar ${modelo} por ${campo}`);
  }
  return dominio;
}

/** [id, "nombre"] → "nombre"; textos largos recortados. Lo que vuelve entra al contexto del modelo. */
function compactar(fila: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fila)) {
    if (Array.isArray(v) && v.length === 2 && typeof v[0] === "number" && typeof v[1] === "string") out[k] = v[1];
    else if (v === false) out[k] = null;
    else if (typeof v === "string") out[k] = txt(v, 300);
    else out[k] = v;
  }
  return out;
}

export async function consultarOdoo(p: {
  modelo: string;
  operacion: "buscar" | "contar" | "agrupar";
  dominio: unknown[];
  campos?: string[];
  orden?: string;
  limite?: number;
  agruparPor?: string[];
  sumar?: string[];
}): Promise<unknown> {
  const permitidos = CONSULTABLE[p.modelo];
  if (!permitidos) throw new ConsultaInvalida(`No se puede consultar ${p.modelo}. Modelos permitidos: ${Object.keys(CONSULTABLE).join(", ")}`);
  const dominio = validarDominio(p.modelo, p.dominio ?? []);

  if (p.operacion === "contar") return { cantidad: await searchCount(p.modelo, dominio) };

  if (p.operacion === "agrupar") {
    const por = (p.agruparPor ?? []).filter((c) => permitidos.includes(c.split(":")[0]));
    if (!por.length) throw new ConsultaInvalida("Para agrupar hace falta al menos un campo permitido en agruparPor");
    const sumas = (p.sumar ?? []).filter((c) => permitidos.includes(c)).map((c) => `${c}:sum`);
    const grupos = await executeKw<Record<string, unknown>[]>(p.modelo, "read_group", [dominio, sumas, por], { lazy: false, limit: 50 }, LECTURA);
    return grupos.map((g) => compactar(Object.fromEntries(Object.entries(g).filter(([k]) => k !== "__domain" && k !== "__context"))));
  }

  const campos = (p.campos?.length ? p.campos : permitidos.slice(0, 8)).filter((c) => permitidos.includes(c));
  const orden = p.orden && permitidos.includes(p.orden.split(" ")[0]) ? p.orden : undefined;
  const filas = await leer<Record<string, unknown>>(p.modelo, dominio, campos, { limit: Math.min(p.limite ?? 20, 50), order: orden });
  return filas.map(compactar);
}
