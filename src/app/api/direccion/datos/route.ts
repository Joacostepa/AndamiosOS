import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { exigirDireccionApi } from "@/lib/direccion/permisos-servidor";
import { registrarAuditoria } from "@/lib/direccion/auditoria";
import { invalidarPantalla } from "@/lib/direccion/cache";
import { DEF } from "@/lib/direccion/diccionario";
import { falloEscritura, leerBody, respuestaPantalla } from "../_comun";

// /api/direccion/datos
//  GET: la pantalla calculada (RespuestaPantalla), con lo reservado ya recortado según quien pide.
//  POST: carga un aviso de calidad a mano, o cierra uno manual (direccion_avisos_calidad).
//        Pide "editar" (proxy + acá); uno reservado, además, socios (acá y en la RLS).
//        Supabase, nunca Odoo. Sin la tabla: 503 con mensaje amable.

export async function GET(req: NextRequest) {
  return respuestaPantalla("datos", req);
}

const nuevo = z.object({
  nivel: z.enum(["ver", "inc", "inf"]),
  aviso: z.string().trim().min(3, "Escribí el aviso").max(300),
  detalle: z.string().trim().max(1000).nullish(),
  que: z.string().trim().max(500).nullish(),
  quien: z.string().trim().max(120).nullish(),
  desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida").nullish(),
  afecta: z.array(z.string().refine((k) => !!DEF[k], "Ese indicador no existe")).max(10).default([]),
  reservado: z.boolean().default(false),
});
const cerrar = z.object({ cerrar: z.string().trim().min(1).max(80) });
const esquema = z.union([cerrar, nuevo]);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  const s = await exigirDireccionApi("editar");
  if (s instanceof NextResponse) return s;
  const body = await leerBody(req, esquema);
  if (body instanceof NextResponse) return body;
  const db = await createClient();

  if ("cerrar" in body) {
    // El id de un aviso manual es "manual_<clave o uuid>".
    const clave = body.cerrar.replace(/^manual_/, "");
    const q = db.from("direccion_avisos_calidad").update({ activo: false, updated_at: new Date().toISOString() });
    const { data, error } = await (UUID.test(clave) ? q.eq("id", clave) : q.eq("clave", clave)).select("id");
    if (error) return falloEscritura(error);
    if (!data?.length) return NextResponse.json({ error: "No encontramos ese aviso (o no tenés permiso para cerrarlo)." }, { status: 404 });
    await registrarAuditoria(s.userId, "aviso_cerrar", { aviso: body.cerrar });
    invalidarPantalla("datos");
    return NextResponse.json({ ok: true });
  }

  const reservado = body.reservado || body.afecta.some((k) => DEF[k]?.reservado);
  if (reservado && !s.conSocios) return NextResponse.json({ error: "No tenés acceso a esa sección." }, { status: 403 });
  const { data, error } = await db
    .from("direccion_avisos_calidad")
    .insert({
      nivel: body.nivel,
      aviso: body.aviso,
      detalle: body.detalle || null,
      que: body.que || null,
      quien: body.quien || null,
      desde: body.desde || null,
      afecta: body.afecta,
      reservado,
      autor: s.userId,
    })
    .select("id")
    .single();
  if (error) return falloEscritura(error);
  await registrarAuditoria(s.userId, "aviso_cargar", { id: data.id, reservado });
  invalidarPantalla("datos");
  return NextResponse.json({ ok: true, id: data.id });
}

// Calcula en vivo contra Odoo: La semana y Ventas pueden pasar los 10–15 s del límite por defecto de Vercel.
export const maxDuration = 300;
