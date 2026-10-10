// Los cambios de la Hoja del día: armar las hojas, mover a la gente, el chofer, los viajes,
// los pedidos, las ausencias. Una función por gesto, cada una con su texto en palabras
// ("Ramírez pasó a la Cuadrilla 3") y su fila en el historial, que es el Deshacer.
//
// SOLO SERVER-SIDE. Escriben con la sesión del usuario (la RLS del módulo decide) salvo lo
// que es de otro módulo (el celular en Legajos), que va con la service role después de
// que la ruta verificó el permiso.
//
// LA REGLA SE CALCULA EN estado.ts. Lo que depende del día entero (el plan de la precarga,
// qué chofer proponer, dónde soltar un pedido) sale de las funciones puras con el día
// leído; acá sólo se escribe. Así el resultado es el mismo que la pantalla anticipó.
//
// Los esquemas zod de cada ruta viven acá para que la ruta sea sólo "validar y llamar".

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import type { DiaHoja, Fecha, Hoja, ModoChofer, Punto, Viaje } from "./tipos";
import {
  addDia, altaDeAusencia, aCargoDe, cNombre, diasEntre, esHoy, hm, laC, lowFirst, lugar, minutosDesde, nombreDe, normHora,
  planCopiarComoHoy, planModo, planPonerPedido, planPrecarga, planSoltarChofer, pidioPorDefecto, sugeridosDe, tipoPorDestino,
  toMin, viajeCalc, vehiculoNombre, patente, cortoV, hojaDeCuadrilla, choferDelCamion, calcVeh, instanteDe, ddmm, ausTexto,
  type CambioHoja, type PlanHoja, type ViajeNuevo, fechaPorDefecto,
} from "./estado";
import { TIPO_AUSENCIA_TXT, TIPOS_VIAJE } from "./tipos";
import { anotar, columnasPunto, conGrabador, grabador, leerDia, mapAusencia as mapAusenciaFila, mapViaje, nombreUsuario, type DB, type Grabador } from "./servicio";
import { hoyBA } from "@/lib/panol/estado";

export type Resultado = { ok: true; texto: string; historialId: string | null; [k: string]: unknown };
type Fila = Record<string, unknown>;

// ─── Esquemas ───────────────────────────────────────────────────────────────

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida");
const id = z.string().uuid("Id inválido");
const hora = z.string().regex(/^\d{1,2}:\d{2}(:\d{2})?$/, "Hora inválida");
const c = z.number().int().positive();
export const puntoSchema = z.object({
  otId: z.number().int().positive().nullable().default(null),
  lugarId: id.nullable().default(null),
  texto: z.string().trim().max(200).nullable().default(null),
}).refine((p) => p.otId != null || p.lugarId || p.texto, "Falta el destino");
const tipoViaje = z.enum(["lleva", "busca", "mueve", "lleva_material", "trae_material", "compra", "entre_depositos", "taller", "otro"]);
const tipoPedido = z.enum(["lleva_material", "trae_material", "compra", "entre_depositos", "taller", "otro"]);
const tipoAusencia = z.enum(["enfermedad", "art", "personal", "vacaciones", "tramite", "suspendido", "sin_aviso"]);

export const accionHojaSchema = z.discriminatedUnion("accion", [
  z.object({ accion: z.literal("crear_hoja"), fecha, cuadrilla: c }),
  z.object({ accion: z.literal("agregar"), fecha, cuadrilla: c, personaId: id, reemplaza: id.nullable().optional(), aCargo: z.boolean().optional() }),
  z.object({ accion: z.literal("sacar"), fecha, personaId: id }),
  z.object({ accion: z.literal("a_cargo"), fecha, cuadrilla: c, personaId: id.nullable() }),
  z.object({ accion: z.literal("recibe"), fecha, cuadrilla: c, personaId: id.nullable() }),
  z.object({ accion: z.literal("nota_persona"), fecha, personaId: id, nota: z.string().trim().max(200).nullable() }),
  z.object({ accion: z.literal("modo"), fecha, cuadrilla: c, modo: z.enum(["sin", "lleva_trae", "todo_el_dia"]) }),
  z.object({ accion: z.literal("chofer"), fecha, cuadrilla: c, choferId: id.nullable() }),
  z.object({ accion: z.literal("vehiculo"), fecha, cuadrilla: c, vehiculoId: id.nullable() }),
  z.object({ accion: z.literal("encuentro"), fecha, cuadrilla: c, lugar: z.enum(["deposito", "obra", "otro"]), hora, texto: z.string().trim().max(120).nullable().optional() }),
  z.object({ accion: z.literal("lleva"), fecha, cuadrilla: c, hora }),
  z.object({ accion: z.literal("busca"), fecha, cuadrilla: c, hora: hora.nullable() }),
  z.object({ accion: z.literal("mueve"), fecha, cuadrilla: c, otId: z.number().int().positive(), hora }),
  z.object({ accion: z.literal("nota"), fecha, cuadrilla: c, nota: z.string().trim().max(500).nullable() }),
  z.object({ accion: z.literal("instrucciones"), fecha, otId: z.number().int().positive(), cuadrilla: c.nullable().optional(), horaInicio: hora.nullable().optional(), hoy: z.string().trim().max(500).nullable().optional(), chips: z.array(z.string().max(80)).max(20).optional() }),
  z.object({ accion: z.literal("copiar_como_hoy"), fecha, cuadrilla: c }),
  z.object({ accion: z.literal("pasar_chofer"), fecha, cuadrilla: c, desde: c }),
  z.object({ accion: z.literal("liberar"), fecha, cuadrilla: c }),
]);
export type AccionHoja = z.infer<typeof accionHojaSchema>;

export const accionViajeSchema = z.discriminatedUnion("accion", [
  z.object({ accion: z.literal("crear"), fecha, vehiculoId: id.nullable().optional(), fleteExterno: z.string().trim().max(80).nullable().optional(), tipo: tipoViaje, hacia: puntoSchema, desde: puntoSchema.nullable().optional(), hora: hora.nullable().optional(), noAntesDe: hora.nullable().optional(), carga: z.string().trim().max(300).nullable().optional(), duracionMin: z.number().int().positive().max(600).nullable().optional(), orden: z.number().nullable().optional() }),
  z.object({ accion: z.literal("poner_pedido"), pedidoId: id, vehiculoId: id, sobre: id.nullable().optional(), orden: z.number().nullable().optional() }),
  z.object({ accion: z.literal("mover"), viajeId: id, vehiculoId: id.nullable(), orden: z.number().nullable().optional(), hora: hora.nullable().optional() }),
  z.object({ accion: z.literal("hora"), viajeId: id, hora: hora.nullable(), noAntesDe: hora.nullable().optional() }),
  z.object({ accion: z.literal("volver_a_cola"), viajeId: id }),
  z.object({ accion: z.literal("anular"), viajeId: id, motivo: z.string().trim().min(1).max(200) }),
  z.object({ accion: z.literal("hecho"), viajeId: id }),
  z.object({ accion: z.literal("no_pudo"), viajeId: id, motivo: z.string().trim().min(1).max(200) }),
  z.object({ accion: z.literal("deshacer_estado"), viajeId: id }),
  z.object({ accion: z.literal("ok_todo_el_dia"), viajeId: id }),
  z.object({ accion: z.literal("correr_horas"), fecha, vehiculoId: id }),
  z.object({ accion: z.literal("chofer_del_camion"), fecha, vehiculoId: id, choferId: id.nullable() }),
  z.object({ accion: z.literal("vuelven_solos"), fecha, cuadrilla: c }),
]);
export type AccionViaje = z.infer<typeof accionViajeSchema>;

export const accionPedidoSchema = z.discriminatedUnion("accion", [
  z.object({
    accion: z.literal("crear"), fecha: fecha.optional(), que: z.string().trim().min(1, "Falta qué").max(300), hacia: puntoSchema, desde: puntoSchema.nullable().optional(),
    tipo: tipoPedido.optional(), esParaTraer: z.boolean().optional(), urgencia: z.enum(["frena", "hora", "cliente", "hoy", "cuando_se_pueda"]).default("hoy"),
    horaLimite: hora.nullable().optional(), horaFija: hora.nullable().optional(), noAntesDe: hora.nullable().optional(), necesita: z.enum(["cualquiera", "camion", "hidrogrua"]).default("cualquiera"),
    pidioId: id.nullable().optional(), pidioTexto: z.string().trim().max(120).nullable().optional(), canal: z.enum(["telefono", "whatsapp", "telegram", "link", "cajon", "sugerido", "deposito", "oficina"]).default("telefono"),
    nota: z.string().trim().max(500).nullable().optional(), cajonPendienteId: id.nullable().optional(),
  }),
  z.object({ accion: z.literal("aceptar_sugerido"), fecha, key: z.string().regex(/^(arranca|termina)-\d+$/) }),
  z.object({ accion: z.literal("descartar_sugerido"), fecha, key: z.string().regex(/^(arranca|termina)-\d+$/) }),
  z.object({ accion: z.literal("esperar"), pedidoId: id, motivo: z.string().trim().min(1).max(120), hasta: hora.nullable().optional() }),
  z.object({ accion: z.literal("ya_esta"), pedidoId: id }),
  z.object({ accion: z.literal("pasar_a_manana"), pedidoId: id }),
  z.object({ accion: z.literal("anular"), pedidoId: id, motivo: z.string().trim().max(200).optional() }),
  z.object({ accion: z.literal("orden_manual"), pedidoId: id, orden: z.number().nullable() }),
  z.object({ accion: z.literal("visto"), pedidoId: id }),
]);
export type AccionPedido = z.infer<typeof accionPedidoSchema>;

