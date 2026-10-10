import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { guardarGestores, leerGestores } from "@/lib/permisos-via-publica/config";
import { quienSoy } from "@/lib/permisos-via-publica/lista";
import { accesoDeFila, nivelEn } from "@/lib/auth/acceso";

// GET/PUT /api/permisos-via-publica/config/gestores — quiénes pueden tocar lo que no se deshace
// (armar la encomienda, presentar en TAD, empezar de cero). Sin nadie marcado, cualquiera que
// edite el módulo, como antes. GET devuelve los candidatos (quienes editan el módulo); PUT sólo
// un administrador.

export const dynamic = "force-dynamic";

export async function GET() {
  const admin = createAdminClient();
  const [{ data }, gestores] = await Promise.all([
    admin.from("user_profiles").select("email, nombre, apellido, rol, activo, permisos, debe_cambiar_clave").eq("activo", true),
    leerGestores(admin),
  ]);
  const candidatos = (data ?? [])
    .filter((p) => nivelEn(accesoDeFila(p), "permisos-via-publica") === "editar" && p.email)
    .map((p) => ({ email: String(p.email).toLowerCase(), nombre: `${p.nombre ?? ""} ${p.apellido ?? ""}`.trim() || String(p.email), admin: p.rol === "admin" }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
  return NextResponse.json({ candidatos, gestores });
}

const schema = z.object({ emails: z.array(z.string()).max(30) });

export async function PUT(req: NextRequest) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  const admin = createAdminClient();
  const yo = await quienSoy(await createClient(), admin, []);
  if (!yo.esAdmin) return NextResponse.json({ error: "Sólo un administrador elige los gestores." }, { status: 403 });
  try {
    return NextResponse.json({ gestores: await guardarGestores(admin, parsed.data.emails, yo.id) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
