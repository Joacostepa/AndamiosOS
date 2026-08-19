// Servicio de Habilitaciones — junta la gestión (Supabase) con el estado (Odoo).
//
// SOLO server-side. Es el único lugar donde los dos sistemas se tocan.
//
// EL REPARTO, en una línea: Odoo tiene el estado que el tablero lee; Supabase tiene la
// gestión que nadie lee desde Odoo. El criterio es un dueño por dato.
//
// EL ÚNICO PUNTO QUE PUEDE FALLAR EN SILENCIO es el push de los inputs a Odoo, y por eso
// existe `hab_ots.sync_estado`: si el push se cae por un 429, un timeout o un deploy en
// el medio, la fila queda en `error`, se ve en el contador de la bandeja y la
// reconciliación la repara. Sin esa marca, el tablero mostraría un semáforo viejo y
// nadie se enteraría.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  escribirInputs, fetchOt, fetchOtsActivas, leerOt, otsExistentes, urlOdooOt, urlOdooVenta,
} from "@/lib/odoo/habilitaciones";
import { derivarInputs, hoyISO, agruparBandeja, DIAS_DEDUP_CONSULTA } from "./derivacion";
import type {
  Bandeja, EstadoRequisito, FichaHabilitacion, FilaBandeja, Gestion, InputsHabilitacion,
  Nota, Paquete, Requisito, TipoGestion,
} from "./tipos";

type DB = SupabaseClient;

type FilaHabOt = {
  odoo_ot_id: number;
  triage: "aplica" | "no_aplica" | null;
  triage_fecha: string | null;
  hab_estado: string | null;
  hab_fecha_consulta: string | null;
  hab_fecha_envio: string | null;
  hab_fecha: string | null;
  hab_vencimiento: string | null;
  sync_estado: "pendiente" | "sincronizado" | "error" | "huerfana";
  sync_error: string | null;
  sync_intentos: number;
};

/**
 * Las cabeceras locales de las OTs pedidas, creando las que falten.
 *
 * LAS OBRAS ENTRAN SOLAS: al crearse la OT en Odoo la habilitación aparece en `Recién
 * llegadas` sin que nadie la dé de alta. Eso se logra acá — no hay webhook ni alta
 * manual: la bandeja lee las OTs activas de Odoo y siembra la fila local que falte, con
 * `triage = null`, que es exactamente lo que significa "recién llegada".
 */
async function cabecerasDe(db: DB, otIds: number[]): Promise<Map<number, FilaHabOt>> {
  if (otIds.length === 0) return new Map();

  const { data, error } = await db
    .from("hab_ots")
    .select("odoo_ot_id, triage, triage_fecha, hab_estado, hab_fecha_consulta, hab_fecha_envio, hab_fecha, hab_vencimiento, sync_estado, sync_error, sync_intentos")
    .in("odoo_ot_id", otIds);
  if (error) throw new Error(error.message);

  const mapa = new Map<number, FilaHabOt>((data ?? []).map((f) => [f.odoo_ot_id, f as FilaHabOt]));

  const faltantes = otIds.filter((id) => !mapa.has(id));
  if (faltantes.length > 0) {
    const { data: creadas, error: e2 } = await db
      .from("hab_ots")
      .upsert(faltantes.map((odoo_ot_id) => ({ odoo_ot_id })), { onConflict: "odoo_ot_id" })
      .select("odoo_ot_id, triage, triage_fecha, hab_estado, hab_fecha_consulta, hab_fecha_envio, hab_fecha, hab_vencimiento, sync_estado, sync_error, sync_intentos");
    if (e2) throw new Error(e2.message);
    for (const f of creadas ?? []) mapa.set(f.odoo_ot_id, f as FilaHabOt);
  }

  return mapa;
}

// ─── Bandeja ────────────────────────────────────────────────────────────────

