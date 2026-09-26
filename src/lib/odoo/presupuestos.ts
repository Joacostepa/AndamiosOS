// Escrituras comerciales en Odoo: cliente, orden de alquiler en borrador, oportunidad, adjunto,
// nota y mail. Port de odoo_sync.py (skill andamios-propuesta) con lo que faltaba.
//
// SÓLO LAS LLAMA UNA ACCIÓN CONFIRMADA del asistente (src/lib/asistente/ejecutores.ts). Nada de
// acá se dispara desde una herramienta del modelo directamente.
//
// REGLAS (de la skill, verificadas contra Odoo el 26/09):
//   · toda orden es de alquiler (is_rental_order) y queda en BORRADOR: nunca se confirma;
//   · `is_rental` por línea; IVA (id 88) en cada línea; término de pago 11;
//   · NUNCA se crean productos: los ids salen de cotizacion_productos_odoo;
//   · x_studio_tipo_de_contrato "Obra " va CON el espacio final (así quedó en Studio);
//   · el técnico (x_studio_tcnico) es un hr.employee; el vendedor (user_id) un res.users;
//   · la oportunidad del CRM se busca y se vincula; si hay que crearla, en la etapa default:
//     nunca se mueve de etapa ni se le crean actividades (lo maneja cada vendedor).
//
// IDEMPOTENCIA: la orden lleva x_asistente_ref = id de la acción. Antes de crear se busca por
// esa marca: un reintento sigue desde donde quedó en vez de duplicar.

import { executeKw, type OpcionesRpc } from "@/lib/odoo/client";

const ESCRITURA: OpcionesRpc = { timeoutMs: 45_000 };
const LECTURA: OpcionesRpc = { timeoutMs: 20_000 };

type M2O = [number, string] | false;

// ── Cliente ─────────────────────────────────────────────────────────────────────────────

export type NuevoCliente = {
  razonSocial: string;
  cuit: string;
  email: string | null;
  telefono: string | null;
  domicilio: string | null;
  ciudad?: string | null;
  enCaba: boolean;
  condicionIva?: "responsable_inscripto" | "monotributo" | "exento" | "consumidor_final" | null;
  contacto?: string | null;
};

const IDS_ODOO = { argentina: 10, caba: 553, identificacionCuit: 4 };

const CONDICIONES_IVA: Record<NonNullable<NuevoCliente["condicionIva"]>, string> = {
  responsable_inscripto: "IVA Responsable Inscripto",
  monotributo: "Responsable Monotributo",
  exento: "IVA Sujeto Exento",
  consumidor_final: "Consumidor Final",
};

/** Busca por CUIT (con o sin guiones). */
export async function clientePorCuit(cuit: string): Promise<{ id: number; nombre: string } | null> {
  const d = cuit.replace(/\D/g, "");
  const conGuiones = `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}`;
  const [p] = await executeKw<{ id: number; name: string }[]>(
    "res.partner", "search_read", [["|", ["vat", "=", d], ["vat", "=", conGuiones]]],
    { fields: ["id", "name"], limit: 1, order: "is_company desc, id" }, LECTURA,
  );
  return p ? { id: p.id, nombre: p.name } : null;
}

/** Alta de cliente con los defaults de ABA. Si el CUIT ya existe, devuelve ese y no crea. */
export async function crearCliente(c: NuevoCliente): Promise<{ id: number; creado: boolean; contactoId: number | null }> {
  const ya = await clientePorCuit(c.cuit);
  if (ya) return { id: ya.id, creado: false, contactoId: null };

  const digitos = c.cuit.replace(/\D/g, "");
  let responsabilidad: number | false = false;
  if (c.condicionIva) {
    const [r] = await executeKw<{ id: number }[]>(
      "l10n_ar.afip.responsibility.type", "search_read", [[["name", "=", CONDICIONES_IVA[c.condicionIva]]]], { fields: ["id"], limit: 1 }, LECTURA,
    );
    responsabilidad = r?.id ?? false;
  }
  const id = await executeKw<number>("res.partner", "create", [{
    name: c.razonSocial.trim(),
    vat: digitos,
    l10n_latam_identification_type_id: IDS_ODOO.identificacionCuit,
    // Por el prefijo: 30/33/34 son personas jurídicas.
    is_company: /^3[034]/.test(digitos),
    email: c.email ?? false,
    phone: c.telefono ?? false,
    street: c.domicilio ?? false,
    city: c.ciudad ?? (c.enCaba ? "CABA" : false),
    state_id: c.enCaba ? IDS_ODOO.caba : false,
    country_id: IDS_ODOO.argentina,
    l10n_ar_afip_responsibility_type_id: responsabilidad,
    customer_rank: 1,
  }], {}, ESCRITURA);

  // La persona de contacto como contacto hijo: en la propuesta va "Contacto: …".
  let contactoId: number | null = null;
  if (c.contacto?.trim() && c.contacto.trim().toLowerCase() !== c.razonSocial.trim().toLowerCase()) {
    contactoId = await executeKw<number>("res.partner", "create", [{
      name: c.contacto.trim(), parent_id: id, type: "contact", email: c.email ?? false, phone: c.telefono ?? false,
    }], {}, ESCRITURA);
  }
  return { id, creado: true, contactoId };
}

