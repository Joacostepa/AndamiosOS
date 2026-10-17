// La cuadrilla de apoyo: la lógica pura, sin Odoo ni React.
//
// Ver docs/tablero-planificacion/apoyo.md. Una obra tiene UNA cuadrilla principal por día
// y, cuando hace falta, una o más de apoyo. Cada apoyo es una asignación propia
// (x_aba_asignacion con x_apoyo = true) porque ocupa capacidad de verdad en la fila de su
// cuadrilla; pero NO es una jornada más de la obra:
//
//   - no suma días al avance ("faltan N de M") ni a la duración planificada;
//   - no tiene parte propio: el parte lo carga la principal y le cierra la jornada también
//     al apoyo (cerrarJornada en src/lib/odoo/partes.ts);
//   - no cuenta como parte pendiente en el menú.
//
// Todo eso se decide con las funciones de acá, que usan tanto el servidor (capa Odoo) como
// el tablero. Viven juntas para que "qué cuenta como jornada de la obra" tenga UNA sola
// respuesta: si el listado de partes y la bandeja del tablero contaran distinto, la misma
// obra diría "falta 1" en una pantalla y "faltan 2" en la otra.
//
// Sin imports a propósito: la corren los tests con node --experimental-strip-types.

/** La clave de "esta obra, este día". Es la unidad del parte: uno por obra y por día. */
export function claveDia(otId: number, fecha: string): string {
  return `${otId}|${fecha}`;
}

/**
 * Cuántos DÍAS DISTINTOS tiene cada obra entre las filas dadas.
 *
 * POR QUÉ DÍAS Y NO REGISTROS. Antes el avance contaba asignaciones, y una obra de 3 días
 * con un apoyo el martes daba 4: la bandeja pedía una jornada de más y el "último día" del
 * listado nunca llegaba. Los apoyos se excluyen ANTES de llamar a esto (por dominio en
 * Odoo, o con `esApoyo` en el cliente); contar días es la protección extra para lo que se
 * escape —dos principales el mismo día cargadas a mano en Odoo, los partes duplicados
 * viejos de las OT 20, 21, 58 y 396—, que también describen un solo día de obra.
 *
 * Una fila sin fecha cuenta como un día propio: es un dato roto, y es preferible que la
 * obra pida una jornada de más a que la esconda.
 */
export function diasPorOt(filas: Iterable<{ otId: number | null; fecha: string | null }>): Map<number, number> {
  const vistos = new Set<string>();
  const cuenta = new Map<number, number>();
  let sinFecha = 0;
  for (const f of filas) {
    if (!f.otId) continue;
    const clave = f.fecha ? claveDia(f.otId, f.fecha) : `${f.otId}|sin-fecha-${sinFecha++}`;
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    cuenta.set(f.otId, (cuenta.get(f.otId) ?? 0) + 1);
  }
  return cuenta;
}

/** Lo que alcanza para saber si una fila es apoyo. Ausente = principal (todo lo viejo). */
export function esApoyo(a: { apoyo?: boolean | null }): boolean {
  return a.apoyo === true;
}

export type Agrupacion<T> = {
  /** Las principales, en el orden en que llegaron. */
  principales: T[];
  /** Los apoyos de cada principal, por `claveDia` de la principal. */
  apoyosDe: Map<string, T[]>;
  /**
   * Apoyos sin principal ese día. Pasa si alguien edita a mano en Odoo o borra la
   * principal sin sus apoyos. No se esconden: se devuelven para que la pantalla los marque.
   */
  huerfanos: T[];
};

/**
 * Separa las principales de sus apoyos, emparejados por obra y día.
 *
 * Si hubiera dos principales el mismo día (otro caso de edición a mano), los apoyos se
 * cuelgan de la primera que llegó: no hay forma buena de elegir y lo importante es que no
 * se pierdan.
 */
