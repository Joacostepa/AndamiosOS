import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { exigirPermisoDeApi } from "@/lib/auth/servidor";
import {
  agregarNotaJornada,
  borrarNotaJornada,
  notasEnRango,
} from "@/lib/planificacion/notas";

// Notas de la jornada.
//
//   GET    ?desde&hasta  → las notas que TOCAN ese rango (solapamiento, no pertenencia)
//   POST   { desde, hasta, cuadrillaId, texto }
//   DELETE { notaId }
//
// A diferencia del resto de /api/planificacion, esto NO toca Odoo: vive entero en
// Supabase (plan_notas_dia). Es memoria operativa —"el chofer se va temprano el
// jueves"— que nadie lee desde el ERP.
//
// Va con la sesión del usuario y no con la service role: las políticas de RLS de la
// tabla son las que deciden quién escribe, y `autor_id` sale de la sesión y no del
// body, para que no se pueda firmar una nota a nombre de otro.
//
// POST y DELETE arrancan con la segunda llave (exigirPermisoDeApi: la misma regla que el
// proxy, Planificación o Partes en "editar"). La RLS de 20261018100002 pide lo mismo, así
// que quien pasa la ruta pasa la política, y el autor sale de la llave.

export const dynamic = "force-dynamic";

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha YYYY-MM-DD");

function errorResponse(e: unknown) {
  return NextResponse.json(
    { error: e instanceof Error ? e.message : String(e) },
    { status: 502 },
  );
}

function invalido(msg: string) {
  return NextResponse.json({ error: msg }, { status: 400 });
}

export async function GET(req: NextRequest) {
  const desde = req.nextUrl.searchParams.get("desde") ?? "";
  const hasta = req.nextUrl.searchParams.get("hasta") ?? "";
  if (!fecha.safeParse(desde).success || !fecha.safeParse(hasta).success) {
    return invalido("Parámetros 'desde' y 'hasta' inválidos");
  }
  try {
    const db = await createClient();
    return NextResponse.json({ notas: await notasEnRango(db, desde, hasta) });
  } catch (e) {
    return errorResponse(e);
  }
}

const crearSchema = z
  .object({
    desde: fecha,
    // Opcional: el caso común es una nota de un día y no hay que hacerle escribir dos
    // veces la misma fecha. Sin `hasta`, la nota vale sólo por `desde`.
    hasta: fecha.optional(),
    // null = la nota es del día entero.
    cuadrillaId: z.number().int().positive().nullable(),
    texto: z.string().trim().min(1, "La nota no puede estar vacía").max(1000),
  })
  .refine((n) => (n.hasta ?? n.desde) >= n.desde, {
    message: "El último día no puede ser anterior al primero",
  });

export async function POST(req: NextRequest) {
  const sesion = await exigirPermisoDeApi(req);
  if (sesion instanceof NextResponse) return sesion;
  const parsed = crearSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalido(parsed.error.issues.map((i) => i.message).join(" · "));

  try {
    const db = await createClient();
    const { desde, hasta, cuadrillaId, texto } = parsed.data;
    await agregarNotaJornada(
      db,
      { desde, hasta: hasta ?? desde, cuadrillaId, texto },
      sesion.userId,
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

const borrarSchema = z.object({ notaId: z.string().uuid() });

export async function DELETE(req: NextRequest) {
  const sesion = await exigirPermisoDeApi(req);
  if (sesion instanceof NextResponse) return sesion;
  const parsed = borrarSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalido("Nota inválida");

  try {
    const db = await createClient();
    await borrarNotaJornada(db, parsed.data.notaId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
