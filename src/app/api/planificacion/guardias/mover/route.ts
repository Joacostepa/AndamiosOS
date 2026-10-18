import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { exigirPermisoDeApi } from "@/lib/auth/servidor";
import { createClient } from "@/lib/supabase/server";
import { cuerpoInvalido, moverGuardia, respuestaDeError } from "@/lib/planificacion/guardias";

// POST /api/planificacion/guardias/mover — MoverGuardia → { ok: true, guardia }.
//
// Correr una guardia DENTRO DE SU SEMANA, a otra celda totalmente libre de una cuadrilla
// propia (otro día u otra cuadrilla). Planificación lo hace sin pedir nada (contrato §1.3,
// punto 5), con las mismas reglas de "dónde no van nunca" que la corrida del viernes
// (destinoValidoGuardia). Si no se puede, 409 con el motivo. El deshacer del tablero es
// correrla de vuelta por esta misma ruta.

export const dynamic = "force-dynamic";

const cuerpo = z.object({
  guardiaId: z.number().int().positive(),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "la fecha va como AAAA-MM-DD"),
  cuadrillaId: z.number().int().positive(),
});

export async function POST(req: NextRequest) {
  const quien = await exigirPermisoDeApi(req);
  if (quien instanceof NextResponse) return quien;

  const parsed = cuerpo.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return cuerpoInvalido(parsed.error.issues);

  try {
    const guardia = await moverGuardia({ db: await createClient(), userId: quien.userId }, parsed.data);
    return NextResponse.json({ ok: true, guardia });
  } catch (e) {
    return respuestaDeError(e, "no se pudo correr la guardia");
  }
}
