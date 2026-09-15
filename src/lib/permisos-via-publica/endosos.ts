import type { SupabaseClient } from "@supabase/supabase-js";
import { crearAlertas } from "@/lib/alertas/servicio";
import { enviarMail } from "@/lib/mail";
import { revisarPoliza } from "./revision-poliza";
import { formatoCuit, type Tramite } from "./tipos";

// El endoso de la póliza de RC, de punta a punta: pedido → aviso a Segucom → subida en su
// portal → revisión → lista para presentar. Todo con la service role: lo llaman rutas que
// ya validaron quién pide (el proxy con nivel "editar", o el token del productor) y el cron.
//
// POR QUÉ UN PORTAL Y NO LA RESPUESTA POR MAIL (decidido con JS, 2026-09-14): Gonzalo a veces
// manda varias pólizas en un mail —hay que adivinar cuál es de qué obra— y si está de
// vacaciones el mail queda en su casilla. El link lo resuelve cualquiera en Segucom, cada
// póliza entra en el casillero de su obra, y la revisión le contesta en el momento.

export const BUCKET = "permisos-via-publica";
const PRODUCTOR = "segucom";
const DIA = 86_400_000;

type Actor = "persona" | "productor" | "ia" | "sistema";
type FilaPedido = {
  id: string;
  tramite_id: string;
  pedido_at: string | null;
  aviso_enviado_at: string | null;
  recordatorio_at: string | null;
  pvp_tramites: Pick<Tramite, "direccion" | "titular_nombre" | "titular_cuit" | "permiso_hasta" | "expediente_id">;
};

