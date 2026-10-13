// El Pizarrón del día (docs/equipos-del-dia/rediseno-plan.md, maqueta/pizarron.html): otra
// forma de VER el mismo `DiaHoja`. Columnas = cuadrillas (con su gente, sus contratistas y
// sus camiones); abajo, la bandeja (sin asignar, contratistas, camiones libres, no vienen).
//
// PURO (sin React ni servidor) y con tests (pizarron.test.ts). No inventa reglas: todo sale
// de estado.ts (quién va, a cargo, choferes, ausencias) y los avisos de cada columna son los
// `problemas()` de siempre en una frase corta con el botón que los resuelve. El texto largo
// (la bandeja clásica, el Telegram) sigue saliendo de las mismas funciones.
//
// "Una persona en un solo lugar": cada uno aparece UNA vez. El que maneja un vehículo de una
// hoja va adentro del camión (no en "Sin asignar"); el chofer HABITUAL de un vehículo nunca
// cuenta como asignado (decisión del dueño, 11/10 noche): un camión libre sólo muestra el
// chofer del día (hd_camiones_dia) o el que resuelven sus viajes.

import type { Ausencia, DiaHoja, Minutos, ModoVehiculo, ObraDia, TipoAusencia, Vehiculo, VehiculoHoja } from "./tipos.ts";
import { DEPOSITO, TIPO_AUSENCIA_TXT, esDeposito } from "./tipos.ts";
import {
  aCargoDe, ausenciaDe, calcVeh, cap, choferDe, choferDelCamion, choferesDelDia, choferesTodoDe, cNombre, contratistasDe, cuadrilla,
  esPasado, genteDe, hm, hm5, pendientesEnvio, hojaDe, hojaDeCuadrilla, marcaVehiculo, nombreDe, nombreVehiculo, obrasCon, obrasDe, persona, prevista,
  problemas, puedeManejar, sinAsignar, suspendida, todoDe, vanDe, vehiculo, vehiculosDe, vehTxt, viajesVigentes, type Boton, type Problema,
} from "./estado.ts";
import { horasDeFila, horasLlevaTrae } from "./vista-cuadrillas.ts";

// ─── Las piezas ─────────────────────────────────────────────────────────────

/** Una persona en el pizarrón. */
export type FichaPersona = {
  pid: string;
  /** El apellido ("Miño H.") y el nombre entero para el title/aria-label. */
  nombre: string;
  completo: string;
  aCargo: boolean;
  /** Puede manejar (el volante de la ficha): choferes y "Puede manejar" de Legajos. */
  maneja: boolean;
  /** Va en esta columna y además maneja todo el día uno de sus camiones (cuenta una vez). */
  chofer: boolean;
  /** Está en una columna y no viene (ausencia de todo el día): un aviso lo dice. */
  ausente: boolean;
};

/** Un camión: el renglón de una hoja (`filaId`) o un camión libre (`c` null). */
/**
 * Cómo se dibuja cada vehículo (pedido del dueño, 12/10: "que los íconos sean reales"): el
 * Agrale es cabina simple con caja y hidrogrúa; los Iveco, doble cabina con caja (siempre
 * abierta); la S10, pickup doble cabina; la moto, moto; los Clark, autoelevadores.
 */
export type FormaVehiculo = "hidrogrua" | "camion" | "pickup" | "moto" | "autoelevador" | "otro";
export function formaVehiculo(V: Pick<Vehiculo, "tipo" | "marca" | "modelo"> | null | undefined): FormaVehiculo {
  if (!V) return "camion";
  const txt = `${V.marca ?? ""} ${V.modelo ?? ""}`.toLowerCase();
  if (V.tipo === "hidrogrua") return "hidrogrua";
  if (V.tipo === "camion") return "camion";
  if (V.tipo === "camioneta") return "pickup";
  if (/autoelev|clark/.test(txt)) return "autoelevador";
  if (/moto/.test(txt)) return "moto";
  return "otro";
}

