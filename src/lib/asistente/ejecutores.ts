// Lo que corre cuando una acción se confirma. SOLO server-side.
//
// Cada paso queda anotado (pasos) y el borrador guarda el número de la orden apenas Odoo lo
// asigna: si algo falla después, el próximo intento actualiza ESA orden en vez de crear otra.

import type { SupabaseClient } from "@supabase/supabase-js";
import { urlOdooVenta } from "@/lib/odoo/habilitaciones";
import {
  adjuntarPdf, cancelarOrden, crearCliente, enviarPropuesta, guardarOrden, notaInterna, vincularOportunidad,
  type DatosOrden, type NuevoCliente,
} from "@/lib/odoo/presupuestos";
import type { Tarifas } from "@/lib/cotizador/tipos";
import { leerBorrador, type Accion } from "./datos";
import { generarPdfDelBorrador } from "./pdf";
import type { Evento } from "./eventos";

export type PayloadGuardar = {
  borradorId: string;
  crearCliente: NuevoCliente | null;
  partnerId: number | null;
  clienteNombre: string;
  orden: Omit<DatosOrden, "partnerId" | "asistenteRef">;
  subtotalMotor: number;
  cancelarVentaId: number | null;
  cancelarVentaNombre: string | null;
  notaHtml: string;
};

export type PayloadMail = { borradorId: string; ordenId: number; ordenNombre: string; emailTo: string | null; plantillaId: number; para: string };

