import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { exigirPermisoDeApi } from "@/lib/auth/servidor";
import { createClient } from "@/lib/supabase/server";
import { cuerpoInvalido, deshacerUso, respuestaDeError } from "@/lib/planificacion/guardias";

// POST /api/planificacion/guardias/deshacer — DeshacerUsoGuardia → { ok: true }.
//
// El "Deshacer" del toast después de usar una guardia: borra las jornadas que el uso creó,
// devuelve las que movió (el comodín vuelve a donde estaba) y las guardias del lote vuelven a
// "activa". TODO O NADA: si la guardia ya no está usada por ese lote, si una jornada ya no
// existe o tiene parte, o si en la celda quedó otra cosa, 409 y no se toca nada.
//
// `borrar` y `volver` se aceptan pero NO SE USAN: son del optimista del tablero. Qué se borra
// y adónde vuelve lo anotó el servidor en la guardia al usarla (deshacerUso, revisión 18/10).

export const dynamic = "force-dynamic";

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "la fecha va como AAAA-MM-DD");
const id = z.number().int().positive();

const cuerpo = z.object({
  loteId: z.string().uuid("falta el lote del uso"),
  guardiaIds: z.array(id).min(1, "falta la guardia").max(6),
  borrar: z.array(id).max(60).optional(),
  volver: z
    .array(z.object({ id, fecha, cuadrillaId: id.nullable().optional(), ordenDia: z.number().int().min(0).optional() }))
    .max(60)
    .optional(),
});

export async function POST(req: NextRequest) {
  const quien = await exigirPermisoDeApi(req);
  if (quien instanceof NextResponse) return quien;

  const parsed = cuerpo.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return cuerpoInvalido(parsed.error.issues);

  try {
    await deshacerUso({ db: await createClient(), userId: quien.userId }, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return respuestaDeError(e, "no se pudo deshacer el uso de la guardia");
  }
}
