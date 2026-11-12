// La tarjeta de aprobación del WhatsApp de clientes (paso 6) del lado del servidor: lee las
// aprobaciones de una charla, y aprueba, corrige, confirma, rechaza o reintenta. SOLO
// server-side, con service role, detrás de exigirModulo("clientes-whatsapp", "editar").
//
// Las reglas puras (una sola vez, recálculo, corrección, ventana, mensaje, racha) están en
// aprobacion.ts, con tests. Acá se juntan con Supabase, Odoo y Meta, en el orden de §7 y §13:
//
//   APROBAR UN PRECIO (bandeja fácil):
//     1. se recalcula con el motor y las tarifas de hoy: si no da lo que vio la persona, no se
//        manda nada y se avisa (la tarjeta muestra el nuevo);
//     2. con menos de 2 h de ventana, se pide confirmar antes (avisoVentana);
//     3. la decisión se toma UNA SOLA VEZ: pendiente → ejecutando con un UPDATE condicionado;
//     4. PRIMERO ODOO, reusando el guardado del asistente comercial (crearEjecutor → guardar):
//        el cliente (con CUIT o sin CUIT, con el aviso en la nota, como el asistente), la orden
//        en borrador con SÓLO LA BASE (los opcionales van en el PDF y en la nota), la
//        oportunidad vinculada, la nota interna y el PDF final adjunto. El borrador es una fila
//        de cotizacion_borradores creada para esta aprobación: su id es la marca de la orden,
//        así un reintento la actualiza y no la duplica;
//     5. si Odoo o el PDF fallan, NO SE MANDA NADA al cliente: queda en «error» con Reintentar;
//     6. después WhatsApp: el mensaje fijo y el PDF como documento. Con la ventana cerrada no se
//        manda texto libre: queda «aprobada, falta la plantilla» (la plantilla de Meta todavía
//        no existe) y sale cuando el cliente vuelva a escribir;
//     7. queda quién, cuándo, el monto propuesto, el enviado y el motivo de la corrección
//        (cli_aprobaciones): es el contador de la etapa 2. Si la pareja vino por turno, aprobar
//        también la confirma y consume el turno (turno_tecnico).
//
//   CONFIRMAR EL TÉCNICO: guarda la pareja en la charla, consume el turno SÓLO si la propuesta
//   era del turno y se confirmó esa, y le manda al cliente el texto fijo con la asistente y su
//   técnico (si se pidió y la ventana está abierta).
//
//   TEXTO BLOQUEADO: «Editar y mandar» (lo escribe la persona, sale con su nombre) o «Descartar».
//
//   APROBAR UN ALQUILER SIMPLE (carril «alquiler», docs/sofia/alquiler-simple-propuesta.md §10),
//   con el mismo orden y las mismas garantías que la bandeja fácil:
//     1. se recalcula con el motor del alquiler, los parámetros, el flete de Odoo y la fecha de
//        HOY (aprobacion-alquiler.ts → recalcularAlquiler): si el total no es el que vio la
//        persona, no se manda nada; si algo se sale de las reglas (§8) o la fecha ya no se puede,
//        bloquea;
//     2. con menos de 2 h de ventana, se pide confirmar antes;
//     3. una sola vez: pendiente → ejecutando (tomarUnaVez);
//     4. PRIMERO ODOO: el cliente (el de la ficha si Tomás lo identificó; si no, el alta de
//        partner del asistente comercial, crearCliente: nombre, celular y CUIT si lo hay), la
//        orden EN BORRADOR con crearOrdenAlquilerSimple (idempotente por x_asistente_ref =
//        «tomas-alquiler:<id de la aprobación>»), siempre a nombre de Tamara
//        (VENDEDORA_ALQUILER_SIMPLE), la nota interna con el detalle y quién aprobó, y la
//        oportunidad del CRM (si falla, es un aviso). El id queda en pasos.ordenAlquiler =
//        { id, nombre }: de ahí lo lee Tomás para adjuntar los documentos del cliente (§6);
//     5. si Odoo falla, NO SE MANDA NADA: queda en «error» con Reintentar;
//     6. después WhatsApp: el mensaje del motor (mensajePresupuestoAlquiler), sólo texto, sin
//        PDF. Con la ventana cerrada, «aprobada, falta la plantilla», como la bandeja;
//     7. la charla vuelve a Tomás (destinoDespues). El alquiler tiene su propia racha: no cuenta
//        para la de la etapa 2 de la bandeja.
//
// Después de decidir, la charla vuelve a Sofía o queda con la persona (destinoDespues). Si
// quedan otras aprobaciones pendientes en la charla, sigue en «Espera tu OK».
//
// LOS EVENTOS DEL HILO VAN COMO «sistema» (con el nombre de quien decidió en el texto): Sofía lee
// los eventos de las personas, y éstos pueden llevar montos o el motivo de una corrección. El
// precio nunca pasa por el modelo: ella sólo ve «cotización #N: se envió (aprobado)».

import type { SupabaseClient } from "@supabase/supabase-js";
import { executeKw } from "@/lib/odoo/client";
import { urlOdooVenta } from "@/lib/odoo/habilitaciones";
import { leerParametros, leerProductos } from "@/lib/parametros-cotizacion/servidor";
import type { Parametro } from "@/lib/parametros-cotizacion/tipos";
import { tarifasDesdeParametros } from "@/lib/cotizador/tarifas";
import type { Tarifas } from "@/lib/cotizador/tipos";
import { generarPdfPropuesta } from "@/lib/cotizador/pdf/documento";
import { feriadosDelRango } from "@/lib/feriados/argentina";
import { crearCliente, vincularOportunidad } from "@/lib/odoo/presupuestos";
import { crearOrdenAlquilerSimple, fletesAlquilerSimple, type Flete } from "@/lib/odoo/alquiler-simple";
import { alcanceTecnico, normalizarBorrador, type DatosBorrador, type ResultadoBorrador } from "@/lib/asistente/borrador";
import { crearBorrador, leerBorrador, type Accion } from "@/lib/asistente/datos";
import { productoDeLinea } from "@/lib/asistente/edicion";
import { crearEjecutor, type PayloadGuardar } from "@/lib/asistente/ejecutores";
import { camposTrabajo, notaHtml } from "@/lib/asistente/herramientas";
import { datosPropuestaDe } from "@/lib/asistente/pdf";
import {
  aplicarCorreccion, avisoVentana, EJECUTANDO_VENCE_MS, bloqueosDelCalculo, CORTAN_RACHA, destinoDespues, ESTADOS_APROBADOS, mensajeDesdeCalculo, modoEnvio,
  motivoYaDecidida, racha, recalcularBorrador, textoPareja, textoRacha, tomarUnaVez, validarCorreccion, verificarRecalculo,
  type Correccion, type Despues, type EstadoAprobacion, type FilaDecision, type RepoUnaVez, type TipoAprobacion, type TipoCorreccion, type Trato,
} from "./aprobacion";
import { describirArmado, parametrosAlquilerDesdeFilas, textoFecha, textoFranja, type ParametrosAlquiler } from "./alquiler-simple";
import {
  CARRIL_ALQUILER, CORRECCION_EN_BASE, datosDelPedido, leerPayloadAlquiler, motivosParaTarjeta, notaInternaAlquiler, recalcularAlquiler,
  textoEntraSinPagarMas, textoPlataforma, validarCorreccionAlquiler,
  type ContextoRecalculo, type CorreccionAlquiler, type PayloadAlquiler, type RecalculoAlquiler, type TipoCorreccionAlquiler,
} from "./aprobacion-alquiler";
import { PAREJAS_15_10, siguienteEnTurno, tecnicoDeOdoo, type Asignacion } from "./asignacion";
import { nombresDe } from "./bandeja";
import { mandarArchivo, mandarTexto } from "./envio";
import type { Motivo } from "./facil";
import { leerFicha, type FichaSofia } from "./herramientas";
import { anotarEvento } from "./webhook";
import type {
  Auditoria, CharlaIntervenida, CorreccionAlquilerPedida, CorreccionPedida, DecisionAuditada, RenglonVista, ResultadoDecision, TarjetaAlquiler,
  TarjetaAprobacion, TarjetaPrecio, TarjetasCharla, VistaCorreccion,
} from "./vista-aprobacion";

type Db = SupabaseClient;

/** Más de esto desde la vigencia de la tarifa: «revisá si sigue» (§7). */
const TARIFA_VIEJA_DIAS = 45;

const hoyBA = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Argentina/Buenos_Aires" });
const ahoraIso = () => new Date().toISOString();

// ── Las filas ───────────────────────────────────────────────────────────────────────────

type FilaDb = {
  id: string;
  numero: number;
  conversacion_id: string;
  tipo: TipoAprobacion;
  carril: "facil" | "simple" | "tecnico" | "alquiler" | null;
  estado: EstadoAprobacion;
  resumen: string | null;
  monto_propuesto: number | string | null;
  monto_enviado: number | string | null;
  texto: string | null;
  motivo: string | null;
  payload: Record<string, unknown>;
  decidido_por: string | null;
  decidido_at: string | null;
  motivo_correccion: string | null;
  correccion_tipo: TipoCorreccion | null;
  texto_enviado: string | null;
  borrador_id: string | null;
  odoo_venta_id: number | null;
  odoo_venta_nombre: string | null;
  pasos: Record<string, unknown> | null;
  error: string | null;
  created_at: string;
  updated_at: string;
};

type Fila = FilaDb & FilaDecision;

const aFila = (f: FilaDb): Fila => ({ ...f, decididoPor: f.decidido_por, updatedAt: f.updated_at, pasos: f.pasos ?? {}, payload: f.payload ?? {} });
const num = (v: number | string | null | undefined) => (v === null || v === undefined || v === "" ? null : Number(v));

function falla(que: string, e: { message: string } | null): never {
  throw new Error(`${que}: ${e?.message ?? "sin detalle"}`);
}

async function leerFila(db: Db, id: string): Promise<Fila | null> {
  const { data, error } = await db.from("cli_aprobaciones").select("*").eq("id", id).maybeSingle();
  if (error) falla("No se pudo leer la aprobación", error);
  return data ? aFila(data as FilaDb) : null;
}

/** El UPDATE condicionado de «una sola vez» (aprobacion.ts → tomarUnaVez). */
function repoUnaVez(db: Db): RepoUnaVez<Fila, Record<string, unknown>> {
  return {
    async actualizarSi(id, desde, cambios) {
      const { data, error } = await db
        .from("cli_aprobaciones")
        .update({ ...cambios, updated_at: ahoraIso() })
        .eq("id", id)
        .in("estado", desde)
        .select("*")
        .maybeSingle();
      if (error) falla("No se pudo tomar la aprobación", error);
      return data ? aFila(data as FilaDb) : null;
    },
    leer: (id) => leerFila(db, id),
  };
}

