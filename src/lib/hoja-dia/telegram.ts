// El bot de Telegram de la Hoja del día: manda la hoja al capataz y los viajes al chofer, y
// recibe sus "Recibido", "Entendido", "Hecho" y "No pude" (decisión del dueño, 10/10 tarde:
// TELEGRAM EN VEZ DE WHATSAPP. La empresa ya usa Telegram —las cuadrillas mandan las fotos
// a un grupo, ver src/lib/mapa-obras/fotos-telegram.ts— y el bot puede escribirle primero a
// quien lo vinculó, sin plantillas de Meta).
//
// SOLO SERVER-SIDE: usa TELEGRAM_BOT_TOKEN y node:crypto. Nunca importar desde un componente.
//
// CÓMO SE VINCULA UNA PERSONA. El bot no puede escribirle a nadie que no le haya escrito
// antes. Por eso cada persona recibe UNA VEZ (por WhatsApp o en persona) un link
// t.me/<bot>?start=<código>; al tocarlo, Telegram le manda "/start <código>" al bot, el
// webhook guarda el chat en su legajo y le contesta "Listo, Ortega…". Desde ahí, todo llega
// solo. El código es de un solo uso.
//
// QUÉ ES "ENVIADA". Sólo cuando Telegram contestó `ok: true` al sendMessage. Si falla (la
// persona bloqueó el bot, borró el chat), la hoja NO queda enviada y la pantalla ofrece el
// camino manual (wa.me), que es el de siempre.
//
// LOS BOTONES. "Ver la hoja" es un botón de URL (abre /h/<token>); "Recibido", "Entendido",
// "Hecho" y "No pude" son botones de callback que llegan al webhook con un dato corto
// (`callback_data`, máximo 64 bytes): una letra y el id ("r:<link>:<versión>").

import { timingSafeEqual } from "node:crypto";

const API = "https://api.telegram.org";

export type BotonTelegram = { text: string; url?: string; callback_data?: string };
export type Teclado = BotonTelegram[][];
export type Resultado<T> = { ok: true; result: T } | { ok: false; error: string; codigo: number | null };
export type MensajeEnviado = { message_id: number; chat: { id: number }; date: number };

export const telegramConfigurado = () => !!process.env.TELEGRAM_BOT_TOKEN;

