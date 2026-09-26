// Acceso a la base del asistente. SOLO server-side, con service role: las rutas chequean el
// permiso antes (exigirModulo) y la historia es append-only por construcción (no hay políticas
// de escritura para usuarios).

import type { SupabaseClient } from "@supabase/supabase-js";
import type Anthropic from "@anthropic-ai/sdk";
import { executeKw } from "@/lib/odoo/client";
import { normalizarBorrador, type DatosBorrador, type ResultadoBorrador } from "./borrador";
import { recortarFragmento, type Tramo } from "./busqueda";
import { prolijo } from "./mensaje-cliente";

type Db = SupabaseClient;

export type Conversacion = {
  id: string;
  usuario_id: string;
  titulo: string | null;
  canal: "web" | "voz" | "whatsapp";
  estado: "activa" | "archivada";
  modelo: string;
  esfuerzo: string;
  system_snapshot: Anthropic.Beta.BetaTextBlockParam[];
  system_hash: string;
  criterio_version: number | null;
  parametros_version: number | null;
  borrador_id: string | null;
  ultimo_mensaje_at: string | null;
  created_at: string;
};

export type FilaMensaje = {
  id: number;
  seq: number;
  rol: "user" | "assistant" | "system";
  tipo: "humano" | "resultados" | "contexto" | "boton" | "asistente";
  contenido: Anthropic.Beta.BetaMessageParam["content"];
  texto: string | null;
  canal: string | null;
  turno_id: string | null;
  uso: Record<string, number> | null;
  modelo_servido: string | null;
  interrumpido: boolean;
  created_at: string;
};

export type Borrador = {
  id: string;
  conversacion_id: string | null;
  usuario_id: string;
  version: number;
  estado: "en_curso" | "en_odoo" | "enviado" | "descartado";
  datos: DatosBorrador;
  resultado: ResultadoBorrador | null;
  odoo_venta_id: number | null;
  odoo_venta_nombre: string | null;
  odoo_oportunidad_id: number | null;
  origen_venta_id: number | null;
  updated_at: string;
};

function falla(que: string, e: { message: string } | null): never {
  throw new Error(`${que}: ${e?.message ?? "sin detalle"}`);
}

// ── Conversaciones ──────────────────────────────────────────────────────────────────────

export async function leerConversacion(db: Db, id: string): Promise<Conversacion | null> {
  const { data, error } = await db.from("asistente_conversaciones").select("*").eq("id", id).maybeSingle();
  if (error) falla("No se pudo leer la conversación", error);
  return data as Conversacion | null;
}

export async function crearConversacion(
  db: Db,
  c: Omit<Conversacion, "id" | "created_at" | "ultimo_mensaje_at" | "borrador_id" | "estado" | "titulo"> & { titulo?: string | null },
): Promise<Conversacion> {
  const { data, error } = await db.from("asistente_conversaciones").insert({ ...c, estado: "activa" }).select("*").single();
  if (error) falla("No se pudo crear la conversación", error);
  const conv = data as Conversacion;
  const borrador = await crearBorrador(db, conv.id, conv.usuario_id);
  await db.from("asistente_conversaciones").update({ borrador_id: borrador.id }).eq("id", conv.id);
  return { ...conv, borrador_id: borrador.id };
}

export type ConversacionListada = {
  id: string;
  titulo: string | null;
  canal: string;
  ultimo_mensaje_at: string | null;
  created_at: string;
  venta: string | null;
  estadoBorrador: string | null;
  /** Del borrador, para reconocer la charla sin abrirla: el título es el primer mensaje. */
  cliente: string | null;
  obra: string | null;
  archivada: boolean;
  /** Nombre del dueño si no es de quien mira (un admin buscando en las de todos). */
  dueno: string | null;
  /** Sólo en la búsqueda: el pedacito del mensaje donde aparece lo buscado. */
  fragmento?: Tramo[] | null;
};

