import type { SupabaseClient } from "@supabase/supabase-js";
import { leerSupervision, type Supervision } from "./supervision.ts";
import { leerDescartes, leerGestores, puedeLoIrreversible, type Descartes } from "./config.ts";
import {
  etapasDeExpediente, etapasDeTramite, resumir, tipicoDe,
  type Accion, type Contexto, type Tipico, type DocParaEstado, type EstadoPermiso, type ExpParaEstado, type TareaParaEstado, type TramiteParaEstado,
} from "./estado.ts";
import { direccionCorta, mismoTexto, tienePermiso, type EstadoRobot, type Expediente } from "./tipos.ts";
import { accesoDeFila, esAdmin, nivelEn } from "../auth/acceso.ts";

// La lista "Permisos de andamio" (rediseño 09/10): UNA fila por permiso, se haya abierto en la
// app, presentado a mano o venga de antes del robot. Reemplaza a la bandeja y a Seguimiento.
// Cada fila trae su estado (estado.ts) y, para lo que le toca a la oficina, la persona.

export type Persona = { nombre: string; corto: string; email: string | null };
export type AccionConPersona = Accion & { persona: Persona | null };

export type FilaPermiso = {
  clave: string;
  tramiteId: string | null;
  expedienteId: string | null;
  href: string;
  direccion: string;
  venta: string | null;
  /** El cliente de Odoo, sólo si no se llama como la obra. */
  cliente: string | null;
  dueno: string | null;
  vendedora: Persona | null;
  gestor: Persona | null;
  expediente: string | null;
  esPrueba: boolean;
  abierto: string | null;
  estado: EstadoPermiso;
  acciones: AccionConPersona[];
};

export type Yo = { id: string | null; email: string | null; nombre: string | null; esAdmin: boolean; puedeEditar: boolean; puedeIrreversible: boolean };

export type ListaPermisos = {
  filas: FilaPermiso[];
  /** Finalizados anteriores al robot (sólo la fila de la lista de TAD). */
  historial: Pick<Expediente, "id" | "numero" | "direccion" | "titular" | "nombre" | "creado_tad" | "estado_tad" | "permiso_path" | "odoo_venta_nombre">[];
  supervision: Supervision;
  robot: EstadoRobot | null;
  /** Hay una revisión de TAD pedida o corriendo. */
  revisando: boolean;
  tipico: Tipico;
  yo: Yo;
  gestores: string[];
  descartes: Descartes;
  generado: string;
};

const corto = (nombre: string) => nombre.trim().split(/\s+/)[0] ?? nombre;
const persona = (nombre: string | null | undefined, email: string | null | undefined): Persona | null =>
  nombre?.trim() ? { nombre: nombre.trim(), corto: corto(nombre), email: email?.trim().toLowerCase() || null } : email ? { nombre: email, corto: email.split("@")[0], email: email.toLowerCase() } : null;

/** El último contacto con el cliente (link, recordatorio, pedido de corrección, aviso anotado). No cuenta lo que no salió ni que abrió el portal. */
function esContacto(ev: { detalle: string | null; datos: Record<string, unknown> | null }): boolean {
  if (ev.datos?.visto === true) return false;
  return !/^No se/i.test(ev.detalle ?? "");
}

/** Quién y cuál, resuelto a una persona. */
export function conPersona(acciones: Accion[], gestor: Persona | null, vendedora: Persona | null): AccionConPersona[] {
  return acciones.map((a) => ({
    ...a,
    persona: a.para === "gestor" ? gestor ?? vendedora : a.para === "vendedora" ? vendedora ?? gestor : null,
  }));
}

export async function quienSoy(sesion: SupabaseClient, admin: SupabaseClient, gestores: string[]): Promise<Yo> {
  const { data: auth } = await sesion.auth.getUser();
  const id = auth.user?.id ?? null;
  if (!id) return { id: null, email: null, nombre: null, esAdmin: false, puedeEditar: false, puedeIrreversible: false };
  const { data: p } = await admin.from("user_profiles").select("email, nombre, apellido, rol, activo, permisos, debe_cambiar_clave").eq("id", id).maybeSingle();
  const acceso = accesoDeFila(p);
  const email = (p?.email ?? auth.user?.email ?? null)?.trim().toLowerCase() ?? null;
  const admin_ = esAdmin(acceso);
  return {
    id, email, nombre: p ? `${p.nombre ?? ""} ${p.apellido ?? ""}`.trim() || null : null,
    esAdmin: admin_,
    puedeEditar: nivelEn(acceso, "permisos-via-publica") === "editar",
    puedeIrreversible: nivelEn(acceso, "permisos-via-publica") === "editar" && puedeLoIrreversible({ esAdmin: admin_, email }, gestores),
  };
}

type FilaTramite = TramiteParaEstado & {
  odoo_venta_id: number | null;
  odoo_venta_nombre: string | null;
  direccion: string;
  cliente_nombre: string | null;
  vendedor_nombre: string | null;
  creado_por: string | null;
  pvp_documentos: (DocParaEstado & { tramite_id: string })[];
};

