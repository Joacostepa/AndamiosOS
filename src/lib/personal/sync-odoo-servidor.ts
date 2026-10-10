// Empleados de Odoo → Legajos: la parte con red y base. La decisión está en sync-odoo.ts
// (pura, con tests); acá se lee Odoo y Supabase, se escribe `personal` y se avisa.
//
// La usan el webhook (src/app/api/odoo/webhooks/empleados) y el control diario
// (src/app/api/cron/personal-odoo). Sólo escribe en Supabase: en Odoo, nada.

import type { SupabaseClient } from "@supabase/supabase-js";
import { searchRead } from "@/lib/odoo/client";
import { crearAlertas, type NuevaAlerta } from "@/lib/alertas/servicio";
import {
  CAMPOS_EMPLEADO,
  CAMPOS_LEGAJO,
  decidir,
  describir,
  pasada,
  type CambiosLegajo,
  type Decision,
  type EmpleadoOdoo,
  type Legajo,
} from "./sync-odoo";

type DB = SupabaseClient;

/** Activos y archivados: sin esto Odoo esconde los archivados y una baja no se ve. */
const TODOS = ["active", "in", [true, false]];

export async function leerEmpleados(ids?: number[]): Promise<EmpleadoOdoo[]> {
  const dominio = ids ? [TODOS, ["id", "in", ids]] : [TODOS];
  return searchRead<EmpleadoOdoo>("hr.employee", dominio, [...CAMPOS_EMPLEADO], { order: "id" });
}

export async function leerLegajos(db: DB): Promise<Legajo[]> {
  const { data, error } = await db.from("personal").select(CAMPOS_LEGAJO);
  if (error) throw new Error(`No se pudo leer personal: ${error.message}`);
  return (data ?? []).map((l) => ({ ...l, odoo_employee_id: l.odoo_employee_id == null ? null : Number(l.odoo_employee_id) })) as Legajo[];
}

export type Resultado = {
  creados: number;
  actualizados: number;
  desactivados: number;
  alDia: number;
  ignorados: number;
  dudosos: number;
  errores: string[];
  /** Una línea por cosa que pasó (lo que no es "al día" ni "ignorado"). */
  log: string[];
};

const vacio = (): Resultado => ({ creados: 0, actualizados: 0, desactivados: 0, alDia: 0, ignorados: 0, dudosos: 0, errores: [], log: [] });

/** Escribe lo decidido y avisa lo dudoso y lo creado. No tira: lo que falla queda en `errores`. */
async function aplicar(db: DB, decisiones: Decision[], huerfanos: { legajo: Legajo; cambios: CambiosLegajo }[]): Promise<Resultado> {
  const r = vacio();
  const avisos: NuevaAlerta[] = [];

  for (const d of decisiones) {
    if (d.tipo === "sin_cambios") { r.alDia++; continue; }
    if (d.tipo === "ignorar") { r.ignorados++; continue; }
    if (d.tipo === "dudoso") {
      r.dudosos++;
      r.log.push(describir(d));
      avisos.push(aviso(d.empleado, d.motivo, `Legajos: revisar a ${d.empleado.name}`, d.detalle, "media"));
      continue;
    }
    if (d.tipo === "actualizar") {
      const { error } = await db.from("personal").update(d.cambios).eq("id", d.legajo.id);
      if (error) {
        r.errores.push(`${d.empleado.name}: ${error.message}`);
        avisos.push(aviso(d.empleado, "error", `Legajos: no se pudo actualizar a ${d.empleado.name}`, error.message, "media"));
        continue;
      }
      r.actualizados++;
      if (d.cambios.activo === false) r.desactivados++;
      r.log.push(describir(d));
      continue;
    }
    // crear
    const { error } = await db.from("personal").insert({ ...d.fila, user_id: null });
    if (error) {
      // 23505 = UNIQUE: otro webhook del mismo empleado lo creó un instante antes (Odoo
      // dispara al crear y al guardar). Es la idempotencia, no un error.
      if (error.code === "23505" && /odoo_employee/.test(error.message)) { r.alDia++; continue; }
      r.errores.push(`${d.empleado.name}: ${error.message}`);
      avisos.push(aviso(d.empleado, "error", `Legajos: no se pudo dar de alta a ${d.empleado.name}`, error.message, "media"));
      continue;
    }
    r.creados++;
    r.log.push(describir(d));
    avisos.push(
      aviso(
        d.empleado,
        "creado",
        `Legajos: alta desde Odoo — ${d.fila.apellido}, ${d.fila.nombre}`,
        `Puesto ${d.fila.puesto}${d.fila.odoo_tarea ? ` (tarea ${d.fila.odoo_tarea} en Odoo)` : ""}. Revisá si puede estar a cargo y vinculá su Telegram.`,
        "baja",
      ),
    );
  }

  for (const h of huerfanos) {
    const { error } = await db.from("personal").update(h.cambios).eq("id", h.legajo.id);
    if (error) { r.errores.push(`${h.legajo.apellido}: ${error.message}`); continue; }
    r.desactivados++;
    r.log.push(`${h.legajo.apellido}, ${h.legajo.nombre}: su empleado #${h.legajo.odoo_employee_id} ya no está en Odoo → desactivado`);
  }

  await avisar(db, avisos);
  return r;
}

