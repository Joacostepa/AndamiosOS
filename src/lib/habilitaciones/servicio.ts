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
import { claveDe, crearAlertas } from "@/lib/alertas/servicio";
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
  habilitada_el: string | null;
  habilitada_motivo: string | null;
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
 *
 * Devuelve además QUÉ OTs se sembraron en esta corrida. Ese dato es la detección de "OT
 * nueva" para las notificaciones: acá y en ningún otro lado se sabe que una OT apareció
 * por primera vez, porque las OTs no se dan de alta en Supabase — se descubren leyendo
 * Odoo. El aviso lo crea fetchBandeja, que es quien tiene los títulos.
 */
async function cabecerasDe(
  db: DB,
  otIds: number[],
): Promise<{ mapa: Map<number, FilaHabOt>; nuevas: number[] }> {
  if (otIds.length === 0) return { mapa: new Map(), nuevas: [] };

  const { data, error } = await db
    .from("hab_ots")
    .select("odoo_ot_id, triage, triage_fecha, hab_estado, hab_fecha_consulta, hab_fecha_envio, hab_fecha, hab_vencimiento, habilitada_el, habilitada_motivo, sync_estado, sync_error, sync_intentos")
    .in("odoo_ot_id", otIds);
  if (error) throw new Error(error.message);

  const mapa = new Map<number, FilaHabOt>((data ?? []).map((f) => [f.odoo_ot_id, f as FilaHabOt]));

  const faltantes = otIds.filter((id) => !mapa.has(id));
  if (faltantes.length > 0) {
    const { data: creadas, error: e2 } = await db
      .from("hab_ots")
      .upsert(faltantes.map((odoo_ot_id) => ({ odoo_ot_id })), { onConflict: "odoo_ot_id" })
      .select("odoo_ot_id, triage, triage_fecha, hab_estado, hab_fecha_consulta, hab_fecha_envio, hab_fecha, hab_vencimiento, habilitada_el, habilitada_motivo, sync_estado, sync_error, sync_intentos");
    if (e2) throw new Error(e2.message);
    for (const f of creadas ?? []) mapa.set(f.odoo_ot_id, f as FilaHabOt);
  }

  return { mapa, nuevas: faltantes };
}

/**
 * El requisito que nace de que el cliente haya contratado técnico de Seguridad e Higiene.
 *
 * POR QUÉ UN REQUISITO Y NO UNA ETIQUETA MÁS. Este módulo ya sabe perseguir papeles: los
 * requisitos se mandan, se rebotan con motivo, se aprueban, cuentan en el "3/4" de la fila
 * y bloquean declarar la obra habilitada hasta estar todos aprobados. La documentación del
 * técnico de SyH es exactamente eso — un papel que hay que mandar y que el cliente tiene
 * que aprobar antes de dejar entrar a la cuadrilla—, así que entra por la puerta que ya
 * existe en vez de estrenar una. Un cartel avisa; un requisito se persigue.
 *
 * ORIGEN "manual" Y NO "paquete" a propósito: aplicarPaquete borra los pendientes de
 * origen `paquete` que no estén en el paquete nuevo, y este requisito no pertenece a
 * ninguno — cambiar de paquete lo borraría y la próxima lectura lo volvería a crear, en un
 * ciclo que ensucia el historial.
 *
 * NO SE BORRA si después alguien pasa la orden a "SyH: no". Es el mismo criterio que ya
 * rige el triage: deshacer una decisión no destruye el trabajo hecho. Deja de exigirse
 * para las obras nuevas y listo.
 */
export const REQUISITO_SYH = "Documentación de técnico de SyH";

/** Orden alto: va al final del listado, después de los papeles del paquete. */
const ORDEN_SYH = 500;

async function sembrarRequisitoSyh(db: DB, otIds: number[]): Promise<void> {
  if (otIds.length === 0) return;
  const { error } = await db.from("hab_requisitos").insert(
    otIds.map((odoo_ot_id) => ({
      odoo_ot_id,
      nombre: REQUISITO_SYH,
      origen: "manual" as const,
      orden: ORDEN_SYH,
    })),
  );
  if (error) throw new Error(error.message);
}

// ─── Bandeja ────────────────────────────────────────────────────────────────

