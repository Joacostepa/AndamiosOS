import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { exigirDireccionApi } from "@/lib/direccion/permisos-servidor";
import { controlarActualizacion, invalidarPantalla } from "@/lib/direccion/cache";
import { PANTALLAS_IDS, type PantallaId } from "@/lib/direccion/tipos";

// POST /api/direccion/actualizar?pantalla=caja — "Actualizar ahora" (⟳ del encabezado).
//
// Invalida la caché de la pantalla (y la de La semana) para que la próxima lectura vaya a
// Odoo. Como mucho una vez cada 5 minutos por usuario y pantalla (429 con el motivo).
// Alcanza con "ver": releer no cambia nada (acceso.ts lo lista en POST_DE_LECTURA).

export async function POST(req: NextRequest) {
  const s = await exigirDireccionApi("ver");
  if (s instanceof NextResponse) return s;
  const p = req.nextUrl.searchParams.get("pantalla") as PantallaId | null;
  if (!p || !PANTALLAS_IDS.includes(p)) return NextResponse.json({ error: "Falta la pantalla." }, { status: 400 });
  if (p === "socios" && !s.conSocios) return NextResponse.json({ error: "No tenés acceso a esa sección." }, { status: 403 });
  const r = await controlarActualizacion(createAdminClient(), s.userId, p);
  if (!r.ok) return NextResponse.json({ error: r.mensaje, esperarSeg: r.esperarSeg }, { status: 429 });
  invalidarPantalla(p);
  return NextResponse.json({ ok: true });
}
