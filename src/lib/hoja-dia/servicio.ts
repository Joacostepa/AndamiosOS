// La Hoja del día contra Supabase y Odoo: arma el día entero (`DiaHoja`) para la pantalla y
// para los mensajes, anota cada cambio en el historial (de donde sale el Deshacer), y
// precarga "Cerrar jornada".
//
// SOLO SERVER-SIDE: usa la service role y el cliente de Odoo.
//
// QUIÉN LEE CON QUÉ. La lectura del día cruza tablas de cuatro módulos (Legajos, flota,
// pañol, planificación) y la de Odoo: se hace con la service role DESPUÉS de que la ruta
// verificó el permiso (exigirModulo, la segunda llave además del proxy). Las ESCRITURAS de
// las tablas hd_* van con la sesión del usuario: la RLS del módulo es la que decide.
// Lo que el usuario no puede escribir por RLS (el celular en Legajos, Telegram) va con la
// service role y queda igual en el historial.
//
// CUÁNTO SE LE PIDE A ODOO. Una lectura del día son cuatro llamadas (fetchTableroDeFechas)
// más la asistencia, todas en paralelo con Supabase. El link público (/h/<token>) se
// consulta cada 30 segundos desde cada celular: ahí el tablero sale de un caché de 45 s en
// memoria (`cacheOdoo`), para no apretar a una Odoo Online que limita la concurrencia.

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { authenticate, searchRead } from "@/lib/odoo/client";
import { fetchTableroDeFechas } from "@/lib/odoo/asignaciones";
import { direccionCorta, direccionDeObra, nombrePropio } from "@/lib/tablero/titulo";
import type {
  Ausencia, CamionDia, Cuadrilla, DiaAnterior, DiaHoja, Envio, Fecha, Hoja, Lugar, ObraDia, Parametros, Pedido, Persona, Punto,
  Vehiculo, Viaje,
} from "./tipos";
import { PARAMETROS_POR_DEFECTO } from "./tipos";
import {
  addDia, ausenciasDeAsistencia, fletesDelDia, horariosCierre, minutosDesde, nombresCortos, normHora, obrasDe, aCargoDe, hojaDeCuadrilla,
  ausenciaDe, type FilaAsistencia,
} from "./estado";
import { telegramConfigurado, usuarioDelBot } from "./telegram";
import { diaAlertable } from "./dias";
import { ahoraItems, bandeja } from "./estado";
import { crearAlertas, type NuevaAlerta } from "@/lib/alertas/servicio";
import { COLUMNAS_LEGAJO, esTablaHd, planDeshacer, validarHistorial, type CambioHistorial, type OpHd } from "./deshacer-regla";

export type DB = SupabaseClient;
type Fila = Record<string, unknown>;

// ─── Lectores de columnas ───────────────────────────────────────────────────

