import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { claveTemporal, datosUsuarioSchema, exigirAdmin, invalido } from "@/lib/auth/servidor";
import { normalizarPermisos } from "@/lib/auth/acceso";

// GET  /api/usuarios — todas las cuentas, con su perfil y su último ingreso.
// POST /api/usuarios — alta con contraseña temporal.
//
// Van con service role porque tocan auth.users (crear cuentas, leer el último ingreso) y
// las columnas rol/permisos/activo, que desde 20260826000001 nadie puede escribirse desde
// el navegador. Por eso lo primero de cada handler es exigirAdmin().

export const dynamic = "force-dynamic";

export async function GET() {
  const guardia = await exigirAdmin();
  if (guardia instanceof NextResponse) return guardia;

  const admin = createAdminClient();
  const [perfiles, cuentas] = await Promise.all([
    admin
      .from("user_profiles")
      .select("id, email, nombre, apellido, telefono, rol, activo, permisos, debe_cambiar_clave"),
    admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ]);
  if (perfiles.error) return NextResponse.json({ error: perfiles.error.message }, { status: 500 });
  if (cuentas.error) return NextResponse.json({ error: cuentas.error.message }, { status: 502 });

  // Se parte de auth.users y no de los perfiles: una cuenta SIN perfil es justo la que hay
  // que ver —alguien que se registró solo, o un alta que quedó a medias—.
  const porId = new Map(perfiles.data.map((p) => [p.id as string, p]));
  const usuarios = cuentas.data.users.map((u) => {
    const p = porId.get(u.id);
    return {
      id: u.id,
      email: p?.email ?? u.email ?? "",
      nombre: p?.nombre ?? "",
      apellido: p?.apellido ?? "",
      telefono: p?.telefono ?? null,
      rol: p?.rol ?? null,
      activo: p?.activo === true,
      permisos: normalizarPermisos(p?.permisos),
      debeCambiarClave: p?.debe_cambiar_clave === true,
      ultimoIngreso: u.last_sign_in_at ?? null,
      alta: u.created_at,
      sinPerfil: !p,
    };
  });

  return NextResponse.json({ usuarios });
}

const altaSchema = datosUsuarioSchema.extend({
  email: z.string().trim().toLowerCase().pipe(z.email("El mail no es válido")),
});

export async function POST(req: NextRequest) {
  const guardia = await exigirAdmin();
  if (guardia instanceof NextResponse) return guardia;

  const parsed = altaSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalido(parsed.error);
  const { email, ...datos } = parsed.data;

  const admin = createAdminClient();
  const clave = claveTemporal();
  // email_confirm: sin esto la cuenta queda pendiente de confirmar y NO puede entrar.
  const { data: cuenta, error } = await admin.auth.admin.createUser({ email, password: clave, email_confirm: true });
  if (error) {
    const yaExiste = error.code === "email_exists" || /already been registered/i.test(error.message);
    return NextResponse.json(
      { error: yaExiste ? "Ya existe una cuenta con ese mail." : error.message },
      { status: yaExiste ? 409 : 502 },
    );
  }

  const { error: errPerfil } = await admin
    .from("user_profiles")
    .upsert(
      { id: cuenta.user.id, email, ...datos, activo: true, debe_cambiar_clave: true },
      { onConflict: "id" },
    );
  if (errPerfil) {
    // Una cuenta sin perfil no puede entrar y bloquea el mail para un segundo intento:
    // mejor deshacerla que dejarla a medias.
    await admin.auth.admin.deleteUser(cuenta.user.id);
    return NextResponse.json({ error: `No se pudo crear el perfil: ${errPerfil.message}` }, { status: 500 });
  }

  return NextResponse.json({ id: cuenta.user.id, clave });
}
