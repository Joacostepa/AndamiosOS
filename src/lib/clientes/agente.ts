// Sofía en producción: arma lo de afuera del turno (turno.ts) con Supabase, Claude, Meta, el
// catastro de CABA y Odoo. SOLO server-side. Lo llaman el webhook (después de responderle a
// Meta) y «Devolver a Sofía».
//
// CON EL INTERRUPTOR EN 0 NO TOCA NADA NUEVO: `iaClientesActiva` lee una fila de Parámetros (si no
// está, es 0) y el resto sólo corre con 1. Así el código puede subir antes que las migraciones
// 20261017000001/2 sin cambiar nada de la etapa 0.

import Anthropic, { toFile } from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PDFDocument } from "pdf-lib";
import { fallaDeCuenta, avisarFallaDeCuenta } from "@/lib/permisos-via-publica/falla-ia";
import { leerParametros } from "@/lib/parametros-cotizacion/servidor";
import { tarifasDesdeParametros } from "@/lib/cotizador/tarifas";
import { consultarLote } from "@/lib/catastro/caba";
import { conflictoCanal, identificarCliente, type ClienteIdentificado } from "@/lib/odoo/comercial";
import { feriadosDelRango } from "@/lib/feriados/argentina";
import { crearAlertas } from "@/lib/alertas/servicio";
import { marcarLeido, numeroClientes } from "@/lib/whatsapp/api";
import { aWhatsapp } from "@/lib/whatsapp/formato";
import { CLAVES_SOFIA, configSofiaDesdeFilas, type ConfigSofia } from "./config";
import { asignarPareja, PAREJAS_15_10, type ClienteAsignacion } from "./asignacion";
import { parametrosFacilDesdeFilas } from "./facil";
import { parametrosAlquilerDesdeFilas } from "./alquiler-simple";
import { adjuntarArchivosAOrden, barrioDeDireccion, fleteParaUbicacion, fletesAlquilerSimple, lugarParaFlete } from "@/lib/odoo/alquiler-simple";
import { clasificadorClaude, type DepsDocumentos } from "./documentos";
import { entregaDelPresupuesto } from "./aprobacion-alquiler";
import { leerFicha, type FichaSofia, type PresupuestoAlquiler, type ResultadoFleteAlquiler, type ServiciosSofia } from "./herramientas";
import { atenderCharla, type ArchivoModelo, type CharlaSofia, type DepsSofia, type FilaHistoria, type ItemNuevo, type RepoSofia, type ResultadoTurno } from "./turno";
import { enBuenosAires } from "./horario";
import { mandarNotaDeVoz, mandarTexto } from "./envio";
import { audioSaludo } from "./voz";
import { anotarEvento, BUCKET } from "./webhook";
import { nombresDe, ultimoEntrante } from "./bandeja";
import type { EstadoCharla } from "./vista";

export { iaClientesActiva } from "./interruptor";

const ahora = () => new Date().toISOString();
/** Si nunca vio la charla (una de la etapa 0 que se le devuelve), sólo lo último. */
const MAX_ITEMS_SIN_CURSOR = 30;
/**
 * El cliente suele mandar dos o tres mensajes seguidos: se espera un poco antes de leer. Era de
 * 2,5 s; en las charlas de prueba del 12/11 salían dos respuestas casi iguales cuando el cliente
 * mandaba texto, foto y texto en 10 s. Además, si llega algo mientras Tomás escribe, la respuesta
 * no sale y contesta todo junto (turno.ts → puedeDescartar).
 */
const ESPERA_TANDA_MS = 5_000;
/** Entre una mirada y otra a una foto o un PDF que se está bajando (hasta 6 veces: ~9 s). */
const ESPERA_ADJUNTO_MS = 1_500;

/** Las fotos que lee el modelo (las de WhatsApp son JPEG) y su tope (el de la API, 5 MB). */
const IMAGENES_MODELO = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);
const MAX_IMAGEN_BYTES = 5 * 1024 * 1024;
/**
 * Un PDF más largo o más pesado (un juego de planos) lo ve sólo el equipo: viaja en cada turno de
 * la charla y, con las pausas de WhatsApp, casi siempre sin caché (US$ 0,10 a 0,30 por turno cada
 * 20 páginas, contra el tope de US$ 1 por teléfono).
 */