type FilaListada = Pick<Conversacion, "id" | "titulo" | "canal" | "estado" | "usuario_id" | "ultimo_mensaje_at" | "created_at" | "borrador_id">;
const COLUMNAS_LISTA = "id, titulo, canal, estado, usuario_id, ultimo_mensaje_at, created_at, borrador_id";

/** Suma a cada conversación el cliente, la obra y el número de Odoo de su borrador, y el dueño si es ajena. */
async function completarListado(db: Db, filas: FilaListada[], usuarioId: string): Promise<ConversacionListada[]> {
  const ids = filas.map((c) => c.borrador_id).filter((x): x is string => !!x);
  const ajenos = [...new Set(filas.map((c) => c.usuario_id).filter((u) => u !== usuarioId))];
  const [borradores, perfiles] = await Promise.all([
    ids.length
      ? db.from("cotizacion_borradores").select("id, odoo_venta_nombre, estado, cliente:datos->cliente->>razonSocial, obra:datos->obra->>direccion").in("id", ids)
      : Promise.resolve({ data: [] }),
    ajenos.length ? db.from("user_profiles").select("id, nombre, apellido").in("id", ajenos) : Promise.resolve({ data: [] }),
  ]);
  type B = { id: string; odoo_venta_nombre: string | null; estado: string; cliente: string | null; obra: string | null };
  const porId = new Map(((borradores.data ?? []) as B[]).map((b) => [b.id, b]));
  const nombres = new Map(((perfiles.data ?? []) as { id: string; nombre: string | null; apellido: string | null }[])
    .map((p) => [p.id, [p.nombre, p.apellido].filter(Boolean).join(" ") || "otra persona"]));
  return filas.map((c) => {
    const b = c.borrador_id ? porId.get(c.borrador_id) : undefined;
    return {
      id: c.id,
      titulo: c.titulo,
      canal: c.canal,
      ultimo_mensaje_at: c.ultimo_mensaje_at,
      created_at: c.created_at,
      venta: b?.odoo_venta_nombre ?? null,
      estadoBorrador: b?.estado ?? null,
      cliente: b?.cliente?.trim() ? prolijo(b.cliente) : null,
      obra: b?.obra?.trim() ? prolijo(b.obra) : null,
      archivada: c.estado === "archivada",
      dueno: c.usuario_id === usuarioId ? null : nombres.get(c.usuario_id) ?? "otra persona",
    };
  });
}

export async function listarConversaciones(db: Db, usuarioId: string, limite = 40): Promise<ConversacionListada[]> {
  const { data, error } = await db
    .from("asistente_conversaciones")
    .select(COLUMNAS_LISTA)
    .eq("usuario_id", usuarioId)
    .eq("estado", "activa")
    .order("ultimo_mensaje_at", { ascending: false, nullsFirst: false })
    .limit(limite);
  if (error) falla("No se pudieron leer las conversaciones", error);
  return completarListado(db, (data ?? []) as FilaListada[], usuarioId);
}

/**
 * Busca en las conversaciones (también las archivadas) por título, cliente, obra, número de
 * Odoo y texto de los mensajes (asistente_buscar). `todos`: las de todos, sólo para admins.
 */
export async function buscarConversaciones(db: Db, usuarioId: string, q: string, todos: boolean): Promise<ConversacionListada[]> {
  const { data: hallados, error } = await db.rpc("asistente_buscar", { p_usuario: usuarioId, p_q: q, p_todos: todos, p_limite: 30 });
  if (error) falla("No se pudo buscar", error);
  const orden = (hallados ?? []) as { id: string; fragmento: string | null }[];
  if (!orden.length) return [];
  const { data, error: e2 } = await db.from("asistente_conversaciones").select(COLUMNAS_LISTA).in("id", orden.map((h) => h.id));
  if (e2) falla("No se pudieron leer las conversaciones", e2);
  const porId = new Map((await completarListado(db, (data ?? []) as FilaListada[], usuarioId)).map((c) => [c.id, c]));
  return orden.flatMap((h) => {
    const c = porId.get(h.id);
    return c ? [{ ...c, fragmento: h.fragmento ? recortarFragmento(h.fragmento, q) : null }] : [];
  });
}

