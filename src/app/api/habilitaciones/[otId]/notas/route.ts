import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { agregarNota, borrarNota, fetchGestionDe, fijarNota } from "@/lib/habilitaciones/servicio";
import { errorResponse, invalido, parseOtId, sesion } from "../../_comun";

// Notas de la obra.
//
// LAS NOTAS SON DE LA OBRA, NO DE AGUSTINA: "el administrador sólo atiende martes y
// jueves", "la nómina la piden con foto carnet de cada operario, si falta una rebotan
// todo el paquete". Hoy eso vive en su cabeza y en su casilla de mail: si está de
// licencia, se pierde. Por eso las fijadas se ven también desde el panel del tablero.
//
// No tocan Odoo: son gestión pura, nadie las lee desde el ERP.

export const dynamic = "force-dynamic";

const crearSchema = z.object({
  texto: z.string().trim().min(1, "La nota no puede estar vacía").max(2000),
  fijada: z.boolean().optional(),
});

export async function POST(req: NextRequest, ctx: { params: Promise<{ otId: string }> }) {
  const otId = parseOtId((await ctx.params).otId);
  if (!otId) return invalido("Id de OT inválido");

  const parsed = crearSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalido(parsed.error.issues.map((i) => i.message).join(" · "));

  try {
    const { db, userId } = await sesion();
    await agregarNota(db, otId, parsed.data.texto, parsed.data.fijada ?? false, userId);
    return NextResponse.json({ ok: true, gestion: await fetchGestionDe(db, otId) });
  } catch (e) {
    return errorResponse(e);
  }
}

const patchSchema = z.object({ notaId: z.string().uuid(), fijada: z.boolean() });

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ otId: string }> }) {
  const otId = parseOtId((await ctx.params).otId);
  if (!otId) return invalido("Id de OT inválido");

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalido("Nota inválida");

  try {
    const { db } = await sesion();
    await fijarNota(db, parsed.data.notaId, parsed.data.fijada);
    return NextResponse.json({ ok: true, gestion: await fetchGestionDe(db, otId) });
  } catch (e) {
    return errorResponse(e);
  }
}

const borrarSchema = z.object({ notaId: z.string().uuid() });

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ otId: string }> }) {
  const otId = parseOtId((await ctx.params).otId);
  if (!otId) return invalido("Id de OT inválido");

  const parsed = borrarSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalido("Nota inválida");

  try {
    const { db } = await sesion();
    await borrarNota(db, parsed.data.notaId);
    return NextResponse.json({ ok: true, gestion: await fetchGestionDe(db, otId) });
  } catch (e) {
    return errorResponse(e);
  }
}
