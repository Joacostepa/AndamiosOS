import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { nivelEn } from "@/lib/auth/acceso";
import { exigirPermisoDeApi } from "@/lib/auth/servidor";
import { createClient } from "@/lib/supabase/server";
import { cuerpoInvalido, responderSolicitud, respuestaDeError } from "@/lib/planificacion/guardias";

// POST /api/planificacion/guardias/autorizar — RespuestaSolicitud → ResultadoAutorizacion.
// SÓLO JS (módulo explícito `planificacion-autoriza`, ver APIS en acceso.ts).
//
// Rechazar: no pasa nada en la grilla y quien pidió se entera. Aprobar: lo pedido SE EJECUTA
// en el momento, con la sesión de JS (sacar la guardia, o usarla con el pedido guardado). Si
// la grilla cambió desde que se pidió y no se puede ejecutar solo, el pedido queda aprobado y
// HABILITADO (`ejecutada: false`, `solicitud.errorEjecucion` dice por qué) y quien pidió lo
// usa después soltando la obra de nuevo: el tablero manda el `solicitudId`.

export const dynamic = "force-dynamic";
// Aprobar puede escribir en Odoo (crear o mover las jornadas de la obra).
export const maxDuration = 60;

const cuerpo = z.object({
  solicitudId: z.string().uuid("el pedido no es válido"),
  aprobar: z.boolean(),
  respuesta: z.string().trim().max(300, "La respuesta va en una línea (300 caracteres como mucho)").nullable().optional(),
});

export async function POST(req: NextRequest) {
  const quien = await exigirPermisoDeApi(req);
  if (quien instanceof NextResponse) return quien;
  // Tercera llave, a propósito redundante: el mapa APIS decide por el pathname, y "sólo JS"
  // no puede depender de cómo Next normalice una ruta (una barra de más, mayúsculas).
  if (nivelEn(quien.acceso, "planificacion-autoriza") !== "editar") {
    return NextResponse.json({ error: "Sólo JS puede hacer esto." }, { status: 403 });
  }

  const parsed = cuerpo.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return cuerpoInvalido(parsed.error.issues);

  try {
    return NextResponse.json(await responderSolicitud({ db: await createClient(), userId: quien.userId }, parsed.data));
  } catch (e) {
    return respuestaDeError(e, "no se pudo responder el pedido");
  }
}
