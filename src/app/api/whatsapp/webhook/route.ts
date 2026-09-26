import { after, NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { firmaValida, hayWhatsapp } from "@/lib/whatsapp/api";
import { procesarTelefono, registrarEntrantes, type MensajeMeta } from "@/lib/whatsapp/procesar";

// /api/whatsapp/webhook — los avisos de WhatsApp (Meta) para el asistente comercial.
//
// GET: la verificación al suscribir el webhook (Meta manda hub.challenge y hay que devolverlo).
// POST: cada mensaje que le mandan al número del asistente. Meta quiere un 200 enseguida y el
// asistente tarda de 5 a 60 segundos: acá sólo se valida la firma y se anota el mensaje; la
// respuesta se arma después (after), con el mismo asistente de la pantalla.
//
// PÚBLICA (la llama Meta, sin cookie): la protege la firma HMAC con la clave de la app.

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Aviso = {
  object?: string;
  entry?: { changes?: { field?: string; value?: { metadata?: { phone_number_id?: string }; messages?: MensajeMeta[] } }[] }[];
};

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const esperado = process.env.WHATSAPP_VERIFY_TOKEN;
  if (p.get("hub.mode") === "subscribe" && esperado && p.get("hub.verify_token") === esperado) {
    return new Response(p.get("hub.challenge") ?? "", { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  return new Response("forbidden", { status: 403 });
}

export async function POST(req: NextRequest) {
  const crudo = Buffer.from(await req.arrayBuffer());
  if (!hayWhatsapp() || !firmaValida(crudo, req.headers.get("x-hub-signature-256"))) {
    return NextResponse.json({ error: "firma inválida" }, { status: 401 });
  }
  let aviso: Aviso;
  try {
    aviso = JSON.parse(crudo.toString("utf8")) as Aviso;
  } catch {
    return NextResponse.json({ ok: true });
  }

  const db = createAdminClient();
  const telefonos = new Set<string>();
  for (const e of aviso.entry ?? []) {
    for (const c of e.changes ?? []) {
      // Sólo mensajes (no los avisos de entregado/leído) y sólo al número del asistente.
      if (c.field !== "messages" || !c.value?.messages?.length) continue;
      const numero = c.value.metadata?.phone_number_id;
      if (numero && numero !== process.env.WHATSAPP_PHONE_NUMBER_ID) continue;
      // Si falla anotar, el error vuelve como 500 y Meta reintenta más tarde.
      for (const t of await registrarEntrantes(db, c.value.messages)) telefonos.add(t);
    }
  }

  if (telefonos.size) {
    after(async () => {
      for (const t of telefonos) {
        await procesarTelefono(db, t).catch((e) => console.error("[whatsapp] procesar", t, e));
      }
    });
  }
  return NextResponse.json({ ok: true });
}
