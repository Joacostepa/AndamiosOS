// Sofía en producción: arma lo de afuera del turno (turno.ts) con Supabase, Claude, Meta, el
// catastro de CABA y Odoo. SOLO server-side. Lo llaman el webhook (después de responderle a
// Meta) y «Devolver a Sofía».
//
// CON EL INTERRUPTOR EN 0 NO TOCA NADA NUEVO: `iaClientesActiva` lee una fila de Parámetros (si no
// está, es 0) y el resto sólo corre con 1. Así el código puede subir antes que las migraciones
// 20261017000001/2 sin cambiar nada de la etapa 0.

import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
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
import { leerFicha, type FichaSofia, type ServiciosSofia } from "./herramientas";
import { atenderCharla, type CharlaSofia, type DepsSofia, type FilaHistoria, type ItemNuevo, type RepoSofia, type ResultadoTurno } from "./turno";
import { enBuenosAires } from "./horario";
import { mandarNotaDeVoz, mandarTexto } from "./envio";
import { audioSaludo } from "./voz";
import { anotarEvento } from "./webhook";
import { nombresDe, ultimoEntrante } from "./bandeja";
import type { EstadoCharla } from "./vista";

export { iaClientesActiva } from "./interruptor";

const ahora = () => new Date().toISOString();
/** Si nunca vio la charla (una de la etapa 0 que se le devuelve), sólo lo último. */
const MAX_ITEMS_SIN_CURSOR = 30;
/** El cliente suele mandar dos o tres mensajes seguidos: se espera un poco antes de leer. */
const ESPERA_TANDA_MS = 2_500;

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

const NOMBRE_PENDIENTE: Record<string, string> = { facil: "cotización", simple: "pedido de alquiler", tecnico: "asignación" };
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

export function repoSofia(db: SupabaseClient): RepoSofia {
  return {
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
    async mandarSaludoVoz(id, telefono, perfil, momento) {
      await mandarNotaDeVoz(db, id, telefono, await audioSaludo(db, perfil, momento), { autor: "ia" });
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
    repo: repoSofia(db),
    config: () => leerConfigSofia(db),
    feriados,
    servicios: (charla) => serviciosSofia(db, charla),
    modelo: (params, senal) => cliente.beta.messages.stream(params, { signal: senal }).finalMessage(),
    alFallar: async (e) => {
      const f = fallaDeCuenta(e);
      if (f) await avisarFallaDeCuenta(db, f);
    },
    esperarTanda: () => new Promise((r) => setTimeout(r, ESPERA_TANDA_MS)),
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
