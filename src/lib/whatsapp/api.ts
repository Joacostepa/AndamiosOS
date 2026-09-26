// WhatsApp Business Cloud API (Meta): validar la firma de los avisos, mandar mensajes y bajar
// los audios, fotos y archivos que llegan. SOLO server-side.
//
// Variables de entorno:
//   WHATSAPP_TOKEN            token permanente de un usuario del sistema de Meta Business
//   WHATSAPP_PHONE_NUMBER_ID  el id del número del asistente (no el número)
//   WHATSAPP_APP_SECRET       la clave secreta de la app: firma cada aviso del webhook
//   WHATSAPP_VERIFY_TOKEN     lo que se escribe al suscribir el webhook (lo inventa uno)
//   WHATSAPP_GRAPH_VERSION    opcional (v23.0)

import { createHmac, timingSafeEqual } from "node:crypto";
import { MAX_TEXTO, partir } from "./formato";

const GRAPH = "https://graph.facebook.com";
const version = () => process.env.WHATSAPP_GRAPH_VERSION || "v23.0";

export function hayWhatsapp(): boolean {
  return !!(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_APP_SECRET && process.env.WHATSAPP_VERIFY_TOKEN);
}

/** X-Hub-Signature-256 = "sha256=" + HMAC del cuerpo CRUDO (los bytes, no el JSON re-armado). */
export function firmaValida(cuerpo: Buffer, encabezado: string | null): boolean {
  const secreto = process.env.WHATSAPP_APP_SECRET;
  if (!secreto || !encabezado?.startsWith("sha256=")) return false;
  const recibida = Buffer.from(encabezado.slice(7), "hex");
  const esperada = createHmac("sha256", secreto).update(cuerpo).digest();
  return recibida.length === esperada.length && timingSafeEqual(recibida, esperada);
}

/**
 * Argentina: WhatsApp informa los celulares como 549 + área + número, pero alguien lo puede
 * haber cargado sin el 9. Se busca de las dos maneras.
 */
export function variantesTelefono(tel: string): string[] {
  const d = tel.replace(/\D/g, "");
  const v = new Set([d]);
  if (d.startsWith("549")) v.add(`54${d.slice(3)}`);
  else if (d.startsWith("54")) v.add(`549${d.slice(2)}`);
  return [...v];
}

const recortar = (t: string, n: number) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);

async function mensajes(cuerpo: Record<string, unknown>): Promise<void> {
  const res = await fetch(`${GRAPH}/${version()}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", ...cuerpo }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    const j = (await res.json().catch(() => null)) as { error?: { message?: string; code?: number } } | null;
    throw new Error(`WhatsApp no aceptó el mensaje (${res.status}${j?.error?.code ? ` · ${j.error.code}` : ""}): ${j?.error?.message ?? "sin detalle"}`);
  }
}

export async function enviarTexto(para: string, texto: string): Promise<void> {
  for (const parte of partir(texto, MAX_TEXTO)) {
    await mensajes({ recipient_type: "individual", to: para, type: "text", text: { body: parte, preview_url: false } });
  }
}

/** Hasta 3 botones de respuesta (título de hasta 20 caracteres; el texto, hasta 1024). */
export async function enviarBotones(para: string, texto: string, botones: { id: string; titulo: string }[]): Promise<void> {
  await mensajes({
    recipient_type: "individual",
    to: para,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: recortar(texto, 1024) },
      action: { buttons: botones.slice(0, 3).map((b) => ({ type: "reply", reply: { id: b.id.slice(0, 256), title: recortar(b.titulo, 20) } })) },
    },
  });
}

/** Un documento por link (WhatsApp lo baja al mandarlo: sirve una URL firmada de Storage). */
export async function enviarDocumento(para: string, url: string, nombre: string, epigrafe?: string): Promise<void> {
  await mensajes({
    recipient_type: "individual",
    to: para,
    type: "document",
    document: { link: url, filename: nombre, ...(epigrafe ? { caption: recortar(epigrafe, 1024) } : {}) },
  });
}

/** Tildes azules y "escribiendo…" (dura hasta 25 s o hasta que sale la respuesta). Si falla, no importa. */
export async function marcarLeido(wamid: string): Promise<void> {
  await mensajes({ status: "read", message_id: wamid, typing_indicator: { type: "text" } }).catch(() => {});
}

/** Un audio, foto o archivo que mandaron: primero se pide su URL, después se baja con el token. */
export async function bajarMedio(id: string): Promise<{ datos: Buffer; mime: string }> {
  const token = process.env.WHATSAPP_TOKEN;
  const meta = await fetch(`${GRAPH}/${version()}/${id}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20_000) });
  const j = (await meta.json().catch(() => null)) as { url?: string; mime_type?: string } | null;
  if (!meta.ok || !j?.url) throw new Error(`WhatsApp no dio el archivo (${meta.status}).`);
  const res = await fetch(j.url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`No se pudo bajar el archivo de WhatsApp (${res.status}).`);
  const mime = (j.mime_type ?? res.headers.get("content-type") ?? "application/octet-stream").split(";")[0].trim();
  return { datos: Buffer.from(await res.arrayBuffer()), mime };
}