export type FichaCamion = {
  /** Clave estable para React y la animación: el renglón o el vehículo. */
  k: string;
  veh: string | null;
  filaId: string | null;
  c: number | null;
  marca: string;
  patente: string;
  /** "Iveco AB 799 CA" ("" si al renglón le falta el camión). */
  nombre: string;
  /** Índice de color fijo por camión (paleta del tablero). */
  color: number;
  /** El dibujo del vehículo (formaVehiculo). */
  forma: FormaVehiculo;
  choferId: string | null;
  /**
   * De dónde sale el chofer que se muestra: el renglón de la hoja, el chofer del día
   * (hd_camiones_dia) o el que resuelven sus viajes. Nunca el habitual.
   */
  choferDe: "fila" | "dia" | "viajes" | null;
  /** El chofer está en otro lugar a la vez (otra cuadrilla u otro camión). */
  choque: boolean;
  modo: ModoVehiculo | null;
  /** "7:00" (lleva y trae: su lleva). */
  lleva: string | null;
  /** "17:00" (lleva y trae: el busca de la cuadrilla; null = vuelven solos o no hay). */
  busca: string | null;
  /** Viajes del camión ese día (sin anulados). */
  viajes: number;
  /** "en el taller", "fuera de servicio". */
  estado: string | null;
};

export type FichaContratista = { kid: string; nombre: string; cantidad: number; aCargo: boolean };

/** Una obra del encabezado de la columna (de solo lectura: viene del tablero). */
export type ObraColumna = {
  otId: number;
  corto: string;
  direccion: string;
  /** "Armado", "Desarme", "Mantenimiento". */
  tipo: string;
  detalle: string | null;
  /** "día 3 de 5", "¼ jornada" o null. */
  jornada: string | null;
  /** La hora de arranque (estimada si no la fijó una instrucción). */
  hora: string;
  horaEstimada: boolean;
  /** Con otra obra después: hasta qué hora (estimada). */
  hasta: string | null;
  /** Las instrucciones y lo de la OT (popover "Instrucciones"). */
  notas: string[];
  /** Cómo llegan a esta obra si no es la primera: "van por su cuenta", "en el Iveco AB 799 CA". */
  llega: string | null;
};

/** Un aviso de la columna: frase corta + el botón que lo resuelve (los problemas() de siempre). */
export type AvisoColumna = {
  k: string;
  /** La frase corta de la insignia ("Sin nadie a cargo", "Falta 1 persona (4 de 5)"). */
  texto: string;
  /** El texto entero (el de la tarjeta clásica), para el title y el detalle. */
  largo: string;
  nivel: Problema["nivel"];
  rojo: boolean;
  /** El botón principal y los demás (mismo formato que la vista clásica). */
  boton: Boton | null;
  botones: Boton[];
};

export type Columna = {
  c: number;
  /** La columna del Depósito (F2): siempre está, al final; recibe gente, no camiones ni contratistas. */
  deposito: boolean;
  /** La dirección del depósito (hd_lugares), para el encabezado de su columna. */
  direccion: string | null;
  numero: number | null;
  /** "1", "2"… (o la inicial si no tiene número). */
  rotulo: string;
  nombre: string;
  /** Índice de color de la cuadrilla (paleta del tablero, colorCuadrilla). */
  color: number;
  conObra: boolean;
  suspendida: string | null;
  /** ¿Se le puede soltar gente / camiones / contratistas? (decisión 3: sin obra, no). */
  acepta: boolean;
  /** Por qué no acepta, en palabras ("La 4 no tiene obra en el tablero"). */
  motivo: string | null;
  tieneHoja: boolean;
  obras: ObraColumna[];
  van: number;
  prevista: number;
  gente: FichaPersona[];
  contratistas: FichaContratista[];
  camiones: FichaCamion[];
  avisos: AvisoColumna[];
};

export type NoViene = { pid: string; nombre: string; completo: string; maneja: boolean; tipo: TipoAusencia; motivo: string; ausenciaId: string | null; desde: string; asistencia: boolean };

