// Mandar la hoja y avisar los cambios (§11), por Telegram o a mano.
//
// SOLO SERVER-SIDE.
//
// DOS CAMINOS, UNA FILA. Cada persona que recibe algo ese día tiene su fila en hd_links
// (token, foto de lo mandado, estados). El envío por Telegram la marca "Enviada" SÓLO si
// Telegram contestó ok; el camino manual (WhatsApp con wa.me, para quien no vinculó
// Telegram, o si Telegram falló) la marca cuando el coordinador dice que lo mandó —con
// Deshacer, porque la app no puede saber si apretó "Enviar" en WhatsApp—.
//
// LO QUE SE MANDA SALE DE estado.ts + mensajes.ts con el día recién leído (sin caché): lo
// que llega al celular es lo que la pantalla muestra en ese momento, y la foto que se
// guarda es exactamente esa.

import { createAdminClient } from "@/lib/supabase/admin";
import { linkWhatsapp } from "@/lib/panol/whatsapp";
import { urlBase } from "@/lib/permisos-via-publica/endosos";
import type { DiaHoja, Fecha, Foto } from "./tipos";
import {
  destinatarios, estadoEnvio, fotoDe, minutosDesde, envioDe, nombreDe, viajeCalc, pedidosDeViaje, type Destinatario,
} from "./estado";
import { filaEnvio, mensajeCapatazPedido, mensajeDe, mensajeDeposito, mensajeOperario } from "./mensajes";
import { enviarMensaje, linkVinculacion, tecladoCambio, tecladoHoja, tecladoViaje, telegramConfigurado, usuarioDelBot, type Teclado } from "./telegram";
import { expiraDe, nuevoCodigoTelegram, nuevoToken, urlHoja } from "./tokens";
import { anotar, grabador, leerDia, type DB } from "./servicio";
import type { Resultado } from "./acciones";

type Fila = Record<string, unknown>;
const ts = () => new Date().toISOString();

export type CanalEnvio = "telegram" | "manual";

/** El chat de Telegram de una persona (Legajos o externa). */
async function chatDe(pid: string): Promise<number | null> {
  const adm = createAdminClient();
  const [a, b] = await Promise.all([
    adm.from("personal").select("telegram_chat_id").eq("id", pid).maybeSingle(),
    adm.from("pan_personas_externas").select("telegram_chat_id").eq("id", pid).maybeSingle(),
  ]);
  const v = a.data?.telegram_chat_id ?? b.data?.telegram_chat_id ?? null;
  return v == null ? null : Number(v);
}
const esExterna = (dia: DiaHoja, pid: string) => !!dia.personas.find((p) => p.id === pid)?.externa;
const celularDe = (dia: DiaHoja, pid: string) => dia.personas.find((p) => p.id === pid)?.celular ?? null;

/** El link vigente de la persona ese día; si no hay (o cambió de rol), uno nuevo. */
export async function asegurarLink(db: DB, dia: DiaHoja, x: Destinatario): Promise<Fila> {
  const pid = x.pid!;
  const col = esExterna(dia, pid) ? "externa_id" : "persona_id";
  const r = await db.from("hd_links").select("*").eq("fecha", dia.fecha).eq(col, pid).is("anulado_at", null).maybeSingle();
  const rol = x.rol === "chofer" ? "chofer" : "a_cargo";
  if (r.data && (x.rol === "ex" || (r.data.rol === rol && (rol === "chofer" || Number(r.data.cuadrilla_odoo_id) === x.c)))) return r.data;
  if (r.data) await db.from("hd_links").update({ anulado_at: ts(), anulado_motivo: "Cambió de rol" }).eq("id", r.data.id);
  const n = await db.from("hd_links").insert({
    token: nuevoToken(), fecha: dia.fecha, [col]: pid, rol, cuadrilla_odoo_id: x.rol === "cargo" ? x.c : null, expira_at: expiraDe(dia.fecha),
  }).select("*").single();
  if (n.error) throw new Error(`No se pudo crear el link: ${n.error.message}`);
  return n.data;
}

