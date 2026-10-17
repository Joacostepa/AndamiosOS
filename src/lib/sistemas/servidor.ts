/**
 * Sistemas del lado del servidor: lectura de reportes para las dos pantallas, URLs firmadas,
 * métricas de la bandeja y los avisos (campanita y Slack). Contrato en
 * docs/sistemas/contrato.md §3 y §5.
 *
 * DOS LLAVES: las rutas leen sis_* con la SESIÓN (la RLS deja ver lo propio o, al revisor,
 * todo) y usan la service role sólo DESPUÉS de su chequeo, para lo que no es de nadie:
 * firmar URLs del bucket privado, leer nombres de user_profiles, armar las métricas y crear
 * las alertas (la RLS de `alertas` no deja insertar a campo, depósito ni comercial).
 *
 * Las funciones de armado (filas, banderas, métricas, avisos) son puras y tienen tests; las
 * que leen o escriben reciben el cliente o lo crean acá. SÓLO SERVIDOR.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { NuevaAlerta } from "../alertas/servicio.ts";
import { createAdminClient } from "../supabase/admin.ts";
import { sanearContexto } from "./contexto.ts";
import { pantallaDeRuta } from "./rutas.ts";
import {
  BUCKET, EVENTOS_PUBLICOS, LIMITES, RECORRIDO, TIPOS_ALERTA,
  describirDispositivo, enlaceMisReportes, enlaceRevision, esCuentaTecnica, esPregunta,
  tituloAlertaEstado, tituloAlertaMensaje, tituloAlertaNuevo, tituloAlertaRespuesta,
  type CapturaFirmada, type ContextoCliente, type Creador, type EstadoReporte, type EventoPublico,
  type EventoRevision, type LadoEvento, type Metricas, type MotivoDescarte, type PrioridadReporte,
  type ReporteDetalle, type ReporteFila, type ReporteUsuario, type TipoEvento, type TipoEventoPublico,
  type TipoReporte,
} from "./tipos.ts";

type DB = SupabaseClient;

// ─────────────────────────────────────────────────────────────────────────────
// Instalación: ¿falta la migración?
// ─────────────────────────────────────────────────────────────────────────────

type ErrorSupabase = { code?: string | null; message?: string | null; statusCode?: string | number | null } | null | undefined;

/**
 * ¿El error dice que falta algo de las migraciones 20261022000001..03? Una tabla (42P01,
 * PGRST205), una función (PGRST202, 42883) o el bucket («Bucket not found»).
 */
export function esFaltante(error: unknown): boolean {
  const e = error as ErrorSupabase;
  if (!e || typeof e !== "object") return false;
  if (e.code && ["42P01", "PGRST205", "PGRST202", "42883"].includes(e.code)) return true;
  return /relation .* does not exist|could not find the (table|function)|bucket not found/i.test(e.message ?? "");
}

/** El deploy que está corriendo (para el aviso «la actual es…» y sha_servidor). */
export function shaActual(): string {
  return process.env.VERCEL_GIT_COMMIT_SHA ?? "local";
}

// ─────────────────────────────────────────────────────────────────────────────
// Filas de la base
// ─────────────────────────────────────────────────────────────────────────────

export type FilaEvento = {
  id: number;
  reporte_id?: string;
  tipo: TipoEvento;
  lado: LadoEvento;
  autor_id?: string | null;
  de: string | null;
  a: string | null;
  texto: string | null;
  created_at: string;
};

export type FilaCaptura = { id: string; path: string; ancho: number | null; alto: number | null; orden: number };

export type FilaReporte = {
  id: string;
  numero: number;
  tipo: TipoReporte;
  descripcion: string;
  frena: boolean;
  estado: EstadoReporte;
  motivo_descarte: MotivoDescarte | null;
  duplicado_de: string | null;
  prioridad: PrioridadReporte | null;
  ruta: string | null;
  modulo: string | null;
  titulo_pantalla: string | null;
  sha_cliente: string | null;
  sha_servidor: string | null;
  contexto: unknown;
  creado_por: string;
  created_at: string;
  ultima_actividad_at: string;
  cerrado_at: string | null;
  confirmado_ok: boolean | null;
  capturas?: FilaCaptura[] | null;
  eventos?: FilaEvento[] | null;
};