const MAX_PDF_BYTES = 10 * 1024 * 1024;
const MAX_PDF_PAGINAS = 8;
/** El tope por archivo, contado por la API antes de subirlo (unas 7 páginas de PDF). */
const MAX_TOKENS_ARCHIVO = 12_000;
/**
 * Cuántas fotos y PDF ve el modelo por charla: con más de 20 imágenes en un pedido, la API achica
 * el máximo a 2000 px y rechazaría las fotos de celular en todos los turnos que siguen.
 */
const MAX_ARCHIVOS_CHARLA = 15;

/**
 * Sube una foto o un PDF del cliente a la Files API de Anthropic, una sola vez: el id queda en el
 * adjunto (anthropic_file_id) y la historia de Tomás lo referencia (no se guarda el archivo en la
 * base ni cambia de un turno a otro, así el caché sigue valiendo). Si no conviene, queda anotado
 * por qué (anthropic_no) y el modelo recibe sólo «[Mandó una foto: la ve el equipo]».
 *
 * LA HISTORIA ES APPEND-ONLY: un archivo que la API rechace rompería todos los turnos que siguen.
 * Por eso, antes de subirlo, la API lo valida y cuenta sus tokens (count_tokens, sin costo, con el
 * archivo en base64: no acepta file_id): si no lo acepta o pesa demasiado, no se muestra.
 */
async function archivoParaModelo(db: SupabaseClient, cliente: Anthropic, it: ItemNuevo, modelo: string): Promise<ArchivoModelo | null> {
  const a = it.adjunto ?? {};
  const mime = typeof a.mime === "string" ? a.mime.split(";")[0].trim().toLowerCase() : "";
  const bloque = IMAGENES_MODELO.has(mime) ? "image" : mime === "application/pdf" ? "document" : null;
  if (!bloque) return null;
  if (typeof a.anthropic_file_id === "string") return { bloque, fileId: a.anthropic_file_id };
  if (typeof a.path !== "string" || a.pendiente || a.anthropic_no) return null;
  const anotar = async (cambios: Record<string, unknown>) => {
    const { error } = await db.from("cli_hilo").update({ adjunto: { ...a, ...cambios } }).eq("id", it.id);
    if (error) throw new Error(`No se pudo anotar el adjunto: ${error.message}`);
  };
  const no = async (motivo: string) => {
    await anotar({ anthropic_no: motivo }).catch((e) => console.error("[sofia] adjunto", it.id, e));
    return null;
  };
  let subido: string | null = null;
  try {
    const tope = bloque === "image" ? MAX_IMAGEN_BYTES : MAX_PDF_BYTES;
    if (typeof a.bytes === "number" && a.bytes > tope) return await no("muy pesado");
    const { data: fila } = await db.from("cli_hilo").select("conversacion_id").eq("id", it.id).maybeSingle();
    if (fila?.conversacion_id) {
      const { count } = await db.from("cli_hilo").select("id", { count: "exact", head: true })
        .eq("conversacion_id", fila.conversacion_id).not("adjunto->>anthropic_file_id", "is", null);
      if ((count ?? 0) >= MAX_ARCHIVOS_CHARLA) return await no(`ya vio ${count} archivos en esta charla`);
    }
    const { data, error } = await db.storage.from(BUCKET).download(a.path);
    if (error || !data) throw new Error(error?.message ?? "vacío");
    const datos = new Uint8Array(await data.arrayBuffer());
    if (datos.length > tope) return await no("muy pesado");
    if (bloque === "document") {
      const paginas = await PDFDocument.load(datos, { ignoreEncryption: true, updateMetadata: false }).then((d) => d.getPageCount()).catch(() => null);
      if (paginas === null) return await no("no se pudo leer el PDF");
      if (paginas > MAX_PDF_PAGINAS) return await no(`${paginas} páginas`);
    }
    // La API lo valida (formato, medidas, contraseña) y dice cuánto pesa, antes de que entre a la
    // historia. Una falla que no sea un rechazo (la red, un 429) también lo deja afuera.
    const base64 = Buffer.from(datos).toString("base64");
    const prueba: Anthropic.Beta.BetaContentBlockParam = bloque === "image"
      ? { type: "image", source: { type: "base64", media_type: mime as "image/jpeg", data: base64 } }
      : { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } };
    let tokens: number;
    try {
      tokens = (await cliente.beta.messages.countTokens({ model: modelo, messages: [{ role: "user", content: [prueba, { type: "text", text: "." }] }] })).input_tokens;
    } catch (e) {
      if (e instanceof Anthropic.BadRequestError) return await no(`la API no lo acepta: ${e.message.slice(0, 160)}`);
      throw e;
    }
    if (tokens > MAX_TOKENS_ARCHIVO) return await no(`${tokens} tokens`);
    const nombre = typeof a.nombre === "string" && a.nombre ? a.nombre : bloque === "image" ? "foto.jpg" : "archivo.pdf";
    subido = (await cliente.files.upload({ file: await toFile(datos, nombre, { type: mime }) })).id;
    await anotar({ anthropic_file_id: subido, anthropic_tokens: tokens });
    return { bloque, fileId: subido };
  } catch (e) {
    // Una falla no frena el turno: el modelo recibe «[Mandó una foto: la ve el equipo]». Si se
    // llegó a subir pero no quedó anotado, se borra (si no, nadie lo borraría nunca).
    if (subido) await cliente.files.delete(subido).catch(() => {});
    console.error("[sofia] no se pudo pasar el adjunto al modelo", it.id, e);
    return null;
  }
}