const s = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);
const n = (v: unknown): number | null => (v == null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const b = (v: unknown) => v === true;
const punto = (f: Fila, pre: "hacia" | "desde"): Punto | null => {
  const p = { otId: n(f[`${pre}_ot_id`]), lugarId: s(f[`${pre}_lugar_id`]), texto: s(f[`${pre}_texto`]) };
  return p.otId == null && !p.lugarId && !p.texto ? null : p;
};
const PUNTO_VACIO: Punto = { otId: null, lugarId: null, texto: null };

/** Columnas de un Punto para insertar/actualizar. */
export function columnasPunto(pre: "hacia" | "desde", p: Punto | null): Fila {
  return { [`${pre}_ot_id`]: p?.otId ?? null, [`${pre}_lugar_id`]: p?.lugarId ?? null, [`${pre}_texto`]: p?.texto ?? null };
}

// ─── Mapeos fila → tipo ─────────────────────────────────────────────────────

export function mapHoja(f: Fila, integrantes: Fila[], fecha: Fecha): Hoja {
  return {
    id: String(f.id),
    fecha: String(f.fecha),
    cuadrillaOdooId: Number(f.cuadrilla_odoo_id),
    modo: (s(f.chofer_modo) ?? "sin") as Hoja["modo"],
    choferId: s(f.chofer_id),
    vehiculoId: s(f.vehiculo_id),
    choferTocadoMin: s(f.chofer_tocado_at) ? minutosDesde(fecha, String(f.chofer_tocado_at)) : null,
    encuentro: { lugar: (s(f.encuentro_lugar) ?? "obra") as Hoja["encuentro"]["lugar"], texto: s(f.encuentro_texto), hora: normHora(s(f.encuentro_hora)) ?? "8:00" },
    nota: s(f.nota),
    recibeId: s(f.recibe_id) ?? s(f.recibe_externa_id),
    origen: s(f.origen) ?? "manual",
    version: n(f.version) ?? 1,
    integrantes: integrantes
      .filter((i) => i.hoja_id === f.id)
      .map((i) => ({ id: String(i.id), personaId: String(i.persona_id ?? i.externa_id), aCargo: b(i.a_cargo), nota: s(i.nota), orden: n(i.orden) ?? 0 }))
      .sort((a, c) => a.orden - c.orden),
  };
}

export function mapViaje(f: Fila, fecha: Fecha): Viaje {
  return {
    id: String(f.id),
    fecha: String(f.fecha),
    vehiculoId: s(f.vehiculo_id),
    choferId: s(f.chofer_id),
    fleteExterno: s(f.flete_externo),
    tipo: String(f.tipo) as Viaje["tipo"],
    hojaId: s(f.hoja_id),
    cuadrillaOdooId: n(f.cuadrilla_odoo_id),
    hacia: punto(f, "hacia") ?? PUNTO_VACIO,
    desde: punto(f, "desde"),
    orden: n(f.orden) ?? 0,
    hora: normHora(s(f.hora)),
    noAntesDe: normHora(s(f.no_antes_de)),
    duracionMin: n(f.duracion_min),
    vuelta: b(f.vuelta),
    vueltaCarga: s(f.vuelta_carga),
    carga: s(f.carga),
    cargaDeposito: normHora(s(f.carga_deposito)),
    okTodoElDia: b(f.ok_todo_el_dia),
    estado: String(f.estado) as Viaje["estado"],
    hechoMin: s(f.hecho_at) ? minutosDesde(fecha, String(f.hecho_at)) : null,
    hechoPor: s(f.hecho_por),
    noPudoMotivo: s(f.no_pudo_motivo),
    anuladoMotivo: s(f.anulado_motivo),
    foto: !!s(f.foto_path),
    creadoMin: minutosDesde(fecha, String(f.created_at)),
    version: n(f.version) ?? 1,
  };
}

export function mapPedido(f: Fila, fecha: Fecha): Pedido {
  const np = f.ultimo_no_pudo as { at?: string; chofer_id?: string; motivo?: string; viaje_id?: string; hacia?: Punto } | null;
  return {
    id: String(f.id),
    fecha: String(f.fecha),
    fechaOriginal: String(f.fecha_original),
    que: String(f.que),
    tipo: String(f.tipo) as Pedido["tipo"],
    hacia: punto(f, "hacia") ?? PUNTO_VACIO,
    desde: punto(f, "desde"),
    urgencia: String(f.urgencia) as Pedido["urgencia"],
    horaLimite: normHora(s(f.hora_limite)),
    horaFija: normHora(s(f.hora_fija)),
    noAntesDe: normHora(s(f.no_antes_de)),
    duracionMin: n(f.duracion_min),
    cargaDeposito: normHora(s(f.carga_deposito)),
    necesita: (s(f.necesita) ?? "cualquiera") as Pedido["necesita"],
    pidioId: s(f.pidio_persona_id) ?? s(f.pidio_externa_id),
    pidioTexto: s(f.pidio_texto),
    canal: String(f.canal) as Pedido["canal"],
    estado: String(f.estado) as Pedido["estado"],
    esperandoMotivo: s(f.esperando_motivo),
    esperandoHastaMin: s(f.esperando_hasta) ? minutosDesde(fecha, String(f.esperando_hasta)) : null,
    viajeId: s(f.viaje_id),
    ordenManual: n(f.orden_manual),
    cajonPendienteId: s(f.cajon_pendiente_id),
    sugeridoRegla: s(f.sugerido_regla) as Pedido["sugeridoRegla"],
    sugeridoOtId: n(f.sugerido_ot_id),
    ultimoNoPudo: np?.at
      ? { min: minutosDesde(fecha, np.at), choferId: np.chofer_id ?? null, motivo: np.motivo ?? "", viajeId: np.viaje_id ?? "", hacia: np.hacia ?? PUNTO_VACIO }
      : null,
    noPudoVisto: f.no_pudo_visto !== false,
    intentos: n(f.intentos) ?? 0,
    nota: s(f.nota),
    creadoMin: minutosDesde(fecha, String(f.created_at)),
    anuladoMotivo: s(f.anulado_motivo),
  };
}

const minDe = (fecha: Fecha, v: unknown) => (s(v) ? minutosDesde(fecha, String(v)) : null);

export function mapEnvio(f: Fila, fecha: Fecha): Envio {
  return {
    id: String(f.id),
    token: String(f.token),
    fecha: String(f.fecha),
    personaId: String(f.persona_id ?? f.externa_id),
    rol: String(f.rol) as Envio["rol"],
    cuadrillaOdooId: n(f.cuadrilla_odoo_id),
    anulado: !!s(f.anulado_at),
    enviadaMin: minDe(fecha, f.enviada_at),
    enviadaCanal: s(f.enviada_canal) as Envio["enviadaCanal"],
    reenviadaMin: minDe(fecha, f.reenviada_at),
    abiertaMin: minDe(fecha, f.abierta_at),
    ultimaVistaMin: minDe(fecha, f.ultima_vista_at),
    recibidaMin: minDe(fecha, f.recibida_at),
    cambioMin: minDe(fecha, f.cambio_at),
    cambioDiffs: (f.cambio_diffs as Envio["cambioDiffs"]) ?? null,
    snap: (f.snap as Envio["snap"]) ?? null,
    snapPrimero: (f.snap_primero as Envio["snap"]) ?? null,
    snapRecibido: (f.snap_recibido as Envio["snap"]) ?? null,
    snapOk: (f.snap_ok as Envio["snap"]) ?? null,
    okMin: minDe(fecha, f.ok_at),
    version: n(f.version) ?? 0,
    versionVista: n(f.version_vista) ?? 0,
    versionRecibida: n(f.version_recibida) ?? 0,
  };
}

export function mapAusencia(f: Fila): Ausencia {
  return {
    id: String(f.id),
    personaId: String(f.persona_id),
    desde: String(f.desde),
    hasta: s(f.hasta),
    tipo: String(f.tipo) as Ausencia["tipo"],
    horaDesde: normHora(s(f.hora_desde)),
    horaHasta: normHora(s(f.hora_hasta)),
    nota: s(f.nota),
    origen: (s(f.origen) ?? "planificador") as Ausencia["origen"],
  };
}

export function mapLugar(f: Fila): Lugar {
  return {
    id: String(f.id), nombre: String(f.nombre), corto: s(f.corto), tipo: String(f.tipo) as Lugar["tipo"], direccion: s(f.direccion),
    lat: n(f.lat), lng: n(f.lng), telefono: s(f.telefono), horario: s(f.horario), cierra: normHora(s(f.cierra)), nota: s(f.nota), activo: f.activo !== false,
  };
}

/** Los parámetros de la base sobre los de por defecto (una clave que falta no rompe nada). */
export function mapParametros(filas: Fila[]): Parametros {
  const v = new Map(filas.map((f) => [String(f.clave), f.valor]));
  const p: Parametros = structuredClone(PARAMETROS_POR_DEFECTO);
  const hora = (k: string, d: string) => normHora(typeof v.get(k) === "string" ? (v.get(k) as string) : null) ?? d;
  const num = (k: string, d: number) => (typeof v.get(k) === "number" ? (v.get(k) as number) : d);
  p.horaLimiteEnvio = hora("hora_limite_envio", p.horaLimiteEnvio);
  p.horaAlarmaNoAbierta = hora("hora_alarma_no_abierta", p.horaAlarmaNoAbierta);
  p.minutosEntreViajes = num("minutos_entre_viajes", p.minutosEntreViajes);
  const dur = v.get("duracion_viaje");
  if (dur && typeof dur === "object") p.duracionViaje = { ...p.duracionViaje, ...(dur as Parametros["duracionViaje"]) };
  p.minutosVueltaDeposito = num("minutos_vuelta_deposito", p.minutosVueltaDeposito);
  p.minutosSinNoticias = num("minutos_sin_noticias", p.minutosSinNoticias);
  p.minutosSinAvisar = num("minutos_sin_avisar", p.minutosSinAvisar);
  p.minutosNoVisto = num("minutos_no_visto", p.minutosNoVisto);
  p.kmCerca = num("km_cerca", p.kmCerca);
  p.horaCorteManana = hora("hora_corte_manana", p.horaCorteManana);
  p.encuentroDeposito = hora("encuentro_deposito", p.encuentroDeposito);
  p.encuentroObra = hora("encuentro_obra", p.encuentroObra);
  p.inicioObra = hora("inicio_obra", p.inicioObra);
  p.finJornada = hora("fin_jornada", p.finJornada);
  for (const [k, campo] of [["chips_instrucciones", "chipsInstrucciones"], ["motivos_no_pude", "motivosNoPude"], ["motivos_esperar", "motivosEsperar"]] as const) {
    const x = v.get(k);
    if (Array.isArray(x)) p[campo] = x.map(String);
  }
  const co = v.get("coordinador") as { nombre?: string; telefono?: string | null } | undefined;
  if (co) p.coordinador = { nombre: co.nombre ?? p.coordinador.nombre, telefono: co.telefono ?? null };
  const de = v.get("deposito") as { nombre?: string; telefono?: string | null; telegram_chat_id?: number | null } | undefined;
  if (de) p.deposito = { nombre: de.nombre ?? p.deposito.nombre, telefono: de.telefono ?? null, telegramChatId: de.telegram_chat_id ?? null };
  p.diasAsistencia = num("dias_asistencia", p.diasAsistencia);
  return p;
}

const ok = <T>(r: { data: T | null; error: { message: string } | null }, que: string): T => {
  if (r.error) throw new Error(`No se pudo leer ${que}: ${r.error.message}`);
  return (r.data ?? []) as T;
};

// ─── El tablero (Odoo), con caché corto para el link público ────────────────

type Tablero = Awaited<ReturnType<typeof fetchTableroDeFechas>>;
const cacheTablero = new Map<string, { at: number; datos: Promise<Tablero> }>();
function tablero(fechas: Fecha[], cache: boolean): Promise<Tablero> {
  const clave = [...new Set(fechas)].sort().join(",");
  const hit = cacheTablero.get(clave);
  if (cache && hit && Date.now() - hit.at < 45_000) return hit.datos;
  const datos = fetchTableroDeFechas(fechas);
  cacheTablero.set(clave, { at: Date.now(), datos });
  datos.catch(() => cacheTablero.delete(clave));
  return datos;
}

/** La asistencia de Juan Pablo (x_parte_diario) de los últimos días. Si falla, nada: es un extra. */
async function asistencia(fecha: Fecha, dias: number): Promise<{ empleado: number; fecha: Fecha; estado: string; tipo: string | null }[]> {
  try {
    const filas = await searchRead<{ x_empleado: [number, string] | false; x_fecha: string | false; x_estado: string | false; x_tipo_ausencia: string | false }>(
      "x_parte_diario",
      // Días hábiles: la ventana en días corridos tiene dos de más (el fin de semana).
      [["x_fecha", ">=", addDia(fecha, -(dias + 2))], ["x_fecha", "<=", fecha]],
      ["x_empleado", "x_fecha", "x_estado", "x_tipo_ausencia"],
    );
    return filas
      .filter((f) => Array.isArray(f.x_empleado) && f.x_fecha)
      .map((f) => ({ empleado: (f.x_empleado as [number, string])[0], fecha: String(f.x_fecha), estado: String(f.x_estado || ""), tipo: f.x_tipo_ausencia || null }));
  } catch (e) {
    console.error("[hoja-dia] no se pudo leer la asistencia de Odoo", e instanceof Error ? e.message : e);
    return [];
  }
}

// ─── El día entero ──────────────────────────────────────────────────────────

const numeroDe = (nombre: string) => {
  const m = /(\d+)/.exec(nombre);
  return m ? Number(m[1]) : null;
};

/**
 * Todo lo que la pantalla necesita de un día, en un objeto (ver tipos.ts, `DiaHoja`). Las
 * cuentas las hace estado.ts con esto.
 */
export async function leerDia(fecha: Fecha, opts: { cacheOdoo?: boolean } = {}): Promise<DiaHoja> {
  const db = createAdminClient();
  const desde30 = addDia(fecha, -30);

  // Fase 1: el día anterior con hojas (es un número que Odoo necesita) y el login de Odoo.
  const [previas] = await Promise.all([
    db.from("hd_hojas").select("*").gte("fecha", desde30).lt("fecha", fecha).order("fecha", { ascending: false }).limit(200),
    authenticate().catch(() => 0),
  ]);
  const filasPrevias = ok<Fila[]>(previas, "las hojas anteriores");
  const anteriorFecha = filasPrevias[0] ? String(filasPrevias[0].fecha) : null;

  // Fase 2: todo en paralelo.
  const [
    tab, asis, hojasR, integR, intPrevR, personalR, externasR, vehiculosR, documentosR, cuadrillasR, plantelR, camionesR,
    lugaresR, viajesR, pedidosR, instrR, ausR, linksR, paramsR, suspR, cajonR, operariosR, viajesAntR, camionesAntR,
  ] = await Promise.all([
    tablero(anteriorFecha ? [anteriorFecha, fecha] : [fecha], !!opts.cacheOdoo),
    opts.cacheOdoo ? Promise.resolve([]) : asistencia(fecha, 3),
    db.from("hd_hojas").select("*").eq("fecha", fecha),
    db.from("hd_integrantes").select("*").eq("fecha", fecha),
    filasPrevias.length ? db.from("hd_integrantes").select("*").in("hoja_id", filasPrevias.map((f) => f.id as string)) : Promise.resolve({ data: [], error: null }),
    db.from("personal").select("id, nombre, apellido, puesto, telefono, activo, puede_estar_a_cargo, telegram_chat_id, odoo_employee_id, odoo_tarea"),
    db.from("pan_personas_externas").select("id, nombre, apellido, empresa, telefono, activo, puede_estar_a_cargo, telegram_chat_id"),
    db.from("vehiculos").select("id, patente, marca, modelo, tipo, estado, chofer_habitual_id, activo").eq("activo", true),
    db.from("documentos").select("entidad_id, tipo_documento, fecha_vencimiento").eq("entidad_tipo", "vehiculo").in("tipo_documento", ["vtv", "seguro_vehiculo", "cnrt"]),
    db.from("cuadrillas").select("id, nombre, responsable_id, odoo_cuadrilla_id, activo"),
    db.from("cuadrilla_personal").select("cuadrilla_id, personal_id"),
    db.from("hd_camiones_dia").select("*").eq("fecha", fecha),
    db.from("hd_lugares").select("*").order("nombre"),
    db.from("hd_viajes").select("*").eq("fecha", fecha),
    db.from("hd_pedidos").select("*").or(`fecha.eq.${fecha},fecha_original.eq.${fecha}`),
    db.from("hd_instrucciones").select("*").eq("fecha", fecha),
    db.from("hd_ausencias").select("*").is("anulada_at", null).or(`hasta.is.null,hasta.gte.${addDia(fecha, -7)}`),
    db.from("hd_links").select("*").eq("fecha", fecha),
    db.from("hd_parametros").select("clave, valor"),
    db.from("plan_suspensiones").select("cuadrilla_odoo_id, motivo").eq("fecha", fecha),
    db.from("plan_cajon_pendientes").select("id, texto").eq("hecho", false).order("posicion"),
    db.from("hd_historial").select("entidad_id, accion, at").eq("fecha", fecha).in("accion", ["avisar_operario", "no_avisar_operario"]),
    anteriorFecha ? db.from("hd_viajes").select("*").eq("fecha", anteriorFecha) : Promise.resolve({ data: [], error: null }),
    anteriorFecha ? db.from("hd_camiones_dia").select("*").eq("fecha", anteriorFecha) : Promise.resolve({ data: [], error: null }),
  ]);

  const parametros = mapParametros(ok<Fila[]>(paramsR, "los parámetros"));

  // Personas: Legajos y externas, con nombres cortos que no se repiten.
  const personal = ok<Fila[]>(personalR, "Legajos");
  const externas = ok<Fila[]>(externasR, "las personas externas");
  const cortos = nombresCortos(
    [...personal, ...externas].map((p) => ({ id: String(p.id), apellido: String(p.apellido ?? ""), nombre: String(p.nombre ?? "") })),
    (x) => nombrePropio(x),
  );
  const personas: Persona[] = [
    ...personal.map((p) => ({
      id: String(p.id), externa: false, nombre: cortos.get(String(p.id)) ?? String(p.apellido),
      nombreCompleto: nombrePropio(`${p.nombre} ${p.apellido}`), puesto: s(p.puesto), celular: s(p.telefono),
      puedeEstarACargo: b(p.puede_estar_a_cargo),
      // Maneja quien Odoo dice que es chofer; sin vínculo con Odoo todavía, el puesto de Legajos.
      esChofer: s(p.odoo_tarea) ? p.odoo_tarea === "chofer" : p.puesto === "chofer",
      telegram: p.telegram_chat_id != null, odooEmployeeId: n(p.odoo_employee_id), activo: p.activo !== false,
    })),
    ...externas.map((p) => ({
      id: String(p.id), externa: true, nombre: cortos.get(String(p.id)) ?? String(p.apellido),
      nombreCompleto: `${nombrePropio(`${p.nombre} ${p.apellido}`)} (${p.empresa})`, puesto: "externo", celular: s(p.telefono),
      puedeEstarACargo: b(p.puede_estar_a_cargo), esChofer: false, telegram: p.telegram_chat_id != null, odooEmployeeId: null, activo: p.activo !== false,
    })),
  ];

  // Vehículos con sus vencimientos.
  const docs = ok<Fila[]>(documentosR, "los documentos de la flota");
  const vehiculos: Vehiculo[] = ok<Fila[]>(vehiculosR, "los vehículos").map((v) => ({
    id: String(v.id), patente: String(v.patente), marca: s(v.marca), modelo: s(v.modelo), tipo: String(v.tipo) as Vehiculo["tipo"],
    estado: String(v.estado) as Vehiculo["estado"], choferHabitualId: s(v.chofer_habitual_id),
    vencimientos: docs.filter((d) => d.entidad_id === v.id && s(d.fecha_vencimiento)).map((d) => ({ tipo: d.tipo_documento as "vtv", vence: String(d.fecha_vencimiento) })),
  }));
  const camionesDe = (filas: Fila[]): CamionDia[] => vehiculos.map((v) => {
    const f = filas.find((c) => c.vehiculo_id === v.id);
    return { vehiculoId: v.id, choferId: f ? (b(f.sin_chofer) ? null : s(f.chofer_id)) : v.choferHabitualId, nota: f ? s(f.nota) : null };
  });

  // Cuadrillas de Odoo, con el plantel base de Configuración si están vinculadas.
  const cuadSb = ok<Fila[]>(cuadrillasR, "las cuadrillas");
  const plantel = ok<Fila[]>(plantelR, "el plantel");
  const cuadrillas: Cuadrilla[] = tab.cuadrillas.map((c) => {
    const sb = cuadSb.find((x) => n(x.odoo_cuadrilla_id) === c.id);
    const nombre = nombrePropio(c.nombre);
    return {
      odooId: c.id, nombre, numero: numeroDe(nombre), tercerizada: c.tercerizada,
      plantel: sb ? { responsableId: s(sb.responsable_id), personaIds: plantel.filter((p) => p.cuadrilla_id === sb.id).map((p) => String(p.personal_id)) } : null,
    };
  });

  // Las obras del tablero de un día.
  const otPor = new Map(tab.ots.map((o) => [o.id, o]));
  const obrasDeFecha = (f: Fecha): ObraDia[] =>
    tab.asignaciones.filter((a) => a.fecha === f && a.cuadrillaId != null && otPor.has(a.otId)).map((a) => {
      const ot = otPor.get(a.otId)!;
      const dir = direccionDeObra(ot);
      const i = ot.fechasJornadas.indexOf(f);
      return {
        otId: ot.id, asignacionId: a.id, cuadrillaOdooId: a.cuadrillaId!, ordenDia: a.ordenDia, fraccion: a.fraccion, estadoAsignacion: a.estado,
        direccion: dir, corto: direccionCorta(dir), titulo: ot.titulo, tipo: ot.tipo, personalPorJornada: ot.personalPorJornada,
        lat: ot.lat, lng: ot.lng, detalleTecnico: ot.detalleTecnico, observaciones: ot.observaciones, contactoObra: ot.contactoObra,
        telObra: ot.telObra, cantArchivos: ot.cantDocs + ot.cantInstrucciones, ventaId: ot.ventaId,
        dia: i >= 0 ? i + 1 : null, totalDias: ot.fechasJornadas.length || null, parteId: a.parteId ?? null,
      };
    });

  const integ = ok<Fila[]>(integR, "quiénes van");
  const hojas = ok<Fila[]>(hojasR, "las hojas").map((h) => mapHoja(h, integ, fecha));
  const intPrev = ok<Fila[]>(intPrevR, "las hojas anteriores");
  const hojasPrevias = filasPrevias.map((h) => mapHoja(h, intPrev, String(h.fecha)));

  let anterior: DiaAnterior | null = null;
  if (anteriorFecha) {
    anterior = {
      fecha: anteriorFecha,
      obras: obrasDeFecha(anteriorFecha),
      hojas: hojasPrevias.filter((h) => h.fecha === anteriorFecha),
      viajes: ok<Fila[]>(viajesAntR, "los viajes anteriores").map((v) => mapViaje(v, anteriorFecha)),
      camiones: camionesDe(ok<Fila[]>(camionesAntR, "los camiones anteriores")),
    };
  }
  const ultimasHojas: DiaHoja["ultimasHojas"] = [];
  for (const h of hojasPrevias) if (!ultimasHojas.some((u) => u.hoja.cuadrillaOdooId === h.cuadrillaOdooId)) ultimasHojas.push({ fecha: h.fecha, hoja: h });

  // Ausencias: las guardadas y las ART de la asistencia que nadie cargó.
  const guardadas = ok<Fila[]>(ausR, "las ausencias").map(mapAusencia);
  const porEmpleado = new Map(personas.filter((p) => p.odooEmployeeId != null).map((p) => [p.odooEmployeeId!, p.id]));
  const filasAsis: FilaAsistencia[] = asis.flatMap((a) => (porEmpleado.has(a.empleado) ? [{ personaId: porEmpleado.get(a.empleado)!, fecha: a.fecha, estado: a.estado, tipoAusencia: a.tipo }] : []));

  const operarios = new Map<string, string>();
  for (const f of ok<Fila[]>(operariosR, "el historial").sort((a, c) => String(a.at).localeCompare(String(c.at)))) operarios.set(String(f.entidad_id), String(f.accion));

  const bot = telegramConfigurado() ? await usuarioDelBot().catch(() => null) : null;
  return {
    fecha,
    generadoAt: new Date().toISOString(),
    cuadrillas,
    obras: obrasDeFecha(fecha),
    suspendidas: Object.fromEntries(ok<Fila[]>(suspR, "las suspensiones").map((x) => [Number(x.cuadrilla_odoo_id), String(x.motivo)])),
    hojas,
    personas,
    vehiculos,
    camiones: camionesDe(ok<Fila[]>(camionesR, "los camiones")),
    lugares: ok<Fila[]>(lugaresR, "los lugares").map(mapLugar),
    viajes: ok<Fila[]>(viajesR, "los viajes").map((v) => mapViaje(v, fecha)),
    pedidos: ok<Fila[]>(pedidosR, "los pedidos").map((p) => mapPedido(p, fecha)),
    instrucciones: ok<Fila[]>(instrR, "las instrucciones").map((i) => ({
      otId: Number(i.odoo_ot_id), cuadrillaOdooId: n(i.cuadrilla_odoo_id), horaInicio: normHora(s(i.hora_inicio)), hoy: s(i.hoy), chips: (i.chips as string[]) ?? [],
    })),
    ausencias: [...guardadas, ...ausenciasDeAsistencia(filasAsis, guardadas)],
    envios: ok<Fila[]>(linksR, "los envíos").map((l) => mapEnvio(l, fecha)),
    operariosAvisados: [...operarios].filter(([, a]) => a === "avisar_operario" || a === "no_avisar_operario").map(([p]) => p),
    parametros,
    anterior,
    ultimasHojas,
    cajon: ok<Fila[]>(cajonR, "el cajón").map((c) => ({ id: String(c.id), texto: String(c.texto) })),
    telegram: { configurado: telegramConfigurado(), bot },
  };
}

// ─── Historial y Deshacer ───────────────────────────────────────────────────

/** Una fila tocada: cómo estaba y cómo quedó. null = no existía / se borró. */
export type Cambio = CambioHistorial;

/**
 * Lleva la cuenta de lo que un gesto tocó, para el historial y el Deshacer. Cada escritura
 * pasa por acá: lee la fila de antes, escribe, y guarda la de después.
 */
export function grabador(db: DB) {
  const cambios: Cambio[] = [];
  return {
    cambios,
    async insertar(tabla: string, fila: Fila): Promise<Fila> {
      const r = await db.from(tabla).insert(fila).select("*").single();
      if (r.error) throw new Error(traducirErrorDb(r.error.message));
      cambios.push({ tabla, id: String(r.data.id), antes: null, despues: r.data });
      return r.data;
    },
    async actualizar(tabla: string, id: string, valores: Fila): Promise<Fila> {
      const antes = await db.from(tabla).select("*").eq("id", id).maybeSingle();
      if (antes.error) throw new Error(antes.error.message);
      if (!antes.data) throw new Error("Eso ya no existe: alguien lo cambió. Actualizá la pantalla.");
      const r = await db.from(tabla).update(valores).eq("id", id).select("*").single();
      if (r.error) throw new Error(traducirErrorDb(r.error.message));
      cambios.push({ tabla, id, antes: antes.data, despues: r.data });
      return r.data;
    },
    /** Lee filas por igualdad (no anota nada): para saber qué tocar después. */
    async leer(tabla: string, filtros: Fila): Promise<Fila[]> {
      let q = db.from(tabla).select("*");
      for (const [k, v] of Object.entries(filtros)) q = q.eq(k, v as string);
      const r = await q;
      if (r.error) throw new Error(r.error.message);
      return r.data ?? [];
    },
    async borrar(tabla: string, id: string): Promise<void> {
      const antes = await db.from(tabla).select("*").eq("id", id).maybeSingle();
      if (antes.error) throw new Error(antes.error.message);
      if (!antes.data) return;
      const r = await db.from(tabla).delete().eq("id", id);
      if (r.error) throw new Error(traducirErrorDb(r.error.message));
      cambios.push({ tabla, id, antes: antes.data, despues: null });
    },
  };
}
export type Grabador = ReturnType<typeof grabador>;

/** Los errores de la base que alguien puede llegar a ver, en palabras. */
export function traducirErrorDb(m: string): string {
  if (/idx_hd_integrantes_(persona|externa)/.test(m)) return "Esa persona ya está en otra cuadrilla ese día.";
  if (/idx_hd_integrantes_a_cargo/.test(m)) return "Esa cuadrilla ya tiene a alguien a cargo.";
  if (/hd_hojas_fecha_cuadrilla_odoo_id_key/.test(m)) return "Esa cuadrilla ya tiene hoja ese día.";
  if (/idx_hd_pedidos_sugerido/.test(m)) return "Ese sugerido ya se revisó.";
  if (/idx_hd_links_(persona|externa)/.test(m)) return "Otra persona creó ese link recién. Probá de nuevo.";
  if (/HD_CAMBIO/.test(m)) return "No se puede deshacer: eso cambió después. Hacelo a mano.";
  if (/row-level security/i.test(m)) return "No tenés permiso para hacer este cambio.";
  if (/invalid input syntax for type time|date\/time field value out of range/i.test(m)) return "Hora inválida.";
  return m;
}

export type Anotacion = {
  fecha: Fecha | null;
  entidad: string;
  entidadId?: string | null;
  hojaId?: string | null;
  viajeId?: string | null;
  pedidoId?: string | null;
  accion: string;
  texto: string;
  origen?: "escritorio" | "link" | "telegram" | "sistema";
  porTexto?: string | null;
};

/**
 * Anota en el historial. Devuelve el id (lo que el Deshacer necesita).
 *
 * SIEMPRE CON LA SERVICE ROLE (B2): en la base nadie puede insertar en hd_historial desde
 * el navegador, porque de `cambios` sale lo que el Deshacer escribe. Lo anota sólo el
 * servidor, después de que la ruta verificó el permiso; `por` es quien hizo el gesto.
 */
export async function anotar(userId: string | null, a: Anotacion, cambios: Cambio[] = []): Promise<string> {
  const r = await createAdminClient().from("hd_historial").insert({
    fecha: a.fecha, entidad: a.entidad, entidad_id: a.entidadId ?? null, hoja_id: a.hojaId ?? null, viaje_id: a.viajeId ?? null,
    pedido_id: a.pedidoId ?? null, accion: a.accion, texto: a.texto, cambios, por: userId, por_texto: a.porTexto ?? null, origen: a.origen ?? "escritorio",
  }).select("id").single();
  if (r.error) {
    // El historial no puede voltear el gesto que ya se hizo: queda en el log.
    console.error("[hoja-dia] no se pudo anotar en el historial", r.error.message);
    return "";
  }
  return String(r.data.id);
}

/**
 * Aplica escrituras de tablas del módulo EN UNA TRANSACCIÓN (la función SQL hd_aplicar,
 * SECURITY INVOKER: con la sesión que se le pase, la RLS decide). Cada una puede exigir
 * cómo tiene que estar la fila antes; si una no se puede, no se aplica ninguna.
 * Devuelve las filas tocadas (antes y después), para el historial.
 */
export async function aplicarEnBloque(db: DB, ops: OpHd[]): Promise<Cambio[]> {
  if (!ops.length) return [];
  for (const o of ops) if (!esTablaHd(o.tabla)) throw new Error("Ese cambio no se puede hacer desde acá.");
  const r = await db.rpc("hd_aplicar", { p_ops: ops });
  if (r.error) throw new Error(traducirErrorDb(r.error.message));
  return (r.data ?? []) as Cambio[];
}

/**
 * Corre un gesto con su grabador y, si falla a mitad (I4), DESHACE lo que llegó a escribir
 * en un solo bloque (hd_aplicar). Si ni eso se puede, deja en el historial lo que quedó
 * escrito —con su Deshacer— y lo dice en el error: nunca datos a medias sin rastro.
 */
export async function conGrabador<T>(db: DB, userId: string | null, a: Omit<Anotacion, "texto">, fn: (g: Grabador) => Promise<T>): Promise<T> {
  const g = grabador(db);
  try {
    return await fn(g);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!g.cambios.length) throw e;
    try {
      // Las filas quedaron como las dejó este gesto: el "después" de la última escritura de cada una.
      const actuales = new Map(g.cambios.map((c) => [`${c.tabla}:${c.id}`, c.despues] as const));
      await aplicarEnBloque(db, planDeshacer(g.cambios.filter((c) => esTablaHd(c.tabla)), actuales));
    } catch (e2) {
      console.error("[hoja-dia] no se pudo volver atrás un gesto a medias", e2 instanceof Error ? e2.message : e2);
      await anotar(userId, { ...a, accion: `${a.accion}_a_medias`, texto: `Quedó a medias (${msg}). Se puede deshacer desde el historial.` }, g.cambios);
      throw new Error(`${msg}. Quedó a medias: deshacelo desde el historial.`);
    }
    throw e;
  }
}