/**
 * El aviso de un empleado, sin destinatario todavía: avisar() lo copia a cada persona con
 * Legajos en editar. La clave hace que el control diario no repita lo mismo cada mañana.
 */
function aviso(e: EmpleadoOdoo, motivo: string, titulo: string, descripcion: string, prioridad: NuevaAlerta["prioridad"]): NuevaAlerta {
  return { tipo: "personal_odoo", clave: `personal_odoo:${e.id}:${motivo}`, titulo, descripcion, prioridad, enlace: "/personal" };
}

/** A la campanita de cada persona activa con Legajos en editar (o admin). */
async function avisar(db: DB, avisos: NuevaAlerta[]): Promise<void> {
  if (avisos.length === 0) return;
  const { data, error } = await db.from("user_profiles").select("id, rol, activo, permisos").eq("activo", true);
  if (error) {
    console.error("[personal-odoo] no se pudo leer a quién avisar", error.message);
    return;
  }
  const quienes = (data ?? []).filter(
    (u) => u.rol === "admin" || (u.permisos as Record<string, string> | null)?.personal === "editar",
  );
  await crearAlertas(
    db,
    quienes.flatMap((u) => avisos.map((a) => ({ ...a, clave: `${a.clave}:${u.id}`, destinatarioId: u.id as string, destinatarioRol: null }))),
  );
}

/**
 * Un empleado (el webhook). Si ya no existe en Odoo (lo borraron), se desactiva su legajo.
 * Lee el empleado fresco de Odoo: del payload sólo se usa el id.
 */
export async function sincronizarEmpleado(db: DB, id: number): Promise<Resultado> {
  const [[empleado], legajos] = await Promise.all([leerEmpleados([id]), leerLegajos(db)]);
  if (!empleado) {
    const huerfanos = legajos
      .filter((l) => l.odoo_employee_id === id && l.activo)
      .map((legajo) => ({ legajo, cambios: { activo: false } as CambiosLegajo }));
    return aplicar(db, [], huerfanos);
  }
  return aplicar(db, [decidir(empleado, legajos)], []);
}

/** Todos los empleados, activos y archivados (el control diario). */
export async function sincronizarTodos(db: DB): Promise<Resultado> {
  const [empleados, legajos] = await Promise.all([leerEmpleados(), leerLegajos(db)]);
  // Odoo caído o sin permiso devolvería una lista vacía "válida" y desactivaría a todos.
  if (empleados.length === 0) throw new Error("Odoo no devolvió empleados: no se toca nada");
  const { decisiones, huerfanos } = pasada(empleados, legajos);
  return aplicar(db, decisiones, huerfanos);
}