export function agruparApoyos<T extends { otId: number; fecha: string; apoyo?: boolean | null }>(
  filas: T[],
): Agrupacion<T> {
  const principales: T[] = [];
  const conPrincipal = new Set<string>();
  for (const f of filas) {
    if (esApoyo(f)) continue;
    principales.push(f);
    conPrincipal.add(claveDia(f.otId, f.fecha));
  }
  const apoyosDe = new Map<string, T[]>();
  const huerfanos: T[] = [];
  for (const f of filas) {
    if (!esApoyo(f)) continue;
    const k = claveDia(f.otId, f.fecha);
    if (!conPrincipal.has(k)) {
      huerfanos.push(f);
      continue;
    }
    const lista = apoyosDe.get(k);
    if (lista) lista.push(f);
    else apoyosDe.set(k, [f]);
  }
  return { principales, apoyosDe, huerfanos };
}

/** Horario de una jornada completa, el de 1276 de las 1300 líneas de mano de obra medidas. */
export const HORA_ENTRADA = 8;
export const HORA_SALIDA = 17;
/** Horas trabajadas de una jornada completa: de 8 a 17 con una hora de almuerzo. */
const HORAS_JORNADA = 8;

/**
 * El horario con el que se precarga el renglón del apoyo, según cuánto va.
 *
 * El apoyo casi siempre se suma para la tarde ("sólo a la tarde, para terminar"), así que
 * una fracción se cuenta HACIA ATRÁS desde la salida: ½ jornada son 4 horas, de 13 a 17.
 * La jornada entera es el horario de siempre, de 8 a 17. Se redondea al cuarto de hora
 * para no precargar un "16:12" que nadie dice. Es una precarga: el que carga el parte la
 * corrige si fue a la mañana.
 */
export function horarioSugeridoApoyo(fraccion: number): { horaDesde: number; horaHasta: number } {
  if (!Number.isFinite(fraccion) || fraccion >= 1 || fraccion <= 0) {
    return { horaDesde: HORA_ENTRADA, horaHasta: HORA_SALIDA };
  }
  const desde = HORA_SALIDA - HORAS_JORNADA * fraccion;
  return { horaDesde: Math.round(desde * 4) / 4, horaHasta: HORA_SALIDA };
}

/**
 * Qué hacer con cada apoyo de la obra ese día al guardar el parte.
 *
 *  - Los que la pantalla mandó con "fue" → se vinculan al parte.
 *  - Los que mandó con "no fue" → se BORRAN (decisión de Joaquín, 17/10: no se
 *    reprograman solos; si hay que volver a mandarlos, se suman de nuevo desde el tablero).
 *  - Los que la pantalla no mencionó (se sumaron mientras se cargaba, o la pantalla
 *    todavía no conoce los apoyos) → se vinculan: el parte es de la obra y del día, y un
 *    apoyo que quedara suelto aparecería como deuda que nadie puede saldar.
 *
 * Sólo se tocan los apoyos SIN parte, o ya vinculados a ESTE parte: uno colgado de otro
 * parte es historia (los casos viejos) y no se reasigna.
 */
export function planDeApoyos(
  existentes: { id: number; parteId: number | null }[],
  pedidos: { asignacionId: number; fue: boolean }[] | undefined,
  parteId: number,
): { vincular: number[]; borrar: number[] } {
  const fuePorId = new Map((pedidos ?? []).map((p) => [p.asignacionId, p.fue]));
  const vincular: number[] = [];
  const borrar: number[] = [];
  for (const a of existentes) {
    if (a.parteId !== null && a.parteId !== parteId) continue;
    const fue = fuePorId.get(a.id);
    if (fue === false) {
      // Si ya estaba vinculado a este parte, borrar la asignación alcanza: el vínculo se
      // va con ella.
      borrar.push(a.id);
    } else if (a.parteId === null) {
      vincular.push(a.id);
    }
  }
  return { vincular, borrar };
}

// ── Tablero: lo que necesitan las pantallas ─────────────────────────────────

/**
 * Los apoyos de un TRAMO de la principal, juntados por cuadrilla. Es lo que dibuja el chip
 * "+C3 ½" de la tarjeta principal: una tarjeta de tres días con la C3 el martes lleva un
 * chip, no tres.
 *
 * `apoyosDe` es el mapa de agruparApoyos (por claveDia de la principal). El orden de salida
 * es el de la primera aparición, así el chip de la C3 no salta de lugar al sumar la C4.
 */