export async function fetchBandeja(db: DB): Promise<Bandeja> {
  const otsOdoo = await fetchOtsActivas();
  const otIds = otsOdoo.map((o) => o.ot.id);
  const cabeceras = await cabecerasDe(db, otIds);

  const [requisitos, notas] = await Promise.all([
    db.from("hab_requisitos").select("odoo_ot_id, estado").in("odoo_ot_id", otIds),
    db.from("hab_notas").select("odoo_ot_id, texto").in("odoo_ot_id", otIds).eq("fijada", true),
  ]);
  if (requisitos.error) throw new Error(requisitos.error.message);
  if (notas.error) throw new Error(notas.error.message);

  const conteo = new Map<number, { total: number; aprobados: number; observados: number }>();
  for (const r of requisitos.data ?? []) {
    const c = conteo.get(r.odoo_ot_id) ?? { total: 0, aprobados: 0, observados: 0 };
    c.total++;
    if (r.estado === "aprobado") c.aprobados++;
    if (r.estado === "observado") c.observados++;
    conteo.set(r.odoo_ot_id, c);
  }

  const fijadas = new Map<number, string[]>();
  for (const n of notas.data ?? []) {
    fijadas.set(n.odoo_ot_id, [...(fijadas.get(n.odoo_ot_id) ?? []), n.texto]);
  }

  const filas: FilaBandeja[] = otsOdoo.map(({ ot, permiso }) => {
    const base = leerOt(ot);
    const cab = cabeceras.get(ot.id);
    return {
      otId: base.otId,
      titulo: base.titulo,
      ventaNombre: base.ventaNombre,
      tipo: base.tipo,
      estadoOt: base.estadoOt,
      fechaProgramada: base.fechaProgramada,
      etapa: base.etapa,
      alerta: base.alerta,
      semaforo: base.semaforo,
      dias: base.dias,
      vencimiento: base.vencimiento,
      triage: cab?.triage ?? null,
      syncEstado: cab?.sync_estado ?? "pendiente",
      modalidad: permiso.modalidad,
      tramite: permiso.tramite,
      tecnicoNombre: permiso.tecnicoNombre,
      requisitos: conteo.get(ot.id) ?? { total: 0, aprobados: 0, observados: 0 },
      notasFijadas: fijadas.get(ot.id) ?? [],
      url: urlOdooOt(ot.id),
    };
  });

  const grupos = agruparBandeja(filas);
  return {
    grupos,
    total: grupos.reduce((n, g) => n + g.filas.length, 0),
    desincronizadas: filas.filter((f) => f.syncEstado === "error").length,
    noAplican: filas
      .filter((f) => f.triage === "no_aplica")
      .sort((a, b) => a.titulo.localeCompare(b.titulo)),
  };
}

// ─── Ficha ──────────────────────────────────────────────────────────────────

/**
 * Sólo lo que vive en Supabase: requisitos, notas, historial. NO TOCA ODOO.
 *
 * Existe separado por una razón de latencia concreta: marcar un requisito o aplicar un
 * paquete cambia únicamente datos de Supabase, pero refrescar la ficha entera obliga a
 * releer la OT y su venta en Odoo —dos llamadas SECUENCIALES de ~300 ms cada una, porque
 * hay que leer la OT para saber cuál es la venta—. Eran ~2 segundos de espera para traer
 * datos que no habían cambiado.
 *
 * Las mutaciones devuelven esto y el hook lo mete en la caché con setQueryData, sin
 * refetch. Ver use-habilitaciones.ts.
 */
export async function fetchGestionDe(db: DB, otId: number): Promise<{
  requisitos: Requisito[];
  notas: Nota[];
  gestiones: Gestion[];
  reclamos: number;
}> {
  const [reqs, notas, gestiones] = await Promise.all([
    db.from("hab_requisitos").select("*").eq("odoo_ot_id", otId).order("orden").order("created_at"),
    db.from("hab_notas").select("*, user_profiles(nombre)").eq("odoo_ot_id", otId)
      .order("fijada", { ascending: false }).order("created_at", { ascending: false }),
    db.from("hab_gestiones").select("*, user_profiles(nombre)").eq("odoo_ot_id", otId)
      .order("created_at", { ascending: false }),
  ]);
  if (reqs.error) throw new Error(reqs.error.message);
  if (notas.error) throw new Error(notas.error.message);
  if (gestiones.error) throw new Error(gestiones.error.message);

  const listaGestiones = (gestiones.data ?? []).map(mapGestion);
  return {
    requisitos: (reqs.data ?? []) as Requisito[],
    notas: (notas.data ?? []).map(mapNota),
    gestiones: listaGestiones,
    reclamos: listaGestiones.filter((g) => g.tipo === "reclamo").length,
  };
}