// ── Orden de alquiler ───────────────────────────────────────────────────────────────────

export type LineaOrden = {
  productId: number;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  descuentoPct?: number;
  isRental: boolean;
  opcional: boolean;
};

export type DatosOrden = {
  partnerId: number;
  vendedorUserId: number | null;
  tecnicoEmployeeId: number | null;
  contrato: string;
  referencia: string | null;
  direccionObra: string | null;
  lineas: LineaOrden[];
  trabajo: Record<string, unknown>;
  alcanceTecnico: string | null;
  impuestoIvaId: number;
  terminoPagoId: number;
  asistenteRef: string;
};

function valoresOrden(d: DatosOrden, reemplazarLineas: boolean): Record<string, unknown> {
  const lineas = d.lineas.map((l) => [0, 0, {
    product_id: l.productId,
    name: l.descripcion,
    product_uom_qty: l.cantidad,
    price_unit: l.precioUnitario,
    discount: l.descuentoPct ?? 0,
    is_rental: l.isRental,
    is_optional: l.opcional,
    tax_ids: [[6, 0, [d.impuestoIvaId]]],
  }]);
  return {
    partner_id: d.partnerId,
    is_rental_order: true,
    payment_term_id: d.terminoPagoId,
    ...(d.vendedorUserId ? { user_id: d.vendedorUserId } : {}),
    ...(d.tecnicoEmployeeId ? { x_studio_tcnico: d.tecnicoEmployeeId } : {}),
    x_studio_tipo_de_contrato: d.contrato,
    client_order_ref: d.referencia ?? false,
    x_direccion_obra: d.direccionObra ?? false,
    x_alcance_tecnico: d.alcanceTecnico ?? false,
    x_asistente_ref: d.asistenteRef,
    ...d.trabajo,
    order_line: reemplazarLineas ? [[5, 0, 0], ...lineas] : lineas,
  };
}

export async function ordenPorRef(ref: string): Promise<{ id: number; name: string; state: string } | null> {
  const [o] = await executeKw<{ id: number; name: string; state: string }[]>(
    "sale.order", "search_read", [[["x_asistente_ref", "=", ref]]], { fields: ["id", "name", "state"], limit: 1 }, LECTURA,
  );
  return o ?? null;
}

/**
 * Crea la orden en borrador (o la actualiza si `ordenId` viene y sigue en borrador). Devuelve
 * el número que asignó Odoo y el neto, para comparar con el del motor.
 */
export async function guardarOrden(d: DatosOrden, ordenId: number | null): Promise<{ id: number; nombre: string; neto: number; creada: boolean }> {
  let id = ordenId;
  let creada = false;
  if (id) {
    const [o] = await executeKw<{ state: string }[]>("sale.order", "read", [[id]], { fields: ["state"] }, LECTURA);
    if (!o) throw new Error(`La orden ${id} ya no existe en Odoo.`);
    if (o.state !== "draft" && o.state !== "sent") {
      throw new Error("La orden ya está confirmada o cancelada en Odoo: no se modifica. Para cambiarla, re-emití el presupuesto.");
    }
    await executeKw("sale.order", "write", [[id], valoresOrden(d, true)], {}, ESCRITURA);
  } else {
    const ya = await ordenPorRef(d.asistenteRef);
    if (ya) {
      id = ya.id;
    } else {
      id = await executeKw<number>("sale.order", "create", [valoresOrden(d, false)], {}, ESCRITURA);
      creada = true;
    }
  }
  const [o] = await executeKw<{ name: string; amount_untaxed: number }[]>("sale.order", "read", [[id]], { fields: ["name", "amount_untaxed"] }, LECTURA);
  return { id: id!, nombre: o.name, neto: o.amount_untaxed, creada };
}

/** Cancelar una cotización vieja al re-emitir (criterio §9: no quedan dos números vivos). */
export async function cancelarOrden(id: number): Promise<{ estado: string }> {
  const [o] = await executeKw<{ state: string }[]>("sale.order", "read", [[id]], { fields: ["state"] }, LECTURA);
  if (!o) throw new Error(`La orden ${id} no existe.`);
  if (o.state === "cancel") return { estado: "cancel" };
  if (o.state === "sale") throw new Error("La orden vieja está CONFIRMADA: no se cancela desde el asistente. Hablalo con Joaquín.");
  await executeKw("sale.order", "action_cancel", [[id]], { context: { disable_cancel_warning: true } }, ESCRITURA);
  const [d] = await executeKw<{ state: string }[]>("sale.order", "read", [[id]], { fields: ["state"] }, LECTURA);
  return { estado: d.state };
}

// ── Adjunto, nota, oportunidad y mail ───────────────────────────────────────────────────

