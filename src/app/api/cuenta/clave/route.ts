import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { invalido } from "@/lib/auth/servidor";

// POST /api/cuenta/clave — quien está logueado cambia SU contraseña.
//
// La contraseña se cambia con la sesión del usuario, no con la service role: así sólo se
// puede cambiar la propia. La service role entra sólo para bajar `debe_cambiar_clave`,
// que es una columna que el usuario no puede escribirse (si pudiera, se saltearía el
// cambio obligatorio con una línea en la consola).

export const dynamic = "force-dynamic";

const schema = z.object({
  clave: z.string().min(8, "La contraseña tiene que tener al menos 8 caracteres").max(72),
});

export async function POST(req: NextRequest) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalido(parsed.error);

  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Tu sesión venció: volvé a iniciar sesión." }, { status: 401 });

  const { error } = await db.auth.updateUser({ password: parsed.data.clave });
  if (error) {
    const mensaje =
      error.code === "same_password"
        ? "Tiene que ser distinta de la contraseña anterior."
        : error.code === "weak_password"
          ? "Esa contraseña es muy débil: probá con una más larga."
          : error.message;
    return NextResponse.json({ error: mensaje }, { status: 400 });
  }

  const { error: errPerfil } = await createAdminClient()
    .from("user_profiles")
    .update({ debe_cambiar_clave: false, updated_at: new Date().toISOString() })
    .eq("id", user.id);
  if (errPerfil) return NextResponse.json({ error: errPerfil.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