export type Preparado = {
  pid: string;
  rol: Destinatario["rol"];
  fila: string;
  estado: ReturnType<typeof estadoEnvio>["k"];
  /** El texto como va por WhatsApp (con el link escrito). */
  texto: string | null;
  /** wa.me con el texto, o null si no tiene celular. */
  waLink: string | null;
  link: string | null;
  /** Se le puede mandar por Telegram (vinculado y el bot configurado). */
  telegram: boolean;
};

function destinatarioDe(dia: DiaHoja, pid: string): Destinatario {
  const x = destinatarios(dia).find((d) => d.pid === pid);
  if (!x) throw new Error(`${nombreDe(dia, pid) || "Esa persona"} no tiene nada para recibir ese día.`);
  return x;
}

/** Arma el mensaje y el link de una persona (crea el link si no tenía) sin mandar nada. */
export async function preparar(db: DB, fecha: Fecha, pid: string, origen?: string | null, diaLeido?: DiaHoja): Promise<Preparado> {
  const dia = diaLeido ?? (await leerDia(fecha));
  const x = destinatarioDe(dia, pid);
  const l = await asegurarLink(db, dia, x);
  const url = urlHoja(urlBase(origen), String(l.token));
  const ahora = minutosDesde(fecha, new Date());
  const texto = mensajeDe(dia, x, { canal: "whatsapp", link: url, ahora });
  const p = dia.personas.find((q) => q.id === pid);
  return {
    pid, rol: x.rol, fila: filaEnvio(dia, x), estado: estadoEnvio(dia, x).k, texto,
    waLink: texto ? linkWhatsapp(celularDe(dia, pid), texto) : null, link: url,
    telegram: !!p?.telegram && telegramConfigurado(),
  };
}

/** La lista de envío entera ("Mandar las hojas del martes 13"). */
export async function prepararTodos(db: DB, fecha: Fecha, origen?: string | null): Promise<Preparado[]> {
  const dia = await leerDia(fecha);
  const out: Preparado[] = [];
  for (const x of destinatarios(dia)) if (x.pid) out.push(await preparar(db, fecha, x.pid, origen, dia));
  return out;
}

/**
 * Manda (Telegram) o marca como mandado (manual) lo que le toca a una persona: la hoja
 * entera, el cambio, el viaje nuevo, o el "ya no estás a cargo". Devuelve el texto, y si
 * Telegram falló, el wa.me para mandarlo a mano (y NO marca nada).
 */