export function apoyosDelTramo<T extends { cuadrillaId: number | null; fecha: string; fraccion: number }>(
  otId: number,
  fechas: string[],
  apoyosDe: Map<string, T[]>,
): { cuadrillaId: number | null; fechas: string[]; fracciones: number[] }[] {
  const porCuadrilla = new Map<number | null, { cuadrillaId: number | null; fechas: string[]; fracciones: number[] }>();
  for (const f of fechas) {
    for (const a of apoyosDe.get(claveDia(otId, f)) ?? []) {
      const actual = porCuadrilla.get(a.cuadrillaId) ?? { cuadrillaId: a.cuadrillaId, fechas: [], fracciones: [] };
      actual.fechas.push(a.fecha);
      actual.fracciones.push(a.fraccion);
      porCuadrilla.set(a.cuadrillaId, actual);
    }
  }
  return [...porCuadrilla.values()];
}

/** Cómo se dice una fracción en el chip. La jornada entera no dice nada: es lo normal. */
const GLIFO_APOYO: Record<string, string> = {
  "0.1": "mín", "0.25": "¼", "0.375": "3 h", "0.5": "½", "0.625": "5 h", "0.75": "¾", "0.875": "7 h", "1": "",
};

/**
 * El texto del chip del apoyo en la tarjeta principal: "+C3 ½", "+C3", "+C3 ½ (1d)".
 *
 *  - La fracción va sólo si es la misma todos los días: con días distintos no hay un
 *    número que la diga, y el detalle está en el tooltip.
 *  - "(Nd)" sólo cuando la tarjeta es de varios días y el apoyo no va a todos: si no,
 *    una obra de tres días con apoyo el martes se leería como apoyo los tres.
 */
export function textoChipApoyo(abreviatura: string, fracciones: number[], diasDelTramo: number): string {
  const unicas = [...new Set(fracciones.map((f) => String(Number(f.toFixed(3)))))];
  const glifo = unicas.length === 1 ? (GLIFO_APOYO[unicas[0]] ?? "") : "";
  const parcial = diasDelTramo > 1 && fracciones.length < diasDelTramo ? ` (${fracciones.length}d)` : "";
  return `+${abreviatura}${glifo ? ` ${glifo}` : ""}${parcial}`;
}

/** Un día de la obra visto desde "Sumar apoyo": quién la lleva y si ya tiene parte. */
export type DiaDeObra = {
  fecha: string;
  /** La cuadrilla PRINCIPAL ese día. */
  cuadrillaId: number | null;
  estado: "tentativa" | "confirmada";
  conParte: boolean;
  /**
   * El parte de ese día salió "no ejecutado": la obra no se trabajó, y un apoyo ahí sería
   * una jornada colgada de un día que no existió. Ausente = no.
   */
  parteNoEjecutado?: boolean;
};

/**
 * Qué días se pueden sumar como apoyo de esta cuadrilla, y por qué se saltean los otros.
 *
 * Reglas (apoyo.md, sección 4):
 *  - sólo días con principal: un apoyo sin obra que ayudar es un huérfano;
 *  - la cuadrilla del apoyo no puede ser la principal ese día (sería la misma gente);
 *  - si esa cuadrilla ya es apoyo de la obra ese día, no se duplica;
 *  - un día con parte "no ejecutado" no: ese día no se trabajó.
 *
 * UN DÍA QUE YA TIENE PARTE SÍ SE PUEDE ("Sumar el apoyo después de cargar el parte"): el
 * servidor crea el apoyo ya vinculado a ese parte (crearAsignaciones) y Partes avisa "sumá
 * la gente de C3". Esos días salen en `sumar` con `conParte`, para que la pantalla lo diga.
 */
