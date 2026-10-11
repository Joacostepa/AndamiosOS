// Los vehículos de una hoja y sus viajes de cuadrilla: qué pasa cuando se suma un vehículo,
// se saca, se le cambia el chofer, el camión o el modo, cuando se mueve la hora del "lleva"
// o se marca que después vuelve al depósito, y quién los busca (el mismo, otro camión, a
// definir o nadie: "vuelven solos").
//
// PURO, como estado.ts (del que depende; no al revés), y con tests (vehiculos.test.ts). Lo
// usan el servidor (acciones.ts escribe lo que esto dice) y el navegador (optimista.ts lo
// muestra al instante): la regla se escribe una vez y el gesto se ve igual en los dos lados.
//
// LAS DECISIONES DEL DUEÑO (11/10), en modulo.md §4:
// - Chofer y vehículo son independientes. Elegir un chofer sólo PROPONE su vehículo si el
//   renglón no tiene; elegir un vehículo sólo propone su chofer habitual si no tiene. Nunca
//   se pisan.
// - Una cuadrilla puede llevar varios vehículos, cada uno con su modo ("Lleva y trae" o
//   "Todo el día"). "Sin chofer" es no tener ninguno.
// - Cada vehículo de "Lleva y trae" tiene su "lleva" (un viaje del camión con
//   `hojaVehiculoId`), que puede volver al depósito después (vuelta + hora de llegada).
// - El "busca" es de la hoja: lo hace el vehículo que los lleva (lo sigue), otro camión u
//   otro chofer (suelto), queda "a definir" (sin camión) o no existe ("vuelven solos"). Se
//   crea cuando la hoja pasa a tener alguien que los lleve, y se borra cuando ya no tiene.
//
// Sólo se tocan los viajes PLANEADOS: un viaje hecho o con "No pude" es historia.
//
// Imports relativos y con extensión: corre en `node --test` sin Next.

import type { DiaHoja, Hoja, Hora, LugarEncuentro, ModoChofer, ModoVehiculo, VehiculoHoja, Viaje } from "./tipos.ts";
import {
  ausenciaDe, choferDe, choferSugerido, encuentroPorModo, hm, hojaDeCuadrilla, normHora, patente, todoDe, toMin, vehiculo, vehiculoDeChofer, vehiculosDe,
} from "./estado.ts";

/** Un gesto sobre los vehículos de una hoja (o sus lleva / busca). */
export type CambioVehiculos =
  /** "+ Otro vehículo" (o el primero). Sin chofer ni vehículo, propone el de ayer. */
  | { k: "sumar"; modo: ModoVehiculo; choferId?: string | null; vehiculoId?: string | null }
  | { k: "quitar"; filaId: string }
  | { k: "cambiar"; filaId: string; modo?: ModoVehiculo; choferId?: string | null; vehiculoId?: string | null }
  /** El selector de tres de siempre: "Sin chofer" saca todos; los otros cambian el primero (o suman uno). */
  | { k: "modo"; modo: ModoChofer }
  /** Soltar un chofer en la tarjeta (arrastrar, teclas 1–5). */
  | { k: "soltar"; choferId: string }
  /** El chofer / el vehículo del primero (o uno nuevo si no hay). */
  | { k: "chofer"; choferId: string | null }
  | { k: "vehiculo"; vehiculoId: string | null }
  /** La hora del "lleva" de un vehículo (por defecto, el que los lleva). */
  | { k: "lleva"; filaId?: string | null; hora: Hora }
  /** "Después vuelve al depósito" en el lleva de un vehículo, con la hora de llegada (null = la estimada). */
  | { k: "vuelta"; filaId?: string | null; vuelve: boolean; llega?: Hora | null }
  /** Lo que lleva el "lleva" (sale en la lista de carga). */
  | { k: "carga"; filaId?: string | null; carga: string | null }
  /** La hora del busca; null = vuelven por su cuenta. */
  | { k: "busca"; hora: Hora | null }
  /** Quién los busca: `filaId` = ese vehículo de la hoja (lo sigue); si no, otro camión/chofer (sin vehículo = a definir). */
  | { k: "buscaCon"; filaId?: string | null; vehiculoId?: string | null; choferId?: string | null }
  | { k: "encuentro"; lugar: LugarEncuentro; hora: Hora; texto?: string | null }
  /** Saca de esta hoja los vehículos que maneja ese chofer ("Sacarlo de la 1"). */
  | { k: "quitarChofer"; choferId: string };

