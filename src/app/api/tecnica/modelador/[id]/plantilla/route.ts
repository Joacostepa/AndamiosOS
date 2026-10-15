import { NextRequest, NextResponse } from "next/server";
import { instanciarPlantilla, migrarDiseno } from "@/lib/tecnica/modelo";
import { filaNueva, leerFilaModelo, leerModelo, traducirErrorDb } from "@/lib/tecnica/persistencia/servidor";
import { plantillaSchema } from "@/lib/tecnica/persistencia/validar";
import { fallo, guardia, idInvalido, idValido, invalido, leerJson, sesion } from "../../_comun";

// POST /api/tecnica/modelador/[id]/plantilla — { nombre, descripcion?, categoria } → { modelo } (201)
// Guarda una COPIA del modelo como plantilla propia de Oficina Técnica («Mis plantillas»):
// es_plantilla = true, sin obra, ids renumerados (instanciarPlantilla). El modelo original no cambia.

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await guardia("editar");
  if (g instanceof NextResponse) return g;
  const { id } = await ctx.params;
  if (!idValido(id)) return idInvalido();
  const p = plantillaSchema.safeParse(await leerJson(req));
  if (!p.success) return invalido(p.error);
  try {
    const db = await sesion();
    const src = await leerFilaModelo(db, id);
    const diseno = instanciarPlantilla(migrarDiseno(src.diseno), { obra: null, nombre: p.data.nombre });
    const fila = filaNueva({ ...diseno, obra: null }, {
      nombre: p.data.nombre,
      descripcion: p.data.descripcion ?? null,
      es_plantilla: true,
      plantilla_categoria: p.data.categoria,
      resumen: src.resumen,
    });
    const { data, error } = await db.from("tec_modelos").insert(fila).select("id").single();
    if (error) throw traducirErrorDb(error, "No se pudo guardar la plantilla.");
    return NextResponse.json({ modelo: await leerModelo(db, (data as { id: string }).id) }, { status: 201 });
  } catch (e) {
    return fallo(e);
  }
}
