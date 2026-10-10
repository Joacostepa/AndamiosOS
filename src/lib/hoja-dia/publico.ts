// El link del capataz y del chofer (/h/<token>) y el webhook de Telegram: lo que entra a la
// Hoja del día SIN sesión.
//
// SOLO SERVER-SIDE, con la service role. Por eso cada función empieza validando: el token
// (que exista, que no esté anulado ni vencido, que la persona siga a cargo o siga siendo
// chofer ese día) o el chat de Telegram (que sea el de la persona del link o del viaje).
//
// MUESTRA LO MÍNIMO (§14): nombres y celulares de los que van ese día, contactos y archivos
// de las obras de esa hoja; al chofer, sus viajes. Nada de DNI, legajos, otras cuadrillas
// ni viajes de otros. ESCRIBE LO MÍNIMO: "Recibido", "Entendido", y el chofer "Hecho" /
// "No pude" sólo sobre SUS viajes de ese día.

import { createAdminClient } from "@/lib/supabase/admin";
import { fetchDocumentosOt } from "@/lib/odoo/asignaciones";
import { tipoOtLabel } from "@/lib/tablero/tipos";
import type { Fecha, Foto } from "./tipos";
import { esHoy, hm, minutosDesde, cap, lowFirst, diaSemana, ddmm } from "./estado";
import { armarVista, otsConArchivos, type ArchivoPublico, type LinkVista, type VistaPublica } from "./vista";
import { TELEGRAM } from "./mensajes";
import { codigoValido, situacionLink, tokenValido } from "./tokens";
import { anotar, avisarPantallas, conGrabador, grabador, leerDia } from "./servicio";
import { porQueNoPuedeMarcar, recibidoVigente } from "./reglas-publico";
import { MAX_FOTO, tipoImagen } from "./archivo-seguro";
import { deshacerEstadoViaje, marcarHecho, marcarNoPude } from "./acciones";
import {
  contestarBoton, decodificar, editarBotones, editarMensaje, enviarMensaje, leerStart, tecladoMotivos, tecladoViaje, type Teclado,
} from "./telegram";

type Fila = Record<string, unknown>;
const ts = () => new Date().toISOString();

// ═══════════════════════════ La vista del celular ═════════════════════════════

export type {
  ArchivoPublico, CambioPublico, ChoferDeHoja, GentePublica, LineaObra, ObraPublica, TuPedido, ViajePublico, VistaCapataz, VistaChofer,
  VistaPublica,
} from "./vista";

const archivosCache = new Map<number, { at: number; datos: Promise<ArchivoPublico[]> }>();
function archivos(token: string, otId: number): Promise<ArchivoPublico[]> {
  const hit = archivosCache.get(otId);
  const datos = hit && Date.now() - hit.at < 10 * 60_000 ? hit.datos
    : fetchDocumentosOt(otId).then((ds) => ds.map((d) => ({ id: d.id, nombre: d.nombre, mimetype: d.mimetype, url: "" }))).catch(() => []);
  if (!hit || hit.datos !== datos) archivosCache.set(otId, { at: Date.now(), datos });
  return datos.then((ds) => ds.map((d) => ({ ...d, url: `/api/public/hoja/${token}/archivo/${d.id}` })));
}

