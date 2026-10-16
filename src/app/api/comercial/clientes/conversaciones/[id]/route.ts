import { after, NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { nivelEn } from "@/lib/auth/acceso";
import { marcarLeido, numeroClientes } from "@/lib/whatsapp/api";
import { cambiarEstado, leerCharla, leerHilo, nombresDe, ultimoEntrante } from "@/lib/clientes/bandeja";
import { reintentarPendientes } from "@/lib/clientes/webhook";
import type { DetalleCharla } from "@/lib/clientes/vista";
import { errorResponse, exigirModulo, invalido } from "../../../_comun";

// GET   /api/comercial/clientes/conversaciones/:id — la charla y su hilo. Abrirla la deja
//       leída (y, para quien puede contestar, le pone las tildes azules al cliente). Si quedó
//       algún adjunto sin bajar (una función que se cortó), lo reintenta después de responder.
// PATCH /api/comercial/clientes/conversaciones/:id — { accion: "tomar" | "soltar" | "cerrar",
//       forzar? } (forzar: tomar una que tiene otra persona; la pantalla pregunta antes).

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const uuid = z.string().uuid();

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!uuid.safeParse(id).success) return invalido("Id inválido");
  const quien = await exigirModulo("clientes-whatsapp", "ver");
  if (quien instanceof NextResponse) return quien;
  try {
    const db = createAdminClient();
    const charla = await leerCharla(db, id);
    if (!charla) return NextResponse.json({ error: "No existe esa charla." }, { status: 404 });
    const items = await leerHilo(db, id);
    const puedeEditar = nivelEn(quien.acceso, "clientes-whatsapp") === "editar";
    const numero = numeroClientes();

    if (charla.sinLeer > 0) {
      await db.from("cli_conversaciones").update({ sin_leer: 0 }).eq("id", id);
      if (puedeEditar && numero) {
        const wamid = await ultimoEntrante(db, id);
        if (wamid) after(() => marcarLeido(wamid, numero, false));
      }
    }
    if (items.some((i) => i.adjunto?.tipo === "archivo" && i.adjunto.pendiente)) {
      after(() => reintentarPendientes(db, id).catch((e) => console.error("[clientes] reintentar", id, e)));
    }

    const cuerpo: DetalleCharla = { yo: quien.userId, puedeEditar, numeroConfigurado: !!numero, charla: { ...charla, sinLeer: 0 }, items };
    return NextResponse.json(cuerpo);
  } catch (e) {
    return errorResponse(e);
  }
}

const schema = z.object({ accion: z.enum(["tomar", "soltar", "cerrar"]), forzar: z.boolean().optional() });

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!uuid.safeParse(id).success) return invalido("Id inválido");
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalido(parsed.error);
  const quien = await exigirModulo("clientes-whatsapp", "editar");
  if (quien instanceof NextResponse) return quien;
  try {
    const db = createAdminClient();
    const charla = await leerCharla(db, id);
    if (!charla) return NextResponse.json({ error: "No existe esa charla." }, { status: 404 });
    const yo = { id: quien.userId, nombre: (await nombresDe(db, [quien.userId])).get(quien.userId) ?? "Alguien" };
    const motivo = await cambiarEstado(db, charla, parsed.data.accion, yo, parsed.data.forzar);
    if (motivo) return NextResponse.json({ error: motivo }, { status: 409 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
