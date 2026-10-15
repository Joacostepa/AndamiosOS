// WhatsApp Business Cloud API (Meta): validar la firma de los avisos, mandar mensajes y bajar
// los audios, fotos y archivos que llegan. SOLO server-side.
//
// Variables de entorno:
//   WHATSAPP_TOKEN            token permanente de un usuario del sistema de Meta Business
//   WHATSAPP_PHONE_NUMBER_ID  el id del número del asistente (no el número)
//   WHATSAPP_CLIENTES_PHONE_NUMBER_ID  opcional: el id del número de clientes (la bandeja de
//                             /comercial/clientes). Misma app de Meta y mismo token.
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

/** El número de clientes (docs/clientes/crm-propuesta.md §13). null si no está configurado. */
export function numeroClientes(): string | null {
  return hayWhatsapp() ? process.env.WHATSAPP_CLIENTES_PHONE_NUMBER_ID || null : null;
}

/** Lo que no aceptó Meta, con su código (131047 = fuera de las 24 h, etc.). */
export class ErrorWhatsapp extends Error {
  constructor(mensaje: string, readonly codigo: number | null, readonly status: number) {
    super(mensaje);
    this.name = "ErrorWhatsapp";
  }
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
 * El pedido de una función a otra para que siga con un teléfono (procesar.ts, una tanda por
 * invocación). Misma clave que Meta, pero con un prefijo: un aviso de Meta reenviado a la ruta
 * de seguir no vale, ni al revés.
 */
const PREFIJO_INTERNO = "seguir:";
export function firmarInterno(cuerpo: string): string {
  return "sha256=" + createHmac("sha256", process.env.WHATSAPP_APP_SECRET ?? "").update(PREFIJO_INTERNO + cuerpo).digest("hex");
}
export function firmaInternaValida(cuerpo: string, encabezado: string | null): boolean {
  if (!process.env.WHATSAPP_APP_SECRET || !encabezado?.startsWith("sha256=")) return false;
  const recibida = Buffer.from(encabezado.slice(7), "hex");
  const esperada = Buffer.from(firmarInterno(cuerpo).slice(7), "hex");
  return recibida.length === esperada.length && timingSafeEqual(recibida, esperada);
}

// Está en tandas.ts (puro, con tests); se re-exporta para no cambiar a quien lo importa de acá.
export { variantesTelefono } from "./tandas";

const recortar = (t: string, n: number) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);

/**
 * Manda por `numero` (el phone_number_id; por defecto, el del asistente de vendedores) y
 * devuelve el wamid que asignó Meta: con él se cruzan después los avisos de entrega.
 */
async function mensajes(cuerpo: Record<string, unknown>, numero?: string | null): Promise<string> {
  const desde = numero || process.env.WHATSAPP_PHONE_NUMBER_ID;
  const res = await fetch(`${GRAPH}/${version()}/${desde}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", ...cuerpo }),
    signal: AbortSignal.timeout(20_000),
  });
  const j = (await res.json().catch(() => null)) as { messages?: { id?: string }[]; error?: { message?: string; code?: number } } | null;
  if (!res.ok) {
    const codigo = typeof j?.error?.code === "number" ? j.error.code : null;
    throw new ErrorWhatsapp(`WhatsApp no aceptó el mensaje (${res.status}${codigo ? ` · ${codigo}` : ""}): ${j?.error?.message ?? "sin detalle"}`, codigo, res.status);
  }
  return j?.messages?.[0]?.id ?? "";
}

/** Uno o más mensajes (lo largo se parte): devuelve un wamid por parte. */
export async function enviarTexto(para: string, texto: string, numero?: string | null): Promise<string[]> {
  const ids: string[] = [];
  for (const parte of partir(texto, MAX_TEXTO)) {
    ids.push(await mensajes({ recipient_type: "individual", to: para, type: "text", text: { body: parte, preview_url: false } }, numero));
  }
  return ids;
}

/** Hasta 3 botones de respuesta (título de hasta 20 caracteres; el texto, hasta 1024). */
export async function enviarBotones(para: string, texto: string, botones: { id: string; titulo: string }[], numero?: string | null): Promise<string> {
  return mensajes({
    recipient_type: "individual",
    to: para,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: recortar(texto, 1024) },
      action: { buttons: botones.slice(0, 3).map((b) => ({ type: "reply", reply: { id: b.id.slice(0, 256), title: recortar(b.titulo, 20) } })) },
    },
  }, numero);
}

/** Un documento por link (WhatsApp lo baja al mandarlo: sirve una URL firmada de Storage). */
export async function enviarDocumento(para: string, url: string, nombre: string, epigrafe?: string, numero?: string | null): Promise<string> {
  return mensajes({
    recipient_type: "individual",
    to: para,
    type: "document",
    document: { link: url, filename: nombre, ...(epigrafe ? { caption: recortar(epigrafe, 1024) } : {}) },
  }, numero);
}

/** Una foto por link (JPG o PNG; WhatsApp no acepta otras como imagen). */
export async function enviarImagen(para: string, url: string, epigrafe?: string, numero?: string | null): Promise<string> {
  return mensajes({
    recipient_type: "individual",
    to: para,
    type: "image",
    image: { link: url, ...(epigrafe ? { caption: recortar(epigrafe, 1024) } : {}) },
  }, numero);
}

/**
 * Tildes azules y, si `escribiendo`, "escribiendo…" (dura hasta 25 s o hasta que sale la
 * respuesta). Si falla, no importa.
 */
export async function marcarLeido(wamid: string, numero?: string | null, escribiendo = true): Promise<void> {
  await mensajes({ status: "read", message_id: wamid, ...(escribiendo ? { typing_indicator: { type: "text" } } : {}) }, numero).catch(() => {});
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
