import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { clavePublicaPush, mandarPush, pushConfigurado, type SuscripcionPush } from "@/lib/push/servidor";
import { errorResponse, exigirModulo, invalido } from "../../_comun";

// Notificaciones push de la bandeja (JS, 16/11). Cada dispositivo se suscribe por su cuenta.
// GET  — { configurado, clavePublica, suscripciones: [{ endpoint, modo }] } (las mías).
// POST — { accion: "activar", suscripcion, modo, dispositivo } | { accion: "modo", endpoint, modo }
//        | { accion: "desactivar", endpoint } | { accion: "probar", endpoint }.
// Alcanza con ver la bandeja (POST de lectura en acceso.ts): recibir avisos no cambia nada.

export const dynamic = "force-dynamic";

const MODO = z.enum(["todo", "necesita"]);
const schema = z.discriminatedUnion("accion", [
  z.object({
    accion: z.literal("activar"),
    suscripcion: z.object({ endpoint: z.string().url().max(1000), keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }) }),
    modo: MODO,
    dispositivo: z.string().max(200).optional(),
    /** La suscripción que este dispositivo tenía antes (el iPhone la pierde sin avisar): se borra. */
    anterior: z.string().max(1000).optional(),
  }),
  z.object({ accion: z.literal("modo"), endpoint: z.string().max(1000), modo: MODO }),
  z.object({ accion: z.literal("desactivar"), endpoint: z.string().max(1000) }),
  z.object({ accion: z.literal("probar"), endpoint: z.string().max(1000) }),
]);

export async function GET() {
  const quien = await exigirModulo("clientes-whatsapp", "ver");
  if (quien instanceof NextResponse) return quien;
  try {
    const db = createAdminClient();
    const { data, error } = await db.from("push_suscripciones").select("endpoint, modo, dispositivo").eq("user_id", quien.userId);
    if (error) throw new Error(error.message);
    return NextResponse.json({ configurado: pushConfigurado(), clavePublica: clavePublicaPush(), suscripciones: data ?? [] });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: NextRequest) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalido(parsed.error);
  const quien = await exigirModulo("clientes-whatsapp", "ver");
  if (quien instanceof NextResponse) return quien;
  try {
    const db = createAdminClient();
    const b = parsed.data;
    const ahora = new Date().toISOString();
    if (b.accion === "activar") {
      if (!pushConfigurado()) return NextResponse.json({ error: "Las notificaciones todavía no están configuradas en el servidor." }, { status: 409 });
      // Por endpoint: si el dispositivo era de otra persona (otra sesión en la misma compu), pasa a ser mío.
      const { error } = await db.from("push_suscripciones").upsert(
        { user_id: quien.userId, endpoint: b.suscripcion.endpoint, p256dh: b.suscripcion.keys.p256dh, auth: b.suscripcion.keys.auth, modo: b.modo, dispositivo: b.dispositivo ?? null, updated_at: ahora, fallas: 0 },
        { onConflict: "endpoint" },
      );
      if (error) throw new Error(error.message);
      if (b.anterior && b.anterior !== b.suscripcion.endpoint) {
        await db.from("push_suscripciones").delete().eq("endpoint", b.anterior).eq("user_id", quien.userId);
      }
      return NextResponse.json({ ok: true });
    }
    if (b.accion === "modo") {
      const { error } = await db.from("push_suscripciones").update({ modo: b.modo, updated_at: ahora }).eq("endpoint", b.endpoint).eq("user_id", quien.userId);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }
    if (b.accion === "desactivar") {
      const { error } = await db.from("push_suscripciones").delete().eq("endpoint", b.endpoint).eq("user_id", quien.userId);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }
    // probar
    const { data } = await db.from("push_suscripciones").select("id, user_id, endpoint, p256dh, auth, modo").eq("endpoint", b.endpoint).eq("user_id", quien.userId);
    const n = await mandarPush(db, (data ?? []) as SuscripcionPush[], {
      titulo: "WhatsApp de clientes",
      cuerpo: "Las notificaciones andan: te va a llegar así cada mensaje.",
      url: "/comercial/clientes",
      tag: "prueba",
    });
    if (!n) return NextResponse.json({ error: "No salió la prueba: desactivá y volvé a activar las notificaciones en este dispositivo." }, { status: 502 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
