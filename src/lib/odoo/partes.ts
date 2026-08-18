// Cierre de jornada: escritura del parte diario en Odoo.
//
// SOLO server-side. Se consume desde /api/planificacion/partes.
//
// CONCEPTO: cada x_aba_asignacion —"una obra, un día, una cuadrilla"— genera UN parte.
// Una obra de 4 jornadas termina siendo 4 partes, uno por día. Cerrar una obra no toca
// a las otras que la cuadrilla tenga ese mismo día.
//
// REGLA DE NEGOCIO: la app NUNCA manda costos ni horas-hombre. Los calcula Odoo con la
// tarifa vigente a esa fecha (x_horas, x_horas_hombre, x_valor_hora, x_costo, x_costo_*).
// Tampoco escribe x_name: lo arma Odoo.

import { searchRead, create, write, executeKw, read } from "./client";
import type {
  DatosCierre,
  ParteCargado,
  ResultadoCierre,
  PasoCierre,
} from "@/lib/tablero/tipos-parte";

export type * from "@/lib/tablero/tipos-parte";

function str(v: string | false | null | undefined): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : null;
}
function m2oId(v: [number, string] | false | undefined): number | null {
  return Array.isArray(v) ? v[0] : null;
}

/** Valores del parte en sí (sin líneas). */
function valoresParte(datos: DatosCierre, otId: number): Record<string, unknown> {
  const ejecutado = datos.estado === "ejecutado";
  return {
    x_orden_trabajo_id: otId,
    x_fecha: datos.fecha,
    x_cuadrilla_id: datos.cuadrillaId ?? false,
    x_estado: datos.estado,
    // Solo aplica al no ejecutado; en el ejecutado se limpia explícitamente para que
    // una edición no deje colgado el motivo de un cierre anterior.
    x_motivo_no_ejec: ejecutado ? false : datos.motivoNoEjec,
    x_sector: ejecutado ? (datos.sector ?? false) : false,
    x_clima: ejecutado ? (datos.clima ?? false) : false,
    x_objetivo: ejecutado ? (datos.objetivo ?? false) : false,
    x_tareas: ejecutado ? (datos.tareas ?? false) : false,
    x_bloqueos: datos.observaciones ?? false,
    x_puntero_id: datos.punteroId ?? false,
  };
}

// La fecha de la línea NO es decorativa: Odoo busca con ella la tarifa vigente. Sin
// fecha, el costo del flete sale CERO (medido contra la instancia real). Va en todas
// las líneas que la tienen, aunque el valor lo siga calculando Odoo.
async function crearLineasManoObra(parteId: number, datos: DatosCierre, fecha: string): Promise<number> {
  if (datos.estado !== "ejecutado" || datos.manoObra.length === 0) return 0;
  const ids = await executeKw<number | number[]>("x_aba_mano_obra", "create", [
    datos.manoObra.map((l) => ({
      x_parte_diario_id: parteId,
      x_fecha: fecha,
      x_tarea: l.tarea,
      x_personas: l.personas,
      x_hora_desde: l.horaDesde,
      x_hora_hasta: l.horaHasta,
    })),
  ]);
  return Array.isArray(ids) ? ids.length : 1;
}

async function crearLineasFlete(parteId: number, datos: DatosCierre, fecha: string): Promise<number> {
  if (datos.estado !== "ejecutado" || !datos.flete || datos.flete.cantidad <= 0) return 0;
  await create("x_aba_flete", {
    x_parte_diario_id: parteId,
    x_fecha: fecha,
    x_cantidad: datos.flete.cantidad,
    x_tercerizado: datos.flete.tercerizado,
    // x_costo_manual solo tiene sentido en el tercerizado; el propio lo tarifa Odoo.
    x_costo_manual: datos.flete.tercerizado ? (datos.flete.costoManual ?? 0) : 0,
  });
  return 1;
}

async function crearLineasIncidencia(parteId: number, datos: DatosCierre): Promise<number> {
  if (datos.estado !== "ejecutado" || datos.incidencias.length === 0) return 0;
  const ids = await executeKw<number | number[]>("x_aba_incidencia", "create", [
    datos.incidencias.map((i) => ({
      x_parte_diario_id: parteId,
      x_tipo: i.tipo,
      x_descripcion: i.descripcion,
    })),
  ]);
  return Array.isArray(ids) ? ids.length : 1;
}

