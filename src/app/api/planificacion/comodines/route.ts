import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { exigirPermisoDeApi } from "@/lib/auth/servidor";
import { createClient } from "@/lib/supabase/server";
import { OdooError } from "@/lib/odoo/client";
import { leerOts } from "@/lib/odoo/asignaciones";
import { leerMarcas, marcarComodin, quitarComodin } from "@/lib/planificacion/comodines";
import { otMarcable } from "@/lib/tablero/comodines";
import type { MarcaComodin } from "@/lib/tablero/guardias-tipos";

// /api/planificacion/comodines — las marcas de comodín (guardias-contrato.md §2, 18/10).
//
//   GET                  → { marcas: MarcaComodin[] }   (todas, la más vieja primero)
//   POST { otId }        → { ok: true, marca }          marcar (si ya estaba, la deja como estaba)
//   DELETE ?otId=123     → { ok: true, quitada }        quitar (si no estaba, ok igual)
//
// UN COMODÍN ES UNA DECISIÓN DE PLANIFICACIÓN, NO UNA REGLA (JS, 18/10): cualquier OT del
// tablero, de cualquier tipo, pendiente o en proceso. Sin fecha ni vencimiento.
//
// QUIÉN: el mapa APIS de src/lib/auth/acceso.ts cubre esto con "/api/planificacion" →
// planificación; por el método, GET pide "ver" y POST/DELETE piden "editar". El proxy ya lo
// filtró y exigirPermisoDeApi lo repite con la misma función (dos puertas que no pueden
// discrepar). La tercera es la RLS de plan_comodines, porque se escribe con la SESIÓN: aunque
// alguien se saltee las dos primeras, sin "editar" la base no lo deja marcar ni quitar.
//
// NO VA A plan_movimientos: ese registro es de jornadas (su `accion` tiene un CHECK con los
// gestos sobre asignaciones y el panel de actividad y el deshacer cuentan con eso). La marca
// ya dice quién y cuándo en su propia fila; quitar no deja rastro, como sacar una nota.
//
// Las OTs viven en Odoo: al marcar se lee la OT para no guardar una marca sobre una que no
// existe o que ya se cerró. Quitar no lee nada: sacar una marca siempre tiene que poder.

export const dynamic = "force-dynamic";

const cuerpoMarcar = z.object({ otId: z.number().int().positive("otId tiene que ser el número de la OT") });

export async function GET(req: NextRequest) {
  const quien = await exigirPermisoDeApi(req);
  if (quien instanceof NextResponse) return quien;
  try {
    const marcas: MarcaComodin[] = await leerMarcas(await createClient());
    return NextResponse.json({ marcas });
  } catch (e) {
    return error500(e, "no se pudieron leer los comodines");
  }
}

export async function POST(req: NextRequest) {
  const quien = await exigirPermisoDeApi(req);
  if (quien instanceof NextResponse) return quien;

  const parsed = cuerpoMarcar.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues.map((i) => i.message).join(" · ") }, { status: 400 });
  }
  const { otId } = parsed.data;

  try {
    const [ot] = await leerOts([otId]);
    if (!ot) return NextResponse.json({ error: "La OT ya no existe en Odoo." }, { status: 404 });
    if (!otMarcable(ot)) {
      return NextResponse.json(
        { error: "Sólo se puede marcar como comodín una OT pendiente o en proceso." },
        { status: 409 },
      );
    }
    const marca = await marcarComodin(await createClient(), otId);
    return NextResponse.json({ ok: true, marca });
  } catch (e) {
    return error500(e, "no se pudo marcar el comodín");
  }
}

export async function DELETE(req: NextRequest) {
  const quien = await exigirPermisoDeApi(req);
  if (quien instanceof NextResponse) return quien;

  const otId = Number(req.nextUrl.searchParams.get("otId"));
  if (!Number.isInteger(otId) || otId <= 0) {
    return NextResponse.json({ error: "Falta 'otId' (el número de la OT)." }, { status: 400 });
  }
  try {
    const quitada = await quitarComodin(await createClient(), otId);
    return NextResponse.json({ ok: true, quitada });
  } catch (e) {
    return error500(e, "no se pudo quitar el comodín");
  }
}

/** Odoo caído es 502 (como el resto del tablero); lo demás, 500 con el motivo. */
function error500(e: unknown, donde: string): NextResponse {
  const msg = e instanceof Error ? e.message : String(e);
  console.error(`[comodines] ${donde}`, msg);
  if (e instanceof OdooError) return NextResponse.json({ error: msg }, { status: 502 });
  return NextResponse.json({ error: msg }, { status: 500 });
}
