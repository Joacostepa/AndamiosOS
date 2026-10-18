import { NextRequest, NextResponse } from "next/server";
import { exigirPermisoDeApi } from "@/lib/auth/servidor";
import { createClient } from "@/lib/supabase/server";
import { cuerpoInvalido, pedidoUsoSchema, respuestaDeError, usarGuardias } from "@/lib/planificacion/guardias";
import type { PedidoUsoGuardia } from "@/lib/tablero/guardias-tipos";

// POST /api/planificacion/guardias/usar — PedidoUsoGuardia → RespuestaUsoGuardia.
//
// LA ÚNICA RUTA QUE REEMPLAZA UNA GUARDIA. Una obra (soltada desde la bandeja, un bloque
// movido, un apoyo, un comodín que se MUEVE) cae sobre una o más guardias activas: se valida
// el candado en el servidor con la OT recién leída de Odoo y, si se puede, se escribe TODO en
// un lote —las jornadas en Odoo, las guardias "usada" o "rellenada", la historia y el
// movimiento del tablero— que el tablero deshace entero con /guardias/deshacer.
//
// Si el candado no deja: 409 RechazoCandado (`codigo: "guardia"` y `pide`), y el tablero
// ofrece "Pedir autorización a JS". Si algo cambió en el medio: 409 con el motivo. Si Odoo
// falla a mitad: 502 y el tablero relee (la guardia sigue activa).
//
// Con `solicitudId`: una autorización de JS que quedó aprobada pero no se pudo ejecutar sola.
// Paso a paso en guardias-plan-tecnico.md §3.

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const quien = await exigirPermisoDeApi(req);
  if (quien instanceof NextResponse) return quien;

  const parsed = pedidoUsoSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return cuerpoInvalido(parsed.error.issues);

  try {
    const respuesta = await usarGuardias(
      { db: await createClient(), userId: quien.userId },
      parsed.data as PedidoUsoGuardia,
    );
    return NextResponse.json(respuesta);
  } catch (e) {
    return respuestaDeError(e, "no se pudo usar la guardia");
  }
}
