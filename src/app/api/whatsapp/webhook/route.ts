import { after, NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { firmaValida, hayCuentaMeta } from "@/lib/whatsapp/api";
import { procesarTelefono, registrarEntrantes, type MensajeMeta } from "@/lib/whatsapp/procesar";
import { destinoDeNumero, numerosDelEntorno } from "@/lib/clientes/ruteo";
import { despuesDeRecibir, recibirMensajes, registrarStatuses, type AvisoClientes, type Pendientes } from "@/lib/clientes/webhook";

// /api/whatsapp/webhook — los avisos de WhatsApp (Meta), de los DOS números de la app:
//   · el del asistente comercial (WHATSAPP_PHONE_NUMBER_ID): le escriben los vendedores;
//   · el de clientes (WHATSAPP_CLIENTES_PHONE_NUMBER_ID): va a la bandeja de
//     /comercial/clientes (docs/clientes/crm-propuesta.md §13). Sin IA en la etapa 0.
// Se rutea por el phone_number_id del aviso (src/lib/clientes/ruteo.ts), nunca por el teléfono
// de quien escribe.
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
  entry?: { changes?: { field?: string; value?: AvisoClientes }[] }[];
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
  if (!hayCuentaMeta() || !firmaValida(crudo, req.headers.get("x-hub-signature-256"))) {
    return NextResponse.json({ error: "firma inválida" }, { status: 401 });
  }
  let aviso: Aviso;
  try {
    aviso = JSON.parse(crudo.toString("utf8")) as Aviso;
  } catch {
    return NextResponse.json({ ok: true });
  }

  const db = createAdminClient();
  const numeros = numerosDelEntorno();
  const telefonos = new Set<string>();
  const clientes: Pendientes = { adjuntos: [], respuestasFijas: [] };
  for (const e of aviso.entry ?? []) {
    for (const c of e.changes ?? []) {
      if (c.field !== "messages" || !c.value) continue;
      const numero = c.value.metadata?.phone_number_id;
      const destino = destinoDeNumero(numero, numeros);
      // Si falla anotar, el error vuelve como 500 y Meta reintenta más tarde.
      if (destino === "clientes" && numero) {
        if (c.value.messages?.length) {
          const p = await recibirMensajes(db, c.value, numero);
          clientes.adjuntos.push(...p.adjuntos);
          clientes.respuestasFijas.push(...p.respuestasFijas);
        }
        // Entregado, leído o error (el 131047: fuera de las 24 h). Antes se descartaban.
        if (c.value.statuses?.length) await registrarStatuses(db, c.value.statuses);
      } else if (destino === "vendedores" && c.value.messages?.length) {
        // Los avisos de entrega del asistente de vendedores se siguen descartando: no hay
        // dónde mostrarlos.
        for (const t of await registrarEntrantes(db, c.value.messages as MensajeMeta[], numero ?? null)) telefonos.add(t);
      }
    }
  }

  if (clientes.adjuntos.length || clientes.respuestasFijas.length) {
    // Bajar los adjuntos enseguida (los links de Meta vencen) y transcribir los audios.
    after(() => despuesDeRecibir(db, clientes).catch((e) => console.error("[clientes] después de recibir", e)));
  }

  if (telefonos.size) {
    // Una tanda por teléfono en esta función (en paralelo: cada una puede llevar un turno
    // entero); lo que sobre lo sigue otra, por /api/whatsapp/webhook/seguir.
    const origen = req.nextUrl.origin;
    after(async () => {
      await Promise.all(
        [...telefonos].map((t) => procesarTelefono(db, t, { origen }).catch((e) => console.error("[whatsapp] procesar", t, e))),
      );
    });
  }
  return NextResponse.json({ ok: true });
}