export async function enviar(db: DB, userId: string, fecha: Fecha, pid: string, canal: CanalEnvio, origen?: string | null, diaLeido?: DiaHoja): Promise<Resultado> {
  const dia = diaLeido ?? (await leerDia(fecha));
  const x = destinatarioDe(dia, pid);
  const st = estadoEnvio(dia, x);
  const l = await asegurarLink(db, dia, x);
  const url = urlHoja(urlBase(origen), String(l.token));
  const ahora = minutosDesde(fecha, new Date());
  const texto = mensajeDe(dia, x, { canal: canal === "telegram" ? "telegram" : "whatsapp", link: url, ahora });
  if (!texto) throw new Error("No hay nada para mandarle.");
  const primera = st.k === "sinenviar" || st.k === "anulado" || st.k === "sinrecibe";
  const version = Number(l.version ?? 0) + 1;
  const chofer = x.rol === "chofer";
  const foto: Foto | null = x.rol === "ex" ? null : fotoDe(dia, pid);
  const nuevos = st.k === "cambiada" ? st.ds.filter((d) => d.nuevo) : [];
  const unViajeNuevo = chofer && nuevos.length === 1 && st.k === "cambiada" && st.ds.length === nuevos.length ? nuevos[0].v?.k ?? null : null;

  let messageId: number | null = null;
  if (canal === "telegram") {
    const chat = await chatDe(pid);
    if (!chat) throw new Error(`${nombreDe(dia, pid)} no tiene Telegram vinculado: mandáselo a mano.`);
    const teclado: Teclado = x.rol === "ex" ? [] : primera ? tecladoHoja(url, String(l.id), version, chofer)
      : unViajeNuevo ? [...tecladoViaje(url, unViajeNuevo).slice(0, 1), ...tecladoCambio(url, String(l.id), version, chofer)]
      : tecladoCambio(url, String(l.id), version, chofer);
    const r = await enviarMensaje(chat, texto, teclado);
    await createAdminClient().from("hd_telegram_mensajes").insert({
      fecha, link_id: l.id, viaje_id: unViajeNuevo, [esExterna(dia, pid) ? "externa_id" : "persona_id"]: pid, chat_id: chat,
      message_id: r.ok ? r.result.message_id : null, tipo: x.rol === "ex" ? "otro" : primera ? "hoja" : unViajeNuevo ? "viaje_nuevo" : "cambio",
      texto, botones: teclado, version, ok: r.ok, error: r.ok ? null : r.error, enviado_por: userId,
    });
    if (!r.ok) {
      // NO se marca "Enviada": la pantalla ofrece el camino manual con el mismo texto.
      const textoWa = mensajeDe(dia, x, { canal: "whatsapp", link: url, ahora })!;
      return { ok: true, enviado: false, texto: r.error, historialId: null, waLink: linkWhatsapp(celularDe(dia, pid), textoWa), mensaje: textoWa };
    }
    messageId = r.result.message_id;
  }

  const g = grabador(db);
  if (x.rol === "ex") {
    await g.actualizar("hd_links", String(l.id), { anulado_at: ts(), anulado_motivo: "Ya no está a cargo (avisado)" });
  } else if (primera) {
    await g.actualizar("hd_links", String(l.id), {
      enviada_at: ts(), enviada_por: userId, enviada_canal: canal, snap: foto, snap_primero: foto, snap_recibido: null, snap_ok: null, ok_at: null,
      abierta_at: null, recibida_at: null, cambio_at: null, cambio_diffs: null, version,
    });
  } else {
    await g.actualizar("hd_links", String(l.id), { cambio_at: ts(), cambio_diffs: st.k === "cambiada" ? st.ds.map(({ v, ...d }) => { void v; return d; }) : null, snap: foto, snap_ok: null, ok_at: null, version });
  }
  const que = x.rol === "ex" ? "Avisado que ya no está a cargo" : primera ? "Hoja enviada" : "Cambio avisado";
  const textoH = `${que}: ${nombreDe(dia, pid)}${canal === "telegram" ? " (Telegram)" : " (a mano)"}`;
  const historialId = await anotar(db, userId, { fecha, entidad: "link", entidadId: String(l.id), accion: primera ? "enviar" : "avisar", texto: textoH }, g.cambios);
  return { ok: true, enviado: true, texto: textoH, historialId: historialId || null, messageId, mensaje: texto };
}

/** "Enviar a los capataces": todo lo pendiente por Telegram; lo que no se puede, a mano. */
export async function enviarTodos(db: DB, userId: string, fecha: Fecha, origen?: string | null): Promise<{ enviados: string[]; aMano: Preparado[]; errores: { pid: string; error: string }[] }> {
  const dia = await leerDia(fecha);
  const enviados: string[] = [];
  const aMano: Preparado[] = [];
  const errores: { pid: string; error: string }[] = [];
  for (const x of destinatarios(dia)) {
    if (!x.pid) continue;
    const st = estadoEnvio(dia, x);
    if (!["sinenviar", "anulado", "cambiada", "ex"].includes(st.k)) continue;
    const p = dia.personas.find((q) => q.id === x.pid);
    if (p?.telegram && telegramConfigurado()) {
      try {
        const r = await enviar(db, userId, fecha, x.pid, "telegram", origen, dia);
        if (r.enviado) enviados.push(x.pid);
        else { errores.push({ pid: x.pid, error: r.texto }); aMano.push(await preparar(db, fecha, x.pid, origen, dia)); }
      } catch (e) {
        errores.push({ pid: x.pid, error: e instanceof Error ? e.message : String(e) });
      }
    } else aMano.push(await preparar(db, fecha, x.pid, origen, dia));
  }
  return { enviados, aMano, errores };
}

