import { NextRequest, NextResponse } from "next/server";
import { idValido } from "@/lib/sistemas/validar";
import { SELECT_LISTA, armarFilas, type FilaReporte } from "@/lib/sistemas/servidor";
import type { CandidatosRespuesta } from "@/lib/sistemas/tipos";
import { admin, errorResponse, exigirRevisor, noExiste, sesion, sinCache } from "../../../_comun";

// GET /api/sistemas/revision/[id]/candidatos — para «Marcar duplicado»: los otros reportes que
// no son duplicados, primero los de la misma pantalla (mismo módulo o misma ruta) y después
// los más recientes. Hasta 20, sin el propio.

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const MAX = 20;

export async function GET(_req: NextRequest, ctx: Ctx) {
  const quien = await exigirRevisor();
  if (quien instanceof NextResponse) return quien;
  const { id } = await ctx.params;
  if (!idValido(id)) return noExiste();

  try {
    const db = await sesion();
    const { data: propio, error } = await db.from("sis_reportes").select("id, modulo, ruta").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!propio) return noExiste();

    const base = () => db.from("sis_reportes").select(SELECT_LISTA).neq("id", id).is("duplicado_de", null);
    const ruta = (propio.ruta as string | null) ?? null;
    // El módulo va sin comillas: sólo si tiene la forma de un id de acceso.ts (la RPC ya lo exige).
    const modulo = /^[a-z0-9-]{1,60}$/.test((propio.modulo as string | null) ?? "") ? (propio.modulo as string) : null;
    // La ruta va entre comillas en el filtro de PostgREST (puede traer comas o puntos).
    const rutaFiltro = ruta ? `ruta.eq."${ruta.replace(/["\\]/g, "")}"` : null;
    const misma = modulo ? (rutaFiltro ? `modulo.eq.${modulo},${rutaFiltro}` : `modulo.eq.${modulo}`) : rutaFiltro;

    const [cerca, recientes] = await Promise.all([
      misma ? base().or(misma).order("created_at", { ascending: false }).limit(MAX) : Promise.resolve({ data: [], error: null }),
      base().order("created_at", { ascending: false }).limit(MAX),
    ]);
    if (cerca.error) throw cerca.error;
    if (recientes.error) throw recientes.error;

    const vistos = new Set<string>();
    const filas: FilaReporte[] = [];
    for (const f of [...(cerca.data ?? []), ...(recientes.data ?? [])] as unknown as FilaReporte[]) {
      if (vistos.has(f.id) || filas.length >= MAX) continue;
      vistos.add(f.id);
      filas.push(f);
    }
    const candidatos = await armarFilas(admin(), filas, 300);
    return NextResponse.json({ candidatos } satisfies CandidatosRespuesta, { headers: sinCache });
  } catch (e) {
    return errorResponse(e);
  }
}
