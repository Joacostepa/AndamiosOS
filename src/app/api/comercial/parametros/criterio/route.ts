import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { leerCriterio, leerVersionesCriterio } from "@/lib/parametros-cotizacion/servidor";
import { db, errorResponse, invalido } from "../../_comun";

// GET  /api/comercial/parametros/criterio[?version=N] — el texto (vigente o una versión) y
//      la lista de versiones.
// POST /api/comercial/parametros/criterio — guardar una versión nueva, que pasa a vigente.
//      Restaurar una versión vieja es lo mismo: se guarda su texto como versión nueva, así
//      el historial nunca retrocede.

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const v = req.nextUrl.searchParams.get("version");
  const version = v ? Number(v) : undefined;
  if (v && (!Number.isInteger(version) || version! < 1)) return invalido("Versión inválida");
  try {
    const cliente = await db();
    const [criterio, versiones] = await Promise.all([leerCriterio(cliente, version), leerVersionesCriterio(cliente)]);
    if (!criterio) return NextResponse.json({ error: "No existe esa versión del criterio" }, { status: 404 });
    return NextResponse.json({ criterio, versiones });
  } catch (e) {
    return errorResponse(e);
  }
}

const schema = z.object({
  contenido: z.string().min(200, "El criterio quedó vacío o demasiado corto").max(200_000),
  notas: z.string().trim().min(3, "Contá qué cambia en esta versión").max(500),
});

export async function POST(req: NextRequest) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalido(parsed.error);
  try {
    const cliente = await db();
    const { data, error } = await cliente.rpc("cotizacion_criterio_nueva_version", {
      p_contenido: parsed.data.contenido,
      p_notas: parsed.data.notas,
    });
    if (error) throw error;
    return NextResponse.json({ version: data });
  } catch (e) {
    return errorResponse(e);
  }
}
