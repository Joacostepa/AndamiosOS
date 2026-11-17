import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (images, etc.)
     * - sw.js y manifest.json (el service worker de las notificaciones y el manifiesto para
     *   instalar la app: se piden sin sesión y el proxy los mandaba al login)
     */
    "/((?!_next/static|_next/image|favicon.ico|sw\\.js$|manifest\\.json$|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
