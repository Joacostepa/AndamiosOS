import { after, NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { esAdmin, nivelEn } from "@/lib/auth/acceso";
import { marcarLeido, numeroClientes } from "@/lib/whatsapp/api";
import { borrarCharla, cambiarEstado, equipoBandeja, leerCharla, leerHilo, nombresDe, ultimoEntrante } from "@/lib/clientes/bandeja";
import { reintentarPendientes } from "@/lib/clientes/webhook";
import { atenderConSofia } from "@/lib/clientes/agente";
import { iaClientesActiva } from "@/lib/clientes/interruptor";
import type { DetalleCharla } from "@/lib/clientes/vista";
import { errorResponse, exigirModulo, invalido } from "../../../_comun";

// GET   /api/comercial/clientes/conversaciones/:id — la charla y su hilo. Abrirla la deja
//       leída (y, para quien puede contestar, le pone las tildes azules al cliente). Si quedó
//       algún adjunto sin bajar (una función que se cortó), lo reintenta después de responder.
// PATCH /api/comercial/clientes/conversaciones/:id — { accion: "tomar" | "soltar" | "cerrar" |
//       "devolver", forzar?, nota? } (forzar: tomar una que tiene otra persona; la pantalla
//       pregunta antes). «devolver»: la charla vuelve a Sofía (sólo con clientes_ia_activa = 1),
//       con una nota opcional para ella; Sofía sigue después de responder (after), por eso la
//       ruta tiene el plazo largo (un turno puede llevar hasta 265 s). «pasar» (con `para`, el id
//       de alguien con la bandeja en «editar»): la charla queda con esa persona.
// DELETE /api/comercial/clientes/conversaciones/:id — borra la charla entera para volver a
//       probar desde cero (sólo admin). Ver borrarCharla en bandeja.ts.

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const uuid = z.string().uuid();

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!uuid.safeParse(id).success) return invalido("Id inválido");
  // ?previa=1: la lista la pide de antemano al pasar el mouse (JS, 25/11: tardaba en cambiar
  // de charla). No la deja leída ni le pone las tildes azules al cliente: eso, sólo al abrirla.
  const previa = req.nextUrl.searchParams.get("previa") === "1";
  const quien = await exigirModulo("clientes-whatsapp", "ver");
  if (quien instanceof NextResponse) return quien;
  try {
    const db = createAdminClient();
    // Las tres lecturas a la vez: en serie sumaban un viaje a la base cada una.
    const [charla, items, iaActiva] = await Promise.all([leerCharla(db, id), leerHilo(db, id), iaClientesActiva(db)]);
    if (!charla) return NextResponse.json({ error: "No existe esa charla." }, { status: 404 });
    const puedeEditar = nivelEn(quien.acceso, "clientes-whatsapp") === "editar";
    const numero = numeroClientes();

    // Dejarla leída, después de contestar: la pantalla ya la muestra leída.
    if (charla.sinLeer > 0 && !previa) {
      after(async () => {
        try {
          await db.from("cli_conversaciones").update({ sin_leer: 0 }).eq("id", id);
          if (puedeEditar && numero) {
            const wamid = await ultimoEntrante(db, id);
            if (wamid) await marcarLeido(wamid, numero, false);
          }
        } catch (e) {
          console.error("[clientes] leída", id, e);
        }
      });
    }
    if (items.some((i) => i.adjunto?.tipo === "archivo" && i.adjunto.pendiente)) {
      after(() => reintentarPendientes(db, id).catch((e) => console.error("[clientes] reintentar", id, e)));
    }

    const cuerpo: DetalleCharla = { yo: quien.userId, puedeEditar, iaActiva, esAdmin: esAdmin(quien.acceso), numeroConfigurado: !!numero, charla: previa ? charla : { ...charla, sinLeer: 0 }, items };
    return NextResponse.json(cuerpo);
  } catch (e) {
    return errorResponse(e);
  }
}

const schema = z.object({
  accion: z.enum(["tomar", "soltar", "cerrar", "devolver", "pasar"]),
  para: z.string().uuid().optional(),
  forzar: z.boolean().optional(),
  nota: z.string().trim().max(500, "La nota para Tomás no puede pasar de 500 caracteres.").optional(),
});

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
    const { accion, forzar, nota, para } = parsed.data;
    if (accion === "devolver" && !(await iaClientesActiva(db))) {
      return NextResponse.json({ error: "Tomás está apagado (clientes_ia_activa en Parámetros): la charla sigue con una persona." }, { status: 409 });
    }
    const yo = { id: quien.userId, nombre: (await nombresDe(db, [quien.userId])).get(quien.userId) ?? "Alguien" };
    let destino = null;
    if (accion === "pasar") {
      destino = (await equipoBandeja(db)).find((p) => p.id === para) ?? null;
      if (!destino) return NextResponse.json({ error: "Esa persona no tiene la bandeja de clientes para contestar." }, { status: 400 });
    }
    const motivo = await cambiarEstado(db, charla, accion, yo, forzar, nota ?? null, destino);
    if (motivo) return NextResponse.json({ error: motivo }, { status: 409 });
    // Sofía retoma enseguida: lee lo que pasó mientras la tuvo una persona y la nota.
    if (accion === "devolver" && charla.estado !== "bot") after(() => atenderConSofia(db, id, { devuelta: true }).then(() => {}));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!uuid.safeParse(id).success) return invalido("Id inválido");
  const quien = await exigirModulo("clientes-whatsapp", "editar");
  if (quien instanceof NextResponse) return quien;
  if (!esAdmin(quien.acceso)) return NextResponse.json({ error: "Sólo un admin puede borrar una charla." }, { status: 403 });
  try {
    const db = createAdminClient();
    const charla = await leerCharla(db, id);
    if (!charla) return NextResponse.json({ error: "No existe esa charla." }, { status: 404 });
    await borrarCharla(db, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