/** Lo que hay que escribir (acciones.ts) o mostrar (optimista.ts). Los ids nuevos salen de `nuevoId`. */
export type PlanVehiculos = {
  /** Los vehículos como quedan. */
  filas: VehiculoHoja[];
  sumar: VehiculoHoja[];
  cambiar: { id: string; valores: Partial<VehiculoHoja> }[];
  quitar: string[];
  /** El encuentro, si cambió. */
  encuentro: Hoja["encuentro"] | null;
  viajes: { crear: Viaje[]; cambiar: { id: string; valores: Partial<Viaje> }[]; borrar: string[] };
};

export type OpcionesPlan = {
  /** Un id para cada fila o viaje nuevo (el servidor usa claves que después cambia por los de la base; el navegador, "tmp-…"). */
  nuevoId: (que: "fila" | "viaje") => string;
  /** Minutos de "ahora" en la escala del día (tocado y creado). */
  ahora: number;
};

/** Por qué un gesto no se puede hacer (el servidor lo dice; el navegador espera al servidor). */
export class NoSePuede extends Error {}

const VACIO = { otId: null, lugarId: null, texto: null };
const CAMPOS_VIAJE = ["vehiculoId", "choferId", "hojaVehiculoId", "hora", "orden", "vuelta", "vueltaLlega", "carga"] as const;
const CAMPOS_FILA = ["vehiculoId", "choferId", "modo", "orden"] as const;

// ─── Lo que la pantalla lee ─────────────────────────────────────────────────

/** Los viajes de cuadrilla de una hoja que cuentan (sin los anulados). */
const viajesDe = (dia: DiaHoja, h: Hoja) => dia.viajes.filter((v) => v.hojaId === h.id && v.estado !== "anulado");

/**
 * El "lleva" de un vehículo de la hoja. Los viajes de antes de los varios vehículos no
 * tienen renglón: el que haya es del que los lleva.
 */
export function llevaDeFila(dia: DiaHoja, h: Hoja, f: VehiculoHoja): Viaje | null {
  const vs = viajesDe(dia, h).filter((v) => v.tipo === "lleva");
  const propio = vs.find((v) => v.hojaVehiculoId === f.id);
  if (propio) return propio;
  const fl = vehiculosDe(h).find((x) => x.modo === "lleva_trae");
  return fl?.id === f.id ? vs.find((v) => !v.hojaVehiculoId) ?? null : null;
}
/** El "busca" de la hoja (null = vuelven por su cuenta). */
export const buscaDeHoja = (dia: DiaHoja, h: Hoja): Viaje | null => viajesDe(dia, h).find((v) => v.tipo === "busca") ?? null;

/** Quién los busca, para el renglón de la tarjeta y el editor. */
export type QuienBusca =
  | { k: "solos" }
  | { k: "definir"; v: Viaje }
  | { k: "fila"; v: Viaje; fila: VehiculoHoja }
  | { k: "otro"; v: Viaje };

export function quienBusca(dia: DiaHoja, h: Hoja): QuienBusca {
  const v = buscaDeHoja(dia, h);
  if (!v) return { k: "solos" };
  if (!v.vehiculoId && !v.fleteExterno) return { k: "definir", v };
  const fila = v.hojaVehiculoId ? vehiculosDe(h).find((f) => f.id === v.hojaVehiculoId) : undefined;
  if (fila) return { k: "fila", v, fila };
  // Los viajes viejos (sin renglón): si es el mismo camión del que los lleva, es "el mismo".
  const fl = vehiculosDe(h).find((f) => f.modo === "lleva_trae");
  if (!v.hojaVehiculoId && fl && fl.vehiculoId === v.vehiculoId) return { k: "fila", v, fila: fl };
  return { k: "otro", v };
}

