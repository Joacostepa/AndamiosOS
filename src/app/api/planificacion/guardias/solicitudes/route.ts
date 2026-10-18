import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { nivelEn } from "@/lib/auth/acceso";
import { exigirPermisoDeApi } from "@/lib/auth/servidor";
import { createClient } from "@/lib/supabase/server";
import {
  cancelarSolicitud,
  crearSolicitud,
  cuerpoInvalido,
  listarSolicitudes,
  motivoSchema,
  pedidoUsoSchema,
  respuestaDeError,
} from "@/lib/planificacion/guardias";
import type { PedidoUsoGuardia } from "@/lib/tablero/guardias-tipos";

// Los pedidos de autorización a JS (contrato §1.3, "Cómo se pide").
//
//   GET    ?estado=pendiente|aprobada|rechazada|cancelada|todas → { solicitudes }
//   POST   NuevaSolicitud → { solicitud, autorizacion }   ("Pedir autorización": motivo obligatorio;
//          con `autoaprobar`, sólo JS: pide y aprueba de una, y `autorizacion` trae el resultado)
//   DELETE { solicitudId } → { ok }         (cancelar: sólo quien pidió y sólo si sigue pendiente)
//
// HASTA QUE JS RESPONDA, LA GUARDIA SIGUE PUESTA: pedir no cambia nada en la grilla. Un pedido
// igual que otro pendiente (misma guardia, tipo y obra) contesta 409 con el que ya estaba, así
// tocar dos veces "Pedir" no le manda dos avisos a JS. La respuesta de JS va por /autorizar.

export const dynamic = "force-dynamic";

const ESTADOS = ["pendiente", "aprobada", "rechazada", "cancelada", "todas"] as const;

export async function GET(req: NextRequest) {
  const quien = await exigirPermisoDeApi(req);
  if (quien instanceof NextResponse) return quien;

  const estado = req.nextUrl.searchParams.get("estado") ?? "pendiente";
  if (!(ESTADOS as readonly string[]).includes(estado)) {
    return NextResponse.json({ error: `'estado' tiene que ser uno de: ${ESTADOS.join(", ")}.` }, { status: 400 });
  }
  try {
    const solicitudes = await listarSolicitudes(await createClient(), { estado: estado as (typeof ESTADOS)[number] });
    return NextResponse.json({ solicitudes });
  } catch (e) {
    return respuestaDeError(e, "no se pudieron leer los pedidos");
  }
}

const nuevaSchema = z
  .object({
    guardiaId: z.number().int().positive(),
    tipo: z.enum(["sacar", "obra_comun", "comodin_antes", "urgencia_fuera_regla"]),
    motivo: motivoSchema,
    pedido: pedidoUsoSchema.optional(),
    autoaprobar: z.boolean().optional(),
  })
  .refine((s) => s.tipo === "sacar" || s.pedido, { message: "Falta qué obra se quiere poner en la guardia", path: ["pedido"] });

export async function POST(req: NextRequest) {
  const quien = await exigirPermisoDeApi(req);
  if (quien instanceof NextResponse) return quien;

  const parsed = nuevaSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return cuerpoInvalido(parsed.error.issues);

  // Autoaprobar es aprobar: la misma llave que /guardias/autorizar, mirada acá porque esta
  // ruta la usa cualquiera que edite la planificación.
  if (parsed.data.autoaprobar && nivelEn(quien.acceso, "planificacion-autoriza") !== "editar") {
    return NextResponse.json({ error: "Sólo JS puede autorizar." }, { status: 403 });
  }

  try {
    const r = await crearSolicitud(
      { db: await createClient(), userId: quien.userId },
      { ...parsed.data, pedido: parsed.data.pedido as PedidoUsoGuardia | undefined },
    );
    return NextResponse.json(r);
  } catch (e) {
    return respuestaDeError(e, "no se pudo pedir la autorización");
  }
}

const cancelarSchema = z.object({ solicitudId: z.string().uuid("el pedido no es válido") });

export async function DELETE(req: NextRequest) {
  const quien = await exigirPermisoDeApi(req);
  if (quien instanceof NextResponse) return quien;

  const parsed = cancelarSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return cuerpoInvalido(parsed.error.issues);

  try {
    await cancelarSolicitud({ db: await createClient(), userId: quien.userId }, parsed.data.solicitudId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return respuestaDeError(e, "no se pudo cancelar el pedido");
  }
}