export async function fetchFicha(db: DB, otId: number): Promise<FichaHabilitacion | null> {
  const enOdoo = await fetchOt(otId);
  if (!enOdoo) return null;

  const [cabeceras, gestion] = await Promise.all([
    cabecerasDe(db, [otId]),
    fetchGestionDe(db, otId),
  ]);

  const base = leerOt(enOdoo.ot);
  const cab = cabeceras.get(otId);

  return {
    otId: base.otId,
    titulo: base.titulo,
    tipo: base.tipo,
    estadoOt: base.estadoOt,
    fechaProgramada: base.fechaProgramada,
    etapa: base.etapa,
    semaforo: base.semaforo,
    alerta: base.alerta,
    dias: base.dias,
    fechaConsulta: base.fechaConsulta,
    fechaEnvio: base.fechaEnvio,
    fechaHabilitada: base.fechaHabilitada,
    vencimiento: base.vencimiento,
    observaciones: base.observaciones,
    triage: cab?.triage ?? null,
    syncEstado: cab?.sync_estado ?? "pendiente",
    syncError: cab?.sync_error ?? null,
    permiso: enOdoo.permiso,
    ...gestion,
    url: urlOdooOt(otId),
    urlVenta: urlOdooVenta(enOdoo.permiso.ventaId),
  };
}

type ConPerfil = { user_profiles?: { nombre: string } | null };

function mapNota(n: ConPerfil & Record<string, unknown>): Nota {
  return { ...(n as unknown as Nota), autor_nombre: n.user_profiles?.nombre ?? null };
}

function mapGestion(g: ConPerfil & Record<string, unknown>): Gestion {
  return { ...(g as unknown as Gestion), autor_nombre: g.user_profiles?.nombre ?? null };
}

// ─── Gestiones (append-only) ────────────────────────────────────────────────

export async function registrarGestion(
  db: DB,
  otId: number,
  tipo: TipoGestion,
  detalle: string | null,
  autorId: string | null,
): Promise<void> {
  const { error } = await db.from("hab_gestiones").insert({
    odoo_ot_id: otId, tipo, detalle, autor_id: autorId,
  });
  if (error) throw new Error(error.message);
}

/**
 * ¿Ya se registró un pedido de modalidad reciente para esta OT?
 *
 * Un bloque de 4 jornadas confirmadas no puede dejar 4 `consulta` idénticas: el
 * historial se llenaría de pedidos que además nadie mandó por fuera del sistema.
 */
export async function hayConsultaReciente(db: DB, otId: number): Promise<boolean> {
  const desde = new Date(Date.now() - DIAS_DEDUP_CONSULTA * 86_400_000).toISOString();
  const { data, error } = await db
    .from("hab_gestiones")
    .select("id")
    .eq("odoo_ot_id", otId)
    .eq("tipo", "consulta")
    .gte("created_at", desde)
    .limit(1);
  if (error) throw new Error(error.message);
  return (data ?? []).length > 0;
}

export async function contarConsultas(db: DB, otId: number): Promise<number> {
  const { count, error } = await db
    .from("hab_gestiones")
    .select("id", { count: "exact", head: true })
    .eq("odoo_ot_id", otId)
    .eq("tipo", "consulta");
  if (error) throw new Error(error.message);
  return count ?? 0;
}

// ─── Triage ─────────────────────────────────────────────────────────────────

/**
 * Triage por lote. Escribe en Supabase y devuelve enseguida; Odoo se sincroniza después.
 *
 * POR QUÉ POR LOTE: con ~68 entradas por mes, si el triage no es de un clic la bandeja
 * se llena de ruido y deja de significar algo — que es exactamente lo que le pasó a la
 * planilla que este módulo reemplaza.
 *
 * POR QUÉ OPTIMISTA: cada RPC a Odoo tarda ~800 ms sin importar la concurrencia.
 * Resolver 4 obras contra Odoo serían 4 × 800 ms en la acción más frecuente del módulo.
 */
