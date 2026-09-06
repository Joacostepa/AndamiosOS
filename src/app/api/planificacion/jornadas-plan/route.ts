import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  borrarJornadasPlan,
  fijarJornadasPlan,
  jornadasPlanTodas,
} from "@/lib/planificacion/jornadas-plan";

// Cuántas jornadas tiene la obra según Operaciones.
//
//   GET                              → todas las correcciones vigentes
//   PUT    { otId, jornadas, motivo }→ fija (o corrige) el número de una obra
//   DELETE { otId }                  → vuelve al estimado de Comercial
//
// Como las notas del tablero, esto NO toca Odoo: vive entero en Supabase
// (plan_jornadas_ot). El estimado de Comercial sigue donde estaba y nadie lo pisa.
//
// Va con la sesión del usuario y no con la service role: las políticas de RLS deciden
// quién escribe, y `autor_id` sale de la sesión y no del body, para que la corrección no
// se pueda firmar a nombre de otro.

export const dynamic = "force-dynamic";

function errorResponse(e: unknown) {
  return NextResponse.json(
    { error: e instanceof Error ? e.message : String(e) },
    { status: 502 },
  );
}

function invalido(msg: string) {
  return NextResponse.json({ error: msg }, { status: 400 });
}

export async function GET() {
  try {
    const db = await createClient();
    return NextResponse.json({ planes: await jornadasPlanTodas(db) });
  } catch (e) {
    return errorResponse(e);
  }
}

const fijarSchema = z.object({
  otId: z.number().int().positive(),
  // El techo no es arbitrario: la escala de Odoo termina en "15 jornadas o más" y la obra
  // más larga que hay hoy tiene 17 jornadas puestas. 200 deja lugar de sobra para
  // cualquier obra real y frena un tipeo de más que dejaría una obra pidiendo jornadas
  // hasta el año que viene.
  jornadas: z.number().positive().max(200),
  motivo: z.string().trim().max(500).nullable().optional(),
});

export async function PUT(req: NextRequest) {
  const parsed = fijarSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalido(parsed.error.issues.map((i) => i.message).join(" · "));

  try {
    const db = await createClient();
    const { data } = await db.auth.getUser();
    const { otId, jornadas, motivo } = parsed.data;
    await fijarJornadasPlan(db, otId, jornadas, motivo ?? null, data.user?.id ?? null);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

const borrarSchema = z.object({ otId: z.number().int().positive() });

export async function DELETE(req: NextRequest) {
  const parsed = borrarSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalido("Obra inválida");

  try {
    const db = await createClient();
    await borrarJornadasPlan(db, parsed.data.otId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
