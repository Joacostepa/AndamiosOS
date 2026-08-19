import { NextResponse } from "next/server";
import { reconciliar } from "@/lib/habilitaciones/servicio";
import { errorResponse, sesion } from "../_comun";

// POST /api/habilitaciones/reconciliar — la red de seguridad del push a Odoo.
//
// Recalcula los inputs de todas las OTs que quedaron `pendiente` o `error` y repara
// Odoo. Es idempotente: derivarInputs sale de las fechas de los propios requisitos y no
// de `hoy`, así que correrlo dos veces da lo mismo.
//
// Es la red REAL, más que el reintento: un 429, un timeout o un deploy en el medio dejan
// la fila marcada y esto la levanta. Se dispara desde el contador de desincronizadas de
// la bandeja, y puede colgarse de un cron cuando haga falta.

export const dynamic = "force-dynamic";
// Puede recorrer hasta 200 OTs a ~800 ms de RPC cada una.
export const maxDuration = 300;

export async function POST() {
  try {
    const { db } = await sesion();
    return NextResponse.json(await reconciliar(db));
  } catch (e) {
    return errorResponse(e);
  }
}