export const accionAusenciaSchema = z.discriminatedUnion("accion", [
  z.object({ accion: z.literal("crear"), personaId: id, desde: fecha, hasta: fecha.nullable(), tipo: tipoAusencia, horaDesde: hora.nullable().optional(), horaHasta: hora.nullable().optional(), nota: z.string().trim().max(300).nullable().optional(), origen: z.enum(["planificador", "asistencia"]).optional() }),
  z.object({ accion: z.literal("editar"), ausenciaId: id, desde: fecha.optional(), hasta: fecha.nullable().optional(), tipo: tipoAusencia.optional(), nota: z.string().trim().max(300).nullable().optional() }),
  /** "Ya tiene el alta" desde el día que se mira. Sin ausenciaId: una de la asistencia. */
  z.object({ accion: z.literal("alta"), fecha, ausenciaId: id.nullable().optional(), personaId: id.optional(), desde: fecha.optional(), tipo: tipoAusencia.optional() }),
  z.object({ accion: z.literal("anular"), ausenciaId: id }),
]);
export type AccionAusencia = z.infer<typeof accionAusenciaSchema>;

export const accionPersonaSchema = z.discriminatedUnion("accion", [
  z.object({ accion: z.literal("celular"), personaId: id, telefono: z.string().trim().min(6).max(40) }),
  z.object({ accion: z.literal("puede_estar_a_cargo"), personaId: id, valor: z.boolean() }),
]);
export const accionLugarSchema = z.discriminatedUnion("accion", [
  z.object({ accion: z.literal("crear"), nombre: z.string().trim().min(1).max(80), corto: z.string().trim().max(30).nullable().optional(), tipo: z.enum(["deposito", "proveedor", "taller", "vtv", "otro"]), direccion: z.string().trim().max(200).nullable().optional(), lat: z.number().nullable().optional(), lng: z.number().nullable().optional(), telefono: z.string().trim().max(40).nullable().optional(), horario: z.string().trim().max(120).nullable().optional(), cierra: hora.nullable().optional(), nota: z.string().trim().max(300).nullable().optional() }),
  z.object({ accion: z.literal("editar"), lugarId: id, nombre: z.string().trim().min(1).max(80).optional(), corto: z.string().trim().max(30).nullable().optional(), tipo: z.enum(["deposito", "proveedor", "taller", "vtv", "otro"]).optional(), direccion: z.string().trim().max(200).nullable().optional(), lat: z.number().nullable().optional(), lng: z.number().nullable().optional(), telefono: z.string().trim().max(40).nullable().optional(), horario: z.string().trim().max(120).nullable().optional(), cierra: hora.nullable().optional(), nota: z.string().trim().max(300).nullable().optional(), activo: z.boolean().optional() }),
]);
export const precargaSchema = z.object({ fecha, modo: z.enum(["hoy", "plantel", "vacio"]) });

// ─── Ayudas ─────────────────────────────────────────────────────────────────

const ahoraDe = (f: Fecha) => minutosDesde(f, new Date());
const ts = () => new Date().toISOString();
const N = (dia: DiaHoja, p: string | null | undefined) => nombreDe(dia, p) || "alguien";

/** persona_id o externa_id, según de dónde sea la persona. */
async function colPersona(pid: string): Promise<{ persona_id: string | null; externa_id: string | null }> {
  const r = await createAdminClient().from("personal").select("id").eq("id", pid).maybeSingle();
  return r.data ? { persona_id: pid, externa_id: null } : { persona_id: null, externa_id: pid };
}

async function filaHoja(db: DB, f: Fecha, cuadrilla: number): Promise<Fila | null> {
  const r = await db.from("hd_hojas").select("*").eq("fecha", f).eq("cuadrilla_odoo_id", cuadrilla).maybeSingle();
  if (r.error) throw new Error(r.error.message);
  return r.data;
}
async function asegurarHoja(g: Grabador, db: DB, f: Fecha, cuadrilla: number, dia?: DiaHoja): Promise<Fila> {
  const h = await filaHoja(db, f, cuadrilla);
  if (h) return h;
  const p = dia?.parametros;
  return g.insertar("hd_hojas", { fecha: f, cuadrilla_odoo_id: cuadrilla, chofer_modo: "sin", encuentro_lugar: "obra", encuentro_hora: p?.encuentroObra ?? "08:00", origen: "manual" });
}
async function integranteDe(db: DB, f: Fecha, pid: string): Promise<Fila | null> {
  const r = await db.from("hd_integrantes").select("*").eq("fecha", f).or(`persona_id.eq.${pid},externa_id.eq.${pid}`).maybeSingle();
  return r.data;
}
async function viajesDeHoja(db: DB, hojaId: string): Promise<Fila[]> {
  const r = await db.from("hd_viajes").select("*").eq("hoja_id", hojaId).neq("estado", "anulado");
  return r.data ?? [];
}
const cuadrillaDeHoja = (h: Fila) => Number(h.cuadrilla_odoo_id);

/** Columnas de un viaje nuevo. */
function filaViaje(f: Fecha, v: ViajeNuevo): Fila {
  return {
    fecha: f, vehiculo_id: v.vehiculoId, chofer_id: v.choferId, flete_externo: v.fleteExterno, tipo: v.tipo, hoja_id: v.hojaId,
    cuadrilla_odoo_id: v.cuadrillaOdooId, ...columnasPunto("hacia", v.hacia), ...columnasPunto("desde", v.desde), orden: v.orden,
    hora: v.hora, no_antes_de: v.noAntesDe, duracion_min: v.duracionMin, vuelta: v.vuelta, vuelta_carga: v.vueltaCarga, carga: v.carga,
    carga_deposito: v.cargaDeposito, ok_todo_el_dia: v.okTodoElDia,
  };
}

/** Si el vehículo no tiene chofer ese día, queda el de la cuadrilla (como en la maqueta). */
async function asegurarCamion(g: Grabador, db: DB, dia: DiaHoja, f: Fecha, veh: string | null, ch: string | null) {
  if (!veh || !ch || choferDelCamion(dia, veh)) return;
  const r = await db.from("hd_camiones_dia").select("*").eq("fecha", f).eq("vehiculo_id", veh).maybeSingle();
  if (r.data) await g.actualizar("hd_camiones_dia", String(r.data.id), { chofer_id: ch, sin_chofer: false });
  else await g.insertar("hd_camiones_dia", { fecha: f, vehiculo_id: veh, chofer_id: ch });
}

/**
 * Deja los viajes de cuadrilla (lleva / busca) de una hoja como dice el modo: en "Lleva y
 * trae" los crea si faltan y les pone el chofer y el vehículo; en los otros modos borra los
 * planeados (los hechos quedan: son historia).
 */
async function sincronizarViajes(g: Grabador, db: DB, hoja: Fila, cambio: CambioHoja, dia: DiaHoja) {
  const f = String(hoja.fecha);
  const modo = (cambio.modo ?? hoja.chofer_modo) as ModoChofer;
  const vs = await viajesDeHoja(db, String(hoja.id));
  if (modo !== "lleva_trae") {
    for (const v of vs) if (v.estado === "planeado" && ["lleva", "busca", "mueve"].includes(String(v.tipo))) await g.borrar("hd_viajes", String(v.id));
    return;
  }
  const ch = cambio.choferId !== undefined ? cambio.choferId : (hoja.chofer_id as string | null);
  const veh = cambio.vehiculoId !== undefined ? cambio.vehiculoId : (hoja.vehiculo_id as string | null);
  const enc = cambio.encuentro?.hora ?? normHora(String(hoja.encuentro_hora)) ?? dia.parametros.encuentroDeposito;
  for (const tipo of ["lleva", "busca"] as const) {
    const v = vs.find((x) => x.tipo === tipo);
    const h = tipo === "lleva" ? cambio.lleva ?? enc : cambio.busca ?? dia.parametros.finJornada;
    if (!v) {
      await g.insertar("hd_viajes", filaViaje(f, {
        vehiculoId: veh, choferId: ch, fleteExterno: null, tipo, hojaId: String(hoja.id), cuadrillaOdooId: cuadrillaDeHoja(hoja),
        hacia: { otId: null, lugarId: null, texto: null }, desde: null, orden: toMin(h) ?? 420, hora: h, noAntesDe: null, duracionMin: null,
        vuelta: false, vueltaCarga: null, carga: null, cargaDeposito: null, okTodoElDia: false,
      }));
    } else if (v.estado === "planeado" && (cambio.choferId !== undefined || cambio.vehiculoId !== undefined)) {
      await g.actualizar("hd_viajes", String(v.id), { vehiculo_id: veh, chofer_id: ch });
    }
  }
  await asegurarCamion(g, db, dia, f, veh, ch);
}

