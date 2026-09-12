import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  borrarComentario, comentar, comentariosDeOt, fijarComentario,
} from "@/lib/comentarios-ot";

// El hilo de una OT: GET lo lee, POST agrega, PATCH fija, DELETE borra.
//
// Todas trabajan con la SESIÓN del usuario y no con la service role: las políticas de
// RLS de ot_comentarios son las que garantizan que el autor sea quien dice ser y que
// nadie borre el comentario de otro. Saltearlas con una clave de servicio anularía las
// dos garantías.
//
// Devuelven siempre el hilo completo y fresco, no un `ok`: la única pantalla que las
// llama muestra el hilo, y así no hay un segundo viaje para verlo.

export const dynamic = "force-dynamic";

async function sesion() {
  const db = await createClient();
  const { data } = await db.auth.getUser();
  return { db, user: data.user };
}

function otIdDe(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function error(e: unknown, status = 502) {
  return NextResponse.json(
    { error: e instanceof Error ? e.message : String(e) },
    { status },
  );
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const otId = otIdDe((await ctx.params).id);
  if (!otId) return NextResponse.json({ error: "Id inválido" }, { status: 400 });

  try {
    const { db } = await sesion();
    return NextResponse.json({ comentarios: await comentariosDeOt(db, otId) });
  } catch (e) {
    return error(e);
  }
}

// 2000 es el mismo techo que tenían las notas de la habilitación. Alcanza de sobra para
// lo que se acuerda por teléfono y frena que alguien pegue un mail entero acá adentro.
const nuevoSchema = z.object({
  texto: z.string().trim().min(1, "El comentario no puede estar vacío").max(2000),
  fijado: z.boolean().optional(),
});

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const otId = otIdDe((await ctx.params).id);
  if (!otId) return NextResponse.json({ error: "Id inválido" }, { status: 400 });

  const parsed = nuevoSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => i.message).join(" · ") },
      { status: 400 },
    );
  }

  try {
    const { db, user } = await sesion();
    if (!user) return NextResponse.json({ error: "Sin sesión" }, { status: 401 });
    await comentar(db, otId, parsed.data.texto, parsed.data.fijado ?? false);
    return NextResponse.json({ comentarios: await comentariosDeOt(db, otId) });
  } catch (e) {
    return error(e);
  }
}

const fijarSchema = z.object({ id: z.string().uuid(), fijado: z.boolean() });

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const otId = otIdDe((await ctx.params).id);
  if (!otId) return NextResponse.json({ error: "Id inválido" }, { status: 400 });

  const parsed = fijarSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Comentario inválido" }, { status: 400 });

  try {
    const { db } = await sesion();
    await fijarComentario(db, parsed.data.id, parsed.data.fijado);
    return NextResponse.json({ comentarios: await comentariosDeOt(db, otId) });
  } catch (e) {
    return error(e);
  }
}

const borrarSchema = z.object({ id: z.string().uuid() });

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const otId = otIdDe((await ctx.params).id);
  if (!otId) return NextResponse.json({ error: "Id inválido" }, { status: 400 });

  const parsed = borrarSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Comentario inválido" }, { status: 400 });

  try {
    const { db } = await sesion();
    await borrarComentario(db, parsed.data.id);
    return NextResponse.json({ comentarios: await comentariosDeOt(db, otId) });
  } catch (e) {
    // Que la RLS no haya dejado borrar no es una falla del servidor: es la regla de que
    // el comentario ajeno no se toca, y al usuario le tiene que llegar como tal. Un 502
    // acá haría que la UI muestre "no se pudo" cuando lo correcto es "no te corresponde".
    const ajeno = e instanceof Error && e.message.startsWith("Sólo quien");
    return error(e, ajeno ? 403 : 502);
  }
}