/** Las columnas de sis_reportes que usan las pantallas (con capturas y eventos embebidos). */
export const COLUMNAS_REPORTE =
  "id, numero, tipo, descripcion, frena, estado, motivo_descarte, duplicado_de, prioridad, ruta, modulo, titulo_pantalla, sha_cliente, sha_servidor, creado_por, created_at, ultima_actividad_at, cerrado_at, confirmado_ok";
const EMBEBIDOS_LISTA = "capturas:sis_reporte_capturas(id), eventos:sis_reporte_eventos(id, tipo, lado, texto, created_at)";
const EMBEBIDOS_DETALLE =
  "contexto, capturas:sis_reporte_capturas(id, path, ancho, alto, orden), eventos:sis_reporte_eventos(id, tipo, lado, de, a, texto, created_at)";
export const SELECT_LISTA = `${COLUMNAS_REPORTE}, ${EMBEBIDOS_LISTA}`;
export const SELECT_DETALLE = `${COLUMNAS_REPORTE}, ${EMBEBIDOS_DETALLE}`;
/** «Mis reportes»: sin el contexto (no se muestra) y sin autor en los eventos. */
export const SELECT_USUARIO = `${COLUMNAS_REPORTE}, capturas:sis_reporte_capturas(id, path, ancho, alto, orden), eventos:sis_reporte_eventos(id, tipo, lado, de, a, texto, created_at)`;

// ─────────────────────────────────────────────────────────────────────────────
// Armado (puro)
// ─────────────────────────────────────────────────────────────────────────────

const porId = (a: { id: number }, b: { id: number }) => a.id - b.id;

/**
 * «Esperando respuesta»: el último comentario es de Sistemas y es una pregunta.
 * «Respuesta sin leer»: hay un comentario de quien reportó posterior al último evento de
 * Sistemas (sin contar el alta).
 */
export function banderasConversacion(eventos: readonly Pick<FilaEvento, "id" | "tipo" | "lado" | "texto">[]): {
  esperandoRespuesta: boolean;
  respuestaSinLeer: boolean;
} {
  const orden = [...eventos].sort(porId);
  const comentarios = orden.filter((e) => e.tipo === "comentario");
  const ultimo = comentarios[comentarios.length - 1];
  const esperandoRespuesta = !!ultimo && ultimo.lado === "sistemas" && esPregunta(ultimo.texto);
  const ultimoSistemas = orden.filter((e) => e.lado === "sistemas" && e.tipo !== "creado").pop()?.id ?? 0;
  const respuestaSinLeer = comentarios.some((e) => e.lado === "usuario" && e.id > ultimoSistemas);
  return { esperandoRespuesta, respuestaSinLeer };
}

export function aEventoPublico(e: FilaEvento): EventoPublico {
  return { id: e.id, tipo: e.tipo as TipoEventoPublico, lado: e.lado, de: e.de, a: e.a, texto: e.texto, createdAt: e.created_at };
}

export function aEventoRevision(e: FilaEvento, nombres: ReadonlyMap<string, string>): EventoRevision {
  return { ...aEventoPublico(e), tipo: e.tipo, autorNombre: e.autor_id ? nombres.get(e.autor_id) ?? null : null };
}

/** Sólo los que ve quien reportó (un revisor que mira sus propios reportes no ve la prioridad). */
export function eventosPublicos(eventos: readonly FilaEvento[] | null | undefined): EventoPublico[] {
  return (eventos ?? [])
    .filter((e) => (EVENTOS_PUBLICOS as readonly string[]).includes(e.tipo))
    .sort(porId)
    .map(aEventoPublico);
}