/** Aplica un cambio de chofer/modo/encuentro a una hoja (y a sus viajes). */
async function aplicarCambioHoja(g: Grabador, db: DB, hoja: Fila, cambio: CambioHoja, dia: DiaHoja) {
  const valores: Fila = {};
  if (cambio.modo !== undefined) valores.chofer_modo = cambio.modo;
  if (cambio.choferId !== undefined) valores.chofer_id = cambio.choferId;
  if (cambio.vehiculoId !== undefined) valores.vehiculo_id = cambio.vehiculoId;
  if (cambio.encuentro) { valores.encuentro_lugar = cambio.encuentro.lugar; valores.encuentro_hora = cambio.encuentro.hora; valores.encuentro_texto = cambio.encuentro.texto; }
  if (cambio.choferId !== undefined || cambio.vehiculoId !== undefined || cambio.modo !== undefined) valores.chofer_tocado_at = ts();
  const nueva = Object.keys(valores).length ? await g.actualizar("hd_hojas", String(hoja.id), valores) : hoja;
  await sincronizarViajes(g, db, nueva, cambio, dia);
}

/** Escribe un plan de hoja (precarga o "copiar como hoy") sobre una hoja nueva o existente. */
async function escribirPlan(g: Grabador, db: DB, dia: DiaHoja, f: Fecha, p: PlanHoja, existente: Fila | null) {
  const valores = {
    chofer_modo: p.modo, chofer_id: p.choferId, vehiculo_id: p.vehiculoId, encuentro_lugar: p.encuentro.lugar, encuentro_texto: p.encuentro.texto,
    encuentro_hora: p.encuentro.hora, origen: p.origen, copiada_de: p.copiadaDe, chofer_tocado_at: ts(),
  };
  const hoja = existente ? await g.actualizar("hd_hojas", String(existente.id), valores) : await g.insertar("hd_hojas", { fecha: f, cuadrilla_odoo_id: p.cuadrillaOdooId, ...valores });
  if (existente) {
    const r = await db.from("hd_integrantes").select("id").eq("hoja_id", existente.id);
    for (const i of r.data ?? []) await g.borrar("hd_integrantes", String(i.id));
    for (const v of await viajesDeHoja(db, String(existente.id))) if (v.estado === "planeado") await g.borrar("hd_viajes", String(v.id));
  }
  for (const [i, pid] of p.gente.entries()) {
    const otro = await integranteDe(db, f, pid);
    if (otro) await g.actualizar("hd_integrantes", String(otro.id), { hoja_id: hoja.id, a_cargo: pid === p.aCargoId, orden: i, nota: null });
    else await g.insertar("hd_integrantes", { hoja_id: hoja.id, ...(await colPersona(pid)), a_cargo: pid === p.aCargoId, orden: i });
  }
  if (p.modo === "lleva_trae") {
    await sincronizarViajes(g, db, hoja, { modo: "lleva_trae", choferId: p.choferId, vehiculoId: p.vehiculoId, lleva: p.lleva, busca: p.busca ?? undefined }, dia);
    if (!p.busca) { // "vuelven por su cuenta"
      const bu = (await viajesDeHoja(db, String(hoja.id))).find((v) => v.tipo === "busca");
      if (bu) await g.borrar("hd_viajes", String(bu.id));
    }
  }
  return hoja;
}

const listo = async (userId: string, texto: string, g: Grabador, a: Omit<Parameters<typeof anotar>[1], "texto">, extra: Fila = {}): Promise<Resultado> => {
  const historialId = g.cambios.length ? await anotar(userId, { ...a, texto }, g.cambios) : null;
  return { ok: true, texto, historialId: historialId || null, ...extra };
};

// ═══════════════════════════ Precarga ═════════════════════════════════════════

export function precargar(db: DB, userId: string, f: Fecha, modo: "hoy" | "plantel" | "vacio"): Promise<Resultado> {
  return conGrabador(db, userId, { fecha: f, entidad: "precarga", accion: `precarga_${modo}` }, (g) => precargarCon(g, db, userId, f, modo));
}
async function precargarCon(g: Grabador, db: DB, userId: string, f: Fecha, modo: "hoy" | "plantel" | "vacio"): Promise<Resultado> {
  const dia = await leerDia(f, { cacheOdoo: true });
  const plan = planPrecarga(dia, modo);
  if (!plan.hojas.length) throw new Error(dia.obras.length ? "Todas las cuadrillas con obras ya tienen hoja ese día." : "El tablero no tiene obras ese día.");
  for (const p of plan.hojas) await escribirPlan(g, db, dia, f, p, null);
  for (const cam of plan.camiones) await asegurarCamion(g, db, dia, f, cam.vehiculoId, cam.choferId);
  const texto = modo === "hoy" ? `Listo: ${plan.hojas.length} hojas copiadas del ${dia.anterior ? `${ddmm(dia.anterior.fecha)}` : "día anterior"}` : modo === "plantel" ? "Listo: hojas armadas con el plantel base" : "Listo: hojas vacías con las obras del tablero";
  return listo(userId, texto, g, { fecha: f, entidad: "precarga", accion: `precarga_${modo}` }, { avisos: plan.avisos });
}

// ═══════════════════════════ Hojas ════════════════════════════════════════════