/** Las medianas sin armar la lista entera: para la ficha. Mismas fechas que armarLista. */
export async function tipicoRapido(db: SupabaseClient): Promise<Tipico> {
  const [t, e] = await Promise.all([
    db.from("pvp_tramites").select("created_at, odoo_venta_id, expediente_id").eq("es_prueba", false),
    db.from("pvp_expedientes").select("id, odoo_venta_id, creado_tad, permiso_emitido_el, estado_tad, permiso_notificacion").eq("historico", false),
  ]);
  const exps = (e.data ?? []) as Pick<Expediente, "id" | "odoo_venta_id" | "creado_tad" | "permiso_emitido_el" | "estado_tad" | "permiso_notificacion">[];
  return tipicoDe((t.data ?? []).map((tr) => {
    const x = exps.find((y) => y.id === tr.expediente_id)
      ?? exps.filter((y) => tr.odoo_venta_id && y.odoo_venta_id === tr.odoo_venta_id).sort((a, b) => String(b.creado_tad).localeCompare(String(a.creado_tad)))[0];
    return { abierto: tr.created_at as string, presentado: x?.creado_tad ?? null, permiso: x && tienePermiso(x) ? x.permiso_emitido_el : null };
  }));
}

/**
 * Arma la lista. `sesion` lee con los permisos del usuario; `admin` sólo resuelve nombres de
 * la gente de la oficina (user_profiles no es legible entre usuarios).
 */
