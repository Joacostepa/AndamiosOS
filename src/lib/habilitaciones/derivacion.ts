// Lógica pura del módulo Habilitaciones: derivación de los inputs de Odoo, armado de
// los grupos de la bandeja y el veredicto que alimenta el candado.
//
// Sin dependencias de red ni de React a propósito: es lo que hay que poder razonar y
// probar sin levantar nada.
//
// ─────────────────────────────────────────────────────────────────────────────
// LA REGLA QUE ORDENA TODO ESTE ARCHIVO
//
// Cuatro de los trece campos x_hab_* de Odoo son COMPUTADOS, store=true y READONLY:
//
//   x_hab_semaforo  ← compute(x_hab_estado, x_hab_vencimiento, x_estado)
//   x_hab_etapa     ← compute(x_hab_estado, x_hab_semaforo, x_hab_fecha_consulta,
//                             x_hab_fecha_envio)
//   x_hab_alerta    ← compute(x_hab_semaforo, x_fecha_programada, x_estado)
//   x_hab_dias      ← compute(x_hab_fecha_consulta, x_hab_fecha)
//
// Están marcados readonly, pero eso es de interfaz: verificado contra Odoo 19, un write
// por RPC sobre x_hab_etapa SE ACEPTA y el valor queda — hasta que cambia cualquiera de
// sus depends y el compute lo pisa. O sea que la garantía no es que Odoo rechace la
// escritura, es que el compute gana en el siguiente recálculo.
//
// La conclusión práctica es la misma y por eso acá se derivan los CUATRO INPUTS y nada
// más: escribir un derivado no da un error, da una mentira que dura hasta el próximo
// cambio. Es peor que fallar.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  ClaveGrupo, Espera, EstadoRequisito, FilaBandeja, GrupoBandeja, HabAlerta, HabEstado,
  HabSemaforo, InputsHabilitacion, Permiso, Requisito,
} from "./tipos";