export function accionHoja(db: DB, userId: string, a: AccionHoja): Promise<Resultado> {
  return conGrabador(db, userId, { fecha: a.fecha, entidad: "hoja", accion: a.accion }, (g) => accionHojaCon(g, db, userId, a));
}
async function accionHojaCon(g: Grabador, db: DB, userId: string, a: AccionHoja): Promise<Resultado> {
  const f = a.fecha;
  // El día entero sólo cuando la regla lo necesita (nombres y planes): lee Odoo (con caché).
  const dia = await leerDia(f, { cacheOdoo: true });
  const C = (x: number) => cNombre(dia, x);
  const base = { fecha: f, entidad: "hoja" };

  switch (a.accion) {
    case "crear_hoja": {
      const h = await asegurarHoja(g, db, f, a.cuadrilla, dia);
      return listo(userId, `${C(a.cuadrilla)}: hoja nueva`, g, { ...base, entidadId: String(h.id), hojaId: String(h.id), accion: a.accion });
    }
    case "agregar": {
      const hoja = await asegurarHoja(g, db, f, a.cuadrilla, dia);
      const actual = await integranteDe(db, f, a.personaId);
      if (actual && actual.hoja_id === hoja.id && !a.reemplaza) return { ok: true, texto: `${N(dia, a.personaId)} ya está en la ${C(a.cuadrilla)}`, historialId: null };
      const de = actual ? dia.hojas.find((h) => h.id === actual.hoja_id)?.cuadrillaOdooId ?? null : null;
      const eraCargo = !!actual?.a_cargo;
      // Pasar de cuadrilla es UNA escritura (cambiar hoja_id), no borrar e insertar: si algo
      // falla, la persona no queda fuera de las dos hojas (I4).
      let orden = (dia.hojas.find((h) => h.id === hoja.id)?.integrantes.length ?? 0) + 1;
      let reempCargo = false;
      if (a.reemplaza) {
        const r = await integranteDe(db, f, a.reemplaza);
        if (r && r.hoja_id === hoja.id) { orden = Number(r.orden); reempCargo = !!r.a_cargo; await g.borrar("hd_integrantes", String(r.id)); }
      }
      if (a.aCargo) {
        const prev = await db.from("hd_integrantes").select("id").eq("hoja_id", hoja.id).eq("a_cargo", true).maybeSingle();
        if (prev.data) await g.actualizar("hd_integrantes", String(prev.data.id), { a_cargo: false });
      }
      if (actual) await g.actualizar("hd_integrantes", String(actual.id), { hoja_id: hoja.id, a_cargo: !!a.aCargo, orden, nota: null });
      else await g.insertar("hd_integrantes", { hoja_id: hoja.id, ...(await colPersona(a.personaId)), a_cargo: !!a.aCargo, orden });
      const texto = a.reemplaza
        ? `${N(dia, a.personaId)} reemplazó a ${N(dia, a.reemplaza)}${de != null && de !== a.cuadrilla ? ` (venía de ${laC(dia, de)})` : ""}.${reempCargo ? ` La ${C(a.cuadrilla)} quedó sin nadie a cargo` : ` ${N(dia, a.reemplaza)} quedó sin asignar`}`
        : `${N(dia, a.personaId)} pasó a la ${C(a.cuadrilla)}${de != null && de !== a.cuadrilla ? ` (estaba en ${laC(dia, de)}${eraCargo ? `, a cargo: ${laC(dia, de)} quedó sin nadie a cargo` : ""})` : ""}`;
      return listo(userId, texto, g, { ...base, entidad: "integrante", entidadId: a.personaId, hojaId: String(hoja.id), accion: a.accion });
    }
    case "sacar": {
      const actual = await integranteDe(db, f, a.personaId);
      if (!actual) return { ok: true, texto: `${N(dia, a.personaId)} no estaba en ninguna cuadrilla`, historialId: null };
      const c0 = dia.hojas.find((h) => h.id === actual.hoja_id)?.cuadrillaOdooId ?? 0;
      await g.borrar("hd_integrantes", String(actual.id));
      return listo(userId, `${N(dia, a.personaId)} salió de la ${C(c0)} y quedó sin asignar${actual.a_cargo ? `. ${cap(laC(dia, c0))} quedó sin nadie a cargo` : ""}`, g, { ...base, entidad: "integrante", entidadId: a.personaId, hojaId: String(actual.hoja_id), accion: a.accion });
    }
    case "a_cargo": {
      const hoja = await asegurarHoja(g, db, f, a.cuadrilla, dia);
      const prev = await db.from("hd_integrantes").select("*").eq("hoja_id", hoja.id).eq("a_cargo", true).maybeSingle();
      const ant = prev.data ? String(prev.data.persona_id ?? prev.data.externa_id) : null;
      if (prev.data) await g.actualizar("hd_integrantes", String(prev.data.id), { a_cargo: false });
      if (!a.personaId) return listo(userId, `${N(dia, ant)} ya no está a cargo. La ${C(a.cuadrilla)} quedó sin nadie a cargo`, g, { ...base, hojaId: String(hoja.id), accion: a.accion });
      const actual = await integranteDe(db, f, a.personaId);
      if (actual && actual.hoja_id === hoja.id) await g.actualizar("hd_integrantes", String(actual.id), { a_cargo: true, orden: -1 });
      else if (actual) await g.actualizar("hd_integrantes", String(actual.id), { hoja_id: hoja.id, a_cargo: true, orden: -1, nota: null });
      else await g.insertar("hd_integrantes", { hoja_id: hoja.id, ...(await colPersona(a.personaId)), a_cargo: true, orden: -1 });
      if (hoja.recibe_id || hoja.recibe_externa_id) await g.actualizar("hd_hojas", String(hoja.id), { recibe_id: null, recibe_externa_id: null });
      const envioAnt = ant && ant !== a.personaId ? dia.envios.find((e) => e.personaId === ant && e.enviadaMin != null && !e.anulado) : null;
      const texto = envioAnt
        ? `${N(dia, a.personaId)} queda a cargo de la ${C(a.cuadrilla)}. ${N(dia, ant)} deja de recibir la hoja: avisale`
        : `${N(dia, a.personaId)} queda a cargo de la ${C(a.cuadrilla)}${ant && ant !== a.personaId ? ` (antes ${N(dia, ant)})` : ""}`;
      return listo(userId, texto, g, { ...base, hojaId: String(hoja.id), entidadId: a.personaId, accion: a.accion }, { avisarA: envioAnt ? ant : null });
    }
    case "recibe": {
      const hoja = await asegurarHoja(g, db, f, a.cuadrilla, dia);
      const col = a.personaId ? await colPersona(a.personaId) : { persona_id: null, externa_id: null };
      await g.actualizar("hd_hojas", String(hoja.id), { recibe_id: col.persona_id, recibe_externa_id: col.externa_id });
      return listo(userId, a.personaId ? `La hoja de la ${C(a.cuadrilla)} le llega a ${N(dia, a.personaId)}` : `La ${C(a.cuadrilla)} no tiene a quién mandarle la hoja`, g, { ...base, hojaId: String(hoja.id), accion: a.accion });
    }
    case "nota_persona": {
      const actual = await integranteDe(db, f, a.personaId);
      if (!actual) throw new Error(`${N(dia, a.personaId)} no está en ninguna cuadrilla ese día.`);
      await g.actualizar("hd_integrantes", String(actual.id), { nota: a.nota });
      return listo(userId, a.nota ? `${N(dia, a.personaId)}: ${a.nota}` : `Sin nota para ${N(dia, a.personaId)}`, g, { ...base, entidad: "integrante", entidadId: a.personaId, hojaId: String(actual.hoja_id), accion: a.accion });
    }
    case "modo": {
      const hoja = await asegurarHoja(g, db, f, a.cuadrilla, dia);
      const d2 = hojaDeCuadrilla(dia, a.cuadrilla) ? dia : await leerDia(f, { cacheOdoo: true });
      const cambio = planModo(d2, a.cuadrilla, a.modo);
      await aplicarCambioHoja(g, db, hoja, cambio, d2);
      const L = { sin: "Sin chofer", lleva_trae: "Lleva y trae", todo_el_dia: "Todo el día" }[a.modo];
      const enc = cambio.encuentro ? ` · encuentro ${normHora(cambio.encuentro.hora)} en ${cambio.encuentro.lugar === "deposito" ? "el depósito" : "la obra"}` : "";
      return listo(userId, `${C(a.cuadrilla)}: ${L}${a.modo !== "sin" && cambio.choferId ? ` con ${N(dia, cambio.choferId)}` : ""}${enc}`, g, { ...base, hojaId: String(hoja.id), accion: a.accion });
    }
    case "chofer": {
      const hoja = await asegurarHoja(g, db, f, a.cuadrilla, dia);
      const d2 = hojaDeCuadrilla(dia, a.cuadrilla) ? dia : await leerDia(f, { cacheOdoo: true });
      const cambio: CambioHoja = a.choferId ? planSoltarChofer(d2, a.cuadrilla, a.choferId) : { choferId: null };
      await aplicarCambioHoja(g, db, hoja, cambio, d2);
      const h = hojaDeCuadrilla(d2, a.cuadrilla);
      const texto = a.choferId
        ? `${N(dia, a.choferId)} ${cambio.modo === "todo_el_dia" ? "queda todo el día con" : "lleva a"} la ${C(a.cuadrilla)}${cambio.vehiculoId ? ` (${vehiculoNombre(dia, cambio.vehiculoId)})` : ""}${h?.modo === "sin" ? ". El encuentro pasó al depósito" : ""}`
        : `La ${C(a.cuadrilla)} quedó sin chofer elegido`;
      return listo(userId, texto, g, { ...base, hojaId: String(hoja.id), accion: a.accion });
    }
    case "vehiculo": {
      const hoja = await asegurarHoja(g, db, f, a.cuadrilla, dia);
      await aplicarCambioHoja(g, db, hoja, { vehiculoId: a.vehiculoId }, dia);
      const venc = a.vehiculoId ? dia.vehiculos.find((v) => v.id === a.vehiculoId)?.vencimientos.find((x) => x.tipo === "vtv" && x.vence < f) : null;
      return listo(userId, a.vehiculoId ? `${patente(dia, a.vehiculoId)} con la ${C(a.cuadrilla)}${venc ? ` · ojo: VTV vencida desde el ${ddmm(venc.vence)}` : ""}` : `La ${C(a.cuadrilla)} quedó sin vehículo`, g, { ...base, hojaId: String(hoja.id), accion: a.accion });
    }
    case "encuentro": {
      const hoja = await asegurarHoja(g, db, f, a.cuadrilla, dia);
      await g.actualizar("hd_hojas", String(hoja.id), { encuentro_lugar: a.lugar, encuentro_hora: a.hora, encuentro_texto: a.lugar === "otro" ? a.texto ?? null : null });
      if (hoja.chofer_modo === "lleva_trae" && a.lugar === "deposito") {
        const ll = (await viajesDeHoja(db, String(hoja.id))).find((v) => v.tipo === "lleva" && v.estado === "planeado");
        if (ll) await g.actualizar("hd_viajes", String(ll.id), { hora: a.hora, orden: toMin(a.hora) });
      }
      return listo(userId, `${C(a.cuadrilla)}: encuentro ${normHora(a.hora)} en ${a.lugar === "deposito" ? "el depósito" : a.lugar === "obra" ? "la obra" : a.texto ?? "otro lugar"}`, g, { ...base, hojaId: String(hoja.id), accion: a.accion });
    }
    case "lleva":
    case "busca": {
      const hoja = await filaHoja(db, f, a.cuadrilla);
      if (!hoja) throw new Error(`La ${C(a.cuadrilla)} no tiene hoja ese día.`);
      const v = (await viajesDeHoja(db, String(hoja.id))).find((x) => x.tipo === a.accion);
      if (a.accion === "busca" && a.hora == null) {
        if (v) await g.borrar("hd_viajes", String(v.id));
        return listo(userId, `La ${C(a.cuadrilla)} vuelve por su cuenta`, g, { ...base, hojaId: String(hoja.id), accion: "vuelven_solos" });
      }
      const h = a.hora!;
      if (v) await g.actualizar("hd_viajes", String(v.id), { hora: h, orden: toMin(h) });
      else {
        await g.insertar("hd_viajes", filaViaje(f, {
          vehiculoId: hoja.vehiculo_id as string | null, choferId: hoja.chofer_id as string | null, fleteExterno: null, tipo: a.accion, hojaId: String(hoja.id),
          cuadrillaOdooId: a.cuadrilla, hacia: { otId: null, lugarId: null, texto: null }, desde: null, orden: toMin(h)!, hora: h, noAntesDe: null, duracionMin: null,
          vuelta: false, vueltaCarga: null, carga: null, cargaDeposito: null, okTodoElDia: false,
        }));
      }
      if (a.accion === "lleva" && hoja.encuentro_lugar === "deposito") await g.actualizar("hd_hojas", String(hoja.id), { encuentro_hora: h });
      return listo(userId, `${a.accion === "lleva" ? "Lleva" : "Busca"} a la ${C(a.cuadrilla)} a las ${normHora(h)}`, g, { ...base, hojaId: String(hoja.id), accion: a.accion });
    }
    case "mueve": {
      const hoja = await filaHoja(db, f, a.cuadrilla);
      if (!hoja) throw new Error(`La ${C(a.cuadrilla)} no tiene hoja ese día.`);
      const obras = dia.obras.filter((o) => o.cuadrillaOdooId === a.cuadrilla).sort((x, y) => x.ordenDia - y.ordenDia);
      const i = obras.findIndex((o) => o.otId === a.otId);
      const desde = obras[Math.max(0, i - 1)];
      await g.insertar("hd_viajes", filaViaje(f, {
        vehiculoId: hoja.vehiculo_id as string | null, choferId: hoja.chofer_id as string | null, fleteExterno: null, tipo: "mueve", hojaId: String(hoja.id),
        cuadrillaOdooId: a.cuadrilla, hacia: { otId: a.otId, lugarId: null, texto: null }, desde: desde ? { otId: desde.otId, lugarId: null, texto: null } : null,
        orden: toMin(a.hora)!, hora: a.hora, noAntesDe: null, duracionMin: null, vuelta: false, vueltaCarga: null, carga: null, cargaDeposito: null, okTodoElDia: false,
      }));
      return listo(userId, `Mueve a la ${C(a.cuadrilla)} a ${lugar(dia, { otId: a.otId, lugarId: null, texto: null }).n} a las ${normHora(a.hora)}`, g, { ...base, hojaId: String(hoja.id), accion: a.accion });
    }
    case "nota": {
      const hoja = await asegurarHoja(g, db, f, a.cuadrilla, dia);
      await g.actualizar("hd_hojas", String(hoja.id), { nota: a.nota });
      return listo(userId, a.nota ? `${C(a.cuadrilla)}: nota para todos` : `${C(a.cuadrilla)}: sin nota`, g, { ...base, hojaId: String(hoja.id), accion: a.accion });
    }
    case "instrucciones": {
      const r = await db.from("hd_instrucciones").select("*").eq("fecha", f).eq("odoo_ot_id", a.otId).maybeSingle();
      const valores: Fila = { cuadrilla_odoo_id: a.cuadrilla ?? null };
      if (a.horaInicio !== undefined) valores.hora_inicio = a.horaInicio;
      if (a.hoy !== undefined) valores.hoy = a.hoy;
      if (a.chips !== undefined) valores.chips = a.chips;
      if (r.data) await g.actualizar("hd_instrucciones", String(r.data.id), valores);
      else await g.insertar("hd_instrucciones", { fecha: f, odoo_ot_id: a.otId, ...valores });
      return listo(userId, `Instrucciones de ${lugar(dia, { otId: a.otId, lugarId: null, texto: null }).n}`, g, { ...base, entidad: "instruccion", entidadId: String(a.otId), accion: a.accion });
    }
    case "copiar_como_hoy": {
      const plan = planCopiarComoHoy(dia, a.cuadrilla);
      if (!plan) return { ok: true, texto: `La ${C(a.cuadrilla)} no tuvo hoja el día anterior`, historialId: null };
      const existente = await filaHoja(db, f, a.cuadrilla);
      const h = await escribirPlan(g, db, dia, f, plan, existente);
      return listo(userId, `${C(a.cuadrilla)} copiada del ${ddmm(plan.copiadaDe ?? "")}`, g, { ...base, hojaId: String(h.id), accion: a.accion });
    }
    case "pasar_chofer": {
      const hoja = await filaHoja(db, f, a.cuadrilla);
      const otra = await filaHoja(db, f, a.desde);
      if (!hoja || !otra) throw new Error("Falta una de las dos hojas.");
      await aplicarCambioHoja(g, db, otra, { modo: "sin", choferId: null, vehiculoId: null, encuentro: { lugar: "obra", texto: null, hora: dia.parametros.encuentroObra } }, dia);
      return listo(userId, `${N(dia, hoja.chofer_id as string)} queda todo el día con ${laC(dia, a.cuadrilla)}. ${cap(laC(dia, a.desde))} quedó sin chofer (van por su cuenta, ${dia.parametros.encuentroObra} en la obra)`, g, { ...base, hojaId: String(hoja.id), accion: a.accion });
    }
    case "liberar": {
      const hoja = await filaHoja(db, f, a.cuadrilla);
      if (!hoja) return { ok: true, texto: "No había hoja", historialId: null };
      const r = await db.from("hd_integrantes").select("id").eq("hoja_id", hoja.id);
      for (const i of r.data ?? []) await g.borrar("hd_integrantes", String(i.id));
      return listo(userId, `La gente de la ${C(a.cuadrilla)} quedó sin asignar`, g, { ...base, hojaId: String(hoja.id), accion: a.accion });
    }
  }
}
const cap = (x: string) => (x ? x[0].toUpperCase() + x.slice(1) : x);

