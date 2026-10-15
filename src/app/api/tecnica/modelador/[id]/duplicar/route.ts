import { NextRequest, NextResponse } from "next/server";
import { migrarDiseno } from "@/lib/tecnica/modelo";
import { conObra, filaNueva, leerFilaModelo, leerModelo, leerObra, traducirErrorDb } from "@/lib/tecnica/persistencia/servidor";
import { duplicarSchema } from "@/lib/tecnica/persistencia/validar";
import type { ObraRef } from "@/lib/tecnica/persistencia/tipos";
import { fallo, guardia, idInvalido, idValido, invalido, leerJson, sesion } from "../../_comun";

// POST /api/tecnica/modelador/[id]/duplicar — { nombre?, obra_id? } → { modelo } (201)
// Copia el modelo tal cual (mismo diseño, revisión 1). Una plantilla duplicada sigue siendo plantilla.
// Con obra_id (aunque sea null) se cambia la obra de la copia; si no, queda la misma.

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await guardia("editar");
  if (g instanceof NextResponse) return g;
  const { id } = await ctx.params;
  if (!idValido(id)) return idInvalido();
  const p = duplicarSchema.safeParse((await leerJson(req)) ?? {});
  if (!p.success) return invalido(p.error);
  try {
    const db = await sesion();
    const src = await leerFilaModelo(db, id);
    const esPlantilla = src.es_plantilla === true;
    let obra: ObraRef | null = (Array.isArray(src.obra) ? src.obra[0] : src.obra) ?? null;
    if (p.data.obra_id !== undefined) obra = p.data.obra_id ? await leerObra(db, p.data.obra_id) : null;
    if (esPlantilla) obra = null;
    const nombre = p.data.nombre ?? `Copia de ${src.nombre as string}`;
    const fila = filaNueva(conObra(migrarDiseno(src.diseno), obra), {
      nombre,
      descripcion: (src.descripcion as string | null) ?? null,
      obra_id: obra?.id ?? null,
      cotizacion_ref: (src.cotizacion_ref as string | null) ?? null,
      es_plantilla: esPlantilla,
      plantilla_categoria: (src.plantilla_categoria as string | null) ?? null,
      resumen: src.resumen,
    });
    const { data, error } = await db.from("tec_modelos").insert(fila).select("id").single();
    if (error) throw traducirErrorDb(error, "No se pudo duplicar el modelo.");
    return NextResponse.json({ modelo: await leerModelo(db, (data as { id: string }).id) }, { status: 201 });
  } catch (e) {
    return fallo(e);
  }
}
