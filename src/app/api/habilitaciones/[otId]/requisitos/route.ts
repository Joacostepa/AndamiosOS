import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  agregarRequisito, aplicarPaquete, borrarRequisito,
  fetchGestionDe, marcarTodosLosRequisitos, moverRequisito,
} from "@/lib/habilitaciones/servicio";
import { db as conectar, errorResponse, invalido, parseOtId, sincronizarLuego } from "../../_comun";

// Requisitos de una OT.
//
//   POST   → agregar uno a mano, o aplicar un paquete entero
//   PATCH  → cambiar el estado de uno (con motivo si es `observado`)
//   DELETE → sacar el que el cliente no pide
//
// Cada cambio de estado resincroniza la OT: los cuatro inputs de Odoo se derivan de
// estos registros. Va en after(), porque marcar un requisito tiene que ser instantáneo.
//
// UNA SOLA IDA A SUPABASE POR GESTO. Medido: cada request a Supabase cuesta ~300 ms
// FIJOS, así que lo que importa es la CANTIDAD de idas y no el tamaño de la consulta.
// El PATCH hacía cinco —auth, select, update, insert del historial, y el bloque de
// vuelta— y ahora hace una: ver hab_mover_requisito en la migración 20260904000001.
// Tampoco se llama a `sesion()`: el autor lo resuelve Postgres con auth.uid().

export const dynamic = "force-dynamic";

const crearSchema = z.union([
  z.object({ nombre: z.string().trim().min(1, "El nombre no puede estar vacío").max(200) }),
  z.object({ paqueteId: z.string().uuid() }),
]);

export async function POST(req: NextRequest, ctx: { params: Promise<{ otId: string }> }) {
  const otId = parseOtId((await ctx.params).otId);
  if (!otId) return invalido("Id de OT inválido");

  const parsed = crearSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalido(parsed.error.issues.map((i) => i.message).join(" · "));

  try {
    const db = await conectar();
    if ("paqueteId" in parsed.data) await aplicarPaquete(db, otId, parsed.data.paqueteId);
    else await agregarRequisito(db, otId, parsed.data.nombre);
    sincronizarLuego(db, otId);
    return NextResponse.json({ ok: true, gestion: await fetchGestionDe(db, otId) });
  } catch (e) {
    return errorResponse(e);
  }
}

// Dos formas de mover requisitos, no una que reemplaza a la otra: a veces se manda un
// mail con todos los papeles y el cliente contesta "está todo bien" —eso es un gesto
// único y registrarlo de a uno son dieciséis clics— y a veces se manda y se aprueba de
// a uno. Conviven.
const masivoSchema = z.object({ todos: z.enum(["enviado", "aprobado"]) });

const patchSchema = z
  .object({
    requisitoId: z.string().uuid(),
    estado: z.enum(["pendiente", "enviado", "observado", "aprobado"]),
    motivo: z.string().trim().max(1000).nullable().optional(),
  })
  // `observado` sin motivo es el estado inútil: la fila se ve en rojo y no dice qué
  // corregir, que es justo lo que hoy obliga a volver a leer el mail.
  .refine((v) => v.estado !== "observado" || !!v.motivo?.trim(), {
    message: "Un requisito observado necesita el motivo",
  });

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ otId: string }> }) {
  const otId = parseOtId((await ctx.params).otId);
  if (!otId) return invalido("Id de OT inválido");

  const cuerpo = await req.json().catch(() => null);

  const masivo = masivoSchema.safeParse(cuerpo);
  if (masivo.success) {
    try {
      // Sin `sesion()`: el autor del registro lo pone Postgres con auth.uid().
      const base = await conectar();
      const { movidos, gestion } = await marcarTodosLosRequisitos(base, otId, masivo.data.todos);
      if (movidos > 0) sincronizarLuego(base, otId);
      return NextResponse.json({ ok: true, movidos, gestion });
    } catch (e) {
      return errorResponse(e);
    }
  }

  const parsed = patchSchema.safeParse(cuerpo);
  if (!parsed.success) return invalido(parsed.error.issues.map((i) => i.message).join(" · "));

  const { requisitoId, estado, motivo } = parsed.data;
  try {
    // Una sola ida a la base: mueve el requisito, registra la transición en el historial
    // y devuelve la ficha fresca. Ver moverRequisito en el servicio.
    const base = await conectar();
    const { gestion } = await moverRequisito(base, requisitoId, estado, motivo ?? null);
    sincronizarLuego(base, otId);
    return NextResponse.json({ ok: true, gestion });
  } catch (e) {
    return errorResponse(e);
  }
}

const borrarSchema = z.object({ requisitoId: z.string().uuid() });

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ otId: string }> }) {
  const otId = parseOtId((await ctx.params).otId);
  if (!otId) return invalido("Id de OT inválido");

  const parsed = borrarSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalido("Requisito inválido");

  try {
    const db = await conectar();
    await borrarRequisito(db, parsed.data.requisitoId);
    sincronizarLuego(db, otId);
    return NextResponse.json({ ok: true, gestion: await fetchGestionDe(db, otId) });
  } catch (e) {
    return errorResponse(e);
  }
}
