import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { nombresDe } from "@/lib/clientes/bandeja";
import { iaClientesActiva } from "@/lib/clientes/interruptor";
import { SinNumeroClientes } from "@/lib/clientes/envio";
import {
  aprobarPrecio, confirmarTecnico, ErrorTarjeta, mandarBloqueadoEditado, reintentarPrecio, tomarYo, vistaCorreccion, vistaCorreccionAlquiler,
} from "@/lib/clientes/aprobar";
import { MAX_TEXTO } from "@/lib/whatsapp/formato";
import { errorResponse, exigirModulo, invalido } from "../../../../../_comun";

// POST /api/comercial/clientes/conversaciones/:id/aprobaciones/:aprobacionId — lo que hacen los
// botones de la tarjeta (paso 6). La decisión se toma UNA SOLA VEZ (aprobar.ts): si dos tocan a
// la vez, el segundo recibe 409 con «Ya lo aprobó …».
//
//   { accion: "aprobar", montoVisto, correccion?, confirmarVentana?, despues? }
//       bandeja fácil: recalcula (si cambió el monto, 409 codigo cambio_monto y no manda), con
//       menos de 2 h de ventana pide confirmarVentana (409 ventana_por_vencer), y después
//       primero Odoo, después el PDF, después WhatsApp (ventana cerrada: «falta la plantilla»);
//       Alquiler simple (carril «alquiler»): lo mismo, con `correccionAlquiler` en vez de
//       `correccion`, y Odoo es la orden de alquiler en borrador; sale sólo el texto;
//   { accion: "corregir", correccion }  el nuevo, recalculado, ANTES de mandar (no escribe nada);
//   { accion: "corregir_alquiler", correccionAlquiler }  lo mismo para un alquiler simple;
//   { accion: "reintentar" }            lo que falló, o la «falta la plantilla» con la ventana abierta;
//   { accion: "tomar", motivo? }        Rechazar / Lo tomo yo (o Descartar, en un texto bloqueado);
//   { accion: "confirmar", elegida?, avisar, despues? }  técnico: Confirmar o Elegir otra;
//   { accion: "mandar", texto, despues? }               texto bloqueado: Editar y mandar.
//
// Guardar en Odoo puede tardar (cliente, orden, oportunidad, nota, PDF): plazo largo.

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const despues = z.enum(["sofia", "persona"]).nullable().optional();
const correccion = z.object({
  tipo: z.enum(["metros", "piezas", "precio", "texto", "otro"]),
  motivo: z.string().trim().min(3, "Escribí el motivo de la corrección.").max(500),
  metros: z.number().positive().max(500).optional(),
  precioMl: z.number().positive().max(100_000_000).optional(),
  concertina: z.enum(["opcional", "base", "no"]).optional(),
  gestoria: z.enum(["opcional", "base", "no"]).optional(),
  texto: z.string().trim().max(MAX_TEXTO).optional(),
});

// Alquiler simple (aprobacion-alquiler.ts → validarCorreccionAlquiler revisa lo de cada tipo).
const franja = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("manana") }),
  z.object({ tipo: z.literal("tarde") }),
  z.object({ tipo: z.literal("hora"), desde: z.number().min(8).max(15) }),
]);
const correccionAlquiler = z.object({
  tipo: z.enum(["precio", "piezas", "fecha", "texto"]),
  motivo: z.string().trim().min(3, "Escribí el motivo de la corrección.").max(500),
  total: z.number().positive().max(100_000_000).optional(),
  modulosPorTorre: z.number().int().min(1).max(10).optional(),
  torres: z.number().int().min(1).max(10).optional(),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  franja: franja.optional(),
  texto: z.string().trim().max(MAX_TEXTO).optional(),
});

const schema = z.discriminatedUnion("accion", [
  z.object({
    accion: z.literal("aprobar"), montoVisto: z.number(), correccion: correccion.nullable().optional(), correccionAlquiler: correccionAlquiler.nullable().optional(),
    confirmarVentana: z.boolean().optional(), despues,
  }),
  z.object({ accion: z.literal("corregir"), correccion }),
  z.object({ accion: z.literal("corregir_alquiler"), correccionAlquiler }),
  z.object({ accion: z.literal("reintentar") }),
  z.object({ accion: z.literal("tomar"), motivo: z.string().trim().max(500).optional() }),
  z.object({
    accion: z.literal("confirmar"),
    elegida: z.object({ tecnico: z.string().max(40).nullable(), asistente: z.string().max(40).nullable() }).nullable().optional(),
    avisar: z.boolean(),
    despues,
  }),
  z.object({ accion: z.literal("mandar"), texto: z.string().trim().min(1, "El mensaje está vacío.").max(MAX_TEXTO), despues }),
]);

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string; aprobacionId: string }> }) {
  const { id, aprobacionId } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success || !z.string().uuid().safeParse(aprobacionId).success) return invalido("Id inválido");
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalido(parsed.error);
  const quien = await exigirModulo("clientes-whatsapp", "editar");
  if (quien instanceof NextResponse) return quien;
  try {
    const db = createAdminClient();
    const yo = { id: quien.userId, nombre: (await nombresDe(db, [quien.userId])).get(quien.userId) ?? "Alguien" };
    const b = parsed.data;
    if (b.accion === "corregir") return NextResponse.json(await vistaCorreccion(db, id, aprobacionId, b.correccion));
    if (b.accion === "corregir_alquiler") return NextResponse.json(await vistaCorreccionAlquiler(db, id, aprobacionId, b.correccionAlquiler));

    const iaActiva = await iaClientesActiva(db);
    const r =
      b.accion === "aprobar" ? await aprobarPrecio(db, id, aprobacionId, yo, b, iaActiva)
      : b.accion === "reintentar" ? await reintentarPrecio(db, id, aprobacionId, yo)
      : b.accion === "tomar" ? await tomarYo(db, id, aprobacionId, yo, b.motivo ?? null)
      : b.accion === "confirmar" ? await confirmarTecnico(db, id, aprobacionId, yo, { elegida: b.elegida ?? null, avisar: b.avisar, despues: b.despues ?? null }, iaActiva)
      : await mandarBloqueadoEditado(db, id, aprobacionId, yo, b.texto, b.despues ?? null, iaActiva);
    if (!r.ok) return NextResponse.json(r, { status: r.codigo === "error" ? 502 : 409 });
    return NextResponse.json(r);
  } catch (e) {
    if (e instanceof ErrorTarjeta) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    if (e instanceof SinNumeroClientes) return NextResponse.json({ ok: false, error: e.message }, { status: 503 });
    return errorResponse(e);
  }
}