export type VistaPizarron = {
  columnas: Columna[];
  sinAsignar: FichaPersona[];
  /** Los contratistas activos, con cuántos puestos ocupan ese día. */
  contratistas: { kid: string; nombre: string; puestos: number }[];
  camionesLibres: FichaCamion[];
  noVienen: NoViene[];
  /** Cuántos avisos hay en todas las columnas (el contador de la barra). */
  avisos: number;
  /** Ninguna cuadrilla tiene hoja todavía: el recuadro "Copiar de …". */
  vacio: boolean;
  /** Día pasado: sólo lectura. */
  pasado: boolean;
};

// ─── Colores ────────────────────────────────────────────────────────────────

/** El color del Depósito: uno de la paleta que no usa ninguna de las cinco cuadrillas. */
export const COLOR_DEPOSITO = 7;
/** El color de una cuadrilla: por su número (Cuadrilla 1 → 0), así no cambia de un día a otro. */
export function colorDeCuadrilla(dia: DiaHoja, c: number, i: number): number {
  if (esDeposito(c)) return COLOR_DEPOSITO;
  const n = cuadrilla(dia, c)?.numero;
  return n != null ? n - 1 : i;
}
/** El color de un camión: fijo por patente (el mismo todos los días, en todas las pantallas). */
export function colorDeCamion(patente: string): number {
  let h = 0;
  for (const ch of patente.replace(/\s/g, "")) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % 8;
}

// ─── Columnas ───────────────────────────────────────────────────────────────

/** Las cuadrillas del pizarrón: las nuestras (con o sin obra), cualquiera con obras u hoja ese día y, al final, el Depósito (siempre). */
export function cuadrillasDelPizarron(dia: DiaHoja): number[] {
  const ids = new Set<number>([
    ...dia.cuadrillas.filter((x) => !x.tercerizada).map((x) => x.odooId),
    ...dia.obras.map((o) => o.cuadrillaOdooId),
    ...dia.hojas.map((h) => h.cuadrillaOdooId),
  ]);
  ids.delete(DEPOSITO);
  const num = (c: number) => cuadrilla(dia, c)?.numero ?? 999;
  return [...[...ids].sort((a, b) => num(a) - num(b) || a - b), DEPOSITO];
}

/** ¿Se le puede soltar algo a la cuadrilla? null = sí; si no, por qué. */
export function porQueNoAcepta(dia: DiaHoja, c: number, ahora: Minutos): string | null {
  const n = cuadrilla(dia, c)?.numero;
  const la = n != null ? `La ${n}` : `La ${cNombre(dia, c)}`;
  if (esPasado(ahora)) return "Es un día que ya pasó: sólo lectura";
  // El depósito no tiene obras del tablero: recibe gente siempre (camiones y contratistas los rechaza el gesto).
  if (esDeposito(c)) return null;
  if (!obrasDe(dia, c).length) return `${la} no tiene obra en el tablero`;
  const sus = suspendida(dia, c);
  if (sus) return `${la} está suspendida (${sus})`;
  return null;
}

const jornadaDe = (o: ObraDia): string | null => {
  if (o.dia != null && o.totalDias != null) return `día ${o.dia} de ${o.totalDias}`;
  if (o.fraccion >= 1) return null;
  return o.fraccion === 0.5 ? "½ jornada" : o.fraccion === 0.25 ? "¼ jornada" : o.fraccion === 0.75 ? "¾ jornada" : `${String(o.fraccion).replace(".", ",")} jornada`;
};

/** Cómo llega la cuadrilla a su obra `i` (la segunda, la tercera): con un "mueve" en camión, con el de todo el día, o por su cuenta. */
export function comoLlega(dia: DiaHoja, c: number, otId: number): string {
  const h = hojaDeCuadrilla(dia, c);
  if (h) {
    const mueve = viajesVigentes(dia).find((v) => v.hojaId === h.id && v.tipo === "mueve" && v.hacia.otId === otId && v.vehiculoId);
    if (mueve) return `en ${articulo(dia, mueve.vehiculoId)} ${vehTxt(dia, mueve.vehiculoId)}`;
    const todo = vehiculosDe(h).find((f) => f.modo === "todo_el_dia" && f.vehiculoId);
    if (todo) return `en ${articulo(dia, todo.vehiculoId)} ${vehTxt(dia, todo.vehiculoId)}`;
  }
  return "van por su cuenta";
}
const articulo = (dia: DiaHoja, veh: string | null) => {
  const V = vehiculo(dia, veh);
  return V && (V.tipo === "camioneta" || (V.marca ?? "").toLowerCase() === "moto") ? "la" : "el";
};