/**
 * Las fotos van de a UN registro por foto para poder informar cuáles fallaron: si de
 * ocho se caen dos, el parte igual queda guardado y el usuario reintenta solo esas.
 *
 * Se lanzan todas juntas y las serializa la cola de client.ts. En serie, ocho fotos eran
 * ocho round-trips de ~800 ms encadenados; en paralelo se pagan de a MAX_CONCURRENTES.
 */
async function crearFotos(
  parteId: number,
  datos: DatosCierre,
): Promise<{ subidas: number; fallidas: string[] }> {
  if (datos.estado !== "ejecutado" || datos.fotos.length === 0) return { subidas: 0, fallidas: [] };
  const resultados = await Promise.all(
    datos.fotos.map((f) =>
      create("x_aba_foto", {
        x_parte_diario_id: parteId,
        x_imagen: f.base64,
        x_momento: f.momento,
        x_descripcion: f.descripcion ?? false,
      }).then(
        () => null,
        () => f.nombre,
      ),
    ),
  );
  const fallidas = resultados.filter((n): n is string => n !== null);
  return { subidas: resultados.length - fallidas.length, fallidas };
}

/**
 * Cierra la jornada de una asignación.
 *
 * Si ya existe un parte para esa OT y fecha —alguien pudo cargarlo desde Odoo— se
 * REUTILIZA en lugar de crear uno nuevo: dos partes del mismo día duplicarían costos.
 *
 * Devuelve el detalle paso por paso: si algo se corta a mitad, el usuario tiene que
 * saber qué quedó guardado y qué no.
 */
export async function cerrarJornada(
  asignacionId: number,
  datos: DatosCierre,
): Promise<ResultadoCierre> {
  const pasos: PasoCierre[] = [];
  const registrar = (nombre: string, ok: boolean, detalle?: string) =>
    pasos.push({ nombre, ok, detalle });

  const [asignacion] = await read<{
    id: number;
    x_ot_id: [number, string] | false;
    x_fecha: string | false;
    x_parte_id: [number, string] | false;
  }>("x_aba_asignacion", [asignacionId], ["x_ot_id", "x_fecha", "x_parte_id"]);
  if (!asignacion) throw new Error("La asignación no existe");
  const otId = m2oId(asignacion.x_ot_id);
  if (!otId) throw new Error("La asignación no tiene orden de trabajo");

  const fecha = datos.fecha || str(asignacion.x_fecha) || "";

  // ── 1) El parte ────────────────────────────────────────────────────────────
  //
  // SOLO se reescribe el parte que YA está vinculado a esta asignación (reedición de un
  // cierre propio). Nunca se adopta un parte preexistente.
  //
  // Antes se "reutilizaba" cualquier parte de la misma OT y fecha sin vincular. Eso
  // hacía que cerrar una jornada con fecha retroactiva se apropiara de un parte
  // histórico —importado de la planilla— y le borrara las líneas para escribir las
  // nuevas. Destruía datos en silencio. Un duplicado se ve y se borra; una jornada
  // histórica pisada no se recupera.
  const parteVinculado = m2oId(asignacion.x_parte_id);

  let parteId: number;
  const reutilizado = parteVinculado !== null;
  // El aviso de duplicado no bloquea nada: se dispara junto con el resto y se lee al final.
  let avisoDuplicados: Promise<number[]> = Promise.resolve([]);

  if (parteVinculado !== null) {
    parteId = parteVinculado;
    await write("x_aba_parte_diario", [parteId], valoresParte({ ...datos, fecha }, otId));
    registrar("Parte diario actualizado", true, `#${parteId}`);
  } else {
    parteId = await create("x_aba_parte_diario", valoresParte({ ...datos, fecha }, otId));
    registrar("Parte diario", true, `#${parteId}`);

    // Si ya había otro parte para esa OT y fecha, se avisa: puede ser un duplicado a
    // resolver en Odoo, pero no se toca.
    const idNuevo = parteId;
    avisoDuplicados = searchRead<{ id: number }>(
      "x_aba_parte_diario",
      [["x_orden_trabajo_id", "=", otId], ["x_fecha", "=", fecha], ["id", "!=", idNuevo]],
      ["id"],
      { limit: 3 },
    ).then(
      (otros) => otros.map((o) => o.id),
      () => [],
    );
  }

  // Desde acá los fallos NO tiran todo abajo: el parte ya existe y hay que decir
  // exactamente qué se guardó.
  const resultado: ResultadoCierre = { parteId, reutilizado, pasos, fotosFallidas: [] };

  // Si se reutilizó un parte, sus líneas viejas se reemplazan para no duplicar. Tiene
  // que terminar ANTES de crear las nuevas, o el borrado se llevaría puestas a las
  // recién creadas.
  if (reutilizado) {
    try {
      await borrarLineas(parteId);
      registrar("Líneas anteriores reemplazadas", true);
    } catch (e) {
      registrar("Líneas anteriores reemplazadas", false, mensaje(e));
    }
  }

  // ── 2..6) Líneas, fotos y cierre de la jornada ─────────────────────────────
  //
  // Son independientes entre sí: van todas juntas y la cola de client.ts las reparte.
  // Encadenadas eran ~6 round-trips de ~800 ms uno detrás del otro.
  const [manoObra, flete, incidencias, fotos, marcada, duplicados] = await Promise.allSettled([
    crearLineasManoObra(parteId, datos, fecha),
    crearLineasFlete(parteId, datos, fecha),
    crearLineasIncidencia(parteId, datos),
    crearFotos(parteId, datos),
    write("x_aba_asignacion", [asignacionId], { x_parte_id: parteId }),
    avisoDuplicados,
  ]);

  if (manoObra.status === "rejected") registrar("Personal y horarios", false, mensaje(manoObra.reason));
  else if (manoObra.value > 0) {
    registrar("Personal y horarios", true, `${manoObra.value} línea${manoObra.value === 1 ? "" : "s"}`);
  }

  if (flete.status === "rejected") registrar("Fletes", false, mensaje(flete.reason));
  else if (flete.value > 0) registrar("Fletes", true);

  if (incidencias.status === "rejected") registrar("Incidencias", false, mensaje(incidencias.reason));
  else if (incidencias.value > 0) registrar("Incidencias", true, `${incidencias.value}`);

  if (fotos.status === "rejected") {
    registrar("Fotos", false, mensaje(fotos.reason));
  } else {
    const { subidas, fallidas } = fotos.value;
    resultado.fotosFallidas = fallidas;
    if (subidas > 0 || fallidas.length > 0) {
      registrar(
        "Fotos",
        fallidas.length === 0,
        fallidas.length === 0 ? `${subidas} subida${subidas === 1 ? "" : "s"}` : `${subidas} de ${subidas + fallidas.length}`,
      );
    }
  }

  registrar(
    "Jornada marcada como cerrada",
    marcada.status === "fulfilled",
    marcada.status === "rejected" ? mensaje(marcada.reason) : undefined,
  );

  if (duplicados.status === "fulfilled" && duplicados.value.length > 0) {
    registrar(
      "Ojo: ya existía otro parte para esa obra y fecha",
      false,
      `#${duplicados.value.join(", #")} — revisalo en Odoo`,
    );
  }

  return resultado;
}

