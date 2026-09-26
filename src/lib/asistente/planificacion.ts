// Lo que el asistente ve del Tablero de Planificación. SÓLO LECTURA.
//
// LA MISMA FUENTE Y LAS MISMAS CUENTAS QUE EL TABLERO:
//   · las jornadas de Odoo y las tareas de Operaciones (fetchTablero + tareasEnRango);
//   · la ocupación de cada celda con ocupacionCelda;
//   · lo que falta planificar con la duración que fijó Operaciones si la corrigió
//     (plan_jornadas_ot) y repartirJornadas, igual que la bandeja.
// Si el asistente dijera que una cuadrilla está libre y el tablero la mostrara llena, el que
// pierde credibilidad es el tablero.
//
// Las reglas del tablero valen acá: la jornada de una cuadrilla es 1,00 (8 h) y se puede
// pasar (se marca, no se bloquea); el domingo no se trabaja salvo que haya algo puesto; los
// feriados se marcan pero no bloquean. Lo que se ve es el tablero de HOY: lo maneja
// Operaciones, y una fecha se le promete al cliente cuando ellos la confirman.

import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { accesoDeFila, nivelEn } from "@/lib/auth/acceso";
import { fechasDeOt, fetchTablero } from "@/lib/odoo/asignaciones";
import { feriadosDelRango } from "@/lib/feriados/argentina";
import { jornadasPlanTodas } from "@/lib/planificacion/jornadas-plan";
import { FRACCIONES, ocupacionCelda, repartirJornadas } from "@/lib/tablero/fracciones";
import { tareasEnRango } from "@/lib/tablero/tareas";
import { tipoOtLabel, type AsignacionTablero, type OtTablero } from "@/lib/tablero/tipos";

const MAX_DIAS = 31;
const MAX_PENDIENTES = 40;
const MAX_OBRAS_CON_FECHAS = 5;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

const normalizar = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
/**
 * Las horas como las lee el tablero: la mínima (0,10) es ~1,5 h porque lo que la hace corta es
 * el viaje, no el trabajo (fracciones.ts). Fuera de la escala, jornada de 8 h.
 */
const horas = (f: number) => FRACCIONES.find((x) => Math.abs(Number(x.value) - f) < 0.001)?.horas ?? Math.round(f * 8 * 2) / 2;
/** Lo libre de una celda, redondeado a media hora. */
const horasLibres = (ocupado: number) => Math.round(Math.max(0, 1 - ocupado) * 8 * 2) / 2;
const aDia = (f: string) => format(parseISO(f), "EEEE d/MM", { locale: es });

/** El mismo permiso que la pantalla del tablero: el asistente no le muestra a nadie lo que no puede abrir. */
export async function puedeVerPlanificacion(db: SupabaseClient, usuarioId: string): Promise<boolean> {
  const { data } = await db.from("user_profiles").select("rol, activo, permisos, debe_cambiar_clave").eq("id", usuarioId).maybeSingle();
  return nivelEn(accesoDeFila(data), "planificacion") !== null;
}

export type ConsultaPlanificacion = {
  desde?: string;
  hasta?: string;
  /** Parte del nombre de la cuadrilla. */
  cuadrilla?: string;
  /** Parte de la dirección, del título de la OT o del número de venta. */
  obra?: string;
  /** Hoy en Buenos Aires (AAAA-MM-DD). */
  hoy: string;
};

