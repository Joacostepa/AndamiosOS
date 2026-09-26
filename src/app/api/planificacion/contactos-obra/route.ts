import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { crearContactoObra, borrarContactoObra } from "@/lib/odoo/asignaciones";
import { OdooError } from "@/lib/odoo/client";

// Los contactos de una obra.
//
//   POST   { ventaId, nombre, rol?, telefono?, email? } → { id }
//   DELETE { id }                                        → { ok }
//
// CUELGAN DE LA ORDEN, NO DE LA OT, y por eso el POST pide `ventaId` y no `otId`: el
// armado, el desarme y la ampliación son la misma obra y la misma gente. Guardarlos en la
// orden es lo que hace que una OT nueva los traiga sin copiar nada — y copiar es donde
// estas cosas se desfasan con el tiempo.
//
// SÓLO ODOO. No toca Supabase: el dato lo comparte con Comercial, que lo ve y lo edita en
// la solapa "Trabajo a ejecutar" de la venta. Tenerlo en dos bases sin un id que las ate
// es exactamente el problema que ya tenemos con las cuadrillas.
//
// Ruta protegida por sesión (no está en publicPaths del middleware).

export const dynamic = "force-dynamic";

const crearSchema = z.object({
  ventaId: z.number().int().positive(),
  // Lo único obligatorio: un contacto sin nombre no se puede usar ni distinguir de otro.
  // El resto es opcional a propósito — muchas veces se tiene el teléfono y el rol pero no
  // el mail, y exigirlo haría que no se cargue nada.
  nombre: z.string().trim().min(1, "El nombre no puede estar vacío").max(120),
  rol: z.string().trim().max(80).optional().nullable(),
  telefono: z.string().trim().max(60).optional().nullable(),
  email: z.string().trim().max(120).optional().nullable(),
});

const borrarSchema = z.object({ id: z.number().int().positive() });

function error(e: unknown) {
  const msg = e instanceof OdooError ? e.message : e instanceof Error ? e.message : String(e);
  return NextResponse.json({ error: msg }, { status: 502 });
}

function invalido(issues: z.ZodIssue[]) {
  const detalle = issues.map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message));
  return NextResponse.json({ error: detalle.join(" · ") }, { status: 400 });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = crearSchema.safeParse(body);
  if (!parsed.success) return invalido(parsed.error.issues);

  try {
    return NextResponse.json({ id: await crearContactoObra(parsed.data) });
  } catch (e) {
    return error(e);
  }
}

export async function DELETE(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = borrarSchema.safeParse(body);
  if (!parsed.success) return invalido(parsed.error.issues);

  try {
    await borrarContactoObra(parsed.data.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return error(e);
  }
}