function obrasDeColumna(dia: DiaHoja, c: number): ObraColumna[] {
  const ob = obrasCon(dia, c);
  return ob.map((x, i) => {
    const o = x.o;
    const ins = dia.instrucciones.find((y) => y.otId === o.otId);
    const notas = [
      ins?.horaInicio ? `Empiezan a las ${ins.horaInicio}` : null,
      ins?.hoy ?? null,
      ...(ins?.chips ?? []),
      o.observaciones,
      o.contactoObra ? `Contacto: ${o.contactoObra}${o.telObra ? ` (${o.telObra})` : ""}` : null,
    ].filter((s): s is string => !!s && !!s.trim());
    return {
      otId: o.otId,
      corto: o.corto,
      direccion: o.direccion,
      tipo: cap(o.tipo || "obra"),
      detalle: o.detalleTecnico,
      jornada: jornadaDe(o),
      hora: x.hora,
      horaEstimada: x.est,
      hasta: i < ob.length - 1 ? hm5(x.fin) : null,
      notas,
      llega: i > 0 ? comoLlega(dia, c, o.otId) : null,
    };
  });
}

/** "Sin nadie a cargo. Sugerido: Sack (…)" → "Sin nadie a cargo": la primera frase de la tarjeta. */
export function fraseCorta(p: Pick<Problema, "card">): string {
  const i = p.card.indexOf(". ");
  return i > 0 ? p.card.slice(0, i) : p.card;
}

export function avisosDeColumna(dia: DiaHoja, c: number, ahora: Minutos): AvisoColumna[] {
  return problemas(dia, c, ahora).map((p) => ({
    k: p.k, texto: fraseCorta(p), largo: p.card, nivel: p.nivel, rojo: p.rojo, boton: p.bs[0] ?? null, botones: p.bs,
  }));
}

// ─── Camiones ───────────────────────────────────────────────────────────────

const estadoVeh = (V: Vehiculo | null) => (V?.estado === "en_taller" ? "en el taller" : V?.estado === "fuera_servicio" ? "fuera de servicio" : null);

function fichaDeFila(dia: DiaHoja, c: number, f: VehiculoHoja): FichaCamion {
  const V = vehiculo(dia, f.vehiculoId);
  const ll = f.modo === "lleva_trae" ? horasDeFila(dia, c, f.id) : null;
  const ch = f.choferId;
  const otra = ch ? hojaDe(dia, ch) : null;
  return {
    k: `fila:${f.id}`,
    veh: f.vehiculoId,
    filaId: f.id,
    c,
    marca: V ? marcaVehiculo(V) : "",
    patente: V?.patente ?? "",
    nombre: V ? nombreVehiculo(V) : "",
    color: V ? colorDeCamion(V.patente) : 7,
    forma: formaVehiculo(V),
    choferId: ch,
    choferDe: ch ? "fila" : null,
    // Un chofer de "lleva y trae" puede llevar a dos cuadrillas (Kiska lleva la 2 y la 3): no
    // es choque. Sí lo es estar en otra cuadrilla como integrante o todo el día en dos.
    choque: !!ch && ((otra != null && otra !== c) || (f.modo === "todo_el_dia" && todoDe(dia, ch).length > 1)),
    modo: f.modo,
    lleva: ll ? ll.lleva || null : null,
    busca: f.modo === "lleva_trae" ? horasLlevaTrae(dia, c).busca : null,
    viajes: f.vehiculoId ? calcVeh(dia, f.vehiculoId).length : 0,
    estado: estadoVeh(V),
  };
}

/**
 * El chofer que se muestra en un camión libre: el del día (hd_camiones_dia) o, si no hay, el
 * que resuelve su primer viaje (choferDe: renglón → viaje anterior/siguiente → del día).
 * Nunca el habitual.
 */