export async function consultarPlanificacion(db: SupabaseClient, p: ConsultaPlanificacion) {
  const desde = p.desde ?? p.hoy;
  let hasta = p.hasta ?? format(addDays(parseISO(desde), 6), "yyyy-MM-dd");
  if (!FECHA.test(desde) || !FECHA.test(hasta)) throw new Error("Las fechas van como AAAA-MM-DD.");
  if (hasta < desde) throw new Error("'hasta' es anterior a 'desde'.");
  let recortado = false;
  if (differenceInCalendarDays(parseISO(hasta), parseISO(desde)) >= MAX_DIAS) {
    hasta = format(addDays(parseISO(desde), MAX_DIAS - 1), "yyyy-MM-dd");
    recortado = true;
  }

  const [tablero, tareas, planes, feriados] = await Promise.all([
    fetchTablero(desde, hasta),
    tareasEnRango(db, desde, hasta),
    jornadasPlanTodas(db),
    feriadosDelRango(desde, hasta),
  ]);

  const ots = new Map(tablero.ots.map((o) => [o.id, o]));
  const nombreCuadrilla = new Map(tablero.cuadrillas.map((c) => [c.id, c.nombre]));
  const parte = new Map(tablero.partes.map((x) => [`${x.otId}|${x.fecha}|${x.cuadrillaId}`, x]));
  const feriado = new Map(feriados.map((f) => [f.fecha, f.nombre]));

  const qObra = p.obra ? normalizar(p.obra) : null;
  const qCuadrilla = p.cuadrilla ? normalizar(p.cuadrilla) : null;
  const esDeLaObra = (o: OtTablero | undefined) =>
    !!o && [o.titulo, o.direccionObra, o.ordenVenta, o.referenciaObra].some((t) => t && normalizar(t).includes(qObra!));
  const coincide = (a: AsignacionTablero) =>
    !qObra || (a.origen === "tarea" ? normalizar(a.tarea?.titulo ?? "").includes(qObra) : esDeLaObra(ots.get(a.otId)));

  const cuadrillas = tablero.cuadrillas.filter((c) => !qCuadrilla || normalizar(c.nombre).includes(qCuadrilla));
  if (qCuadrilla && !cuadrillas.length) {
    return { error: `No hay una cuadrilla activa que se llame "${p.cuadrilla}".`, cuadrillas: tablero.cuadrillas.map((c) => c.nombre) };
  }
  const idsCuadrillas = new Set(cuadrillas.map((c) => c.id));
  const asignaciones = [...tablero.asignaciones, ...tareas].sort((a, b) => a.ordenDia - b.ordenDia);

  function describir(a: AsignacionTablero) {
    const base = { fraccion: a.fraccion, horas: horas(a.fraccion) };
    if (a.origen === "tarea") {
      return { ...base, tareaDeOperaciones: a.tarea?.titulo ?? "Tarea", tipo: a.tarea?.tipo, hecha: a.tarea?.hecha || undefined, notas: a.notas || undefined };
    }
    const ot = ots.get(a.otId);
    const cierre = parte.get(`${a.otId}|${a.fecha}|${a.cuadrillaId}`);
    return {
      ...base,
      ot: ot?.titulo ?? `OT #${a.otId}`,
      tipo: tipoOtLabel(ot?.tipo),
      direccion: ot?.direccionObra ?? undefined,
      venta: ot?.ordenVenta ?? undefined,
      estado: a.estado,
      fija: a.motivoFija ? `sí: ${a.motivoFija}` : undefined,
      parte: cierre ? cierre.estado + (cierre.motivoNoEjec ? ` (${cierre.motivoNoEjec})` : "") : undefined,
      notas: a.notas || undefined,
    };
  }

  const dias = [];
  for (let d = parseISO(desde); format(d, "yyyy-MM-dd") <= hasta; d = addDays(d, 1)) {
    const fecha = format(d, "yyyy-MM-dd");
    const delDia = asignaciones.filter((a) => a.fecha === fecha && coincide(a));
    const ocupadas = [];
    const libres: string[] = [];
    for (const c of cuadrillas) {
      const items = delDia.filter((a) => a.cuadrillaId === c.id);
      if (!items.length) {
        libres.push(c.nombre);
        continue;
      }
      const occ = ocupacionCelda(items.map((a) => a.fraccion));
      ocupadas.push({
        cuadrilla: c.nombre,
        ocupacion: occ.label === "SOBREASIGNADA" ? `sobreasignada (${occ.pct}%)` : `${occ.pct}%`,
        libreHoras: horasLibres(occ.total),
        trabajos: items.map(describir),
      });
    }
    const sinCuadrilla = delDia.filter((a) => a.cuadrillaId === null || !nombreCuadrilla.has(a.cuadrillaId));
    // Con una obra puntual, sólo los días en que aparece: los libres del resto no vienen al caso.
    if (qObra && !ocupadas.length && !sinCuadrilla.length) continue;
    dias.push({
      fecha,
      dia: aDia(fecha),
      feriado: feriado.get(fecha),
      domingo: d.getDay() === 0 || undefined,
      ocupadas,
      libres: qObra ? undefined : libres,
      sinCuadrilla: sinCuadrilla.length && !qCuadrilla ? sinCuadrilla.map(describir) : undefined,
    });
  }

  // La bandeja: obras a las que les quedan jornadas por planificar (misma cuenta que el tablero).
  const planPorOt = new Map(planes.map((pl) => [pl.otId, pl.jornadas]));
  const progreso = new Map(tablero.progreso.map((x) => [x.otId, x]));
  const pendientes = tablero.ots
    .filter((o) => ["pendiente", "en_proceso"].includes(o.estado) && (!qObra || esDeLaObra(o)))
    .filter((o) => !qCuadrilla || (o.cuadrillaPrevistaId !== null && idsCuadrillas.has(o.cuadrillaPrevistaId)))
    .map((ot) => {
      const corregida = planPorOt.has(ot.id);
      const jornadas = planPorOt.get(ot.id) ?? ot.jornadas;
      const totales = repartirJornadas(jornadas, corregida).length;
      const asignadas = progreso.get(ot.id)?.asignadas ?? 0;
      return {
        ot: ot.titulo,
        tipo: tipoOtLabel(ot.tipo),
        direccion: ot.direccionObra ?? undefined,
        venta: ot.ordenVenta ?? undefined,
        jornadas,
        duracionSinEstimar: (ot.sinEstimar && !corregida) || undefined,
        faltanPlanificar: totales - asignadas,
        yaPlanificadas: asignadas || undefined,
        urgencia: ot.urgencia,
        habilitacion: ot.habSemaforo,
        noAntesDe: ot.fechaDesde ?? undefined,
        terminadaAntesDe: ot.fechaAntesDe ?? undefined,
        comprometida: ot.fechaComprometida ?? undefined,
        cuadrillaPrevista: ot.cuadrillaPrevistaId !== null ? nombreCuadrilla.get(ot.cuadrillaPrevistaId) : undefined,
      };
    })
    .filter((x) => x.faltanPlanificar > 0)
    .sort((a, b) => (a.comprometida ?? "9999").localeCompare(b.comprometida ?? "9999"));

  // Con una obra puntual: todas sus fechas, aunque caigan fuera del rango pedido.
  let fechasDeLaObra;
  if (qObra) {
    const delaObra = tablero.ots.filter(esDeLaObra).slice(0, MAX_OBRAS_CON_FECHAS);
    fechasDeLaObra = await Promise.all(
      delaObra.map(async (ot) => ({ ot: ot.titulo, tipo: tipoOtLabel(ot.tipo), venta: ot.ordenVenta ?? undefined, estado: ot.estado, fechas: await fechasDeOt(ot.id) })),
    );
  }

  return {
    rango: { desde, hasta, recortadoA31Dias: recortado || undefined },
    nota: "Tablero de hoy (lo maneja Operaciones). Jornada de cuadrilla = 1,00 = 8 h. 'tentativa' ya ocupa lugar pero no está confirmada.",
    cuadrillas: cuadrillas.map((c) => c.nombre + (c.tercerizada ? " (tercerizada)" : "")),
    dias,
    fechasDeLaObra,
    faltanPlanificar: pendientes.slice(0, MAX_PENDIENTES),
    faltanPlanificarTotal: pendientes.length > MAX_PENDIENTES ? pendientes.length : undefined,
  };
}