/** Lo que ve quien abre el link. La vista la arma `armarVista` (vista.ts, pura y con tests). */
export async function vistaPublica(token: string): Promise<{ vista: VistaPublica; link: Fila | null }> {
  if (!tokenValido(token)) return { vista: { situacion: "invalido" }, link: null };
  const adm = createAdminClient();
  const r = await adm.from("hd_links").select("*").eq("token", token).maybeSingle();
  const l = r.data;
  if (!l) return { vista: { situacion: "invalido" }, link: null };
  const fecha = String(l.fecha);
  const sit = situacionLink({ fecha, expira_at: String(l.expira_at), anulado_at: (l.anulado_at as string) ?? null });
  if (sit === "vencido") {
    const co = (await adm.from("hd_parametros").select("valor").eq("clave", "coordinador").maybeSingle()).data?.valor as { nombre?: string; telefono?: string | null } | undefined;
    const coordinador = { nombre: co?.nombre ?? "la oficina", telefono: co?.telefono ?? null };
    return { vista: { situacion: "vencido", fecha, coordinador, texto: `Este link era de la hoja del ${diaSemana(fecha)} ${Number(fecha.slice(8))}. Pedile la nueva a ${coordinador.nombre}.` }, link: l };
  }
  // Límite de lecturas (el celular consulta cada 30 s; esto frena a quien martille con un token).
  await contar(String(l.id), "lectura");
  const dia = await leerDia(fecha, { cacheOdoo: true });
  const link: LinkVista = {
    rol: l.rol === "a_cargo" ? "a_cargo" : "chofer",
    personaId: String(l.persona_id ?? l.externa_id),
    cuadrillaOdooId: l.cuadrilla_odoo_id != null ? Number(l.cuadrilla_odoo_id) : null,
    anulado: !!l.anulado_at,
    anuladoPorRol: !!l.anulado_at && /rol|a cargo/i.test(String(l.anulado_motivo ?? "")),
    version: Number(l.version ?? 0),
  };
  const ots = otsConArchivos(dia, link);
  const arch = new Map(await Promise.all(ots.map(async (ot) => [ot, await archivos(token, ot)] as const)));
  const vista = armarVista(dia, link, minutosDesde(fecha, new Date()), { archivos: (ot) => arch.get(ot) ?? [], tipoTxt: tipoOtLabel });
  return { vista, link: l };
}

/** Que abrió el link: "Abierta 20:15" en el escritorio. Nunca tira. */
export async function anotarVista(l: Fila): Promise<void> {
  try {
    const adm = createAdminClient();
    const v: Fila = { ultima_vista_at: ts(), version_vista: l.version };
    const primeraDesdeCambio = !l.abierta_at || (l.cambio_at && String(l.abierta_at) < String(l.cambio_at));
    if (l.enviada_at && primeraDesdeCambio) v.abierta_at = ts();
    await adm.from("hd_links").update(v).eq("id", l.id);
    if (v.abierta_at) await avisarPantallas(String(l.fecha), "abrió su hoja");
  } catch (e) {
    console.error("[hoja-dia] no se pudo anotar que abrió el link", e instanceof Error ? e.message : e);
  }
}

// ═══════════════════════════ Lo que se toca en el celular ═════════════════════

export type AccionPublica =
  | { accion: "recibido" | "entendido"; version?: number | null }
  | { accion: "hecho" | "deshacer"; viajeId: string }
  | { accion: "no_pude"; viajeId: string; motivo: string };

/** Cuándo se tocó: el que manda el celular (sin señal llega después) si es creíble; si no, ahora. */
function instante(at: string | null | undefined): string {
  const t = at ? Date.parse(at) : NaN;
  const now = Date.now();
  return Number.isFinite(t) && t <= now + 60_000 && t >= now - 12 * 3_600_000 ? new Date(Math.min(t, now)).toISOString() : new Date(now).toISOString();
}

/** "Recibido" / "Entendido": vale para la versión que tenía delante. */
export async function confirmarRecibido(l: Fila, at: string, origen: "link" | "telegram"): Promise<string> {
  const adm = createAdminClient();
  const g = grabador(adm);
  await g.actualizar("hd_links", String(l.id), { recibida_at: at, version_recibida: l.version, snap_recibido: l.snap as Foto, ...(l.abierta_at ? {} : { abierta_at: at }) });
  const fecha = String(l.fecha);
  const nombre = await nombreDeLink(l);
  const entendido = !!l.cambio_at;
  const texto = `${nombre}: ${entendido ? "entendido" : "recibido"} ${hm(minutosDesde(fecha, at))}`;
  await anotar(null, { fecha, entidad: "link", entidadId: String(l.id), accion: entendido ? "entendido" : "recibido", texto, origen, porTexto: nombre }, g.cambios);
  await avisarPantallas(fecha, entendido ? "entendió el cambio" : "tocó Recibido", nombre);
  return texto;
}

async function nombreDeLink(l: Fila): Promise<string> {
  const adm = createAdminClient();
  const t = l.persona_id ? "personal" : "pan_personas_externas";
  const r = await adm.from(t).select("apellido").eq("id", l.persona_id ?? l.externa_id).maybeSingle();
  return r.data ? cap(String(r.data.apellido).toLowerCase()) : "El chofer";
}