export async function armarLista(sesion: SupabaseClient, admin: SupabaseClient): Promise<ListaPermisos> {
  const ahora = Date.now();
  const [expedientes, robot, abiertas, tramites, supervision, descartes, gestores] = await Promise.all([
    sesion.from("pvp_expedientes").select("*"),
    sesion.from("pvp_robot").select("*").eq("id", "tad").maybeSingle(),
    // Un reintento programado para dentro de media hora no cuenta: la lista no tiene que
    // refrescarse cada 10 s mientras espera.
    sesion.from("pvp_tareas").select("id", { count: "exact", head: true }).in("estado", ["pendiente", "tomada"]).or("reintentar_desde.is.null,estado.eq.tomada"),
    sesion.from("pvp_tramites")
      .select("id, created_at, estado, es_prueba, titular_nombre, titular_cargado_at, link_enviado_at, link_enviado_a, link_error, vendedor_email, vendedor_nombre, odoo_venta_id, odoo_venta_nombre, direccion, cliente_nombre, creado_por, expediente_id, pvp_documentos(tramite_id, clave, origen, estado, observacion, updated_at, revisado_at, pedido_at, subido_at)")
      .order("created_at", { ascending: false }),
    leerSupervision(sesion),
    leerDescartes(sesion),
    leerGestores(sesion),
  ]);
  if (expedientes.error) throw expedientes.error;
  if (tramites.error) throw tramites.error;

  const ts = (tramites.data ?? []) as unknown as (FilaTramite & { expediente_id: string | null })[];
  const ids = ts.map((t) => t.id);
  const creadores = [...new Set(ts.map((t) => t.creado_por).filter((x): x is string => !!x))];
  const [tareas, contactos, perfiles, yo] = await Promise.all([
    ids.length
      ? sesion.from("pvp_tareas").select("tramite_id, tipo, estado, error, created_at, terminada_at, reintentar_desde, payload, resultado").in("tramite_id", ids).in("tipo", ["cpau_encomienda", "tad_presentar"]).order("created_at")
      : Promise.resolve({ data: [], error: null }),
    ids.length
      ? sesion.from("pvp_eventos").select("tramite_id, detalle, datos, created_at").in("tramite_id", ids).eq("tipo", "link_cliente").order("created_at", { ascending: false }).limit(3000)
      : Promise.resolve({ data: [], error: null }),
    creadores.length ? admin.from("user_profiles").select("id, email, nombre, apellido").in("id", creadores) : Promise.resolve({ data: [], error: null }),
    quienSoy(sesion, admin, gestores),
  ]);
  if (tareas.error) throw tareas.error;

  const todos = (expedientes.data ?? []) as Expediente[];
  const vigentes = todos.filter((e) => !e.historico);
  const historial = todos
    .filter((e) => e.historico)
    .sort((a, b) => String(b.creado_tad).localeCompare(String(a.creado_tad)) || b.numero.localeCompare(a.numero))
    .map(({ id, numero, direccion, titular, nombre, creado_tad, estado_tad, permiso_path, odoo_venta_nombre }) => ({ id, numero, direccion, titular, nombre, creado_tad, estado_tad, permiso_path, odoo_venta_nombre }));

  const gestoresPorId = new Map((perfiles.data ?? []).map((p) => [p.id as string, persona(`${p.nombre ?? ""} ${p.apellido ?? ""}`.trim(), p.email as string)]));
  const tareasDe = (id: string) => ((tareas.data ?? []) as (TareaParaEstado & { tramite_id: string })[]).filter((x) => x.tramite_id === id);
  const contactoDe = (id: string) => ((contactos.data ?? []) as { tramite_id: string; detalle: string | null; datos: Record<string, unknown> | null; created_at: string }[])
    .find((ev) => ev.tramite_id === id && esContacto(ev))?.created_at ?? null;

  // Primero las etapas (para sacar las medianas), después el resumen con el estimado.
  const base: Omit<Contexto, "ahora"> = { supervision };
  const usados = new Set<string>();
  const armadas = ts.map((t) => {
    const e = vigentes.find((x) => x.id === t.expediente_id)
      ?? vigentes.filter((x) => t.odoo_venta_id && x.odoo_venta_id === t.odoo_venta_id).sort((a, b) => String(b.creado_tad).localeCompare(String(a.creado_tad)))[0];
    if (e) usados.add(e.id);
    const vendedora = persona(t.vendedor_nombre, t.vendedor_email);
    const gestor = t.creado_por ? gestoresPorId.get(t.creado_por) ?? null : null;
    const ctx: Contexto = {
      ...base, ahora,
      ultimoContactoCliente: contactoDe(t.id),
      nombres: { vendedora: vendedora?.corto, gestor: gestor?.corto },
      descartado: !!(e && descartes.expedientes[e.id]),
    };
    return { t, e, vendedora, gestor, ctx, crudo: etapasDeTramite(t, t.pvp_documentos ?? [], tareasDe(t.id), e as ExpParaEstado | undefined, ctx) };
  });
  const tipico = tipicoDe(armadas.filter((a) => !a.t.es_prueba).map(({ t, e }) => ({ abierto: t.created_at, presentado: e?.creado_tad ?? null, permiso: e && tienePermiso(e) ? e.permiso_emitido_el : null })));

  const filas: FilaPermiso[] = armadas.map(({ t, e, vendedora, gestor, ctx, crudo }) => {
    const estado = resumir(crudo, { ...ctx, tipico }, { esPrueba: t.es_prueba, abierto: t.created_at });
    return {
      clave: `t:${t.id}`,
      tramiteId: t.id,
      expedienteId: e?.id ?? null,
      href: `/permisos-via-publica/tramites/${t.id}`,
      direccion: direccionCorta(t.direccion),
      venta: t.odoo_venta_nombre,
      cliente: mismoTexto(t.cliente_nombre, t.direccion) ? null : t.cliente_nombre,
      dueno: t.titular_nombre,
      vendedora,
      gestor,
      expediente: e ? `EX-${e.numero}` : null,
      esPrueba: t.es_prueba,
      abierto: t.created_at,
      estado,
      acciones: conPersona(estado.acciones, gestor, vendedora),
    };
  });

  // Expedientes sin trámite en la app: los de antes del robot y los presentados a mano sin venta.
  for (const e of vigentes) {
    if (usados.has(e.id)) continue;
    const ctx: Contexto = { ...base, ahora, tipico, descartado: !!descartes.expedientes[e.id] };
    const estado = resumir(etapasDeExpediente(e, ctx), ctx);
    filas.push({
      clave: `e:${e.id}`,
      tramiteId: null,
      expedienteId: e.id,
      href: `/permisos-via-publica/${e.id}`,
      direccion: direccionCorta(e.direccion) || e.odoo_venta_nombre || e.titular || `EX-${e.numero}`,
      venta: e.odoo_venta_nombre,
      cliente: mismoTexto(e.cliente, e.direccion) ? null : e.cliente,
      dueno: null,
      vendedora: null,
      gestor: null,
      expediente: `EX-${e.numero}`,
      esPrueba: false,
      abierto: e.creado_tad,
      estado,
      acciones: conPersona(estado.acciones, null, null),
    });
  }

  // Lo que espera hace más, primero. Los emitidos, el más nuevo primero (y aparte: si se mezclan los
  // dos criterios el orden no es consistente y el sort los deja salteados).
  filas.sort((a, b) => {
    const ea = a.estado.grupo === "emitido", eb = b.estado.grupo === "emitido";
    if (ea !== eb) return ea ? 1 : -1;
    if (ea) return Date.parse(b.estado.desde ?? "0") - Date.parse(a.estado.desde ?? "0");
    const da = a.acciones[0]?.desde ?? a.estado.desde ?? a.abierto ?? "";
    const db = b.acciones[0]?.desde ?? b.estado.desde ?? b.abierto ?? "";
    return Date.parse(da || "2100-01-01") - Date.parse(db || "2100-01-01");
  });

  return {
    filas,
    historial,
    supervision,
    robot: (robot.data as EstadoRobot | null) ?? null,
    revisando: (abiertas.count ?? 0) > 0,
    tipico,
    yo,
    gestores,
    descartes,
    generado: new Date(ahora).toISOString(),
  };
}
