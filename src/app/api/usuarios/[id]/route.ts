import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { datosUsuarioSchema, exigirAdmin, invalido } from "@/lib/auth/servidor";

// PATCH /api/usuarios/:id — datos, perfil, módulos, y activar/desactivar.
//
// DESACTIVAR corta el acceso en dos lugares: `activo = false`, que el proxy mira en cada
// request, y un ban en Supabase Auth, que impide renovar la sesión y volver a iniciarla.
// Uno solo no alcanza: sin el ban la cuenta sigue pudiendo pedir tokens; sin `activo`, un
// token ya emitido sigue sirviendo hasta que vence.

export const dynamic = "force-dynamic";

const cambiosSchema = datosUsuarioSchema.partial().extend({ activo: z.boolean().optional() });

// "Para siempre" en la API de Supabase es una duración: cien años.
const BAN_INDEFINIDO = "876000h";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guardia = await exigirAdmin();
  if (guardia instanceof NextResponse) return guardia;

  const { id } = await ctx.params;
  const parsed = cambiosSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalido(parsed.error);
  const cambios = parsed.data;

  // Sin esto, el único admin podría dejar la app sin nadie que administre usuarios.
  if (id === guardia.userId && ((cambios.rol && cambios.rol !== "admin") || cambios.activo === false)) {
    return NextResponse.json(
      { error: "No podés quitarte a vos mismo el acceso de administrador: pedíselo a otro admin." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const { data: perfil, error: errLectura } = await admin
    .from("user_profiles")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (errLectura) return NextResponse.json({ error: errLectura.message }, { status: 500 });

  if (perfil) {
    const { error } = await admin
      .from("user_profiles")
      .update({ ...cambios, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    // Cuenta sin perfil: darle acceso es crearle el perfil.
    const { data: cuenta, error: errCuenta } = await admin.auth.admin.getUserById(id);
    if (errCuenta || !cuenta.user) return NextResponse.json({ error: "No existe ese usuario." }, { status: 404 });
    const { error } = await admin.from("user_profiles").insert({
      id,
      email: cuenta.user.email,
      nombre: cambios.nombre ?? "",
      apellido: cambios.apellido ?? "",
      telefono: cambios.telefono ?? null,
      rol: cambios.rol ?? "campo",
      permisos: cambios.permisos ?? {},
      activo: cambios.activo ?? true,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (cambios.activo !== undefined) {
    const { error } = await admin.auth.admin.updateUserById(id, {
      ban_duration: cambios.activo ? "none" : BAN_INDEFINIDO,
    });
    if (error) {
      return NextResponse.json(
        { error: `El perfil se guardó, pero no se pudo ${cambios.activo ? "desbloquear" : "bloquear"} la cuenta: ${error.message}` },
        { status: 502 },
      );
    }
  }

  return NextResponse.json({ ok: true });
}