export function choferDeLibre(dia: DiaHoja, veh: string): { ch: string | null; de: FichaCamion["choferDe"] } {
  const delDia = choferDelCamion(dia, veh);
  if (delDia) return { ch: delDia, de: "dia" };
  for (const v of calcVeh(dia, veh)) {
    const ch = choferDe(dia, v);
    if (ch) return { ch, de: "viajes" };
  }
  return { ch: null, de: null };
}

function fichaLibre(dia: DiaHoja, V: Vehiculo): FichaCamion {
  const { ch, de } = choferDeLibre(dia, V.id);
  return {
    k: `veh:${V.id}`, veh: V.id, filaId: null, c: null, marca: marcaVehiculo(V), patente: V.patente, nombre: nombreVehiculo(V),
    color: colorDeCamion(V.patente), forma: formaVehiculo(V), choferId: ch, choferDe: de, choque: false, modo: null, lleva: null, busca: null,
    viajes: calcVeh(dia, V.id).length, estado: estadoVeh(V),
  };
}

// ─── Personas ───────────────────────────────────────────────────────────────

function ficha(dia: DiaHoja, pid: string, extra: Partial<FichaPersona> = {}): FichaPersona {
  const p = persona(dia, pid);
  return {
    pid, nombre: nombreDe(dia, pid) || "—", completo: p?.nombreCompleto || nombreDe(dia, pid), aCargo: false,
    maneja: puedeManejar(p), chofer: false, ausente: false, ...extra,
  };
}

/** Los que manejan un vehículo de una hoja ese día (van adentro del camión, no sueltos). */
function choferesDeRenglones(dia: DiaHoja): Set<string> {
  const s = new Set<string>();
  for (const h of dia.hojas) for (const f of h.vehiculos) if (f.choferId) s.add(f.choferId);
  return s;
}

/**
 * "Sin asignar" del pizarrón: los de sinAsignar() (estado.ts: armadores y los que pueden
 * manejar) más los choferes que no manejan nada ese día, sin ninguno que ya esté adentro de un
 * camión. El habitual de un vehículo NO lo saca de acá: no cuenta como asignado.
 */
export function sinAsignarPizarron(dia: DiaHoja): string[] {
  const enCamion = choferesDeRenglones(dia);
  const delDia = new Set([...choferesDelDia(dia), ...dia.camiones.map((x) => x.choferId).filter(Boolean) as string[]]);
  const base = sinAsignar(dia).filter((pid) => !enCamion.has(pid));
  const choferes = dia.personas
    .filter((p) => p.activo && !p.externa && p.esChofer && p.deObra !== false && !ausenciaDe(dia, p.id) && hojaDe(dia, p.id) == null && !delDia.has(p.id))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))
    .map((p) => p.id);
  return [...base, ...choferes.filter((x) => !base.includes(x))];
}

function noVienen(dia: DiaHoja): NoViene[] {
  return dia.personas
    .filter((p) => p.activo && !p.externa && p.deObra !== false)
    .map((p) => ({ p, a: ausenciaDe(dia, p.id) }))
    .filter((x): x is { p: typeof x.p; a: Ausencia } => !!x.a)
    .sort((x, y) => x.p.nombre.localeCompare(y.p.nombre, "es"))
    .map(({ p, a }) => ({
      pid: p.id, nombre: p.nombre, completo: p.nombreCompleto, maneja: puedeManejar(p), tipo: a.tipo, motivo: cap(TIPO_AUSENCIA_TXT[a.tipo]),
      ausenciaId: a.id, desde: a.desde, asistencia: a.origen === "asistencia" && a.id == null,
    }));
}

// ─── El pizarrón entero ─────────────────────────────────────────────────────

