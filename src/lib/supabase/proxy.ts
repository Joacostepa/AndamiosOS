import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { accesoDeFila, inicioDe, motivoDeRechazoApi, puedeAbrir } from "@/lib/auth/acceso";

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

  const { pathname } = request.nextUrl;
  const esApi = pathname.startsWith("/api/");

  // REGLA DE NEGOCIO: Rutas públicas sin autenticación:
  // /login (acceso), /auth (callback OAuth). Todo lo demás requiere sesión activa.
  // /api/odoo/sync y /api/odoo/webhooks: server-to-server (sin sesión), protegidos por secret.
  // /api/informes-obra/generar: el cron diario de Vercel, que tampoco trae cookies.
  //   Va acá y no la rama /api/informes-obra entera: las rutas de LECTURA del módulo sí
  //   requieren sesión. Este endpoint se protege con CRON_SECRET (ver su _comun.ts), que
  //   falla cerrado si la variable no está configurada.
  // /api/alertas/barrido: el otro cron. Mismo caso y misma protección — y va la ruta
  //   completa, no "/api/alertas": la campanita lee esa rama CON sesión, y abrirla entera
  //   dejaría las alertas de todos accesibles sin login.
  // /api/permisos-via-publica/latido: el cron que avisa si el robot de TAD dejó de dar
  //   señales. Otra vez la ruta completa: la bandeja de permisos cuelga de esa misma rama y
  //   se lee con sesión. También lo protege CRON_SECRET.
  // /cotizador y /api/public: cotizador hogareño para clientes finales (sin cuenta).
  // /endosos: portal del productor de seguros (Segucom) para subir pólizas. Lo protege el
  //   token de la URL, que valida /api/public/endosos; la página sola no muestra nada.
  // /permiso/: portal del cliente para su legajo, protegido por el token de la URL. CON la
  //   barra final a propósito: la comparación es por prefijo y "/permiso" sin barra dejaría
  //   pública también la pantalla interna /permisos-via-publica.
  // /api/comercial/asistente/voz/llm: el "cerebro" del agente de voz; lo llama ElevenLabs
  //   (sin cookie). Lo protegen el secreto del agente y el token firmado de la sesión de voz.
  const publicPaths = [
    "/api/comercial/asistente/voz/llm",
    "/api/whatsapp/webhook",
    "/endosos",
    "/permiso/",
    "/login",
    "/auth",
    "/api/odoo/sync",
    "/api/odoo/webhooks",
    "/api/informes-obra/generar",
    "/api/alertas/barrido",
    "/api/permisos-via-publica/latido",
    "/cotizador",
    "/api/public",
  ];
  const isPublicPath = publicPaths.some((path) => pathname.startsWith(path));

  // Rutas que solo tienen sentido sin sesión (login/auth).
  const authOnlyPaths = ["/login", "/auth"];
  const isAuthOnlyPath = authOnlyPaths.some((p) => pathname.startsWith(p));

  // Una ruta pública (que no sea el login) no mira la sesión: el cotizador y los webhooks
  // no tienen por qué pagar dos viajes a Supabase.
  if (isPublicPath && !isAuthOnlyPath) return supabaseResponse;

  // Los permisos se leen EN PARALELO con getUser(): mi_acceso() saca al usuario de
  // auth.uid() y no necesita su id. Leerlos después sumaba un viaje por request, y esto
  // corre en cada llamada a la API.
  const accesoPedido = supabase.rpc("mi_acceso").maybeSingle();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const acceso = user ? accesoDeFila((await accesoPedido).data) : null;

  // Las respuestas que no son NextResponse.next() tienen que llevarse las cookies que
  // getUser() pudo haber renovado, o la sesión se pierde en el rebote.
  function conCookies<T extends NextResponse>(respuesta: T): T {
    supabaseResponse.cookies.getAll().forEach((c) => respuesta.cookies.set(c));
    return respuesta;
  }
  function redirigir(destino: string, motivo?: string) {
    const url = request.nextUrl.clone();
    url.pathname = destino;
    url.search = motivo ? `?motivo=${motivo}` : "";
    return conCookies(NextResponse.redirect(url));
  }
  function rechazar(status: number, error: string) {
    return conCookies(NextResponse.json({ error }, { status }));
  }

  // DECISIÓN: Sin usuario + ruta privada → /login. Las APIs contestan 401 en JSON: un
  // redirect a una página HTML en medio de un fetch termina en "Unexpected token <".
  if (!user) {
    if (isPublicPath) return supabaseResponse;
    return esApi ? rechazar(401, "Tu sesión venció: volvé a iniciar sesión.") : redirigir("/login");
  }

  // Desactivado, o con cuenta pero sin perfil (alguien que se registró solo): afuera. Se
  // cierra la sesión acá mismo para que el login no lo devuelva a la app en un bucle.
  if (!acceso?.activo) {
    await supabase.auth.signOut({ scope: "local" });
    if (esApi) return rechazar(403, "Tu usuario está desactivado o no tiene acceso.");
    if (isAuthOnlyPath) return supabaseResponse;
    return redirigir("/login", "desactivado");
  }

  // Con usuario + ruta auth-only → su pantalla de arranque.
  if (isAuthOnlyPath) {
    return redirigir(acceso.debeCambiarClave ? "/cambiar-clave" : inicioDe(acceso));
  }

  // Contraseña temporal: hasta que elija la suya, sólo esa pantalla y la API que la guarda.
  if (pathname === "/cambiar-clave" || pathname.startsWith("/api/cuenta/")) return supabaseResponse;
  if (acceso.debeCambiarClave) {
    return esApi
      ? rechazar(403, "Antes de seguir tenés que cambiar tu contraseña temporal.")
      : redirigir("/cambiar-clave");
  }

  if (esApi) {
    const motivo = motivoDeRechazoApi(acceso, pathname, request.method);
    return motivo ? rechazar(403, motivo) : supabaseResponse;
  }

  // Pedir una página que no le toca no es un error: se lo lleva a su pantalla de arranque.
  // El menú ya no la muestra, así que llegar acá es escribir la URL a mano o volver sobre
  // un enlace viejo.
  if (!puedeAbrir(acceso, pathname)) return redirigir(inicioDe(acceso));

  return supabaseResponse;
}