/**
 * Deshace un gesto: vuelve cada fila a como estaba. Si alguna cambió después (otra persona,
 * el chofer desde su link), no toca nada y lo dice: deshacer encima de un cambio ajeno lo
 * pisaría sin que nadie se entere.
 *
 * B2: la fila de historial se lee con la service role pero se VALIDA (validarHistorial:
 * sólo tablas del módulo, y de Legajos sólo el celular y "puede estar a cargo"); las filas
 * del módulo se escriben con la SESIÓN de quien deshace (`db`), en una transacción, y sólo
 * si siguen como las dejó el gesto (la comparación se repite adentro de la base). Legajos
 * va con la service role (como el gesto original, que la ruta autorizó con Hoja del día en
 * editar), sólo esas dos columnas.
 */
export async function deshacer(db: DB, userId: string, historialId: string): Promise<{ texto: string; historialId: string }> {
  const adm = createAdminClient();
  const h = await adm.from("hd_historial").select("*").eq("id", historialId).maybeSingle();
  if (h.error || !h.data) throw new Error("No encuentro ese cambio.");
  if (h.data.deshecho_at) throw new Error("Ese cambio ya se deshizo.");
  const cambios = validarHistorial(h.data);

  // Cómo están ahora (con la sesión: lo que el usuario no puede ver, no lo puede deshacer).
  const actuales = new Map<string, Fila | null>();
  for (const c of cambios) {
    const cli = esTablaHd(c.tabla) ? db : adm;
    const r = await cli.from(c.tabla).select("*").eq("id", c.id).maybeSingle();
    if (r.error) throw new Error(traducirErrorDb(r.error.message));
    actuales.set(`${c.tabla}:${c.id}`, r.data ?? null);
  }
  const ops = planDeshacer(cambios, actuales);
  // Legajos: sólo las columnas permitidas, y sólo si siguen como quedaron.
  const legajo = cambios.filter((c) => !esTablaHd(c.tabla)).reverse();
  for (const c of legajo) {
    const ahora = actuales.get(`${c.tabla}:${c.id}`) ?? null;
    if (!ahora) throw new Error("No se puede deshacer: esa persona ya no existe.");
    for (const k of COLUMNAS_LEGAJO[c.tabla]) {
      if (JSON.stringify(ahora[k]) !== JSON.stringify(c.despues![k]) && JSON.stringify(ahora[k]) !== JSON.stringify(c.antes![k])) {
        throw new Error("No se puede deshacer: eso cambió después. Hacelo a mano.");
      }
    }
  }

  const hechos = await aplicarEnBloque(db, ops);
  const g = grabador(adm);
  for (const c of legajo) {
    const valores = Object.fromEntries(COLUMNAS_LEGAJO[c.tabla].map((k) => [k, c.antes![k] ?? null]));
    await g.actualizar(c.tabla, c.id, valores);
  }
  await adm.from("hd_historial").update({ deshecho_at: new Date().toISOString(), deshecho_por: userId }).eq("id", historialId);
  const texto = `Deshecho: ${h.data.texto}`;
  const id = await anotar(userId, { fecha: h.data.fecha, entidad: h.data.entidad, entidadId: h.data.entidad_id, hojaId: h.data.hoja_id, viajeId: h.data.viaje_id, pedidoId: h.data.pedido_id, accion: "deshacer", texto }, [...hechos, ...g.cambios]);
  return { texto, historialId: id };
}

