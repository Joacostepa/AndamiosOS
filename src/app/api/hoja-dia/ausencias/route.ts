import { NextRequest, NextResponse } from "next/server";
import { accionAusencia, accionAusenciaSchema } from "@/lib/hoja-dia/acciones";
import { createAdminClient } from "@/lib/supabase/admin";
import { mapAusencia } from "@/lib/hoja-dia/servicio";
import { conPermiso, fallo, fechaValida, invalidoZod, sesion } from "../_comun";

// GET /api/hoja-dia/ausencias?desde=YYYY-MM-DD — las vigentes y las próximas, de todo el
// personal (el panel "Ausencias"). Las ART "según la asistencia" vienen con el día
// (GET /api/hoja-dia), porque salen de Odoo.
//
// POST /api/hoja-dia/ausencias { accion, … } — crear (saca a la persona de las hojas de
// esos días, de hoy en adelante), editar, "Ya tiene el alta" (no borra el pasado), anular.
// También para RRHH desde Personal (§14).

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const guardia = await conPermiso(["hoja-dia", "personal"], "ver");
  if (guardia instanceof NextResponse) return guardia;
  const desde = req.nextUrl.searchParams.get("desde");
  if (!fechaValida(desde)) return NextResponse.json({ error: "Falta desde (YYYY-MM-DD)" }, { status: 400 });
  const r = await createAdminClient().from("hd_ausencias").select("*").is("anulada_at", null).or(`hasta.is.null,hasta.gte.${desde}`).order("desde");
  if (r.error) return fallo(new Error(r.error.message));
  return NextResponse.json({ ausencias: (r.data ?? []).map(mapAusencia) });
}

export async function POST(req: NextRequest) {
  const guardia = await conPermiso(["hoja-dia", "personal"], "editar");
  if (guardia instanceof NextResponse) return guardia;
  const body = await req.json().catch(() => null);
  const parsed = accionAusenciaSchema.safeParse(body);
  if (!parsed.success) return invalidoZod(parsed.error);
  const vista = typeof body?.fechaVista === "string" && fechaValida(body.fechaVista) ? body.fechaVista : undefined;
  try {
    return NextResponse.json(await accionAusencia(await sesion(), guardia.userId, parsed.data, vista));
  } catch (e) {
    return fallo(e);
  }
}
