import { NextRequest, NextResponse, after } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { avisarProductor } from "@/lib/permisos-via-publica/endosos";
import { cargarTitular, tramiteDeToken } from "@/lib/permisos-via-publica/portal";
import { cuitValido } from "@/lib/permisos-via-publica/tipos";

// POST /api/public/permiso/:token/titular — el cliente dice quién es el dueño del lote.
//
// El nombre es el que escribe el cliente y el CUIT se valida por dígito verificador
// (decidido con JS, 2026-09-15). Cuando esté el certificado de ARCA, la razón social sale
// de ahí; mientras tanto se cruza contra los documentos del legajo.
//
// En consorcios también se pide el administrador (la persona, con CUIT/CUIL): va como
// coasegurado en el endoso, así que se pide acá, antes que el resto del legajo (JS, 15/09).
//
// Apenas se guarda sale el pedido de endoso a Segucom, después de responder.

export const dynamic = "force-dynamic";

const schema = z.object({
  tipoDueno: z.enum(["consorcio", "empresa", "persona"]),
  esInquilino: z.boolean(),
  nombre: z.string().trim().min(3).max(200),
  cuit: z.string().trim(),
  administrador: z.object({ nombre: z.string().trim().min(3).max(200), cuit: z.string().trim() }).nullable().optional(),
});

export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Faltan datos del dueño del lote" }, { status: 400 });
  const cuit = parsed.data.cuit.replace(/\D/g, "");
  if (!cuitValido(cuit)) return NextResponse.json({ error: "El CUIT no es válido. Revisá los números." }, { status: 400 });

  let administrador: { nombre: string; cuit: string } | null = null;
  if (parsed.data.tipoDueno === "consorcio") {
    if (!parsed.data.administrador) return NextResponse.json({ error: "Faltan los datos del administrador del consorcio" }, { status: 400 });
    const cuitAdministrador = parsed.data.administrador.cuit.replace(/\D/g, "");
    if (!cuitValido(cuitAdministrador)) return NextResponse.json({ error: "El CUIT/CUIL del administrador no es válido. Revisá los números." }, { status: 400 });
    administrador = { nombre: parsed.data.administrador.nombre, cuit: cuitAdministrador };
  }

  const db = createAdminClient();
  const t = await tramiteDeToken(db, token);
  if (!t) return NextResponse.json({ error: "El link no es válido" }, { status: 404 });

  try {
    await cargarTitular(db, t.id, {
      tipoDueno: parsed.data.tipoDueno, esInquilino: parsed.data.esInquilino, nombre: parsed.data.nombre, cuit, administrador,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
  after(() => avisarProductor(db, req.nextUrl.origin));
  return NextResponse.json({ ok: true });
}
