import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { fetchGestionDe, registrarGestion } from "@/lib/habilitaciones/servicio";
import { errorResponse, invalido, parseOtId, sesion } from "../../_comun";

// POST /api/habilitaciones/:otId/gestiones — registrar un reclamo, una consulta, etc.
//
// LOS BOTONES SÓLO REGISTRAN. No redactan ni envían mails: Agustina manda el correo por
// fuera y marca acá que lo hizo. Lo que aporta el sistema es la FECHA — poder demostrar
// que se reclamó tres veces desde el 4 de agosto es todo el valor.
//
// No hay PATCH ni DELETE, y no es un olvido: el historial es append-only y la
// restricción vive en RLS, no acá. Una gestión mal cargada se corrige agregando otra.

export const dynamic = "force-dynamic";

const schema = z.object({
  tipo: z.enum([
    "triage", "consulta", "reclamo", "envio", "aprobacion",
    "observacion", "permiso", "renovacion", "excepcion",
  ]),
  detalle: z.string().trim().max(1000).nullable().optional(),
});

export async function POST(req: NextRequest, ctx: { params: Promise<{ otId: string }> }) {
  const otId = parseOtId((await ctx.params).otId);
  if (!otId) return invalido("Id de OT inválido");

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalido(parsed.error.issues.map((i) => i.message).join(" · "));

  try {
    const { db, userId } = await sesion();
    await registrarGestion(db, otId, parsed.data.tipo, parsed.data.detalle?.trim() || null, userId);
    return NextResponse.json({ ok: true, gestion: await fetchGestionDe(db, otId) });
  } catch (e) {
    return errorResponse(e);
  }
}