/** Archivar la saca de la lista; el buscador la sigue encontrando y se puede desarchivar. */
export async function archivarConversacion(db: Db, id: string, archivar: boolean): Promise<void> {
  const { error } = await db.from("asistente_conversaciones")
    .update({ estado: archivar ? "archivada" : "activa", updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) falla("No se pudo archivar la conversación", error);
}

/**
 * Borra de verdad SÓLO una conversación sin mensajes (y su borrador vacío). Las que tienen
 * mensajes se archivan: son el respaldo de lo que se guardó en Odoo y de ahí sale el gasto
 * del día (el tope) — borrarlas lo reiniciaría.
 */
export async function eliminarConversacionVacia(db: Db, conv: Conversacion): Promise<boolean> {
  const { count, error } = await db.from("asistente_mensajes").select("id", { count: "exact", head: true }).eq("conversacion_id", conv.id);
  if (error) falla("No se pudo revisar la conversación", error);
  if ((count ?? 0) > 0) return false;
  const b = conv.borrador_id ? await leerBorrador(db, conv.borrador_id) : null;
  if (b?.odoo_venta_id) return false;
  const { error: e1 } = await db.from("asistente_conversaciones").delete().eq("id", conv.id);
  if (e1) falla("No se pudo borrar la conversación", e1);
  if (b) await db.from("cotizacion_borradores").delete().eq("id", b.id);
  return true;
}

/** El candado de turno: una respuesta a la vez por conversación. */
export async function tomarTurno(db: Db, conversacionId: string): Promise<boolean> {
  const { data, error } = await db.rpc("asistente_tomar_turno", { p_conversacion: conversacionId });
  if (error) falla("No se pudo tomar el turno", error);
  return data === true;
}

export async function soltarTurno(db: Db, conversacionId: string): Promise<void> {
  await db.rpc("asistente_soltar_turno", { p_conversacion: conversacionId });
}

// ── Mensajes ────────────────────────────────────────────────────────────────────────────

export async function leerMensajes(db: Db, conversacionId: string): Promise<FilaMensaje[]> {
  const { data, error } = await db
    .from("asistente_mensajes")
    .select("id, seq, rol, tipo, contenido, texto, canal, turno_id, uso, modelo_servido, interrumpido, created_at")
    .eq("conversacion_id", conversacionId)
    .order("seq");
  if (error) falla("No se pudieron leer los mensajes", error);
  return (data ?? []) as FilaMensaje[];
}

export type NuevoMensaje = Omit<FilaMensaje, "id" | "seq" | "created_at" | "interrumpido"> & { interrumpido?: boolean };

/**
 * Agrega mensajes al final, en un solo INSERT (atómico): un tool_use y su tool_result se
 * guardan juntos o no se guarda ninguno, así la historia nunca queda con un pedido de
 * herramienta sin respuesta.
 */
export async function agregarMensajes(db: Db, conversacionId: string, siguienteSeq: number, mensajes: NuevoMensaje[]): Promise<number> {
  if (!mensajes.length) return siguienteSeq;
  const filas = mensajes.map((m, i) => ({ ...m, conversacion_id: conversacionId, seq: siguienteSeq + i, interrumpido: m.interrumpido ?? false }));
  const { error } = await db.from("asistente_mensajes").insert(filas);
  if (error) falla("No se pudo guardar la conversación", error);
  // Si se sigue una charla archivada (abierta desde el buscador), vuelve a la lista.
  await db.from("asistente_conversaciones").update({ ultimo_mensaje_at: new Date().toISOString(), estado: "activa" }).eq("id", conversacionId);
  return siguienteSeq + mensajes.length;
}

// ── Borradores ──────────────────────────────────────────────────────────────────────────

export async function crearBorrador(db: Db, conversacionId: string | null, usuarioId: string, datos?: DatosBorrador, origenVentaId?: number | null): Promise<Borrador> {
  const { data, error } = await db
    .from("cotizacion_borradores")
    .insert({ conversacion_id: conversacionId, usuario_id: usuarioId, datos: datos ?? normalizarBorrador({}), origen_venta_id: origenVentaId ?? null })
    .select("*")
    .single();
  if (error) falla("No se pudo crear el borrador", error);
  return { ...(data as Borrador), datos: normalizarBorrador((data as Borrador).datos) };
}

export async function leerBorrador(db: Db, id: string): Promise<Borrador | null> {
  const { data, error } = await db.from("cotizacion_borradores").select("*").eq("id", id).maybeSingle();
  if (error) falla("No se pudo leer el borrador", error);
  return data ? { ...(data as Borrador), datos: normalizarBorrador((data as Borrador).datos) } : null;
}

/**
 * Guarda una versión nueva del borrador. La versión sube SIEMPRE que cambian los datos: una
 * acción propuesta sobre la versión anterior queda vencida (nadie confirma algo distinto de
 * lo que se le leyó). Devuelve la versión nueva.
 */
export async function guardarBorrador(
  db: Db,
  b: Borrador,
  cambios: { datos: DatosBorrador; resultado: ResultadoBorrador; origen: "modelo" | "panel" | "motor" | "sistema"; patch: unknown; autorId: string | null; extra?: Partial<Borrador> },
): Promise<Borrador> {
  const version = b.version + 1;
  const { data, error } = await db
    .from("cotizacion_borradores")
    .update({ datos: cambios.datos, resultado: cambios.resultado, version, updated_at: new Date().toISOString(), ...(cambios.extra ?? {}) })
    .eq("id", b.id)
    .eq("version", b.version)
    .select("*")
    .maybeSingle();
  if (error) falla("No se pudo guardar el borrador", error);
  if (!data) throw new Error("El borrador cambió mientras se guardaba: recargalo y probá de nuevo.");
  await db.from("cotizacion_borrador_cambios").insert({ borrador_id: b.id, version, origen: cambios.origen, patch: cambios.patch ?? {}, autor_id: cambios.autorId });
  // Lo que se había propuesto sobre la versión anterior ya no es lo que hay: vence.
  await vencerAccionesDelBorrador(db, b.id, version);
  return { ...(data as Borrador), datos: normalizarBorrador((data as Borrador).datos) };
}

// ── Acciones ────────────────────────────────────────────────────────────────────────────

export type Accion = {
  id: string;
  numero: number;
  conversacion_id: string;
  usuario_id: string;
  borrador_id: string | null;
  borrador_version: number | null;
  tipo: "guardar_presupuesto" | "reemitir_presupuesto" | "enviar_mail" | "crear_cliente" | "avisar_joaquin";
  nivel: "simple" | "explicita";
  estado: "propuesta" | "presentada" | "ejecutando" | "ok" | "error" | "incierto" | "rechazada" | "vencida" | "reemplazada";
  payload: Record<string, unknown>;
  resumen: string;
  resumen_voz: string | null;
  turno_id: string | null;
  tool_use_id: string | null;
  vence_at: string;
  confirmada_via: string | null;
  pasos: Record<string, unknown>;
  resultado: Record<string, unknown> | null;
  error: string | null;
  created_at: string;
};

export async function eventoAccion(db: Db, accionId: string, estado: string, detalle?: unknown) {
  await db.from("asistente_acciones_eventos").insert({ accion_id: accionId, estado, detalle: detalle ?? null });
}

async function vencerAccionesDelBorrador(db: Db, borradorId: string, versionActual: number) {
  const { data } = await db
    .from("asistente_acciones")
    .update({ estado: "vencida", updated_at: new Date().toISOString() })
    .eq("borrador_id", borradorId)
    .in("estado", ["propuesta", "presentada"])
    .lt("borrador_version", versionActual)
    .select("id");
  for (const a of data ?? []) await eventoAccion(db, a.id, "vencida", { motivo: "el borrador cambió" });
}

export async function accionesAbiertas(db: Db, conversacionId: string): Promise<Accion[]> {
  const { data, error } = await db.from("asistente_acciones").select("*").eq("conversacion_id", conversacionId).in("estado", ["propuesta", "presentada"]);
  if (error) falla("No se pudieron leer las acciones", error);
  return (data ?? []) as Accion[];
}

export async function leerAccion(db: Db, id: string): Promise<Accion | null> {
  const { data, error } = await db.from("asistente_acciones").select("*").eq("id", id).maybeSingle();
  if (error) falla("No se pudo leer la acción", error);
  return data as Accion | null;
}

export async function leerAccionPorNumero(db: Db, conversacionId: string, numero: number): Promise<Accion | null> {
  const { data, error } = await db.from("asistente_acciones").select("*").eq("conversacion_id", conversacionId).eq("numero", numero).maybeSingle();
  if (error) falla("No se pudo leer la acción", error);
  return data as Accion | null;
}

// ── Uso y tope diario ───────────────────────────────────────────────────────────────────

/** US$ por millón de tokens (entrada, salida). Escritura de caché de 1 h = 2x; lectura = 0,1x. */
const PRECIOS: Record<string, { entrada: number; salida: number }> = {
  "claude-opus-5": { entrada: 5, salida: 25 },
  "claude-opus-5-5": { entrada: 4, salida: 20 },
  "claude-fable-5-1": { entrada: 10, salida: 50 },
  "claude-opus-4-8": { entrada: 5, salida: 25 },
  "claude-sonnet-5": { entrada: 2, salida: 10 },
};

export function costoUsd(uso: Record<string, number> | null | undefined, modelo: string | null | undefined): number {
  if (!uso) return 0;
  const p = PRECIOS[modelo ?? ""] ?? PRECIOS["claude-opus-5"];
  const m = 1_000_000;
  return (
    ((uso.input_tokens ?? 0) * p.entrada) / m +
    ((uso.cache_creation_input_tokens ?? 0) * p.entrada * 2) / m +
    ((uso.cache_read_input_tokens ?? 0) * p.entrada * 0.1) / m +
    ((uso.output_tokens ?? 0) * p.salida) / m
  );
}

export async function gastoDelDia(db: Db, usuarioId: string): Promise<number> {
  const desde = new Date(new Date().toLocaleDateString("sv-SE", { timeZone: "America/Argentina/Buenos_Aires" }) + "T03:00:00Z").toISOString();
  const { data, error } = await db
    .from("asistente_mensajes")
    .select("uso, modelo_servido, conversacion:asistente_conversaciones!inner(usuario_id)")
    .eq("conversacion.usuario_id", usuarioId)
    .gte("created_at", desde)
    .not("uso", "is", null);
  if (error) return 0;
  return (data ?? []).reduce((a, m) => a + costoUsd(m.uso as Record<string, number>, m.modelo_servido as string), 0);
}

// ── Vendedores: quién es quién en Odoo ──────────────────────────────────────────────────

export type Vendedor = {
  usuarioId: string;
  nombre: string;
  email: string;
  tecnicoEmployeeId: number | null;
  tecnicoNombre: string | null;
  vendedorUserId: number | null;
  vendedorNombre: string | null;
  nombreEnPropuesta: string;
};

/**
 * El técnico y el vendedor de Odoo de quien usa el asistente. La primera vez se resuelve por
 * email (res.users → hr.employee) y con la pareja más frecuente en las órdenes de los últimos
 * 90 días (Gabriel → Sandra, Jorge → Rocío), y queda guardado en comercial_vendedores, donde
 * se puede corregir a mano.
 */
export async function vendedorDe(db: Db, usuarioId: string): Promise<Vendedor> {
  const [{ data: perfil }, { data: fila }] = await Promise.all([
    db.from("user_profiles").select("email, nombre, apellido").eq("id", usuarioId).single(),
    db.from("comercial_vendedores").select("*").eq("usuario_id", usuarioId).maybeSingle(),
  ]);
  const nombre = [perfil?.nombre, perfil?.apellido].filter(Boolean).join(" ") || perfil?.email || "Vendedor";
  const email = (perfil?.email ?? "").toLowerCase();

  let tecnicoId: number | null = fila?.odoo_employee_id ?? null;
  let vendedorId: number | null = fila?.odoo_vendedor_user_id ?? null;
  let nombreEnPropuesta: string | null = fila?.nombre_en_propuesta ?? null;

  // Se busca en Odoo la primera vez (o si la fila la creó Parámetros → Vendedores sin el vínculo).
  if (!tecnicoId && !vendedorId && email) {
    try {
      const [usuario] = await executeKw<{ id: number; name: string }[]>("res.users", "search_read", [[["login", "=ilike", email]]], { fields: ["id", "name"], limit: 1 }, { timeoutMs: 15_000 });
      if (usuario) {
        const [empleado] = await executeKw<{ id: number }[]>("hr.employee", "search_read", [[["user_id", "=", usuario.id]]], { fields: ["id"], limit: 1 }, { timeoutMs: 15_000 });
        tecnicoId = empleado?.id ?? null;
        vendedorId = usuario.id;
        if (tecnicoId) {
          const desde = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);
          const grupos = await executeKw<{ user_id: [number, string] | false; __count: number }[]>(
            "sale.order", "read_group", [[["x_studio_tcnico", "=", tecnicoId], ["create_date", ">=", desde]], ["user_id"], ["user_id"]],
            { lazy: false, orderby: "__count desc", limit: 1 }, { timeoutMs: 15_000 },
          );
          if (grupos[0] && Array.isArray(grupos[0].user_id)) vendedorId = grupos[0].user_id[0];
        }
        nombreEnPropuesta = nombreEnPropuesta ?? usuario.name;
      }
    } catch {
      // Sin Odoo no se guarda nada: se reintenta la próxima vez.
    }
    if (tecnicoId || vendedorId) {
      // Sin pisar lo cargado a mano en Parámetros → Vendedores (el nombre y el WhatsApp).
      await db.from("comercial_vendedores").upsert({
        usuario_id: usuarioId, odoo_employee_id: tecnicoId, odoo_vendedor_user_id: vendedorId, nombre_en_propuesta: nombreEnPropuesta,
      });
    }
  }

  let tecnicoNombre: string | null = null;
  let vendedorNombre: string | null = null;
  try {
    const [emp, usr] = await Promise.all([
      tecnicoId ? executeKw<{ name: string }[]>("hr.employee", "read", [[tecnicoId]], { fields: ["name"] }, { timeoutMs: 15_000 }) : Promise.resolve([]),
      vendedorId ? executeKw<{ name: string }[]>("res.users", "read", [[vendedorId]], { fields: ["name"] }, { timeoutMs: 15_000 }) : Promise.resolve([]),
    ]);
    tecnicoNombre = emp[0]?.name ?? null;
    vendedorNombre = usr[0]?.name ?? null;
  } catch {
    // Los nombres son para mostrar: sin Odoo se sigue.
  }

  return {
    usuarioId,
    nombre,
    email,
    tecnicoEmployeeId: tecnicoId,
    tecnicoNombre,
    vendedorUserId: vendedorId,
    vendedorNombre,
    nombreEnPropuesta: nombreEnPropuesta ?? nombre,
  };
}