/** El viaje, si este chofer lo puede marcar (reglas-publico.ts). Si no, tira con el porqué. */
async function viajeDelChofer(l: Fila, viajeId: string): Promise<Fila> {
  const adm = createAdminClient();
  const v = (await adm.from("hd_viajes").select("*").eq("id", viajeId).maybeSingle()).data;
  let delCamion: string | null = null;
  if (v && !v.chofer_id && v.vehiculo_id) {
    const cam = await adm.from("hd_camiones_dia").select("chofer_id, sin_chofer").eq("fecha", l.fecha).eq("vehiculo_id", v.vehiculo_id).maybeSingle();
    const hab = await adm.from("vehiculos").select("chofer_habitual_id").eq("id", v.vehiculo_id).maybeSingle();
    delCamion = (cam.data ? (cam.data.sin_chofer ? null : cam.data.chofer_id) : hab.data?.chofer_habitual_id) ?? null;
  }
  const no = porQueNoPuedeMarcar(
    v ? { fecha: String(v.fecha), estado: String(v.estado), chofer_id: (v.chofer_id as string) ?? null, vehiculo_id: (v.vehiculo_id as string) ?? null } : null,
    { fecha: String(l.fecha), rol: String(l.rol), personaId: String(l.persona_id ?? l.externa_id) },
    delCamion,
  );
  if (no) throw new Error(no);
  return v!;
}

/**
 * Marca un viaje desde el link o Telegram. Si ya estaba así (un reintento del celular sin
 * señal, un botón tocado dos veces), no anota nada ni avisa de nuevo.
 */
export async function marcarViajeDesdeChofer(l: Fila, viajeId: string, que: "hecho" | "no_pude" | "deshacer", motivo: string | null, at: string, origen: "link" | "telegram"): Promise<string> {
  const v = await viajeDelChofer(l, viajeId);
  const adm = createAdminClient();
  const fecha = String(l.fecha);
  const nombre = await nombreDeLink(l);
  const hora = hm(minutosDesde(fecha, at));
  const r = await conGrabador(adm, null, { fecha, entidad: "viaje", entidadId: viajeId, viajeId, accion: que, origen, porTexto: nombre }, async (g) => {
    let texto: string;
    let cambio: boolean;
    if (que === "hecho") { cambio = await marcarHecho(g, v, "chofer", at); texto = `${nombre}: hecho ${hora}`; }
    else if (que === "no_pude") { cambio = await marcarNoPude(g, v, motivo ?? "Otro (te llamo)", at); texto = `${nombre} no pudo (${hora}): ${lowFirst(motivo ?? "")}`; }
    else {
      // El "Deshacer" de 10 segundos: sólo lo que marcó él, y hace poco.
      if (v.hecho_por && v.hecho_por !== "chofer") throw new Error("Eso lo marcó la oficina.");
      if (v.hecho_at && Date.now() - Date.parse(String(v.hecho_at)) > 15 * 60_000) throw new Error("Pasó mucho tiempo: llamá a la oficina.");
      cambio = await deshacerEstadoViaje(g, v);
      texto = `${nombre} deshizo lo que marcó`;
    }
    if (cambio) await anotar(null, { fecha, entidad: "viaje", entidadId: viajeId, viajeId, accion: que, texto, origen, porTexto: nombre }, g.cambios);
    return { texto, cambio };
  });
  if (r.cambio) await avisarPantallas(fecha, que === "hecho" ? "marcó Hecho" : que === "no_pude" ? "marcó No pude" : "deshizo un viaje", nombre);
  return r.texto;
}

/** Demasiados pedidos de un mismo link en un minuto (la ruta contesta 429). */
export class DemasiadosPedidos extends Error {
  constructor() {
    super("Demasiados pedidos seguidos: esperá un minuto.");
    this.name = "DemasiadosPedidos";
  }
}
const LIMITE = { toque: 30, lectura: 120 } as const;

/** Suma un pedido al link (atómico, hd_contar) y tira DemasiadosPedidos si pasó el límite. */
async function contar(linkId: string, tipo: "toque" | "lectura"): Promise<void> {
  const r = await createAdminClient().rpc("hd_contar", { p_link: linkId, p_tipo: tipo });
  if (r.error) { console.error("[hoja-dia] no se pudo contar el pedido", r.error.message); return; }
  if (Number(r.data) > LIMITE[tipo]) throw new DemasiadosPedidos();
}

type Rechazo = { ok: false; error: string; status: number };