/** Adjunta el PDF a la orden. Si ya hay uno con el mismo nombre, lo reemplaza. */
export async function adjuntarPdf(ordenId: number, nombre: string, pdf: Buffer): Promise<number> {
  const previos = await executeKw<{ id: number }[]>(
    "ir.attachment", "search_read", [[["res_model", "=", "sale.order"], ["res_id", "=", ordenId], ["name", "=", nombre]]], { fields: ["id"] }, LECTURA,
  );
  const id = await executeKw<number>("ir.attachment", "create", [{
    name: nombre, type: "binary", datas: pdf.toString("base64"), res_model: "sale.order", res_id: ordenId, mimetype: "application/pdf",
  }], {}, { timeoutMs: 60_000 });
  if (previos.length) await executeKw("ir.attachment", "unlink", [previos.map((p) => p.id)], {}, ESCRITURA);
  return id;
}

/** Nota interna en el chatter de la orden (no le llega al cliente). */
export async function notaInterna(ordenId: number, html: string): Promise<void> {
  await executeKw("sale.order", "message_post", [[ordenId]], { body: html, message_type: "comment", subtype_xmlid: "mail.mt_note" }, ESCRITURA);
}

/**
 * Vincula la oportunidad del CRM (port de create_crm_opportunity). Si la orden ya tiene una,
 * no toca nada. Si hay UNA oportunidad abierta sin orden de este cliente, la usa; si no, crea
 * una en la etapa default. Nunca la mueve de etapa.
 */
export async function vincularOportunidad(p: {
  ordenId: number;
  ordenNombre: string;
  partnerId: number;
  cliente: string;
  direccionObra: string | null;
  referencia: string | null;
  neto: number;
  vendedorUserId: number | null;
  tecnicoEmployeeId: number | null;
}): Promise<{ id: number; creada: boolean; asociada: boolean }> {
  const [o] = await executeKw<{ opportunity_id: M2O }[]>("sale.order", "read", [[p.ordenId]], { fields: ["opportunity_id"] }, LECTURA);
  if (Array.isArray(o?.opportunity_id)) return { id: o.opportunity_id[0], creada: false, asociada: false };

  const titulo = [`Propuesta ${p.ordenNombre}`, p.cliente, p.direccionObra, p.referencia].filter(Boolean).join(" — ");
  const candidatas = await executeKw<{ id: number }[]>(
    "crm.lead", "search_read",
    [[["type", "=", "opportunity"], ["partner_id", "child_of", p.partnerId], ["order_ids", "=", false], ["stage_id.is_won", "=", false], ["active", "=", true]]],
    { fields: ["id"], limit: 3 }, LECTURA,
  );
  let id: number;
  let creada = false;
  if (candidatas.length === 1) {
    id = candidatas[0].id;
    await executeKw("crm.lead", "write", [[id], { name: titulo, expected_revenue: p.neto }], {}, ESCRITURA);
  } else {
    id = await executeKw<number>("crm.lead", "create", [{
      type: "opportunity",
      name: titulo,
      partner_id: p.partnerId,
      expected_revenue: p.neto,
      ...(p.vendedorUserId ? { user_id: p.vendedorUserId } : {}),
      ...(p.tecnicoEmployeeId ? { x_studio_tcnico: p.tecnicoEmployeeId } : {}),
    }], {}, ESCRITURA);
    creada = true;
  }
  await executeKw("sale.order", "write", [[p.ordenId], { opportunity_id: id }], {}, ESCRITURA);
  return { id, creada, asociada: !creada };
}

/** A quién le llegaría el mail: el que se pase, o el del cliente de la orden. */
export async function destinatarioMail(ordenId: number, emailTo?: string | null): Promise<{ email: string | null; cliente: string | null }> {
  const [o] = await executeKw<{ partner_id: M2O }[]>("sale.order", "read", [[ordenId]], { fields: ["partner_id"] }, LECTURA);
  const partnerId = Array.isArray(o?.partner_id) ? o.partner_id[0] : null;
  const [p] = partnerId ? await executeKw<{ email: string | false; name: string }[]>("res.partner", "read", [[partnerId]], { fields: ["email", "name"] }, LECTURA) : [];
  return { email: emailTo?.trim() || (p?.email || null), cliente: p?.name ?? null };
}

/**
 * Manda la propuesta con la plantilla de Odoo (sólo nuestro PDF adjunto) y deja nota en el
 * chatter. Odoo manda desde su servidor saliente; responde-a es el vendedor de la orden.
 */
export async function enviarPropuesta(p: { ordenId: number; plantillaId: number; adjuntoId: number; emailTo: string | null }): Promise<{ mailId: number | null; para: string }> {
  const dest = await destinatarioMail(p.ordenId, p.emailTo);
  if (!dest.email) throw new Error("El cliente no tiene email en Odoo y no se indicó otro.");
  const mailId = await executeKw<number>(
    "mail.template", "send_mail", [[p.plantillaId], p.ordenId],
    { force_send: true, email_values: { attachment_ids: [[4, p.adjuntoId]], ...(p.emailTo ? { email_to: p.emailTo, recipient_ids: [] } : {}) } },
    { timeoutMs: 60_000 },
  );
  await notaInterna(p.ordenId, `<p>Propuesta enviada por mail a <b>${dest.email}</b> desde el Asistente Comercial.</p>`);
  return { mailId: typeof mailId === "number" ? mailId : null, para: dest.email };
}