function falla(que: string, e: { message: string } | null): never {
  throw new Error(`${que}: ${e?.message ?? "sin detalle"}`);
}

export async function leerConfigSofia(db: SupabaseClient): Promise<ConfigSofia> {
  const { data, error } = await db.from("cotizacion_parametros").select("clave, valor, texto").in("clave", [...CLAVES_SOFIA]);
  if (error) return configSofiaDesdeFilas([]);
  return configSofiaDesdeFilas((data ?? []).map((f) => ({ clave: f.clave as string, valor: f.valor === null ? null : Number(f.valor), texto: f.texto as string | null })));
}

/**
 * «Pausar la IA» (§7): con el interruptor en 0, lo que llega a una charla que tenía Sofía pasa a
 * una persona. Sólo toca charlas en «bot» (en la etapa 0 no hay ninguna).
 */
export async function pasarAPersonas(db: SupabaseClient, conversacionIds: string[]): Promise<void> {
  if (!conversacionIds.length) return;
  const { data } = await db
    .from("cli_conversaciones")
    .update({ estado: "derivada", motivo: "Tomás está en pausa", updated_at: ahora() })
    .in("id", conversacionIds)
    .eq("estado", "bot")
    .select("id");
  for (const f of data ?? []) await anotarEvento(db, f.id as string, "Tomás está en pausa: la charla pasa a una persona.");
}

// ── El repositorio ─────────────────────────────────────────────────────────────────────

type FilaCharla = {
  id: string; telefono: string; nombre_perfil: string | null; estado: EstadoCharla; ficha: unknown;
  ultimo_entrante_at: string | null; ia_leido_hasta: string | null; ia_saludo_at: string | null;
};

const NOMBRE_PENDIENTE: Record<string, string> = { facil: "cotización", simple: "pedido de alquiler", alquiler: "presupuesto de alquiler", tecnico: "asignación" };
const ESTADO_PENDIENTE: Record<string, string> = {
  pendiente: "pendiente de revisión del equipo",
  // Paso 6: al aprobar, el modelo se entera sin montos.
  aprobada: "se envió (aprobado por el equipo)",
  corregida: "se envió (corregido por el equipo)",
  rechazada: "el equipo decidió no mandarlo",
  tomada: "lo sigue una persona del equipo",
  vencida: "vencido",
  // Paso 6: los estados intermedios de la tarjeta.
  ejecutando: "aprobado, se está mandando",
  error: "aprobado, pero todavía no salió (lo está viendo el equipo)",
  falta_plantilla: "aprobado; se lo manda el equipo apenas se pueda",
  descartada: "el equipo decidió no mandarlo",
};

