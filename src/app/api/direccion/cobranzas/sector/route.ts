import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { exigirDireccionApi } from "@/lib/direccion/permisos-servidor";
import { registrarAuditoria } from "@/lib/direccion/auditoria";
import { invalidarPantalla } from "@/lib/direccion/cache";
import { aplicarCambiosSector, leerConfigCobranzas } from "@/lib/direccion/calculo/cobranzas-reglas";
import { falloEscritura, leerBody } from "../../_comun";

// POST /api/direccion/cobranzas/sector — "¿Quién es del Estado?": marca a mano qué clientes
// son organismos públicos (o privados) por encima de la regla por nombre, y los días de las
// facturas sin plazo. Supabase (direccion_config, clave "cobranzas"), nunca Odoo. Pide
// "editar". Sin la tabla, 503 con el mensaje amable. Invalida Cobranzas (y La semana).

const esquema = z
  .object({
    cambios: z
      .array(z.object({ partnerId: z.number().int().positive(), sector: z.enum(["publico", "privado", "regla"]) }))
      .max(500)
      .default([]),
    diasSinPlazo: z.number().int().min(0).max(180).optional(),
  })
  .refine((b) => b.cambios.length > 0 || b.diasSinPlazo !== undefined, "No hay nada para guardar");

export async function POST(req: NextRequest) {
  const s = await exigirDireccionApi("editar");
  if (s instanceof NextResponse) return s;
  const body = await leerBody(req, esquema);
  if (body instanceof NextResponse) return body;
  const db = await createClient();
  const actual = await db.from("direccion_config").select("valor").eq("clave", "cobranzas").maybeSingle();
  if (actual.error) return falloEscritura(actual.error);
  let cfg = aplicarCambiosSector(leerConfigCobranzas(actual.data?.valor), body.cambios);
  if (body.diasSinPlazo !== undefined) cfg = { ...cfg, diasSinPlazo: body.diasSinPlazo };
  const { error } = await db
    .from("direccion_config")
    .upsert({ clave: "cobranzas", valor: cfg, autor: s.userId, updated_at: new Date().toISOString() }, { onConflict: "clave" });
  if (error) return falloEscritura(error);
  await registrarAuditoria(s.userId, "config", { clave: "cobranzas", cambios: body.cambios, diasSinPlazo: body.diasSinPlazo });
  invalidarPantalla("cobranzas");
  return NextResponse.json({ ok: true });
}
