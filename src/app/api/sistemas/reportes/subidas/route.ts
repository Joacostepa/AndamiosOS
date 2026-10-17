import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { pedidoSubidasSchema } from "@/lib/sistemas/validar";
import { BUCKET, EXTENSION_MIME, LIMITES, REVISOR, type RespuestaSubidas } from "@/lib/sistemas/tipos";
import { admin, errorResponse, exigirSesion, invalido, leerJson, sesion, sinCache, sinInstalar } from "../../_comun";

// POST /api/sistemas/reportes/subidas — { archivos: [{ mime, bytes }] } → { subidas: [{ path, token }] }
//
// Firma una subida por imagen al bucket privado `sistemas` (sin políticas para authenticated:
// sólo se entra con esta firma). El archivo NO pasa por acá: el navegador lo sube con
// uploadToSignedUrl, como los adjuntos del asistente comercial. Cada path va dentro de la
// carpeta de quien reporta (<uid>/<uuid>.<ext>): sis_crear_reporte después exige eso mismo y
// que el archivo ya esté en Storage, y toma el tipo y el tamaño de ahí, no de este pedido.

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const quien = await exigirSesion();
  if (quien instanceof NextResponse) return quien;
  const p = pedidoSubidasSchema.safeParse(await leerJson(req));
  if (!p.success) return invalido(p.error);

  try {
    // El mismo tope que sis_crear_reporte, antes de firmar: sin esto, quien ya llegó a 20
    // podría seguir llenando el bucket de imágenes que nunca van a un reporte. De paso, si
    // falta la migración se entera acá y no después de subir.
    const desde = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count, error: errCount } = await (await sesion())
      .from("sis_reportes")
      .select("id", { count: "exact", head: true })
      .eq("creado_por", quien.userId)
      .gte("created_at", desde);
    if (errCount) {
      const faltante = sinInstalar(errCount);
      if (faltante) return faltante;
      throw errCount;
    }
    if ((count ?? 0) >= LIMITES.reportesPorDia) {
      return NextResponse.json(
        { error: `Llegaste a ${LIMITES.reportesPorDia} reportes en un día. Si es urgente, avisale a ${REVISOR} por otro medio.` },
        { status: 429 },
      );
    }

    const storage = admin().storage.from(BUCKET);

    // Y un tope a las imágenes subidas en 24 h, aunque no lleguen a ningún reporte: el de arriba
    // cuenta reportes, y sin éste se podría pedir firmas sin fin y llenar el bucket de huérfanas.
    // Lista la carpeta de quien reporta con la service role (lo más nuevo primero).
    const topeImagenes = LIMITES.reportesPorDia * LIMITES.imagenes;
    const { data: propios, error: errLista } = await storage.list(quien.userId, {
      limit: topeImagenes + 1,
      sortBy: { column: "created_at", order: "desc" },
    });
    if (errLista) {
      const faltante = sinInstalar(errLista);
      if (faltante) return faltante;
      throw errLista;
    }
    const subidasHoy = (propios ?? []).filter((o) => o.created_at && Date.parse(o.created_at) >= Date.parse(desde)).length;
    if (subidasHoy + p.data.archivos.length > topeImagenes) {
      return NextResponse.json(
        { error: `Subiste muchas imágenes en un día. Si es urgente, avisale a ${REVISOR} por otro medio.` },
        { status: 429 },
      );
    }

    const subidas: RespuestaSubidas["subidas"] = [];
    for (const a of p.data.archivos) {
      const path = `${quien.userId}/${randomUUID()}.${EXTENSION_MIME[a.mime]}`;
      const { data, error } = await storage.createSignedUploadUrl(path);
      if (error) {
        const faltante = sinInstalar(error);
        if (faltante) return faltante;
        throw error;
      }
      subidas.push({ path: data.path, token: data.token });
    }
    return NextResponse.json({ subidas } satisfies RespuestaSubidas, { headers: sinCache });
  } catch (e) {
    return errorResponse(e);
  }
}
