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
//
// ── POR QUÉ ACÁ SE CUENTAN LAS LLAMADAS DE A UNA ─────────────────────────────────────
//
// Un round-trip a Odoo Online cuesta ~250 ms. Pero NO todas las escrituras valen igual:
// el parte cuelga de una cadena de campos calculados que llega hasta la venta.
//
//   parte → OT (12 calculados sobre x_parte_diario_ids) → venta (4) → obra (5)
//
// Y en el camino la OT y la obra tienen un automatismo `on_create_or_write` que llama por
// HTTPS a esta misma app (/api/odoo/webhooks/...). Odoo espera esa respuesta dentro de la
// transacción. Medido contra la instancia real:
//
//   read de la OT ............................  250 ms
//   write en el parte que no toca costos .....  250 ms
//   create de una foto de 320 KB .............  560 ms
//   write en la OT (dispara el webhook) ...... 1330 ms
//   create de una línea de mano de obra ...... 1120 ms   ← recalcula costos → OT
//   create del parte ......................... 2740 ms   ← ídem, más la cascada entera
//
// O sea: las fotos son baratas y CADA ESCRITURA QUE LLEGA A LA OT CUESTA UN SEGUNDO. Por
// eso todo lo que se pueda viajar junto viaja junto —las líneas van anidadas en el mismo
// create de la cabecera, las fotos en un solo create, la OT se lee una vez y se escribe
// una vez— aunque el código quede menos obvio que una llamada por cosa.

import { searchRead, create, write, executeKw, read } from "./client";
import { DEJAN_ESTRUCTURA } from "@/lib/tablero/tipos-parte";
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
    // Sólo tiene sentido en el día que se trabajó: si no se ejecutó, el camión no fue.
    x_camion_en_obra: ejecutado && datos.camionEnObra,
  };
}

/** Cuántas líneas describe el parte. Sólo para informar el paso, ya no para contar creates. */
function cuentaLineas(datos: DatosCierre): number {
  if (datos.estado !== "ejecutado") return 0;
  const flete = datos.flete && datos.flete.cantidad > 0 ? 1 : 0;
  return datos.manoObra.length + flete + datos.incidencias.length;
}

/**
 * Las líneas del parte como COMANDOS one2many, para que viajen dentro del mismo
 * create/write de la cabecera.
 *
 * Antes eran tres llamadas aparte (una por modelo) y cada una recalculaba los costos del
 * parte, que suben a la OT, que dispara el webhook: ~1,1 s cada una. Anidadas, la cascada
 * corre UNA vez al cerrar la transacción de la cabecera.
 *
 * `reemplazar` antepone (5, 0, 0), que en Odoo desvincula todo lo que colgaba. Como
 * x_parte_diario_id es `required` en los tres modelos, desvincular equivale a borrar: no
 * quedan líneas huérfanas (verificado contra la instancia real). Es lo que hace falta al
 * reeditar un parte para que las líneas se reemplacen en vez de acumularse.
 *
 * La fecha de la línea NO es decorativa: Odoo busca con ella la tarifa vigente. Sin fecha,
 * el costo del flete sale CERO (medido contra la instancia real). Va en todas las líneas
 * que la tienen, aunque el valor lo siga calculando Odoo.
 */