// ═══════════════════════════ Viajes ═══════════════════════════════════════════

async function filaViajeDb(db: DB, viajeId: string): Promise<Fila> {
  const r = await db.from("hd_viajes").select("*").eq("id", viajeId).maybeSingle();
  if (!r.data) throw new Error("Ese viaje ya no existe.");
  return r.data;
}

/**
 * "Hecho": el viaje y sus pedidos. Lo usan el escritorio (marcado por el coordinador), el
 * link del chofer y el botón de Telegram. `at` es cuándo se tocó (sin señal, se manda después).
 */
export async function marcarHecho(g: Grabador, viaje: Fila, por: string, at: string): Promise<boolean> {
  if (viaje.estado === "hecho") return false;
  if (viaje.estado === "anulado") throw new Error("Ese viaje está anulado.");
  await g.actualizar("hd_viajes", String(viaje.id), { estado: "hecho", hecho_at: at, hecho_por: por, no_pudo_motivo: null });
  const ps = await g.leer("hd_pedidos", { viaje_id: viaje.id });
  for (const p of ps) if (p.estado !== "anulado") await g.actualizar("hd_pedidos", String(p.id), { estado: "hecho" });
  return true;
}

/** "No pude": el pedido vuelve a la cola en rojo, con el motivo y la hora (§12). */
export async function marcarNoPude(g: Grabador, viaje: Fila, motivo: string, at: string): Promise<boolean> {
  if (viaje.estado === "no_pudo") return false;
  if (viaje.estado === "anulado") throw new Error("Ese viaje está anulado.");
  await g.actualizar("hd_viajes", String(viaje.id), { estado: "no_pudo", hecho_at: at, no_pudo_motivo: motivo, ...(viaje.vuelta ? { vuelta: false } : {}) });
  const ps = await g.leer("hd_pedidos", { viaje_id: viaje.id });
  for (const p of ps) {
    if (p.estado === "anulado") continue;
    await g.actualizar("hd_pedidos", String(p.id), {
      viaje_id: null, estado: "sin_camion", no_pudo_visto: false, intentos: Number(p.intentos ?? 0) + 1,
      ultimo_no_pudo: { at, chofer_id: viaje.chofer_id, motivo, viaje_id: viaje.id, hacia: { otId: viaje.hacia_ot_id ?? null, lugarId: viaje.hacia_lugar_id ?? null, texto: viaje.hacia_texto ?? null } },
    });
  }
  return true;
}

/** Vuelve un viaje a "planeado" (el Deshacer de 10 segundos del chofer). */
export async function deshacerEstadoViaje(g: Grabador, viaje: Fila): Promise<boolean> {
  if (viaje.estado === "planeado") return false;
  if (viaje.estado === "anulado") throw new Error("Ese viaje está anulado.");
  await g.actualizar("hd_viajes", String(viaje.id), { estado: "planeado", hecho_at: null, hecho_por: null, no_pudo_motivo: null });
  const ps = await g.leer("hd_pedidos", { viaje_id: viaje.id });
  for (const p of ps) if (p.estado === "hecho") await g.actualizar("hd_pedidos", String(p.id), { estado: "en_camion" });
  return true;
}