export async function fetchBandeja(db: DB): Promise<Bandeja> {
  // Los conteos salen SIN filtrar por otId, para poder pedirlos en paralelo con Odoo en
  // vez de esperar a saber qué OTs hay. Las dos tablas son chicas —110 requisitos en
  // total, y las notas fijadas son un puñado— así que traerlas enteras cuesta lo mismo
  // que traer un subconjunto: contra Supabase se paga por request (~300 ms fijos), no por
  // fila. Las filas de OTs que no están en la bandeja simplemente no se leen del mapa.
  const [otsOdoo, requisitos, notas] = await Promise.all([
    fetchOtsActivas(),
    db.from("hab_requisitos").select("odoo_ot_id, estado, nombre"),
    db.from("hab_notas").select("odoo_ot_id, texto").eq("fijada", true),
  ]);
  if (requisitos.error) throw new Error(requisitos.error.message);
  if (notas.error) throw new Error(notas.error.message);

  const otIds = otsOdoo.map((o) => o.ot.id);
  const { mapa: cabeceras, nuevas } = await cabecerasDe(db, otIds);

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

  const filas: FilaBandeja[] = otsOdoo.map(({ ot, permiso, trabajo }) => {
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
      trabajo,
      requisitos: conteo.get(ot.id) ?? { total: 0, aprobados: 0, observados: 0 },
      notasFijadas: fijadas.get(ot.id) ?? [],
      url: urlOdooOt(ot.id),
    };
  });

  // El aviso de OT nueva. Va acá y no en cabecerasDe porque el título ("Armado · S01933
  // · Granz SRL") sale de Odoo y sólo está armado a esta altura. Si falla, crearAlertas
  // loguea y sigue: la bandeja no se cae por una notificación.
  if (nuevas.length > 0) {
    const porId = new Map(filas.map((f) => [f.otId, f]));
    await crearAlertas(
      db,
      nuevas.map((otId) => {
        const f = porId.get(otId);
        return {
          tipo: "ot_nueva" as const,
          clave: claveDe("ot_nueva", otId),
          titulo: f?.titulo ?? `OT ${otId}`,
          descripcion: f?.fechaProgramada
            ? `Programada para el ${f.fechaProgramada}. Falta triarla.`
            : "Todavía sin fecha programada. Falta triarla.",
          prioridad: "media" as const,
          enlace: `/habilitaciones/${otId}`,
        };
      }),
    );
  }

  // El requisito de SyH, para las obras en gestión donde el cliente contrató técnico y
  // todavía no lo tienen. Es UNA escritura y sólo cuando falta algo: el listado completo
  // de requisitos ya vino en la lectura de arriba, así que detectarlo no cuesta una
  // consulta más. La fila recién lo va a contar en la próxima lectura, que con el refresco
  // de la bandeja llega sola.
  const yaTieneSyh = new Set(
    (requisitos.data ?? []).filter((r) => r.nombre === REQUISITO_SYH).map((r) => r.odoo_ot_id),
  );
  await sembrarRequisitoSyh(
    db,
    filas
      .filter((f) => f.trabajo.syhPresencial === true && f.triage === "aplica" && !yaTieneSyh.has(f.otId))
      .map((f) => f.otId),
  );

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
export type BloqueGestion = {
  requisitos: Requisito[];
  notas: Nota[];
  gestiones: Gestion[];
  reclamos: number;
};

export async function fetchGestionDe(db: DB, otId: number): Promise<BloqueGestion> {
  // UNA ida a la base, no tres. Medido: cada request a Supabase cuesta ~300 ms FIJOS
  // desde Argentina —una fila cuesta lo mismo que sesenta, con 23 ms de RTT—, así que lo
  // único que importa acá es la CANTIDAD de idas, no el tamaño de lo que se trae. Las
  // tres consultas iban en Promise.all y aun así pagaban ~460 ms; la función las resuelve
  // adentro de Postgres y arma el mismo objeto, joins de autor incluidos.
  const { data, error } = await db.rpc("hab_gestion_de", { p_ot_id: otId });
  if (error) throw new Error(error.message);
  return normalizarBloque(data);
}

/** El JSON que devuelven las funciones de Postgres, con los tipos del módulo. */
function normalizarBloque(data: unknown): BloqueGestion {
  const b = (data ?? {}) as {
    requisitos?: Requisito[];
    notas?: Nota[];
    gestiones?: Gestion[];
    reclamos?: number;
  };
  return {
    requisitos: b.requisitos ?? [],
    notas: b.notas ?? [],
    gestiones: b.gestiones ?? [],
    reclamos: b.reclamos ?? 0,
  };
}