// ─── En vivo ────────────────────────────────────────────────────────────────

/** El canal de los cambios de la hoja (ver src/lib/hoja-dia/avisos.ts, el lado del navegador). */
export const CANAL_HOJA = "hoja-dia-cambios";

/**
 * Avisa a las pantallas abiertas que algo cambió desde AFUERA del escritorio (el link del
 * capataz o del chofer, Telegram). Por REST: el servidor no mantiene un socket abierto.
 * Nunca tira: es una pista para refrescar, no el dato.
 */
export async function avisarPantallas(fecha: Fecha, accion: string, quien?: string | null): Promise<void> {
  try {
    await createAdminClient().channel(CANAL_HOJA).httpSend("cambio", { fecha, accion, autor: quien ?? "Alguien", desde: "afuera" });
  } catch (e) {
    console.error("[hoja-dia] no se pudo avisar en vivo", e instanceof Error ? e.message : e);
  }
}

// ─── Precarga de "Cerrar jornada" (§13) ─────────────────────────────────────

export type PrecargaCierre = {
  hayHoja: boolean;
  /** hr.employee del que estuvo a cargo (por personal.odoo_employee_id). */
  punteroEmployeeId: number | null;
  punteroNombre: string | null;
  /** Los que van, menos los que se cargaron como ausentes ese día. */
  personas: number;
  camionEnObra: boolean;
  /**
   * Los viajes del día a esta obra según la hoja. `cantidad: 0` quiere decir que la hoja NO
   * registró viajes (cuadrilla sin chofer, camión fuera de la hoja): el formulario se queda
   * con su regla de siempre y no pone 0.
   */
  fletes: { cantidad: number; tercerizado: boolean; detalle: string[] };
  /** La mano de obra sugerida, por horario (horariosCierre): salen de las obras, el encuentro y el busca. */
  manoObra: { personas: number; desde: string; hasta: string }[];
};