/** El link para escribir (toque o foto): válido, vigente, y dentro del límite. */
async function linkParaEscribir(token: string): Promise<Fila | Rechazo> {
  if (!tokenValido(token)) return { ok: false, error: "El link no es válido.", status: 404 };
  const adm = createAdminClient();
  const l = (await adm.from("hd_links").select("*").eq("token", token).maybeSingle()).data;
  if (!l || l.anulado_at) return { ok: false, error: "El link no es válido.", status: 404 };
  if (situacionLink({ fecha: String(l.fecha), expira_at: String(l.expira_at), anulado_at: null }) === "vencido") return { ok: false, error: "Este link ya venció.", status: 410 };
  try {
    await contar(String(l.id), "toque");
  } catch (e) {
    return { ok: false, error: (e as Error).message, status: 429 };
  }
  return l;
}
const esRechazo = (x: Fila | Rechazo): x is Rechazo => (x as Rechazo).ok === false;

/** POST del link. Límite: 30 toques por minuto por token (hd_contar). */
export async function accionPublica(token: string, a: AccionPublica, at?: string | null): Promise<{ ok: true; texto: string } | Rechazo> {
  const l = await linkParaEscribir(token);
  if (esRechazo(l)) return l;
  const cuando = instante(at);
  try {
    if (a.accion === "recibido" || a.accion === "entendido") {
      // I2: lo que confirma es la versión que tenía delante; si cambió después, que mire la nueva.
      if (!recibidoVigente(a.version, Number(l.version ?? 0))) return { ok: false, error: TELEGRAM.versionVieja, status: 409 };
      const texto = await confirmarRecibido(l, cuando, "link");
      await marcarMensajesTelegram(String(l.id), (min) => (l.cambio_at ? TELEGRAM.entendido(min) : TELEGRAM.recibido(min)), String(l.fecha), cuando);
      return { ok: true, texto };
    }
    const b = a as Exclude<AccionPublica, { accion: "recibido" | "entendido" }>;
    return { ok: true, texto: await marcarViajeDesdeChofer(l, b.viajeId, b.accion, b.accion === "no_pude" ? b.motivo : null, cuando, "link") };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e), status: 403 };
  }
}

/**
 * La foto del remito (§12, el hueco de handoff.md): el chofer la saca después de "Hecho".
 * Valida el token y que el viaje sea SUYO (porQueNoPuedeMarcar: de ese día, no anulado),
 * mira que sea una imagen por los bytes y que no pase de MAX_FOTO, la guarda en el bucket
 * privado `hoja-dia` (viajes/{fecha}/{viaje}/{hora}.{ext}) y anota la ruta en el viaje.
 * La pantalla la ve con una URL firmada (fotoDelViaje). Una foto nueva reemplaza a la
 * anterior en el viaje; la vieja queda en el bucket.
 */
export async function subirFotoRemito(token: string, viajeId: string, bytes: Uint8Array): Promise<{ ok: true; texto: string } | Rechazo> {
  const l = await linkParaEscribir(token);
  if (esRechazo(l)) return l;
  if (bytes.length > MAX_FOTO) return { ok: false, error: "La foto es muy pesada (más de 4 MB).", status: 413 };
  const tipo = tipoImagen(bytes);
  if (!tipo) return { ok: false, error: "Eso no es una foto (JPG, PNG o WebP).", status: 415 };
  let v: Fila;
  try {
    v = await viajeDelChofer(l, viajeId);
  } catch (e) {
    return { ok: false, error: (e as Error).message, status: 403 };
  }
  const adm = createAdminClient();
  const fecha = String(l.fecha);
  const path = `viajes/${fecha}/${viajeId}/${Date.now()}.${tipo.ext}`;
  const up = await adm.storage.from("hoja-dia").upload(path, bytes, { contentType: tipo.mime, upsert: false });
  if (up.error) return { ok: false, error: `No se pudo guardar la foto: ${up.error.message}`, status: 502 };
  const nombre = await nombreDeLink(l);
  const g = grabador(adm);
  await g.actualizar("hd_viajes", String(v.id), { foto_path: path });
  const texto = `${nombre}: foto del remito`;
  await anotar(null, { fecha, entidad: "viaje", entidadId: viajeId, viajeId, accion: "foto_remito", texto, origen: "link", porTexto: nombre }, g.cambios);
  await avisarPantallas(fecha, "subió la foto del remito", nombre);
  return { ok: true, texto };
}

