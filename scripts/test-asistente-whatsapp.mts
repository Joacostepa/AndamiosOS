// Prueba del canal WhatsApp del Asistente Comercial, sin Meta: los avisos del webhook se
// simulan (firmados con una clave de prueba) y las llamadas a la API de Meta se interceptan y se
// muestran en pantalla. El asistente (Claude) y la base son los reales.
//
// Cubre: verificación del webhook, firma, reintentos de Meta, número desconocido, mensajes
// cortados que se juntan en una consulta, presupuesto con botones Confirmar / Cancelar (se
// CANCELA: no escribe en Odoo) y el pedido «nueva». Usa temporalmente el teléfono de prueba
// 5490000000001 en la fila de Joaquín (vuelve a quedar vacío) y borra todo lo creado.
//
// Cuesta ~US$ 1 de API.
//
// Correr: npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/test-asistente-whatsapp.mts
import { createClient } from "@supabase/supabase-js";
import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";

process.env.WHATSAPP_TOKEN = "token-de-prueba";
process.env.WHATSAPP_PHONE_NUMBER_ID = "999000";
process.env.WHATSAPP_APP_SECRET = "secreto-de-prueba";
process.env.WHATSAPP_VERIFY_TOKEN = "verificar-prueba";

type Saliente = { to?: string; type?: string; text?: { body: string }; interactive?: { body: { text: string }; action: { buttons: { reply: { id: string; title: string } }[] } }; document?: { link: string; filename: string } };
const salientes: Saliente[] = [];
const fetchReal = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (url.startsWith("https://graph.facebook.com")) {
    const cuerpo = init?.body ? JSON.parse(String(init.body)) : null;
    if (cuerpo && cuerpo.status !== "read") {
      salientes.push(cuerpo);
      const que = cuerpo.type === "text" ? cuerpo.text.body : cuerpo.type === "interactive" ? `[BOTONES ${cuerpo.interactive.action.buttons.map((b: { reply: { title: string } }) => b.reply.title).join(" / ")}] ${cuerpo.interactive.body.text}` : cuerpo.type === "document" ? `[PDF] ${cuerpo.document.filename} ← ${cuerpo.document.link.slice(0, 60)}…` : JSON.stringify(cuerpo);
      console.log(`   → WhatsApp a ${cuerpo.to}: ${que.replace(/\n/g, " ⏎ ").slice(0, 400)}`);
    }
    return new Response(JSON.stringify({ messaging_product: "whatsapp", messages: [{ id: "wamid.salida" }] }), { status: 200, headers: { "content-type": "application/json" } });
  }
  return fetchReal(input, init);
}) as typeof fetch;

const { GET, POST } = await import("@/app/api/whatsapp/webhook/route");
const { registrarEntrantes, procesarTelefono } = await import("@/lib/whatsapp/procesar");

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const { data: yo } = await db.from("user_profiles").select("id").eq("email", "js@andamiosbuenosaires.com.ar").single();
const TEL = "5490000000001";
const DESCONOCIDO = "5490000000009";
const fallas: string[] = [];
const ok = (cond: unknown, que: string) => { console.log(`${cond ? "✓" : "✗"} ${que}`); if (!cond) fallas.push(que); };
let n = 0;
const texto = (from: string, body: string) => ({ from, id: `wamid.prueba.${Date.now()}.${n++}`, timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body } });
const inicioPrueba = new Date().toISOString();

