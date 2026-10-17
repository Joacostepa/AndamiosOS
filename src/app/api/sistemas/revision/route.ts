import { NextRequest, NextResponse } from "next/server";
import { filtrosDeQuery, partirBusqueda } from "@/lib/sistemas/validar";
import { SELECT_LISTA, armarFilas, idsPorNombre, leerMetricas, shaActual, type FilaReporte } from "@/lib/sistemas/servidor";
import { ESTADOS_ABIERTOS, ESTADOS_REPORTE, esCerrado, type EstadoReporte, type RevisionLista } from "@/lib/sistemas/tipos";
import { admin, errorResponse, exigirRevisor, sesion, sinCache } from "../_comun";

// GET /api/sistemas/revision?estado=nuevo&tipo=&frena=1&q= — la bandeja de Sistemas.
//
// Sólo con Sistemas · Revisión en «editar» (también para leer). Los reportes se leen con la
// sesión (la RLS deja ver todo al revisor: sis_puede_revisar); los nombres, los contadores
// del subtítulo y las métricas, con la service role.
//
// Orden: en las pestañas abiertas, primero lo que frena y después lo más viejo arriba (lo que
// lleva más esperando); en las cerradas, el número más alto primero.

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const quien = await exigirRevisor();
  if (quien instanceof NextResponse) return quien;
  const f = filtrosDeQuery(req.nextUrl.searchParams);

  try {
    const db = await sesion();
    const ad = admin();

    let q = db.from("sis_reportes").select(SELECT_LISTA).eq("estado", f.estado);
    if (f.tipo) q = q.eq("tipo", f.tipo);
    if (f.frena) q = q.eq("frena", true);
    const busca = partirBusqueda(f.q);
    if (busca.numero !== null || busca.texto) {
      const condiciones: string[] = [];
      if (busca.numero !== null) condiciones.push(`numero.eq.${busca.numero}`);
      if (busca.texto) {
        condiciones.push(`descripcion.ilike.*${busca.texto}*`);
        const ids = await idsPorNombre(ad, busca.texto);
        if (ids.length) condiciones.push(`creado_por.in.(${ids.join(",")})`);
      }
      q = q.or(condiciones.join(","));
    }
    q = esCerrado(f.estado)
      ? q.order("numero", { ascending: false })
      : q.order("frena", { ascending: false }).order("created_at", { ascending: true });

    const contar = (estado: EstadoReporte) =>
      db.from("sis_reportes").select("id", { count: "exact", head: true }).eq("estado", estado);
    const [lista, frenan, metricas, ...cuentas] = await Promise.all([
      q.limit(200),
      db.from("sis_reportes").select("id", { count: "exact", head: true }).eq("frena", true).in("estado", [...ESTADOS_ABIERTOS]),
      leerMetricas(ad),
      ...ESTADOS_REPORTE.map(contar),
    ]);
    if (lista.error) throw lista.error;

    const contadores = Object.fromEntries(ESTADOS_REPORTE.map((e, i) => [e, cuentas[i]?.count ?? 0])) as Record<EstadoReporte, number>;
    const reportes = await armarFilas(ad, (lista.data ?? []) as unknown as FilaReporte[], 300);
    const cuerpo: RevisionLista = { reportes, contadores, frenanAbiertos: frenan.count ?? 0, metricas, shaActual: shaActual() };
    return NextResponse.json(cuerpo, { headers: sinCache });
  } catch (e) {
    return errorResponse(e);
  }
}
