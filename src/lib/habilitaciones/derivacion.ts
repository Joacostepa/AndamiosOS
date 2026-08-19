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
  ClaveGrupo, FilaBandeja, GrupoBandeja, HabEstado, InputsHabilitacion,
  Permiso, Requisito,
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

function minFecha(fechas: (string | null)[]): string | null {
  const v = fechas.filter((f): f is string => !!f).sort();
  return v[0] ?? null;
}

function maxFecha(fechas: (string | null)[]): string | null {
  const v = fechas.filter((f): f is string => !!f).sort();
  return v[v.length - 1] ?? null;
}

/**
 * Los cuatro inputs que la app escribe en Odoo, derivados de los requisitos.
 *
 * IDEMPOTENTE A PROPÓSITO: las fechas salen de los propios requisitos y no de `hoy`,
 * así el job de reconciliación puede recalcular cuantas veces quiera y llegar siempre
 * al mismo resultado. La única que no es derivable es `hab_fecha_consulta` —consultarle
 * al cliente es una decisión, no un efecto— y por eso se conserva de lo que ya había.
 *
 * OJO con la etapa: el compute de Odoo la resuelve por FECHAS, no por conteo de
 * requisitos. Etapa `a` significa "sin x_hab_fecha_consulta", no "sin requisitos". Por
 * eso crear los requisitos y sellar la fecha de consulta tiene que ser un solo gesto
 * (ver aplicarPaquete en lib/odoo/habilitaciones.ts); si no, la obra queda con nueve
 * requisitos cargados y mostrándose como "falta consultar".
 */
export function derivarInputs(
  requisitos: Requisito[],
  actual: Pick<InputsHabilitacion, "hab_fecha_consulta" | "hab_vencimiento">,
  opts: { triage: "aplica" | "no_aplica" | null },
): InputsHabilitacion {
  // El triage manda sobre todo lo demás: "no aplica" saca la obra de la cola y Odoo
  // computa etapa `f` y semáforo gris solo.
  if (opts.triage === "no_aplica") {
    return {
      hab_estado: "no_aplica",
      hab_fecha_consulta: actual.hab_fecha_consulta,
      hab_fecha_envio: null,
      hab_fecha: null,
      hab_vencimiento: actual.hab_vencimiento,
    };
  }

  // El envío queda sellado por el PRIMER requisito que salió, aunque después se rebote:
  // la etapa `c` describe que la documentación ya fue mandada al menos una vez.
  const fechaEnvio = minFecha(requisitos.map((r) => r.fecha_envio));

  const conRequisitos = requisitos.length > 0;
  const todosAprobados = conRequisitos && requisitos.every((r) => r.estado === "aprobado");
  const algunoMovido = requisitos.some((r) => r.estado !== "pendiente");

  let estado: HabEstado = "pendiente";
  if (todosAprobados) estado = "habilitada";
  else if (algunoMovido || fechaEnvio) estado = "en_curso";

  return {
    hab_estado: estado,
    hab_fecha_consulta: actual.hab_fecha_consulta,
    hab_fecha_envio: fechaEnvio,
    // La fecha de habilitación es la del último papel aprobado, no la de hoy: si esto
    // se recalcula en marzo por una reconciliación, la obra no se "habilita" en marzo.
    hab_fecha: todosAprobados
      ? maxFecha(requisitos.map((r) => r.fecha_resolucion)) ?? actual.hab_fecha_consulta
      : null,
    hab_vencimiento: actual.hab_vencimiento,
  };
}

// ─── Bandeja ────────────────────────────────────────────────────────────────

/** Días de aviso antes del vencimiento. El módulo avisa, no renueva. */
export const DIAS_AVISO_VENCIMIENTO = 30;

const TITULOS: Record<ClaveGrupo, string> = {
  recien_llegadas: "Recién llegadas — definir si aplica",
  critica: "Se arman en 3 días o menos y no están listas",
  atrasada: "Fecha pasada y siguen sin habilitar",
  esperando_cliente: "Esperando respuesta del cliente",
  validacion: "Documentación enviada, esperando validación",
  por_vencer: `Vencen en menos de ${DIAS_AVISO_VENCIMIENTO} días`,
};

/** Orden de prioridad. El primero que cumple se queda con la fila. */
const ORDEN: ClaveGrupo[] = [
  "recien_llegadas", "critica", "atrasada", "esperando_cliente", "validacion", "por_vencer",
];

const PELIGRO = new Set<ClaveGrupo>(["critica", "atrasada"]);

