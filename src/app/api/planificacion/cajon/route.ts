import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { exigirPermisoDeApi } from "@/lib/auth/servidor";
import {
  ConflictoDeNota,
  actualizarPendiente,
  agregarPendiente,
  borrarPendiente,
  guardarNota,
  leerCajon,
} from "@/lib/planificacion/cajon";

// Cajón de planificación.
//
//   GET                                 → { nota, pendientes }
//   PUT     { texto, updatedAt }        → guarda las notas · 409 si otro escribió antes
//   POST    { texto }                   → agrega al final, devuelve { pendiente }
//   PATCH   { id, hecho? | texto? }     → tilda / corrige
//   DELETE  { pendienteId }
//
// Igual que /api/planificacion/notas, esto NO toca Odoo: vive entero en Supabase. Y va
// con la sesión del usuario y no con la service role — las políticas de RLS deciden
// quién escribe, y el autor sale de la sesión y no del body, para que no se pueda
// firmar a nombre de otro.
//
// Cada handler que escribe arranca con la segunda llave (exigirPermisoDeApi: la misma
// regla que el proxy, planificación en "editar"). La RLS de 20261018100002 pide lo mismo
// (o la Hoja del día, que tilda pendientes al pasarlos a pedido), así que las dos puertas
// coinciden y el autor sale de la llave, sin preguntarle a Supabase dos veces quién es.

export const dynamic = "force-dynamic";

function errorResponse(e: unknown) {
  return NextResponse.json(
    { error: e instanceof Error ? e.message : String(e) },
    { status: 502 },
  );
}

function invalido(msg: string) {
  return NextResponse.json({ error: msg }, { status: 400 });
}

export async function GET() {
  try {
    const db = await createClient();
    return NextResponse.json(await leerCajon(db));
  } catch (e) {
    return errorResponse(e);
  }
}

const notaSchema = z.object({
  // Sin `.min(1)`: vaciar las notas es una edición legítima, no un error.
  texto: z.string().max(20_000),
  // El sello que se leyó. Es lo que permite detectar que otro guardó mientras tanto.
  updatedAt: z.string().min(1),
});

export async function PUT(req: NextRequest) {
  const sesion = await exigirPermisoDeApi(req);
  if (sesion instanceof NextResponse) return sesion;
  const parsed = notaSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalido(parsed.error.issues.map((i) => i.message).join(" · "));

  try {
    const db = await createClient();
    const nota = await guardarNota(
      db,
      parsed.data.texto,
      parsed.data.updatedAt,
      sesion.userId,
    );
    return NextResponse.json({ nota });
  } catch (e) {
    // 409 y no 502: no es una falla, es que el texto de otro llegó primero. El cliente
    // lo distingue por el status para poder ofrecer la versión de al lado en vez de
    // mostrar un error genérico.
    if (e instanceof ConflictoDeNota) {
      return NextResponse.json({ error: e.message, nota: e.actual }, { status: 409 });
    }
    return errorResponse(e);
  }
}

const crearSchema = z.object({
  texto: z.string().trim().min(1, "El pendiente no puede estar vacío").max(500),
});

export async function POST(req: NextRequest) {
  const sesion = await exigirPermisoDeApi(req);
  if (sesion instanceof NextResponse) return sesion;
  const parsed = crearSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalido(parsed.error.issues.map((i) => i.message).join(" · "));

  try {
    const db = await createClient();
    const pendiente = await agregarPendiente(db, parsed.data.texto, sesion.userId);
    return NextResponse.json({ pendiente });
  } catch (e) {
    return errorResponse(e);
  }
}

const cambiarSchema = z
  .object({
    id: z.string().uuid(),
    hecho: z.boolean().optional(),
    texto: z.string().trim().min(1, "El pendiente no puede estar vacío").max(500).optional(),
  })
  .refine((c) => c.hecho !== undefined || c.texto !== undefined, {
    message: "No hay nada que cambiar",
  });

export async function PATCH(req: NextRequest) {
  const sesion = await exigirPermisoDeApi(req);
  if (sesion instanceof NextResponse) return sesion;
  const parsed = cambiarSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalido(parsed.error.issues.map((i) => i.message).join(" · "));

  try {
    const db = await createClient();
    const { id, ...cambio } = parsed.data;
    await actualizarPendiente(db, id, cambio);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

const borrarSchema = z.object({ pendienteId: z.string().uuid() });

export async function DELETE(req: NextRequest) {
  const sesion = await exigirPermisoDeApi(req);
  if (sesion instanceof NextResponse) return sesion;
  const parsed = borrarSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalido("Pendiente inválido");

  try {
    const db = await createClient();
    await borrarPendiente(db, parsed.data.pendienteId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