export function accionViaje(db: DB, userId: string, a: AccionViaje): Promise<Resultado> {
  return conGrabador(db, userId, { fecha: "fecha" in a ? a.fecha : null, entidad: "viaje", accion: a.accion }, (g) => accionViajeCon(g, db, userId, a));
}
async function accionViajeCon(g: Grabador, db: DB, userId: string, a: AccionViaje): Promise<Resultado> {
  if (a.accion === "crear") {
    const dia = await leerDia(a.fecha, { cacheOdoo: true });
    const veh = a.vehiculoId ?? null;
    const ahora = ahoraDe(a.fecha);
    const orden = a.orden ?? (a.hora ? toMin(a.hora)! : veh ? (calcVeh(dia, veh).at(-1)?.orden ?? 540) + 30 : toMin(a.noAntesDe) ?? 540);
    const v = await g.insertar("hd_viajes", filaViaje(a.fecha, {
      vehiculoId: veh, choferId: veh ? choferDelCamion(dia, veh) : null, fleteExterno: a.fleteExterno ?? null, tipo: a.tipo, hojaId: null,
      cuadrillaOdooId: null, hacia: a.hacia as Punto, desde: (a.desde as Punto | null | undefined) ?? null, orden, hora: a.hora ?? null,
      noAntesDe: a.noAntesDe ?? (esHoy(ahora) && !a.hora ? hm(Math.round((ahora + 10) / 5) * 5) : null), duracionMin: a.duracionMin ?? null,
      vuelta: a.tipo === "trae_material", vueltaCarga: null, carga: a.carga ?? null, cargaDeposito: null, okTodoElDia: false,
    }));
    const vv = mapViaje(v, a.fecha);
    const texto = a.fleteExterno ? `Flete de afuera: ${a.fleteExterno} · ${a.carga ?? lugar(dia, vv.hacia).n}${a.hora ? ` · ${normHora(a.hora)}` : ""}` : `${TIPOS_VIAJE[a.tipo].nombre} a ${lugar(dia, vv.hacia).n}${veh ? ` en el ${patente(dia, veh)} (${N(dia, choferDelCamion(dia, veh))})` : ""}`;
    return listo(userId, texto, g, { fecha: a.fecha, entidad: "viaje", entidadId: String(v.id), viajeId: String(v.id), accion: "crear_viaje" });
  }
  if (a.accion === "poner_pedido") {
    const pr = await db.from("hd_pedidos").select("*").eq("id", a.pedidoId).maybeSingle();
    if (!pr.data) throw new Error("Ese pedido ya no existe.");
    const f = String(pr.data.fecha);
    const dia = await leerDia(f, { cacheOdoo: true });
    const ped = dia.pedidos.find((p) => p.id === a.pedidoId)!;
    const plan = planPonerPedido(dia, ped, a.vehiculoId, ahoraDe(f), { sobre: a.sobre, orden: a.orden });
    let viajeId: string;
    if ("sumarA" in plan) {
      await g.actualizar("hd_viajes", plan.sumarA, { carga: plan.carga });
      viajeId = plan.sumarA;
    } else {
      if (plan.cederVueltaDe) await g.actualizar("hd_viajes", plan.cederVueltaDe, { vuelta: false });
      viajeId = String((await g.insertar("hd_viajes", filaViaje(f, plan.nuevo))).id);
    }
    await g.actualizar("hd_pedidos", a.pedidoId, { viaje_id: viajeId, estado: "en_camion", no_pudo_visto: true, esperando_hasta: null });
    const dia2 = await leerDia(f, { cacheOdoo: true });
    const vc = viajeCalc(dia2, viajeId);
    const ch = choferDelCamion(dia, a.vehiculoId);
    const texto = "sumarA" in plan
      ? `Sumado al viaje a ${lugar(dia, ped.hacia).n} del ${patente(dia, a.vehiculoId)} (${N(dia, ch)})${vc ? `, ~${hm(vc.t)}` : ""}`
      : `Pedido${ped.pidioId ? ` de ${N(dia, ped.pidioId)}` : ""} en el ${patente(dia, a.vehiculoId)} (${N(dia, ch)})${vc ? `, ${vc.hora ? "" : "~"}${hm(Math.round(vc.t / 5) * 5)}` : ""}`;
    const enviado = dia.envios.some((e) => e.personaId === ch && e.enviadaMin != null && !e.anulado);
    return listo(userId, texto, g, { fecha: f, entidad: "pedido", entidadId: a.pedidoId, pedidoId: a.pedidoId, viajeId, accion: a.accion }, {
      viajeId, avisarA: enviado ? ch : null, avisarDeposito: !!(vc && esHoy(ahoraDe(f)) && vc.carga && ["lleva_material", "entre_depositos"].includes(vc.tipo) && /^l:|^dep$/.test(vc.desdeKey)),
    });
  }
  if (a.accion === "correr_horas" || a.accion === "chofer_del_camion" || a.accion === "vuelven_solos") {
    const dia = await leerDia(a.fecha, { cacheOdoo: true });
    if (a.accion === "vuelven_solos") return accionHoja(db, userId, { accion: "busca", fecha: a.fecha, cuadrilla: a.cuadrilla, hora: null });
    if (a.accion === "correr_horas") {
      const ahora = ahoraDe(a.fecha);
      const cur = calcVeh(dia, a.vehiculoId).find((v) => v.estado === "planeado" && !v.hora);
      if (!cur) return { ok: true, texto: "No hay horas estimadas para correr", historialId: null };
      const desde = hm(Math.round((ahora + 10) / 5) * 5);
      await g.actualizar("hd_viajes", cur.id, { no_antes_de: desde });
      return listo(userId, `${N(dia, choferDelCamion(dia, a.vehiculoId))}: las horas estimadas corren desde ahora (${desde})`, g, { fecha: a.fecha, entidad: "camion", entidadId: a.vehiculoId, accion: a.accion });
    }
    const r = await db.from("hd_camiones_dia").select("*").eq("fecha", a.fecha).eq("vehiculo_id", a.vehiculoId).maybeSingle();
    if (r.data) await g.actualizar("hd_camiones_dia", String(r.data.id), { chofer_id: a.choferId, sin_chofer: a.choferId == null });
    else await g.insertar("hd_camiones_dia", { fecha: a.fecha, vehiculo_id: a.vehiculoId, chofer_id: a.choferId, sin_chofer: a.choferId == null });
    // "Elegir otro chofer" pasa todos los viajes pendientes del camión de una vez (§5).
    const vs = await db.from("hd_viajes").select("id").eq("fecha", a.fecha).eq("vehiculo_id", a.vehiculoId).eq("estado", "planeado");
    for (const v of vs.data ?? []) await g.actualizar("hd_viajes", String(v.id), { chofer_id: a.choferId });
    return listo(userId, a.choferId ? `El ${patente(dia, a.vehiculoId)} lo maneja ${N(dia, a.choferId)} (${(vs.data ?? []).length} viajes)` : `El ${patente(dia, a.vehiculoId)} queda sin chofer`, g, { fecha: a.fecha, entidad: "camion", entidadId: a.vehiculoId, accion: a.accion });
  }

  const v = await filaViajeDb(db, a.viajeId);
  const f = String(v.fecha);
  const dia = await leerDia(f, { cacheOdoo: true });
  const vv = dia.viajes.find((x) => x.id === a.viajeId)!;
  const corto = cortoV(dia, vv);
  const base = { fecha: f, entidad: "viaje", entidadId: a.viajeId, viajeId: a.viajeId, hojaId: vv.hojaId, accion: a.accion };
  const ch = (veh: string | null) => (veh ? choferDelCamion(dia, veh) : null);

  switch (a.accion) {
    case "mover": {
      const antes = vv.vehiculoId;
      const valores: Fila = { vehiculo_id: a.vehiculoId, chofer_id: ch(a.vehiculoId) };
      if (a.hora !== undefined && a.hora && vv.hora) { valores.hora = a.hora; valores.orden = toMin(a.hora); }
      else if (a.orden != null) valores.orden = a.orden;
      await g.actualizar("hd_viajes", a.viajeId, valores);
      if (vv.hojaId && vv.tipo === "lleva" && a.hora) {
        const h = dia.hojas.find((x) => x.id === vv.hojaId);
        if (h?.encuentro.lugar === "deposito") await g.actualizar("hd_hojas", h.id, { encuentro_hora: a.hora });
      }
      const chA = ch(antes), chB = ch(a.vehiculoId);
      const texto = antes !== a.vehiculoId
        ? a.vehiculoId ? `${corto} pasó al ${patente(dia, a.vehiculoId)} (${N(dia, chB)})${chA ? `. Sacaste un viaje a ${N(dia, chA)}` : ""}` : `${corto}: sin camión`
        : a.hora ? `${corto} pasa a las ${normHora(a.hora)}` : `${corto}: nuevo orden`;
      return listo(userId, texto, g, base, { avisarA: [chA, chB].filter((x, i, arr) => x && arr.indexOf(x) === i && dia.envios.some((e) => e.personaId === x && e.enviadaMin != null && !e.anulado)) });
    }
    case "hora": {
      const valores: Fila = {};
      if (a.hora) { valores.hora = a.hora; valores.orden = toMin(a.hora); }
      else { valores.hora = null; if (a.noAntesDe !== undefined) valores.no_antes_de = a.noAntesDe; }
      if (a.hora === null && vv.hora && a.noAntesDe === undefined) valores.no_antes_de = null;
      await g.actualizar("hd_viajes", a.viajeId, valores);
      if (vv.hojaId && vv.tipo === "lleva" && a.hora) {
        const h = dia.hojas.find((x) => x.id === vv.hojaId);
        if (h?.encuentro.lugar === "deposito") await g.actualizar("hd_hojas", h.id, { encuentro_hora: a.hora });
      }
      return listo(userId, a.hora ? `${corto}: hora fija ${normHora(a.hora)}` : a.noAntesDe ? `${corto}: no antes de las ${normHora(a.noAntesDe)}` : `${corto}: hora estimada (se calcula con el orden)`, g, base);
    }
    case "volver_a_cola": {
      if (vv.hojaId) {
        await g.actualizar("hd_viajes", a.viajeId, { vehiculo_id: null, chofer_id: null });
        const c0 = dia.hojas.find((h) => h.id === vv.hojaId)?.cuadrillaOdooId ?? 0;
        return listo(userId, `Nadie ${vv.tipo} a la ${cNombre(dia, c0)} ${vv.tipo === "busca" ? "en" : "a"} ${lugar(dia, viajeCalc(dia, vv.id)?.haciaEf ?? vv.hacia).n}`, g, base);
      }
      const chA = ch(vv.vehiculoId);
      const ps = await g.leer("hd_pedidos", { viaje_id: a.viajeId });
      for (const p of ps) await g.actualizar("hd_pedidos", String(p.id), { viaje_id: null, estado: "sin_camion" });
      if (vv.vuelta && vv.desde?.otId != null) {
        const prev = dia.viajes.find((x) => x.vehiculoId === vv.vehiculoId && x.tipo === "trae_material" && x.hacia.otId === vv.desde!.otId && !x.vuelta);
        if (prev) await g.actualizar("hd_viajes", prev.id, { vuelta: true });
      }
      await g.borrar("hd_viajes", a.viajeId);
      return listo(userId, `Volvió a la cola: ${vv.carga ?? lugar(dia, vv.hacia).n}${chA ? `. Se lo sacaste a ${N(dia, chA)}` : ""}`, g, base, { avisarA: chA && dia.envios.some((e) => e.personaId === chA && e.enviadaMin != null && !e.anulado) ? chA : null });
    }
    case "anular": {
      await g.actualizar("hd_viajes", a.viajeId, { estado: "anulado", anulado_motivo: a.motivo });
      const ps = await g.leer("hd_pedidos", { viaje_id: a.viajeId });
      for (const p of ps) await g.actualizar("hd_pedidos", String(p.id), { viaje_id: null, estado: "sin_camion" });
      return listo(userId, `Viaje anulado: ${corto} (${lowFirst(a.motivo)})${ps.length ? ". El pedido volvió a la cola" : ""}`, g, base);
    }
    case "hecho": {
      const quien = await nombreUsuario(userId);
      const at = ts();
      await marcarHecho(g, v, quien, at);
      return listo(userId, `Hecho ${hm(ahoraDe(f))} · marcado por ${quien}`, g, base);
    }
    case "no_pudo": {
      await marcarNoPude(g, v, a.motivo, ts());
      return listo(userId, `${corto}: no se pudo (${lowFirst(a.motivo)}). El pedido volvió a la cola`, g, base);
    }
    case "deshacer_estado": {
      await deshacerEstadoViaje(g, v);
      return listo(userId, `${corto}: vuelve a estar pendiente`, g, base);
    }
    case "ok_todo_el_dia": {
      await g.actualizar("hd_viajes", a.viajeId, { ok_todo_el_dia: true });
      return listo(userId, `${corto}: se saca un rato al chofer de su cuadrilla`, g, base);
    }
  }
}