async function actualizar(db: Db, id: string, cambios: Record<string, unknown>) {
  const { error } = await db.from("cli_aprobaciones").update({ ...cambios, updated_at: ahoraIso() }).eq("id", id);
  if (error) falla("No se pudo anotar la aprobación", error);
}

type Charla = {
  id: string;
  telefono: string;
  nombre_perfil: string | null;
  estado: string;
  asistente_id: string | null;
  ultimo_entrante_at: string | null;
  partner_id: number | null;
  ficha: FichaSofia;
};

async function leerCharlaAprobacion(db: Db, id: string): Promise<Charla> {
  const { data, error } = await db
    .from("cli_conversaciones")
    .select("id, telefono, nombre_perfil, estado, asistente_id, ultimo_entrante_at, partner_id, ficha")
    .eq("id", id)
    .maybeSingle();
  if (error) falla("No se pudo leer la charla", error);
  if (!data) throw new Error("La charla ya no existe.");
  return { ...(data as Omit<Charla, "ficha">), ficha: leerFicha((data as { ficha: unknown }).ficha, (data as { telefono: string }).telefono) };
}

export type Quien = { id: string; nombre: string };

const nombreDe = (db: Db) => async (id: string | null) => (id ? (await nombresDe(db, [id])).get(id) ?? null : null);

// ── Lo que hace falta para calcular ─────────────────────────────────────────────────────

type Contexto = { parametros: Parametro[]; tarifas: Tarifas; hoy: string };

async function contexto(db: Db): Promise<Contexto> {
  const parametros = await leerParametros(db);
  return { parametros, tarifas: tarifasDesdeParametros(parametros), hoy: hoyBA() };
}

const asignacionDe = (f: Fila) => (f.payload.asignacion as Asignacion | null | undefined) ?? null;

/** Lo que guarda el OK para poder reintentar con exactamente lo mismo. */
type Envio = { datos: DatosBorrador; resultado: ResultadoBorrador; texto: string; despues: Despues; correccion: Correccion | null };

function calcular(f: Fila, ctx: Contexto, correccion: Correccion | null) {
  const original = normalizarBorrador(f.payload.datos);
  const datos = correccion ? aplicarCorreccion(original, correccion, ctx.tarifas) : original;
  const resultado = recalcularBorrador(datos, ctx.tarifas, ctx.hoy);
  return { original, datos, resultado };
}

function mensajePara(f: Fila, charla: Charla, ctx: Contexto, datos: DatosBorrador, resultado: ResultadoBorrador, correccion: Correccion | null): string {
  if (correccion?.texto?.trim()) return correccion.texto.trim();
  const a = asignacionDe(f);
  return mensajeDesdeCalculo({
    datos, resultado, tarifas: ctx.tarifas, nombre: charla.ficha.nombre ?? charla.nombre_perfil, asistente: a?.asistente ?? null, tecnico: a?.tecnico ?? null,
    trato: (charla.ficha.trato ?? null) as Trato,
  });
}

const renglones = (r: ResultadoBorrador): RenglonVista[] =>
  r.lineas.map((l) => ({ id: l.id, descripcion: l.descripcion, importe: l.importe, seccion: l.seccion, ...(l.unidad ? { unidad: l.unidad } : {}) }));

// ── Leer las tarjetas ───────────────────────────────────────────────────────────────────

/** Las que se muestran en la charla: las que esperan a alguien o quedaron a medio camino. */
const ESTADOS_EN_TARJETA: EstadoAprobacion[] = ["pendiente", "ejecutando", "error", "falta_plantilla"];

/**
 * La racha de la etapa 2 (§9): la de la bandeja fácil. Con carril «alquiler», la del alquiler
 * simple, aparte (aprobacion-alquiler.ts: no cuenta para la de la bandeja).
 */
export async function rachaActual(db: Db, carril: "facil" | "alquiler" = "facil") {
  const { data, error } = await db
    .from("cli_aprobaciones")
    .select("estado, correccion_tipo, decidido_at")
    .eq("tipo", "precio")
    .eq("carril", carril)
    .in("estado", [...ESTADOS_APROBADOS])
    .not("decidido_at", "is", null)
    .order("decidido_at", { ascending: false })
    .limit(500);
  // Sin la migración 20261018000001 (correccion_tipo) la racha arranca en 0: no rompe la tarjeta.
  if (error) return racha([]);
  return racha(((data ?? []) as { estado: EstadoAprobacion; correccion_tipo: TipoCorreccion | null; decidido_at: string }[]).map((d) => ({
    estado: d.estado, correccionTipo: d.correccion_tipo ?? null, decididoAt: d.decidido_at,
  })));
}

function tarjetaPrecio(f: Fila, charla: Charla, ctx: Contexto): TarjetaPrecio {
  const { datos, resultado } = calcular(f, ctx, null);
  const a = asignacionDe(f);
  const motivos = (f.payload.motivos as Motivo[] | undefined) ?? [];
  const paramTarifa = ctx.parametros.find((p) => p.clave === "bandeja_3m_ml");
  const vigente = paramTarifa?.vigente_desde ?? null;
  const dias = vigente ? (Date.parse(`${ctx.hoy}T12:00:00Z`) - Date.parse(`${vigente.slice(0, 10)}T12:00:00Z`)) / 86_400_000 : null;
  const montoPropuesto = num(f.monto_propuesto);
  const bandeja = datos.calculos.bandeja;
  return {
    mensaje: mensajePara(f, charla, ctx, datos, resultado, null),
    renglones: renglones(resultado),
    neto: resultado.totales.subtotal,
    iva: resultado.totales.iva,
    total: resultado.totales.total,
    renovacion: resultado.totales.renovacion ? { pct: resultado.totales.renovacion.pct, monto: resultado.totales.renovacion.monto } : null,
    metros: bandeja?.metros ?? null,
    precioMl: resultado.lineas.find((l) => l.id === "bandeja")?.precioUnitario ?? null,
    tarifaMl: ctx.tarifas.bandeja.m3,
    montoPropuesto,
    cambioDesdeSofia: montoPropuesto !== null && Math.abs(montoPropuesto - resultado.totales.subtotal) > 1,
    motivos,
    facil: f.payload.facil === true,
    problemas: (f.payload.problemas as string[] | undefined) ?? [],
    bloqueos: bloqueosDelCalculo(resultado),
    pareja: a ? { tecnico: a.tecnico, asistente: a.asistente, motivo: a.motivo, regla: a.regla } : null,
    tarifaVigenteDesde: vigente,
    tarifaVieja: dias !== null && dias > TARIFA_VIEJA_DIAS,
    sinCuit: !charla.ficha.cuit,
  };
}

function tarjetaDe(
  f: Fila, charla: Charla, ctx: Contexto, iaActiva: boolean, nombres: Map<string, string>, ultimoTurno: string | null, ctxA: ContextoAlquilerCargado | null,
): TarjetaAprobacion {
  const base: TarjetaAprobacion = {
    id: f.id,
    numero: Number(f.numero),
    tipo: f.tipo,
    carril: f.carril,
    estado: f.estado,
    resumen: f.resumen,
    creada: f.created_at,
    decididoPor: f.decidido_por ? nombres.get(f.decidido_por) ?? "otra persona" : null,
    decididoAt: f.decidido_at,
    error: f.error,
    correccionTipo: f.correccion_tipo,
    motivoCorreccion: f.motivo_correccion,
    odooVenta: f.odoo_venta_id && f.odoo_venta_nombre ? { nombre: f.odoo_venta_nombre, url: urlOdooVenta(f.odoo_venta_id) ?? "" } : null,
    despuesPorDefecto: destinoDespues({ tipo: f.tipo, accion: "aprobar", iaActiva, propuesta: f.payload.despues }),
    colgada: f.estado === "ejecutando" && Date.now() - Date.parse(f.updated_at) > EJECUTANDO_VENCE_MS,
  };
  if (f.tipo === "precio" && f.carril === "facil") {
    try {
      base.precio = tarjetaPrecio(f, charla, ctx);
    } catch (e) {
      base.error = base.error ?? `No se pudo recalcular: ${e instanceof Error ? e.message : e}`;
    }
  } else if (f.tipo === "precio" && f.carril === CARRIL_ALQUILER) {
    try {
      if (!ctxA) throw new Error("no se cargaron los parámetros del alquiler");
      if ("error" in ctxA) throw new Error(ctxA.error);
      base.alquiler = tarjetaAlquiler(f, charla, ctxA, recalcularAlquiler(leerPayloadAlquiler(f.payload), contextoRecalculo(ctxA, charla), null));
    } catch (e) {
      base.error = base.error ?? `No se pudo recalcular el alquiler: ${e instanceof Error ? e.message : e}`;
    }
  } else if (f.tipo === "precio" && f.carril === "simple") {
    const a = (f.payload.alquiler ?? {}) as { piezas?: { descripcion: string; cantidad: number }[]; dias?: number | null; entrega?: string | null; barrio?: string | null; notas?: string | null };
    base.simple = {
      resumen: f.resumen ?? "Alquiler simple",
      piezas: a.piezas ?? [],
      dias: a.dias ?? null,
      entrega: a.entrega ?? null,
      barrio: a.barrio ?? null,
      notas: a.notas ?? null,
      alertas: ((f.payload.alertas as { texto: string; palabra: string }[] | undefined) ?? []).map((x) => `${x.texto} («${x.palabra}»)`),
    };
  } else if (f.tipo === "tecnico" || f.tipo === "traspaso") {
    const a = asignacionDe(f);
    const siguiente = siguienteEnTurno(PAREJAS_15_10, { ultimo: ultimoTurno })?.tecnico ?? null;
    base.tecnico = {
      resumen: (f.payload.resumen as string | undefined) ?? f.resumen ?? "",
      motivo: (f.payload.motivo as string | undefined) ?? null,
      disponibilidad: (f.payload.disponibilidad as string | undefined) ?? null,
      porQueNoFacil: Array.isArray(f.payload.porQueNoFacil) ? (f.payload.porQueNoFacil as string[]) : null,
      propuesta: a
        ? { tecnico: a.tecnico, asistente: a.asistente, motivo: a.motivo, regla: a.regla, requiereConfirmacion: a.requiereConfirmacion, tambienTrabajoCon: a.tambienTrabajoCon ?? [] }
        : null,
      opciones: [
        ...PAREJAS_15_10.parejas.map((p) => ({ tecnico: p.tecnico as string | null, asistente: p.asistente as string | null, siguienteEnTurno: p.tecnico === siguiente })),
        { tecnico: null, asistente: PAREJAS_15_10.asistenteSimple, siguienteEnTurno: false },
      ].map((o) => ({ ...o, textoCliente: textoPareja({ ...o, trato: (charla.ficha.trato ?? null) as Trato }) })),
      textoCliente: a ? textoPareja({ asistente: a.asistente, tecnico: a.tecnico, trato: (charla.ficha.trato ?? null) as Trato }) : null,
      avisarPorDefecto: f.payload.avisarCliente !== false,
    };
  } else if (f.tipo === "texto_bloqueado") {
    base.bloqueado = {
      texto: f.texto ?? "",
      motivo: f.motivo,
      hallazgos: ((f.payload.hallazgos as { codigo: string; motivo: string; fragmento: string }[] | undefined) ?? []).map((h) => ({ codigo: h.codigo, motivo: h.motivo, fragmento: h.fragmento })),
    };
  }
  return base;
}

