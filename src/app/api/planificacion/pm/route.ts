import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { exigirPermisoDeApi } from "@/lib/auth/servidor";
import { nivelEn } from "@/lib/auth/acceso";
import { createClient } from "@/lib/supabase/server";
import { OdooError } from "@/lib/odoo/client";
import { leerOts } from "@/lib/odoo/asignaciones";
import { asignarPm, ErrorPm, leerCandidatos, leerPms, pasarPm, quitarPm } from "@/lib/planificacion/pm";
import { otMarcable } from "@/lib/tablero/comodines";
import { llevaPm } from "@/lib/tablero/pm";

// /api/planificacion/pm — el PM de cada obra (pedido de JS del 19/11/2026).
//
//   GET                          → { pms: PmDeObra[], candidatos: CandidatoPm[] }
//   POST  { otId, pm? }          → { ok, pm }   tomar (sin `pm`: quien llama) o asignar a otro
//   PATCH { otId, pm, de }       → { ok, pm }   pasarla de `de` a `pm`
//   DELETE ?otId=123             → { ok }       soltar o quitar
//
// QUIÉN. El mapa APIS deja pasar a quien tiene Planificación o "PM de obras" (GET con «ver»,
// lo demás con «editar»). Acá se afina —asignar a OTRO pide editar Planificación— y la última
// palabra es la RLS de plan_pm_ot (migración 20261119000001): sólo se asigna a alguien que es
// PM, un PM sólo se toma a sí mismo y sólo suelta o pasa lo suyo.
//
// QUE NO SE PISEN. Tomar una obra que otro tomó un instante antes contesta 409 "Ya la tomó
// Juani": la clave primaria de la tabla lo garantiza aunque los dos toquen a la vez.

export const dynamic = "force-dynamic";

const otId = z.number().int().positive("otId tiene que ser el número de la OT");
const usuario = z.string().uuid("pm tiene que ser un usuario");
const cuerpoTomar = z.object({ otId, pm: usuario.optional() });
const cuerpoPasar = z.object({ otId, pm: usuario, de: usuario });

export async function GET(req: NextRequest) {
  const quien = await exigirPermisoDeApi(req);
  if (quien instanceof NextResponse) return quien;
  try {
    const db = await createClient();
    const [pms, candidatos] = await Promise.all([leerPms(db), leerCandidatos(db)]);
    return NextResponse.json({ pms, candidatos });
  } catch (e) {
    return error(e, "no se pudieron leer los PMs");
  }
}

export async function POST(req: NextRequest) {
  const quien = await exigirPermisoDeApi(req);
  if (quien instanceof NextResponse) return quien;
  const parsed = cuerpoTomar.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalido(parsed.error);
  const pm = parsed.data.pm ?? quien.userId;

  if (pm !== quien.userId && nivelEn(quien.acceso, "planificacion") !== "editar") {
    return NextResponse.json({ error: "Sólo Operaciones puede asignarle una obra a otra persona." }, { status: 403 });
  }
  try {
    const rechazo = await validarOt(parsed.data.otId);
    if (rechazo) return rechazo;
    const fila = await asignarPm(await createClient(), parsed.data.otId, pm);
    return NextResponse.json({ ok: true, pm: fila });
  } catch (e) {
    return error(e, "no se pudo asignar el PM");
  }
}

export async function PATCH(req: NextRequest) {
  const quien = await exigirPermisoDeApi(req);
  if (quien instanceof NextResponse) return quien;
  const parsed = cuerpoPasar.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalido(parsed.error);
  const { otId: id, pm, de } = parsed.data;

  if (de !== quien.userId && nivelEn(quien.acceso, "planificacion") !== "editar") {
    return NextResponse.json({ error: "Sólo el PM de la obra u Operaciones la pueden pasar." }, { status: 403 });
  }
  try {
    const rechazo = await validarOt(id);
    if (rechazo) return rechazo;
    const fila = await pasarPm(await createClient(), id, pm, de);
    return NextResponse.json({ ok: true, pm: fila });
  } catch (e) {
    return error(e, "no se pudo pasar el PM");
  }
}

export async function DELETE(req: NextRequest) {
  const quien = await exigirPermisoDeApi(req);
  if (quien instanceof NextResponse) return quien;
  const id = Number(req.nextUrl.searchParams.get("otId"));
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Falta 'otId' (el número de la OT)." }, { status: 400 });
  }
  try {
    await quitarPm(await createClient(), id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return error(e, "no se pudo quitar el PM");
  }
}

/** La OT tiene que existir, estar viva y no ser un desarme. */
async function validarOt(id: number): Promise<NextResponse | null> {
  const [ot] = await leerOts([id]);
  if (!ot) return NextResponse.json({ error: "La OT ya no existe en Odoo." }, { status: 404 });
  if (!otMarcable(ot)) {
    return NextResponse.json({ error: "Sólo se le asigna PM a una obra pendiente o en proceso." }, { status: 409 });
  }
  if (!llevaPm(ot.tipo)) {
    return NextResponse.json({ error: "Los desarmes no llevan PM." }, { status: 409 });
  }
  return null;
}

function invalido(e: z.ZodError): NextResponse {
  return NextResponse.json({ error: e.issues.map((i) => i.message).join(" · ") }, { status: 400 });
}

/** Lo de negocio con su status; Odoo caído es 502 (como el resto del tablero); lo demás, 500. */
function error(e: unknown, donde: string): NextResponse {
  if (e instanceof ErrorPm) return NextResponse.json({ error: e.message }, { status: e.status });
  const msg = e instanceof Error ? e.message : String(e);
  console.error(`[pm] ${donde}`, msg);
  if (e instanceof OdooError) return NextResponse.json({ error: msg }, { status: 502 });
  return NextResponse.json({ error: msg }, { status: 500 });
}
