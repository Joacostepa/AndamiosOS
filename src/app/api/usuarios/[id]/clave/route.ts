import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { claveTemporal, exigirAdmin } from "@/lib/auth/servidor";

// POST /api/usuarios/:id/clave — le genera una contraseña temporal nueva.
//
// Es el "me olvidé la contraseña" mientras no haya mails: el admin la resetea, se la pasa,
// y al entrar la persona tiene que elegir una propia.

export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guardia = await exigirAdmin();
  if (guardia instanceof NextResponse) return guardia;

  const { id } = await ctx.params;
  const admin = createAdminClient();
  const clave = claveTemporal();

  const { error } = await admin.auth.admin.updateUserById(id, { password: clave });
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });

  const { error: errPerfil } = await admin
    .from("user_profiles")
    .update({ debe_cambiar_clave: true, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (errPerfil) return NextResponse.json({ error: errPerfil.message }, { status: 500 });

  return NextResponse.json({ clave });
}