export function repoSofia(db: SupabaseClient, cliente?: Anthropic): RepoSofia {
  return {
    ...(cliente ? { archivoParaModelo: (it: ItemNuevo, modelo: string) => archivoParaModelo(db, cliente, it, modelo) } : {}),
    async leerCharla(id) {
      const { data, error } = await db
        .from("cli_conversaciones")
        .select("id, telefono, nombre_perfil, estado, ficha, ultimo_entrante_at, ia_leido_hasta, ia_saludo_at")
        .eq("id", id)
        .maybeSingle();
      if (error) falla("No se pudo leer la charla", error);
      if (!data) return null;
      const f = data as FilaCharla;
      return {
        id: f.id, telefono: f.telefono, nombrePerfil: f.nombre_perfil, estado: f.estado, ficha: leerFicha(f.ficha, f.telefono),
        ultimoEntranteAt: f.ultimo_entrante_at, iaLeidoHasta: f.ia_leido_hasta, iaSaludoAt: f.ia_saludo_at,
      } satisfies CharlaSofia;
    },
    async tomarTurno(id) {
      const { data, error } = await db.rpc("cli_tomar_turno", { p_conversacion: id });
      if (error) falla("No se pudo tomar el turno", error);
      return data === true;
    },
    async soltarTurno(id) {
      await db.rpc("cli_soltar_turno", { p_conversacion: id });
    },
    async nuevosDelHilo(id, desde) {
      let q = db
        .from("cli_hilo")
        .select("id, direccion, autor, autor_id, tipo, texto, transcripcion, adjunto, momento, created_at")
        .eq("conversacion_id", id)
        .or("direccion.eq.entrante,autor.eq.persona");
      if (desde) q = q.gt("created_at", desde).order("created_at", { ascending: true }).limit(200);
      else q = q.order("created_at", { ascending: false }).limit(MAX_ITEMS_SIN_CURSOR);
      const { data, error } = await q;
      if (error) falla("No se pudo leer el hilo", error);
      type F = { id: string; direccion: ItemNuevo["direccion"]; autor: ItemNuevo["autor"]; autor_id: string | null; tipo: string; texto: string | null; transcripcion: string | null; adjunto: Record<string, unknown> | null; momento: string; created_at: string };
      const filas = ((data ?? []) as F[]).sort((a, b) => a.created_at.localeCompare(b.created_at));
      const nombres = await nombresDe(db, filas.map((f) => f.autor_id));
      return filas.map((f) => ({
        id: f.id, direccion: f.direccion, autor: f.autor, autorNombre: f.autor_id ? nombres.get(f.autor_id) ?? null : null, tipo: f.tipo, texto: f.texto,
        transcripcion: f.transcripcion, adjunto: f.adjunto, creado: f.created_at, momento: f.momento,
      }));
    },
    async avanzarCursor(id, hasta) {
      await db.from("cli_conversaciones").update({ ia_leido_hasta: hasta }).eq("id", id).or(`ia_leido_hasta.is.null,ia_leido_hasta.lt."${hasta}"`);
    },
    async marcarSaludo(id) {
      await db.from("cli_conversaciones").update({ ia_saludo_at: ahora() }).eq("id", id);
    },
    async leerHistoria(id) {
      const { data, error } = await db.from("cli_api_mensajes").select("seq, rol, contenido, turno_id, enviado, nota").eq("conversacion_id", id).order("seq");
      if (error) falla("No se pudo leer la historia de Tomás", error);
      return (data ?? []) as FilaHistoria[];
    },
    async agregarHistoria(id, seq, filas) {
      if (!filas.length) return seq;
      const { error } = await db.from("cli_api_mensajes").insert(filas.map((f, i) => ({
        conversacion_id: id, seq: seq + i, rol: f.rol, tipo: f.tipo, contenido: f.contenido, texto: f.texto, turno_id: f.turno_id, uso: f.uso,
        modelo_servido: f.modelo_servido, costo_usd: f.costo_usd, interrumpido: f.interrumpido ?? false, enviado: f.enviado ?? null, nota: f.nota ?? null,
      })));
      if (error) falla("No se pudo guardar la historia de Tomás", error);
      return seq + filas.length;
    },
    async guardarFicha(id, ficha) {
      await db.from("cli_conversaciones").update({ ficha, updated_at: ahora() }).eq("id", id);
    },
    async cambiarEstado(id, estado, motivo, desde) {
      const { data, error } = await db
        .from("cli_conversaciones")
        .update({ estado, motivo: motivo.slice(0, 200), updated_at: ahora() })
        .eq("id", id)
        .in("estado", [...new Set(desde)])
        .select("id");
      if (error) falla("No se pudo cambiar el estado de la charla", error);
      return !!data?.length;
    },
    async sumarCosto(id, usd) {
      await db.rpc("cli_sumar_costo", { p_conversacion: id, p_usd: Math.round(usd * 100_000) / 100_000 });
    },
    async gastoHoy(telefono) {
      const { data, error } = await db.rpc("cli_gasto_hoy", { p_telefono: telefono });
      if (error) falla("No se pudo leer el gasto de hoy", error);
      const f = (Array.isArray(data) ? data[0] : data) as { gasto_telefono?: number | string; gasto_total?: number | string } | null;
      return { telefono: Number(f?.gasto_telefono ?? 0), global: Number(f?.gasto_total ?? 0) };
    },
    async pendientes(id) {
      const { data } = await db
        .from("cli_aprobaciones")
        .select("numero, tipo, carril, estado")
        .eq("conversacion_id", id)
        .in("tipo", ["precio", "tecnico"])
        .order("created_at");
      return ((data ?? []) as { numero: number; carril: string | null; estado: string }[]).map(
        (p) => `${NOMBRE_PENDIENTE[p.carril ?? ""] ?? "pedido"} #${p.numero}: ${ESTADO_PENDIENTE[p.estado] ?? p.estado}`,
      );
    },
    async registrarBloqueo(id, texto, motivo, hallazgos) {
      const { error } = await db.from("cli_aprobaciones").insert({ conversacion_id: id, tipo: "texto_bloqueado", texto, motivo, payload: { hallazgos } });
      if (error) falla("No se pudo anotar el texto bloqueado", error);
    },
    async mandar(id, telefono, texto, autor) {
      await mandarTexto(db, id, telefono, autor === "ia" ? aWhatsapp(texto) : texto, { autor });
    },
    async mandarSaludoVoz(id, telefono, perfil) {
      const audio = await audioSaludo(db, perfil);
      await mandarNotaDeVoz(db, id, telefono, audio, { autor: "ia" });
      return audio.guion;
    },
    async evento(id, texto) {
      await anotarEvento(db, id, texto);
    },
    async avisarUrgente(id, resumen) {
      await anotarEvento(db, id, `URGENTE · seguridad en obra: ${resumen}`);
      // La campanita de los administradores, al instante. El Telegram a JS y a Operaciones (§6)
      // queda para cuando la oficina tenga telegram_chat_id (paso 1 de §13).
      await crearAlertas(db, [{
        tipo: "asistente_aviso",
        clave: `clientes_seguridad:${id}:${Date.now()}`,
        titulo: "WhatsApp de clientes · seguridad en obra",
        descripcion: resumen,
        prioridad: "critica",
        enlace: `/comercial/clientes?c=${id}`,
        destinatarioRol: "admin",
      }]);
    },
    async escribiendo(id) {
      const numero = numeroClientes();
      const wamid = numero ? await ultimoEntrante(db, id) : null;
      if (wamid && numero) await marcarLeido(wamid, numero, true).catch(() => {});
    },
  };
}