/**
 * La hora de llegada al depósito cargada a mano, corrida lo mismo que se corrió la hora del
 * lleva (8:30 → 9:00 corre "llega 9:15" a 9:45). Sin llegada cargada o sin las dos horas, la
 * misma. La usan los gestos de la tarjeta (horaLleva) y los de Camiones (mover, hora).
 */
export function correrLlegada(llega: Hora | null, antes: Hora | null, ahora: Hora | null): Hora | null {
  const a = toMin(antes), b = toMin(ahora), l = toMin(llega);
  if (l == null || a == null || b == null || a === b) return llega;
  return hm(l + b - a);
}

// ─── El plan ────────────────────────────────────────────────────────────────

/**
 * Qué cambia en los vehículos de la hoja de `c` y en sus viajes de cuadrilla con este
 * gesto. Tira `NoSePuede` si no tiene sentido (un busca sin nadie que los lleve).
 */
export function planVehiculos(dia: DiaHoja, c: number, cambio: CambioVehiculos, o: OpcionesPlan): PlanVehiculos {
  const h = hojaDeCuadrilla(dia, c);
  if (!h) throw new NoSePuede("Esa cuadrilla no tiene hoja ese día.");
  const fin = normHora(dia.parametros.finJornada) ?? "17:00";
  const orig = vehiculosDe(h);
  const origV = viajesDe(dia, h);
  let filas: VehiculoHoja[] = orig.map((f) => ({ ...f }));
  let vs: Viaje[] = origV.map((v) => ({ ...v }));
  let enc = { ...h.encuentro };

  const planeado = (v: Viaje) => v.estado === "planeado";
  // Una hoja SIN vehículos pero con un "lleva" sin renglón: la armó el código de antes de los
  // varios vehículos (entre la migración y el deploy) y su fila nunca llegó a
  // hd_hoja_vehiculos. Su lleva dice qué vehículo era: se adopta como una fila implícita (el
  // plan la crea) en vez de borrar sus viajes en silencio. Es lo mismo que hace
  // scripts/sql/hoja-dia-vehiculos-reparar.sql: liga los planeados del mismo camión.
  const fuente = orig.length ? undefined
    : vs.find((v) => v.tipo === "lleva" && !v.hojaVehiculoId && planeado(v)) ?? vs.find((v) => v.tipo === "lleva" && !v.hojaVehiculoId);
  const implicita: VehiculoHoja | null = fuente
    ? { id: o.nuevoId("fila"), vehiculoId: fuente.vehiculoId, choferId: choferDe(dia, fuente), modo: "lleva_trae", orden: 0, tocadoMin: o.ahora }
    : null;
  if (implicita) {
    filas = [implicita];
    for (const v of vs) {
      if (!planeado(v) || v.hojaVehiculoId || v.vehiculoId !== implicita.vehiculoId) continue;
      if (v.tipo === "lleva" || v.tipo === "mueve") v.hojaVehiculoId = implicita.id;
      else if (v.tipo === "busca" && v.vehiculoId && (!v.choferId || v.choferId === implicita.choferId)) v.hojaVehiculoId = implicita.id;
    }
  }
  /** Lo que había, con la fila implícita: decide el encuentro y si el busca es nuevo. */
  const antes = implicita ? [implicita] : orig;
  const teniaQuienLleve = antes.some((f) => f.modo === "lleva_trae");
  // Sin vehículos ni lleva, un busca o un mueve sueltos (también del código de antes) no se
  // borran por un gesto ajeno: sólo "Van por su cuenta" / "Sin chofer" o "Vuelven solos".
  const protegerSueltos = !orig.length && !implicita && cambio.k !== "modo";
  const queLleva = () => filas.find((f) => f.modo === "lleva_trae") ?? null;
  // El lleva de un vehículo; los de antes de los varios vehículos (sin renglón) son del que los lleva.
  const llevaDe = (f: VehiculoHoja) =>
    vs.find((v) => v.tipo === "lleva" && v.hojaVehiculoId === f.id) ?? (f === queLleva() ? vs.find((v) => v.tipo === "lleva" && !v.hojaVehiculoId) ?? null : null);
  const busca = () => vs.find((v) => v.tipo === "busca") ?? null;
  const borrar = (v: Viaje) => { if (planeado(v)) vs = vs.filter((x) => x !== v); };
  const nuevoViaje = (tipo: "lleva" | "busca", f: VehiculoHoja | null, hora: Hora): Viaje => {
    const v: Viaje = {
      id: o.nuevoId("viaje"), fecha: dia.fecha, vehiculoId: f?.vehiculoId ?? null, choferId: f?.choferId ?? null, fleteExterno: null, tipo,
      hojaId: h.id, hojaVehiculoId: f?.id ?? null, cuadrillaOdooId: c, hacia: VACIO, desde: null, orden: toMin(hora) ?? 420, hora,
      noAntesDe: null, duracionMin: null, vuelta: false, vueltaCarga: null, vueltaLlega: null, carga: null, cargaDeposito: null,
      okTodoElDia: false, estado: "planeado", hechoMin: null, hechoPor: null, noPudoMotivo: null, anuladoMotivo: null, foto: false,
      creadoMin: o.ahora, version: 1,
    };
    vs.push(v);
    return v;
  };
  /** La hora de un lleva: también corre la llegada al depósito (si estaba cargada a mano). */
  const horaLleva = (v: Viaje, hora: Hora) => {
    v.vueltaLlega = correrLlegada(v.vueltaLlega, v.hora, hora);
    v.hora = hora;
    v.orden = toMin(hora) ?? v.orden;
  };
  /** El mismo vehículo dos veces en una hoja no va (y la base tampoco lo deja: idx_hd_hoja_vehiculos_vehiculo). */
  const noRepetido = (veh: string | null | undefined, f?: VehiculoHoja) => {
    if (veh && filas.some((x) => x !== f && x.vehiculoId === veh)) throw new NoSePuede(`El ${patente(dia, veh)} ya va en esta cuadrilla.`);
  };
  /**
   * Un viaje de un vehículo de la hoja sigue a su renglón SÓLO en lo que el gesto le cambió
   * (el camión, el chofer, o los dos si el renglón es nuevo). Un gesto ajeno (la hora del
   * busca, el encuentro, la carga) nunca le cambia el camión ni el chofer a un viaje: los
   * viajes de antes pueden estar en otro camión (se movieron en Camiones).
   */
  const seguir = (v: Viaje, f: VehiculoHoja) => {
    const a = antes.find((x) => x.id === f.id);
    if (!a || a.vehiculoId !== f.vehiculoId) v.vehiculoId = f.vehiculoId;
    if (!a || a.choferId !== f.choferId) v.choferId = f.choferId;
  };
  const fila = (id: string | null | undefined): VehiculoHoja => {
    const f = id ? filas.find((x) => x.id === id) : queLleva();
    if (!f) throw new NoSePuede(id ? "Ese vehículo ya no está en la hoja." : "La cuadrilla no tiene quién la lleve.");
    return f;
  };
  /** Un chofer que no viene no se propone. */
  const disponible = (ch: string | null | undefined) => (ch && !ausenciaDe(dia, ch) ? ch : null);
  /** Propone el vehículo del chofer o el chofer del vehículo, sólo si falta (chofer y vehículo son independientes). */
  const completar = (f: VehiculoHoja) => {
    if (f.choferId && !f.vehiculoId) {
      const v = vehiculoDeChofer(dia, f.choferId);
      if (v && !filas.some((x) => x !== f && x.vehiculoId === v)) f.vehiculoId = v;
    } else if (f.vehiculoId && !f.choferId) {
      const ch = disponible(vehiculo(dia, f.vehiculoId)?.choferHabitualId);
      if (ch && !filas.some((x) => x !== f && x.choferId === ch)) f.choferId = ch;
    }
  };
  const sumar = (modo: ModoVehiculo, choferId?: string | null, vehiculoId?: string | null) => {
    noRepetido(vehiculoId);
    let ch = choferId ?? null, veh = vehiculoId ?? null;
    if (!ch && !veh && !filas.length) {
      // El primero: el de ayer de esta cuadrilla (el del mismo modo), si no va todo el día con otra.
      const ayer = vehiculosDe(dia.anterior?.hojas.find((x) => x.cuadrillaOdooId === c));
      const p = ayer.find((f) => f.modo === modo) ?? ayer[0];
      if (p && !(modo === "todo_el_dia" && p.choferId && todoDe(dia, p.choferId).some((x) => x !== c))) { ch = disponible(p.choferId); veh = p.vehiculoId; }
    }
    const f: VehiculoHoja = { id: o.nuevoId("fila"), vehiculoId: veh, choferId: ch, modo, orden: Math.max(-1, ...filas.map((x) => x.orden)) + 1, tocadoMin: o.ahora };
    filas.push(f);
    completar(f);
    return f;
  };
  const cambiar = (f: VehiculoHoja, x: { modo?: ModoVehiculo; choferId?: string | null; vehiculoId?: string | null }) => {
    noRepetido(x.vehiculoId, f);
    if (x.modo !== undefined) f.modo = x.modo;
    if (x.choferId !== undefined) f.choferId = x.choferId;
    if (x.vehiculoId !== undefined) f.vehiculoId = x.vehiculoId;
    if (x.choferId || x.vehiculoId) completar(f);
  };

  switch (cambio.k) {
    case "sumar": sumar(cambio.modo, cambio.choferId, cambio.vehiculoId); break;
    case "quitar": filas = filas.filter((f) => f.id !== fila(cambio.filaId).id); break;
    case "cambiar": cambiar(fila(cambio.filaId), cambio); break;
    case "modo":
      if (cambio.modo === "sin") filas = [];
      else if (!filas.length) sumar(cambio.modo);
      else cambiar(filas[0], { modo: cambio.modo });
      break;
    case "soltar": {
      const libre = filas.find((f) => !f.choferId);
      if (!filas.length) sumar("lleva_trae", cambio.choferId);
      else if (libre) cambiar(libre, { choferId: cambio.choferId });
      else if (filas.length === 1) cambiar(filas[0], { choferId: cambio.choferId });
      else if (!filas.some((f) => f.choferId === cambio.choferId)) sumar("lleva_trae", cambio.choferId);
      break;
    }
    case "chofer":
      if (filas.length) cambiar(filas[0], { choferId: cambio.choferId });
      else if (cambio.choferId) sumar("lleva_trae", cambio.choferId);
      break;
    case "vehiculo":
      if (filas.length) cambiar(filas[0], { vehiculoId: cambio.vehiculoId });
      else if (cambio.vehiculoId) sumar("lleva_trae", null, cambio.vehiculoId);
      break;
    case "quitarChofer": filas = filas.filter((f) => f.choferId !== cambio.choferId); break;
    case "encuentro": enc = { lugar: cambio.lugar, hora: normHora(cambio.hora) ?? cambio.hora, texto: cambio.lugar === "otro" ? cambio.texto ?? null : null }; break;
    // Lo de los viajes se hace después de acomodar los vehículos (más abajo).
    default: break;
  }

  // ── Los vehículos mandan: los viajes se acomodan a ellos ──
  filas = filas.sort((a, b) => a.orden - b.orden);
  if (!antes.length && filas.length && enc.lugar === "obra") enc = encuentroPorModo(dia, filas[0].modo);
  if (antes.length && !filas.length) enc = encuentroPorModo(dia, "sin");
  const fl = queLleva();
  const ids = new Set(filas.map((f) => f.id));
  // El lleva viejo sin renglón pasa a ser del que los lleva. (Un "mueve" sin renglón es uno
  // que se pasó a otro camión en Camiones: queda suelto.)
  if (fl) {
    const suelto = vs.find((v) => v.tipo === "lleva" && !v.hojaVehiculoId);
    if (suelto && !vs.some((v) => v.tipo === "lleva" && v.hojaVehiculoId === fl.id)) suelto.hojaVehiculoId = fl.id;
  }
  // Lo ya hecho de un vehículo que se sacó queda como historia, sin renglón.
  for (const v of vs) if (!planeado(v) && v.hojaVehiculoId && !ids.has(v.hojaVehiculoId)) v.hojaVehiculoId = null;
  for (const v of [...vs]) {
    if (v.tipo !== "lleva" && v.tipo !== "mueve") continue;
    const f = v.hojaVehiculoId ? filas.find((x) => x.id === v.hojaVehiculoId) : null;
    // Sin su vehículo (o pasó a "Todo el día"): fuera. Los sueltos de antes, si nadie los lleva.
    if ((v.hojaVehiculoId && (!f || f.modo !== "lleva_trae")) || (!v.hojaVehiculoId && !fl && !protegerSueltos)) { borrar(v); continue; }
    if (f && planeado(v)) seguir(v, f);
  }
  // Cada vehículo de "Lleva y trae" tiene su lleva (a la hora del encuentro).
  for (const f of filas) if (f.modo === "lleva_trae" && !llevaDe(f)) nuevoViaje("lleva", f, normHora(enc.hora) ?? enc.hora);
  // El busca: se crea cuando la hoja pasa a tener quién la lleve; se va cuando ya no tiene.
  const bu = busca();
  if (!fl) { if (bu && !protegerSueltos) borrar(bu); }
  else if (!teniaQuienLleve && !bu) nuevoViaje("busca", fl, fin);
  else if (bu && planeado(bu) && bu.hojaVehiculoId) {
    const f = filas.find((x) => x.id === bu.hojaVehiculoId);
    if (f && f.modo === "lleva_trae") seguir(bu, f);
    else if (!ids.has(bu.hojaVehiculoId) || (f && f.modo !== "lleva_trae")) { bu.hojaVehiculoId = null; bu.vehiculoId = null; bu.choferId = null; } // a definir
  }

  // ── Lo de los viajes ──
  switch (cambio.k) {
    case "lleva": {
      const f = fila(cambio.filaId);
      if (f.modo !== "lleva_trae") throw new NoSePuede("Ese vehículo va todo el día: no tiene «lleva».");
      const v = llevaDe(f) ?? nuevoViaje("lleva", f, cambio.hora);
      if (!planeado(v)) throw new NoSePuede("Ese «lleva» ya se hizo.");
      horaLleva(v, normHora(cambio.hora) ?? cambio.hora);
      if (f.id === fl?.id && enc.lugar === "deposito") enc = { ...enc, hora: v.hora! };
      break;
    }
    case "vuelta": {
      const f = fila(cambio.filaId);
      const v = llevaDe(f);
      if (!v || !planeado(v)) throw new NoSePuede("Ese vehículo no tiene un «lleva» por hacer.");
      v.vuelta = cambio.vuelve;
      v.vueltaLlega = cambio.vuelve ? normHora(cambio.llega ?? null) : null;
      break;
    }
    case "carga": {
      const f = fila(cambio.filaId);
      const v = llevaDe(f);
      if (!v || !planeado(v)) throw new NoSePuede("La cuadrilla no tiene un «lleva» por hacer.");
      v.carga = cambio.carga || null;
      break;
    }
    case "busca": {
      const b = busca();
      if (cambio.hora == null) { if (b) borrar(b); break; }
      const hora = normHora(cambio.hora) ?? cambio.hora;
      if (b) { if (!planeado(b)) throw new NoSePuede("Ese «busca» ya se hizo."); b.hora = hora; b.orden = toMin(hora) ?? b.orden; }
      else if (fl) nuevoViaje("busca", fl, hora);
      else throw new NoSePuede("La cuadrilla no tiene quién la lleve: sumá un vehículo de «Lleva y trae».");
      break;
    }
    case "buscaCon": {
      if (!fl) throw new NoSePuede("La cuadrilla no tiene quién la lleve: sumá un vehículo de «Lleva y trae».");
      const b = busca() ?? nuevoViaje("busca", fl, fin);
      if (!planeado(b)) throw new NoSePuede("Ese «busca» ya se hizo.");
      if (cambio.filaId) {
        const f = fila(cambio.filaId);
        b.hojaVehiculoId = f.id; b.vehiculoId = f.vehiculoId; b.choferId = f.choferId;
      } else {
        const veh = cambio.vehiculoId ?? null;
        b.hojaVehiculoId = null;
        b.vehiculoId = veh;
        b.choferId = veh ? (cambio.choferId !== undefined ? cambio.choferId : choferSugerido(dia, veh, toMin(b.hora))) : null;
      }
      break;
    }
    case "encuentro": {
      const v = fl ? llevaDe(fl) : null;
      if (v && planeado(v) && enc.lugar === "deposito") horaLleva(v, enc.hora);
      break;
    }
    default: break;
  }

  // ── La diferencia con lo que había ──
  const tocado = new Set<string>();
  const cambiarF: PlanVehiculos["cambiar"] = [];
  for (const f of filas) {
    const a = orig.find((x) => x.id === f.id);
    if (!a) continue;
    const valores: Partial<VehiculoHoja> = {};
    for (const k of CAMPOS_FILA) if (a[k] !== f[k]) (valores as Record<string, unknown>)[k] = f[k];
    if (Object.keys(valores).length) { f.tocadoMin = o.ahora; valores.tocadoMin = o.ahora; tocado.add(f.id); cambiarF.push({ id: f.id, valores }); }
  }
  const cambiarV: PlanVehiculos["viajes"]["cambiar"] = [];
  for (const v of vs) {
    const a = origV.find((x) => x.id === v.id);
    if (!a) continue;
    const valores: Partial<Viaje> = {};
    for (const k of CAMPOS_VIAJE) if (a[k] !== v[k]) (valores as Record<string, unknown>)[k] = v[k];
    if (Object.keys(valores).length) cambiarV.push({ id: v.id, valores });
  }
  const quitar = orig.filter((x) => !filas.some((f) => f.id === x.id)).map((x) => x.id);
  // Los anulados que nombran un vehículo que se va también se sueltan acá (con historial):
  // si no, la FK (ON DELETE SET NULL) los cambiaría por detrás del grabador.
  for (const v of dia.viajes) {
    if (v.hojaId === h.id && v.estado === "anulado" && v.hojaVehiculoId && quitar.includes(v.hojaVehiculoId)) cambiarV.push({ id: v.id, valores: { hojaVehiculoId: null } });
  }
  const encCambio = enc.lugar !== h.encuentro.lugar || (normHora(enc.hora) ?? enc.hora) !== (normHora(h.encuentro.hora) ?? h.encuentro.hora) || (enc.texto ?? null) !== (h.encuentro.texto ?? null);
  return {
    filas,
    sumar: filas.filter((f) => !orig.some((x) => x.id === f.id)),
    cambiar: cambiarF,
    quitar,
    encuentro: encCambio ? enc : null,
    viajes: {
      crear: vs.filter((v) => !origV.some((x) => x.id === v.id)),
      cambiar: cambiarV,
      borrar: origV.filter((x) => !vs.some((v) => v.id === x.id)).map((x) => x.id),
    },
  };
}

/** ¿El plan no cambia nada? (el gesto no escribe ni anota). */
export const planVacio = (p: PlanVehiculos) =>
  !p.sumar.length && !p.cambiar.length && !p.quitar.length && !p.encuentro && !p.viajes.crear.length && !p.viajes.cambiar.length && !p.viajes.borrar.length;

/** El resumen que queda en las columnas viejas de hd_hojas (el primer vehículo): rollback y migración sin duplicar. */
export function resumenLegado(filas: VehiculoHoja[]): { chofer_modo: ModoChofer; chofer_id: string | null; vehiculo_id: string | null } {
  const f = [...filas].sort((a, b) => a.orden - b.orden)[0];
  return f ? { chofer_modo: f.modo, chofer_id: f.choferId, vehiculo_id: f.vehiculoId } : { chofer_modo: "sin", chofer_id: null, vehiculo_id: null };
}
