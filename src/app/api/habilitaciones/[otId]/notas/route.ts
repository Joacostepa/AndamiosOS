import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { agregarNota, borrarNota, fetchGestionDe, fijarNota } from "@/lib/habilitaciones/servicio";
import { errorResponse, invalido, parseOtId, sesion } from "../../_comun";

// Notas de la obra, ámbito HABILITACIÓN. Comparten tabla con los comentarios que
// Operaciones escribe en el tablero (ot_comentarios) y se separan por `ambito`: son dos
// conversaciones con dos interlocutores distintos. El ámbito lo clava el servicio, no
// esta ruta — ver src/lib/habilitaciones/servicio.ts.
//
// LAS NOTAS SON DE LA OBRA, NO DE AGUSTINA: "el administrador sólo atiende martes y
// jueves", "la nómina la piden con foto carnet de cada operario, si falta una rebotan
// todo el paquete". Antes eso vivía en su cabeza y en su casilla de mail: si estaba de
// licencia, se perdía.
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
    // El autor NO se pasa: lo pone el default de la columna (auth.uid()) y la política
    // de RLS impide firmarlo con el nombre de otro. Ver src/lib/comentarios-ot.ts.
    const { db } = await sesion();
    await agregarNota(db, otId, parsed.data.texto, parsed.data.fijada ?? false);
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
