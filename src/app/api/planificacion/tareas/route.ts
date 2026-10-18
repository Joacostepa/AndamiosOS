import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { exigirPermisoDeApi } from "@/lib/auth/servidor";
import { esErrorDelCandado, frenoDeGuardias, rechazoDelTrigger } from "@/lib/planificacion/candado-guardias";
import { fechasDeJornadas } from "@/lib/tablero/bloques";
import {
  actualizarGrupo,
  actualizarTareas,
  borrarTareas,
  crearTarea,
  moverTareas,
} from "@/lib/tablero/tareas";
import { TIPOS_TAREA } from "@/lib/tablero/tipos";
import type { RechazoCandado } from "@/lib/tablero/guardias-tipos";
import { VALORES_FRACCION } from "@/lib/tablero/fracciones";

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
//
// LAS GUARDIAS VIVEN EN LA MISMA TABLA (tipo 'guardia') PERO NO SE TOCAN DESDE ACÁ
// (guardias-contrato.md §1.3): se corren desde su menú (/guardias/mover) y se sacan con la
// autorización de JS. Si un id es una guardia, 409 con el motivo. Y una tarea común no entra
// en la celda de una guardia activa: lo frena el candado acá (409 RechazoCandado) y, por si
// algo se cuela, el trigger de la base, cuyo error se traduce al mismo 409. Cada handler que
// escribe arranca con exigirPermisoDeApi (segunda llave, la misma regla que el proxy).

export const dynamic = "force-dynamic";

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha YYYY-MM-DD");
const fraccion = z.enum(VALORES_FRACCION);
// El enum se deriva de TIPOS_TAREA para que agregar un tipo sea un solo cambio, pero
// conservando el tipo literal: con `as [string, ...]` zod devolvía `string` y el cambio
// dejaba de encajar en CambioTarea.
const tipo = z.enum(
  Object.keys(TIPOS_TAREA) as [keyof typeof TIPOS_TAREA, ...(keyof typeof TIPOS_TAREA)[]],
);
const id = z.number().int().positive();

function errorResponse(e: unknown) {
  if (esErrorDelCandado(e)) return rechazoDelTrigger();
  return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
}

type FilaCelda = { id: number; tipo: string; fecha: string; cuadrilla_odoo_id: number | null };

/** Tipo y celda actual de unas tareas: para saber si alguna es guardia y a dónde van. */
async function filasDe(db: SupabaseClient, ids: number[]): Promise<Map<number, FilaCelda>> {
  if (ids.length === 0) return new Map();
  const { data, error } = await db.from("tablero_tareas").select("id, tipo, fecha, cuadrilla_odoo_id").in("id", ids);
  if (error) throw new Error(error.message);
  return new Map(((data ?? []) as FilaCelda[]).map((f) => [Number(f.id), { ...f, id: Number(f.id) }]));
}

/** La primera guardia entre esas filas, o null. */
function guardiaEntre(filas: Map<number, FilaCelda>): number | null {
  return [...filas.values()].find((f) => f.tipo === "guardia")?.id ?? null;
}

/** El 409 con la forma de RechazoCandado: el tablero lo reconoce por `codigo`. */
function rechazoGuardia(error: string, guardiaId: number, pide: RechazoCandado["pide"]) {
  return NextResponse.json({ error, codigo: "guardia", guardiaId, pide } satisfies RechazoCandado, { status: 409 });
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
  const quien = await exigirPermisoDeApi(req);
  if (quien instanceof NextResponse) return quien;
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

    const candado = await frenoDeGuardias(fechas.map((fecha) => ({ cuadrillaId: t.cuadrillaId, fecha })), { tarea: true });
    if (candado) return candado;

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
  const quien = await exigirPermisoDeApi(req);
  if (quien instanceof NextResponse) return quien;
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalido("Cambio inválido");

  try {
    const db = await createClient();
    const c = parsed.data;

    // Las guardias no se tocan desde acá, y lo que cambia de celda pasa por el candado. (El
    // grupoId de una guardia es interno y negativo: el esquema de arriba ya no lo deja pasar.)
    if (!("grupoId" in c)) {
      const ids = "movimientos" in c ? c.movimientos.map((m) => m.id) : c.ids;
      const filas = await filasDe(db, ids);
      const guardiaId = guardiaEntre(filas);
      if (guardiaId != null) return rechazoGuardia("Las guardias se corren desde su menú, no como una tarea.", guardiaId, null);
      const destinos =
        "movimientos" in c
          ? c.movimientos.map((m) => ({
              id: m.id,
              fecha: m.fecha,
              cuadrillaId: m.cuadrillaId !== undefined ? m.cuadrillaId : (filas.get(m.id)?.cuadrilla_odoo_id ?? null),
            }))
          : c.cambio.fecha !== undefined || c.cambio.cuadrillaId !== undefined
            ? c.ids.map((id) => ({
                id,
                fecha: c.cambio.fecha ?? filas.get(id)?.fecha ?? "",
                cuadrillaId: c.cambio.cuadrillaId !== undefined ? c.cambio.cuadrillaId : (filas.get(id)?.cuadrilla_odoo_id ?? null),
              }))
            : [];
      // Lo que se queda en su celda (reordenar dentro del día) no se frena.
      const cambian = destinos.filter((d) => {
        const f = filas.get(d.id);
        return d.fecha && (!f || f.fecha !== d.fecha || f.cuadrilla_odoo_id !== d.cuadrillaId);
      });
      const candado = await frenoDeGuardias(cambian, { tarea: true });
      if (candado) return candado;
    }
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
  const quien = await exigirPermisoDeApi(req);
  if (quien instanceof NextResponse) return quien;
  const parsed = borrarSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalido("Tarea inválida");

  try {
    const db = await createClient();
    const guardiaId = guardiaEntre(await filasDe(db, parsed.data.ids));
    if (guardiaId != null) return rechazoGuardia("Para sacar una guardia hace falta la autorización de JS.", guardiaId, "sacar");
    await borrarTareas(db, parsed.data.ids);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