// ═══════════════════════════ Pedidos ══════════════════════════════════════════

export function accionPedido(db: DB, userId: string, a: AccionPedido): Promise<Resultado> {
  return conGrabador(db, userId, { fecha: "fecha" in a ? a.fecha ?? null : null, entidad: "pedido", accion: a.accion }, (g) => accionPedidoCon(g, db, userId, a));
}
async function accionPedidoCon(g: Grabador, db: DB, userId: string, a: AccionPedido): Promise<Resultado> {
  if (a.accion === "crear") {
    const hoy = hoyBA();
    const fp = a.fecha ?? fechaPorDefecto(hoy, ahoraDe(hoy), (await leerDia(hoy, { cacheOdoo: true })).parametros);
    const dia = await leerDia(fp, { cacheOdoo: true });
    const hacia = a.hacia as Punto;
    const tipo = a.tipo ?? tipoPorDestino(dia, hacia, a.esParaTraer);
    const pidio = a.pidioId !== undefined ? a.pidioId : pidioPorDefecto(dia, hacia);
    const col = pidio ? await colPersona(pidio) : { persona_id: null, externa_id: null };
    const p = await g.insertar("hd_pedidos", {
      fecha: fp, fecha_original: fp, que: a.que, tipo, ...columnasPunto("hacia", hacia), ...columnasPunto("desde", (a.desde as Punto | null | undefined) ?? null),
      urgencia: a.urgencia, hora_limite: a.horaLimite ?? null, hora_fija: a.horaFija ?? null, no_antes_de: a.noAntesDe ?? null, necesita: a.necesita,
      pidio_persona_id: col.persona_id, pidio_externa_id: col.externa_id, pidio_texto: a.pidioTexto ?? null, canal: a.cajonPendienteId ? "cajon" : a.canal,
      nota: a.nota ?? null, cajon_pendiente_id: a.cajonPendienteId ?? null,
    });
    // Desde el cajón del tablero: el pendiente queda tildado ("→ pedido").
    if (a.cajonPendienteId) {
      const k = await db.from("plan_cajon_pendientes").update({ hecho: true, hecho_at: ts() }).eq("id", a.cajonPendienteId);
      if (k.error) console.error("[hoja-dia] no se pudo tildar el pendiente del cajón", k.error.message);
    }
    return listo(userId, `Pedido guardado: ${a.que} → ${lugar(dia, hacia).n}${pidio ? ` · pidió ${N(dia, pidio)}` : ""}`, g, { fecha: fp, entidad: "pedido", entidadId: String(p.id), pedidoId: String(p.id), accion: "crear_pedido" }, { pedidoId: String(p.id), fecha: fp });
  }
  if (a.accion === "aceptar_sugerido" || a.accion === "descartar_sugerido") {
    const dia = await leerDia(a.fecha, { cacheOdoo: true });
    const s = sugeridosDe(dia, ahoraDe(a.fecha)).find((x) => x.key === a.key);
    if (!s) throw new Error("Ese sugerido ya no está (se revisó o cambió el tablero).");
    const hacia = { otId: s.otId, lugarId: null, texto: null };
    const p = await g.insertar("hd_pedidos", {
      fecha: a.fecha, fecha_original: a.fecha, que: s.que, tipo: s.tipo, ...columnasPunto("hacia", hacia), urgencia: "hoy", hora_fija: s.horaFija,
      no_antes_de: s.noAntesDe, carga_deposito: s.cargaDeposito, canal: "sugerido", sugerido_regla: s.regla, sugerido_ot_id: s.otId,
      ...(a.accion === "descartar_sugerido" ? { estado: "anulado", anulado_motivo: "No hace falta", anulado_at: ts() } : {}),
    });
    if (a.accion === "descartar_sugerido") return listo(userId, "Sugerido descartado: no vuelve a aparecer para esa obra y ese día", g, { fecha: a.fecha, entidad: "pedido", entidadId: String(p.id), pedidoId: String(p.id), accion: a.accion });
    let texto = `Aceptado: ${s.txt}`;
    if (s.enCamion) {
      const dia2 = await leerDia(a.fecha, { cacheOdoo: true });
      const ped = dia2.pedidos.find((x) => x.id === p.id)!;
      const plan = planPonerPedido(dia2, ped, s.enCamion, ahoraDe(a.fecha));
      if ("nuevo" in plan) {
        const v = await g.insertar("hd_viajes", filaViaje(a.fecha, plan.nuevo));
        await g.actualizar("hd_pedidos", String(p.id), { viaje_id: v.id, estado: "en_camion" });
        texto = `Aceptado en el ${patente(dia, s.enCamion)} (${N(dia, choferDelCamion(dia, s.enCamion))})${s.noAntesDe ? `, ~${normHora(s.noAntesDe)}` : ""}`;
      }
    }
    return listo(userId, texto, g, { fecha: a.fecha, entidad: "pedido", entidadId: String(p.id), pedidoId: String(p.id), accion: a.accion }, { pedidoId: String(p.id) });
  }

  const pr = await db.from("hd_pedidos").select("*").eq("id", a.pedidoId).maybeSingle();
  if (!pr.data) throw new Error("Ese pedido ya no existe.");
  const p = pr.data;
  const f = String(p.fecha);
  const dia = await leerDia(f, { cacheOdoo: true });
  const donde = lugar(dia, { otId: (p.hacia_ot_id as number | null) ?? null, lugarId: (p.hacia_lugar_id as string | null) ?? null, texto: (p.hacia_texto as string | null) ?? null }).n;
  const base = { fecha: f, entidad: "pedido", entidadId: a.pedidoId, pedidoId: a.pedidoId, accion: a.accion };
  switch (a.accion) {
    case "esperar": {
      const hasta = a.hasta ? instanteDe(f, toMin(a.hasta)!) : new Date(Date.now() + 3_600_000).toISOString();
      await g.actualizar("hd_pedidos", a.pedidoId, { estado: "esperando", esperando_motivo: a.motivo, esperando_hasta: hasta, no_pudo_visto: true });
      return listo(userId, `Esperando: ${donde} · ${lowFirst(a.motivo)}${a.hasta ? ` · vuelve a «Para hacer vos» a las ${normHora(a.hasta)}` : ""}`, g, base);
    }
    case "ya_esta":
      await g.actualizar("hd_pedidos", a.pedidoId, { estado: p.viaje_id ? "en_camion" : "sin_camion", esperando_hasta: null });
      return listo(userId, `${donde}: ya está. Volvió a «Para hacer vos»`, g, base);
    case "pasar_a_manana": {
      const avisar: string[] = [];
      if (p.viaje_id) {
        const v = dia.viajes.find((x) => x.id === p.viaje_id);
        if (v) {
          // Anulado con motivo y no borrado: al chofer le llega "te saqué un viaje".
          await g.actualizar("hd_viajes", v.id, { estado: "anulado", anulado_motivo: "pasa a mañana" });
          const c0 = v.choferId ?? choferDelCamion(dia, v.vehiculoId);
          if (c0) avisar.push(c0);
        }
      }
      await g.actualizar("hd_pedidos", a.pedidoId, { fecha: addDia(f, 1), viaje_id: null, estado: "sin_camion", orden_manual: -1, esperando_hasta: null, esperando_motivo: null });
      return listo(userId, `${donde} pasa a mañana: queda primero del ${ddmm(addDia(f, 1))} con «viene de ayer»`, g, base, { avisarA: avisar });
    }
    case "anular": {
      if (p.viaje_id) {
        const otros = await g.leer("hd_pedidos", { viaje_id: p.viaje_id });
        if (otros.length <= 1) await g.actualizar("hd_viajes", String(p.viaje_id), { estado: "anulado", anulado_motivo: a.motivo || "ya no hace falta" });
      }
      await g.actualizar("hd_pedidos", a.pedidoId, { estado: "anulado", anulado_motivo: a.motivo || "Ya no hace falta", anulado_at: ts(), viaje_id: null });
      return listo(userId, `Pedido anulado (${lowFirst(a.motivo || "ya no hace falta")}). Queda en el historial`, g, base);
    }
    case "orden_manual":
      await g.actualizar("hd_pedidos", a.pedidoId, { orden_manual: a.orden });
      return listo(userId, a.orden == null ? "Vuelve al orden de la app" : "Orden a mano", g, base);
    case "visto":
      await g.actualizar("hd_pedidos", a.pedidoId, { no_pudo_visto: true });
      return listo(userId, "Visto", g, base);
  }
}