export type DecisionTriage = "aplica" | "no_aplica" | "pendiente";

const DETALLE_TRIAGE: Record<DecisionTriage, string> = {
  aplica: "Aplica — se creó el paquete Básico",
  no_aplica: "No aplica",
  pendiente: "Vuelta a la cola — se deshizo el triage",
};

export async function triar(
  db: DB,
  otIds: number[],
  decision: DecisionTriage,
  autorId: string | null,
): Promise<void> {
  const hoy = hoyISO();
  await cabecerasDe(db, otIds);

  const { error } = await db
    .from("hab_ots")
    .update({
      // `pendiente` deshace el triage: la obra vuelve a "Recién llegadas". El triage por
      // lote resuelve decenas de obras de un clic, así que un clic de más no puede ser
      // irreversible — y la vuelta atrás queda registrada como cualquier otra decisión.
      triage: decision === "pendiente" ? null : decision,
      triage_fecha: decision === "pendiente" ? null : new Date().toISOString(),
      triage_autor: decision === "pendiente" ? null : autorId,
      sync_estado: "pendiente",
      // "Aplica" sella la fecha de consulta en el mismo gesto que crea los requisitos.
      // Si no, Odoo computa etapa `a` ("falta consultar requisitos") sobre una obra que
      // ya tiene los requisitos cargados: la etapa va por fechas, no por conteo.
      ...(decision === "aplica" ? { hab_fecha_consulta: hoy } : {}),
    })
    .in("odoo_ot_id", otIds);
  if (error) throw new Error(error.message);

  if (decision === "aplica") await sembrarPaqueteDefault(db, otIds);

  // Volver a la cola NO borra los requisitos, las notas ni el historial: si la obra ya
  // había pasado por "aplica", vuelve al estado en que estaba. Deshacer una decisión no
  // puede destruir el trabajo hecho antes de tomarla.
  const { error: e2 } = await db.from("hab_gestiones").insert(
    otIds.map((odoo_ot_id) => ({
      odoo_ot_id,
      tipo: "triage" as const,
      detalle: DETALLE_TRIAGE[decision],
      autor_id: autorId,
    })),
  );
  if (e2) throw new Error(e2.message);
}

/**
 * Crea el paquete por defecto (Básico = Nómina ART) en las OTs que no tengan requisitos.
 *
 * Cubre el 82% de las obras: para esas, configurar los requisitos es un clic y el
 * listado de la ficha no se toca nunca. El listado es maquinaria para el 18% restante.
 */
async function sembrarPaqueteDefault(db: DB, otIds: number[]): Promise<void> {
  const { data: paquete } = await db
    .from("hab_paquetes").select("requisitos").eq("es_default", true).maybeSingle();
  const nombres: string[] = paquete?.requisitos ?? ["Nómina ART"];
  if (nombres.length === 0) return;

  const { data: yaTienen, error } = await db
    .from("hab_requisitos").select("odoo_ot_id").in("odoo_ot_id", otIds);
  if (error) throw new Error(error.message);
  const conRequisitos = new Set((yaTienen ?? []).map((r) => r.odoo_ot_id));

  const nuevos = otIds
    .filter((id) => !conRequisitos.has(id))
    .flatMap((odoo_ot_id) =>
      nombres.map((nombre, i) => ({
        odoo_ot_id, nombre, origen: "paquete" as const, orden: i * 10,
      })),
    );
  if (nuevos.length === 0) return;

  const { error: e2 } = await db.from("hab_requisitos").insert(nuevos);
  if (e2) throw new Error(e2.message);
}

