import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  agregarRequisito, aplicarPaquete, borrarRequisito, cambiarEstadoRequisito,
  registrarGestion,
} from "@/lib/habilitaciones/servicio";
import { errorResponse, invalido, parseOtId, sesion, sincronizarLuego } from "../../_comun";

// Requisitos de una OT.
//
//   POST   → agregar uno a mano, o aplicar un paquete entero
//   PATCH  → cambiar el estado de uno (con motivo si es `observado`)
//   DELETE → sacar el que el cliente no pide
//
// Cada cambio de estado resincroniza la OT: los cuatro inputs de Odoo se derivan de
// estos registros. Va en after(), porque marcar un requisito tiene que ser instantáneo
// y un RPC a Odoo tarda ~800 ms.

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
    const { db } = await sesion();
    if ("paqueteId" in parsed.data) await aplicarPaquete(db, otId, parsed.data.paqueteId);
    else await agregarRequisito(db, otId, parsed.data.nombre);
    sincronizarLuego(db, otId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

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

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalido(parsed.error.issues.map((i) => i.message).join(" · "));

  const { requisitoId, estado, motivo } = parsed.data;
  try {
    const { db, userId } = await sesion();
    await cambiarEstadoRequisito(db, requisitoId, estado, motivo ?? null);

    // El historial guarda las transiciones que después hay que poder demostrar.
    const tipo = estado === "enviado" ? "envio"
      : estado === "aprobado" ? "aprobacion"
      : estado === "observado" ? "observacion"
      : null;
    if (tipo) await registrarGestion(db, otId, tipo, motivo?.trim() || null, userId);

    sincronizarLuego(db, otId);
    return NextResponse.json({ ok: true });
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
    const { db } = await sesion();
    await borrarRequisito(db, parsed.data.requisitoId);
    sincronizarLuego(db, otId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
