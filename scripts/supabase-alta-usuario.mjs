// Alta (o actualización) de un usuario de AndamiosOS.
//
// Hace las tres cosas que hacen falta para que alguien pueda entrar, que hasta ahora se
// hacían sueltas y por eso quedaban a medias:
//   1. la cuenta en Supabase Auth, con el mail YA CONFIRMADO — sin eso no puede iniciar
//      sesión, que es exactamente lo que le pasó a la cuenta creada el 09/08 y nunca usada;
//   2. la contraseña;
//   3. la fila en user_profiles con su ROL, que es lo que decide qué ve en el menú.
//
// Idempotente: si el mail ya existe, actualiza en vez de fallar.
//
// Correr:
//   node --env-file=.env.local scripts/supabase-alta-usuario.mjs \
//     --email juan@empresa.com --password 123456 --rol operativo --nombre "Juan" --apellido "Perez"
//
// Roles (enum user_role): admin | operativo | deposito | campo. Ver src/lib/auth/roles.ts
// para qué ve cada uno.

import { createClient } from "@supabase/supabase-js";

const arg = (n) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > -1 ? process.argv[i + 1] : null;
};

const email = arg("email");
const password = arg("password");
const rol = arg("rol") ?? "operativo";
const nombre = arg("nombre") ?? email?.split("@")[0] ?? "";
const apellido = arg("apellido") ?? "";

if (!email || !password) {
  console.error("Faltan --email y --password");
  process.exit(1);
}
if (!["admin", "operativo", "deposito", "campo"].includes(rol)) {
  console.error(`Rol inválido: ${rol}`);
  process.exit(1);
}

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// listUsers y no getUserByEmail: la API de admin no expone búsqueda por mail directa.
const { data: lista, error: errLista } = await sb.auth.admin.listUsers({ page: 1, perPage: 200 });
if (errLista) throw new Error(errLista.message);
const existente = lista.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());

let userId;
if (existente) {
  const { data, error } = await sb.auth.admin.updateUserById(existente.id, {
    password,
    email_confirm: true,
  });
  if (error) throw new Error(error.message);
  userId = data.user.id;
  console.log(`· ${email} ya existía: contraseña actualizada y mail confirmado`);
} else {
  const { data, error } = await sb.auth.admin.createUser({
    email,
    password,
    // Sin esto queda pendiente de confirmar y NO puede iniciar sesión.
    email_confirm: true,
  });
  if (error) throw new Error(error.message);
  userId = data.user.id;
  console.log(`✓ ${email} creado`);
}

// El perfil es lo que define el rol. Va con la service role, que es la única que puede
// escribir la columna desde la migración 20260826000001.
const { error: errPerfil } = await sb
  .from("user_profiles")
  .upsert({ id: userId, email, nombre, apellido, rol, activo: true }, { onConflict: "id" });
if (errPerfil) throw new Error(errPerfil.message);
console.log(`✓ perfil: ${nombre} ${apellido} · rol ${rol}`);
