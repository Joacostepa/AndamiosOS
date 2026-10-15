import { NextRequest, NextResponse } from "next/server";
import { conObra, leerModelo, leerObra, traducirErrorDb } from "@/lib/tecnica/persistencia/servidor";
import { patchSchema, validarDisenoEntrante } from "@/lib/tecnica/persistencia/validar";
import { ESQUEMA_DISENO, VERSION_MOTOR } from "@/lib/tecnica/modelo";
import { fallo, guardia, idInvalido, idValido, invalido, leerJson, sesion, sinCache } from "../_comun";

// GET    /api/tecnica/modelador/[id] — el modelo con su diseño
// PATCH  /api/tecnica/modelador/[id] — { revision, diseno?, nombre?, descripcion?, obra_id?, cotizacion_ref?, resumen? }
//        Con diseño: control optimista. Si la revisión no es la actual → 409 { error, revisionActual }.
//        Sin diseño (renombrar, vincular a obra): no pide revisión ni la sube.
// DELETE /api/tecnica/modelador/[id] — archiva (no se borra: un cómputo puede apuntarle). 204

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const g = await guardia("ver");
  if (g instanceof NextResponse) return g;
  const { id } = await ctx.params;
  if (!idValido(id)) return idInvalido();
  try {
    const modelo = await leerModelo(await sesion(), id);
    return NextResponse.json({ modelo }, { headers: sinCache });
  } catch (e) {
    return fallo(e);
  }
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const g = await guardia("editar");
  if (g instanceof NextResponse) return g;
  const { id } = await ctx.params;
  if (!idValido(id)) return idInvalido();
  const p = patchSchema.safeParse(await leerJson(req));
  if (!p.success) return invalido(p.error);
  const b = p.data;
  try {
    const db = await sesion();
    const cambios: Record<string, unknown> = {};
    if (b.nombre !== undefined) cambios.nombre = b.nombre;
    if (b.descripcion !== undefined) cambios.descripcion = b.descripcion;
    if (b.cotizacion_ref !== undefined) cambios.cotizacion_ref = b.cotizacion_ref;
    if (b.resumen !== undefined) cambios.resumen = b.resumen;
    let obra = undefined as Awaited<ReturnType<typeof leerObra>> | null | undefined;
    if (b.obra_id !== undefined) {
      if (b.obra_id) {
        const { data: fila } = await db.from("tec_modelos").select("es_plantilla").eq("id", id).maybeSingle();
        if ((fila as { es_plantilla?: boolean } | null)?.es_plantilla) {
          return NextResponse.json({ error: "Una plantilla no se vincula a una obra: creá un modelo desde la plantilla." }, { status: 400 });
        }
      }
      obra = b.obra_id ? await leerObra(db, b.obra_id) : null;
      cambios.obra_id = obra?.id ?? null;
    }
    if (b.diseno !== undefined) {
      const v = validarDisenoEntrante(b.diseno);
      if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
      // La obra del diseño solo se muestra: se completa al leer, desde la columna obra_id.
      const diseno = obra !== undefined ? conObra(v.diseno, obra) : v.diseno;
      cambios.diseno = b.nombre !== undefined ? { ...diseno, nombre: b.nombre } : diseno;
      cambios.esquema = v.diseno.esquema ?? ESQUEMA_DISENO;
      cambios.motor_version = VERSION_MOTOR;
    }

    let q = db.from("tec_modelos").update(cambios).eq("id", id).is("archivado_at", null);
    if (b.diseno !== undefined) q = q.eq("revision", b.revision as number);
    const { data, error } = await q.select("revision").maybeSingle();
    if (error) throw traducirErrorDb(error);
    if (!data) {
      const { data: actual } = await db.from("tec_modelos").select("revision").eq("id", id).is("archivado_at", null).maybeSingle();
      if (!actual) return NextResponse.json({ error: "No encuentro el modelo (o está archivado)." }, { status: 404 });
      return NextResponse.json(
        { error: "Alguien más guardó este modelo mientras lo tenías abierto.", revisionActual: (actual as { revision: number }).revision },
        { status: 409 },
      );
    }
    return NextResponse.json({ revision: (data as { revision: number }).revision });
  } catch (e) {
    return fallo(e);
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const g = await guardia("editar");
  if (g instanceof NextResponse) return g;
  const { id } = await ctx.params;
  if (!idValido(id)) return idInvalido();
  try {
    const db = await sesion();
    const { data, error } = await db.from("tec_modelos").update({ archivado_at: new Date().toISOString() }).eq("id", id).is("archivado_at", null).select("id").maybeSingle();
    if (error) throw traducirErrorDb(error, "No se pudo archivar el modelo.");
    if (!data) return NextResponse.json({ error: "No encuentro el modelo (o ya está archivado)." }, { status: 404 });
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    return fallo(e);
  }
}
