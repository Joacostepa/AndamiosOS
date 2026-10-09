import type { SupabaseClient } from "@supabase/supabase-js";
import { agrupar, type Bandeja, type EstadoRobot, type Expediente, type TramiteNuevo } from "./tipos";
import { leerSupervision } from "./supervision";
import { etapasDe, NOMBRE_ETAPA, resumirEtapas, type Doc, type Exp, type Tarea } from "./seguimiento";

// La bandeja de permisos: expedientes de TAD agrupados por lo que hay que hacer, los trámites
// todavía sin presentar con su etapa actual, el modo supervisado y el latido del robot.
//
// Los trámites sin expediente salen con su etapa calculada igual que en Seguimiento
// (etapasDe): en qué está, quién lo tiene que mover y desde cuándo. Así la bandeja y
// Seguimiento no pueden contar dos historias distintas del mismo trámite.

export async function armarBandeja(db: SupabaseClient): Promise<Bandeja> {
  const [expedientes, robot, abiertas, nuevos] = await Promise.all([
    db.from("pvp_expedientes").select("*"),
    db.from("pvp_robot").select("*").eq("id", "tad").maybeSingle(),
    // Un reintento programado para dentro de media hora no cuenta: la bandeja no tiene que
    // refrescarse cada 10 s mientras espera.
    db.from("pvp_tareas").select("id", { count: "exact", head: true }).in("estado", ["pendiente", "tomada"]).or("reintentar_desde.is.null,estado.eq.tomada"),
    // Trámites abiertos desde una venta que todavía no tienen expediente en TAD.
    db.from("pvp_tramites")
      .select("id, odoo_venta_id, direccion, odoo_venta_nombre, cliente_nombre, vendedor_nombre, vendedor_email, titular_nombre, titular_cargado_at, link_enviado_at, link_enviado_a, link_error, estado, created_at, es_prueba, pvp_documentos(tramite_id, clave, origen, estado, observacion, updated_at, revisado_at, pedido_at)")
      .is("expediente_id", null)
      .order("created_at", { ascending: false }),
  ]);
  if (expedientes.error) throw expedientes.error;
  // Como antes: si los trámites no se pueden leer, la bandeja de TAD se muestra igual.
  if (nuevos.error) console.error("[bandeja] no se pudieron leer los trámites", nuevos.error.message);

  const ids = (nuevos.data ?? []).map((t) => t.id);
  const tareas = ids.length
    ? await db.from("pvp_tareas").select("tramite_id, tipo, estado, error, created_at, terminada_at, resultado").in("tramite_id", ids).in("tipo", ["cpau_encomienda", "tad_presentar"]).order("created_at")
    : { data: [] as Tarea[], error: null };
  if (tareas.error) console.error("[bandeja] no se pudieron leer las tareas del robot", tareas.error.message);
  const supervision = await leerSupervision(db);

  const todas = (expedientes.data ?? []) as Expediente[];
  // El historial (finalizados anteriores al robot) va aparte: no entra en los grupos del día a día.
  const filas = todas.filter((e) => !e.historico);
  const historial = todas
    .filter((e) => e.historico)
    .sort((a, b) => String(b.creado_tad).localeCompare(String(a.creado_tad)) || b.numero.localeCompare(a.numero));
  const tramitesNuevos: TramiteNuevo[] = (nuevos.data ?? []).map((fila) => {
    const { pvp_documentos: docs, ...t } = fila as typeof fila & { pvp_documentos: Doc[] };
    const ventaId = t.odoo_venta_id as number | null;
    // Presentado a mano en TAD: el expediente de la misma venta (el más nuevo).
    const exp = filas
      .filter((e) => ventaId && e.odoo_venta_id === ventaId)
      .sort((a, b) => String(b.creado_tad).localeCompare(String(a.creado_tad)))[0] as (Exp & Expediente) | undefined;
    const etapas = etapasDe(fila, docs ?? [], ((tareas.data ?? []) as Tarea[]).filter((x) => x.tramite_id === fila.id), exp);
    const { trabada, actual, quienes } = resumirEtapas(etapas);
    const linkSinMandar = !!t.link_error && !t.titular_cargado_at;
    const e = actual ?? etapas[0];
    return {
      ...(t as Omit<TramiteNuevo, "etapa">),
      etapa: {
        clave: e.clave,
        nombre: NOMBRE_ETAPA[e.clave],
        estado: e.estado,
        detalle: linkSinMandar && e.clave === "legajo" ? "El link al cliente no salió: copialo de la ficha y mandalo por WhatsApp" : e.detalle ?? null,
        desde: e.desde ?? null,
        motivo: e.motivo ?? null,
        quienes: linkSinMandar && !quienes.includes("ABA") ? ["ABA", ...quienes] : quienes,
        esperaAba: !!trabada || quienes.includes("ABA") || linkSinMandar,
        expediente: exp ? `EX-${exp.numero}` : null,
      },
    };
  });
  // Lo que lleva más tiempo en su etapa, primero.
  tramitesNuevos.sort((a, b) => Date.parse(a.etapa.desde ?? a.created_at) - Date.parse(b.etapa.desde ?? b.created_at));

  const bandeja: Bandeja = {
    tramitesNuevos,
    grupos: agrupar(filas),
    total: filas.length,
    historial,
    supervision,
    robot: (robot.data as EstadoRobot | null) ?? null,
    revisando: (abiertas.count ?? 0) > 0,
  };
  return bandeja;
}