export function diasParaApoyo(
  pedidos: string[],
  dias: DiaDeObra[],
  cuadrillaId: number,
  apoyosExistentes: { fecha: string; cuadrillaId: number | null }[],
): { sumar: DiaDeObra[]; saltados: { fecha: string; motivo: string }[] } {
  const porFecha = new Map(dias.map((d) => [d.fecha, d]));
  const yaEsta = new Set(apoyosExistentes.filter((a) => a.cuadrillaId === cuadrillaId).map((a) => a.fecha));
  const sumar: DiaDeObra[] = [];
  const saltados: { fecha: string; motivo: string }[] = [];
  for (const fecha of [...new Set(pedidos)].sort()) {
    const dia = porFecha.get(fecha);
    if (!dia) saltados.push({ fecha, motivo: "la obra no tiene cuadrilla principal ese día" });
    else if (dia.cuadrillaId === cuadrillaId) saltados.push({ fecha, motivo: "es la cuadrilla principal ese día" });
    else if (yaEsta.has(fecha)) saltados.push({ fecha, motivo: "ya es apoyo ese día" });
    else if (dia.parteNoEjecutado) saltados.push({ fecha, motivo: "el parte de ese día salió no ejecutado" });
    else sumar.push(dia);
  }
  return { sumar, saltados };
}

/**
 * En cuántos días podría salir la obra si el apoyo va TODOS los días.
 *
 * Es lo que el tablero OFRECE ("¿Achicás la obra a N días?") y nunca aplica solo
 * (decisión de Joaquín, 17/10): la duración sigue en días de calendario y la decide
 * Operaciones. La cuenta es la simple —cada día rinde 1 + la fracción del apoyo— y
 * redondea para arriba: un día de menos que no alcanza es peor que uno de más.
 *
 * Devuelve null si no hay nada que ofrecer (no achica, o la obra es de un día).
 */
export function diasSiAchica(dias: number, fraccionApoyo: number): number | null {
  if (dias <= 1 || !(fraccionApoyo > 0)) return null;
  const n = Math.max(1, Math.ceil(dias / (1 + Math.min(1, fraccionApoyo)) - 1e-9));
  return n < dias ? n : null;
}

// ── Etapa 2: que no se rompa al mover ───────────────────────────────────────

/**
 * Los apoyos de la obra ESE día. Es la pregunta que se hace cada gesto que toca a la
 * principal —moverla, confirmarla, devolverla a la bandeja, deshacer—: "¿a quién arrastro
 * conmigo?". Vive acá y no en cada gesto para que todos contesten lo mismo.
 *
 * Devuelve las filas tal cual (con su id, cuadrilla y parte), en el orden en que llegaron.
 */
export function apoyosDe<T extends { otId: number | null; fecha: string | null; apoyo?: boolean | null }>(
  filas: Iterable<T>,
  otId: number,
  fecha: string,
): T[] {
  const salida: T[] = [];
  for (const f of filas) if (esApoyo(f) && f.otId === otId && f.fecha === fecha) salida.push(f);
  return salida;
}

/** Los apoyos de la obra en cualquiera de esos días (un bloque de varios días). */
export function apoyosDeDias<T extends { otId: number | null; fecha: string | null; apoyo?: boolean | null }>(
  filas: Iterable<T>,
  otId: number,
  fechas: Iterable<string>,
): T[] {
  const dias = new Set(fechas);
  const salida: T[] = [];
  for (const f of filas) if (esApoyo(f) && f.otId === otId && f.fecha != null && dias.has(f.fecha)) salida.push(f);
  return salida;
}

/**
 * Qué pasa con los apoyos cuando la principal cambia de día o de cuadrilla.
 *
 * LA REGLA (apoyo.md): el apoyo va con la obra. Si la principal del martes pasa al jueves,
 * su apoyo del martes pasa al jueves, EN SU MISMA CUADRILLA: lo que se mueve es cuándo, no
 * quién ayuda. Cada `traslado` es un día de la principal: de dónde sale y adónde llega.
 *
 * `cuadrillaDestino` es la cuadrilla de la principal después del gesto (null = no cambia,
 * no hay que mirar). Si coincide con la de un apoyo, ese apoyo CHOCA: la principal cayó en
 * la fila de su propio apoyo y quedarían las dos jornadas en la misma cuadrilla. No se
 * resuelve solo —¿se quería "Hacer principal"? ¿quitar el apoyo?—: se devuelve para que el
 * tablero frene y lo diga.
 */