const SIN_CREADOR = (id: string): Creador => ({ id, nombre: "Alguien del equipo", apellido: "", rol: null });

export function recortarTexto(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`;
}

export function aReporteFila(f: FilaReporte, creador: Creador | undefined, o: { recortar?: number } = {}): ReporteFila {
  const banderas = banderasConversacion(f.eventos ?? []);
  return {
    id: f.id,
    numero: Number(f.numero),
    tipo: f.tipo,
    estado: f.estado,
    frena: f.frena,
    prioridad: f.prioridad,
    descripcion: o.recortar ? recortarTexto(f.descripcion, o.recortar) : f.descripcion,
    pantalla: pantallaDeRuta(f.ruta),
    ruta: f.ruta,
    creador: creador ?? SIN_CREADOR(f.creado_por),
    createdAt: f.created_at,
    ultimaActividadAt: f.ultima_actividad_at,
    cantCapturas: (f.capturas ?? []).length,
    ...banderas,
  };
}

/** El contexto guardado, con la forma de siempre (se vuelve a sanear: es barato y no confía). */
export function contextoGuardado(crudo: unknown): ContextoCliente | null {
  if (!crudo || typeof crudo !== "object" || Array.isArray(crudo) || Object.keys(crudo).length === 0) return null;
  return sanearContexto(crudo);
}

export function dispositivoDe(c: ContextoCliente | null): string {
  if (!c) return "Sin datos";
  if (c.dispositivo) return c.dispositivo;
  if (!c.navegador.userAgent) return "Sin datos";
  return describirDispositivo(c.navegador.userAgent, c.pantalla.ancho, c.pantalla.alto);
}

const DIA = 24 * 60 * 60 * 1000;
const redondear1 = (n: number) => Math.round(n * 10) / 10;
const promedio = (l: number[]) => (l.length ? l.reduce((a, b) => a + b, 0) / l.length : null);

/**
 * Las métricas de la franja de la bandeja, con lo que ya se leyó. Si una no se puede
 * calcular, va null (la pantalla muestra «—»).
 */
export function calcularMetricas(d: {
  ahora: number;
  reportes: readonly { id: string; creado_por: string; created_at: string; estado: string; cerrado_at: string | null }[];
  eventosSistemas: readonly { reporte_id: string; tipo: string; texto: string | null; created_at: string }[];
  recorrido: { hicieron: number; total: number } | null;
}): Metricas {
  const hace7 = d.ahora - 7 * DIA;
  const hace30 = d.ahora - 30 * DIA;
  const t = (s: string | null) => (s ? Date.parse(s) : NaN);

  const semana = d.reportes.filter((r) => t(r.created_at) >= hace7);
  const de30 = d.reportes.filter((r) => t(r.created_at) >= hace30);

  const primero = new Map<string, number>();
  const pregunto = new Set<string>();
  for (const e of d.eventosSistemas) {
    if (e.tipo === "creado") continue;
    const at = t(e.created_at);
    const prev = primero.get(e.reporte_id);
    if (prev === undefined || at < prev) primero.set(e.reporte_id, at);
    if (e.tipo === "comentario" && esPregunta(e.texto)) pregunto.add(e.reporte_id);
  }
  const demoras = de30.filter((r) => primero.has(r.id)).map((r) => Math.max(0, primero.get(r.id)! - t(r.created_at)) / DIA);
  const resueltos = d.reportes
    .filter((r) => r.estado === "resuelto" && t(r.cerrado_at) >= hace30)
    .map((r) => Math.max(0, t(r.cerrado_at) - t(r.created_at)) / DIA);
  const pPrimera = promedio(demoras);
  const pResolver = promedio(resueltos);

  return {
    semana: { reportes: semana.length, personas: new Set(semana.map((r) => r.creado_por)).size },
    primeraRespuestaDias: pPrimera === null ? null : redondear1(pPrimera),
    resolverDias: pResolver === null ? null : redondear1(pResolver),
    preguntamosPct: de30.length ? Math.round((de30.filter((r) => pregunto.has(r.id)).length / de30.length) * 100) : null,
    recorrido: d.recorrido,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Avisos (armado puro). Nunca al que hizo la acción; títulos sin la descripción.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Reporte nuevo → cada revisor. Si frena: prioridad alta y Slack #sistemas UNA sola vez.
 * Sin ningún revisor aparte de quien reportó no hay campanita para nadie (los admins no pueden
 * abrir la bandeja): lo que frena el trabajo sale sólo a Slack con ecoSlackReporteNuevo().
 */
export function avisosReporteNuevo(r: {
  id: string;
  numero: number;
  tipo: TipoReporte;
  frena: boolean;
  pantalla: string;
  autorId: string;
  revisores: readonly string[];
}): NuevaAlerta[] {
  const tipo = r.frena ? TIPOS_ALERTA.bloqueante : TIPOS_ALERTA.reporte;
  const titulo = tituloAlertaNuevo({ numero: r.numero, pantalla: r.pantalla, tipo: r.tipo, frena: r.frena });
  const base = { tipo, titulo, prioridad: r.frena ? ("alta" as const) : ("media" as const), enlace: enlaceRevision(r.id) };
  const destinos = [...new Set(r.revisores)].filter((d) => d !== r.autorId);
  return destinos.map((d, i) => ({
    ...base,
    clave: `sistemas:${r.numero}:nuevo:${d}`,
    destinatarioId: d,
    espejoSlack: r.frena ? i === 0 : false,
  }));
}

/**
 * El eco en Slack de un reporte que frena el trabajo cuando avisosReporteNuevo() no tuvo a
 * quién avisar (el único revisor es quien reportó, o el otro está inactivo). null si no frena
 * o si ya hay campanitas (esas llevan el espejo a Slack).
 */
export function ecoSlackReporteNuevo(r: Parameters<typeof avisosReporteNuevo>[0], avisos: readonly NuevaAlerta[]): NuevaAlerta | null {
  if (!r.frena || avisos.length) return null;
  return {
    tipo: TIPOS_ALERTA.bloqueante,
    clave: `sistemas:${r.numero}:nuevo:slack`,
    titulo: tituloAlertaNuevo({ numero: r.numero, pantalla: r.pantalla, tipo: r.tipo, frena: true }),
    prioridad: "alta",
    enlace: enlaceRevision(r.id),
  };
}

/** Lo que devuelve sis_revisar_reporte (jsonb). */
export type ResultadoRevisar = {
  id: string;
  numero: number;
  creado_por: string;
  estado_anterior: EstadoReporte;
  estado: EstadoReporte;
  cambio_estado: boolean;
  cambio_prioridad: boolean;
  motivo_descarte: MotivoDescarte | null;
  estado_evento_id: number | null;
  comentario_id: number | null;
  duplicados: { id: string; numero: number; creado_por: string }[] | null;
};

/**
 * Después de un PATCH de la bandeja. Cambio de estado (salvo a 'visto') → aviso de estado a
 * quien reportó; si no, un mensaje de Sistemas → «Sistemas te respondió». Uno solo: si en el
 * mismo PATCH cambió el estado y vino un mensaje, va el de estado. Al resolver un original,
 * también se avisa a quien mandó cada duplicado.
 */
export function avisosRevision(res: ResultadoRevisar, actorId: string): NuevaAlerta[] {
  const salida: NuevaAlerta[] = [];
  const numero = Number(res.numero);
  const aCreador = res.creado_por && res.creado_por !== actorId;
  if (res.cambio_estado && res.estado !== "visto" && res.estado_evento_id != null) {
    if (aCreador) {
      salida.push({
        tipo: TIPOS_ALERTA.novedad,
        clave: `sistemas:ev${res.estado_evento_id}:${res.creado_por}`,
        titulo: tituloAlertaEstado(numero, res.estado, res.motivo_descarte),
        enlace: enlaceMisReportes(res.id),
        destinatarioId: res.creado_por,
      });
    }
    if (res.estado === "resuelto") {
      for (const d of res.duplicados ?? []) {
        if (!d.creado_por || d.creado_por === actorId) continue;
        salida.push({
          tipo: TIPOS_ALERTA.novedad,
          clave: `sistemas:ev${res.estado_evento_id}:dup${d.id}:${d.creado_por}`,
          titulo: tituloAlertaEstado(Number(d.numero), "resuelto"),
          enlace: enlaceMisReportes(d.id),
          destinatarioId: d.creado_por,
        });
      }
    }
  } else if (res.comentario_id != null && aCreador) {
    salida.push({
      tipo: TIPOS_ALERTA.novedad,
      clave: `sistemas:ev${res.comentario_id}:${res.creado_por}`,
      titulo: tituloAlertaMensaje(numero),
      enlace: enlaceMisReportes(res.id),
      destinatarioId: res.creado_por,
    });
  }
  return salida;
}

/** Lo que devuelve sis_comentar (jsonb). */
export type ResultadoComentar = {
  id: number;
  reporte_id: string;
  numero: number;
  creado_por: string;
  lado: LadoEvento;
  estado_anterior: EstadoReporte;
  estado: EstadoReporte;
};

/** Un mensaje: de Sistemas → a quien reportó; de quien reportó → a cada revisor. */
export function avisosComentario(res: ResultadoComentar, actorId: string, revisores: readonly string[]): NuevaAlerta[] {
  const numero = Number(res.numero);
  if (res.lado === "sistemas") {
    if (!res.creado_por || res.creado_por === actorId) return [];
    return [{
      tipo: TIPOS_ALERTA.novedad,
      clave: `sistemas:ev${res.id}:${res.creado_por}`,
      titulo: tituloAlertaMensaje(numero),
      enlace: enlaceMisReportes(res.reporte_id),
      destinatarioId: res.creado_por,
    }];
  }
  return [...new Set(revisores)].filter((d) => d !== actorId).map((d) => ({
    tipo: TIPOS_ALERTA.respuesta,
    clave: `sistemas:ev${res.id}:${d}`,
    titulo: tituloAlertaRespuesta(numero, false),
    enlace: enlaceRevision(res.reporte_id),
    destinatarioId: d,
  }));
}

/** Lo que devuelve sis_confirmar (jsonb). */
export type ResultadoConfirmar = { numero: number; creado_por: string; estado: EstadoReporte; reabierto: boolean; evento_id: number };

/**
 * «Sigue pasando» → a cada revisor (se reabrió). «Ya está, gracias» no avisa: cierra la
 * vuelta y la bandeja lo muestra; una campanita más por cada agradecimiento sería ruido.
 */
export function avisosConfirmar(res: ResultadoConfirmar, reporteId: string, actorId: string, revisores: readonly string[]): NuevaAlerta[] {
  if (!res.reabierto) return [];
  return [...new Set(revisores)].filter((d) => d !== actorId).map((d) => ({
    tipo: TIPOS_ALERTA.respuesta,
    clave: `sistemas:ev${res.evento_id}:${d}`,
    titulo: tituloAlertaRespuesta(Number(res.numero), true),
    prioridad: "alta" as const,
    enlace: enlaceRevision(reporteId),
    destinatarioId: d,
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// E/S: revisores, avisos, URLs firmadas, nombres
// ─────────────────────────────────────────────────────────────────────────────

/** Los revisores activos: `sistemas: editar` (sin atajo de admin, como sis_puede_revisar). */
export async function revisoresActivos(): Promise<string[]> {
  try {
    const { data, error } = await createAdminClient()
      .from("user_profiles")
      .select("id")
      .eq("activo", true)
      .eq("permisos->>sistemas", "editar");
    if (error) {
      console.warn("[sistemas] revisores:", error.message);
      return [];
    }
    return (data ?? []).map((f) => f.id as string);
  } catch (e) {
    console.warn("[sistemas] revisores:", e instanceof Error ? e.message : e);
    return [];
  }
}

/**
 * Crea las alertas con la service role. Nunca tira: un aviso que no sale no puede voltear el
 * reporte (crearAlertas ya se calla ante un error de la base).
 */
export async function enviarAvisos(alertas: NuevaAlerta[]): Promise<void> {
  if (!alertas.length) return;
  try {
    // Import diferido: servicio.ts arrastra next/server, y este archivo lo cargan también los
    // tests de node:test (que sólo usan las funciones puras).
    const { crearAlertas } = await import("@/lib/alertas/servicio");
    await crearAlertas(createAdminClient(), alertas);
  } catch (e) {
    console.warn("[sistemas] avisos:", e instanceof Error ? e.message : e);
  }
}

/**
 * Manda a Slack sin crear ninguna alerta (el eco de un reporte que frena y no tiene revisor a
 * quien avisar). En after() como espejarEnSlack: no hace esperar a quien reportó. Nunca tira.
 */
export async function soloSlack(alerta: NuevaAlerta | null): Promise<void> {
  if (!alerta) return;
  try {
    const [{ enviarASlack }, { after }] = await Promise.all([import("@/lib/alertas/slack"), import("next/server")]);
    try {
      after(() => enviarASlack([alerta]));
    } catch {
      void enviarASlack([alerta]);
    }
  } catch (e) {
    console.warn("[sistemas] slack:", e instanceof Error ? e.message : e);
  }
}

/** URLs firmadas de lectura. Las que no se pueden firmar se omiten (la tarjeta sale igual). */
export async function firmarCapturas(admin: DB, capturas: readonly FilaCaptura[] | null | undefined, segundos: number = LIMITES.urlFirmadaSeg): Promise<CapturaFirmada[]> {
  const lista = [...(capturas ?? [])].sort((a, b) => a.orden - b.orden);
  if (!lista.length) return [];
  const { data, error } = await admin.storage.from(BUCKET).createSignedUrls(lista.map((c) => c.path), segundos);
  if (error) {
    console.warn("[sistemas] firmar capturas:", error.message);
    return [];
  }
  const url = new Map((data ?? []).filter((d) => d.signedUrl && !d.error).map((d) => [d.path, d.signedUrl]));
  return lista
    .filter((c) => url.has(c.path))
    .map((c) => ({ id: c.id, url: url.get(c.path)!, ancho: c.ancho, alto: c.alto, orden: c.orden }));
}

/** Nombre, apellido y rol de cada id (service role: la RLS de user_profiles no es de Sistemas). */
export async function perfiles(admin: DB, ids: Iterable<string>): Promise<Map<string, Creador>> {
  const unicos = [...new Set([...ids].filter(Boolean))];
  const mapa = new Map<string, Creador>();
  if (!unicos.length) return mapa;
  const { data, error } = await admin.from("user_profiles").select("id, nombre, apellido, rol").in("id", unicos);
  if (error) {
    console.warn("[sistemas] perfiles:", error.message);
    return mapa;
  }
  for (const f of data ?? []) {
    mapa.set(f.id as string, { id: f.id as string, nombre: (f.nombre as string) ?? "", apellido: (f.apellido as string) ?? "", rol: (f.rol as string) ?? null });
  }
  return mapa;
}

const nombreCompleto = (c: Creador) => [c.nombre, c.apellido].filter(Boolean).join(" ").trim();

/** Los ids de quienes se llaman como lo buscado (sin tildes; todas las palabras tienen que estar). */
export async function idsPorNombre(admin: DB, texto: string): Promise<string[]> {
  const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const palabras = sinTildes(texto).split(/\s+/).filter(Boolean);
  if (!palabras.length) return [];
  const { data, error } = await admin.from("user_profiles").select("id, nombre, apellido");
  if (error) return [];
  return (data ?? [])
    .filter((f) => {
      const n = sinTildes(`${f.nombre ?? ""} ${f.apellido ?? ""}`);
      return palabras.every((p) => n.includes(p));
    })
    .map((f) => f.id as string);
}

// ─────────────────────────────────────────────────────────────────────────────
// E/S: lecturas para las pantallas
// ─────────────────────────────────────────────────────────────────────────────

/** Filas de la bandeja, con quién las mandó. */
export async function armarFilas(admin: DB, filas: readonly FilaReporte[], recortar?: number): Promise<ReporteFila[]> {
  const nombres = await perfiles(admin, filas.map((f) => f.creado_por));
  return filas.map((f) => aReporteFila(f, nombres.get(f.creado_por), { recortar }));
}

/**
 * Un reporte para la bandeja, con todo. `db` es la sesión del revisor (la RLS lo deja ver);
 * null si no existe. `segundos`: la vida de las URLs de las capturas (3600 para el prompt).
 * Tira el error de la base para que la ruta decida (503 si falta la tabla).
 */
export async function leerDetalle(db: DB, admin: DB, id: string, segundos: number = LIMITES.urlFirmadaSeg): Promise<ReporteDetalle | null> {
  const { data, error } = await db.from("sis_reportes").select(SELECT_DETALLE).eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const f = data as unknown as FilaReporte;

  const [dupsRes, origenRes] = await Promise.all([
    db.from("sis_reportes").select("id, numero").eq("duplicado_de", id).order("numero"),
    f.duplicado_de ? db.from("sis_reportes").select("id, numero").eq("id", f.duplicado_de).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ]);
  // El autor de cada evento no se puede leer con la sesión (permiso por columna: quien reportó
  // no tiene que saber cuál de los revisores le contestó). Acá ya pasó exigirRevisor.
  const { data: autores, error: errAutores } = await admin.from("sis_reporte_eventos").select("id, autor_id").eq("reporte_id", id);
  if (errAutores) console.warn("[sistemas] autores de eventos:", errAutores.message);
  const autorDe = new Map(((autores ?? []) as { id: number; autor_id: string | null }[]).map((a) => [Number(a.id), a.autor_id]));
  const eventos = [...(f.eventos ?? [])].map((e) => ({ ...e, autor_id: autorDe.get(Number(e.id)) ?? null })).sort(porId);
  const nombres = await perfiles(admin, [f.creado_por, ...eventos.map((e) => e.autor_id ?? "")]);
  const nombreDe = new Map([...nombres].map(([k, c]) => [k, nombreCompleto(c)]));
  const capturas = await firmarCapturas(admin, f.capturas, segundos);
  const contexto = contextoGuardado(f.contexto);
  const origen = origenRes.data as { id: string; numero: number } | null;

  return {
    ...aReporteFila(f, nombres.get(f.creado_por)),
    motivoDescarte: f.motivo_descarte,
    duplicadoDe: origen ? { id: origen.id, numero: Number(origen.numero) } : null,
    duplicados: ((dupsRes.data ?? []) as { id: string; numero: number }[]).map((d) => ({ id: d.id, numero: Number(d.numero) })),
    tituloPantalla: f.titulo_pantalla,
    modulo: f.modulo,
    shaCliente: f.sha_cliente,
    shaServidor: f.sha_servidor,
    contexto,
    dispositivo: dispositivoDe(contexto),
    capturas,
    eventos: eventos.map((e) => aEventoRevision(e, nombreDe)),
    confirmadoOk: f.confirmado_ok,
    cerradoAt: f.cerrado_at,
    avisadoEnSlack: f.frena && !!process.env.SLACK_WEBHOOK_SISTEMAS,
  };
}

/**
 * Las capturas de varios reportes, firmadas en UN solo pedido a Storage (Mis reportes trae
 * hasta 100 reportes: uno por reporte serían 100 viajes).
 */
export async function firmarPorReporte(admin: DB, filas: readonly FilaReporte[], segundos: number = LIMITES.urlFirmadaSeg): Promise<Map<string, CapturaFirmada[]>> {
  const deQuien = new Map<string, string>();
  const todas: FilaCaptura[] = [];
  for (const f of filas) for (const c of f.capturas ?? []) { deQuien.set(c.id, f.id); todas.push(c); }
  const firmadas = await firmarCapturas(admin, todas, segundos);
  const salida = new Map<string, CapturaFirmada[]>();
  for (const c of firmadas) {
    const r = deQuien.get(c.id)!;
    salida.set(r, [...(salida.get(r) ?? []), c]);
  }
  return salida;
}

/** Uno de «Mis reportes». `estadoOriginal` y las capturas firmadas los pone quien llama. */
export function aReporteUsuario(f: FilaReporte, estadoOriginal: EstadoReporte | null, capturas: CapturaFirmada[]): ReporteUsuario {
  return {
    id: f.id,
    numero: Number(f.numero),
    tipo: f.tipo,
    descripcion: f.descripcion,
    frena: f.frena,
    estado: f.estado,
    motivoDescarte: f.motivo_descarte,
    estadoOriginal,
    pantalla: pantallaDeRuta(f.ruta),
    ruta: f.ruta,
    createdAt: f.created_at,
    ultimaActividadAt: f.ultima_actividad_at,
    cerradoAt: f.cerrado_at,
    confirmadoOk: f.confirmado_ok,
    capturas: [...capturas].sort((x, y) => x.orden - y.orden),
    eventos: eventosPublicos(f.eventos),
  };
}

/**
 * Las métricas de la bandeja (service role, después de exigirRevisor). Cada parte que falla
 * queda en null o en cero; nunca voltea la lista.
 */
export async function leerMetricas(admin: DB, ahora: number = Date.now()): Promise<Metricas> {
  const desde = new Date(ahora - 30 * DIA).toISOString();
  const [rep, ev, rec] = await Promise.all([
    admin.from("sis_reportes").select("id, creado_por, created_at, estado, cerrado_at").or(`created_at.gte.${desde},cerrado_at.gte.${desde}`).limit(5000),
    admin.from("sis_reporte_eventos").select("reporte_id, tipo, texto, created_at").eq("lado", "sistemas").neq("tipo", "creado").gte("created_at", desde).limit(20000),
    leerRecorrido(admin),
  ]);
  if (rep.error || ev.error) {
    return { semana: { reportes: 0, personas: 0 }, primeraRespuestaDias: null, resolverDias: null, preguntamosPct: null, recorrido: rec };
  }
  return calcularMetricas({
    ahora,
    reportes: (rep.data ?? []) as { id: string; creado_por: string; created_at: string; estado: string; cerrado_at: string | null }[],
    eventosSistemas: (ev.data ?? []) as { reporte_id: string; tipo: string; texto: string | null; created_at: string }[],
    recorrido: rec,
  });
}

/** Cuántos activos (sin la cuenta técnica) hicieron el recorrido. Sin la tabla, null. */
async function leerRecorrido(admin: DB): Promise<{ hicieron: number; total: number } | null> {
  try {
    const [usuarios, vistos] = await Promise.all([
      admin.from("user_profiles").select("id, rol, permisos").eq("activo", true),
      admin.from("recorridos_vistos").select("usuario_id").eq("clave", RECORRIDO.clave).eq("version", RECORRIDO.version),
    ]);
    if (usuarios.error || vistos.error) return null;
    const hechos = new Set((vistos.data ?? []).map((v) => v.usuario_id as string));
    const personas = (usuarios.data ?? []).filter(
      (u) => !esCuentaTecnica({ rol: (u.rol as string) ?? null, permisos: (u.permisos as Record<string, unknown>) ?? {} }),
    );
    return { hicieron: personas.filter((u) => hechos.has(u.id as string)).length, total: personas.length };
  } catch {
    return null;
  }
}