/** La foto del remito de un viaje, para el escritorio: URL firmada por 10 minutos (o null). */
export async function fotoDelViaje(viajeId: string): Promise<string | null> {
  const adm = createAdminClient();
  const v = (await adm.from("hd_viajes").select("foto_path").eq("id", viajeId).maybeSingle()).data;
  if (!v?.foto_path) return null;
  const r = await adm.storage.from("hoja-dia").createSignedUrl(String(v.foto_path), 600);
  return r.data?.signedUrl ?? null;
}

/** Saca el botón "Recibido" de los mensajes de Telegram de ese link cuando se confirmó por el link. */
async function marcarMensajesTelegram(linkId: string, texto: (min: number) => string, fecha: Fecha, at: string): Promise<void> {
  try {
    const adm = createAdminClient();
    const r = await adm.from("hd_telegram_mensajes").select("id, chat_id, message_id, texto, botones").eq("link_id", linkId).eq("ok", true).is("respondido_at", null).in("tipo", ["hoja", "cambio", "viaje_nuevo"]);
    for (const m of r.data ?? []) {
      if (!m.message_id) continue;
      const urlBotones = ((m.botones as Teclado) ?? []).filter((f) => f.some((b) => b.url));
      await editarMensaje(Number(m.chat_id), Number(m.message_id), `${m.texto}\n\n${texto(minutosDesde(fecha, at))}`, urlBotones);
      await adm.from("hd_telegram_mensajes").update({ respondido_at: at, respuesta: "recibido", editado_at: ts() }).eq("id", m.id);
    }
  } catch (e) {
    console.error("[hoja-dia] no se pudo editar el mensaje de Telegram", e instanceof Error ? e.message : e);
  }
}

// ═══════════════════════════ Archivos de la OT ════════════════════════════════

/**
 * ¿Este adjunto es de una OT de la hoja (o de los viajes) de este token? La lista de
 * adjuntos permitidos por token se guarda 5 minutos: abrir 9 planos seguidos no arma la
 * vista entera 9 veces (ni le pide 9 veces el tablero a Odoo). Cada pedido igual cuenta
 * para el límite del link.
 */
const permitidosCache = new Map<string, { at: number; linkId: string; ids: Set<number> }>();
export async function archivoPermitido(token: string, adjuntoId: number): Promise<boolean> {
  const hit = permitidosCache.get(token);
  if (hit && Date.now() - hit.at < 5 * 60_000) {
    await contar(hit.linkId, "lectura");
    return hit.ids.has(adjuntoId);
  }
  const { vista, link } = await vistaPublica(token);
  if (vista.situacion !== "ok" || !link) return false;
  const obras = vista.rol === "a_cargo" ? vista.obras : vista.todo?.obras ?? [];
  const ids = new Set(obras.flatMap((o) => o.archivos.map((x) => x.id)));
  if (permitidosCache.size > 500) permitidosCache.clear();
  permitidosCache.set(token, { at: Date.now(), linkId: String(link.id), ids });
  return ids.has(adjuntoId);
}

// ═══════════════════════════ Webhook de Telegram ══════════════════════════════

type UpdateTelegram = {
  update_id: number;
  message?: { message_id: number; text?: string; chat: { id: number; type: string }; from?: { id: number; username?: string; first_name?: string } };
  callback_query?: { id: string; data?: string; from: { id: number; username?: string }; message?: { message_id: number; text?: string; chat: { id: number }; reply_markup?: { inline_keyboard: Teclado } } };
};

/** La persona de un chat de Telegram (Legajos o externa). */
async function personaDeChat(chat: number): Promise<{ id: string; tabla: "personal" | "pan_personas_externas"; apellido: string } | null> {
  const adm = createAdminClient();
  for (const tabla of ["personal", "pan_personas_externas"] as const) {
    const r = await adm.from(tabla).select("id, apellido").eq("telegram_chat_id", chat).maybeSingle();
    if (r.data) return { id: String(r.data.id), tabla, apellido: String(r.data.apellido) };
  }
  return null;
}
const nombreCorto = (apellido: string) => cap(apellido.toLowerCase().replace(/(^|\s)\S/g, (x) => x.toUpperCase()).trim());

/**
 * Un update del webhook. IDEMPOTENTE: Telegram reintenta si no contestamos a tiempo, y el
 * update_id se anota antes de hacer nada (si ya estaba, no se repite). Lo que hace queda
 * en el historial.
 */