export async function fetchFicha(db: DB, otId: number): Promise<FichaHabilitacion | null> {
  // LAS TRES EN PARALELO. Antes se esperaba a Odoo —dos llamadas encadenadas, ~500 ms—
  // y recién después salían las de Supabase, pero ninguna de las dos depende de la otra:
  // se piden por otId, que ya viene en la URL. Serializarlas sumaba un tramo entero de
  // espera a cada apertura de ficha para nada.
  const [enOdoo, cabeceras, gestion] = await Promise.all([
    fetchOt(otId),
    cabecerasDe(db, [otId]),
    fetchGestionDe(db, otId),
  ]);
  if (!enOdoo) return null;

  const base = leerOt(enOdoo.ot);
  const cab = cabeceras.mapa.get(otId);

  // Si la OT se sembró ACÁ, el aviso tiene que salir igual. Entrar por la URL directa a
  // una OT que todavía nadie vio es raro pero posible, y sin esto esa OT no avisaría
  // NUNCA: la cabecera ya existiría, así que ni la bandeja ni el barrido la contarían
  // como nueva y el aviso se perdería en silencio.
  if (cabeceras.nuevas.length > 0) {
    await crearAlertas(db, [
      {
        tipo: "ot_nueva",
        clave: claveDe("ot_nueva", otId),
        titulo: base.titulo,
        descripcion: base.fechaProgramada
          ? `Programada para el ${base.fechaProgramada}. Falta triarla.`
          : "Todavía sin fecha programada. Falta triarla.",
        prioridad: "media",
        enlace: `/habilitaciones/${otId}`,
      },
    ]);
  }

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
    habilitadaEl: cab?.habilitada_el ?? null,
    habilitadaMotivo: cab?.habilitada_motivo ?? null,
    syncEstado: cab?.sync_estado ?? "pendiente",
    syncError: cab?.sync_error ?? null,
    permiso: enOdoo.permiso,
    trabajo: enOdoo.trabajo,
    ...gestion,
    url: urlOdooOt(otId),
    urlVenta: urlOdooVenta(enOdoo.permiso.ventaId),
  };
}

// mapNota y mapGestion ya no existen: el join del autor lo hace hab_gestion_de en la
// misma consulta, así que el `autor_nombre` llega armado desde Postgres.

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
      // TRIAR NO ES CONSULTAR. Antes "Aplica" sellaba la fecha de consulta en el mismo
      // gesto, y la obra saltaba a "esperando al cliente" sin que nadie lo hubiera
      // llamado: el tablero afirmaba que la pelota la tenía el cliente cuando la teníamos
      // nosotros. Decidir que la obra necesita habilitación y haberle preguntado qué pide
      // son dos cosas, y la segunda tiene su propio gesto (registrarConsulta).
      //
      // Volver a la cola sí borra la consulta: si la obra deja de aplicar, la fecha de
      // consulta no describe nada.
      ...(decision === "pendiente" ? { hab_fecha_consulta: null } : {}),
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

/**
 * Mueve un requisito de estado y devuelve la ficha fresca, TODO EN UNA IDA A LA BASE.
 *
 * Antes eran cinco round trips secuenciales —select previo, update, insert del historial,
 * y tres selects para devolver el bloque— y a ~300 ms fijos cada uno daban ~1,5 s en la
 * acción más frecuente del módulo. La función `hab_mover_requisito` hace las cinco cosas
 * en la misma transacción (ver la migración 20260904000001).
 *
 * De paso desaparece la lectura previa: el sellado de `fecha_envio` se resuelve con un
 * COALESCE adentro del UPDATE, así que ya no hace falta leer el requisito para saber si
 * ya tenía fecha. Y el autor sale de `auth.uid()`, o sea del JWT que ya viaja en la
 * request: la ruta tampoco necesita preguntarle a Supabase quién es el usuario.
 *
 * El historial sigue siendo append-only por RLS: la función es SECURITY INVOKER.
 */