const dia = (iso: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");

/** Origen de los links: el del pedido si lo hay; en el cron, el de producción. */
function urlBase(origen?: string | null): string | null {
  if (origen) return origen;
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  return process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : null;
}

async function evento(db: SupabaseClient, tramiteId: string, tipo: string, detalle: string, datos: object, actor: Actor) {
  const { data: t } = await db.from("pvp_tramites").select("expediente_id").eq("id", tramiteId).maybeSingle();
  const { error } = await db.from("pvp_eventos").insert({
    tramite_id: tramiteId, expediente_id: t?.expediente_id ?? null, tipo, detalle, datos, actor,
  });
  if (error) console.error("[endosos] no se pudo registrar el evento", tipo, error.message);
}

/** El productor dueño del link, o null. El token son 64 hex (ver la migración). */
export async function productorDeToken(db: SupabaseClient, token: string): Promise<{ id: string; nombre: string } | null> {
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  const { data } = await db.from("pvp_productores").select("id, nombre").eq("token", token).eq("activo", true).maybeSingle();
  return data;
}

const enlaceInterno = (t: { expediente_id: string | null }) =>
  t.expediente_id ? `/permisos-via-publica/${t.expediente_id}` : "/permisos-via-publica";

/** Deja la póliza del trámite en "pedido". El aviso sale aparte (avisarProductor), agrupado. */
export async function pedirEndoso(db: SupabaseClient, tramiteId: string, userId: string | null): Promise<void> {
  const ahora = new Date().toISOString();
  const { error } = await db.from("pvp_documentos").upsert(
    {
      tramite_id: tramiteId, clave: "poliza_rc", origen: "productor", estado: "pedido",
      pedido_at: ahora, aviso_enviado_at: null, aviso_error: null, recordatorio_at: null,
      observacion: null, updated_at: ahora,
    },
    { onConflict: "tramite_id,clave" },
  );
  if (error) throw new Error(`No se pudo registrar el pedido: ${error.message}`);
  await evento(db, tramiteId, "documento_pedido", "Se pidió el endoso de la póliza a Segucom.", { por: userId }, "persona");
}

async function pendientes(db: SupabaseClient): Promise<FilaPedido[]> {
  const { data, error } = await db
    .from("pvp_documentos")
    .select("id, tramite_id, pedido_at, aviso_enviado_at, recordatorio_at, pvp_tramites!inner(direccion, titular_nombre, titular_cuit, permiso_hasta, expediente_id)")
    .eq("clave", "poliza_rc")
    .eq("estado", "pedido")
    .order("pedido_at");
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as FilaPedido[];
}

function listado(filas: FilaPedido[]): string {
  return filas
    .map(({ pvp_tramites: t }) =>
      `- ${t.titular_nombre}, CUIT ${formatoCuit(t.titular_cuit ?? "")}. Obra: ${t.direccion}. Permiso hasta el ${dia(t.permiso_hasta)}.`)
    .join("\n");
}

async function mandarAProductor(db: SupabaseClient, filas: FilaPedido[], recordatorio: boolean, origen?: string | null) {
  const { data: p } = await db.from("pvp_productores").select("nombre, email, token").eq("id", PRODUCTOR).eq("activo", true).maybeSingle();
  if (!p) throw new Error("No hay un productor activo configurado");
  const base = urlBase(origen);
  if (!base) throw new Error("No se sabe la URL de la app para armar el link (NEXT_PUBLIC_APP_URL)");

  const una = filas.length === 1;
  const texto = [
    "Hola Gonza, ¿cómo estás?",
    "",
    recordatorio
      ? `Te recuerdo ${una ? "este endoso que todavía no se subió" : "estos endosos que todavía no se subieron"}:`
      : `Te pido el endoso de la póliza de RC para ${una ? "esta obra" : "estas obras"}: el titular como coasegurado y la cláusula de no repetición a favor del GCBA.`,
    "",
    listado(filas),
    "",
    `Cuando ${una ? "lo tengas, subí el PDF" : "los tengas, subí el PDF de cada una"} en este link (lo puede subir cualquiera de Segucom):`,
    `${base}/endosos/${p.token}`,
    "",
    "Al subirlo te avisa en el momento si le falta algo.",
    "",
    "¡Gracias!",
    "Joaquín",
  ].join("\n");

  await enviarMail({
    para: p.email,
    asunto: recordatorio ? `Recordatorio: endosos pendientes (${filas.length})` : `Endosos para pedir — Andamios Buenos Aires (${filas.length})`,
    texto,
  });
}

/**
 * Manda UN mail con todos los pedidos que todavía no avisaron. Si el mail falla, el pedido
 * queda sin aviso y con el error a la vista en la ficha; el cron lo reintenta.
 */
export async function avisarProductor(db: SupabaseClient, origen?: string | null): Promise<number> {
  const sinAviso = (await pendientes(db)).filter((f) => !f.aviso_enviado_at);
  if (sinAviso.length === 0) return 0;
  const ids = sinAviso.map((f) => f.id);
  try {
    await mandarAProductor(db, sinAviso, false, origen);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.from("pvp_documentos").update({ aviso_error: msg.slice(0, 300) }).in("id", ids);
    console.error("[endosos] no se pudo avisar al productor", msg);
    return 0;
  }
  const ahora = new Date().toISOString();
  await db.from("pvp_documentos").update({ aviso_enviado_at: ahora, aviso_error: null }).in("id", ids);
  for (const f of sinAviso) {
    await evento(db, f.tramite_id, "aviso_productor", "Se le mandó el pedido por mail a Segucom.", {}, "sistema");
  }
  return sinAviso.length;
}

/**
 * Lo que corre el cron cada mañana: reintenta avisos, recuerda a Segucom lo que lleva más
 * de un día sin subirse y, si después del recordatorio sigue sin subirse, avisa a ABA para
 * que alguien llame.
 */
export async function recordarEndosos(db: SupabaseClient): Promise<{ avisos: number; recordatorios: number; trabados: number }> {
  const avisos = await avisarProductor(db);
  const filas = await pendientes(db);
  const ahora = Date.now();

  const aRecordar = filas.filter((f) => f.aviso_enviado_at && !f.recordatorio_at && ahora - Date.parse(f.aviso_enviado_at) > DIA);
  let recordatorios = 0;
  if (aRecordar.length > 0) {
    try {
      await mandarAProductor(db, aRecordar, true);
      await db.from("pvp_documentos").update({ recordatorio_at: new Date().toISOString() }).in("id", aRecordar.map((f) => f.id));
      recordatorios = aRecordar.length;
    } catch (e) {
      console.error("[endosos] no se pudo mandar el recordatorio", e);
    }
  }

  const trabados = filas.filter((f) => f.recordatorio_at && ahora - Date.parse(f.recordatorio_at) > DIA);
  await crearAlertas(db, trabados.map((f) => ({
    tipo: "permiso_endoso" as const,
    clave: `permiso_endoso:${f.id}:sin_subir:${(f.pedido_at ?? "").slice(0, 10)}`,
    titulo: `Segucom no subió la póliza — ${f.pvp_tramites.direccion}`,
    descripcion: `Se pidió el ${dia(f.pedido_at)} y ya se le recordó. Hay que llamar a Gonzalo.`,
    prioridad: "alta" as const,
    enlace: enlaceInterno(f.pvp_tramites),
  })));

  return { avisos, recordatorios, trabados: trabados.length };
}

/** Registra un PDF recién subido. La revisión va aparte (revisarDocumento), después de responder. */
export async function registrarSubida(
  db: SupabaseClient,
  documentoId: string,
  archivo: { path: string; nombre: string },
  actor: "persona" | "productor",
): Promise<void> {
  const { data: doc, error } = await db.from("pvp_documentos").select("tramite_id, version").eq("id", documentoId).single();
  if (error || !doc) throw new Error("El documento no existe");
  const ahora = new Date().toISOString();
  const version = doc.version + 1;
  const { error: e2 } = await db.from("pvp_documentos").update({
    estado: "revisando", archivo_path: archivo.path, archivo_nombre: archivo.nombre, version,
    subido_por: actor, subido_at: ahora, observacion: null, revision: null, revisado_at: null, updated_at: ahora,
  }).eq("id", documentoId);
  if (e2) throw new Error(e2.message);
  await evento(db, doc.tramite_id, "documento_subido", `${archivo.nombre} (versión ${version})`, { path: archivo.path }, actor);
}

/** Lee la póliza con IA, decide ok/observado y avisa a ABA cuando quedó lista. Nunca tira. */
export async function revisarDocumento(db: SupabaseClient, documentoId: string): Promise<void> {
  const { data: doc } = await db
    .from("pvp_documentos")
    .select("id, tramite_id, version, archivo_path, pvp_tramites!inner(direccion, titular_nombre, titular_cuit, permiso_hasta, expediente_id)")
    .eq("id", documentoId)
    .single();
  if (!doc?.archivo_path) return;
  const tramite = doc.pvp_tramites as unknown as FilaPedido["pvp_tramites"];

  try {
    const { data: archivo, error } = await db.storage.from(BUCKET).download(doc.archivo_path);
    if (error || !archivo) throw new Error("No se encontró el archivo subido");
    const revision = await revisarPoliza(Buffer.from(await archivo.arrayBuffer()), tramite);
    const fallas = revision.chequeos.filter((c) => !c.ok && c.bloquea);
    const estado = fallas.length === 0 ? "ok" : "observado";
    const observacion = fallas.length === 0 ? null : fallas.map((c) => c.detalle).join(" ");
    const ahora = new Date().toISOString();

    await db.from("pvp_documentos").update({ estado, revision, revisado_at: ahora, observacion, updated_at: ahora }).eq("id", documentoId);
    await evento(db, doc.tramite_id, "documento_revisado", estado === "ok" ? "La póliza cumple lo que pide el GCBA." : `Observada: ${observacion}`, { estado, version: doc.version }, "ia");

    if (estado === "ok") {
      await crearAlertas(db, [{
        tipo: "permiso_endoso",
        clave: `permiso_endoso:${documentoId}:ok:v${doc.version}`,
        titulo: `Póliza lista — ${tramite.direccion}`,
        descripcion: "Segucom subió el endoso y cumple lo que pide el GCBA. Ya se puede presentar o subsanar.",
        enlace: enlaceInterno(tramite),
      }]);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.from("pvp_documentos").update({
      observacion: `No se pudo revisar sola (${msg}). La tiene que mirar una persona.`,
      updated_at: new Date().toISOString(),
    }).eq("id", documentoId);
    await evento(db, doc.tramite_id, "documento_revisado", `No se pudo revisar: ${msg}`, { error: msg }, "ia");
    await crearAlertas(db, [{
      tipo: "permiso_endoso",
      clave: `permiso_endoso:${documentoId}:error:v${doc.version}`,
      titulo: `Revisar la póliza a mano — ${tramite.direccion}`,
      descripcion: msg,
      prioridad: "alta",
      enlace: enlaceInterno(tramite),
    }]);
  }
}