function comandosLineas(
  datos: DatosCierre,
  fecha: string,
  reemplazar: boolean,
): Record<string, unknown[]> {
  const ejecutado = datos.estado === "ejecutado";
  const vaciar = reemplazar ? [[5, 0, 0]] : [];

  const manoObra = ejecutado
    ? datos.manoObra.map((l) => [
        0, 0,
        {
          x_fecha: fecha,
          x_tarea: l.tarea,
          x_personas: l.personas,
          x_hora_desde: l.horaDesde,
          x_hora_hasta: l.horaHasta,
        },
      ])
    : [];

  const flete = ejecutado && datos.flete && datos.flete.cantidad > 0
    ? [[
        0, 0,
        {
          x_fecha: fecha,
          x_cantidad: datos.flete.cantidad,
          x_tercerizado: datos.flete.tercerizado,
          // x_costo_manual solo tiene sentido en el tercerizado; el propio lo tarifa Odoo.
          x_costo_manual: datos.flete.tercerizado ? (datos.flete.costoManual ?? 0) : 0,
        },
      ]]
    : [];

  const incidencias = ejecutado
    ? datos.incidencias.map((i) => [0, 0, { x_tipo: i.tipo, x_descripcion: i.descripcion }])
    : [];

  // Sólo se mandan las claves que tienen algo que decir: en un alta sin líneas, un
  // one2many vacío es ruido que igual hace a Odoo mirar la relación.
  const cmds: Record<string, unknown[]> = {};
  for (const [campo, nuevas] of [
    ["x_mano_obra_ids", manoObra],
    ["x_flete_ids", flete],
    ["x_incidencia_ids", incidencias],
  ] as const) {
    const todos = [...vaciar, ...nuevas];
    if (todos.length > 0) cmds[campo] = todos;
  }
  return cmds;
}

// Cuántos bytes de base64 entran en un create de fotos. No es un límite de Odoo sino
// prudencia: un cuerpo JSON-RPC gigante es lo primero que se corta en un timeout, y si se
// corta hay que volver a subirlo entero. Con fotos de ~300 KB entran seis por lote.
const BYTES_POR_LOTE = 2_000_000;

/**
 * Sube las fotos del parte.
 *
 * EN LOTES, no de a una: `create` de Odoo acepta una lista de valores y crea todos los
 * registros en una sola llamada. Ocho fotos eran ocho round-trips; ahora son uno o dos.
 * A diferencia de las líneas, las fotos NO cuelgan de ningún campo calculado de la OT
 * (x_cant_fotos muere en el parte), así que no arrastran la cascada: una foto de 320 KB
 * cuesta ~560 ms y no ~1,1 s.
 *
 * SI UN LOTE FALLA se reintenta foto por foto. Cuesta una segunda subida en el peor caso,
 * pero es lo único que permite decir CUÁL se cayó: si de ocho se caen dos, el parte igual
 * queda guardado y quien las sacó sabe cuáles volver a cargar. Sin ese detalle la pantalla
 * diría "guardado" y las fotos no estarían.
 */