export function pizarron(dia: DiaHoja, ahora: Minutos): VistaPizarron {
  const columnas: Columna[] = cuadrillasDelPizarron(dia).map((c, i) => {
    const h = hojaDeCuadrilla(dia, c);
    const n = cuadrilla(dia, c)?.numero ?? null;
    const cargo = aCargoDe(h);
    const todo = choferesTodoDe(h);
    const motivo = porQueNoAcepta(dia, c, ahora);
    const conObra = obrasDe(dia, c).length > 0;
    const dep = esDeposito(c);
    return {
      c,
      deposito: dep,
      direccion: dep ? dia.lugares.find((l) => l.tipo === "deposito" && l.activo)?.direccion ?? null : null,
      numero: n,
      rotulo: dep ? "D" : n != null ? String(n) : cNombre(dia, c).slice(0, 1).toUpperCase(),
      nombre: cNombre(dia, c),
      color: colorDeCuadrilla(dia, c, i),
      conObra,
      suspendida: suspendida(dia, c),
      acepta: motivo == null,
      motivo,
      tieneHoja: !!h,
      obras: obrasDeColumna(dia, c),
      van: vanDe(dia, c),
      prevista: prevista(dia, c),
      gente: h ? genteDe(h).map((pid) => ficha(dia, pid, { aCargo: pid === cargo, chofer: todo.includes(pid), ausente: !!ausenciaDe(dia, pid) })) : [],
      contratistas: contratistasDe(h).map((x) => ({ kid: x.contratistaId, nombre: nombreDe(dia, x.contratistaId), cantidad: x.cantidad, aCargo: cargo === x.contratistaId })),
      camiones: h ? vehiculosDe(h).map((f) => fichaDeFila(dia, c, f)) : [],
      avisos: conObra || dep ? avisosDeColumna(dia, c, ahora) : [],
    };
  });
  const enHojas = new Set(dia.hojas.filter((h) => obrasDe(dia, h.cuadrillaOdooId).length).flatMap((h) => h.vehiculos.map((f) => f.vehiculoId)).filter(Boolean) as string[]);
  // Los autoelevadores y la moto no salen a la calle con una cuadrilla (decisión del dueño,
  // 12/10): no van en "Camiones libres". Si alguno tiene un viaje cargado, sí (para verlo).
  const camionesLibres = dia.vehiculos
    .filter((V) => !enHojas.has(V.id) && (V.tipo !== "otro" || calcVeh(dia, V.id).length > 0))
    .sort((a, b) => nombreVehiculo(a).localeCompare(nombreVehiculo(b), "es"))
    .map((V) => fichaLibre(dia, V));
  const puestos = (kid: string) => dia.hojas.reduce((s, h) => s + h.contratistas.filter((x) => x.contratistaId === kid).reduce((t, x) => t + x.cantidad, 0), 0);
  return {
    columnas,
    sinAsignar: sinAsignarPizarron(dia).map((pid) => ficha(dia, pid)),
    contratistas: dia.contratistas.filter((k) => k.activo).sort((a, b) => a.nombre.localeCompare(b.nombre, "es")).map((k) => ({ kid: k.id, nombre: k.nombre, puestos: puestos(k.id) })),
    camionesLibres,
    noVienen: noVienen(dia),
    avisos: columnas.reduce((s, x) => s + x.avisos.length, 0),
    vacio: !dia.hojas.some((h) => obrasDe(dia, h.cuadrillaOdooId).length > 0),
    pasado: esPasado(ahora),
  };
}

/** "4 de 5" de la columna y si le falta gente. */
export const cuentaColumna = (x: Pick<Columna, "van" | "prevista">) => ({ texto: `${x.van} de ${x.prevista}`, corto: x.van < x.prevista });

/**
 * El botón "Mandar" de la barra: "Mandar a los capataces y choferes" (nada enviado), "Mandar
 * cambios" (algo cambió después de mandar o falta alguien) o "Mandado 18:42" (todo al día).
 * Las cuentas son las de la lista de envío (pendientesEnvio, estado.ts).
 */
export function estadoMandar(dia: DiaHoja): { texto: string; hecho: boolean } {
  const vigentes = dia.envios.filter((e) => !e.anulado && e.enviadaMin != null);
  if (!vigentes.length) return { texto: "Mandar a los capataces y choferes", hecho: false };
  const p = pendientesEnvio(dia);
  if (p.sinEnv || p.cambios) return { texto: "Mandar cambios", hecho: false };
  const ultimo = Math.max(...vigentes.map((e) => Math.max(e.enviadaMin!, e.cambioMin ?? -1e9, e.reenviadaMin ?? -1e9)));
  return { texto: `Mandado ${hm(ultimo)}`, hecho: true };
}
