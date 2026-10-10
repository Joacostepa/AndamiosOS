import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { guardarDescarte } from "@/lib/permisos-via-publica/config";

// PUT /api/permisos-via-publica/config/descartes — lo que la oficina decide dejar de seguir:
//   { tipo: "ventas", id: "2348", motivo: "Se tramita por fuera" }       saca la venta de "Ventas para iniciar"
//   { tipo: "expedientes", id: "<uuid>", motivo: "Ya lo miré en TAD" }   pasa el expediente a archivados
//   motivo: null lo vuelve a la lista.
// El proxy exige "editar". Escribe con service role (pvp_config sólo es legible para usuarios).

export const dynamic = "force-dynamic";

const schema = z.object({
  tipo: z.enum(["ventas", "expedientes"]),
  id: z.string().trim().min(1).max(60),
  motivo: z.string().trim().min(2).max(300).nullable(),
});

export async function PUT(req: NextRequest) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Falta el motivo" }, { status: 400 });
  const { data: auth } = await (await createClient()).auth.getUser();
  try {
    const { tipo, id, motivo } = parsed.data;
    return NextResponse.json(await guardarDescarte(createAdminClient(), tipo, id, motivo, auth.user?.email ?? null));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