export async function procesarUpdate(u: UpdateTelegram): Promise<void> {
  const adm = createAdminClient();
  const nuevo = await adm.from("hd_telegram_updates").insert({ update_id: u.update_id, tipo: u.callback_query ? "boton" : u.message ? "mensaje" : "otro" });
  if (nuevo.error) return; // ya procesado (o no se pudo anotar: mejor no repetir)
  const coord = (await adm.from("hd_parametros").select("valor").eq("clave", "coordinador").maybeSingle()).data?.valor as { nombre?: string } | undefined;
  const coordinador = coord?.nombre ?? "la oficina";

  if (u.message?.text != null && u.message.chat.type === "private") {
    const chat = u.message.chat.id;
    const codigo = leerStart(u.message.text);
    if (codigo == null) return;
    const ya = await personaDeChat(chat);
    if (!codigo) { await enviarMensaje(chat, ya ? TELEGRAM.yaVinculado(nombreCorto(ya.apellido)) : TELEGRAM.sinCodigo(coordinador)); return; }
    if (!codigoValido(codigo)) { await enviarMensaje(chat, TELEGRAM.codigoInvalido(coordinador)); return; }
    const c = await adm.from("hd_telegram_codigos").select("*").eq("codigo", codigo).maybeSingle();
    if (!c.data || c.data.usado_at || Date.parse(String(c.data.expira_at)) < Date.now()) { await enviarMensaje(chat, TELEGRAM.codigoInvalido(coordinador)); return; }
    const tabla = c.data.persona_id ? "personal" : "pan_personas_externas";
    const pid = String(c.data.persona_id ?? c.data.externa_id);
    // Un chat, una persona: si el chat estaba en otro legajo (un teléfono que cambió de mano), se suelta.
    await adm.from("personal").update({ telegram_chat_id: null, telegram_usuario: null, telegram_vinculado_at: null }).eq("telegram_chat_id", chat).neq("id", pid);
    await adm.from("pan_personas_externas").update({ telegram_chat_id: null, telegram_usuario: null, telegram_vinculado_at: null }).eq("telegram_chat_id", chat).neq("id", pid);
    const p = await adm.from(tabla).update({ telegram_chat_id: chat, telegram_usuario: u.message.from?.username ?? null, telegram_vinculado_at: ts() }).eq("id", pid).select("apellido").single();
    await adm.from("hd_telegram_codigos").update({ usado_at: ts(), chat_id: chat }).eq("codigo", codigo);
    const nombre = nombreCorto(String(p.data?.apellido ?? ""));
    const r = await enviarMensaje(chat, TELEGRAM.vinculado(nombre));
    await adm.from("hd_telegram_mensajes").insert({ [c.data.persona_id ? "persona_id" : "externa_id"]: pid, chat_id: chat, message_id: r.ok ? r.result.message_id : null, tipo: "vinculado", texto: TELEGRAM.vinculado(nombre), ok: r.ok, error: r.ok ? null : r.error });
    await anotar(null, { fecha: null, entidad: "telegram", entidadId: pid, accion: "vinculado", texto: `${nombre} vinculó su Telegram`, origen: "telegram", porTexto: nombre });
    return;
  }

  const q = u.callback_query;
  if (!q) return;
  const cb = decodificar(q.data);
  const chat = q.message?.chat.id ?? q.from.id;
  const mid = q.message?.message_id ?? null;
  const textoMsj = q.message?.text ?? "";
  const urlBotones = (q.message?.reply_markup?.inline_keyboard ?? []).filter((f) => f.some((b) => b.url));
  if (!cb) { await contestarBoton(q.id); return; }
  const quien = await personaDeChat(chat);
  if (!quien) { await contestarBoton(q.id, TELEGRAM.otroChat); return; }
  const at = ts();

  try {
    if (cb.a === "recibido" || cb.a === "entendido") {
      const l = (await adm.from("hd_links").select("*").eq("id", cb.link).maybeSingle()).data;
      if (!l || String(l.persona_id ?? l.externa_id) !== quien.id) { await contestarBoton(q.id, TELEGRAM.otroChat); return; }
      if (l.anulado_at || situacionLink({ fecha: String(l.fecha), expira_at: String(l.expira_at), anulado_at: null }) === "vencido") { await contestarBoton(q.id, TELEGRAM.linkVencido(coordinador)); return; }
      // I2: el botón de un mensaje viejo no confirma un cambio que la persona no vio.
      if (!recibidoVigente(cb.version, Number(l.version ?? 0))) {
        if (mid) await editarMensaje(chat, mid, `${textoMsj}\n\n${TELEGRAM.versionVieja}`, urlBotones);
        await contestarBoton(q.id, TELEGRAM.versionVieja);
        return;
      }
      await confirmarRecibido(l, at, "telegram");
      const min = minutosDesde(String(l.fecha), at);
      const marca = cb.a === "entendido" ? TELEGRAM.entendido(min) : TELEGRAM.recibido(min);
      if (mid) await editarMensaje(chat, mid, `${textoMsj}\n\n${marca}`, urlBotones);
      await adm.from("hd_telegram_mensajes").update({ respondido_at: at, respuesta: cb.a, editado_at: at }).eq("chat_id", chat).eq("message_id", mid ?? -1);
      await contestarBoton(q.id, marca);
      return;
    }
    const v = (await adm.from("hd_viajes").select("id, fecha, estado").eq("id", cb.viaje).maybeSingle()).data;
    if (!v) { await contestarBoton(q.id, "Ese viaje ya no existe."); return; }
    const l = (await adm.from("hd_links").select("*").eq("fecha", v.fecha).eq(quien.tabla === "personal" ? "persona_id" : "externa_id", quien.id).is("anulado_at", null).maybeSingle()).data;
    if (!l) { await contestarBoton(q.id, TELEGRAM.otroChat); return; }
    if (situacionLink({ fecha: String(l.fecha), expira_at: String(l.expira_at), anulado_at: null }) === "vencido") { await contestarBoton(q.id, TELEGRAM.linkVencido(coordinador)); return; }
    // I3: un viaje que la oficina sacó no se marca; el mensaje pierde sus botones.
    if (v.estado === "anulado") {
      if (mid) await editarMensaje(chat, mid, `${textoMsj}\n\n${TELEGRAM.viajeAnulado}`, urlBotones);
      await contestarBoton(q.id, TELEGRAM.viajeAnulado);
      return;
    }
    const fecha = String(v.fecha);
    const motivos = ((await adm.from("hd_parametros").select("valor").eq("clave", "motivos_no_pude").maybeSingle()).data?.valor as string[] | undefined) ?? ["No estaba listo", "Estaba cerrado", "No había nadie para recibir", "No entra en el camión", "Problema con el camión", "Otro (te llamo)"];
    if (cb.a === "no_pude") { if (mid) await editarBotones(chat, mid, tecladoMotivos(cb.viaje, motivos)); await contestarBoton(q.id, TELEGRAM.elegiMotivo); return; }
    if (cb.a === "volver") { if (mid) await editarBotones(chat, mid, [...tecladoViaje(null, cb.viaje), ...urlBotones]); await contestarBoton(q.id); return; }
    const min = minutosDesde(fecha, at);
    if (cb.a === "hecho") {
      await marcarViajeDesdeChofer(l, cb.viaje, "hecho", null, at, "telegram");
      if (mid) await editarMensaje(chat, mid, `${textoMsj}\n\n${TELEGRAM.hecho(min)}`, urlBotones);
      await contestarBoton(q.id, TELEGRAM.hecho(min));
    } else {
      const motivo = motivos[cb.i] ?? "Otro (te llamo)";
      await marcarViajeDesdeChofer(l, cb.viaje, "no_pude", motivo, at, "telegram");
      if (mid) await editarMensaje(chat, mid, `${textoMsj}\n\n${TELEGRAM.noPude(min, motivo)}\n${TELEGRAM.noPudeListo(coordinador)}`, urlBotones);
      await contestarBoton(q.id, TELEGRAM.noPudeListo(coordinador));
    }
    await adm.from("hd_telegram_mensajes").update({ respondido_at: at, respuesta: cb.a === "hecho" ? "hecho" : `no_pude`, editado_at: at }).eq("chat_id", chat).eq("message_id", mid ?? -1);
  } catch (e) {
    await contestarBoton(q.id, e instanceof Error ? e.message.slice(0, 180) : "No se pudo.");
  }
}

// Reexport para las rutas.
export { esHoy, ddmm };