/** El turno: la última decisión que lo consumió (turno_tecnico). */
export async function ultimoDelTurno(db: Db): Promise<string | null> {
  const { data, error } = await db
    .from("cli_aprobaciones")
    .select("turno_tecnico")
    .not("turno_tecnico", "is", null)
    .order("decidido_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return (data?.turno_tecnico as string | undefined) ?? null;
}

export async function tarjetasDeCharla(db: Db, conversacionId: string, iaActiva: boolean): Promise<TarjetasCharla> {
  const { data, error } = await db
    .from("cli_aprobaciones")
    .select("*")
    .eq("conversacion_id", conversacionId)
    .in("estado", ESTADOS_EN_TARJETA)
    .order("created_at", { ascending: true });
  // Sin la migración del paso 5 (o del 6, por los estados nuevos), sin tarjetas.
  if (error) return { tarjetas: [], racha: { actual: 0, meta: 20, completa: false }, iaActiva };
  const filas = ((data ?? []) as FilaDb[]).map(aFila);
  const r = await rachaActual(db);
  if (!filas.length) return { tarjetas: [], racha: { actual: r.actual, meta: r.meta, completa: r.completa }, iaActiva };
  const hayAlquiler = filas.some((f) => f.carril === CARRIL_ALQUILER);
  const [charla, ctx, nombres, ultimo, rA] = await Promise.all([
    leerCharlaAprobacion(db, conversacionId),
    contexto(db),
    nombresDe(db, filas.map((f) => f.decidido_por)),
    filas.some((f) => f.tipo === "tecnico") ? ultimoDelTurno(db) : Promise.resolve(null),
    hayAlquiler ? rachaActual(db, CARRIL_ALQUILER) : Promise.resolve(null),
  ]);
  // Para mostrar, un Odoo caído no rompe la tarjeta: se usa el flete guardado con un aviso.
  const ctxA = hayAlquiler ? await cargarContextoAlquiler(ctx, { fletesObligatorios: false }) : null;
  return {
    tarjetas: filas.map((f) => tarjetaDe(f, charla, ctx, iaActiva, nombres, ultimo, ctxA)),
    racha: { actual: r.actual, meta: r.meta, completa: r.completa },
    ...(rA ? { rachaAlquiler: { actual: rA.actual, meta: rA.meta, completa: rA.completa } } : {}),
    iaActiva,
  };
}

// ── Corregir: el nuevo, antes de mandar ─────────────────────────────────────────────────

function correccionDe(c: CorreccionPedida | null | undefined): Correccion | null {
  if (!c) return null;
  return { tipo: c.tipo, motivo: c.motivo, metros: c.metros, precioMl: c.precioMl, concertina: c.concertina, gestoria: c.gestoria, texto: c.texto };
}

async function filaDeLaCharla(db: Db, id: string, conversacionId: string): Promise<Fila> {
  const f = await leerFila(db, id);
  if (!f || f.conversacion_id !== conversacionId) throw new ErrorTarjeta("Esa aprobación no es de esta charla.", 404);
  return f;
}

async function filaDePrecio(db: Db, id: string, conversacionId: string): Promise<Fila> {
  const f = await filaDeLaCharla(db, id, conversacionId);
  if (f.tipo !== "precio" || f.carril !== "facil") throw new ErrorTarjeta("Esto sólo vale para la bandeja fácil.", 400);
  return f;
}

export class ErrorTarjeta extends Error {
  constructor(mensaje: string, readonly status: number = 409) {
    super(mensaje);
  }
}

export async function vistaCorreccion(db: Db, conversacionId: string, id: string, pedida: CorreccionPedida): Promise<VistaCorreccion> {
  const f = await filaDePrecio(db, id, conversacionId);
  const correccion = correccionDe(pedida)!;
  const invalida = validarCorreccion(correccion);
  if (invalida) throw new ErrorTarjeta(invalida, 400);
  const [charla, ctx] = await Promise.all([leerCharlaAprobacion(db, conversacionId), contexto(db)]);
  const antes = calcular(f, ctx, null);
  const { datos, resultado } = calcular(f, ctx, correccion);
  return {
    mensaje: mensajePara(f, charla, ctx, datos, resultado, correccion),
    renglones: renglones(resultado),
    neto: resultado.totales.subtotal,
    total: resultado.totales.total,
    netoAntes: antes.resultado.totales.subtotal,
    bloqueos: bloqueosDelCalculo(resultado),
    cortaRacha: CORTAN_RACHA.has(correccion.tipo),
  };
}

/** El PDF de la vista previa (marca BORRADOR, sin número), con o sin la corrección. No se guarda. */
export async function pdfVistaPrevia(db: Db, conversacionId: string, id: string, pedida: CorreccionPedida | null): Promise<{ pdf: Buffer; nombre: string }> {
  const f = await filaDePrecio(db, id, conversacionId);
  const correccion = correccionDe(pedida);
  if (correccion) {
    const invalida = validarCorreccion(correccion);
    if (invalida) throw new ErrorTarjeta(invalida, 400);
  }
  const ctx = await contexto(db);
  const { datos, resultado } = calcular(f, ctx, correccion);
  const a = asignacionDe(f);
  const propuesta = await datosPropuestaDe(db, { datos, resultado, odoo_venta_nombre: null }, { tarifas: ctx.tarifas, vendedorEnPropuesta: a?.asistente ?? "Andamios Buenos Aires" });
  return { pdf: await generarPdfPropuesta(propuesta), nombre: `Vista previa #${f.numero}.pdf` };
}

// ── Odoo: la pareja ─────────────────────────────────────────────────────────────────────

const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

/** El registro de Odoo de una persona por su nombre de pila («Jorge» → «RIVEROS, Jorge»). null si no hay uno solo. */
async function idOdooPorNombre(modelo: "hr.employee" | "res.users", nombre: string | null): Promise<{ id: number; nombre: string } | null> {
  if (!nombre?.trim()) return null;
  const pila = nombre.trim().split(/\s+/)[0];
  const formas = [...new Set([pila, sinTildes(pila)])];
  const dominio = formas.length === 2 ? ["|", ["name", "ilike", formas[0]], ["name", "ilike", formas[1]]] : [["name", "ilike", formas[0]]];
  const filas = await executeKw<{ id: number; name: string }[]>(modelo, "search_read", [dominio], { fields: ["id", "name"], limit: 20 }, { timeoutMs: 15_000 });
  const config = { parejas: [{ tecnico: nombre, asistente: "", recibeTurno: true }], asistenteSimple: "" };
  const iguales = filas.filter((f) => tecnicoDeOdoo(f.name, config));
  return iguales.length === 1 ? { id: iguales[0].id, nombre: iguales[0].name } : null;
}

async function idsDePareja(p: { tecnico: string | null; asistente: string | null }) {
  const [tecnico, asistente] = await Promise.all([
    idOdooPorNombre("hr.employee", p.tecnico).catch(() => null),
    idOdooPorNombre("res.users", p.asistente).catch(() => null),
  ]);
  return { tecnico, asistente };
}

// ── Después de decidir: la charla ───────────────────────────────────────────────────────

async function despuesDeDecidir(db: Db, conversacionId: string, destino: Despues, quien: Quien): Promise<string> {
  const { count } = await db
    .from("cli_aprobaciones")
    .select("id", { count: "exact", head: true })
    .eq("conversacion_id", conversacionId)
    .eq("estado", "pendiente");
  const charla = await leerCharlaAprobacion(db, conversacionId);
  if (charla.estado === "cerrada") return "";
  if ((count ?? 0) > 0) return " Quedan otras cosas esperando tu OK en esta charla.";
  // Si la tomó otra persona mientras esperaba, no se le saca.
  if (charla.estado === "humano" && charla.asistente_id && charla.asistente_id !== quien.id) return "";
  const ahora = ahoraIso();
  if (destino === "sofia") {
    await db.from("cli_conversaciones")
      .update({ estado: "bot", asistente_id: null, tomada_at: null, motivo: null, updated_at: ahora })
      .eq("id", conversacionId)
      .neq("estado", "cerrada");
    return " La charla vuelve a Tomás.";
  }
  await db.from("cli_conversaciones")
    .update({ estado: "humano", asistente_id: quien.id, tomada_at: ahora, motivo: null, updated_at: ahora })
    .eq("id", conversacionId)
    .neq("estado", "cerrada");
  return ` La charla queda con ${quien.nombre}.`;
}

// ── Aprobar un precio ───────────────────────────────────────────────────────────────────

export type PedidoAprobar = {
  /** El neto que mostraba la tarjeta (o la corrección) cuando se tocó Aprobar. */
  montoVisto: number;
  correccion?: CorreccionPedida | null;
  /** Con menos de 2 h de ventana, la tarjeta pregunta y vuelve con esto en true. */
  confirmarVentana?: boolean;
  despues?: Despues | null;
  /** La corrección de un alquiler simple (carril «alquiler»). */
  correccionAlquiler?: CorreccionAlquilerPedida | null;
};

export async function aprobarPrecio(db: Db, conversacionId: string, id: string, quien: Quien, p: PedidoAprobar, iaActiva: boolean): Promise<ResultadoDecision> {
  const fila = await filaDeLaCharla(db, id, conversacionId);
  if (fila.tipo === "precio" && fila.carril === CARRIL_ALQUILER) return aprobarAlquiler(db, fila, quien, p, iaActiva);
  const f = await filaDePrecio(db, id, conversacionId);
  if (f.estado !== "pendiente") {
    return { ok: false, codigo: "ya_decidida", error: motivoYaDecidida(f.estado, await nombreDe(db)(f.decidido_por), f.tipo) };
  }
  const correccion = correccionDe(p.correccion);
  if (correccion) {
    const invalida = validarCorreccion(correccion);
    if (invalida) return { ok: false, codigo: "bloqueo", error: invalida };
  }
  const [charla, ctx] = await Promise.all([leerCharlaAprobacion(db, conversacionId), contexto(db)]);

  // 1. Recalcular con el motor de hoy.
  const { datos, resultado } = calcular(f, ctx, correccion);
  const bloqueos = bloqueosDelCalculo(resultado);
  if (bloqueos.length) return { ok: false, codigo: "bloqueo", error: `No se puede mandar así: ${bloqueos.join(" · ")}` };
  const v = verificarRecalculo(p.montoVisto, resultado.totales.subtotal);
  if (!v.ok) return { ok: false, codigo: "cambio_monto", error: v.texto, antes: v.antes, despues: v.despues };

  // 2. La ventana: con menos de 2 h, se pregunta antes.
  const ventana = avisoVentana(charla.ultimo_entrante_at);
  if (ventana.nivel === "por_vencer" && !p.confirmarVentana) return { ok: false, codigo: "ventana_por_vencer", error: ventana.texto };

  // 3. Una sola vez.
  const texto = mensajePara(f, charla, ctx, datos, resultado, correccion);
  const despues = destinoDespues({ tipo: "precio", accion: "aprobar", iaActiva, propuesta: f.payload.despues, elegido: p.despues });
  const envio: Envio = { datos, resultado, texto, despues, correccion };
  const toma = await tomarUnaVez(repoUnaVez(db), id, "aprobar", {
    estado: "ejecutando",
    decidido_por: quien.id,
    decidido_at: ahoraIso(),
    monto_enviado: resultado.totales.subtotal,
    correccion_tipo: correccion?.tipo ?? null,
    motivo_correccion: correccion?.motivo.trim() ?? null,
    error: null,
    payload: { ...f.payload, envio },
  }, nombreDe(db));
  if (!toma.ok) return { ok: false, codigo: "ya_decidida", error: toma.motivo };
  const eventoDecision = correccion
    ? `${quien.nombre} corrigió ${correccion.tipo === "texto" ? "el texto" : correccion.tipo} de la cotización #${f.numero} (${correccion.motivo.trim()}) y la aprobó: ${pesoCorto(resultado.totales.subtotal)} + IVA.`
    : `${quien.nombre} aprobó la cotización #${f.numero} sin cambios.`;
  await anotarEvento(db, conversacionId, `${eventoDecision} Guardando en Odoo…`);
  return ejecutarPrecio(db, toma.fila, quien, ctx);
}

const pesoCorto = (n: number) => `$ ${Math.round(n).toLocaleString("es-AR")}`;

/** Reintentar lo que falló, o mandar la «falta la plantilla» cuando la ventana se abrió. */
export async function reintentarPrecio(db: Db, conversacionId: string, id: string, quien: Quien): Promise<ResultadoDecision> {
  const fila = await filaDeLaCharla(db, id, conversacionId);
  const f = fila.tipo === "precio" && fila.carril === CARRIL_ALQUILER ? fila : await filaDePrecio(db, id, conversacionId);
  if (f.estado === "falta_plantilla") {
    const charla = await leerCharlaAprobacion(db, conversacionId);
    if (modoEnvio(charla.ultimo_entrante_at) !== "libre") {
      return { ok: false, codigo: "ventana_cerrada", error: "La ventana de 24 h sigue cerrada: sale cuando el cliente vuelva a escribir (o cuando esté la plantilla de Meta)." };
    }
  }
  const toma = await tomarUnaVez(repoUnaVez(db), id, "reintentar", { estado: "ejecutando", error: null }, nombreDe(db));
  if (!toma.ok) return { ok: false, codigo: "ya_decidida", error: toma.motivo };
  await anotarEvento(db, conversacionId, `${quien.nombre} ${f.estado === "falta_plantilla" ? "mandó" : "reintentó"} la cotización #${f.numero}.`);
  if (f.carril === CARRIL_ALQUILER) return ejecutarAlquiler(db, toma.fila, quien);
  return ejecutarPrecio(db, toma.fila, quien, await contexto(db));
}

type Guardado = { venta: string; ventaId: number; pdfPath: string; pdfNombre: string; partnerId: number | null; avisos: string[] };

/** Odoo (con el guardado del asistente comercial), el PDF y WhatsApp, con lo que dejó el OK. */
async function ejecutarPrecio(db: Db, f: Fila, quien: Quien, ctx: Contexto): Promise<ResultadoDecision> {
  const envio = f.payload.envio as Envio | undefined;
  if (!envio) {
    await actualizar(db, f.id, { estado: "error", error: "Falta lo que se aprobó: volvé a aprobarla." });
    return { ok: false, codigo: "error", error: "Falta lo que se aprobó." };
  }
  const pasos: Record<string, unknown> = { ...(f.pasos ?? {}) };
  const charla = await leerCharlaAprobacion(db, f.conversacion_id);
  const a = asignacionDe(f);
  const avisos: string[] = [];

  // ── 4. Primero Odoo (y el PDF final adjunto a la orden) ──
  let guardado = pasos.guardado as Guardado | undefined;
  if (!guardado) {
    try {
      guardado = await guardarEnOdoo(db, f, charla, envio, quien, ctx, a, pasos);
      pasos.guardado = guardado;
      await actualizar(db, f.id, { pasos, odoo_venta_id: guardado.ventaId, odoo_venta_nombre: guardado.venta });
      await anotarEvento(db, f.conversacion_id, `Guardado en Odoo: ${guardado.venta}${guardado.avisos.length ? ` (${guardado.avisos.join(" · ")})` : ""}.`);
    } catch (e) {
      const mensaje = e instanceof Error ? e.message : String(e);
      const hechos = (e as { pasos?: Record<string, unknown> }).pasos;
      await actualizar(db, f.id, { estado: "error", error: `Odoo: ${mensaje}`.slice(0, 1000), pasos: { ...pasos, odoo: hechos ?? pasos.odoo ?? {} } });
      await anotarEvento(db, f.conversacion_id, `No se pudo guardar la cotización #${f.numero} en Odoo: al cliente no le llegó nada. Reintentalo desde la tarjeta.`);
      return { ok: false, codigo: "error", error: `No se guardó en Odoo y no se le mandó nada al cliente: ${mensaje}` };
    }
  }
  avisos.push(...guardado.avisos);

  // La pareja va con el precio (§5: en la bandeja fácil, Aprobar confirma precio y pareja juntos).
  const cambiosCharla: Record<string, unknown> = { updated_at: ahoraIso() };
  if (guardado.partnerId) cambiosCharla.partner_id = guardado.partnerId;
  if (a?.tecnico || a?.asistente) {
    cambiosCharla.pareja_tecnico = a.tecnico;
    cambiosCharla.pareja_asistente = a.asistente;
    const ids = pasos.idsPareja as { tecnico: { id: number } | null } | undefined;
    if (ids?.tecnico?.id) cambiosCharla.tecnico_employee_id = ids.tecnico.id;
  }
  const { error: eCharla } = await db.from("cli_conversaciones").update(cambiosCharla).eq("id", f.conversacion_id);
  if (eCharla) {
    // Sin la migración de la pareja, sólo el partner.
    await db.from("cli_conversaciones").update({ ...(guardado.partnerId ? { partner_id: guardado.partnerId } : {}), updated_at: ahoraIso() }).eq("id", f.conversacion_id);
  }

  // ── 6. WhatsApp ──
  const final: EstadoAprobacion = f.correccion_tipo ? "corregida" : "aprobada";
  const turno = a?.regla === "turno" && a.tecnico ? a.tecnico : null;
  if (modoEnvio(charla.ultimo_entrante_at) !== "libre") {
    await actualizar(db, f.id, { estado: "falta_plantilla", pasos, error: null, texto_enviado: null, turno_tecnico: turno, resultado: { venta: guardado.venta, avisos } });
    await anotarEvento(db, f.conversacion_id, `Cotización #${f.numero} en Odoo (${guardado.venta}), pero la ventana de 24 h está cerrada: no se le mandó al cliente. Queda «aprobada, falta la plantilla»: sale cuando el cliente vuelva a escribir.`);
    const sigue = await despuesDeDecidir(db, f.conversacion_id, "persona", quien);
    return { ok: true, estado: "falta_plantilla", venta: guardado.venta, avisos: [...avisos, `La ventana de 24 h está cerrada: quedó en Odoo y falta mandarla con la plantilla.${sigue}`] };
  }
  try {
    if (!pasos.textoEnviado) {
      await mandarTexto(db, f.conversacion_id, charla.telefono, envio.texto, { autor: "sistema" });
      pasos.textoEnviado = ahoraIso();
      await actualizar(db, f.id, { pasos });
    }
    if (!pasos.pdfEnviado) {
      await mandarArchivo(db, f.conversacion_id, charla.telefono, { path: guardado.pdfPath, mime: "application/pdf", nombre: guardado.pdfNombre }, null, { autor: "sistema" });
      pasos.pdfEnviado = ahoraIso();
    }
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : String(e);
    await actualizar(db, f.id, { estado: "error", error: `WhatsApp: ${mensaje}`.slice(0, 1000), pasos });
    await anotarEvento(db, f.conversacion_id, `La cotización #${f.numero} quedó en Odoo (${guardado.venta}), pero WhatsApp no la aceptó: ${mensaje}. Reintentalo desde la tarjeta.`);
    return { ok: false, codigo: "error", error: `Quedó en Odoo (${guardado.venta}), pero no salió por WhatsApp: ${mensaje}` };
  }

  // ── 7. Lo que queda: quién, cuándo, cuánto y la racha ──
  await actualizar(db, f.id, { estado: final, pasos, error: null, texto_enviado: envio.texto, turno_tecnico: turno, resultado: { venta: guardado.venta, avisos } });
  const r = await rachaActual(db);
  const corta = f.correccion_tipo && CORTAN_RACHA.has(f.correccion_tipo);
  const sigue = await despuesDeDecidir(db, f.conversacion_id, envio.despues, quien);
  await anotarEvento(db, f.conversacion_id, `Se le mandó la cotización #${f.numero} (${guardado.venta}) con el PDF · ${corta ? `racha vuelve a 0 de ${r.meta}` : textoRacha(r)}.${sigue}`);
  return { ok: true, estado: final, venta: guardado.venta, avisos };
}

async function guardarEnOdoo(db: Db, f: Fila, charla: Charla, envio: Envio, quien: Quien, ctx: Contexto, a: Asignacion | null, pasos: Record<string, unknown>): Promise<Guardado> {
  const { datos, resultado } = envio;
  const ficha = charla.ficha;
  const nombre = ficha.nombre?.trim() || charla.nombre_perfil?.trim() || null;
  if (!nombre) throw new Error("Falta a nombre de quién va el presupuesto.");

  // La pareja en Odoo: el técnico (hr.employee) y la asistente (res.users), por su nombre.
  const ids = (pasos.idsPareja as Awaited<ReturnType<typeof idsDePareja>> | undefined) ?? (await idsDePareja({ tecnico: a?.tecnico ?? null, asistente: a?.asistente ?? null }));
  pasos.idsPareja = ids;
  const avisos: string[] = [];
  if (a?.tecnico && !ids.tecnico) avisos.push(`no se encontró a ${a.tecnico} en los empleados de Odoo: la orden queda sin técnico`);
  if (a?.asistente && !ids.asistente) avisos.push(`no se encontró a ${a.asistente} en los usuarios de Odoo: la orden queda sin vendedora`);

  // El borrador del asistente comercial para esta aprobación (uno solo: su id es la marca de la orden).
  const d: DatosBorrador = {
    ...datos,
    cliente: { ...datos.cliente, razonSocial: nombre, contacto: nombre, celular: charla.telefono, cuit: ficha.cuit ?? datos.cliente.cuit ?? null, email: ficha.mail ?? datos.cliente.email ?? null },
    notasInternas: [
      datos.notasInternas,
      `Aprobado por ${quien.nombre} en la bandeja de WhatsApp de clientes (cotización #${f.numero}).`,
      f.correccion_tipo ? `Corrección (${f.correccion_tipo}): ${f.motivo_correccion ?? ""}` : null,
    ].filter(Boolean).join(" "),
  };
  let borradorId = f.borrador_id;
  if (!borradorId) {
    const b = await crearBorrador(db, null, quien.id, d);
    borradorId = b.id;
    await db.from("cotizacion_borradores").update({ resultado }).eq("id", b.id);
    await actualizar(db, f.id, { borrador_id: b.id });
  } else {
    await db.from("cotizacion_borradores").update({ datos: d, resultado }).eq("id", borradorId).is("odoo_venta_id", null);
  }

  // Las líneas: SÓLO LA BASE (regla de la skill y del asistente comercial).
  const productos = await leerProductos(db);
  const porClave = new Map(productos.map((p) => [p.clave, p]));
  const lineas: PayloadGuardar["orden"]["lineas"] = [];
  for (const l of resultado.lineas.filter((x) => x.seccion === "base")) {
    const p = porClave.get(l.producto);
    const producto = l.productoOdoo ?? (p && p.activo && p.verificado_ok !== false ? productoDeLinea(l, productos) : null);
    if (!producto) throw new Error(`La línea «${l.descripcion}» usa el producto ${l.producto}, que no está disponible en Odoo (Parámetros → Productos de Odoo).`);
    lineas.push({ productId: producto.id, descripcion: l.descripcion, cantidad: l.cantidad, precioUnitario: l.precioUnitario, descuentoPct: l.descuentoPct, isRental: producto.alquiler });
  }
  const valor = (clave: string, def: number) => ctx.parametros.find((x) => x.clave === clave)?.valor ?? def;
  const validez = new Date(`${ctx.hoy}T12:00:00Z`);
  validez.setUTCDate(validez.getUTCDate() + ctx.tarifas.validezDias);

  // Sin CUIT se guarda igual (JS, 12/10): la nota lo avisa y se completa en Odoo antes de facturar.
  const payload: PayloadGuardar = {
    borradorId,
    crearCliente: { razonSocial: nombre, cuit: d.cliente.cuit?.trim() || null, email: d.cliente.email, telefono: charla.telefono, domicilio: null, enCaba: d.obra.enCaba ?? true, contacto: nombre, condicionIva: null },
    partnerId: null,
    clienteNombre: nombre,
    orden: {
      vendedorUserId: ids.asistente?.id ?? null,
      tecnicoEmployeeId: ids.tecnico?.id ?? null,
      validez: validez.toISOString().slice(0, 10),
      contrato: d.contrato ?? "Obra ",
      referencia: d.referencia,
      direccionObra: d.obra.direccion,
      lineas,
      trabajo: camposTrabajo(d),
      alcanceTecnico: alcanceTecnico(d),
      impuestoIvaId: valor("odoo_impuesto_iva_id", 88),
      terminoPagoId: valor("odoo_termino_pago_id", 11),
    },
    subtotalMotor: resultado.totales.subtotal,
    cancelarVentaId: null,
    cancelarVentaNombre: null,
    notaHtml: notaHtml(d, resultado),
  };
  if (!payload.crearCliente!.cuit) avisos.push("cliente sin CUIT: completarlo en Odoo antes de facturar");

  // El guardado del asistente comercial, con una «acción» armada para esta aprobación. Sus pasos
  // (cliente, orden, oportunidad, nota, PDF) se guardan: un reintento saltea lo ya hecho.
  const odooPasos = (pasos.odoo as Record<string, unknown> | undefined) ?? {};
  const accion: Accion = {
    id: f.id, numero: Number(f.numero), conversacion_id: f.conversacion_id, usuario_id: quien.id, borrador_id: borradorId, borrador_version: null,
    tipo: "guardar_presupuesto", nivel: "simple", estado: "ejecutando", payload: payload as unknown as Record<string, unknown>, resumen: f.resumen ?? "",
    resumen_voz: null, turno_id: null, tool_use_id: null, vence_at: ahoraIso(), confirmada_via: "boton", pasos: odooPasos, resultado: null, error: null,
    created_at: f.created_at,
  };
  const ejecutor = crearEjecutor({
    db, tarifas: ctx.tarifas, usuarioId: quien.id, vendedorEnPropuesta: ids.asistente?.nombre ?? a?.asistente ?? "Andamios Buenos Aires",
    vendedorNombre: `${quien.nombre} (bandeja de WhatsApp de clientes, cotización de Tomás #${f.numero})`,
  });
  const r = await ejecutor(accion);
  pasos.odoo = r.pasos;
  const pdf = r.resultado.pdf as { id: string; nombre: string };
  const { data: filaPdf, error } = await db.from("cotizacion_pdfs").select("storage_path, nombre").eq("id", pdf.id).single();
  if (error || !filaPdf) throw new Error(`No se encontró el PDF final: ${error?.message ?? "sin detalle"}`);
  const borrador = await leerBorrador(db, borradorId);
  return {
    venta: String(r.resultado.venta),
    ventaId: Number(r.resultado.ventaId),
    pdfPath: filaPdf.storage_path as string,
    pdfNombre: filaPdf.nombre as string,
    partnerId: borrador?.datos.cliente.partnerId ?? (typeof r.pasos.partnerId === "number" ? r.pasos.partnerId : null),
    avisos: [...avisos, ...((r.resultado.avisos as string[] | undefined) ?? [])],
  };
}

// ── El alquiler simple (carril «alquiler») ──────────────────────────────────────────────

/**
 * La vendedora de TODAS las órdenes de alquiler simple de Tomás: Tamara (res.users 73).
 *
 * DECISIÓN de JS (12/11, fila 18 de la §11 de la propuesta): van siempre a su nombre, no a la
 * pareja del turno. Es la que lleva los simples (92 de las 117 órdenes «Simple» desde mayo) y la
 * que las confirma. La pareja que propone la asignación sigue en la tarjeta y en la charla (el
 * técnico), pero no es la vendedora de la orden ni de la oportunidad.
 */
export const VENDEDORA_ALQUILER_SIMPLE = { userId: 73, nombre: "Tamara" } as const;

type CtxAlquiler = { parametros: ParametrosAlquiler; fletes: Flete[] | null; feriados: string[]; hoy: string; ivaPct: number };
type ContextoAlquilerCargado = CtxAlquiler | { error: string };

let feriadosCache: { hasta: number; desde: string; fechas: string[] } | null = null;

/** Los feriados de los próximos 90 días (la entrega puede ser más adelante). 6 h de caché, como el turno. */
async function feriadosProximos(hoy: string): Promise<string[]> {
  if (feriadosCache && feriadosCache.hasta > Date.now() && feriadosCache.desde === hoy) return feriadosCache.fechas;
  const hasta = new Date(Date.parse(`${hoy}T12:00:00Z`) + 90 * 86_400_000).toISOString().slice(0, 10);
  const fechas = (await feriadosDelRango(hoy, hasta).catch(() => [])).map((f) => f.fecha);
  feriadosCache = { hasta: Date.now() + 6 * 3_600_000, desde: hoy, fechas };
  return fechas;
}

/**
 * Los parámetros del alquiler (Parámetros: precio por pieza, ruedas, mínimo, tope, recargo), los
 * fletes de hoy de Odoo y los feriados. Para MOSTRAR la tarjeta, un Odoo caído no la rompe (se
 * usa el flete guardado, con un aviso); para APROBAR, sí: el flete tiene que ser el de hoy.
 */
async function cargarContextoAlquiler(ctx: Contexto, o: { fletesObligatorios: boolean }): Promise<ContextoAlquilerCargado> {
  let parametros: ParametrosAlquiler;
  try {
    parametros = parametrosAlquilerDesdeFilas(ctx.parametros);
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  let fletes: Flete[] | null = null;
  try {
    fletes = await fletesAlquilerSimple();
  } catch (e) {
    if (o.fletesObligatorios) return { error: `No se pudo leer la lista de fletes de Odoo: ${e instanceof Error ? e.message : e}` };
  }
  return { parametros, fletes, feriados: await feriadosProximos(ctx.hoy), hoy: ctx.hoy, ivaPct: ctx.tarifas.ivaPct };
}

function contextoRecalculo(c: CtxAlquiler, charla: Charla): ContextoRecalculo {
  return {
    parametros: c.parametros, fletes: c.fletes, hoy: c.hoy, feriados: c.feriados, ahora: new Date(),
    ficha: { mensajesCliente: charla.ficha.mensajesCliente, banderas: charla.ficha.banderas, segmento: charla.ficha.segmento },
  };
}

const TIPO_LINEA: Record<string, TarjetaAlquiler["lineas"][number]["tipo"]> = { flete: "flete", minimo_operativo: "minimo", recargo_franja: "recargo" };

function tarjetaAlquiler(f: Fila, charla: Charla, c: CtxAlquiler, r: RecalculoAlquiler): TarjetaAlquiler {
  const a = r.resultado.armado;
  const pr = r.precio;
  const asig = asignacionDe(f);
  const montoPropuesto = num(f.monto_propuesto);
  const flete = r.resultado.flete;
  const iva = r.total !== null ? Math.round((r.total * c.ivaPct) / 100) : null;
  const alertas = ((f.payload.alertas as { texto?: string; palabra?: string }[] | undefined) ?? [])
    .filter((x) => x && typeof x.texto === "string")
    .map((x) => (x.palabra ? `${x.texto} («${x.palabra}»)` : String(x.texto)));
  return {
    mensaje: r.mensaje,
    deposito: r.resultado.modalidad === "deposito",
    vendedora: VENDEDORA_ALQUILER_SIMPLE.nombre,
    pedido: datosDelPedido(r.pedido),
    armado: a
      ? {
          texto: describirArmado(a), torres: a.torres, modulosPorTorre: a.modulosPorTorre, apoyo: a.apoyo, plataforma: textoPlataforma(a),
          peldano: a.peldano, noLlega: a.noLlega !== null, barandaSeLleva: a.barandaSeLleva, ajustes: a.ajustes,
        }
      : null,
    lineas: (pr?.lineas ?? []).map((l) => ({ descripcion: l.descripcion, cantidad: l.cantidad, precioUnitario: l.precioUnitario, importe: l.importe, tipo: TIPO_LINEA[l.codigo] ?? "pieza" })),
    flete: flete?.tipo === "lista" ? { barrio: flete.barrio, metodo: r.flete?.nombre ?? null, monto: flete.monto } : null,
    minimoOperativo: pr?.minimoOperativo ?? 0,
    recargo: pr && pr.recargoFranja > 0 && r.entrega ? { pct: pr.recargoFranjaPct, monto: pr.recargoFranja, franja: textoFranja(r.entrega.franja) } : null,
    base: pr?.base ?? null,
    neto: r.total,
    iva,
    totalConIva: r.total !== null && iva !== null ? r.total + iva : null,
    porDia: pr?.porDia ?? null,
    entrega: r.entrega ? { fecha: r.entrega.fecha, texto: textoFecha(r.entrega.fecha), franja: textoFranja(r.entrega.franja), hora: r.entrega.franja.tipo === "hora" } : null,
    direccion: typeof f.payload.direccion === "string" ? f.payload.direccion : null,
    motivos: motivosParaTarjeta(r.resultado),
    facil: r.resultado.facil,
    alertas,
    entraSinPagarMas: textoEntraSinPagarMas(r.resultado),
    bloqueos: r.bloqueos,
    avisos: r.avisos,
    montoPropuesto,
    cambioDesdeTomas: montoPropuesto !== null && r.total !== null && Math.abs(montoPropuesto - r.total) > 1,
    pareja: asig ? { tecnico: asig.tecnico, asistente: asig.asistente, motivo: asig.motivo, regla: asig.regla } : null,
    sinCuit: !charla.ficha.cuit,
  };
}

function correccionAlquilerDe(c: CorreccionAlquilerPedida | null | undefined): CorreccionAlquiler | null {
  if (!c) return null;
  return { tipo: c.tipo, motivo: c.motivo, total: c.total, modulosPorTorre: c.modulosPorTorre, torres: c.torres, fecha: c.fecha, franja: c.franja, texto: c.texto };
}

async function filaDeAlquiler(db: Db, id: string, conversacionId: string): Promise<Fila> {
  const f = await filaDeLaCharla(db, id, conversacionId);
  if (f.tipo !== "precio" || f.carril !== CARRIL_ALQUILER) throw new ErrorTarjeta("Esto sólo vale para un alquiler simple de Tomás.", 400);
  return f;
}

/** «Recalcular» al corregir un alquiler: la tarjeta entera con la corrección, antes de mandar. No escribe nada. */
export async function vistaCorreccionAlquiler(db: Db, conversacionId: string, id: string, pedida: CorreccionAlquilerPedida): Promise<VistaCorreccion> {
  const f = await filaDeAlquiler(db, id, conversacionId);
  const correccion = correccionAlquilerDe(pedida)!;
  const invalida = validarCorreccionAlquiler(correccion);
  if (invalida) throw new ErrorTarjeta(invalida, 400);
  const [charla, ctx] = await Promise.all([leerCharlaAprobacion(db, conversacionId), contexto(db)]);
  const ctxA = await cargarContextoAlquiler(ctx, { fletesObligatorios: false });
  if ("error" in ctxA) throw new ErrorTarjeta(ctxA.error, 409);
  const payload = leerPayloadAlquiler(f.payload);
  const cr = contextoRecalculo(ctxA, charla);
  const antes = recalcularAlquiler(payload, cr, null);
  const r = recalcularAlquiler(payload, cr, correccion);
  const t = tarjetaAlquiler(f, charla, ctxA, r);
  return {
    mensaje: r.mensaje ?? "",
    renglones: t.lineas.map((l, i) => ({ id: `${t.lineas[i].tipo}-${i}`, descripcion: `${l.cantidad} × ${l.descripcion}`, importe: l.importe, seccion: "base" })),
    neto: r.total ?? 0,
    total: t.totalConIva ?? 0,
    netoAntes: antes.total ?? 0,
    bloqueos: r.bloqueos,
    cortaRacha: CORTAN_RACHA.has(CORRECCION_EN_BASE[correccion.tipo]),
    alquiler: t,
  };
}

/** Lo que guarda el OK del alquiler para poder reintentar con exactamente lo mismo. */
type EnvioAlquiler = {
  cotizacion: NonNullable<RecalculoAlquiler["cotizacion"]>;
  texto: string;
  total: number;
  direccion: string | null;
  notaHtml: string;
  despues: Despues;
  correccion: CorreccionAlquiler | null;
  /**
   * La entrega que le llegó al cliente (con la corrección de fecha, si hubo). La lee Tomás
   * (agente.ts → ultimoPresupuestoAlquiler) para comparar la franja que acepta el cliente.
   */
  entrega: NonNullable<RecalculoAlquiler["entrega"]>;
};

async function aprobarAlquiler(db: Db, f: Fila, quien: Quien, p: PedidoAprobar, iaActiva: boolean): Promise<ResultadoDecision> {
  if (f.estado !== "pendiente") {
    return { ok: false, codigo: "ya_decidida", error: motivoYaDecidida(f.estado, await nombreDe(db)(f.decidido_por), f.tipo) };
  }
  const correccion = correccionAlquilerDe(p.correccionAlquiler);
  if (correccion) {
    const invalida = validarCorreccionAlquiler(correccion);
    if (invalida) return { ok: false, codigo: "bloqueo", error: invalida };
  }
  const [charla, ctx] = await Promise.all([leerCharlaAprobacion(db, f.conversacion_id), contexto(db)]);
  const ctxA = await cargarContextoAlquiler(ctx, { fletesObligatorios: true });
  if ("error" in ctxA) return { ok: false, codigo: "error", error: `No se mandó nada: ${ctxA.error}` };
  let payload: PayloadAlquiler;
  try {
    payload = leerPayloadAlquiler(f.payload);
  } catch (e) {
    return { ok: false, codigo: "bloqueo", error: e instanceof Error ? e.message : String(e) };
  }

  // 1. Recalcular con los parámetros, el flete y la fecha de hoy.
  const r = recalcularAlquiler(payload, contextoRecalculo(ctxA, charla), correccion);
  if (r.bloqueos.length) return { ok: false, codigo: "bloqueo", error: `No se puede mandar así: ${r.bloqueos.join(" · ")}` };
  if (r.total === null || !r.mensaje || !r.cotizacion || !r.entrega) return { ok: false, codigo: "bloqueo", error: "No se pudo armar el presupuesto: volvé a mirar la tarjeta." };
  const v = verificarRecalculo(p.montoVisto, r.total);
  if (!v.ok) return { ok: false, codigo: "cambio_monto", error: v.texto, antes: v.antes, despues: v.despues };

  // 2. La ventana: con menos de 2 h, se pregunta antes.
  const ventana = avisoVentana(charla.ultimo_entrante_at);
  if (ventana.nivel === "por_vencer" && !p.confirmarVentana) return { ok: false, codigo: "ventana_por_vencer", error: ventana.texto };

  // 3. Una sola vez.
  const despues = destinoDespues({ tipo: "precio", accion: "aprobar", iaActiva, propuesta: f.payload.despues, elegido: p.despues });
  const envio: EnvioAlquiler = {
    cotizacion: r.cotizacion,
    texto: r.mensaje,
    total: r.total,
    direccion: payload.direccion,
    notaHtml: notaInternaAlquiler({
      numero: Number(f.numero), aprobo: quien.nombre, correccion: correccion ? { tipo: correccion.tipo, motivo: correccion.motivo } : null, r,
      direccion: payload.direccion, sinCuit: !charla.ficha.cuit?.trim(), avisos: r.avisos,
    }),
    despues,
    correccion,
    entrega: r.entrega,
  };
  const toma = await tomarUnaVez(repoUnaVez(db), f.id, "aprobar", {
    estado: "ejecutando",
    decidido_por: quien.id,
    decidido_at: ahoraIso(),
    monto_enviado: r.total,
    correccion_tipo: correccion ? CORRECCION_EN_BASE[correccion.tipo] : null,
    motivo_correccion: correccion ? `${etiquetaCorreccion(correccion.tipo)}: ${correccion.motivo.trim()}` : null,
    error: null,
    payload: { ...f.payload, envioAlquiler: envio },
  }, nombreDe(db));
  if (!toma.ok) return { ok: false, codigo: "ya_decidida", error: toma.motivo };
  const eventoDecision = correccion
    ? `${quien.nombre} corrigió ${etiquetaCorreccion(correccion.tipo).toLowerCase()} del alquiler #${f.numero} (${correccion.motivo.trim()}) y lo aprobó: ${pesoCorto(r.total)} + IVA.`
    : `${quien.nombre} aprobó el alquiler #${f.numero} sin cambios: ${pesoCorto(r.total)} + IVA.`;
  await anotarEvento(db, f.conversacion_id, `${eventoDecision} Guardando en Odoo…`);
  return ejecutarAlquiler(db, toma.fila, quien);
}

const ETIQUETA_CORRECCION: Record<TipoCorreccionAlquiler, string> = { precio: "El total", piezas: "Las cantidades", fecha: "La fecha", texto: "El texto" };
const etiquetaCorreccion = (t: TipoCorreccionAlquiler) => ETIQUETA_CORRECCION[t] ?? t;

type OrdenAlquiler = { id: number; nombre: string };

/** Odoo (cliente, orden en borrador, nota, oportunidad) y WhatsApp (el texto), con lo que dejó el OK. */
async function ejecutarAlquiler(db: Db, f: Fila, quien: Quien): Promise<ResultadoDecision> {
  const envio = f.payload.envioAlquiler as EnvioAlquiler | undefined;
  if (!envio) {
    await actualizar(db, f.id, { estado: "error", error: "Falta lo que se aprobó: volvé a aprobarlo." });
    return { ok: false, codigo: "error", error: "Falta lo que se aprobó." };
  }
  const pasos: Record<string, unknown> = { ...(f.pasos ?? {}) };
  const charla = await leerCharlaAprobacion(db, f.conversacion_id);
  const a = asignacionDe(f);

  // ── 4. Primero Odoo ──
  let orden = pasos.ordenAlquiler as OrdenAlquiler | undefined;
  if (!orden) {
    try {
      const g = await guardarAlquilerEnOdoo(db, f, charla, envio, a, pasos);
      orden = { id: g.id, nombre: g.nombre };
      pasos.ordenAlquiler = orden;
      pasos.avisosOdoo = g.avisos;
      await actualizar(db, f.id, { pasos, odoo_venta_id: orden.id, odoo_venta_nombre: orden.nombre });
      await anotarEvento(db, f.conversacion_id, `Guardado en Odoo: ${orden.nombre} (en borrador)${g.avisos.length ? ` (${g.avisos.join(" · ")})` : ""}.`);
    } catch (e) {
      const mensaje = e instanceof Error ? e.message : String(e);
      await actualizar(db, f.id, { estado: "error", error: `Odoo: ${mensaje}`.slice(0, 1000), pasos });
      await anotarEvento(db, f.conversacion_id, `No se pudo guardar el alquiler #${f.numero} en Odoo: al cliente no le llegó nada. Reintentalo desde la tarjeta.`);
      return { ok: false, codigo: "error", error: `No se guardó en Odoo y no se le mandó nada al cliente: ${mensaje}` };
    }
  }
  const avisos = [...((pasos.avisosOdoo as string[] | undefined) ?? [])];

  // La pareja va con el precio, como en la bandeja fácil.
  const cambiosCharla: Record<string, unknown> = { updated_at: ahoraIso() };
  if (typeof pasos.partnerId === "number") cambiosCharla.partner_id = pasos.partnerId;
  if (a?.tecnico || a?.asistente) {
    cambiosCharla.pareja_tecnico = a.tecnico;
    cambiosCharla.pareja_asistente = a.asistente;
    const ids = pasos.idsPareja as { tecnico: { id: number } | null } | undefined;
    if (ids?.tecnico?.id) cambiosCharla.tecnico_employee_id = ids.tecnico.id;
  }
  const { error: eCharla } = await db.from("cli_conversaciones").update(cambiosCharla).eq("id", f.conversacion_id);
  if (eCharla && typeof pasos.partnerId === "number") {
    await db.from("cli_conversaciones").update({ partner_id: pasos.partnerId, updated_at: ahoraIso() }).eq("id", f.conversacion_id);
  }

  // ── 6. WhatsApp: el texto del motor, sin PDF ──
  const final: EstadoAprobacion = f.correccion_tipo ? "corregida" : "aprobada";
  const turno = a?.regla === "turno" && a.tecnico ? a.tecnico : null;
  if (modoEnvio(charla.ultimo_entrante_at) !== "libre") {
    await actualizar(db, f.id, { estado: "falta_plantilla", pasos, error: null, texto_enviado: null, turno_tecnico: turno, resultado: { venta: orden.nombre, avisos } });
    await anotarEvento(db, f.conversacion_id, `Alquiler #${f.numero} en Odoo (${orden.nombre}), pero la ventana de 24 h está cerrada: no se le mandó al cliente. Queda «aprobado, falta la plantilla»: sale cuando el cliente vuelva a escribir.`);
    const sigue = await despuesDeDecidir(db, f.conversacion_id, "persona", quien);
    return { ok: true, estado: "falta_plantilla", venta: orden.nombre, avisos: [...avisos, `La ventana de 24 h está cerrada: quedó en Odoo y falta mandarlo con la plantilla.${sigue}`] };
  }
  try {
    if (!pasos.textoEnviado) {
      await mandarTexto(db, f.conversacion_id, charla.telefono, envio.texto, { autor: "sistema" });
      pasos.textoEnviado = ahoraIso();
    }
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : String(e);
    await actualizar(db, f.id, { estado: "error", error: `WhatsApp: ${mensaje}`.slice(0, 1000), pasos });
    await anotarEvento(db, f.conversacion_id, `El alquiler #${f.numero} quedó en Odoo (${orden.nombre}), pero WhatsApp no lo aceptó: ${mensaje}. Reintentalo desde la tarjeta.`);
    return { ok: false, codigo: "error", error: `Quedó en Odoo (${orden.nombre}), pero no salió por WhatsApp: ${mensaje}` };
  }

  // ── 7. Lo que queda: quién, cuándo, cuánto y la racha del alquiler ──
  await actualizar(db, f.id, { estado: final, pasos, error: null, texto_enviado: envio.texto, turno_tecnico: turno, resultado: { venta: orden.nombre, avisos } });
  const r = await rachaActual(db, CARRIL_ALQUILER);
  const corta = f.correccion_tipo && CORTAN_RACHA.has(f.correccion_tipo);
  const sigue = await despuesDeDecidir(db, f.conversacion_id, envio.despues, quien);
  await anotarEvento(db, f.conversacion_id, `Se le mandó el presupuesto del alquiler #${f.numero} (${orden.nombre}) · alquiler: ${corta ? `racha vuelve a 0 de ${r.meta}` : textoRacha(r)}.${sigue}`);
  return { ok: true, estado: final, venta: orden.nombre, avisos };
}

/**
 * El cliente y la orden EN BORRADOR. El cliente: el que encontró el servidor en Odoo (ficha o
 * charla); si no, el alta del asistente comercial (crearCliente: por CUIT, o por el nombre
 * exacto; si no está, lo crea, con CUIT o sin CUIT con el aviso en la nota, regla del 12/10).
 * La orden es idempotente por la marca: un reintento la encuentra y, si sigue en borrador, la
 * reescribe. La oportunidad del CRM, como en el asistente: si falla, es un aviso.
 */
async function guardarAlquilerEnOdoo(
  db: Db, f: Fila, charla: Charla, envio: EnvioAlquiler, a: Asignacion | null, pasos: Record<string, unknown>,
): Promise<OrdenAlquiler & { avisos: string[] }> {
  const ficha = charla.ficha;
  const nombre = ficha.nombre?.trim() || charla.nombre_perfil?.trim() || null;
  if (!nombre) throw new Error("Falta a nombre de quién va el presupuesto.");
  const avisos: string[] = [];

  // El técnico de la pareja, para la oportunidad. La vendedora es siempre Tamara (VENDEDORA_ALQUILER_SIMPLE).
  const ids = (pasos.idsPareja as Awaited<ReturnType<typeof idsDePareja>> | undefined) ?? (await idsDePareja({ tecnico: a?.tecnico ?? null, asistente: null }));
  pasos.idsPareja = ids;

  let partnerId = (pasos.partnerId as number | undefined) ?? ficha.partnerId ?? charla.partner_id ?? null;
  if (!partnerId) {
    const c = await crearCliente({
      razonSocial: nombre, cuit: ficha.cuit?.trim() || null, email: ficha.mail ?? null, telefono: charla.telefono, domicilio: null,
      enCaba: ficha.enCaba ?? true, contacto: nombre, condicionIva: null,
    });
    partnerId = c.id;
    pasos.clienteCreado = c.creado;
  }
  pasos.partnerId = partnerId;
  if (!ficha.cuit?.trim()) avisos.push("cliente sin CUIT: completarlo en Odoo antes de facturar");

  const parametros = await leerParametros(db);
  const iva = parametros.find((x) => x.clave === "odoo_impuesto_iva_id")?.valor ?? 88;
  const o = await crearOrdenAlquilerSimple({
    marca: `tomas-alquiler:${f.id}`,
    partnerId,
    vendedorUserId: VENDEDORA_ALQUILER_SIMPLE.userId,
    cotizacion: envio.cotizacion,
    direccionEntrega: envio.direccion ?? "",
    enCaba: ficha.enCaba ?? true,
    origen: `${nombre.toUpperCase()} - SIMPLE`,
    hoy: hoyBA(),
    notaInterna: envio.notaHtml,
    impuestoIvaId: Number(iva),
  });
  avisos.push(...o.avisos);
  if (!envio.direccion && envio.cotizacion.flete) avisos.push("la orden quedó sin dirección de entrega");

  if (!pasos.oportunidadId) {
    try {
      const op = await vincularOportunidad({
        ordenId: o.id, ordenNombre: o.nombre, partnerId, cliente: nombre, direccionObra: envio.direccion, referencia: "Alquiler simple",
        neto: envio.total, vendedorUserId: VENDEDORA_ALQUILER_SIMPLE.userId, tecnicoEmployeeId: ids.tecnico?.id ?? null,
      });
      pasos.oportunidadId = op.id;
    } catch (e) {
      avisos.push(`no se pudo vincular la oportunidad del CRM: ${e instanceof Error ? e.message : e}`);
    }
  }
  return { id: o.id, nombre: o.nombre, avisos };
}

// ── Rechazar / Lo tomo yo ───────────────────────────────────────────────────────────────

export async function tomarYo(db: Db, conversacionId: string, id: string, quien: Quien, motivo: string | null): Promise<ResultadoDecision> {
  const f = await leerFila(db, id);
  if (!f || f.conversacion_id !== conversacionId) throw new ErrorTarjeta("Esa aprobación no es de esta charla.", 404);
  const estado: EstadoAprobacion = f.tipo === "texto_bloqueado" ? "descartada" : "tomada";
  const toma = await tomarUnaVez(repoUnaVez(db), id, "rechazar", {
    estado, decidido_por: quien.id, decidido_at: ahoraIso(), motivo_correccion: motivo?.trim() || null,
  }, nombreDe(db));
  if (!toma.ok) return { ok: false, codigo: "ya_decidida", error: toma.motivo };
  const que = f.tipo === "texto_bloqueado" ? "descartó lo que había escrito Tomás" : f.tipo === "tecnico" ? `tomó la asignación #${f.numero}` : `no mandó la cotización #${f.numero} y la tomó`;
  const sigue = await despuesDeDecidir(db, conversacionId, "persona", quien);
  await anotarEvento(db, conversacionId, `${quien.nombre} ${que}${motivo?.trim() ? ` (${motivo.trim()})` : ""}.${sigue}`);
  return { ok: true, estado, avisos: [] };
}

// ── Confirmar el técnico ────────────────────────────────────────────────────────────────

export type PedidoTecnico = {
  /** «Elegir otra»: otra pareja de PAREJAS_15_10 (o Tamara sola). Sin esto, la propuesta. */
  elegida?: { tecnico: string | null; asistente: string | null } | null;
  /** Mandarle al cliente el texto fijo con la asistente y su técnico. */
  avisar: boolean;
  despues?: Despues | null;
};

export async function confirmarTecnico(db: Db, conversacionId: string, id: string, quien: Quien, p: PedidoTecnico, iaActiva: boolean): Promise<ResultadoDecision> {
  const f = await leerFila(db, id);
  if (!f || f.conversacion_id !== conversacionId) throw new ErrorTarjeta("Esa aprobación no es de esta charla.", 404);
  if (f.tipo !== "tecnico" && f.tipo !== "traspaso") throw new ErrorTarjeta("Esto es para asignar un técnico.", 400);
  const a = asignacionDe(f);
  const validas = [...PAREJAS_15_10.parejas.map((x) => ({ tecnico: x.tecnico as string | null, asistente: x.asistente as string | null })), { tecnico: null, asistente: PAREJAS_15_10.asistenteSimple }];
  let pareja = { tecnico: a?.tecnico ?? null, asistente: a?.asistente ?? null };
  const otra = !!p.elegida && (p.elegida.tecnico !== pareja.tecnico || p.elegida.asistente !== pareja.asistente);
  if (p.elegida) {
    const ok = validas.find((x) => x.tecnico === p.elegida!.tecnico && x.asistente === p.elegida!.asistente);
    if (!ok) return { ok: false, codigo: "bloqueo", error: "Esa pareja no está en la lista." };
    pareja = ok;
  }
  if (!pareja.tecnico && !pareja.asistente) return { ok: false, codigo: "bloqueo", error: "No hay pareja propuesta: elegí una con «Elegir otra»." };
  // §3 y §5: a un cliente que ya es de una pareja (socios, ya es cliente) no se lo pasa a otra.
  if (otra && a && !a.requiereConfirmacion && (a.regla === "ya_es_cliente" || a.regla === "cuenta_socio")) {
    return { ok: false, codigo: "bloqueo", error: "Este cliente ya es de una pareja: no se lo pasa a otra. Si hace falta, hablalo con Joaquín." };
  }
  const charla = await leerCharlaAprobacion(db, conversacionId);
  // El turno avanza SÓLO al confirmar la propuesta del turno (no con «Elegir otra»).
  const turno = a?.regla === "turno" && !otra ? pareja.tecnico : null;
  const textoCliente = textoPareja({ ...pareja, trato: (charla.ficha.trato ?? null) as Trato });

  const toma = await tomarUnaVez(repoUnaVez(db), id, "aprobar", {
    estado: otra ? "corregida" : "aprobada",
    decidido_por: quien.id,
    decidido_at: ahoraIso(),
    correccion_tipo: otra ? "otro" : null,
    motivo_correccion: otra ? `Eligió otra pareja: ${[pareja.asistente, pareja.tecnico].filter(Boolean).join(" con ")} (proponía ${[a?.asistente, a?.tecnico].filter(Boolean).join(" con ") || "nadie"})` : null,
    turno_tecnico: turno,
    resultado: { pareja },
  }, nombreDe(db));
  if (!toma.ok) return { ok: false, codigo: "ya_decidida", error: toma.motivo };

  const avisos: string[] = [];
  const ids = await idsDePareja(pareja);
  const cambios: Record<string, unknown> = { pareja_tecnico: pareja.tecnico, pareja_asistente: pareja.asistente, updated_at: ahoraIso() };
  if (ids.tecnico) cambios.tecnico_employee_id = ids.tecnico.id;
  else if (pareja.tecnico) avisos.push(`No se encontró a ${pareja.tecnico} en los empleados de Odoo.`);
  const { error } = await db.from("cli_conversaciones").update(cambios).eq("id", conversacionId);
  if (error) avisos.push(`No se pudo guardar la pareja en la charla: ${error.message}`);

  let enviado: string | null = null;
  if (p.avisar && textoCliente) {
    if (modoEnvio(charla.ultimo_entrante_at) === "libre") {
      try {
        await mandarTexto(db, conversacionId, charla.telefono, textoCliente, { autor: "sistema" });
        enviado = textoCliente;
      } catch (e) {
        avisos.push(`No se le pudo avisar al cliente: ${e instanceof Error ? e.message : e}`);
      }
    } else {
      avisos.push("La ventana de 24 h está cerrada: no se le avisó al cliente quién lo atiende.");
    }
  }
  if (enviado) await actualizar(db, id, { texto_enviado: enviado });
  const destino = destinoDespues({ tipo: "tecnico", accion: "aprobar", iaActiva, propuesta: f.payload.despues, elegido: p.despues });
  const sigue = await despuesDeDecidir(db, conversacionId, destino, quien);
  const quienes = [pareja.asistente, pareja.tecnico].filter(Boolean).join(" con ");
  await anotarEvento(
    db, conversacionId,
    `${quien.nombre} ${otra ? "eligió otra pareja" : "confirmó la asignación"}: ${quienes}${turno ? " (turno)" : ""}.${enviado ? " Se le avisó al cliente." : ""}${avisos.length ? ` ${avisos.join(" ")}` : ""}${sigue}`,
  );
  return { ok: true, estado: otra ? "corregida" : "aprobada", avisos };
}

// ── Texto bloqueado ─────────────────────────────────────────────────────────────────────

export async function mandarBloqueadoEditado(db: Db, conversacionId: string, id: string, quien: Quien, texto: string, despuesElegido: Despues | null, iaActiva: boolean): Promise<ResultadoDecision> {
  const f = await leerFila(db, id);
  if (!f || f.conversacion_id !== conversacionId) throw new ErrorTarjeta("Esa aprobación no es de esta charla.", 404);
  if (f.tipo !== "texto_bloqueado") throw new ErrorTarjeta("Esto es para un texto bloqueado.", 400);
  const t = texto.trim();
  if (!t) return { ok: false, codigo: "bloqueo", error: "El mensaje está vacío." };
  const charla = await leerCharlaAprobacion(db, conversacionId);
  if (modoEnvio(charla.ultimo_entrante_at) !== "libre") {
    return { ok: false, codigo: "ventana_cerrada", error: "La ventana de 24 h está cerrada: WhatsApp no deja mandar texto libre. Cuando el cliente vuelva a escribir, se abre." };
  }
  const toma = await tomarUnaVez(repoUnaVez(db), id, "aprobar", { estado: "ejecutando", decidido_por: quien.id, decidido_at: ahoraIso() }, nombreDe(db));
  if (!toma.ok) return { ok: false, codigo: "ya_decidida", error: toma.motivo };
  try {
    // Lo escribió (o lo corrigió) una persona: sale con su nombre, como cualquier respuesta suya.
    await mandarTexto(db, conversacionId, charla.telefono, t, { autor: "persona", autorId: quien.id, autorNombre: quien.nombre });
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : String(e);
    // No salió: vuelve a pendiente para que se pueda intentar de nuevo.
    await actualizar(db, id, { estado: "pendiente", decidido_por: null, decidido_at: null, error: mensaje.slice(0, 500) });
    return { ok: false, codigo: "error", error: `No salió por WhatsApp: ${mensaje}` };
  }
  const cambiado = t !== (f.texto ?? "").trim();
  await actualizar(db, id, { estado: cambiado ? "corregida" : "aprobada", texto_enviado: t, correccion_tipo: cambiado ? "texto" : null, error: null });
  const destino = destinoDespues({ tipo: "texto_bloqueado", accion: "aprobar", iaActiva, propuesta: f.payload.despues, elegido: despuesElegido });
  const sigue = await despuesDeDecidir(db, conversacionId, destino, quien);
  await anotarEvento(db, conversacionId, `${quien.nombre} ${cambiado ? "corrigió y mandó" : "mandó"} lo que había bloqueado el filtro.${sigue}`);
  return { ok: true, estado: cambiado ? "corregida" : "aprobada", avisos: [] };
}

// ── Revisar charlas (el auditor, sólo admin) ────────────────────────────────────────────

export async function auditoria(db: Db): Promise<Auditoria> {
  const [r, rA, decs, hilo] = await Promise.all([
    rachaActual(db),
    rachaActual(db, CARRIL_ALQUILER),
    db
      .from("cli_aprobaciones")
      .select("id, numero, conversacion_id, tipo, carril, estado, resumen, monto_propuesto, monto_enviado, correccion_tipo, motivo_correccion, decidido_por, decidido_at, odoo_venta_nombre")
      .not("decidido_at", "is", null)
      .order("decidido_at", { ascending: false })
      .limit(200),
    db
      .from("cli_hilo")
      .select("conversacion_id, autor_id, texto, momento, direccion")
      .eq("autor", "persona")
      .order("momento", { ascending: false })
      .limit(1000),
  ]);
  if (decs.error) falla("No se pudieron leer las decisiones", decs.error);
  if (hilo.error) falla("No se pudo leer el hilo", hilo.error);
  type D = { id: string; numero: number; conversacion_id: string; tipo: TipoAprobacion; carril: string | null; estado: EstadoAprobacion; resumen: string | null; monto_propuesto: number | string | null; monto_enviado: number | string | null; correccion_tipo: TipoCorreccion | null; motivo_correccion: string | null; decidido_por: string | null; decidido_at: string | null; odoo_venta_nombre: string | null };
  type H = { conversacion_id: string; autor_id: string | null; texto: string | null; momento: string; direccion: string };
  const ds = (decs.data ?? []) as D[];
  const hs = (hilo.data ?? []) as H[];

  const porCharla = new Map<string, { personas: Set<string>; n: number; ultima: string; texto: string | null }>();
  for (const h of hs) {
    const c = porCharla.get(h.conversacion_id) ?? { personas: new Set<string>(), n: 0, ultima: h.momento, texto: h.texto };
    if (h.autor_id) c.personas.add(h.autor_id);
    c.n++;
    porCharla.set(h.conversacion_id, c);
  }
  const charlaIds = [...new Set([...ds.map((d) => d.conversacion_id), ...porCharla.keys()])];
  const [{ data: charlas }, nombres] = await Promise.all([
    charlaIds.length ? db.from("cli_conversaciones").select("id, telefono, nombre_perfil, estado, ficha").in("id", charlaIds) : Promise.resolve({ data: [] }),
    nombresDe(db, [...ds.map((d) => d.decidido_por), ...hs.map((h) => h.autor_id)]),
  ]);
  type C = { id: string; telefono: string; nombre_perfil: string | null; estado: string; ficha: { nombre?: string | null } | null };
  const porId = new Map(((charlas ?? []) as C[]).map((c) => [c.id, c]));
  const cliente = (id: string) => {
    const c = porId.get(id);
    return c ? c.ficha?.nombre || c.nombre_perfil || `+${c.telefono}` : "Charla";
  };

  const decisiones: DecisionAuditada[] = ds.map((d) => ({
    id: d.id, numero: Number(d.numero), conversacionId: d.conversacion_id, cliente: cliente(d.conversacion_id), tipo: d.tipo, carril: d.carril, estado: d.estado,
    resumen: d.resumen, propuesto: num(d.monto_propuesto), enviado: num(d.monto_enviado), correccionTipo: d.correccion_tipo ?? null,
    motivoCorreccion: d.motivo_correccion, decididoPor: d.decidido_por ? nombres.get(d.decidido_por) ?? "otra persona" : null, decididoAt: d.decidido_at,
    venta: d.odoo_venta_nombre ?? null,
  }));
  const intervenidas: CharlaIntervenida[] = [...porCharla.entries()]
    .map(([id, c]) => ({
      conversacionId: id, cliente: cliente(id), estado: porId.get(id)?.estado ?? "", personas: [...c.personas].map((p) => nombres.get(p) ?? "otra persona"),
      intervenciones: c.n, ultima: c.ultima, ultimoTexto: c.texto,
    }))
    .sort((a, b) => b.ultima.localeCompare(a.ultima));
  return { racha: r, rachaAlquiler: rA, decisiones, intervenidas };
}
