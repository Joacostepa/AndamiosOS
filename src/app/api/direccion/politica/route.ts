import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { exigirSociosApi } from "@/lib/direccion/permisos-servidor";
import { registrarAuditoria } from "@/lib/direccion/auditoria";
import { falloEscritura, leerBody } from "../_comun";
import { esTablaFaltante } from "@/lib/direccion/supabase";
import { leerPolitica } from "@/lib/direccion/calculo/socios-reglas";

// /api/direccion/politica — la política de retiros (sólo socios).
//  GET: la versión vigente (o null).
//  POST: carga una versión nueva (versionada, no se pisa). Pide Dirección en "editar"
//        (proxy) y direccion-socios (acá y en la RLS). Supabase, nunca Odoo.
// Vive bajo /api/direccion y no /api/direccion/socios porque ese prefijo es de un módulo
// sólo lectura y el proxy rechaza ahí cualquier POST.

const esquema = z.object({
  contenido: z.record(z.string(), z.unknown()).refine((o) => Object.keys(o).length > 0, "La política está vacía"),
});

export async function GET() {
  const s = await exigirSociosApi();
  if (s instanceof NextResponse) return s;
  const db = await createClient();
  const { data, error } = await db
    .from("direccion_politica_retiros")
    .select("version, contenido, created_at")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    if (esTablaFaltante(error)) return NextResponse.json({ politica: null, disponible: false });
    return falloEscritura(error);
  }
  return NextResponse.json({ politica: data ?? null, disponible: true });
}

export async function POST(req: NextRequest) {
  const s = await exigirSociosApi("editar");
  if (s instanceof NextResponse) return s;
  const body = await leerBody(req, esquema);
  if (body instanceof NextResponse) return body;
  // Forma de la política (socios-reglas.ts): proporción de Jorge 0–100 y topes opcionales.
  const contenido = leerPolitica(body.contenido);
  if (!contenido) return NextResponse.json({ error: "La proporción de Jorge tiene que ser un número entre 0 y 100." }, { status: 400 });
  const db = await createClient();
  const { data, error } = await db.from("direccion_politica_retiros").insert({ contenido, autor: s.userId }).select("version").single();
  if (error) return falloEscritura(error);
  await registrarAuditoria(s.userId, "politica", { version: data.version });
  return NextResponse.json({ ok: true, version: data.version });
}
