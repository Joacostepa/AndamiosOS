import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { nivelEn } from "@/lib/auth/acceso";
import { exigirPermisoDeApi } from "@/lib/auth/servidor";
import { createClient } from "@/lib/supabase/server";
import { cuerpoInvalido, motivoSchema, respuestaDeError, sacarGuardia } from "@/lib/planificacion/guardias";

// POST /api/planificacion/guardias/sacar — SacarGuardia → { ok: true }. SÓLO JS.
//
// Quién es "JS" lo decide el mapa APIS de acceso.ts: esta ruta pide el módulo explícito
// `planificacion-autoriza`, que ningún admin trae solo. exigirPermisoDeApi aplica la misma
// regla que el proxy (segunda llave). La guardia queda "sacada" con el motivo: no se ve en la
// grilla, queda en la historia y su semana no se repone. Planificación, en cambio, PIDE
// sacarla (POST /guardias/solicitudes con tipo "sacar").

export const dynamic = "force-dynamic";

const cuerpo = z.object({ guardiaId: z.number().int().positive(), motivo: motivoSchema });

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
    await sacarGuardia({ db: await createClient(), userId: quien.userId }, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return respuestaDeError(e, "no se pudo sacar la guardia");
  }
}