/**
 * Lo que la hoja de (cuadrilla, fecha) dice del parte de una obra: puntero, cantidad de
 * personas, camión en obra y fletes sugeridos. "Cerrar jornada" lo usa para precargar; si
 * no hay hoja, `hayHoja` es false y el formulario se comporta como siempre.
 */
export async function precargaCierre(cuadrillaOdooId: number, fecha: Fecha, otId: number | null): Promise<PrecargaCierre> {
  const vacia: PrecargaCierre = { hayHoja: false, punteroEmployeeId: null, punteroNombre: null, personas: 0, camionEnObra: false, fletes: { cantidad: 0, tercerizado: false, detalle: [] }, manoObra: [] };
  const db = createAdminClient();
  const existe = await db.from("hd_hojas").select("id").eq("fecha", fecha).eq("cuadrilla_odoo_id", cuadrillaOdooId).maybeSingle();
  if (!existe.data) return vacia;
  const dia = await leerDia(fecha, { cacheOdoo: true });
  const h = hojaDeCuadrilla(dia, cuadrillaOdooId);
  if (!h) return vacia;
  const aCargo = aCargoDe(h);
  const p = dia.personas.find((x) => x.id === aCargo) ?? null;
  const personas = h.integrantes.filter((i) => !ausenciaDe(dia, i.personaId)).length + (h.modo === "todo_el_dia" && h.choferId ? 1 : 0);
  const ot = otId ?? obrasDe(dia, cuadrillaOdooId)[0]?.otId ?? null;
  const fl = ot != null ? fletesDelDia(dia, ot) : [];
  return {
    hayHoja: true,
    punteroEmployeeId: p?.odooEmployeeId ?? null,
    punteroNombre: p?.nombreCompleto ?? null,
    personas,
    camionEnObra: h.modo === "todo_el_dia",
    fletes: { cantidad: fl.length, tercerizado: fl.some((x) => x.tercerizado), detalle: fl.map((x) => x.txt) },
    manoObra: ot != null ? horariosCierre(dia, cuadrillaOdooId, ot) : [],
  };
}