export type ContextoEjecucion = {
  db: SupabaseClient;
  tarifas: Tarifas;
  usuarioId: string;
  vendedorEnPropuesta: string;
  vendedorNombre: string;
  emitir?: (e: Evento) => void;
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

class FallaConPasos extends Error {
  constructor(mensaje: string, public pasos: Record<string, unknown>) {
    super(mensaje);
  }
}

export function crearEjecutor(ctx: ContextoEjecucion) {
  return async (a: Accion): Promise<{ resultado: Record<string, unknown>; pasos: Record<string, unknown> }> => {
    const pasos: Record<string, unknown> = { ...(a.pasos ?? {}) };
    try {
      switch (a.tipo) {
        case "guardar_presupuesto":
        case "reemitir_presupuesto":
          return await guardar(ctx, a, a.payload as unknown as PayloadGuardar, pasos);
        case "enviar_mail":
          return await mandarMail(ctx, a, a.payload as unknown as PayloadMail, pasos);
        default:
          throw new Error(`Acción ${a.tipo} sin ejecutor.`);
      }
    } catch (e) {
      throw new FallaConPasos(e instanceof Error ? e.message : String(e), pasos);
    }
  };
}

async function guardar(ctx: ContextoEjecucion, a: Accion, p: PayloadGuardar, pasos: Record<string, unknown>) {
  const db = ctx.db;
  const b0 = await leerBorrador(db, p.borradorId);
  if (!b0) throw new Error("El borrador ya no existe.");

  // 1. Cliente (si es nuevo). Si el CUIT ya estaba en Odoo, se usa ese y no se crea otro.
  let partnerId = (pasos.partnerId as number | undefined) ?? p.partnerId;
  if (!partnerId) {
    if (!p.crearCliente) throw new Error("Falta el cliente.");
    const c = await crearCliente(p.crearCliente);
    partnerId = c.id;
    pasos.partnerId = c.id;
    pasos.clienteCreado = c.creado;
    const datos = { ...b0.datos, cliente: { ...b0.datos.cliente, partnerId: c.id, esNuevo: false } };
    await db.from("cotizacion_borradores").update({ datos }).eq("id", b0.id);
  }

  // 2. La orden (crear o actualizar la del borrador). El número lo asigna Odoo.
  const orden = await guardarOrden({ ...p.orden, partnerId, asistenteRef: a.id }, b0.odoo_venta_id);
  pasos.ordenId = orden.id;
  pasos.ordenNombre = orden.nombre;
  await db.from("cotizacion_borradores")
    .update({ odoo_venta_id: orden.id, odoo_venta_nombre: orden.nombre, estado: "en_odoo", updated_at: new Date().toISOString() })
    .eq("id", b0.id);

  // 3. El neto de Odoo tiene que coincidir con el del motor (redondeos de $1 por línea).
  const diferencia = Math.abs(orden.neto - p.subtotalMotor);
  const avisos: string[] = [];
  if (diferencia > p.orden.lineas.length) {
    avisos.push(`Odoo calculó un neto de $ ${Math.round(orden.neto).toLocaleString("es-AR")} y el presupuesto dice $ ${p.subtotalMotor.toLocaleString("es-AR")}: revisar las líneas en Odoo.`);
  }

  // 4. Oportunidad del CRM (sin moverla de etapa).
  try {
    const op = await vincularOportunidad({
      ordenId: orden.id, ordenNombre: orden.nombre, partnerId, cliente: p.clienteNombre, direccionObra: p.orden.direccionObra,
      referencia: p.orden.referencia, neto: p.subtotalMotor, vendedorUserId: p.orden.vendedorUserId, tecnicoEmployeeId: p.orden.tecnicoEmployeeId,
    });
    pasos.oportunidadId = op.id;
    await db.from("cotizacion_borradores").update({ odoo_oportunidad_id: op.id }).eq("id", b0.id);
  } catch (e) {
    avisos.push(`No se pudo vincular la oportunidad del CRM: ${e instanceof Error ? e.message : e}`);
  }

  // 5. Nota interna: quién lo pidió, cómo lo confirmó y por qué los precios son los que son.
  if (!pasos.nota) {
    const confirmacion = a.confirmada_via === "boton" ? "con el botón Confirmar" : `por ${a.confirmada_via}: «${esc(String((a as { confirmacion_texto?: string }).confirmacion_texto ?? ""))}»`;
    await notaInterna(orden.id, `<p><b>Armado desde el Asistente Comercial</b> a pedido de ${esc(ctx.vendedorNombre)}, confirmado ${confirmacion}.</p>${p.notaHtml}`);
    pasos.nota = true;
  }

  // 6. PDF final con el número de Odoo, adjunto a la orden.
  const b1 = await leerBorrador(db, b0.id);
  const { vista, pdf, nombre } = await generarPdfDelBorrador(db, b1!, { tarifas: ctx.tarifas, vendedorEnPropuesta: ctx.vendedorEnPropuesta, usuarioId: ctx.usuarioId });
  const adjuntoId = await adjuntarPdf(orden.id, nombre, pdf);
  pasos.adjuntoId = adjuntoId;
  pasos.pdfId = vista.id;
  await db.from("cotizacion_pdfs").update({ odoo_adjunto_id: adjuntoId, odoo_venta_id: orden.id }).eq("id", vista.id);
  ctx.emitir?.({ t: "pdf", pdf: vista });

  // 7. Re-emisión: la cotización vieja se cancela (criterio §9) y queda la referencia cruzada.
  if (p.cancelarVentaId && !pasos.cancelada) {
    const c = await cancelarOrden(p.cancelarVentaId);
    pasos.cancelada = c.estado === "cancel";
    await notaInterna(p.cancelarVentaId, `<p>Reemplazada por <b>${esc(orden.nombre)}</b> (re-emitida a valor de hoy desde el Asistente Comercial).</p>`);
    await notaInterna(orden.id, `<p>Reemplaza a <b>${esc(p.cancelarVentaNombre ?? String(p.cancelarVentaId))}</b>, que quedó cancelada.</p>`);
  }

  return {
    resultado: {
      venta: orden.nombre,
      ventaId: orden.id,
      url: urlOdooVenta(orden.id),
      neto: Math.round(orden.neto),
      creada: orden.creada,
      clienteCreado: pasos.clienteCreado ?? false,
      oportunidadId: pasos.oportunidadId ?? null,
      pdf: { id: vista.id, nombre: vista.nombre },
      canceladaVieja: p.cancelarVentaId ? p.cancelarVentaNombre : null,
      avisos,
    },
    pasos,
  };
}

async function mandarMail(ctx: ContextoEjecucion, a: Accion, p: PayloadMail, pasos: Record<string, unknown>) {
  const db = ctx.db;
  const { data: ultimo } = await db
    .from("cotizacion_pdfs")
    .select("id, odoo_adjunto_id, nombre")
    .eq("borrador_id", p.borradorId)
    .eq("tipo", "final")
    .not("odoo_adjunto_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!ultimo?.odoo_adjunto_id) throw new Error("No hay un PDF final adjunto a la orden: guardá el presupuesto primero.");
  const r = await enviarPropuesta({ ordenId: p.ordenId, plantillaId: p.plantillaId, adjuntoId: ultimo.odoo_adjunto_id, emailTo: p.emailTo });
  pasos.mailId = r.mailId;
  await db.from("cotizacion_borradores").update({ estado: "enviado", updated_at: new Date().toISOString() }).eq("id", p.borradorId);
  return { resultado: { enviadoA: r.para, venta: p.ordenNombre, pdf: ultimo.nombre }, pasos };
}
