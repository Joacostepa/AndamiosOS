import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { exigirDireccionApi } from "@/lib/direccion/permisos-servidor";
import { registrarAuditoria } from "@/lib/direccion/auditoria";
import { invalidarPantalla } from "@/lib/direccion/cache";
import { falloEscritura, leerBody } from "../_comun";

// POST /api/direccion/minimo — el colchón mínimo de caja (en pesos) y/o el escenario por
// defecto del flujo. Supabase (direccion_config), nunca Odoo. Pide "editar". Como cambia la
// cobertura, invalida Caja (y La semana).

const esquema = z
  .object({
    colchonMinimoArs: z.number().finite().nonnegative().max(1e13).optional(),
    escenario: z.enum(["proyectado", "comprometido"]).optional(),
  })
  .refine((b) => b.colchonMinimoArs !== undefined || b.escenario !== undefined, "No hay nada para guardar");

export async function POST(req: NextRequest) {
  const s = await exigirDireccionApi("editar");
  if (s instanceof NextResponse) return s;
  const body = await leerBody(req, esquema);
  if (body instanceof NextResponse) return body;
  const db = await createClient();
  const ahora = new Date().toISOString();
  const filas = [
    ...(body.colchonMinimoArs !== undefined ? [{ clave: "colchon_minimo", valor: { ars: body.colchonMinimoArs }, autor: s.userId, updated_at: ahora }] : []),
    ...(body.escenario !== undefined ? [{ clave: "escenario", valor: { valor: body.escenario }, autor: s.userId, updated_at: ahora }] : []),
  ];
  const { error } = await db.from("direccion_config").upsert(filas, { onConflict: "clave" });
  if (error) return falloEscritura(error);
  await registrarAuditoria(s.userId, "config", body);
  invalidarPantalla("caja");
  return NextResponse.json({ ok: true });
}
