import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { exigirDireccionApi } from "@/lib/direccion/permisos-servidor";
import { DUENOS } from "@/lib/direccion/propios";
import { registrarAuditoria } from "@/lib/direccion/auditoria";
import { marcaDecision } from "@/lib/direccion/propios-servidor";
import { reservaDeDueno } from "@/lib/direccion/calculo/decisiones";
import { falloEscritura, leerBody } from "../_comun";

// POST /api/direccion/dueno — asigna (o saca, con null) el dueño de una decisión. Supabase
// (direccion_duenos), nunca Odoo. Pide "editar". Queda en la auditoría. El dueño es uno de
// los de la lista (socios + gerencia: Jorge, Gabriel, Joaquín, Juan Pablo).

const esquema = z.object({
  alertaId: z.string().trim().min(1).max(80),
  dueno: z.enum(DUENOS, { message: "El dueño tiene que ser Jorge, Gabriel, Joaquín o Juan Pablo." }).nullable(),
});

export async function POST(req: NextRequest) {
  const s = await exigirDireccionApi("editar");
  if (s instanceof NextResponse) return s;
  const body = await leerBody(req, esquema);
  if (body instanceof NextResponse) return body;
  // La decisión tiene que existir, y si es de socios, sólo la toca un socio (y queda reservada).
  const reserva = reservaDeDueno(await marcaDecision(body.alertaId), s.conSocios);
  if (!reserva.ok) return NextResponse.json({ error: reserva.error }, { status: reserva.status });
  const db = await createClient();
  const { error } = await db
    .from("direccion_duenos")
    .upsert({ alerta_id: body.alertaId, dueno: body.dueno, reservado: reserva.reservado, autor: s.userId, updated_at: new Date().toISOString() }, { onConflict: "alerta_id" });
  if (error) return falloEscritura(error);
  await registrarAuditoria(s.userId, "dueno", { alertaId: body.alertaId, dueno: body.dueno });
  return NextResponse.json({ ok: true });
}
