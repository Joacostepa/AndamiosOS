import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // REGLA DE NEGOCIO: Rutas públicas sin autenticación:
  // /login (acceso), /auth (callback OAuth). Todo lo demás requiere sesión activa.
  // /api/odoo/sync y /api/odoo/webhooks: server-to-server (sin sesión), protegidos por secret.
  // /api/informes-obra/generar: el cron diario de Vercel, que tampoco trae cookies.
  //   Va acá y no la rama /api/informes-obra entera: las rutas de LECTURA del módulo sí
  //   requieren sesión. Este endpoint se protege con CRON_SECRET (ver su _comun.ts), que
  //   falla cerrado si la variable no está configurada.
  // /cotizador y /api/public: cotizador hogareño para clientes finales (sin cuenta).
  const publicPaths = [
    "/login",
    "/auth",
    "/api/odoo/sync",
    "/api/odoo/webhooks",
    "/api/informes-obra/generar",
    "/cotizador",
    "/api/public",
  ];
  const isPublicPath = publicPaths.some((path) =>
    request.nextUrl.pathname.startsWith(path)
  );

  // Rutas que solo tienen sentido sin sesión (login/auth).
  const authOnlyPaths = ["/login", "/auth"];
  const isAuthOnlyPath = authOnlyPaths.some((p) =>
    request.nextUrl.pathname.startsWith(p)
  );

  // DECISIÓN: Sin usuario + ruta privada → /login.
  // Con usuario + ruta auth-only → /. Evita que un usuario logueado vea la página de login.
  if (!user && !isPublicPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && isAuthOnlyPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