export async function moverRequisito(
  db: DB,
  requisitoId: string,
  estado: EstadoRequisito,
  motivo: string | null,
): Promise<{ otId: number; gestion: BloqueGestion }> {
  const { data, error } = await db.rpc("hab_mover_requisito", {
    p_requisito_id: requisitoId,
    p_estado: estado,
    p_motivo: motivo,
  });
  if (error) throw new Error(error.message);
  return {
    otId: (data as { otId: number }).otId,
    gestion: normalizarBloque(data),
  };
}

/**
 * Marcar TODOS los requisitos de una obra de una vez.
 *
 * La oficina manda un mail con todos los papeles y el cliente contesta "está todo bien":
 * son gestos únicos que el modelo obligaba a registrar de a uno —con el paquete Completo,
 * dieciséis clics por obra—. Los botones por requisito siguen estando: a veces se manda
 * de a uno y se aprueba de a uno, y esto no reemplaza eso, lo acompaña.
 *
 * Sólo mueve lo que corresponde: "marcar todo enviado" no toca lo ya aprobado ni pisa
 * una observación pendiente de corregir, y "aprobar todo" no resucita lo observado sin
 * que alguien lo mire. Un botón masivo que atropella estados es peor que no tenerlo.
 */
export async function marcarTodosLosRequisitos(
  db: DB,
  otId: number,
  estado: "enviado" | "aprobado",
): Promise<{ movidos: number; gestion: BloqueGestion }> {
  // Cuatro idas a la base pasaron a una, por lo mismo que moverRequisito. El registro en
  // el historial va adentro de la función y sólo si movió algo.
  const { data, error } = await db.rpc("hab_mover_todos", { p_ot_id: otId, p_estado: estado });
  if (error) throw new Error(error.message);
  return {
    movidos: (data as { movidos: number }).movidos,
    gestion: normalizarBloque(data),
  };
}

/**
 * Registrar que ya se le consultó al cliente qué papeles pide.
 *
 * Es lo que mueve la obra de "la pelota es nuestra" a "la pelota es del cliente", y
 * ahora es un gesto propio en vez de un efecto del triage.
 */
export async function registrarConsulta(db: DB, otId: number, autorId: string | null): Promise<void> {
  const { error } = await db
    .from("hab_ots")
    .update({ hab_fecha_consulta: hoyISO(), sync_estado: "pendiente" })
    .eq("odoo_ot_id", otId);
  if (error) throw new Error(error.message);
  await registrarGestion(db, otId, "consulta", "Se le consultó al cliente qué documentación pide", autorId);
}

/**
 * Declarar la obra habilitada, o revertir esa declaración.
 *
 * `motivo` sólo se guarda cuando se habilita con requisitos sin aprobar: es la excepción
 * documentada, el mismo patrón que el candado usa para el expediente faltante. Existe
 * porque a veces el cliente autoriza por teléfono y los papeles llegan después, y un
 * sistema que no admite eso se termina esquivando.
 */
export async function declararHabilitacion(
  db: DB,
  otId: number,
  opts: { habilitar: boolean; motivo: string | null; autorId: string | null },
): Promise<void> {
  const { error } = await db
    .from("hab_ots")
    .update(
      opts.habilitar
        ? {
            habilitada_el: hoyISO(),
            habilitada_por: opts.autorId,
            habilitada_motivo: opts.motivo,
            sync_estado: "pendiente",
          }
        : { habilitada_el: null, habilitada_por: null, habilitada_motivo: null, sync_estado: "pendiente" },
    )
    .eq("odoo_ot_id", otId);
  if (error) throw new Error(error.message);

  await registrarGestion(
    db,
    otId,
    "aprobacion",
    opts.habilitar
      ? opts.motivo
        ? `Habilitada por excepción — ${opts.motivo}`
        : "Habilitada con todos los requisitos aprobados"
      : "Se revirtió la habilitación",
    opts.autorId,
  );
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
    .select("triage, triage_fecha, hab_fecha_consulta, hab_vencimiento, habilitada_el, sync_intentos")
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
    {
      triage: cab?.triage ?? null,
      habilitadaEl: cab?.habilitada_el ?? null,
      // Una obra que no aplica queda habilitada desde el día en que se decidió que no
      // aplicaba: es la fecha que corresponde mostrar, no la de hoy.
      triadaEl: cab?.triage_fecha ? String(cab.triage_fecha).slice(0, 10) : null,
    },
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