export function arrastreDeApoyos<
  T extends { id: number; otId: number | null; fecha: string | null; cuadrillaId: number | null; apoyo?: boolean | null },
>(
  filas: T[],
  otId: number,
  traslados: { desde: string; hasta: string }[],
  cuadrillaDestino: number | null,
): { mover: { apoyo: T; fecha: string }[]; choques: T[] } {
  const mover: { apoyo: T; fecha: string }[] = [];
  const choques: T[] = [];
  const vistos = new Set<number>();
  for (const t of traslados) {
    for (const a of apoyosDe(filas, otId, t.desde)) {
      if (vistos.has(a.id)) continue;
      vistos.add(a.id);
      if (cuadrillaDestino != null && a.cuadrillaId === cuadrillaDestino) choques.push(a);
      else if (t.hasta !== t.desde) mover.push({ apoyo: a, fecha: t.hasta });
    }
  }
  return { mover, choques };
}

/**
 * Qué pasa con los apoyos cuando se guarda el editor de jornadas de la obra, que puede
 * SACAR días y MOVER otros a la vez ("saco el martes y junto los días": el miércoles pasa
 * al martes).
 *
 * LA REGLA, día por día del apoyo:
 *  - si ese día sigue una principal que NO se mueve, el apoyo se queda;
 *  - si la principal de ese día se mueve, el apoyo va con ella;
 *  - si la principal de ese día se saca, el apoyo SE BORRA con ella, aunque otra
 *    principal llegue a ese día: el que manda es el apoyo del día que se mueve ahí (si
 *    tiene). Antes se lo dejaba "porque el día sigue teniendo obra", pero el borrado sale
 *    primero y por separado, y el servidor veía por un instante el apoyo solo y rechazaba
 *    todo el guardado.
 *
 * Y nunca dos apoyos de la misma cuadrilla el mismo día: si uno que llega encuentra otro
 * de su cuadrilla que se queda, el que llega se borra en vez de moverse (es la misma gente
 * ese día, no hay dos jornadas que cerrar).
 *
 * Los apoyos ya vinculados a un parte no se tocan: ese día trabajaron. Las principales que
 * llegan sin fecha original conocida se ignoran.
 */
export function apoyosAlEditarJornadas<
  T extends { id: number; otId: number | null; fecha: string | null; cuadrillaId: number | null; apoyo?: boolean | null; parteId?: number | null },
>(
  filas: T[],
  otId: number,
  principales: { id: number; fecha: string }[],
  borradas: number[],
  fechasNuevas: { asignacionId: number; fecha: string }[],
): { mover: { apoyo: T; fecha: string }[]; borrar: T[] } {
  const sacadas = new Set(borradas);
  const nueva = new Map(fechasNuevas.map((f) => [f.asignacionId, f.fecha]));
  // Días con una principal que se queda quieta; y adónde va cada día que se mueve.
  const quietos = new Set<string>();
  const destinoDe = new Map<string, string>();
  for (const p of principales) {
    if (sacadas.has(p.id)) continue;
    const hasta = nueva.get(p.id) ?? p.fecha;
    if (hasta === p.fecha) quietos.add(p.fecha);
    else if (!destinoDe.has(p.fecha)) destinoDe.set(p.fecha, hasta);
  }

  const mover: { apoyo: T; fecha: string }[] = [];
  const borrar: T[] = [];
  // Cómo queda cada (día, cuadrilla) de apoyo, para no duplicar.
  const ocupado = new Set<string>();
  const llegan: { apoyo: T; fecha: string }[] = [];
  for (const a of filas) {
    if (!esApoyo(a) || a.otId !== otId || !a.fecha) continue;
    if (a.parteId != null || a.id <= 0 || quietos.has(a.fecha)) {
      ocupado.add(`${a.fecha}|${a.cuadrillaId}`);
      continue;
    }
    const hasta = destinoDe.get(a.fecha);
    if (hasta) llegan.push({ apoyo: a, fecha: hasta });
    else if (principales.some((p) => p.fecha === a.fecha && sacadas.has(p.id))) borrar.push(a);
    // Si el día no tenía principal en el editor (huérfano de antes, o fuera de rango), no
    // es de este guardado: se deja como estaba.
    else ocupado.add(`${a.fecha}|${a.cuadrillaId}`);
  }
  for (const m of llegan) {
    const k = `${m.fecha}|${m.apoyo.cuadrillaId}`;
    if (ocupado.has(k)) borrar.push(m.apoyo);
    else {
      ocupado.add(k);
      mover.push(m);
    }
  }
  return { mover, borrar };
}