/** "No hace falta avisar": la hoja de ahora queda como buena sin mandar nada. */
export async function noHaceFalta(db: DB, userId: string, fecha: Fecha, pid: string): Promise<Resultado> {
  const dia = await leerDia(fecha);
  const e = envioDe(dia, pid);
  if (!e) throw new Error("No se le mandó nada todavía.");
  const g = grabador(db);
  await g.actualizar("hd_links", e.id, { snap_ok: fotoDe(dia, pid), ok_at: ts() });
  const texto = `No se le avisa a ${nombreDe(dia, pid)}. Su hoja queda «sin avisar» en gris`;
  return { ok: true, texto, historialId: (await anotar(db, userId, { fecha, entidad: "link", entidadId: e.id, accion: "no_hace_falta", texto }, g.cambios)) || null };
}

/** "Reenviar" a quien no la abrió: el mismo mensaje de la hoja. */
export async function reenviar(db: DB, userId: string, fecha: Fecha, pid: string, canal: CanalEnvio, origen?: string | null): Promise<Resultado> {
  const dia = await leerDia(fecha);
  const e = envioDe(dia, pid);
  if (!e || e.enviadaMin == null) return enviar(db, userId, fecha, pid, canal, origen, dia);
  const x = destinatarioDe(dia, pid);
  const url = urlHoja(urlBase(origen), e.token);
  const ahora = minutosDesde(fecha, new Date());
  if (canal === "telegram") {
    const chat = await chatDe(pid);
    if (!chat) throw new Error(`${nombreDe(dia, pid)} no tiene Telegram vinculado.`);
    const texto = mensajeDe(dia, { ...x }, { canal: "telegram", link: url, ahora })!;
    const r = await enviarMensaje(chat, texto, tecladoHoja(url, e.id, e.version, x.rol === "chofer"));
    await createAdminClient().from("hd_telegram_mensajes").insert({ fecha, link_id: e.id, [esExterna(dia, pid) ? "externa_id" : "persona_id"]: pid, chat_id: chat, message_id: r.ok ? r.result.message_id : null, tipo: "hoja", texto, version: e.version, ok: r.ok, error: r.ok ? null : r.error, enviado_por: userId });
    if (!r.ok) return { ok: true, enviado: false, texto: r.error, historialId: null };
  }
  const g = grabador(db);
  await g.actualizar("hd_links", e.id, { reenviada_at: ts() });
  const texto = `Reenviada a ${nombreDe(dia, pid)}`;
  return { ok: true, enviado: true, texto, historialId: (await anotar(db, userId, { fecha, entidad: "link", entidadId: e.id, accion: "reenviar", texto }, g.cambios)) || null };
}

/** "Anular link" (teléfono perdido, mensaje mandado a otro): el viejo deja de andar. */
export async function anularLink(db: DB, userId: string, fecha: Fecha, pid: string): Promise<Resultado> {
  const dia = await leerDia(fecha, { cacheOdoo: true });
  const e = envioDe(dia, pid);
  if (!e || e.anulado) throw new Error("No tiene un link vigente.");
  const g = grabador(db);
  await g.actualizar("hd_links", e.id, { anulado_at: ts(), anulado_motivo: "Anulado desde el escritorio" });
  const texto = `Link de ${nombreDe(dia, pid)} anulado. Al abrirlo ve «El link no es válido». Mandale uno nuevo`;
  return { ok: true, texto, historialId: (await anotar(db, userId, { fecha, entidad: "link", entidadId: e.id, accion: "anular_link", texto }, g.cambios)) || null };
}

