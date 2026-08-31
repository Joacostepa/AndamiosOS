import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { fechasDeJornadas } from "@/lib/tablero/bloques";
import {
  actualizarGrupo,
  actualizarTareas,
  borrarTareas,
  crearTarea,
  moverTareas,
} from "@/lib/tablero/tareas";
import { TIPOS_TAREA } from "@/lib/tablero/tipos";

// Tarjetas de operaciones del tablero.
//
//   POST   { titulo, tipo, notas, cuadrillaId, fecha, fraccion, dias? } → { ids }
//   PATCH  { ids, cambio } | { movimientos } | { grupoId, cambio }
//   DELETE { ids }
//
// A diferencia de /api/planificacion/asignaciones, esto NO toca Odoo: una tarea
// operativa no tiene OT, ni parte, ni costeo. Vive entera en Supabase.
//
// Va con la sesión del usuario y no con la service role: las políticas de RLS deciden
// quién escribe, y `autor_id` sale de la sesión y no del body.

export const dynamic = "force-dynamic";

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha YYYY-MM-DD");
const fraccion = z.enum(["0.10", "0.25", "0.50", "0.75", "1"]);
// El enum se deriva de TIPOS_TAREA para que agregar un tipo sea un solo cambio, pero
// conservando el tipo literal: con `as [string, ...]` zod devolvía `string` y el cambio
// dejaba de encajar en CambioTarea.
const tipo = z.enum(
  Object.keys(TIPOS_TAREA) as [keyof typeof TIPOS_TAREA, ...(keyof typeof TIPOS_TAREA)[]],
);
const id = z.number().int().positive();

function errorResponse(e: unknown) {
  return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
}
function invalido(msg: string) {
  return NextResponse.json({ error: msg }, { status: 400 });
}

const crearSchema = z.object({
  titulo: z.string().trim().min(1, "La tarea necesita un título").max(200),
  tipo,
  notas: z.string().trim().max(1000).nullable().optional(),
  // null = sin cuadrilla: la tarea queda en la bandeja esperando que la arrastren.
  cuadrillaId: id.nullable(),
  fecha,
  fraccion,
  // Cuántos días corridos ocupa. El caso normal es 1; el diálogo permite más.
  dias: z.number().int().min(1).max(30).optional(),
  ordenDia: z.number().int().min(0).optional(),
});

export async function POST(req: NextRequest) {
  const parsed = crearSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalido(parsed.error.issues.map((i) => i.message).join(" · "));

  try {
    const db = await createClient();
    const { data } = await db.auth.getUser();
    const t = parsed.data;

    // Los días corridos salen de la misma función que usan las obras, para que "3 días"
    // signifique lo mismo en los dos lados (y saltee el domingo igual). Se permite
    // arrancar en domingo: la fecha la eligió alguien a propósito.
    const fechas = fechasDeJornadas(t.fecha, t.dias ?? 1, { permitirDomingo: true });

    const ids = await crearTarea(
      db,
      fechas.map((f) => ({
        titulo: t.titulo,
        tipo: t.tipo as keyof typeof TIPOS_TAREA,
        notas: t.notas ?? null,
        cuadrillaId: t.cuadrillaId,
        fecha: f,
        fraccion: t.fraccion,
        ordenDia: t.ordenDia ?? 0,
      })),
      data.user?.id ?? null,
    );
    return NextResponse.json({ ids });
  } catch (e) {
    return errorResponse(e);
  }
}

const cambioSchema = z.object({
  titulo: z.string().trim().min(1).max(200).optional(),
  tipo: tipo.optional(),
  notas: z.string().trim().max(1000).nullable().optional(),
  cuadrillaId: id.nullable().optional(),
  fecha: fecha.optional(),
  fraccion: fraccion.optional(),
  ordenDia: z.number().int().min(0).optional(),
  hecha: z.boolean().optional(),
});

const patchSchema = z.union([
  z.object({ ids: z.array(id).min(1), cambio: cambioSchema }),
  z.object({
    movimientos: z
      .array(
        z.object({
          id,
          fecha,
          cuadrillaId: id.nullable().optional(),
          ordenDia: z.number().int().min(0).optional(),
        }),
      )
      .min(1),
  }),
  // Renombrar o re-tipar toca TODOS los días de la tarea, no sólo los visibles.
  z.object({ grupoId: id, cambio: cambioSchema }),
]);

export async function PATCH(req: NextRequest) {
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalido("Cambio inválido");

  try {
    const db = await createClient();
    const c = parsed.data;
    if ("movimientos" in c) await moverTareas(db, c.movimientos);
    else if ("grupoId" in c) await actualizarGrupo(db, c.grupoId, c.cambio);
    else await actualizarTareas(db, c.ids, c.cambio);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

const borrarSchema = z.object({ ids: z.array(id).min(1) });

export async function DELETE(req: NextRequest) {
  const parsed = borrarSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalido("Tarea inválida");

  try {
    const db = await createClient();
    await borrarTareas(db, parsed.data.ids);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
