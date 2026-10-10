import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  anularLink, avisarCapatazPedido, avisarDeposito, avisarOperario, enviar, enviarTodos, noHaceFalta, preparar, prepararTodos, reenviar,
} from "@/lib/hoja-dia/envios";
import { conPermiso, fallo, fechaValida, invalidoZod, sesion } from "../_comun";

// GET /api/hoja-dia/envios?fecha=… — la lista de envío ("Mandar las hojas del martes 13"):
// una fila por persona que recibe algo, con su texto, su link, su wa.me y si se le puede
// mandar por Telegram. Crea los links que falten (por eso pide editar).
//
// POST /api/hoja-dia/envios { accion, fecha, … }:
//   preparar { personaId }                  → el texto y el wa.me de una persona
//   enviar { personaId, canal }             → telegram: lo manda (Enviada sólo si Telegram dijo ok);
//                                             manual: lo marca como mandado a mano (con Deshacer)
//   enviar_todos                            → todo lo pendiente por Telegram; devuelve lo que va a mano
//   no_hace_falta { personaId }             → el cambio queda sin avisar, en gris
//   reenviar { personaId, canal }
//   anular_link { personaId }
//   avisar_operario { personaId, canal | "no_hace_falta" }
//   avisar_deposito { viajeId, canal }
//   avisar_capataz { pedidoId, canal }

export const dynamic = "force-dynamic";

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const id = z.string().uuid();
const canal = z.enum(["telegram", "manual"]);
const schema = z.discriminatedUnion("accion", [
  z.object({ accion: z.literal("preparar"), fecha, personaId: id }),
  z.object({ accion: z.literal("enviar"), fecha, personaId: id, canal }),
  z.object({ accion: z.literal("enviar_todos"), fecha }),
  z.object({ accion: z.literal("no_hace_falta"), fecha, personaId: id }),
  z.object({ accion: z.literal("reenviar"), fecha, personaId: id, canal }),
  z.object({ accion: z.literal("anular_link"), fecha, personaId: id }),
  z.object({ accion: z.literal("avisar_operario"), fecha, personaId: id, canal: z.enum(["telegram", "manual", "no_hace_falta"]) }),
  z.object({ accion: z.literal("avisar_deposito"), fecha, viajeId: id, canal }),
  z.object({ accion: z.literal("avisar_capataz"), fecha, pedidoId: id, canal }),
]);

export async function GET(req: NextRequest) {
  const guardia = await conPermiso(["hoja-dia"], "editar");
  if (guardia instanceof NextResponse) return guardia;
  const f = req.nextUrl.searchParams.get("fecha");
  if (!fechaValida(f)) return NextResponse.json({ error: "Falta la fecha" }, { status: 400 });
  try {
    return NextResponse.json({ filas: await prepararTodos(await sesion(), f, req.nextUrl.origin) });
  } catch (e) {
    return fallo(e);
  }
}

export async function POST(req: NextRequest) {
  const guardia = await conPermiso(["hoja-dia"], "editar");
  if (guardia instanceof NextResponse) return guardia;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalidoZod(parsed.error);
  const a = parsed.data;
  const db = await sesion();
  const origen = req.nextUrl.origin;
  const u = guardia.userId;
  try {
    switch (a.accion) {
      case "preparar": return NextResponse.json(await preparar(db, a.fecha, a.personaId, origen));
      case "enviar": return NextResponse.json(await enviar(db, u, a.fecha, a.personaId, a.canal, origen));
      case "enviar_todos": return NextResponse.json(await enviarTodos(db, u, a.fecha, origen));
      case "no_hace_falta": return NextResponse.json(await noHaceFalta(db, u, a.fecha, a.personaId));
      case "reenviar": return NextResponse.json(await reenviar(db, u, a.fecha, a.personaId, a.canal, origen));
      case "anular_link": return NextResponse.json(await anularLink(db, u, a.fecha, a.personaId));
      case "avisar_operario": return NextResponse.json(await avisarOperario(db, u, a.fecha, a.personaId, a.canal));
      case "avisar_deposito": return NextResponse.json(await avisarDeposito(db, u, a.fecha, a.viajeId, a.canal));
      case "avisar_capataz": return NextResponse.json(await avisarCapatazPedido(db, u, a.fecha, a.pedidoId, a.canal));
    }
  } catch (e) {
    return fallo(e);
  }
}