function mensaje(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * Borra las líneas de un parte (al reeditarlo se reemplazan, no se acumulan).
 * Los tres modelos se barren en paralelo: no se pisan entre sí.
 */
async function borrarLineas(parteId: number): Promise<void> {
  await Promise.all(
    ["x_aba_mano_obra", "x_aba_flete", "x_aba_incidencia"].map(async (modelo) => {
      const ids = await searchRead<{ id: number }>(modelo, [["x_parte_diario_id", "=", parteId]], ["id"]);
      if (ids.length) await executeKw(modelo, "unlink", [ids.map((r) => r.id)]);
    }),
  );
}

/** Actualiza un parte ya cargado (cabecera + líneas, las fotos se suman). */
export async function editarParte(parteId: number, datos: DatosCierre, otId: number): Promise<ResultadoCierre> {
  const pasos: PasoCierre[] = [];
  // La cabecera y el barrido de líneas viejas no dependen entre sí; las líneas nuevas sí
  // tienen que esperar al barrido, o se borrarían recién creadas.
  await Promise.all([
    write("x_aba_parte_diario", [parteId], valoresParte(datos, otId)),
    borrarLineas(parteId),
  ]);
  pasos.push({ nombre: "Parte diario actualizado", ok: true, detalle: `#${parteId}` });

  const [, , , { subidas, fallidas }] = await Promise.all([
    crearLineasManoObra(parteId, datos, datos.fecha),
    crearLineasFlete(parteId, datos, datos.fecha),
    crearLineasIncidencia(parteId, datos),
    crearFotos(parteId, datos),
  ]);
  pasos.push({ nombre: "Líneas reemplazadas", ok: true });

  if (subidas > 0 || fallidas.length > 0) {
    pasos.push({ nombre: "Fotos nuevas", ok: fallidas.length === 0, detalle: `${subidas} subida(s)` });
  }

  return { parteId, reutilizado: true, pasos, fotosFallidas: fallidas };
}

/**
 * Empleados que pueden figurar como puntero. Se devuelven todos —una ausencia puede
 * dejar de puntero a alguien de escala menor— pero ordenados por escala descendente,
 * así los capataces (escala 5+) quedan arriba de la lista.
 */
export async function fetchEmpleados(): Promise<{ id: number; nombre: string; escala: string | null }[]> {
  const filas = await searchRead<{ id: number; name: string; job_title: string | false }>(
    "hr.employee", [], ["name", "job_title"], { order: "name" },
  );
  const escalaNum = (t: string | null) => Number(/(\d+)/.exec(t ?? "")?.[1] ?? 0);
  return filas
    .map((f) => ({ id: f.id, nombre: f.name, escala: str(f.job_title) }))
    .sort((a, b) => escalaNum(b.escala) - escalaNum(a.escala) || a.nombre.localeCompare(b.nombre));
}

/** Lee un parte con sus líneas, para ver o editar lo ya cargado. */
export async function fetchParte(parteId: number): Promise<ParteCargado | null> {
  const [parte] = await read<Record<string, unknown>>("x_aba_parte_diario", [parteId], [
    "x_orden_trabajo_id", "x_fecha", "x_cuadrilla_id", "x_estado", "x_motivo_no_ejec",
    "x_sector", "x_clima", "x_objetivo", "x_tareas", "x_bloqueos", "x_horas_hombre",
    "x_costo_total", "x_cant_fotos", "x_puntero_id",
  ]);
  if (!parte) return null;

  const [manoObra, fletes, incidencias, fotos] = await Promise.all([
    searchRead<Record<string, unknown>>("x_aba_mano_obra", [["x_parte_diario_id", "=", parteId]],
      ["x_tarea", "x_personas", "x_hora_desde", "x_hora_hasta", "x_horas", "x_horas_hombre"]),
    searchRead<Record<string, unknown>>("x_aba_flete", [["x_parte_diario_id", "=", parteId]],
      ["x_cantidad", "x_tercerizado", "x_costo_manual"]),
    searchRead<Record<string, unknown>>("x_aba_incidencia", [["x_parte_diario_id", "=", parteId]],
      ["x_tipo", "x_descripcion"]),
    searchRead<Record<string, unknown>>("x_aba_foto", [["x_parte_diario_id", "=", parteId]],
      ["x_momento", "x_descripcion"]),
  ]);

  const num = (v: unknown) => (typeof v === "number" ? v : 0);
  const texto = (v: unknown) => (typeof v === "string" && v.trim() !== "" ? v : null);

  return {
    id: parteId,
    otId: m2oId(parte.x_orden_trabajo_id as [number, string] | false) ?? 0,
    fecha: texto(parte.x_fecha) ?? "",
    cuadrillaId: m2oId(parte.x_cuadrilla_id as [number, string] | false),
    punteroId: m2oId(parte.x_puntero_id as [number, string] | false),
    estado: parte.x_estado === "no_ejecutado" ? "no_ejecutado" : "ejecutado",
    motivoNoEjec: texto(parte.x_motivo_no_ejec),
    sector: texto(parte.x_sector),
    clima: texto(parte.x_clima),
    objetivo: texto(parte.x_objetivo),
    tareas: texto(parte.x_tareas),
    observaciones: texto(parte.x_bloqueos),
    horasHombre: num(parte.x_horas_hombre),
    costoTotal: num(parte.x_costo_total),
    manoObra: manoObra.map((l) => ({
      tarea: String(l.x_tarea ?? "armado"),
      personas: num(l.x_personas),
      horaDesde: num(l.x_hora_desde),
      horaHasta: num(l.x_hora_hasta),
      horas: num(l.x_horas),
      horasHombre: num(l.x_horas_hombre),
    })),
    flete: fletes.length
      ? {
          cantidad: num(fletes[0].x_cantidad),
          tercerizado: fletes[0].x_tercerizado === true,
          costoManual: num(fletes[0].x_costo_manual),
        }
      : null,
    incidencias: incidencias.map((i) => ({
      tipo: String(i.x_tipo ?? "otro"),
      descripcion: texto(i.x_descripcion) ?? "",
    })),
    fotos: fotos.map((f) => ({
      momento: String(f.x_momento ?? "durante"),
      descripcion: texto(f.x_descripcion),
    })),
  };
}
