import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { leerAccion, leerBorrador, leerConversacion, soltarTurno, tomarTurno, vendedorDe } from "@/lib/asistente/datos";
import { ejecutarAccion, rechazarAccion, vistaAccion } from "@/lib/asistente/acciones";
import { crearEjecutor } from "@/lib/asistente/ejecutores";
import { vistaBorrador } from "@/lib/asistente/herramientas";
import { mensajeParaCliente } from "@/lib/asistente/mensaje-cliente";
import type { Evento } from "@/lib/asistente/eventos";
import { leerTarifas } from "@/lib/cotizador-rapido/servidor";
import { errorResponse, exigirModulo, invalido } from "../../../../_comun";

// POST /api/comercial/asistente/cotizador/acciones/:id { decision } — el Confirmar (o el «Mejor
// no») del diálogo de guardar del cotizador. Ejecuta la acción propuesta con el mismo ejecutor
// que el botón del chat, pero SIN un turno del modelo después: el guardado tarda lo que tarda
// Odoo (8 a 9 s) y no cuesta nada. Devuelve la acción, el borrador, el PDF final y el mensaje
// para el cliente.

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const schema = z.object({ decision: z.enum(["confirmar", "rechazar", "reintentar"]) });

/** El nombre de pila para el saludo: «Laura» de «Laura Méndez». */
function nombreDePila(contacto: string | null): string {
  const primero = (contacto ?? "").trim().split(/\s+/)[0] ?? "";
  if (!primero || /^(sr|sra|ing|arq|dr|dra)\.?$/i.test(primero)) return "";
  return primero.charAt(0).toUpperCase() + primero.slice(1).toLowerCase();
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) return invalido("Id inválido");
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalido(parsed.error);
  const quien = await exigirModulo("asistente-comercial", "editar");
  if (quien instanceof NextResponse) return quien;

  const db = createAdminClient();
  const accion = await leerAccion(db, id);
  if (!accion || accion.usuario_id !== quien.userId) return NextResponse.json({ error: "No existe esa acción." }, { status: 404 });
  const conv = await leerConversacion(db, accion.conversacion_id);
  if (!conv) return NextResponse.json({ error: "No existe esa conversación." }, { status: 404 });

  if (parsed.data.decision === "rechazar") {
    const r = await rechazarAccion(db, accion.id, conv.id);
    return NextResponse.json({ accion: vistaAccion(r ?? accion) });
  }

  if (!(await tomarTurno(db, conv.id))) {
    return NextResponse.json({ error: "El asistente está trabajando en este presupuesto: esperá que termine." }, { status: 409 });
  }
  try {
    const [tarifas, vendedor] = await Promise.all([leerTarifas(db), vendedorDe(db, quien.userId)]);
    const eventos: Evento[] = [];
    const ejecutor = crearEjecutor({ db, tarifas, usuarioId: quien.userId, vendedorEnPropuesta: vendedor.nombreEnPropuesta, vendedorNombre: vendedor.nombre, emitir: (e) => eventos.push(e) });
    const r = await ejecutarAccion(db, accion.id, "boton", { usuarioId: quien.userId, texto: null }, ejecutor, { reintento: parsed.data.decision === "reintentar" });
    const borrador = accion.borrador_id ? await leerBorrador(db, accion.borrador_id) : null;
    const pdf = [...eventos].reverse().find((e) => e.t === "pdf");
    const whatsapp = r.ok && borrador
      ? mensajeParaCliente({ nombre: nombreDePila(borrador.datos.cliente.contacto), obra: borrador.datos.obra.direccion, actualizada: !!borrador.origen_venta_id, mailEnviado: false })
      : null;
    return NextResponse.json({
      ok: r.ok, motivo: r.motivo ?? null, accion: vistaAccion(r.accion),
      borrador: borrador ? vistaBorrador(borrador) : null,
      pdf: pdf && pdf.t === "pdf" ? pdf.pdf : null,
      whatsapp,
    });
  } catch (e) {
    return errorResponse(e);
  } finally {
    await soltarTurno(db, conv.id);
  }
}