/** Un aviso suelto: al operario que entra, al depósito, al capataz que pidió. Telegram si se puede; si no, wa.me. */
async function avisoSuelto(
  db: DB, userId: string, fecha: Fecha, texto: string, a: { chat: number | null; celular: string | null; personaId?: string | null; externa?: boolean; viajeId?: string | null; tipo: "operario" | "deposito" | "otro" },
  canal: CanalEnvio, anotacion: { entidad: string; entidadId: string; accion: string; texto: string },
): Promise<Resultado> {
  if (canal === "telegram") {
    if (!a.chat) throw new Error("No tiene Telegram vinculado: mandalo a mano.");
    const r = await enviarMensaje(a.chat, texto);
    await createAdminClient().from("hd_telegram_mensajes").insert({ fecha, viaje_id: a.viajeId ?? null, ...(a.personaId ? { [a.externa ? "externa_id" : "persona_id"]: a.personaId } : {}), chat_id: a.chat, message_id: r.ok ? r.result.message_id : null, tipo: a.tipo, texto, ok: r.ok, error: r.ok ? null : r.error, enviado_por: userId });
    if (!r.ok) return { ok: true, enviado: false, texto: r.error, historialId: null, waLink: linkWhatsapp(a.celular, texto), mensaje: texto };
  }
  const id = await anotar(db, userId, { fecha, ...anotacion });
  return { ok: true, enviado: canal === "telegram", texto: anotacion.texto, historialId: id || null, waLink: canal === "manual" ? linkWhatsapp(a.celular, texto) : null, mensaje: texto };
}

export async function avisarOperario(db: DB, userId: string, fecha: Fecha, pid: string, canal: CanalEnvio | "no_hace_falta"): Promise<Resultado> {
  const dia = await leerDia(fecha, { cacheOdoo: true });
  if (canal === "no_hace_falta") {
    const id = await anotar(db, userId, { fecha, entidad: "persona", entidadId: pid, accion: "no_avisar_operario", texto: `No se le avisa a ${nombreDe(dia, pid)}` });
    return { ok: true, texto: `No se le avisa a ${nombreDe(dia, pid)}`, historialId: id || null };
  }
  const texto = mensajeOperario(dia, pid, minutosDesde(fecha, new Date()));
  if (!texto) throw new Error(`${nombreDe(dia, pid)} no está en ninguna cuadrilla ese día.`);
  return avisoSuelto(db, userId, fecha, texto, { chat: await chatDe(pid), celular: celularDe(dia, pid), personaId: pid, externa: esExterna(dia, pid), tipo: "operario" }, canal,
    { entidad: "persona", entidadId: pid, accion: "avisar_operario", texto: `Avisado a ${nombreDe(dia, pid)}` });
}

export async function avisarDeposito(db: DB, userId: string, fecha: Fecha, viajeId: string, canal: CanalEnvio): Promise<Resultado> {
  const dia = await leerDia(fecha, { cacheOdoo: true });
  const v = viajeCalc(dia, viajeId);
  if (!v) throw new Error("Ese viaje ya no existe.");
  const dep = dia.parametros.deposito;
  return avisoSuelto(db, userId, fecha, mensajeDeposito(dia, v), { chat: dep.telegramChatId, celular: dep.telefono, viajeId, tipo: "deposito" }, canal,
    { entidad: "viaje", entidadId: viajeId, accion: "avisar_deposito", texto: "Avisado al depósito" });
}

export async function avisarCapatazPedido(db: DB, userId: string, fecha: Fecha, pedidoId: string, canal: CanalEnvio): Promise<Resultado> {
  const dia = await leerDia(fecha, { cacheOdoo: true });
  const p = dia.pedidos.find((x) => x.id === pedidoId);
  const v = p?.viajeId ? viajeCalc(dia, p.viajeId) : null;
  if (!p || !v || !p.pidioId) throw new Error("Ese pedido no está en un camión o no lo pidió nadie de una cuadrilla.");
  void pedidosDeViaje;
  return avisoSuelto(db, userId, fecha, mensajeCapatazPedido(dia, p, v)!, { chat: await chatDe(p.pidioId), celular: celularDe(dia, p.pidioId), personaId: p.pidioId, externa: esExterna(dia, p.pidioId), tipo: "otro" }, canal,
    { entidad: "pedido", entidadId: pedidoId, accion: "avisar_capataz", texto: `Avisado a ${nombreDe(dia, p.pidioId)}` });
}