/** Reemplaza los requisitos de origen `paquete`, respetando los agregados a mano. */
export async function aplicarPaquete(db: DB, otId: number, paqueteId: string): Promise<void> {
  const { data: paquete, error } = await db
    .from("hab_paquetes").select("requisitos").eq("id", paqueteId).single();
  if (error) throw new Error(error.message);

  const { data: actuales } = await db
    .from("hab_requisitos").select("id, nombre, estado, origen").eq("odoo_ot_id", otId);

  const nombres: string[] = paquete?.requisitos ?? [];
  const existentes = new Set((actuales ?? []).map((r) => r.nombre));

  // Se borran sólo los del paquete anterior que nadie tocó: uno ya enviado o aprobado es
  // trabajo hecho, y cambiar de paquete no puede borrar trabajo hecho.
  const aBorrar = (actuales ?? [])
    .filter((r) => r.origen === "paquete" && r.estado === "pendiente" && !nombres.includes(r.nombre))
    .map((r) => r.id);
  if (aBorrar.length > 0) {
    await db.from("hab_requisitos").delete().in("id", aBorrar);
  }

  const aCrear = nombres
    .filter((n) => !existentes.has(n))
    .map((nombre, i) => ({ odoo_ot_id: otId, nombre, origen: "paquete" as const, orden: i * 10 }));
  if (aCrear.length > 0) {
    const { error: e2 } = await db.from("hab_requisitos").insert(aCrear);
    if (e2) throw new Error(e2.message);
  }
}

export async function listarPaquetes(db: DB): Promise<Paquete[]> {
  const { data, error } = await db
    .from("hab_paquetes").select("*").eq("activo", true).order("orden");
  if (error) throw new Error(error.message);
  return (data ?? []) as Paquete[];
}

// ─── Requisitos ─────────────────────────────────────────────────────────────

export async function cambiarEstadoRequisito(
  db: DB,
  requisitoId: string,
  estado: EstadoRequisito,
  motivo: string | null,
): Promise<number> {
  const hoy = hoyISO();
  const { data: previo, error: e0 } = await db
    .from("hab_requisitos").select("odoo_ot_id, fecha_envio").eq("id", requisitoId).single();
  if (e0) throw new Error(e0.message);

  const cambio: Record<string, unknown> = { estado, motivo_obs: estado === "observado" ? motivo : null };
  // La fecha de envío se sella la primera vez y no se pisa: es la que sostiene la etapa
  // `c` en Odoo y el "días sin respuesta" de la fila.
  if (estado === "enviado" && !previo.fecha_envio) cambio.fecha_envio = hoy;
  if (estado === "aprobado" || estado === "observado") cambio.fecha_resolucion = hoy;
  if (estado === "pendiente") { cambio.fecha_envio = null; cambio.fecha_resolucion = null; }

  const { error } = await db.from("hab_requisitos").update(cambio).eq("id", requisitoId);
  if (error) throw new Error(error.message);
  return previo.odoo_ot_id as number;
}

export async function agregarRequisito(db: DB, otId: number, nombre: string): Promise<void> {
  const { data } = await db
    .from("hab_requisitos").select("orden").eq("odoo_ot_id", otId)
    .order("orden", { ascending: false }).limit(1).maybeSingle();
  const { error } = await db.from("hab_requisitos").insert({
    odoo_ot_id: otId, nombre, origen: "manual", orden: (data?.orden ?? 0) + 10,
  });
  if (error) throw new Error(error.message);
}

export async function borrarRequisito(db: DB, requisitoId: string): Promise<number> {
  const { data, error: e0 } = await db
    .from("hab_requisitos").select("odoo_ot_id").eq("id", requisitoId).single();
  if (e0) throw new Error(e0.message);
  const { error } = await db.from("hab_requisitos").delete().eq("id", requisitoId);
  if (error) throw new Error(error.message);
  return data.odoo_ot_id as number;
}

// ─── Notas ──────────────────────────────────────────────────────────────────

export async function agregarNota(
  db: DB, otId: number, texto: string, fijada: boolean, autorId: string | null,
): Promise<void> {
  const { error } = await db.from("hab_notas").insert({
    odoo_ot_id: otId, texto, fijada, autor_id: autorId,
  });
  if (error) throw new Error(error.message);
}

export async function fijarNota(db: DB, notaId: string, fijada: boolean): Promise<void> {
  const { error } = await db.from("hab_notas").update({ fijada }).eq("id", notaId);
  if (error) throw new Error(error.message);
}

export async function borrarNota(db: DB, notaId: string): Promise<void> {
  const { error } = await db.from("hab_notas").delete().eq("id", notaId);
  if (error) throw new Error(error.message);
}