// ═══════════════════════════ Ausencias ════════════════════════════════════════

/** Saca a la persona de las hojas de los días que no viene (de hoy en adelante: el pasado no se toca). */
async function sacarDeHojas(g: Grabador, db: DB, pid: string, desde: Fecha, hasta: Fecha | null): Promise<{ fecha: Fecha; c: number; aCargo: boolean }[]> {
  const hoy = hoyBA();
  const ini = desde > hoy ? desde : hoy;
  let q = db.from("hd_integrantes").select("*, hd_hojas(cuadrilla_odoo_id)").or(`persona_id.eq.${pid},externa_id.eq.${pid}`).gte("fecha", ini);
  if (hasta) q = q.lte("fecha", hasta);
  const r = await q;
  const out: { fecha: Fecha; c: number; aCargo: boolean }[] = [];
  for (const i of r.data ?? []) {
    const { hd_hojas: h, ...fila } = i as Fila & { hd_hojas: { cuadrilla_odoo_id: number } | null };
    void fila;
    await g.borrar("hd_integrantes", String(i.id));
    out.push({ fecha: String(i.fecha), c: Number(h?.cuadrilla_odoo_id), aCargo: !!i.a_cargo });
  }
  return out;
}

export function accionAusencia(db: DB, userId: string, a: AccionAusencia, fechaVista?: Fecha): Promise<Resultado> {
  return conGrabador(db, userId, { fecha: fechaVista ?? null, entidad: "ausencia", accion: a.accion }, (g) => accionAusenciaCon(g, db, userId, a, fechaVista));
}
async function accionAusenciaCon(g: Grabador, db: DB, userId: string, a: AccionAusencia, fechaVista?: Fecha): Promise<Resultado> {
  const dia = await leerDia(fechaVista ?? hoyBA(), { cacheOdoo: true });
  const base = { fecha: fechaVista ?? null, entidad: "ausencia" };
  switch (a.accion) {
    case "crear": {
      if (a.hasta && a.hasta < a.desde) throw new Error("La fecha de vuelta es anterior a la de salida.");
      const parcial = !!(a.horaDesde || a.horaHasta);
      const fila = await g.insertar("hd_ausencias", {
        persona_id: a.personaId, desde: a.desde, hasta: a.hasta, tipo: a.tipo, hora_desde: a.horaDesde ?? null, hora_hasta: a.horaHasta ?? null,
        nota: a.nota ?? null, origen: a.origen ?? "planificador",
      });
      const afect = parcial ? [] : await sacarDeHojas(g, db, a.personaId, a.desde, a.hasta);
      const rango = a.hasta ? (a.hasta === a.desde ? `sólo el ${ddmm(a.desde)}` : `del ${ddmm(a.desde)} al ${ddmm(a.hasta)}`) : `desde el ${ddmm(a.desde)}, sin fecha de alta`;
      const f = afect.find((x) => x.fecha === (fechaVista ?? x.fecha));
      const n = N(dia, a.personaId);
      const texto = parcial
        ? `${n} ${a.horaHasta ? `se retira a las ${normHora(a.horaHasta)}` : `llega a las ${normHora(a.horaDesde)}`} (${TIPO_AUSENCIA_TXT[a.tipo]}) el ${ddmm(a.desde)}`
        : f
          ? f.aCargo ? `${n} no viene (${TIPO_AUSENCIA_TXT[a.tipo]}): la ${cNombre(dia, f.c)} quedó sin nadie a cargo` : `${n} no viene (${TIPO_AUSENCIA_TXT[a.tipo]}, ${rango}). Salió de la ${cNombre(dia, f.c)}`
          : `${n} · ${TIPO_AUSENCIA_TXT[a.tipo]} ${rango}`;
      return listo(userId, texto, g, { ...base, entidadId: String(fila.id), accion: "crear_ausencia" }, { ausenciaId: String(fila.id), afectadas: afect });
    }
    case "editar": {
      const v: Fila = {};
      if (a.desde) v.desde = a.desde;
      if (a.hasta !== undefined) v.hasta = a.hasta;
      if (a.tipo) v.tipo = a.tipo;
      if (a.nota !== undefined) v.nota = a.nota;
      const fila = await g.actualizar("hd_ausencias", a.ausenciaId, v);
      const au = mapAusenciaFila(fila);
      return listo(userId, `Ausencia de ${N(dia, au.personaId)}: ${ausTexto(au, true)}`, g, { ...base, entidadId: a.ausenciaId, accion: a.accion });
    }
    case "alta": {
      if (a.ausenciaId) {
        const r = await db.from("hd_ausencias").select("*").eq("id", a.ausenciaId).maybeSingle();
        if (!r.data) throw new Error("Esa ausencia ya no existe.");
        const al = altaDeAusencia({ desde: String(r.data.desde), hasta: (r.data.hasta as string) ?? null }, a.fecha);
        if ("anular" in al) await g.actualizar("hd_ausencias", a.ausenciaId, { anulada_at: ts(), anulada_por: userId });
        else await g.actualizar("hd_ausencias", a.ausenciaId, { hasta: al.hasta });
        return listo(userId, `${N(dia, String(r.data.persona_id))} ya tiene el alta: vuelve el ${ddmm(a.fecha)}. Quedó sin asignar`, g, { ...base, entidadId: a.ausenciaId, accion: a.accion });
      }
      if (!a.personaId || !a.desde) throw new Error("Falta la persona.");
      // Una de la asistencia: se cierra guardándola, así deja de aparecer (y el pasado queda).
      const al = altaDeAusencia({ desde: a.desde, hasta: null }, a.fecha);
      if ("anular" in al) return { ok: true, texto: "No había nada que cerrar", historialId: null };
      const fila = await g.insertar("hd_ausencias", { persona_id: a.personaId, desde: a.desde, hasta: al.hasta, tipo: a.tipo ?? "art", origen: "asistencia", nota: "Cerrada con «Ya tiene el alta»" });
      return listo(userId, `${N(dia, a.personaId)} ya tiene el alta: vuelve el ${ddmm(a.fecha)}. Quedó sin asignar`, g, { ...base, entidadId: String(fila.id), accion: a.accion });
    }
    case "anular": {
      const fila = await g.actualizar("hd_ausencias", a.ausenciaId, { anulada_at: ts(), anulada_por: userId });
      return listo(userId, `Ausencia de ${N(dia, String(fila.persona_id))} anulada (cargada por error)`, g, { ...base, entidadId: a.ausenciaId, accion: a.accion });
    }
  }
}

// ═══════════════════════════ Personas y lugares ═══════════════════════════════

/** "Cargar celular" (un campo, se guarda en Legajos) y "Puede estar a cargo". Con la service role. */
export async function accionPersona(userId: string, a: z.infer<typeof accionPersonaSchema>): Promise<Resultado> {
  const adm = createAdminClient();
  const g = grabador(adm);
  const r = await adm.from("personal").select("id, apellido").eq("id", a.personaId).maybeSingle();
  const tabla = r.data ? "personal" : "pan_personas_externas";
  if (a.accion === "celular") await g.actualizar(tabla, a.personaId, { telefono: a.telefono });
  else await g.actualizar(tabla, a.personaId, { puede_estar_a_cargo: a.valor });
  const nombre = r.data ? String(r.data.apellido) : "la persona";
  const texto = a.accion === "celular" ? `Guardado en Legajos: ${nombre} · ${a.telefono}` : `${nombre} ${a.valor ? "puede" : "ya no puede"} estar a cargo`;
  const historialId = await anotar(userId, { fecha: null, entidad: "persona", entidadId: a.personaId, accion: a.accion, texto }, g.cambios);
  return { ok: true, texto, historialId: historialId || null };
}

export function accionLugar(db: DB, userId: string, a: z.infer<typeof accionLugarSchema>): Promise<Resultado> {
  return conGrabador(db, userId, { fecha: null, entidad: "lugar", accion: `${a.accion}_lugar` }, (g) => accionLugarCon(g, db, userId, a));
}
async function accionLugarCon(g: Grabador, db: DB, userId: string, a: z.infer<typeof accionLugarSchema>): Promise<Resultado> {
  const { accion, ...resto } = a;
  const col: Fila = {};
  for (const [k, v] of Object.entries(resto)) if (k !== "lugarId" && v !== undefined) col[k] = v;
  const fila = accion === "crear" ? await g.insertar("hd_lugares", col) : await g.actualizar("hd_lugares", (a as { lugarId: string }).lugarId, col);
  return listo(userId, `${accion === "crear" ? "Lugar nuevo" : "Lugar actualizado"}: ${fila.nombre}`, g, { fecha: null, entidad: "lugar", entidadId: String(fila.id), accion: `${accion}_lugar` });
}

// Re-export para las rutas.
export { diasEntre, aCargoDe };
export type { Hoja, Viaje };
