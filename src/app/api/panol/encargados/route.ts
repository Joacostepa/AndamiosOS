import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { exigirAdmin, invalido } from "@/lib/auth/servidor";

// POST /api/panol/encargados — vincula (o desvincula) el legajo de un usuario.
//
// POR QUÉ UNA RUTA Y NO UN UPDATE DESDE EL NAVEGADOR: `personal` lo editan admin y
// operativo POR ROL (20260330000002_rls_policies.sql), no quien tiene el pañol en
// "editar". Y vincular un legajo no es un dato más de la ficha: es lo que hace que esa
// persona, identificada en el kiosco, firme como encargado. Por eso lo hace un admin, con
// la service role y la segunda llave de exigirAdmin().
//
// `personal.user_id` es UNIQUE: antes de vincular se suelta el legajo que el usuario
// tuviera, así cambiar de legajo es un solo clic y no un error de clave duplicada.

export const dynamic = "force-dynamic";

const cuerpoSchema = z.object({
  userId: z.string().uuid(),
  personalId: z.string().uuid().nullable(),
});

export async function POST(req: NextRequest) {
  const guardia = await exigirAdmin();
  if (guardia instanceof NextResponse) return guardia;

  const parsed = cuerpoSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalido(parsed.error);
  const { userId, personalId } = parsed.data;

  const admin = createAdminClient();
  const perfil = await admin.from("user_profiles").select("id").eq("id", userId).maybeSingle();
  if (perfil.error) return NextResponse.json({ error: perfil.error.message }, { status: 500 });
  if (!perfil.data) return NextResponse.json({ error: "Ese usuario no existe." }, { status: 404 });

  if (personalId) {
    const legajo = await admin.from("personal").select("id, user_id, nombre, apellido").eq("id", personalId).maybeSingle();
    if (legajo.error) return NextResponse.json({ error: legajo.error.message }, { status: 500 });
    if (!legajo.data) return NextResponse.json({ error: "Ese legajo no existe." }, { status: 404 });
    if (legajo.data.user_id && legajo.data.user_id !== userId) {
      return NextResponse.json(
        { error: `El legajo de ${legajo.data.nombre} ${legajo.data.apellido} ya está vinculado a otro usuario.` },
        { status: 409 },
      );
    }
  }

  const soltar = await admin.from("personal").update({ user_id: null }).eq("user_id", userId);
  if (soltar.error) return NextResponse.json({ error: soltar.error.message }, { status: 500 });

  if (personalId) {
    const vincular = await admin.from("personal").update({ user_id: userId }).eq("id", personalId);
    if (vincular.error) return NextResponse.json({ error: vincular.error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
