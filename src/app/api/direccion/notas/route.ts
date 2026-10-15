import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { exigirDireccionApi } from "@/lib/direccion/permisos-servidor";
import { DUENOS } from "@/lib/direccion/propios";
import { marcaDecision } from "@/lib/direccion/propios-servidor";
import { reservaDeNota } from "@/lib/direccion/calculo/decisiones";
import { falloEscritura, leerBody } from "../_comun";

// POST /api/direccion/notas — "Anotar" en una decisión de Para decidir (§4.6). Se guarda en
// Supabase (direccion_notas) con autor y fecha. NUNCA escribe en Odoo. Pide "editar".
// `reservado` lo decide el SERVIDOR a partir de la decisión (La semana sin recortar): una
// decisión de socios, o la versión de socios de una decisión (la cobertura con retiros),
// deja la nota reservada. Lo que mande el navegador en `reservado` se ignora.

const esquema = z.object({
  alertaId: z.string().trim().min(1).max(80),
  texto: z.string().trim().min(1, "La nota está vacía").max(2000),
  dueno: z.enum(DUENOS, { message: "El dueño tiene que ser Jorge, Gabriel, Joaquín o Juan Pablo." }).nullable().optional(),
  reunion: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  const s = await exigirDireccionApi("editar");
  if (s instanceof NextResponse) return s;
  const body = await leerBody(req, esquema);
  if (body instanceof NextResponse) return body;
  const reserva = reservaDeNota(await marcaDecision(body.alertaId), s.conSocios);
  if (!reserva.ok) return NextResponse.json({ error: reserva.error }, { status: reserva.status });
  const db = await createClient();
  const { data, error } = await db
    .from("direccion_notas")
    .insert({ alerta_id: body.alertaId, texto: body.texto, dueno: body.dueno ?? null, reunion: !!body.reunion, reservado: reserva.reservado, autor: s.userId })
    .select("id, created_at")
    .single();
  if (error) return falloEscritura(error);
  return NextResponse.json({ ok: true, id: data.id, fecha: data.created_at });
}
