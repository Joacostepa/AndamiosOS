import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { registrarEvento } from "@/lib/permisos-via-publica/endosos";
import { recordarAlCliente } from "@/lib/permisos-via-publica/portal";
import { quienSoy } from "@/lib/permisos-via-publica/lista";
import { NOMBRE_DOCUMENTO } from "@/lib/permisos-via-publica/tipos";

// POST /api/permisos-via-publica/tramites/:id/reabrir — subsanar papeles del cliente (rediseño
// 09/10). Las tres observaciones del Gobierno a trámites de la app fueron por papeles que arma la
// app y firma el cliente en el portal (acta y nota con el DNI mal, sin firma, incompletas). Esto
// los vuelve a "a corregir" con el motivo del Gobierno: el portal le pide al cliente que los vuelva
// a completar y firmar, y le sale un mail con el detalle. Subirlos a la tarea de TAD sigue siendo a
// mano. El proxy exige "editar".

export const dynamic = "force-dynamic";

const schema = z.object({ claves: z.array(z.string().min(1)).min(1).max(12), motivo: z.string().trim().min(5).max(1000) });

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Id inválido" }, { status: 400 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Elegí los documentos y escribí el motivo" }, { status: 400 });
  const admin = createAdminClient();
  const yo = await quienSoy(await createClient(), admin, []);

  const { data: docs } = await admin.from("pvp_documentos").select("id, clave, revision").eq("tramite_id", id).eq("origen", "cliente").in("clave", parsed.data.claves);
  if (!docs?.length) return NextResponse.json({ error: "Esos documentos no están en el legajo del cliente" }, { status: 400 });

  const ahora = new Date().toISOString();
  const observacion = `El Gobierno pidió corregirlo: ${parsed.data.motivo}`;
  for (const d of docs) {
    const rev = (d.revision ?? { modelo: null, leido: null, chequeos: [] }) as { modelo: string | null; leido: unknown; chequeos: { clave: string }[] };
    const { error } = await admin.from("pvp_documentos").update({
      estado: "observado", observacion, updated_at: ahora,
      revision: { ...rev, chequeos: [...(rev.chequeos ?? []).filter((c) => c.clave !== "observado_gcba"), { clave: "observado_gcba", ok: false, bloquea: true, detalle: observacion }] },
    }).eq("id", d.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const nombres = docs.map((d) => (NOMBRE_DOCUMENTO[d.clave] ?? d.clave).replace(/\s*\(.*\)$/, "")).join(", ");
  await registrarEvento(admin, id, "documento_pedido", `${yo.nombre ?? "La oficina"} le volvió a pedir al cliente: ${nombres} (lo pidió el Gobierno).`, { claves: docs.map((d) => d.clave), motivo: parsed.data.motivo }, "persona");
  const mail = await recordarAlCliente(admin, id, { como: "mail", quien: yo.nombre, origen: req.nextUrl.origin });
  return NextResponse.json({ ok: true, mail: { enviado: mail.enviado, motivo: mail.motivo } });
}