// ── Los servicios de las herramientas ──────────────────────────────────────────────────

/** ¿La dirección se cotizó en los últimos 12 meses? Con quién. null si Odoo no contestó. */
async function direccionCotizada(direccion: string | null): Promise<{ cotizada: boolean; tecnico: string | null; venta?: string; fecha?: string } | null> {
  if (!direccion?.trim()) return null;
  try {
    const c = await conflictoCanal(direccion);
    const v = c.ventas[0];
    const o = c.oportunidades[0];
    if (v) return { cotizada: true, tecnico: v.tecnico, venta: v.numero, fecha: v.fecha ?? undefined };
    if (o) return { cotizada: true, tecnico: o.tecnico, fecha: o.fecha };
    return { cotizada: false, tecnico: null };
  } catch {
    return null;
  }
}

/**
 * El último técnico al que le tocó el turno: la última decisión que lo consumió (turno_tecnico,
 * paso 6: confirmar la propuesta del turno o aprobar la bandeja fácil que la traía). Sin la
 * migración 20261018000001, como antes: la última asignación del turno confirmada.
 */
async function ultimoDelTurno(db: SupabaseClient): Promise<string | null> {
  const nuevo = await db
    .from("cli_aprobaciones")
    .select("turno_tecnico")
    .not("turno_tecnico", "is", null)
    .order("decidido_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!nuevo.error) return (nuevo.data?.turno_tecnico as string | undefined) ?? null;
  const { data } = await db
    .from("cli_aprobaciones")
    .select("payload")
    .eq("tipo", "tecnico")
    .eq("estado", "aprobada")
    .eq("payload->asignacion->>regla", "turno")
    .order("decidido_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const a = (data?.payload as { asignacion?: { tecnico?: string | null } } | undefined)?.asignacion;
  return a?.tecnico ?? null;
}

/** Los estados en que la aprobación del alquiler ya creó la orden de Odoo (aprobar.ts). */
const ALQUILER_APROBADO = ["aprobada", "corregida", "falta_plantilla"];

/**
 * El último presupuesto de alquiler simple de la charla (carril «alquiler»): su estado, la entrega
 * con que se cotizó y la orden de Odoo que dejó aprobar.ts en pasos.ordenAlquiler.
 */
async function ultimoPresupuestoAlquiler(db: SupabaseClient, conversacionId: string, soloAprobados = false): Promise<PresupuestoAlquiler | null> {
  let q = db
    .from("cli_aprobaciones")
    .select("numero, estado, payload, pasos")
    .eq("conversacion_id", conversacionId)
    .eq("tipo", "precio")
    .eq("carril", "alquiler");
  if (soloAprobados) q = q.in("estado", ALQUILER_APROBADO);
  const { data, error } = await q.order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) falla("No se pudo leer el presupuesto de alquiler", error);
  if (!data) return null;
  const pasos = (data.pasos ?? {}) as { ordenAlquiler?: { id?: number; nombre?: string } };
  const o = pasos.ordenAlquiler;
  return {
    numero: Number(data.numero),
    estado: String(data.estado),
    // La que le llegó al cliente (con la corrección de fecha, si hubo) o, sin aprobar, la de Tomás.
    entrega: entregaDelPresupuesto(data.payload as Record<string, unknown> | null),
    ordenAlquiler: o?.id ? { id: Number(o.id), nombre: o.nombre ?? `#${o.id}` } : null,
  };
}

/**
 * Lo de afuera de los documentos del alquiler (documentos.ts): Storage, la visión (Claude Haiku,
 * fuera del contexto de Tomás), la orden de Odoo de la aprobación y los eventos de la bandeja.
 */
export function documentosSofia(db: SupabaseClient, charla: CharlaSofia): DepsDocumentos {
  return {
    async bajar(path) {
      const { data, error } = await db.storage.from(BUCKET).download(path);
      if (error || !data) throw new Error(`No se pudo bajar el documento: ${error?.message ?? "vacío"}`);
      return { datos: new Uint8Array(await data.arrayBuffer()), mime: data.type };
    },
    clasificar: clasificadorClaude(),
    async ordenAlquiler() {
      return (await ultimoPresupuestoAlquiler(db, charla.id, true))?.ordenAlquiler ?? null;
    },
    async adjuntar(ordenId, archivos, nota) {
      return adjuntarArchivosAOrden(ordenId, archivos, { nota });
    },
    evento: (texto) => anotarEvento(db, charla.id, texto),
    ahora,
  };
}

export function serviciosSofia(db: SupabaseClient, charla: CharlaSofia): ServiciosSofia {
  const hoy = enBuenosAires(new Date()).fecha;
  // F5 y F7 (paso 2b): quién es, por el teléfono de WhatsApp y el CUIT si lo dio. Una vez por
  // turno y por CUIT; null si Odoo no contestó («no se pudo revisar» cuenta como no fácil).
  const identificados = new Map<string, Promise<ClienteIdentificado | null>>();
  const identificar = (ficha: FichaSofia) => {
    const clave = ficha.cuit ?? "";
    if (!identificados.has(clave)) {
      identificados.set(clave, identificarCliente({ telefono: charla.telefono || ficha.telefono, cuit: ficha.cuit }).catch((e) => {
        console.error("[sofia] identificar cliente", e);
        return null;
      }));
    }
    return identificados.get(clave)!;
  };
  const ubicaciones = new Map<string, Promise<ResultadoFleteAlquiler>>();
  return {
    hoy,
    verificarDireccion: (direccion) => consultarLote({ direccion, enCaba: null }),
    async contextoFacil(ficha: FichaSofia) {
      const [filas, dir, quien] = await Promise.all([leerParametros(db), direccionCotizada(ficha.direccion), identificar(ficha)]);
      return {
        parametros: parametrosFacilDesdeFilas(filas),
        clienteConHistorial: quien ? quien.historial : null,
        deudaVencida: quien ? quien.deudaVencida : null,
        direccionCotizada: dir ? dir.cotizada : null,
      };
    },
    async tarifas() {
      return tarifasDesdeParametros(await leerParametros(db));
    },
    async asignar(ficha) {
      const [dir, ultimo, quien] = await Promise.all([direccionCotizada(ficha.direccion), ultimoDelTurno(db), identificar(ficha)]);
      const cliente: ClienteAsignacion = {
        alquilerSimple: ficha.trabajo === "alquiler_simple",
        cuit: ficha.cuit,
        nombre: quien?.nombre ?? ficha.nombre,
        partnerId: quien?.partnerId ?? null,
        ultimaOrdenGanada: quien?.ultimaOrdenGanada ? { tecnico: quien.ultimaOrdenGanada.tecnico, venta: quien.ultimaOrdenGanada.venta, fecha: quien.ultimaOrdenGanada.fecha ?? undefined } : null,
        otrosTecnicos: quien?.otrosTecnicos ?? [],
        direccionCotizada: dir?.cotizada ? { tecnico: dir.tecnico, venta: dir.venta, fecha: dir.fecha } : null,
      };
      // Las cuentas de los socios y «Hoy no estoy» van a Parámetros (docs/sofia/cuentas-socios.md):
      // mientras no estén, la lista va vacía y la tarjeta lo decide.
      return asignarPareja(cliente, { config: PAREJAS_15_10, cuentasSocios: [], turno: { ultimo } });
    },
    async fleteAlquiler(direccion) {
      // Una vez por turno y por dirección: USIG es gratis, pero Places (el respaldo) no.
      if (!ubicaciones.has(direccion)) {
        ubicaciones.set(direccion, (async (): Promise<ResultadoFleteAlquiler> => {
          const u = await barrioDeDireccion(direccion);
          if (u.estado !== "ok") return u;
          const fletes = await fletesAlquilerSimple();
          return {
            estado: "ok", enCaba: u.ubicacion.enCaba, lugar: lugarParaFlete(u.ubicacion), partido: u.ubicacion.partido, normalizada: u.ubicacion.direccion,
            flete: fleteParaUbicacion(fletes, u.ubicacion),
          };
        })());
      }
      return ubicaciones.get(direccion)!;
    },
    async contextoAlquiler(ficha) {
      const [filas, quien] = await Promise.all([leerParametros(db), identificar(ficha)]);
      // Las cuentas de los socios van a Parámetros (docs/sofia/cuentas-socios.md): mientras no
      // estén, no se marcan (como en asignar).
      return { parametros: parametrosAlquilerDesdeFilas(filas), deudaVencida: quien ? quien.deudaVencida : null };
    },
    async feriados() {
      return [...(await feriados())];
    },
    presupuestoAlquiler: () => ultimoPresupuestoAlquiler(db, charla.id),
    async avisarEquipo(texto, titulo, o = {}) {
      await anotarEvento(db, charla.id, texto);
      const base = { tipo: "asistente_aviso" as const, titulo, descripcion: texto, prioridad: "alta" as const, enlace: `/comercial/clientes?c=${charla.id}` };
      const clave = `clientes_alquiler:${charla.id}:${Date.now()}`;
      await crearAlertas(db, [
        { ...base, clave: `${clave}:comercial`, destinatarioRol: "comercial" },
        ...(o.logistica ? [{ ...base, clave: `${clave}:operativo`, destinatarioRol: "operativo" as const, espejoSlack: false }] : []),
      ]).catch((e) => console.error("[sofia] aviso al equipo", e));
    },
    async registrarPendiente(p) {
      const fila = {
        conversacion_id: charla.id, tipo: p.tipo, carril: p.carril, resumen: p.resumen.slice(0, 300), monto_propuesto: p.montoPropuesto,
        payload: p.payload, updated_at: ahora(),
      };
      for (let intento = 0; intento < 2; intento++) {
        const { data: previo } = await db
          .from("cli_aprobaciones")
          .select("id, numero")
          .eq("conversacion_id", charla.id)
          .eq("tipo", p.tipo)
          .eq("carril", p.carril)
          .eq("estado", "pendiente")
          .maybeSingle();
        if (previo) {
          const { error } = await db.from("cli_aprobaciones").update(fila).eq("id", previo.id).eq("estado", "pendiente");
          if (error) falla("No se pudo actualizar lo pendiente", error);
          return { numero: Number(previo.numero), yaEstaba: true };
        }
        const { data, error } = await db.from("cli_aprobaciones").insert(fila).select("numero").single();
        if (!error && data) return { numero: Number(data.numero), yaEstaba: false };
        if (error?.code !== "23505") falla("No se pudo dejar pendiente", error);
      }
      throw new Error("No se pudo dejar pendiente (dos choques seguidos).");
    },
  };
}

// ── El turno ───────────────────────────────────────────────────────────────────────────

let feriadosCache: { hasta: number; fechas: Set<string> } | null = null;

async function feriados(): Promise<Set<string>> {
  if (feriadosCache && feriadosCache.hasta > Date.now()) return feriadosCache.fechas;
  const hoy = enBuenosAires(new Date()).fecha;
  const hasta = new Date(Date.now() + 45 * 86_400_000).toISOString().slice(0, 10);
  const fechas = new Set((await feriadosDelRango(hoy, hasta).catch(() => [])).map((f) => f.fecha));
  feriadosCache = { hasta: Date.now() + 6 * 3_600_000, fechas };
  return fechas;
}

export function depsSofia(db: SupabaseClient): DepsSofia {
  const cliente = new Anthropic();
  return {
    repo: repoSofia(db, cliente),
    config: () => leerConfigSofia(db),
    feriados,
    servicios: (charla) => serviciosSofia(db, charla),
    documentos: (charla) => documentosSofia(db, charla),
    modelo: (params, senal) => cliente.beta.messages.stream(params, { signal: senal }).finalMessage(),
    alFallar: async (e) => {
      const f = fallaDeCuenta(e);
      if (f) await avisarFallaDeCuenta(db, f);
    },
    esperarTanda: () => new Promise((r) => setTimeout(r, ESPERA_TANDA_MS)),
    esperarAdjunto: () => new Promise((r) => setTimeout(r, ESPERA_ADJUNTO_MS)),
  };
}

/** Lo llama el webhook (después de responderle a Meta) y «Devolver a Sofía». Nunca tira. */
export async function atenderConSofia(db: SupabaseClient, conversacionId: string, opciones: { devuelta?: boolean } = {}): Promise<ResultadoTurno | null> {
  try {
    return await atenderCharla(depsSofia(db), conversacionId, opciones);
  } catch (e) {
    console.error("[sofia] no se pudo atender", conversacionId, e);
    return null;
  }
}
