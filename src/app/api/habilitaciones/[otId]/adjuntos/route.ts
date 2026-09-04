import { NextResponse } from "next/server";
import { db as conectar, errorResponse, invalido, parseOtId } from "../../_comun";

// GET /api/habilitaciones/[otId]/adjuntos
//
// Los archivos de TODOS los requisitos de la obra, en una sola respuesta.
//
// POR QUÉ EXISTE: la ficha renderiza un <Adjuntos> por requisito y cada uno hacía su
// propio storage.list() DESDE EL BROWSER. Con la obra de 12 requisitos eran 12 requests
// de ~300 ms cada uno, que además el navegador serializa de a 6 por host — y casi todos
// devolvían cero archivos, o sea 12 viajes para pintar un clip sin número. Encima el hook
// no tenía staleTime, así que se repetían enteros en cada montaje de la ficha.
//
// Acá los N listados se hacen en el servidor y EN PARALELO: el browser paga un viaje.
// Storage no tiene listado recursivo —list() sobre el prefijo de la obra devuelve las
// carpetas de cada requisito, no los archivos—, así que las N llamadas siguen existiendo;
// lo que cambia es de qué lado de la red se pagan.
//
// Subir y borrar siguen yendo directo del browser a Storage: son de a uno, con el archivo
// en la mano, y pasarlos por acá sólo agregaría un salto.

export const dynamic = "force-dynamic";

const BUCKET = "habilitaciones";

export async function GET(_req: Request, ctx: { params: Promise<{ otId: string }> }) {
  const otId = parseOtId((await ctx.params).otId);
  if (!otId) return invalido("Id de OT inválido");

  try {
    const db = await conectar();

    const { data: reqs, error } = await db
      .from("hab_requisitos").select("id").eq("odoo_ot_id", otId);
    if (error) throw new Error(error.message);

    const ids = (reqs ?? []).map((r) => r.id as string);
    const listados = await Promise.all(
      ids.map(async (requisitoId) => {
        const prefijo = `habilitaciones/${otId}/${requisitoId}`;
        const { data } = await db.storage.from(BUCKET).list(prefijo);
        return [
          requisitoId,
          // Storage devuelve las subcarpetas con id null; sólo interesan los archivos.
          (data ?? [])
            .filter((f) => f.id !== null)
            .map((f) => ({
              nombre: f.name,
              path: `${prefijo}/${f.name}`,
              tamano: (f.metadata?.size as number | undefined) ?? null,
            })),
        ] as const;
      }),
    );

    return NextResponse.json({ adjuntos: Object.fromEntries(listados) });
  } catch (e) {
    return errorResponse(e);
  }
}