async function llamar<T>(metodo: string, params: Record<string, unknown>): Promise<Resultado<T>> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { ok: false, error: "Falta TELEGRAM_BOT_TOKEN: el bot no está configurado.", codigo: null };
  try {
    const res = await fetch(`${API}/bot${token}/${metodo}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
      signal: AbortSignal.timeout(10_000),
    });
    const body = (await res.json().catch(() => null)) as { ok?: boolean; result?: T; description?: string; error_code?: number } | null;
    if (body?.ok) return { ok: true, result: body.result as T };
    return { ok: false, error: traducirError(body?.description ?? `HTTP ${res.status}`), codigo: body?.error_code ?? res.status };
  } catch (e) {
    return { ok: false, error: `No se pudo hablar con Telegram (${e instanceof Error ? e.message : String(e)})`, codigo: null };
  }
}

/** Los errores de Telegram, en palabras de quien los va a leer en un toast. */
export function traducirError(d: string): string {
  if (/bot was blocked by the user/i.test(d)) return "La persona bloqueó el bot en Telegram: mandáselo a mano y pedile que lo desbloquee.";
  if (/chat not found/i.test(d)) return "Telegram no encuentra el chat: hay que volver a vincular a la persona.";
  if (/user is deactivated/i.test(d)) return "La cuenta de Telegram de la persona está desactivada.";
  if (/message is not modified/i.test(d)) return "El mensaje ya estaba así.";
  if (/Too Many Requests/i.test(d)) return "Telegram pide esperar unos segundos (demasiados mensajes seguidos).";
  return `Telegram: ${d}`;
}

const sinPreview = { link_preview_options: { is_disabled: true } };

export function enviarMensaje(chatId: number, texto: string, teclado?: Teclado | null): Promise<Resultado<MensajeEnviado>> {
  return llamar<MensajeEnviado>("sendMessage", { chat_id: chatId, text: texto, ...sinPreview, ...(teclado?.length ? { reply_markup: { inline_keyboard: teclado } } : {}) });
}
export function editarMensaje(chatId: number, messageId: number, texto: string, teclado?: Teclado | null): Promise<Resultado<unknown>> {
  return llamar("editMessageText", { chat_id: chatId, message_id: messageId, text: texto, ...sinPreview, reply_markup: { inline_keyboard: teclado ?? [] } });
}
export function editarBotones(chatId: number, messageId: number, teclado: Teclado | null): Promise<Resultado<unknown>> {
  return llamar("editMessageReplyMarkup", { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: teclado ?? [] } });
}
export function contestarBoton(callbackId: string, texto?: string): Promise<Resultado<boolean>> {
  return llamar<boolean>("answerCallbackQuery", { callback_query_id: callbackId, ...(texto ? { text: texto } : {}) });
}

let usernameCache: string | null = null;
/** El usuario del bot (sin @): de TELEGRAM_BOT_USERNAME o, si no está, de getMe (cacheado). */
export async function usuarioDelBot(): Promise<string | null> {
  const env = process.env.TELEGRAM_BOT_USERNAME?.replace(/^@/, "").trim();
  if (env) return env;
  if (usernameCache) return usernameCache;
  const r = await llamar<{ username?: string }>("getMe", {});
  usernameCache = r.ok ? r.result.username ?? null : null;
  return usernameCache;
}

export const linkVinculacion = (bot: string, codigo: string) => `https://t.me/${bot}?start=${codigo}`;

/**
 * El webhook sólo acepta pedidos con el secreto que se registró en setWebhook
 * (scripts/telegram-webhook.mjs). Falla cerrado: sin TELEGRAM_WEBHOOK_SECRET, nada pasa.
 */
export function secretoValido(recibido: string | null): boolean {
  const esperado = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!esperado || !recibido) return false;
  const a = Buffer.from(recibido);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

// ─── Botones (callback_data) ────────────────────────────────────────────────

export type Callback =
  | { a: "recibido"; link: string; version: number }
  | { a: "entendido"; link: string; version: number }
  | { a: "hecho"; viaje: string }
  | { a: "no_pude"; viaje: string }
  | { a: "motivo"; viaje: string; i: number }
  | { a: "volver"; viaje: string };

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

export function codificar(c: Callback): string {
  switch (c.a) {
    case "recibido": return `r:${c.link}:${c.version}`;
    case "entendido": return `e:${c.link}:${c.version}`;
    case "hecho": return `h:${c.viaje}`;
    case "no_pude": return `n:${c.viaje}`;
    case "motivo": return `m:${c.viaje}:${c.i}`;
    case "volver": return `x:${c.viaje}`;
  }
}

export function decodificar(data: string | null | undefined): Callback | null {
  if (!data) return null;
  let m = new RegExp(`^([re]):(${UUID}):(\\d{1,6})$`).exec(data);
  if (m) return { a: m[1] === "r" ? "recibido" : "entendido", link: m[2], version: Number(m[3]) };
  m = new RegExp(`^([hnx]):(${UUID})$`).exec(data);
  if (m) return { a: m[1] === "h" ? "hecho" : m[1] === "n" ? "no_pude" : "volver", viaje: m[2] };
  m = new RegExp(`^m:(${UUID}):(\\d{1,2})$`).exec(data);
  if (m) return { a: "motivo", viaje: m[1], i: Number(m[2]) };
  return null;
}

/** Telegram sólo acepta botones de URL con https (en local, sin dominio, no hay botón). */
const conUrl = (texto: string, url: string | null): BotonTelegram[] => (url && url.startsWith("https://") ? [{ text: texto, url }] : []);

/** La hoja o los viajes, recién mandados: "Ver la hoja" y "Recibido". */
export function tecladoHoja(url: string | null, linkId: string, version: number, chofer = false): Teclado {
  return [conUrl(chofer ? "Ver tus viajes" : "Ver la hoja", url), [{ text: "Recibido", callback_data: codificar({ a: "recibido", link: linkId, version }) }]].filter((f) => f.length);
}
/** Un cambio: "Entendido" (vale como un nuevo Recibido). */
export function tecladoCambio(url: string | null, linkId: string, version: number, chofer = false): Teclado {
  return [conUrl(chofer ? "Ver tus viajes" : "Ver la hoja", url), [{ text: "Entendido", callback_data: codificar({ a: "entendido", link: linkId, version }) }]].filter((f) => f.length);
}
/** Un viaje nuevo al chofer: "Hecho" / "No pude" y el link a sus viajes. */
export function tecladoViaje(url: string | null, viajeId: string): Teclado {
  return [
    [{ text: "Hecho", callback_data: codificar({ a: "hecho", viaje: viajeId }) }, { text: "No pude", callback_data: codificar({ a: "no_pude", viaje: viajeId }) }],
    conUrl("Ver tus viajes", url),
  ].filter((f) => f.length);
}
/** "No pude" abre los motivos rápidos, uno por fila (botones grandes) y "Volver". */
export function tecladoMotivos(viajeId: string, motivos: string[]): Teclado {
  return [
    ...motivos.map((m, i) => [{ text: m, callback_data: codificar({ a: "motivo", viaje: viajeId, i }) }]),
    [{ text: "Volver", callback_data: codificar({ a: "volver", viaje: viajeId }) }],
  ];
}

/** "/start abc123" → "abc123"; "/start" → "" ; otro texto → null. */
export function leerStart(texto: string | null | undefined): string | null {
  const m = /^\/start(?:@\w+)?(?:\s+(\S+))?\s*$/.exec((texto ?? "").trim());
  return m ? m[1] ?? "" : null;
}