// ─── Vincular Telegram ──────────────────────────────────────────────────────

export type EstadoTelegram = { configurado: boolean; bot: string | null; vinculados: { personaId: string; usuario: string | null; desde: string | null }[] };

export async function estadoTelegram(): Promise<EstadoTelegram> {
  const adm = createAdminClient();
  const [a, b] = await Promise.all([
    adm.from("personal").select("id, telegram_usuario, telegram_vinculado_at").not("telegram_chat_id", "is", null),
    adm.from("pan_personas_externas").select("id, telegram_usuario, telegram_vinculado_at").not("telegram_chat_id", "is", null),
  ]);
  const bot = telegramConfigurado() ? await usuarioDelBot() : null;
  return {
    configurado: telegramConfigurado(), bot,
    vinculados: [...(a.data ?? []), ...(b.data ?? [])].map((x) => ({ personaId: String(x.id), usuario: (x.telegram_usuario as string) ?? null, desde: (x.telegram_vinculado_at as string) ?? null })),
  };
}

/**
 * El link de vinculación de una persona: t.me/<bot>?start=<código>, de un solo uso. Se
 * manda UNA VEZ (por WhatsApp o en persona); los códigos anteriores sin usar se anulan.
 */
export async function linkDeVinculacion(userId: string, pid: string): Promise<{ link: string; waLink: string | null; texto: string }> {
  const bot = await usuarioDelBot();
  if (!bot) throw new Error("El bot de Telegram no está configurado (faltan TELEGRAM_BOT_TOKEN o TELEGRAM_BOT_USERNAME).");
  const adm = createAdminClient();
  const p = await adm.from("personal").select("id, apellido, telefono").eq("id", pid).maybeSingle();
  const x = p.data ? null : (await adm.from("pan_personas_externas").select("id, apellido, telefono").eq("id", pid).maybeSingle()).data;
  const fila = p.data ?? x;
  if (!fila) throw new Error("Esa persona no existe.");
  const col = p.data ? "persona_id" : "externa_id";
  await adm.from("hd_telegram_codigos").update({ expira_at: ts() }).eq(col, pid).is("usado_at", null);
  const codigo = nuevoCodigoTelegram();
  const r = await adm.from("hd_telegram_codigos").insert({ codigo, [col]: pid, creado_por: userId });
  if (r.error) throw new Error(r.error.message);
  const link = linkVinculacion(bot, codigo);
  const texto = `Hola, te escribimos de Andamios Buenos Aires. Tocá este link para recibir tus hojas del día por Telegram: ${link}`;
  await anotar(adm, userId, { fecha: null, entidad: "telegram", entidadId: pid, accion: "link_vinculacion", texto: "Link de vinculación de Telegram generado" });
  return { link, waLink: linkWhatsapp((fila.telefono as string) ?? null, texto), texto };
}

export async function desvincular(userId: string, pid: string): Promise<Resultado> {
  const adm = createAdminClient();
  const v = { telegram_chat_id: null, telegram_usuario: null, telegram_vinculado_at: null };
  await adm.from("personal").update(v).eq("id", pid);
  await adm.from("pan_personas_externas").update(v).eq("id", pid);
  const id = await anotar(adm, userId, { fecha: null, entidad: "telegram", entidadId: pid, accion: "desvincular", texto: "Telegram desvinculado" });
  return { ok: true, texto: "Telegram desvinculado: las hojas se le mandan a mano", historialId: id || null };
}
