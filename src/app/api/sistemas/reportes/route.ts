import { NextRequest, NextResponse } from "next/server";
import { crearReporteSchema } from "@/lib/sistemas/validar";
import { sanearContexto, sanearRuta, sanearTexto } from "@/lib/sistemas/contexto";
import { moduloDeRuta, pantallaDeRuta, pathnameDe } from "@/lib/sistemas/rutas";
import {
  SELECT_USUARIO, aReporteUsuario, avisosReporteNuevo, ecoSlackReporteNuevo, enviarAvisos, firmarPorReporte, revisoresActivos, shaActual, soloSlack,
  type FilaReporte,
} from "@/lib/sistemas/servidor";
import type { CrearReporteRespuesta, EstadoReporte, MisReportesRespuesta } from "@/lib/sistemas/tipos";
import { admin, errorResponse, exigirSesion, invalido, leerJson, sesion, sinCache } from "../_comun";

// GET  /api/sistemas/reportes — «Mis reportes»: los propios, con capturas firmadas y la conversación.
// POST /api/sistemas/reportes — manda un reporte a Sistemas (las imágenes ya subidas con /subidas).
//
// De todos (APIS_DE_TODOS): la RLS deja leer sólo lo propio y sis_crear_reporte escribe con
// auth.uid(). La service role va después de la llave: firmar URLs, el estado del original de
// un duplicado (ajeno: no se devuelve nada más) y los avisos a los revisores.

export const dynamic = "force-dynamic";

export async function GET() {
  const quien = await exigirSesion();
  if (quien instanceof NextResponse) return quien;
  try {
    const { data, error } = await (await sesion())
      .from("sis_reportes")
      .select(SELECT_USUARIO)
      .eq("creado_por", quien.userId)
      .order("ultima_actividad_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    const filas = (data ?? []) as unknown as FilaReporte[];
    const db = admin();

    // El estado del original de cada duplicado: «Ya está arreglado: otra persona había avisado lo mismo».
    const originales = [...new Set(filas.map((f) => f.duplicado_de).filter((x): x is string => !!x))];
    const estadoDe = new Map<string, EstadoReporte>();
    if (originales.length) {
      const { data: orig } = await db.from("sis_reportes").select("id, estado").in("id", originales);
      for (const o of orig ?? []) estadoDe.set(o.id as string, o.estado as EstadoReporte);
    }
    const capturas = await firmarPorReporte(db, filas);

    const reportes = filas.map((f) =>
      aReporteUsuario(f, f.duplicado_de ? estadoDe.get(f.duplicado_de) ?? null : null, capturas.get(f.id) ?? []),
    );
    return NextResponse.json({ reportes } satisfies MisReportesRespuesta, { headers: sinCache });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: NextRequest) {
  const quien = await exigirSesion();
  if (quien instanceof NextResponse) return quien;
  const p = crearReporteSchema.safeParse(await leerJson(req));
  if (!p.success) return invalido(p.error);
  const b = p.data;

  // Las imágenes tienen que estar en la carpeta de quien reporta (la RPC lo vuelve a exigir).
  if (b.capturas.some((c) => !c.path.startsWith(`${quien.userId}/`))) {
    return invalido("Una de las imágenes no es tuya o tiene un nombre raro. Probá de nuevo.");
  }

  // Todo lo que viene del navegador se sanea; la pantalla y el módulo salen de la ruta.
  const contexto = sanearContexto(b.contexto);
  const ruta = sanearRuta(b.ruta || contexto.ruta) || null;
  const pathname = pathnameDe(ruta);
  const modulo = ruta ? moduloDeRuta(pathname)?.id ?? null : null;
  const frena = b.tipo === "error" && b.frena;

  try {
    const { data, error } = await (await sesion()).rpc("sis_crear_reporte", {
      p: {
        tipo: b.tipo,
        descripcion: b.descripcion,
        frena,
        ruta,
        modulo,
        titulo_pantalla: sanearTexto(b.tituloPantalla || contexto.tituloPantalla, 200) || null,
        sha_cliente: (b.shaCliente || contexto.sha).replace(/[^\w.-]/g, "").slice(0, 64) || null,
        sha_servidor: shaActual(),
        contexto,
        capturas: b.capturas.map((c) => ({ path: c.path, mime: c.mime, bytes: c.bytes, ancho: c.ancho, alto: c.alto })),
      },
    });
    if (error) throw error;
    const r = data as { id: string; numero: number };
    const numero = Number(r.numero);

    const nuevo = {
      id: r.id,
      numero,
      tipo: b.tipo,
      frena,
      pantalla: pantallaDeRuta(ruta),
      autorId: quien.userId,
      revisores: await revisoresActivos(),
    };
    const avisos = avisosReporteNuevo(nuevo);
    await enviarAvisos(avisos);
    await soloSlack(ecoSlackReporteNuevo(nuevo, avisos));

    return NextResponse.json({ id: r.id, numero, frena } satisfies CrearReporteRespuesta, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