/**
 * A qué grupo va una fila, o null si no está en trámite.
 *
 * CUATRO DE LOS SEIS GRUPOS YA ESTÁN CALCULADOS EN ODOO y no se derivan acá: `critica`
 * y `atrasada` son valores de x_hab_alerta, y `esperando_cliente` / `validacion` son
 * etapas. Sólo el vencimiento se calcula, porque Odoo avisa cuando ya venció y lo que
 * hace falta es avisar antes.
 *
 * Las etapas `a` y `b` van juntas: entre "falta consultar" y "esperando al cliente" la
 * acción de Agustina es la misma —mover al cliente— y la fila ya muestra en cuál está.
 */
export function grupoDe(fila: FilaBandeja, hoy: string): ClaveGrupo | null {
  if (fila.triage === "no_aplica" || fila.etapa === "f") return null;
  if (fila.triage === null) return "recien_llegadas";
  if (fila.alerta === "critica") return "critica";
  if (fila.alerta === "atrasada") return "atrasada";
  if (fila.etapa === "a" || fila.etapa === "b") return "esperando_cliente";
  if (fila.etapa === "c") return "validacion";
  if (fila.vencimiento && diasEntre(hoy, fila.vencimiento) <= DIAS_AVISO_VENCIMIENTO) {
    return "por_vencer";
  }
  // Habilitada y sin vencimiento cerca: no hay nada que hacer con ella.
  return null;
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
    titulo: TITULOS[clave],
    peligro: PELIGRO.has(clave),
    // Dentro de cada grupo, primero lo que se cae antes; sin fecha, lo más viejo.
    filas: porClave.get(clave)!.sort((a, b) => {
      if (a.fechaProgramada && b.fechaProgramada) {
        return a.fechaProgramada.localeCompare(b.fechaProgramada);
      }
      if (a.fechaProgramada) return -1;
      if (b.fechaProgramada) return 1;
      return b.dias - a.dias;
    }),
  })).filter((g) => g.filas.length > 0);
}

/** Umbral de antigüedad por grupo: pasado eso, la fila muestra los días en rojo. */
export const UMBRAL_DIAS: Record<ClaveGrupo, number> = {
  recien_llegadas: 3,
  critica: 0,
  atrasada: 0,
  esperando_cliente: 14,
  validacion: 7,
  por_vencer: 9999,
};

// ─── Veredicto y candado ────────────────────────────────────────────────────

export type Friccion =
  /** El cliente pidió no armar sin el permiso emitido. Bloquea, con salida por excepción. */
  | { tipo: "bloqueo"; motivo: string }
  /** Falta la decisión del cliente. Un clic que registra el pedido al técnico. */
  | { tipo: "pedir_modalidad"; motivo: string; tecnico: string | null; dias: number | null }
  /** Se armó con expediente y el número no está. Motivo escrito obligatorio. */
  | { tipo: "falta_expediente"; motivo: string }
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

/** Los dos trámites cruzados, en una línea, para el encabezado de la ficha. */
export function veredicto(
  permiso: Parameters<typeof friccionAlConfirmar>[0],
  opts: { etapa: string | null; fechaProgramada: string | null },
  hoy: string = hoyISO(),
): { puedeArmar: boolean; titulo: string; detalle: string } {
  const friccion = friccionAlConfirmar(permiso, hoy);
  const habilitada = opts.etapa === "d";

  const cuando = opts.fechaProgramada
    ? diasEntre(hoy, opts.fechaProgramada) === 0
      ? " · programada para hoy"
      : diasEntre(hoy, opts.fechaProgramada) === 1
        ? " · programada para mañana"
        : diasEntre(hoy, opts.fechaProgramada) > 0
          ? ` · programada en ${diasEntre(hoy, opts.fechaProgramada)} días`
          : ` · la fecha pasó hace ${-diasEntre(hoy, opts.fechaProgramada)} días`
    : "";

  const faltantes: string[] = [];
  if (!habilitada) faltantes.push("la documentación del cliente");
  if (friccion?.tipo === "bloqueo") faltantes.push("el permiso municipal");
  if (friccion?.tipo === "pedir_modalidad") faltantes.push("la modalidad de permiso");
  if (friccion?.tipo === "falta_expediente") faltantes.push("el número de expediente");

  if (friccion?.tipo === "bloqueo") {
    return {
      puedeArmar: false,
      titulo: `No se puede armar${cuando}`,
      detalle: `Falta ${faltantes.join(" y ")}.`,
    };
  }
  if (faltantes.length > 0) {
    return {
      puedeArmar: true,
      titulo: `Se puede armar, con pendientes${cuando}`,
      detalle: `Falta ${faltantes.join(" y ")}. La documentación no bloquea: es advertencia.`,
    };
  }
  return {
    puedeArmar: true,
    titulo: `Habilitada${cuando}`,
    detalle: "Documentación validada y permiso resuelto.",
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
