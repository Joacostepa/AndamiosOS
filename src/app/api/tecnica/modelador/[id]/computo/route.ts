import { NextRequest, NextResponse } from "next/server";
import { decisionesValidas, lineasParaComputo, diferenciasComputo, metricasDe, resumenDe, computoBloqueado } from "@/lib/tecnica/persistencia/computo";
import { contextoComputo, traducirErrorDb } from "@/lib/tecnica/persistencia/servidor";
import { generarSchema } from "@/lib/tecnica/persistencia/validar";
import type { RespuestaGenerar } from "@/lib/tecnica/persistencia/tipos";
import { createAdminClient } from "@/lib/supabase/admin";
import { fallo, guardia, idInvalido, idValido, invalido, leerJson, sesion } from "../../_comun";

// POST /api/tecnica/modelador/[id]/computo — { obra_id, revision, decisiones, reemplazarOtroModelo?, aceptoOmitidas? }
// Genera el cómputo REAL de la obra (computos + computo_items con origen 'modelo') vía la RPC
// tec_generar_computo, que es transaccional, vuelve a chequear la revisión y bloquea si está completado.
// Las líneas salen del modelo recalculado acá; lo que mande el navegador como BOM se ignora.
// La RPC solo la puede ejecutar service_role (migración 20261015000004): se llama con el cliente de
// servicio y el uid ya verificado por guardia(); la RPC revalida los permisos de ese uid.

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await guardia("editar", { computos: true });
  if (g instanceof NextResponse) return g;
  const { id } = await ctx.params;
  if (!idValido(id)) return idInvalido();
  const p = generarSchema.safeParse(await leerJson(req));
  if (!p.success) return invalido(p.error);
  try {
    const db = await sesion();
    const c = await contextoComputo(db, id, p.data.obra_id, p.data.revision);
    if (computoBloqueado(c.computo?.estado)) {
      return NextResponse.json({ error: "El cómputo está completado: no se regenera. Pasalo a «requiere ajuste» si hay que cambiarlo." }, { status: 423 });
    }
    const { lineas, omitidas } = lineasParaComputo(c.resultado.bom);
    if (lineas.length === 0) return NextResponse.json({ error: "El modelo no tiene piezas con código: no hay nada para pasar al cómputo." }, { status: 400 });
    if (omitidas.length > 0 && !p.data.aceptoOmitidas) {
      return NextResponse.json(
        { error: `${omitidas.length} línea(s) no tienen código en el catálogo y no van a entrar al cómputo. Confirmá para seguir.`, omitidas },
        { status: 422 },
      );
    }
    const diff = diferenciasComputo(c.actuales, lineas);
    const decisiones: Record<string, string> = decisionesValidas(diff, p.data.decisiones);
    if (p.data.reemplazarOtroModelo) decisiones._modelo = "reemplazar";

    const { data, error } = await createAdminClient().rpc("tec_generar_computo", {
      p_uid: g.userId,
      p_modelo: id,
      p_obra: p.data.obra_id,
      p_revision: p.data.revision,
      p_lineas: lineas.map((l) => ({ pieza_id: l.pieza_id, cantidad: l.cantidad })),
      p_decisiones: decisiones,
      p_metricas: metricasDe(c.resultado, c.diseno),
    });
    if (error) throw traducirErrorDb(error, "No se pudo generar el cómputo.");

    // El resumen de la lista, ahora con el catálogo real (no cambia el diseño: no sube la revisión).
    await db.from("tec_modelos").update({ resumen: resumenDe(c.resultado, c.diseno) }).eq("id", id);

    const r = data as Omit<RespuestaGenerar, "omitidas">;
    return NextResponse.json({ ...r, omitidas } satisfies RespuestaGenerar);
  } catch (e) {
    return fallo(e);
  }
}