/** Las notas fijadas de varias OTs — las lee el panel del tablero. */
export async function notasFijadasDe(db: DB, otIds: number[]): Promise<Map<number, Nota[]>> {
  if (otIds.length === 0) return new Map();
  const { data, error } = await db
    .from("hab_notas").select("*").in("odoo_ot_id", otIds).eq("fijada", true)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  const mapa = new Map<number, Nota[]>();
  for (const n of (data ?? []) as Nota[]) {
    mapa.set(n.odoo_ot_id, [...(mapa.get(n.odoo_ot_id) ?? []), n]);
  }
  return mapa;
}

// ─── Sincronización con Odoo ────────────────────────────────────────────────

/**
 * Deriva los inputs desde los requisitos y los empuja a Odoo.
 *
 * Se llama SIEMPRE desde `after()`, fuera del camino crítico: la UI ya es optimista y
 * ninguna pantalla depende de que Odoo haya contestado. Un fallo acá no puede tirar
 * abajo la escritura que el usuario pidió; queda marcado y la reconciliación lo repara.
 */
export async function sincronizarOt(db: DB, otId: number): Promise<void> {
  const { data: cab, error } = await db
    .from("hab_ots")
    .select("triage, hab_fecha_consulta, hab_vencimiento, sync_intentos")
    .eq("odoo_ot_id", otId)
    .maybeSingle();
  if (error) throw new Error(error.message);

  const { data: reqs, error: e2 } = await db
    .from("hab_requisitos").select("*").eq("odoo_ot_id", otId).order("orden");
  if (e2) throw new Error(e2.message);

  const inputs = derivarInputs(
    (reqs ?? []) as Requisito[],
    {
      hab_fecha_consulta: cab?.hab_fecha_consulta ?? null,
      hab_vencimiento: cab?.hab_vencimiento ?? null,
    },
    { triage: cab?.triage ?? null },
  );

  try {
    await escribirInputs(otId, inputs);
    await guardarEspejo(db, otId, inputs, { ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await guardarEspejo(db, otId, inputs, { ok: false, error: msg, intentos: (cab?.sync_intentos ?? 0) + 1 });
    throw e;
  }
}

async function guardarEspejo(
  db: DB,
  otId: number,
  inputs: InputsHabilitacion,
  res: { ok: boolean; error?: string; intentos?: number },
): Promise<void> {
  await db.from("hab_ots").update({
    ...inputs,
    sync_estado: res.ok ? "sincronizado" : "error",
    sync_error: res.ok ? null : (res.error ?? "").slice(0, 500),
    sync_intentos: res.ok ? 0 : (res.intentos ?? 1),
    sync_fecha: new Date().toISOString(),
  }).eq("odoo_ot_id", otId);
}

/**
 * Red de seguridad. Recalcula los inputs de todas las OTs que quedaron `pendiente` o
 * `error` y repara Odoo. Idempotente: `derivarInputs` sale de las fechas de los propios
 * requisitos, no de `hoy`, así que correrlo dos veces da lo mismo.
 *
 * Marca `huerfana` —no borra— la fila cuya OT ya no existe en Odoo. Borrar en cascada
 * desde un sistema que no controlamos es la forma de perder datos sin enterarse.
 */
export async function reconciliar(db: DB): Promise<{ reparadas: number; fallidas: number; huerfanas: number }> {
  const { data, error } = await db
    .from("hab_ots").select("odoo_ot_id").in("sync_estado", ["pendiente", "error"]).limit(200);
  if (error) throw new Error(error.message);

  const ids = (data ?? []).map((f) => f.odoo_ot_id as number);
  if (ids.length === 0) return { reparadas: 0, fallidas: 0, huerfanas: 0 };

  const vivas = await otsExistentes(ids);
  const huerfanas = ids.filter((id) => !vivas.has(id));
  if (huerfanas.length > 0) {
    await db.from("hab_ots").update({ sync_estado: "huerfana" }).in("odoo_ot_id", huerfanas);
  }

  let reparadas = 0;
  let fallidas = 0;
  for (const id of ids.filter((i) => vivas.has(i))) {
    try {
      await sincronizarOt(db, id);
      reparadas++;
    } catch {
      fallidas++;
    }
  }
  return { reparadas, fallidas, huerfanas: huerfanas.length };
}