// ── Validación en el servidor ───────────────────────────────────────────────

/** Lo mínimo de una asignación para decidir si los roles de la obra están sanos. */
export type FilaRol = {
  id: number;
  otId: number | null;
  fecha: string | null;
  cuadrillaId: number | null;
  apoyo: boolean;
};

export type ConflictoApoyo = {
  tipo: "sin-principal" | "dos-principales" | "misma-cuadrilla" | "apoyo-duplicado";
  otId: number;
  fecha: string;
  /** En "misma-cuadrilla" y "apoyo-duplicado", cuál. */
  cuadrillaId: number | null;
};

/** Lo que una escritura del tablero le hace a las asignaciones, en la forma de la ruta. */
export type CambiosDeRol = {
  crear?: { otId: number; fecha: string; cuadrillaId: number | null; apoyo?: boolean }[];
  mover?: { id: number; fecha: string; cuadrillaId?: number | null }[];
  actualizar?: { ids: number[]; cambio: { fecha?: string; cuadrillaId?: number | null; apoyo?: boolean } };
  roles?: { id: number; apoyo: boolean }[];
  borrar?: number[];
};

/**
 * Cómo quedan las filas después de la escritura, y qué (obra, día) tocó.
 *
 * Los días tocados son los de ANTES y los de DESPUÉS de cada fila: mover la principal
 * del martes al jueves puede romper el martes (deja al apoyo solo) y el jueves (cae donde
 * ya había otra principal). Las creadas llevan ids negativos: todavía no existen.
 */
export function estadoDespues(antes: FilaRol[], cambios: CambiosDeRol): { despues: FilaRol[]; claves: Set<string> } {
  const porId = new Map(antes.map((f) => [f.id, { ...f }]));
  const claves = new Set<string>();
  const tocar = (f: FilaRol | undefined) => {
    if (f?.otId && f.fecha) claves.add(claveDia(f.otId, f.fecha));
  };

  for (const m of cambios.mover ?? []) {
    const f = porId.get(m.id);
    if (!f) continue;
    tocar(f);
    f.fecha = m.fecha;
    if (m.cuadrillaId !== undefined) f.cuadrillaId = m.cuadrillaId;
    tocar(f);
  }
  if (cambios.actualizar) {
    const { ids, cambio } = cambios.actualizar;
    for (const id of ids) {
      const f = porId.get(id);
      if (!f) continue;
      tocar(f);
      if (cambio.fecha !== undefined) f.fecha = cambio.fecha;
      if (cambio.cuadrillaId !== undefined) f.cuadrillaId = cambio.cuadrillaId;
      if (cambio.apoyo !== undefined) f.apoyo = cambio.apoyo;
      tocar(f);
    }
  }
  for (const r of cambios.roles ?? []) {
    const f = porId.get(r.id);
    if (!f) continue;
    f.apoyo = r.apoyo;
    tocar(f);
  }
  for (const id of cambios.borrar ?? []) {
    tocar(porId.get(id));
    porId.delete(id);
  }
  let temporal = -1;
  const despues = [...porId.values()];
  for (const c of cambios.crear ?? []) {
    const f: FilaRol = { id: temporal--, otId: c.otId, fecha: c.fecha, cuadrillaId: c.cuadrillaId, apoyo: c.apoyo === true };
    despues.push(f);
    tocar(f);
  }
  return { despues, claves };
}

