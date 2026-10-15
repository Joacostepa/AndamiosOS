// Lo que comparten las rutas de /api/direccion. Contrato: docs/direccion/implementacion.md.
//
// · Las lecturas devuelven RespuestaPantalla (src/lib/direccion/tipos.ts).
// · Las escrituras van a Supabase CON la sesión del usuario (la RLS decide), nunca a Odoo.
//   Si la tabla todavía no existe (migración sin aplicar), contestan 503 con un mensaje amable.
// · El proxy ya filtró por módulo (acceso.ts → APIS); acá se repite (permisos-servidor.ts).

import { NextResponse, type NextRequest } from "next/server";
import type { z } from "zod";
import { exigirDireccionApi, exigirSociosApi, type SesionDireccion } from "@/lib/direccion/permisos-servidor";
import { obtenerPantalla } from "@/lib/direccion/servidor";
import { esSinPermiso, esTablaFaltante, MENSAJE_TABLA_FALTANTE } from "@/lib/direccion/supabase";
import { EscrituraProhibidaError, motivoPublico, OdooError } from "@/lib/direccion/odoo-lectura";
import type { PantallaId } from "@/lib/direccion/tipos";
import { paramsDe } from "@/lib/direccion/params";

/** GET de una pantalla: permisos, cálculo cacheado, recorte de lo reservado. */
export async function respuestaPantalla(p: PantallaId, req: NextRequest): Promise<NextResponse> {
  const s = p === "socios" ? await exigirSociosApi() : await exigirDireccionApi();
  if (s instanceof NextResponse) return s;
  try {
    const r = await obtenerPantalla(p, { conSocios: s.conSocios, params: paramsDe(p, req.nextUrl.searchParams) });
    return NextResponse.json(r);
  } catch (e) {
    return fallo(e);
  }
}

/** Un error en palabras. Odoo caído es 502; un intento de escribir en Odoo, 500 (es un bug). */
export function fallo(e: unknown): NextResponse {
  if (e instanceof EscrituraProhibidaError) {
    console.error("[direccion] intento de escritura en Odoo:", e.metodo);
    return NextResponse.json({ error: "Dirección sólo lee Odoo." }, { status: 500 });
  }
  // El detalle de Odoo (URL del servidor, error crudo) queda en el log, no viaja al navegador.
  if (e instanceof OdooError) {
    console.error("[direccion] Odoo:", e.message);
    return NextResponse.json({ error: `No pudimos leer Odoo. ${motivoPublico(e)}` }, { status: 502 });
  }
  console.error("[direccion]", e);
  return NextResponse.json({ error: "No se pudo completar el pedido." }, { status: 500 });
}

/** Respuesta para un error de Supabase al escribir: tabla faltante (503 amable), RLS (403) u otro. */
export function falloEscritura(error: { code?: string | null; message?: string | null }): NextResponse {
  if (esTablaFaltante(error)) return NextResponse.json({ error: MENSAJE_TABLA_FALTANTE, sinTabla: true }, { status: 503 });
  if (esSinPermiso(error)) return NextResponse.json({ error: "No tenés permiso para guardar esto." }, { status: 403 });
  console.error("[direccion] escritura:", error.message);
  return NextResponse.json({ error: "No se pudo guardar. Probá de nuevo." }, { status: 500 });
}

export function invalido(e: z.ZodError): NextResponse {
  return NextResponse.json({ error: e.issues.map((i) => i.message).join(" · ") }, { status: 400 });
}

/** Lee y valida el body JSON. */
export async function leerBody<T>(req: NextRequest, esquema: z.ZodType<T>): Promise<T | NextResponse> {
  let crudo: unknown;
  try {
    crudo = await req.json();
  } catch {
    return NextResponse.json({ error: "El pedido no es JSON." }, { status: 400 });
  }
  const r = esquema.safeParse(crudo);
  return r.success ? r.data : invalido(r.error);
}

export type { SesionDireccion };