try {
  console.log("\n── verificación del webhook");
  const g1 = await GET(new NextRequest("http://x/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=verificar-prueba&hub.challenge=4321"));
  ok(g1.status === 200 && (await g1.text()) === "4321", "GET con el token correcto devuelve el challenge");
  const g2 = await GET(new NextRequest("http://x/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=otro&hub.challenge=4321"));
  ok(g2.status === 403, "GET con otro token: 403");

  console.log("\n── firma");
  const cuerpo = JSON.stringify({ object: "whatsapp_business_account", entry: [{ changes: [{ field: "messages", value: { metadata: { phone_number_id: "999000" }, statuses: [{ id: "x", status: "delivered" }] } }] }] });
  const firma = "sha256=" + createHmac("sha256", "secreto-de-prueba").update(cuerpo).digest("hex");
  const p1 = await POST(new NextRequest("http://x/api/whatsapp/webhook", { method: "POST", body: cuerpo, headers: { "x-hub-signature-256": "sha256=" + "0".repeat(64) } }));
  ok(p1.status === 401, "POST con firma falsa: 401");
  const p2 = await POST(new NextRequest("http://x/api/whatsapp/webhook", { method: "POST", body: cuerpo, headers: { "x-hub-signature-256": firma } }));
  ok(p2.status === 200, "POST firmado (sólo estados de entrega): 200");

  console.log("\n── número desconocido");
  ok((await registrarEntrantes(db, [texto(DESCONOCIDO, "hola")])).includes(DESCONOCIDO), "se anota el mensaje");
  const m0 = texto(DESCONOCIDO, "hola?");
  await registrarEntrantes(db, [m0]);
  ok((await registrarEntrantes(db, [m0])).length === 0, "un reintento de Meta (mismo wamid) no se anota dos veces");
  let antes = salientes.length;
  await procesarTelefono(db, DESCONOCIDO);
  ok(salientes.length === antes + 1 && /uso interno/.test(salientes.at(-1)?.text?.body ?? ""), "le contesta una vez que es de uso interno");
  await registrarEntrantes(db, [texto(DESCONOCIDO, "hola de nuevo")]);
  antes = salientes.length;
  await procesarTelefono(db, DESCONOCIDO);
  ok(salientes.length === antes, "el mismo día no le vuelve a contestar");

  console.log("\n── vendedor: mensajes cortados se juntan en una consulta");
  await db.from("comercial_vendedores").update({ whatsapp: TEL }).eq("usuario_id", yo!.id);
  await registrarEntrantes(db, [texto(TEL, "Hola"), texto(TEL, "¿Cuánto sale el metro lineal de bandeja de 3 metros? Contestá corto, es una prueba.")]);
  antes = salientes.length;
  await procesarTelefono(db, TEL);
  const respuestas = salientes.slice(antes).filter((s) => s.type === "text");
  ok(respuestas.length >= 1 && respuestas.some((r) => /140/.test(r.text!.body)), "contesta la tarifa (140.000)");
  const { data: convs } = await db.from("asistente_conversaciones").select("id, canal").eq("usuario_id", yo!.id).eq("canal", "whatsapp").gte("created_at", inicioPrueba);
  ok(convs?.length === 1, "abrió UNA conversación de WhatsApp");
  const { data: humanos } = await db.from("asistente_mensajes").select("texto, canal").eq("conversacion_id", convs![0].id).eq("tipo", "humano");
  ok(humanos?.length === 1 && humanos[0].canal === "whatsapp" && /Hola/.test(humanos[0].texto) && /bandeja/.test(humanos[0].texto), "los dos mensajes llegaron juntos como uno");

  console.log("\n── presupuesto → botones → Cancelar");
  await registrarEntrantes(db, [texto(TEL,
    "Es una PRUEBA del sistema. Cotizame una bandeja de protección de 12 metros lineales, 3 m de altura, en Calle Falsa 123, CABA. " +
    "Cliente nuevo: ZZ PRUEBA ASISTENTE SA, CUIT 30-99999999-5, contacto Prueba Borrar, celular 1100000000, mail prueba-asistente@example.com, " +
    "domicilio Calle Falsa 123, CABA. Armado 1 jornada y desarme 1, cuadrilla de 3, sin render, sin concertina ni gestoría. " +
    "No hace falta revisar nada más: dejalo listo para guardar en Odoo y proponé guardarlo.")]);
  antes = salientes.length;
  await procesarTelefono(db, TEL);
  const botones = salientes.slice(antes).find((s) => s.type === "interactive");
  ok(botones, "mandó la propuesta con botones Confirmar / Cancelar");
  const cancelar = botones?.interactive?.action.buttons.find((b) => b.reply.title === "Cancelar")?.reply.id;
  if (cancelar) {
    const accionId = cancelar.split(":")[1];
    await registrarEntrantes(db, [{ from: TEL, id: `wamid.prueba.boton.${Date.now()}`, timestamp: String(Math.floor(Date.now() / 1000)), type: "interactive", interactive: { type: "button_reply", button_reply: { id: cancelar, title: "Cancelar" } } }]);
    antes = salientes.length;
    await procesarTelefono(db, TEL);
    const { data: a } = await db.from("asistente_acciones").select("estado, confirmada_via").eq("id", accionId).single();
    ok(a?.estado === "rechazada", `la acción quedó ${a?.estado}`);
    ok(salientes.slice(antes).some((s) => s.type === "text"), "y contestó algo después del botón");
  }

  console.log("\n── «nueva»");
  await registrarEntrantes(db, [texto(TEL, "Nueva")]);
  antes = salientes.length;
  await procesarTelefono(db, TEL);
  ok(/empezamos de cero/.test(salientes.at(-1)?.text?.body ?? ""), "arranca una conversación nueva");
  const { data: convs2 } = await db.from("asistente_conversaciones").select("id").eq("usuario_id", yo!.id).eq("canal", "whatsapp").gte("created_at", inicioPrueba);
  ok(convs2?.length === 2, "hay dos conversaciones de WhatsApp");

  const { data: estados } = await db.from("whatsapp_entrantes").select("estado").in("telefono", [TEL, DESCONOCIDO]);
  ok((estados ?? []).every((e) => e.estado === "ok" || e.estado === "ignorado"), `ningún mensaje quedó colgado (${[...new Set((estados ?? []).map((e) => e.estado))].join(", ")})`);
} finally {
  console.log("\n── limpieza");
  await db.from("comercial_vendedores").update({ whatsapp: null, whatsapp_ocupado_hasta: null }).eq("usuario_id", yo!.id);
  await db.from("whatsapp_entrantes").delete().in("telefono", [TEL, DESCONOCIDO]);
  const { data: convs } = await db.from("asistente_conversaciones").select("id").eq("usuario_id", yo!.id).eq("canal", "whatsapp").gte("created_at", inicioPrueba);
  for (const c of convs ?? []) {
    const { data: borradores } = await db.from("cotizacion_borradores").select("id").eq("conversacion_id", c.id);
    for (const b of borradores ?? []) {
      const { data: files } = await db.storage.from("comercial").list(`propuestas/${b.id}`);
      if (files?.length) await db.storage.from("comercial").remove(files.map((f) => `propuestas/${b.id}/${f.name}`));
    }
    await db.from("cotizacion_borradores").delete().eq("conversacion_id", c.id);
    await db.from("asistente_conversaciones").delete().eq("id", c.id);
  }
  console.log(`  ${convs?.length ?? 0} conversaciones, sus borradores y PDFs; entrantes; teléfono de prueba`);
}
console.log(fallas.length ? `\n✗ ${fallas.length} fallas: ${fallas.join(" · ")}` : "\n✓ todo OK");
process.exit(fallas.length ? 1 : 0);