function problemasPorDia(filas: FilaRol[], claves: Set<string>): Map<string, ConflictoApoyo> {
  const porDia = new Map<string, FilaRol[]>();
  for (const f of filas) {
    if (!f.otId || !f.fecha) continue;
    const k = claveDia(f.otId, f.fecha);
    if (!claves.has(k)) continue;
    const lista = porDia.get(k);
    if (lista) lista.push(f);
    else porDia.set(k, [f]);
  }
  const problemas = new Map<string, ConflictoApoyo>();
  for (const [k, lista] of porDia) {
    const { otId, fecha } = lista[0] as { otId: number; fecha: string };
    const principales = lista.filter((f) => !f.apoyo);
    const apoyos = lista.filter((f) => f.apoyo);
    if (principales.length > 1) {
      problemas.set(`${k}|dos`, { tipo: "dos-principales", otId, fecha, cuadrillaId: null });
    }
    if (apoyos.length > 0 && principales.length === 0) {
      problemas.set(`${k}|sin`, { tipo: "sin-principal", otId, fecha, cuadrillaId: apoyos[0].cuadrillaId });
    }
    const dePrincipal = new Set(principales.map((p) => p.cuadrillaId).filter((c) => c != null));
    const apoyoVisto = new Set<number>();
    for (const a of apoyos) {
      if (a.cuadrillaId != null && dePrincipal.has(a.cuadrillaId)) {
        problemas.set(`${k}|misma|${a.cuadrillaId}`, { tipo: "misma-cuadrilla", otId, fecha, cuadrillaId: a.cuadrillaId });
      }
      // La misma cuadrilla dos veces de apoyo el mismo día: es la misma gente, y quedan
      // dos jornadas que el parte cierra como si fueran dos.
      if (a.cuadrillaId != null) {
        if (apoyoVisto.has(a.cuadrillaId)) {
          problemas.set(`${k}|dup|${a.cuadrillaId}`, { tipo: "apoyo-duplicado", otId, fecha, cuadrillaId: a.cuadrillaId });
        }
        apoyoVisto.add(a.cuadrillaId);
      }
    }
  }
  return problemas;
}

/**
 * Los problemas de roles que la escritura CREA en los días que toca.
 *
 * Tres reglas por obra y día (apoyo.md): no hay apoyo sin principal, no hay más de una
 * principal, y el apoyo no es de la misma cuadrilla que la principal.
 *
 * SÓLO LO QUE EMPEORA. Si el día ya estaba roto antes del gesto —alguien editó a mano en
 * Odoo, los casos viejos de las OT 20, 21, 58 y 396— no se frena un arrastre que no tiene
 * la culpa: el tablero ya lo muestra en rojo y se arregla aparte. Frenarlo dejaría la obra
 * sin forma de tocarse, incluido el gesto que la iba a arreglar.
 */
export function conflictosDeApoyo(antes: FilaRol[], despues: FilaRol[], claves: Set<string>): ConflictoApoyo[] {
  const ya = problemasPorDia(antes, claves);
  return [...problemasPorDia(despues, claves)].filter(([k]) => !ya.has(k)).map(([, c]) => c);
}

/** "mar 20/10" sin date-fns: este archivo no importa nada (ver arriba). */
function diaCorto(fecha: string): string {
  const dias = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
  const [a, m, d] = fecha.split("-").map(Number);
  const dow = new Date(Date.UTC(a, m - 1, d)).getUTCDay();
  return `${dias[dow] ?? ""} ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
}

/** La frase del 409, para el toast del tablero. */
export function textoConflicto(c: ConflictoApoyo, nombreCuadrilla: (id: number | null) => string | null = () => null): string {
  const dia = diaCorto(c.fecha);
  switch (c.tipo) {
    case "dos-principales":
      return `La obra ya tiene cuadrilla principal el ${dia}. Para mandar otra cuadrilla, sumala como apoyo.`;
    case "sin-principal":
      return `El ${dia} quedaría un apoyo sin cuadrilla principal: nadie cargaría su parte.`;
    case "misma-cuadrilla":
      return `${nombreCuadrilla(c.cuadrillaId) ?? "Esa cuadrilla"} ya es la principal de la obra el ${dia}: no puede ser también su apoyo.`;
    case "apoyo-duplicado":
      return `${nombreCuadrilla(c.cuadrillaId) ?? "Esa cuadrilla"} ya es apoyo de la obra el ${dia}.`;
  }
}
