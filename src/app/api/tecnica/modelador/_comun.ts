// Lo que comparten las rutas de /api/tecnica/modelador: la segunda llave de permisos y las respuestas.
//
// El proxy ya filtró por APIS (src/lib/auth/acceso.ts: "/api/tecnica/modelador" → modelador). Esto lo
// repite en la ruta, y además las escrituras del cómputo piden Cómputos en «editar». Las queries van con
// la sesión del usuario: la RLS (tec_puede_* / computos_puede_editar) es la tercera llave.

import { NextResponse } from "next/server";
import type { z } from "zod";
import { exigirModulo } from "@/lib/auth/servidor";
import type { Nivel } from "@/lib/auth/acceso";
import { createClient } from "@/lib/supabase/server";
import { ErrorModelador } from "@/lib/tecnica/persistencia/servidor";
import { mensajeZod } from "@/lib/tecnica/persistencia/validar";

export async function guardia(nivel: Nivel, opciones: { computos?: boolean } = {}) {
  const s = await exigirModulo(["modelador"], nivel);
  if (s instanceof NextResponse) return s;
  if (opciones.computos) {
    const c = await exigirModulo(["computos"], "editar");
    if (c instanceof NextResponse) {
      return NextResponse.json({ error: "Para generar el cómputo hace falta tener Cómputos en «editar»." }, { status: 403 });
    }
  }
  return s;
}

export const sesion = () => createClient();

export function invalido(e: z.ZodError) {
  return NextResponse.json({ error: mensajeZod(e) }, { status: 400 });
}

export const sinCache = { "Cache-Control": "no-store" };

/** Los 5xx nunca devuelven el texto crudo de Postgres/PostgREST (tablas, constraints): se loguea acá. */
export function fallo(e: unknown) {
  if (e instanceof ErrorModelador && e.status < 500) {
    return NextResponse.json({ error: e.message, ...(e.extra ?? {}) }, { status: e.status });
  }
  if (e instanceof ErrorModelador && e.status === 503) {
    console.error("[modelador]", e.message);
    return NextResponse.json({ error: e.message }, { status: 503 });
  }
  console.error("[modelador]", e instanceof Error ? e.message : String(e));
  return NextResponse.json({ error: "Algo falló en el modelador. Probá de nuevo; si sigue, avisale a sistemas." }, { status: 500 });
}

/** El body como JSON, o null si no lo es. */
export async function leerJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

export const idValido = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

export function idInvalido() {
  return NextResponse.json({ error: "Modelo inválido" }, { status: 400 });
}