async function crearFotos(
  parteId: number,
  datos: DatosCierre,
): Promise<{ subidas: number; fallidas: string[] }> {
  if (datos.estado !== "ejecutado" || datos.fotos.length === 0) return { subidas: 0, fallidas: [] };

  const valores = (f: DatosCierre["fotos"][number]) => ({
    x_parte_diario_id: parteId,
    x_imagen: f.base64,
    x_momento: f.momento,
    x_descripcion: f.descripcion ?? false,
  });

  // Armado de lotes por peso, no por cantidad: cuatro fotos de 1 MB no son lo mismo que
  // cuatro de 200 KB. Una sola foto que se pase del presupuesto igual va sola en su lote.
  const lotes: DatosCierre["fotos"][] = [];
  let actual: DatosCierre["fotos"] = [];
  let pesoActual = 0;
  for (const f of datos.fotos) {
    if (actual.length > 0 && pesoActual + f.base64.length > BYTES_POR_LOTE) {
      lotes.push(actual);
      actual = [];
      pesoActual = 0;
    }
    actual.push(f);
    pesoActual += f.base64.length;
  }
  if (actual.length > 0) lotes.push(actual);

  const fallidas: string[] = [];
  let subidas = 0;

  // Los lotes van juntos y los serializa la cola de client.ts.
  await Promise.all(
    lotes.map(async (lote) => {
      try {
        await executeKw("x_aba_foto", "create", [lote.map(valores)]);
        subidas += lote.length;
        return;
      } catch {
        // Cae al reintento individual.
      }
      const resultados = await Promise.all(
        lote.map((f) => create("x_aba_foto", valores(f)).then(() => null, () => f.nombre)),
      );
      for (const nombre of resultados) {
        if (nombre === null) subidas++;
        else fallidas.push(nombre);
      }
    }),
  );

  return { subidas, fallidas };
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
  /** La persona confirmó que la obra terminó: la OT pasa a completada. */
  finalizarOt = false,
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

  // La OT se lee ACÁ, en paralelo con la escritura del parte, aunque recién se use al
  // final: sólo depende de otId, que ya está. Encadenada detrás del parte era un
  // round-trip más en el camino crítico por nada.
  //
  // El catch vacío NO se traga el error: sólo marca la promesa como manejada para que, si
  // el parte falla antes de que alguien la espere, Node no la reporte como rechazo huérfano.
  // Quien la await más abajo sigue recibiendo la excepción y la informa como paso fallido.
  const otLeida = leerOt(otId);
  otLeida.catch(() => {});

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

  // La cabecera y las líneas viajan en la MISMA llamada (ver comandosLineas). Al reeditar,
  // el (5, 0, 0) que antepone borra las anteriores dentro de la misma transacción, así que
  // ya no hace falta barrerlas antes ni cuidar el orden.
  //
  // Efecto secundario querido: si una línea es inválida, no se guarda nada. Antes el parte
  // quedaba igual y la línea no, y un parte sin mano de obra son cero horas-hombre y cero
  // costo — una obra que figura trabajada gratis. Es mejor que falle entero y se reintente.
  const lineas = cuentaLineas(datos);

  if (parteVinculado !== null) {
    parteId = parteVinculado;
    await write("x_aba_parte_diario", [parteId], {
      ...valoresParte({ ...datos, fecha }, otId),
      ...comandosLineas(datos, fecha, true),
    });
    registrar("Parte diario actualizado", true, `#${parteId}`);
    if (lineas > 0) registrar("Líneas reemplazadas", true, `${lineas}`);
  } else {
    parteId = await create("x_aba_parte_diario", {
      ...valoresParte({ ...datos, fecha }, otId),
      ...comandosLineas(datos, fecha, false),
    });
    registrar("Parte diario", true, `#${parteId}`);
    if (lineas > 0) registrar("Personal, fletes e incidencias", true, `${lineas} línea${lineas === 1 ? "" : "s"}`);

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

  // ── 2..5) Fotos, jornada y orden de trabajo ────────────────────────────────
  //
  // Son independientes entre sí: van todas juntas y la cola de client.ts las reparte.
  const [fotos, marcada, duplicados, ot] = await Promise.allSettled([
    crearFotos(parteId, datos),
    // El parte CONFIRMA la jornada: es la prueba de que pasó. Una jornada que se
    // trabajó no puede quedar como tentativa, y así el listado de partes puede ofrecer
    // las tentativas vencidas sin dejarlas colgadas en ese estado para siempre.
    write("x_aba_asignacion", [asignacionId], { x_parte_id: parteId, x_estado: "confirmada" }),
    avisoDuplicados,
    // Estado y as-built en una sola pasada por la OT: son dos decisiones distintas pero
    // un solo registro, y cada write a la OT dispara el webhook. Nada de esto puede tirar
    // abajo el parte: si falla, el parte queda igual y la OT se corrige a mano o en el
    // próximo cierre.
    actualizarOt(otLeida, finalizarOt, finalizarOt ? datos.ejecutadoReal : null, fecha),
  ]);

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

  if (ot.status === "rejected") {
    // Un solo write cubre estado y as-built, así que un fallo se los lleva a los dos: se
    // nombran los dos para que no parezca que el as-built sí quedó.
    registrar("Orden de trabajo", false, mensaje(ot.reason));
  } else {
    for (const paso of ot.value) registrar(paso, true);
  }

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

type OtDelParte = {
  id: number;
  x_estado: string | false;
  x_tipo: string | false;
  x_order_id: [number, string] | false;
};

/**
 * Los tres campos de la OT que el cierre necesita, en UN read.
 *
 * Antes eran dos: uno para decidir el estado y otro para el as-built. Los pedía la misma
 * OT, con 250 ms cada uno y sin depender el uno del otro.
 */
async function leerOt(otId: number): Promise<OtDelParte | null> {
  const [ot] = await read<OtDelParte>(
    "x_aba_orden_trabajo", [otId], ["x_estado", "x_tipo", "x_order_id"],
  );
  return ot ?? null;
}

/**
 * Deja la ORDEN DE TRABAJO como la dejó la jornada: su estado y, si corresponde, lo que
 * quedó efectivamente armado. Devuelve un paso por cada cosa que se movió.
 *
 * ── EL ESTADO ────────────────────────────────────────────────────────────────
 * EL PROBLEMA: el parte queda asociado a la OT pero no la cierra, y nadie la cerraba a
 * mano. Medido: de 48 OTs activas, 27 ya no tenían ninguna jornada pendiente en el
 * tablero. Se acumulan obras terminadas que siguen figurando como trabajo por hacer.
 *
 * Dos movimientos, con criterios distintos a propósito:
 *
 *  - pendiente → en_proceso es AUTOMÁTICO. Es seguro porque no esconde nada: la OT sigue
 *    en el tablero, sólo deja de decir que no se empezó.
 *
 *  - → completada NO es automático. Cerrarla al cargar el último parte planificado parece
 *    obvio y es peligroso: la duración estimada se equivoca seguido, así que una obra
 *    estimada en 3 jornadas que en realidad lleva 5 se cerraría sola en la tercera y
 *    desaparecería del tablero con la cuadrilla todavía trabajando. Por eso la decide una
 *    persona, y se le pregunta en el único momento en que tiene el dato: al cargar el
 *    parte de la última jornada que quedaba pendiente.
 *
 * ── LO QUE QUEDÓ ARMADO ──────────────────────────────────────────────────────
 * EL PROBLEMA: el armado real casi nunca es idéntico al vendido —cambian alturas, metros,
 * sectores— y esa diferencia hoy muere en la cabeza del capataz. Meses después, cuando el
 * cliente llama para desarmar, Comercial emite la OT describiendo lo VENDIDO y la cuadrilla
 * llega a bajar algo que no es lo que dice el papel.
 *
 *   OT.x_ejecutado_real       → el snapshot de ESTA intervención. Queda para siempre.
 *   venta.x_estructura_actual → el estado vigente de la obra. Es el que hereda el desarme:
 *                               el compute de x_detalle_tecnico lo lee primero.
 *
 * Una obra con un armado y dos ampliaciones deja tres snapshots y un solo estado actual.
 *
 * El desarme y el mantenimiento NO sellan: no cambian lo que hay en pie. El desmonte
 * parcial sí, porque deja menos estructura de la que había.
 *
 * ── POR QUÉ JUNTOS ───────────────────────────────────────────────────────────
 * Son dos decisiones independientes sobre el MISMO registro, y cada write a la OT arrastra
 * la cascada de calculados y el webhook: ~1,3 s. Escribirlas por separado pagaba eso dos
 * veces para guardar dos campos de la misma fila. La venta sí queda aparte: es otro
 * registro y sólo se toca cuando hay as-built.
 */
async function actualizarOt(
  otLeida: Promise<OtDelParte | null>,
  finalizar: boolean,
  ejecutadoReal: string | null,
  fecha: string,
): Promise<string[]> {
  const ot = await otLeida;
  if (!ot) return [];

  const cambios: Record<string, unknown> = {};
  const pasos: string[] = [];

  if (finalizar) {
    if (ot.x_estado !== "completada") {
      cambios.x_estado = "completada";
      pasos.push("Orden de trabajo completada");
    }
  } else if (ot.x_estado === "pendiente") {
    cambios.x_estado = "en_proceso";
    pasos.push("Orden de trabajo en proceso");
  }

  const texto = ejecutadoReal?.trim();
  const sella = !!texto && typeof ot.x_tipo === "string" && DEJAN_ESTRUCTURA.has(ot.x_tipo);
  if (sella) cambios.x_ejecutado_real = texto;

  if (Object.keys(cambios).length === 0) return pasos;
  await write("x_aba_orden_trabajo", [ot.id], cambios);

  if (!sella) return pasos;

  // Sin venta vinculada el snapshot igual queda en la OT; lo que se pierde es la herencia
  // al desarme, porque el estado vigente vive en la venta (x_obra_id está vacío en las
  // 1007 OTs, así que la venta es el único ancla que existe).
  const ventaId = m2oId(ot.x_order_id);
  if (!ventaId) {
    pasos.push("Lo que quedó armado, guardado en la OT (la OT no tiene venta vinculada)");
    return pasos;
  }

  await write("sale.order", [ventaId], {
    x_estructura_actual: texto,
    x_estructura_fecha: fecha || false,
    x_estructura_ot_id: ot.id,
  });
  pasos.push("Lo que quedó armado: la OT de desarme va a nacer con esto");
  return pasos;
}

/**
 * Actualiza un parte ya cargado (cabecera + líneas; las fotos se suman, no se reemplazan).
 *
 * Cabecera y líneas van en un solo write con (5, 0, 0) al frente: el borrado y el alta de
 * las nuevas ocurren dentro de la misma transacción, así que ya no hay que barrer primero
 * ni cuidar que el borrado no se lleve puestas a las recién creadas. Eran hasta siete
 * llamadas —tres búsquedas, tres unlink y tres creates, cada una recalculando los costos
 * que suben a la OT— y ahora es una.
 */
export async function editarParte(parteId: number, datos: DatosCierre, otId: number): Promise<ResultadoCierre> {
  const pasos: PasoCierre[] = [];

  // Las fotos no cuelgan de los calculados de la OT, así que no compiten con el write:
  // van en paralelo desde el arranque. El catch vacío es sólo para que un fallo del write
  // no deje esta promesa como rechazo huérfano; el await de abajo sigue viendo el error.
  const fotosSubiendo = crearFotos(parteId, datos);
  fotosSubiendo.catch(() => {});

  await write("x_aba_parte_diario", [parteId], {
    ...valoresParte(datos, otId),
    ...comandosLineas(datos, datos.fecha, true),
  });
  pasos.push({ nombre: "Parte diario actualizado", ok: true, detalle: `#${parteId}` });
  pasos.push({ nombre: "Líneas reemplazadas", ok: true, detalle: `${cuentaLineas(datos)}` });

  const { subidas, fallidas } = await fotosSubiendo;
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

const CAMPOS_PARTE = [
  "x_orden_trabajo_id", "x_fecha", "x_cuadrilla_id", "x_estado", "x_motivo_no_ejec",
  "x_sector", "x_clima", "x_objetivo", "x_tareas", "x_bloqueos", "x_horas_hombre",
  "x_costo_total", "x_cant_fotos", "x_puntero_id", "x_camion_en_obra",
];

/**
 * Lee VARIOS partes con sus líneas, en 5 llamadas fijas.
 *
 * POR QUÉ EN LOTE: el listado de un día trae un parte por jornada cargada, y leerlos de a
 * uno son 5 round-trips CADA UNO (cabecera + mano de obra + fletes + incidencias + fotos).
 * Con 5 jornadas cargadas eran 25 llamadas que la cola de client.ts reparte de a 4: unos
 * 5 segundos de pantalla en blanco antes de poder cargar el primer parte. Agrupando por
 * `in` son 5 llamadas, no importa cuántos partes haya.
 */
export async function fetchPartes(parteIds: number[]): Promise<Map<number, ParteCargado>> {
  const ids = [...new Set(parteIds)];
  if (ids.length === 0) return new Map();

  const [cabeceras, manoObra, fletes, incidencias, fotos] = await Promise.all([
    read<Record<string, unknown>>("x_aba_parte_diario", ids, CAMPOS_PARTE),
    searchRead<Record<string, unknown>>("x_aba_mano_obra", [["x_parte_diario_id", "in", ids]],
      ["x_parte_diario_id", "x_tarea", "x_personas", "x_hora_desde", "x_hora_hasta", "x_horas", "x_horas_hombre"]),
    searchRead<Record<string, unknown>>("x_aba_flete", [["x_parte_diario_id", "in", ids]],
      ["x_parte_diario_id", "x_cantidad", "x_tercerizado", "x_costo_manual"]),
    searchRead<Record<string, unknown>>("x_aba_incidencia", [["x_parte_diario_id", "in", ids]],
      ["x_parte_diario_id", "x_tipo", "x_descripcion"]),
    searchRead<Record<string, unknown>>("x_aba_foto", [["x_parte_diario_id", "in", ids]],
      ["x_parte_diario_id", "x_momento", "x_descripcion"]),
  ]);

  const num = (v: unknown) => (typeof v === "number" ? v : 0);
  const texto = (v: unknown) => (typeof v === "string" && v.trim() !== "" ? v : null);

  /** Agrupa las líneas por el parte al que cuelgan. */
  function porParte(filas: Record<string, unknown>[]): Map<number, Record<string, unknown>[]> {
    const mapa = new Map<number, Record<string, unknown>[]>();
    for (const f of filas) {
      const id = m2oId(f.x_parte_diario_id as [number, string] | false);
      if (id === null) continue;
      const lista = mapa.get(id);
      if (lista) lista.push(f);
      else mapa.set(id, [f]);
    }
    return mapa;
  }

  const manoObraPorParte = porParte(manoObra);
  const fletesPorParte = porParte(fletes);
  const incidenciasPorParte = porParte(incidencias);
  const fotosPorParte = porParte(fotos);

  const resultado = new Map<number, ParteCargado>();
  for (const parte of cabeceras) {
    const parteId = num(parte.id);
    if (!parteId) continue;
    const fletesDelParte = fletesPorParte.get(parteId) ?? [];
    resultado.set(parteId, {
      id: parteId,
      otId: m2oId(parte.x_orden_trabajo_id as [number, string] | false) ?? 0,
      fecha: texto(parte.x_fecha) ?? "",
      cuadrillaId: m2oId(parte.x_cuadrilla_id as [number, string] | false),
      punteroId: m2oId(parte.x_puntero_id as [number, string] | false),
      camionEnObra: parte.x_camion_en_obra === true,
      estado: parte.x_estado === "no_ejecutado" ? "no_ejecutado" : "ejecutado",
      motivoNoEjec: texto(parte.x_motivo_no_ejec),
      sector: texto(parte.x_sector),
      clima: texto(parte.x_clima),
      objetivo: texto(parte.x_objetivo),
      tareas: texto(parte.x_tareas),
      observaciones: texto(parte.x_bloqueos),
      horasHombre: num(parte.x_horas_hombre),
      costoTotal: num(parte.x_costo_total),
      manoObra: (manoObraPorParte.get(parteId) ?? []).map((l) => ({
        tarea: String(l.x_tarea ?? "armado"),
        personas: num(l.x_personas),
        horaDesde: num(l.x_hora_desde),
        horaHasta: num(l.x_hora_hasta),
        horas: num(l.x_horas),
        horasHombre: num(l.x_horas_hombre),
      })),
      flete: fletesDelParte.length
        ? {
            cantidad: num(fletesDelParte[0].x_cantidad),
            tercerizado: fletesDelParte[0].x_tercerizado === true,
            costoManual: num(fletesDelParte[0].x_costo_manual),
          }
        : null,
      incidencias: (incidenciasPorParte.get(parteId) ?? []).map((i) => ({
        tipo: String(i.x_tipo ?? "otro"),
        descripcion: texto(i.x_descripcion) ?? "",
      })),
      fotos: (fotosPorParte.get(parteId) ?? []).map((f) => ({
        momento: String(f.x_momento ?? "durante"),
        descripcion: texto(f.x_descripcion),
      })),
    });
  }
  return resultado;
}

/** Lee un parte con sus líneas, para ver o editar lo ya cargado. */
export async function fetchParte(parteId: number): Promise<ParteCargado | null> {
  return (await fetchPartes([parteId])).get(parteId) ?? null;
}