/** Hoy en YYYY-MM-DD, hora local. No usar toISOString(): corre el día por UTC. */
export function hoyISO(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function diasEntre(desde: string, hasta: string): number {
  const a = Date.parse(`${desde}T00:00:00`);
  const b = Date.parse(`${hasta}T00:00:00`);
  return Math.round((b - a) / 86_400_000);
}

/** La fecha `n` días después (o antes, con `n` negativo). */
export function sumarDias(fecha: string, n: number): string {
  const d = new Date(`${fecha}T00:00:00`);
  d.setDate(d.getDate() + n);
  return hoyISO(d);
}

function minFecha(fechas: (string | null)[]): string | null {
  const v = fechas.filter((f): f is string => !!f).sort();
  return v[0] ?? null;
}

/**
 * Los cuatro inputs que la app escribe en Odoo, derivados de los requisitos.
 *
 * IDEMPOTENTE A PROPÓSITO: las fechas salen de los propios requisitos y no de `hoy`, así
 * el job de reconciliación puede recalcular cuantas veces quiera y llegar siempre al
 * mismo resultado.
 *
 * DOS DE LOS CINCO NO SE DERIVAN, SE CONSERVAN, y por la misma razón: son decisiones de
 * una persona, no efectos de los papeles.
 *
 *   hab_fecha_consulta ← haberle preguntado al cliente qué pide (registrarConsulta)
 *   hab_estado=habilitada ← que alguien declare habilitada la obra (declararHabilitacion)
 *
 * OJO con la etapa: el compute de Odoo la resuelve por FECHAS, no por conteo de
 * requisitos. Etapa `a` significa "sin x_hab_fecha_consulta", no "sin requisitos", así
 * que una obra puede tener los nueve papeles cargados y seguir en `a` — y está bien:
 * cargar el paquete no es haberle preguntado nada a nadie.
 */
export function derivarInputs(
  requisitos: Requisito[],
  actual: Pick<InputsHabilitacion, "hab_fecha_consulta" | "hab_vencimiento">,
  opts: { triage: "aplica" | "no_aplica" | null; habilitadaEl?: string | null; triadaEl?: string | null },
): InputsHabilitacion {
  // NO HAY GRIS: una obra está habilitada o no lo está. "No aplica" no es un tercer
  // estado colgado al costado — es una obra que no necesita tramitar nada, o sea que no
  // tiene nada que la frene: queda HABILITADA, en verde, sin pasar por los requisitos.
  //
  // Antes iba a un `no_aplica` que Odoo pintaba gris con la etiqueta "sin datos de
  // habilitación", y eso mezclaba dos cosas distintas —"no hace falta" y "no sabemos"—
  // en el mismo color. Con 27 de 60 obras ahí, casi la mitad del tablero no decía nada.
  //
  // El dato de que no aplicaba no se pierde: vive en hab_ots.triage, que es lo que arma
  // la sección "No aplican" de la bandeja.
  if (opts.triage === "no_aplica") {
    return {
      hab_estado: "habilitada",
      hab_fecha_consulta: actual.hab_fecha_consulta,
      hab_fecha_envio: null,
      hab_fecha: opts.habilitadaEl ?? opts.triadaEl ?? null,
      hab_vencimiento: actual.hab_vencimiento,
    };
  }

  // El envío queda sellado por el PRIMER requisito que salió, aunque después se rebote:
  // la etapa `c` describe que la documentación ya fue mandada al menos una vez.
  const fechaEnvio = minFecha(requisitos.map((r) => r.fecha_envio));

  const algunoMovido = requisitos.some((r) => r.estado !== "pendiente");

  // HABILITAR ES UNA DECISIÓN, NO UN EFECTO. Antes la obra pasaba sola a `habilitada` al
  // aprobar el último papel: nadie la habilitaba, pasaba — y el semáforo se ponía verde
  // sin que quedara registrado quién se hizo cargo. Ahora el estado sale de que alguien
  // haya apretado el botón, y la derivación como mucho llega a `en_curso`.
  //
  // Es la misma regla que ya valía para hab_fecha_consulta, aplicada donde faltaba.
  let estado: HabEstado = "pendiente";
  if (opts.habilitadaEl) estado = "habilitada";
  else if (algunoMovido || fechaEnvio) estado = "en_curso";

  return {
    hab_estado: estado,
    hab_fecha_consulta: actual.hab_fecha_consulta,
    hab_fecha_envio: fechaEnvio,
    // La fecha que se muestra es la del día en que se habilitó, no la de hoy: una
    // reconciliación en marzo no puede "re-habilitar" en marzo una obra de agosto.
    hab_fecha: opts.habilitadaEl ?? null,
    hab_vencimiento: actual.hab_vencimiento,
  };
}

/**
 * Si la obra está en condiciones de habilitarse, y qué le falta si no.
 *
 * Sin requisitos NO está lista, y el motivo se dice: antes una obra a la que se le
 * borraban todos los requisitos quedaba trabada para siempre en la etapa `b` —
 * `every()` sobre una lista vacía da true, así que había que pedir `length > 0`, y eso
 * dejaba un estado sin salida y sin aviso. Ahora la salida existe: el botón queda
 * apagado, dice por qué, y la excepción con motivo escrito sigue disponible.
 */
export function estadoDeHabilitacion(requisitos: Requisito[]): {
  listo: boolean;
  total: number;
  aprobados: number;
  faltan: number;
  motivo: string | null;
} {
  const total = requisitos.length;
  const aprobados = requisitos.filter((r) => r.estado === "aprobado").length;
  const faltan = total - aprobados;

  if (total === 0) {
    return { listo: false, total, aprobados, faltan, motivo: "No hay requisitos cargados." };
  }
  if (faltan > 0) {
    return {
      listo: false, total, aprobados, faltan,
      motivo: `Falta${faltan === 1 ? "" : "n"} aprobar ${faltan} de ${total}.`,
    };
  }
  return { listo: true, total, aprobados, faltan, motivo: null };
}

/**
 * Espeja los computes de Odoo para la UI optimista. NO se escribe nunca.
 *
 * La ficha lee la OT y su venta en dos llamadas SECUENCIALES a Odoo —hay que leer la OT
 * para saber cuál es la venta— y eso son ~520 ms medidos, más el resto del viaje. Si
 * después de habilitar se invalidara la ficha, cada clic costaría cerca de un segundo.
 *
 * Y sería peor que lento: el push a Odoo sale en after(), o sea DESPUÉS de responder, así
 * que un refetch disparado por la respuesta puede leer el estado viejo y mostrarlo. Lento
 * y desactualizado a la vez.
 *
 * Por eso se predice acá con la misma fórmula que corre en Odoo (ver el encabezado de
 * este archivo) y se parchea la caché. Es una PREDICCIÓN para que la pantalla responda ya;
 * la próxima lectura real la corrige, y si el push falló queda en sync_estado = 'error',
 * visible en el contador de la bandeja.
 *
 * Si algún día cambia el compute en Odoo, cambia también acá. Es el precio de no esperar
 * medio segundo por cada clic, y está acotado a estos dos campos.
 */
export function preverDerivados(v: {
  habEstado: HabEstado | null;
  fechaConsulta: string | null;
  fechaEnvio: string | null;
  vencimiento: string | null;
  otEjecutada: boolean;
  hoy?: string;
}): { etapa: "a" | "b" | "c" | "d" | "e" | "f"; semaforo: "rojo" | "amarillo" | "verde" | "vencida" } {
  const hoy = v.hoy ?? hoyISO();
  const estado = v.habEstado ?? "pendiente";

  const semaforo =
    estado === "habilitada"
      ? v.vencimiento && v.vencimiento < hoy && !v.otEjecutada ? "vencida" : "verde"
      : estado === "en_curso" ? "amarillo"
      : "rojo";

  const etapa =
    semaforo === "vencida" ? "e"
    : estado === "habilitada" ? "d"
    : v.fechaEnvio ? "c"
    : v.fechaConsulta ? "b"
    : "a";

  return { etapa, semaforo };
}

// ─── Lo que depende de HOY ──────────────────────────────────────────────────
//
// x_hab_semaforo, x_hab_alerta y x_hab_dias son store=true en Odoo y sus computes usan
// date.today(), pero sus depends son CAMPOS, no el día: se recalculan cuando alguien
// escribe la OT y no cuando pasa el tiempo. Una obra sin habilitar que entra en la
// ventana de 3 días sin que nadie la toque sigue diciendo `proxima`; un vencimiento que
// pasa sin escrituras sigue en verde. x_hab_dias encima cuenta desde la fecha de consulta,
// que casi nadie registra: medido el 09/10, 78 de 81 OTs activas decían 0.
//
// Decisión de JS (09/10): lo calcula la app, con la misma fórmula que Odoo pero con el
// día de hoy. Odoo sigue guardando sus valores; la app ya no los lee para decidir nada.

const OT_TERMINADA = new Set(["completada", "cancelada"]);

/**
 * El semáforo de Odoo, corregido por el día de hoy.
 *
 * Lo único del semáforo que depende del tiempo es `vencida`: rojo, amarillo y verde salen
 * de x_hab_estado, que sí se escribe cada vez que cambia. Así que se respeta lo que dice
 * Odoo y sólo se recalcula si una habilitada ya venció (o dejó de estarlo).
 */
export function semaforoHoy(v: {
  semaforo: HabSemaforo | null;
  vencimiento: string | null;
  estadoOt: string;
  hoy?: string;
}): HabSemaforo {
  const hoy = v.hoy ?? hoyISO();
  const s = v.semaforo ?? "rojo";
  if (s !== "verde" && s !== "vencida") return s;
  return v.vencimiento && v.vencimiento < hoy && !OT_TERMINADA.has(v.estadoOt) ? "vencida" : "verde";
}

/**
 * x_hab_alerta, calculada hoy. Es el compute de Odoo tal cual (leído de ir.model.fields
 * el 09/10), con el día de hoy en vez del día del último write.
 *
 * Usa la fecha PROGRAMADA y no la primera jornada del tablero: planificar en el tablero ya
 * actualiza x_fecha_programada, y así la bandeja, el tablero y la lista de órdenes cuentan
 * lo mismo.
 */
export function alertaDe(v: {
  semaforo: HabSemaforo;
  fechaProgramada: string | null;
  estadoOt: string;
  hoy?: string;
}): HabAlerta {
  const hoy = v.hoy ?? hoyISO();
  if (OT_TERMINADA.has(v.estadoOt)) return "ok";
  if (v.semaforo === "vencida") return "vencida";
  if (v.semaforo === "verde" || !v.fechaProgramada) return "ok";
  const d = diasEntre(hoy, v.fechaProgramada);
  return d < 0 ? "atrasada" : d <= 3 ? "critica" : "proxima";
}

/** Cómo se dice cada alerta en una línea. `ok` y `proxima` no se dicen: son lo normal. */
export const ALERTA_LABEL: Partial<Record<HabAlerta, string>> = {
  critica: "se arma en 3 días o menos",
  atrasada: "la fecha programada ya pasó",
  vencida: "la habilitación venció",
};

// ─── De quién es la pelota, y desde cuándo ─────────────────────────────────

/**
 * Desde cuántos días se pinta en rojo cada situación.
 *
 * Lo nuestro, desde el día siguiente: decisión de JS (09/10). Lo del cliente conserva los
 * umbrales que ya tenía la bandeja (una semana para validar, dos para decir qué pide), y
 * decidir si aplica también: 4 días.
 */
export const ROJO_DESDE = {
  sinTriar: 4,
  nuestra: 1,
  clienteValida: 8,
  clientePide: 15,
} as const;

export type DatosEspera = {
  triage: "aplica" | "no_aplica" | null;
  habilitada: boolean;
  /** Cuándo entró la obra a la bandeja (hab_ots.created_at). */
  creadaEl: string | null;
  triadaEl: string | null;
  /** La última vez que volvió de pospuesta o se reactivó: ahí arranca de nuevo lo nuestro. */
  vueltaEl: string | null;
  fechaConsulta: string | null;
  requisitos: Pick<Requisito, "nombre" | "estado" | "fecha_envio" | "fecha_resolucion">[];
};

function maxFecha(fechas: (string | null)[]): string | null {
  const v = fechas.filter((f): f is string => !!f).sort();
  return v[v.length - 1] ?? null;
}

/**
 * Lo que la fila dice a la derecha: qué falta, de quién es el próximo movimiento y
 * cuántos días lleva así.
 *
 * REEMPLAZA AL "0 d · esperando a STEPANSKY". Ese texto salía de si la venta tenía la
 * modalidad de permiso cargada —no de la documentación— y el número de x_hab_dias, que
 * casi siempre es 0. Acá las dos cosas salen de los requisitos, que es donde está el
 * trabajo: una obra con la nómina sin mandar espera por nosotros aunque Odoo diga que
 * la pelota es del cliente.
 */
export function esperaDe(d: DatosEspera, hoy: string = hoyISO()): Espera | null {
  if (d.triage === "no_aplica" || d.habilitada) return null;

  const armar = (
    clave: Espera["clave"], texto: string, desde: string | null, rojoDesde: number,
  ): Espera => {
    const dias = desde ? Math.max(0, diasEntre(desde, hoy)) : null;
    const pelota = clave === "cliente_pide" || clave === "cliente_revisa" ? "cliente" : "nuestra";
    return { clave, pelota, texto, desde, dias, rojo: dias !== null && dias >= rojoDesde };
  };

  if (d.triage === null) {
    return armar("triar", "decidir si aplica", d.creadaEl, ROJO_DESDE.sinTriar);
  }

  // Lo nuestro arranca en el triage, o en la última vez que la obra volvió a la cola:
  // una obra que estuvo pospuesta un mes no vuelve con un mes de atraso en rojo.
  const nuestraDesde = maxFecha([d.triadaEl, d.vueltaEl]);
  const reqs = d.requisitos;
  const de = (estado: EstadoRequisito) => reqs.filter((r) => r.estado === estado);
  const observados = de("observado");
  const pendientes = de("pendiente");
  const enviados = de("enviado");
  const aprobados = de("aprobado");

  if (reqs.length === 0) {
    return armar("cargar", "cargar los requisitos", nuestraDesde, ROJO_DESDE.nuestra);
  }
  if (observados.length > 0) {
    return armar(
      "corregir",
      observados.length === 1 ? `corregir ${observados[0].nombre}` : `corregir ${observados.length} observados`,
      maxFecha(observados.map((r) => r.fecha_resolucion)),
      ROJO_DESDE.nuestra,
    );
  }
  if (aprobados.length === reqs.length) {
    return armar(
      "habilitar", "habilitar: está todo aprobado",
      maxFecha(aprobados.map((r) => r.fecha_resolucion)), ROJO_DESDE.nuestra,
    );
  }
  if (pendientes.length > 0) {
    // Se le preguntó qué pide y todavía no salió nada: la pelota sí es del cliente.
    if (d.fechaConsulta && enviados.length === 0 && aprobados.length === 0) {
      return armar("cliente_pide", "el cliente dice qué pide", d.fechaConsulta, ROJO_DESDE.clientePide);
    }
    return armar(
      "mandar",
      pendientes.length === 1 ? `mandar ${pendientes[0].nombre}` : `mandar ${pendientes.length} de ${reqs.length}`,
      nuestraDesde,
      ROJO_DESDE.nuestra,
    );
  }
  // Todo lo que no está aprobado está mandado: espera al cliente desde el papel más viejo
  // que sigue sin respuesta.
  return armar(
    "cliente_revisa",
    enviados.length === 1 ? `el cliente revisa ${enviados[0].nombre}` : `el cliente revisa ${enviados.length} de ${reqs.length}`,
    minFecha(enviados.map((r) => r.fecha_envio)),
    ROJO_DESDE.clienteValida,
  );
}

// ─── Bandeja ────────────────────────────────────────────────────────────────
//
// REDISEÑO DEL 09/10 (docs/habilitaciones-rediseno.md): los grupos dicen DE QUIÉN ES LA
// PELOTA, no en qué etapa de Odoo está la obra. Antes eran etapas ("Falta consultar…",
// "Ya le mandamos todo…") y no se correspondían con el trabajo: una obra con todo aprobado
// esperando que la habilitáramos aparecía como "falta que el cliente valide".

/** Días de aviso antes del vencimiento. El módulo avisa, no renueva. */
export const DIAS_AVISO_VENCIMIENTO = 30;

const TITULOS: Record<ClaveGrupo, { titulo: string; nota: string }> = {
  urgentes: { titulo: "Urgentes: se arman en 3 días o menos", nota: "o la fecha ya pasó, y siguen sin habilitar" },
  nuevas: { titulo: "Nuevas: ¿piden papeles?", nota: "Aplica crea la Nómina ART · No aplica la deja habilitada" },
  para_hacer: { titulo: "Para hacer", nota: "la pelota es nuestra · en rojo desde el día siguiente" },
  cliente: { titulo: "Esperando al cliente", nota: "en rojo después de una semana" },
  permiso: { titulo: "Esperan el permiso", nota: "vuelven solas cuando sale el permiso, o 10 días antes de armar" },
  por_vencer: { titulo: `Vencen en menos de ${DIAS_AVISO_VENCIMIENTO} días`, nota: "habilitadas con la documentación por vencer" },
};

/** Orden de prioridad. El primero que cumple se queda con la fila. */
const ORDEN: ClaveGrupo[] = ["urgentes", "nuevas", "para_hacer", "cliente", "permiso", "por_vencer"];

const PELIGRO = new Set<ClaveGrupo>(["urgentes"]);
/** Arrancan plegados: no hay nada que hacer con ellos hoy, pero tienen que estar a mano. */
const PLEGADOS = new Set<ClaveGrupo>(["permiso"]);

const RANGO_URGENCIA: Record<FilaBandeja["urgencia"], number> = { alta: 0, media: 1, baja: 2 };

/**
 * La fecha en que se arma: la primera jornada del tablero si está planificada, y si no la
 * programada. Es la que cuenta para ordenar, para la columna "Se arma" y para la vuelta de
 * las que esperan el permiso.
 */
export function fechaDeArmado(v: { primeraJornada: string | null; fechaProgramada: string | null }): string | null {
  return v.primeraJornada ?? v.fechaProgramada;
}

/** Lo que grupoDe necesita de una obra. Lo cumplen la fila de la bandeja y la ficha. */
export type DatosGrupo = Pick<
  FilaBandeja,
  | "triage" | "habilitadaEl" | "alerta" | "espera" | "vencimiento" | "modalidad" | "tramite"
  | "tipo" | "primeraJornada" | "fechaProgramada"
>;

/**
 * Si la obra está en "Esperan el permiso": el cliente pidió no armar sin el permiso emitido,
 * todavía no salió, y falta más de 10 días para armar (o no tiene fecha).
 *
 * REEMPLAZA AL POSPONER "LLEVA PERMISO" A MANO (decisión de JS, 09/10): 12 de las 15
 * pospuestas de ese día tenían ese motivo, escrito de cinco formas. Ahora vuelve sola —
 * cuando la gestoría escribe "emitido" en Odoo, o 10 días antes de armar— y nadie tiene que
 * acordarse de posponerla.
 *
 * Sólo `esperar_permiso`: con número de expediente o sin permiso, los papeles se mandan
 * igual. Y sólo lo que arma: a un desarme el permiso no lo frena.
 */
export function esperaElPermiso(o: DatosGrupo, hoy: string = hoyISO()): boolean {
  if (o.triage !== "aplica" || o.habilitadaEl) return false;
  if (o.modalidad !== "esperar_permiso" || o.tramite === "emitido") return false;
  if (!TIPOS_QUE_OCUPAN_VIA_PUBLICA.has(o.tipo)) return false;
  const armado = fechaDeArmado(o);
  return !armado || diasEntre(hoy, armado) > DIAS_ANTES_DE_LA_OBRA;
}

/** Cuándo vuelve a la cola una obra que espera el permiso, si no sale antes. */
export function vueltaPorPermiso(o: Pick<DatosGrupo, "primeraJornada" | "fechaProgramada">): string | null {
  const armado = fechaDeArmado(o);
  return armado ? sumarDias(armado, -DIAS_ANTES_DE_LA_OBRA) : null;
}

/**
 * A qué grupo va una obra, o null si no está en trámite.
 *
 * Urgente le gana a todo, incluso a "nueva": una obra que se arma pasado mañana sin triar
 * es lo primero que hay que mirar. La alerta llega ya calculada con el día de hoy.
 */
export function grupoDe(o: DatosGrupo, hoy: string): ClaveGrupo | null {
  if (o.triage === "no_aplica") return null;
  if (o.habilitadaEl) {
    return o.vencimiento && diasEntre(hoy, o.vencimiento) <= DIAS_AVISO_VENCIMIENTO ? "por_vencer" : null;
  }
  if (o.alerta === "critica" || o.alerta === "atrasada") return "urgentes";
  if (o.triage === null) return "nuevas";
  if (esperaElPermiso(o, hoy)) return "permiso";
  if (o.espera?.pelota === "cliente") return "cliente";
  return "para_hacer";
}

/**
 * Arma los grupos. Son EXCLUYENTES: una obra que se arma en 2 días y además espera al
 * cliente califica para dos, y aparece sólo en el primero. Si una fila se contara dos
 * veces los números dejarían de servir para decidir por dónde empezar, que es lo único
 * que se les pide.
 */
export function agruparBandeja(filas: FilaBandeja[], hoy: string = hoyISO()): GrupoBandeja[] {
  const porClave = new Map<ClaveGrupo, FilaBandeja[]>(ORDEN.map((c) => [c, []]));

  for (const fila of filas) {
    const clave = grupoDe(fila, hoy);
    if (clave) porClave.get(clave)!.push(fila);
  }

  return ORDEN.map((clave) => ({
    clave,
    titulo: TITULOS[clave].titulo,
    nota: TITULOS[clave].nota,
    peligro: PELIGRO.has(clave),
    plegado: PLEGADOS.has(clave),
    // Dentro de cada grupo, primero la prioridad de la OT —alta, media, baja—, después lo
    // que se arma antes y, sin fecha, lo que lleva más días esperando.
    //
    // LA PRIORIDAD ORDENA, NO AGRUPA. Un grupo "Prioridad alta" arriba de todo sacaría a la
    // obra del grupo que dice qué hay que hacer con ella, que es la pregunta de esta bandeja.
    filas: porClave.get(clave)!.sort((a, b) => {
      const porUrgencia = RANGO_URGENCIA[a.urgencia] - RANGO_URGENCIA[b.urgencia];
      if (porUrgencia !== 0) return porUrgencia;
      const fa = fechaDeArmado(a);
      const fb = fechaDeArmado(b);
      if (fa && fb && fa !== fb) return fa.localeCompare(fb);
      if (fa && !fb) return -1;
      if (fb && !fa) return 1;
      return (b.espera?.dias ?? 0) - (a.espera?.dias ?? 0);
    }),
  })).filter((g) => g.filas.length > 0);
}

// ─── Posponer ───────────────────────────────────────────────────────────────

/**
 * Cuántos días antes de la obra vuelve a la bandeja una habilitación pospuesta.
 *
 * Es el margen para armar, mandar y hacer aprobar la documentación sin mandarla tan
 * temprano que la nómina se venza antes de que entre la cuadrilla. Decisión de JS
 * (2026-09-13).
 */
export const DIAS_ANTES_DE_LA_OBRA = 10;

export type CausaVuelta = "elegida" | "programada" | "planificacion";

/**
 * Cuándo vuelve a la bandeja una obra pospuesta: la MÁS TEMPRANA entre la fecha que eligió
 * Habilitaciones, 10 días antes de la fecha programada y 10 días antes de la primera
 * jornada del tablero.
 *
 * POSPONER NO ES ESCONDER. La fecha elegida es un "no antes de lo necesario", y la obra
 * vuelve antes si se acerca: si Operaciones la planifica para dentro de una semana, esperar
 * a la fecha elegida sería descubrir el faltante el día que la cuadrilla no puede entrar.
 *
 * Nunca al revés: si la obra se atrasa, la vuelta no se aleja. Eso no se resuelve acá sino
 * guardando la fecha adelantada (ver resolverPospuestas en servicio.ts).
 *
 * Ante empate gana la planificación, que es la causa más concreta y la que se avisa.
 */
export function vueltaDePospuesta(v: {
  hasta: string;
  fechaProgramada: string | null;
  primeraJornada: string | null;
}): { fecha: string; causa: CausaVuelta } {
  const candidatas: { fecha: string; causa: CausaVuelta }[] = [{ fecha: v.hasta, causa: "elegida" }];
  if (v.fechaProgramada) {
    candidatas.push({ fecha: sumarDias(v.fechaProgramada, -DIAS_ANTES_DE_LA_OBRA), causa: "programada" });
  }
  if (v.primeraJornada) {
    candidatas.push({ fecha: sumarDias(v.primeraJornada, -DIAS_ANTES_DE_LA_OBRA), causa: "planificacion" });
  }
  return candidatas.reduce((min, c) => (c.fecha <= min.fecha ? c : min));
}

/**
 * La última fecha que se puede elegir al posponer: 10 días antes de lo primero que pase
 * —la fecha programada o la primera jornada—. Null si la obra no tiene ninguna de las dos:
 * ahí no hay contra qué limitar y vale la fecha que se elija.
 */
export function topePosponer(fechaProgramada: string | null, primeraJornada: string | null): string | null {
  const obra = [fechaProgramada, primeraJornada].filter((f): f is string => !!f).sort()[0];
  return obra ? sumarDias(obra, -DIAS_ANTES_DE_LA_OBRA) : null;
}

// ─── Veredicto y candado ────────────────────────────────────────────────────

export type Friccion =
  /** El cliente pidió no armar sin el permiso emitido. Bloquea, con salida por excepción. */
  | { tipo: "bloqueo"; motivo: string }
  /** Falta la decisión del cliente. Un clic que registra el pedido al técnico. */
  | { tipo: "pedir_modalidad"; motivo: string; tecnico: string | null; dias: number | null }
  /** Se armó con expediente y el número no está. Motivo escrito obligatorio. */
  | { tipo: "falta_expediente"; motivo: string }
  /**
   * La jornada quedó ANTES del día a partir del cual el cliente recibe la obra.
   *
   * No sale de friccionAlConfirmar: ésta no es del permiso sino del acuerdo comercial, y
   * se calcula en el cliente porque el tablero ya tiene los dos datos (`fechaDesde` de la
   * OT y el día del bloque) sin ir a buscar nada. Vive en este tipo igualmente porque el
   * diálogo del candado es uno solo: lo que cambia es el motivo, no el gesto.
   */
  | { tipo: "antes_de_piso"; motivo: string; piso: string; fecha: string }
  /**
   * La obra TERMINA después de la fecha límite que puso el cliente.
   *
   * El otro extremo de la misma ventana, y por las mismas razones que el piso vive acá.
   * Ojo con la asimetría: el piso mira el PRIMER día de la jornada y esto mira el ÚLTIMO
   * de la obra entera, porque lo que el cliente pide es el trabajo terminado. Ver
   * src/lib/tablero/ventana.ts.
   */
  | { tipo: "despues_de_techo"; motivo: string; techo: string; fecha: string }
  | null;

/**
 * Qué pasa al CONFIRMAR una jornada de esta obra.
 *
 * POR QUÉ EN CONFIRMAR Y NO EN PLANIFICAR: planificar es un borrador, y poner una obra
 * tentativa para la semana que viene sabiendo que el permiso sale en tres días es
 * legítimo. Bloquear ahí frena a Operaciones por un dato que depende de terceros, y la
 * reacción sería buscarle la vuelta. Confirmar ya significa algo preciso en el sistema
 * (ver cierre.ts): la fecha se le promete al cliente y la cuadrilla queda tomada.
 *
 * Cargar el parte NUNCA se evalúa acá: si la cuadrilla fue igual, se registra igual.
 */
export function friccionAlConfirmar(
  permiso: Pick<Permiso, "modalidad" | "tramite" | "expedienteNro" | "modalidadDefinida" | "tecnicoNombre">,
  hoy: string = hoyISO(),
): Friccion {
  const { modalidad, tramite, expedienteNro } = permiso;

  if (modalidad === "esperar_permiso" && tramite !== "emitido") {
    return {
      tipo: "bloqueo",
      motivo: "El cliente pidió no armar hasta que el permiso esté emitido.",
    };
  }

  // LA FRICCIÓN TIENE QUE CAER EN QUIEN PUEDE RESOLVERLA. Quien confirma es Operaciones
  // y Operaciones no puede definir la modalidad: sólo el técnico de la obra. Pedirle un
  // texto por algo que no está en su mano lo entrena a escribir "no sé" o un punto.
  if (!modalidad) {
    return {
      tipo: "pedir_modalidad",
      motivo: "Esta obra no tiene definida la modalidad de permiso.",
      tecnico: permiso.tecnicoNombre,
      dias: permiso.modalidadDefinida ? diasEntre(permiso.modalidadDefinida, hoy) : null,
    };
  }

  // Acá el dato lo tenemos nosotros, así que el motivo escrito sí corresponde: son 115
  // obras armadas amparadas en un expediente cuyo número no quedó en ningún lado.
  if (modalidad === "con_expediente" && !expedienteNro?.trim()) {
    return {
      tipo: "falta_expediente",
      motivo: "La obra se ampara en un expediente y el número no está cargado.",
    };
  }

  return null;
}

/**
 * Los tipos de OT que PONEN estructura nueva en la vía pública.
 *
 * EL PERMISO PROTEGE OCUPAR LA VEREDA, así que se pide donde eso pasa y no en el resto.
 * Un desarme saca el andamio: si el permiso no está, desarmar es lo que RESUELVE el
 * problema, no lo que lo crea — frenarlo deja la estructura en la calle, que es
 * exactamente lo contrario de lo que el freno persigue.
 *
 * NO ES UN DETALLE DE BORDE, y el motivo es cómo están armados los datos: la modalidad de
 * permiso vive en la VENTA, no en la OT, así que todas las OTs de una obra la comparten.
 * El desarme de una obra hereda el "esperar permiso" que se cargó para su armado, y sin
 * este corte lo hereda para siempre: el permiso de un armado de marzo seguiría frenando
 * el desarme de octubre.
 */
const TIPOS_QUE_OCUPAN_VIA_PUBLICA = new Set(["armado", "ampliacion"]);

/**
 * Lo que FRENA al confirmar en el tablero. Es un subconjunto de friccionAlConfirmar.
 *
 * SÓLO APLICA A LO QUE ARMA (ver TIPOS_QUE_OCUPAN_VIA_PUBLICA). Las otras confirman sin
 * preguntas: Operaciones no tiene nada que decidir sobre el permiso de una obra que está
 * sacando de la calle.
 *
 * DEJA AFUERA `pedir_modalidad` a propósito, y esa es toda la diferencia. Esa fricción
 * salta cuando la modalidad está vacía, o sea en el 98,9% de las órdenes, y por eso el
 * candado se apagó entero el 3/9: un aviso que sale siempre deja de significar algo.
 *
 * Ahora la modalidad se pregunta en la venta y es obligatoria para confirmarla, así que
 * "falta la modalidad" deja de ser un estado que Operaciones tenga que resolver mirando
 * una tarjeta — se resuelve antes, donde está quien sabe la respuesta.
 *
 * EL DATO ES EL CORTE, no la fecha. Las dos que quedan exigen que la modalidad esté
 * cargada, así que las órdenes viejas —sin modalidad— no disparan nada solas. Medido al
 * 5/9 sobre las 60 OTs activas: 35 sin modalidad no avisan, 9 avisarían por permiso sin
 * emitir y 4 por expediente sin número.
 *
 * Y no incluye el caso "se arma sin expediente ni permiso": es una excepción ya decidida
 * comercialmente al cotizar, y volver a preguntarla al planificar sería hacerle firmar dos
 * veces lo mismo a Operaciones.
 */
export function friccionDelTablero(
  permiso: Parameters<typeof friccionAlConfirmar>[0],
  tipoOt: string | null,
  hoy: string = hoyISO(),
): Friccion {
  if (!TIPOS_QUE_OCUPAN_VIA_PUBLICA.has(tipoOt ?? "")) return null;
  const f = friccionAlConfirmar(permiso, hoy);
  return f && f.tipo === "pedir_modalidad" ? null : f;
}

/**
 * Los dos trámites cruzados, en una línea, para el encabezado de la ficha.
 *
 * DICE LO MISMO QUE EL TABLERO, y por eso usa friccionDelTablero y no friccionAlConfirmar.
 * Antes usaba la otra, que no mira el tipo de OT y todavía pedía la modalidad: a un desarme
 * le decía "falta la modalidad de permiso" y a uno con "esperar permiso" le decía "no se
 * puede armar", cuando el tablero lo deja confirmar sin preguntar nada.
 *
 * TRES TONOS Y NO DOS. "Se puede armar, con pendientes" iba en verde con tilde, igual que
 * una obra resuelta: ahora lo que avisa sin frenar va en ámbar.
 */
export function veredicto(
  permiso: Parameters<typeof friccionAlConfirmar>[0],
  opts: {
    tipoOt: string | null;
    /** Habilitada a mano, o marcada "no aplica" (que también la deja habilitada). */
    habilitada: boolean;
    /** Todos los requisitos aprobados, pero nadie apretó "Habilitar obra" todavía. */
    listaParaHabilitar: boolean;
    fechaProgramada: string | null;
  },
  hoy: string = hoyISO(),
): { tono: "ok" | "aviso" | "bloqueo"; titulo: string; detalle: string } {
  const friccion = friccionDelTablero(permiso, opts.tipoOt, hoy);
  const verbo = opts.tipoOt === "desarme" ? "desarmar" : "armar";

  const cuando = opts.fechaProgramada
    ? diasEntre(hoy, opts.fechaProgramada) === 0
      ? " · programada para hoy"
      : diasEntre(hoy, opts.fechaProgramada) === 1
        ? " · programada para mañana"
        : diasEntre(hoy, opts.fechaProgramada) > 0
          ? ` · programada en ${diasEntre(hoy, opts.fechaProgramada)} días`
          : ` · la fecha pasó hace ${-diasEntre(hoy, opts.fechaProgramada)} días`
    : "";

  const papeles = opts.habilitada
    ? null
    : opts.listaParaHabilitar
      ? "Los papeles están aprobados: falta habilitarla."
      : "Falta la documentación del cliente.";

  if (friccion?.tipo === "bloqueo") {
    return {
      tono: "bloqueo",
      titulo: `No se puede ${verbo}${cuando}`,
      detalle: [`${friccion.motivo} El tablero no deja confirmar la jornada.`, papeles]
        .filter(Boolean).join(" "),
    };
  }

  const pendientes = [
    friccion?.tipo === "falta_expediente"
      ? "Se arma con número de expediente y no está cargado: al confirmar, el tablero pide un motivo."
      : null,
    papeles ? `${papeles} No frena: el tablero deja confirmar igual.` : null,
  ].filter(Boolean);

  if (pendientes.length > 0) {
    return { tono: "aviso", titulo: `Se puede ${verbo}, con pendientes${cuando}`, detalle: pendientes.join(" ") };
  }
  return {
    tono: "ok",
    titulo: `Habilitada${cuando}`,
    detalle: "La documentación está resuelta y el permiso no frena.",
  };
}

/**
 * Ventana de deduplicado del pedido de modalidad al técnico.
 *
 * Un bloque de 4 jornadas confirmadas no puede generar 4 `consulta` idénticas: el
 * historial se llenaría de pedidos que además nadie mandó. Si ya hay uno reciente se
 * omite; si es más viejo se crea y se cuenta ("2º pedido"), que es el dato que después
 * se quiere mostrar.
 */
export const DIAS_DEDUP_CONSULTA = 7;