/** Nombre de pila de un usuario, para "marcado por Juan Agustín". */
export async function nombreUsuario(userId: string): Promise<string> {
  const r = await createAdminClient().from("user_profiles").select("nombre").eq("id", userId).maybeSingle();
  return (r.data?.nombre as string | undefined)?.trim().split(/\s+/)[0] ?? "la oficina";
}

// ─── La campanita (§8: "sólo los rojos") ────────────────────────────────────

/**
 * Los rojos del día como alertas: lo que no se mandó a las 19, lo que no se abrió a las
 * 6:30 y los rojos del despacho (un "No pude", nadie busca a una cuadrilla, frena la obra).
 * Idempotente por clave (crearAlertas): se puede llamar en cada lectura del día.
 */
export function alertasDelDia(dia: DiaHoja, ahora: number): NuevaAlerta[] {
  // I7: sólo el día que todavía se puede arreglar (desde los días anteriores hasta que
  // termina). Mirar la hoja de la semana pasada no crea alertas.
  if (!diaAlertable(ahora)) return [];
  const enlace = `/planificacion/hoja?dia=${dia.fecha}`;
  const b = bandeja(dia, ahora);
  const rojos = [
    ...b.vos.filter((x) => x.rojo && (x.k === "sinenv" || x.k.startsWith("chg-"))),
    ...b.esp.filter((x) => x.rojo),
  ].map((x) => ({ k: x.k, t: x.t }));
  const despacho = ahora >= 0 && ahora < 1440 ? ahoraItems(dia, ahora).filter((x) => x.nivel === "rojo" && /^(np|fr|nadie)-/.test(x.k)).map((x) => ({ k: x.k, t: x.t })) : [];
  return [...rojos, ...despacho].map((x) => ({
    tipo: "hoja_dia" as const,
    clave: `hoja_dia:${dia.fecha}:${x.k}`,
    titulo: x.t,
    prioridad: "alta" as const,
    enlace: x.k.startsWith("np-") || x.k.startsWith("fr-") || x.k.startsWith("nadie-") ? `/planificacion/hoja/camiones?dia=${dia.fecha}` : enlace,
  }));
}

/** Crea las alertas rojas del día. Nunca tira (crearAlertas tampoco). */
export async function alertarDia(dia: DiaHoja): Promise<void> {
  try {
    const nuevas = alertasDelDia(dia, minutosDesde(dia.fecha, new Date()));
    if (!nuevas.length) return;
    await crearAlertas(createAdminClient(), nuevas);
  } catch (e) {
    console.error("[hoja-dia] no se pudieron crear las alertas", e instanceof Error ? e.message : e);
  }
}
