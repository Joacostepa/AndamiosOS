import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { exigirDireccionApi } from "@/lib/direccion/permisos-servidor";
import { registrarAuditoria } from "@/lib/direccion/auditoria";
import { DEF } from "@/lib/direccion/diccionario";
import { falloEscritura, leerBody } from "../_comun";

// POST /api/direccion/metas — la meta de un indicador (Datos y definiciones). null = sin
// meta (la tarjeta deja de mostrar el punto). Supabase (direccion_metas, con historial),
// nunca Odoo. Pide "editar"; la de un indicador reservado, además, socios.

const esquema = z.object({
  kpiId: z.string().refine((k) => !!DEF[k], "Ese indicador no existe"),
  meta: z.number().finite().nullable(),
});

export async function POST(req: NextRequest) {
  const s = await exigirDireccionApi("editar");
  if (s instanceof NextResponse) return s;
  const body = await leerBody(req, esquema);
  if (body instanceof NextResponse) return body;
  if (DEF[body.kpiId].reservado && !s.conSocios) return NextResponse.json({ error: "No tenés acceso a esa sección." }, { status: 403 });
  const db = await createClient();
  const { error } = await db.from("direccion_metas").insert({ kpi_id: body.kpiId, meta: body.meta, reservado: !!DEF[body.kpiId].reservado, autor: s.userId });
  if (error) return falloEscritura(error);
  await registrarAuditoria(s.userId, "meta", { kpiId: body.kpiId, meta: body.meta });
  return NextResponse.json({ ok: true });
}
