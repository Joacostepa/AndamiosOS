// Los gestos del Pizarrón (arrastrar, tocar ficha → tocar destino, teclas 1–5 / B) en las
// acciones de SIEMPRE: soltar(origen, destino) → la lista de acciones existentes (acciones.ts)
// que hay que mandar, en orden. No hay acciones nuevas: el pizarrón y la vista clásica
// escriben las mismas tablas con los mismos gestos (y el mismo historial y Deshacer).
//
// PURO (sin React ni servidor) y con tests (gestos-pizarron.test.ts). Cada acción se ve al
// instante con optimista.ts (agregar, sacar, vehículos, contratistas, chofer del camión,
// ausencias) y después confirma el servidor con su texto de siempre.
//
// El Depósito (F2, cuadrilla 0) recibe gente (agregar con el 0, como una cuadrilla) pero no
// camiones ni contratistas.
//
// Un pedido (F4) se suelta en un camión (`poner_pedido`: el servidor lo pone en el hueco de
// menor desvío), en la franja de camiones de una cuadrilla (si tiene uno solo) o de vuelta en
// el panel de pedidos (sale del camión: `volver_a_cola`). Si ya iba en otro camión, `mover`.
//
// Lo que NO se puede (soltar en una cuadrilla sin obra, un chofer que no maneja) vuelve como
// `rechazo` con la frase para la pantalla; soltar donde ya estaba es `nada` (no se manda nada,
// la ficha vuelve sin sacudirse). "No vienen" necesita el motivo: sin `tipo`, `pedirMotivo`.

import type { AccionAusencia, AccionHoja, AccionPedido, AccionViaje } from "./acciones.ts";
import type { DiaHoja, Fecha, Minutos, TipoAusencia } from "./tipos.ts";
import { esDeposito } from "./tipos.ts";
import { ausenciaDe, cNombre, cuadrilla, elVeh, hojaDe, hojaDeCuadrilla, nombreDe, persona, puedeManejar, vehiculo, vehTxt, vehiculosDe } from "./estado.ts";
import { choferDeLibre, porQueNoAcepta } from "./pizarron.ts";

/** Lo que se agarra. */
export type Origen =
  /** Una persona suelta: en una columna, en "Sin asignar" o en "No vienen" (se deduce del día). */
  | { k: "persona"; pid: string }
  /** El chofer adentro de un camión: el de un renglón (`filaId`, cuadrilla `c`) o el de un camión libre. */
  | { k: "chofer"; pid: string; veh: string | null; filaId: string | null; c: number | null }
  /** Un camión: un renglón de una hoja (`filaId`, `c`) o uno libre (`c` null). */
  | { k: "camion"; veh: string | null; filaId: string | null; c: number | null }
  /** Un contratista de la bandeja (arrastrarlo suma 1). */
  | { k: "contratista"; kid: string }
  /** Un pedido del panel (F4). */
  | { k: "pedido"; id: string };

/** Adónde se suelta. */
export type Destino =
  /** La gente de una cuadrilla; `sobre` = encima de una ficha (la reemplaza). */
  | { k: "gente"; c: number; sobre?: string | null }
  /** Encima de un camión: queda de chofer. */
  | { k: "camion"; veh: string | null; filaId: string | null; c: number | null }
  /** La franja de camiones de una cuadrilla. */
  | { k: "camiones"; c: number }
  /** Cualquier parte de la columna (el encabezado, el hueco): cada cosa va a lo suyo. */
  | { k: "columna"; c: number }
  | { k: "sin" }
  | { k: "libres" }
  | { k: "no"; tipo?: TipoAusencia }
  /** El panel de pedidos: un pedido soltado acá sale de su camión. */
  | { k: "pedidos" };

/** Una acción existente, con el hook que la manda (use-hoja-dia). */
export type Gesto =
  | { k: "hoja"; a: AccionHoja }
  | { k: "viaje"; a: AccionViaje }
  | { k: "ausencia"; a: AccionAusencia }
  | { k: "pedido"; a: AccionPedido };

export type Soltar =
  | { k: "gestos"; gestos: Gesto[] }
  | { k: "rechazo"; motivo: string }
  | { k: "nada" }
  | { k: "pedirMotivo"; pid: string };

const N = (dia: DiaHoja, pid: string) => nombreDe(dia, pid) || "Esa persona";
const nada: Soltar = { k: "nada" };
const rechazo = (motivo: string): Soltar => ({ k: "rechazo", motivo });
const gestos = (...g: Gesto[]): Soltar => (g.length ? { k: "gestos", gestos: g } : nada);
const hojaG = (a: AccionHoja): Gesto => ({ k: "hoja", a });
const viajeG = (a: AccionViaje): Gesto => ({ k: "viaje", a });

/** Sacar a alguien de "No vienen" para que vaya ese día ("Ya tiene el alta"; si empezaba ese día, se anula). */
function volver(dia: DiaHoja, pid: string): Gesto | null {
  const a = ausenciaDe(dia, pid);
  if (!a) return null;
  if (a.id) return { k: "ausencia", a: { accion: "alta", fecha: dia.fecha, ausenciaId: a.id } };
  return { k: "ausencia", a: { accion: "alta", fecha: dia.fecha, personaId: pid, desde: a.desde, tipo: a.tipo } };
}

/** "No viene" ese día (sólo ese día: la ausencia larga se carga en Ausencias). */
export const noViene = (fecha: Fecha, pid: string, tipo: TipoAusencia): Gesto => ({
  k: "ausencia", a: { accion: "crear", personaId: pid, desde: fecha, hasta: fecha, tipo },
});

/** Sacar al chofer del camión de donde estaba (el renglón o el chofer del día del camión libre). */
function quitarChofer(dia: DiaHoja, o: Extract<Origen, { k: "chofer" }>): Gesto | null {
  if (o.filaId && o.c != null) return hojaG({ accion: "vehiculo_cambiar", fecha: dia.fecha, cuadrilla: o.c, filaId: o.filaId, choferId: null });
  if (o.veh) return viajeG({ accion: "chofer_del_camion", fecha: dia.fecha, vehiculoId: o.veh, choferId: null });
  return null;
}

/** Poner a alguien de chofer de un camión (el renglón de la hoja o el chofer del día de uno libre). */
function ponerChofer(dia: DiaHoja, d: Extract<Destino, { k: "camion" }>, pid: string): Gesto | null {
  if (d.filaId && d.c != null) return hojaG({ accion: "vehiculo_cambiar", fecha: dia.fecha, cuadrilla: d.c, filaId: d.filaId, choferId: pid });
  if (d.veh) return viajeG({ accion: "chofer_del_camion", fecha: dia.fecha, vehiculoId: d.veh, choferId: pid });
  return null;
}

/** El chofer que tiene ahora el camión de destino (el del renglón, o el que muestra el libre). */
function choferActual(dia: DiaHoja, d: Extract<Destino, { k: "camion" }>): string | null {
  if (d.filaId && d.c != null) return vehiculosDe(hojaDeCuadrilla(dia, d.c)).find((f) => f.id === d.filaId)?.choferId ?? null;
  return d.veh ? choferDeLibre(dia, d.veh).ch : null;
}

/** La tecla de una cuadrilla (1–9 = su número). */
export const cuadrillaDeNumero = (dia: DiaHoja, n: number, cs: number[]) => cs.find((c) => cuadrilla(dia, c)?.numero === n) ?? null;

/**
 * Adónde manda una tecla a la ficha con foco: 1–9 a esa cuadrilla, D al depósito (la gente;
 * un camión no) y B a "Sin asignar" / "Camiones libres". null = la tecla no hace nada.
 */
export function destinoDeTecla(dia: DiaHoja, tecla: string, cs: number[], o: Origen): Destino | null {
  if (/^[1-9]$/.test(tecla)) {
    const c = cuadrillaDeNumero(dia, Number(tecla), cs);
    return c != null ? { k: "columna", c } : null;
  }
  if (o.k === "pedido") return null;
  if (tecla === "d" || tecla === "D") return o.k === "persona" || o.k === "chofer" ? { k: "columna", c: 0 } : null;
  if (tecla === "b" || tecla === "B") return o.k === "camion" ? { k: "libres" } : { k: "sin" };
  return null;
}

/**
 * Qué acciones manda soltar `o` en `d`. `ahora` decide si el día ya pasó (sólo lectura) y las
 * columnas que no aceptan (sin obra, suspendida).
 */
export function soltar(dia: DiaHoja, o: Origen, d: Destino, ahora: Minutos): Soltar {
  const f = dia.fecha;
  // Una columna entera: cada cosa a lo suyo (la gente a la gente, el camión a los camiones).
  if (d.k === "columna") {
    if (o.k === "camion") return soltar(dia, o, { k: "camiones", c: d.c }, ahora);
    return soltar(dia, o, { k: "gente", c: d.c }, ahora);
  }
  const cDe = d.k === "gente" || d.k === "camiones" ? d.c : d.k === "camion" ? d.c : null;
  const noAcepta = cDe != null ? porQueNoAcepta(dia, cDe, ahora) : null;
  if (ahora >= 1440) return rechazo("Es un día que ya pasó: sólo lectura");

  switch (o.k) {
    case "pedido":
      return soltarPedido(dia, o.id, d);
    case "contratista": {
      if (d.k !== "gente" && d.k !== "camiones" && !(d.k === "camion" && d.c != null)) return nada;
      if (noAcepta) return rechazo(noAcepta);
      if (esDeposito(cDe)) return rechazo("El depósito no lleva contratistas: van con una cuadrilla");
      return gestos(hojaG({ accion: "contratista_sumar", fecha: f, cuadrilla: cDe!, contratistaId: o.kid, n: 1 }));
    }

    case "camion": {
      const destino = d.k === "camiones" ? d.c : d.k === "camion" ? d.c : d.k === "gente" ? d.c : d.k === "libres" ? null : undefined;
      if (destino === undefined) return nada;
      if (destino === null) {
        // A "Camiones libres": sale de la hoja (el chofer vuelve a "Sin asignar").
        if (o.filaId && o.c != null) return gestos(hojaG({ accion: "vehiculo_quitar", fecha: f, cuadrilla: o.c, filaId: o.filaId }));
        return nada;
      }
      if (noAcepta) return rechazo(noAcepta);
      if (esDeposito(destino)) return rechazo("El depósito no lleva camiones: dejalo en «Camiones libres»");
      if (o.c === destino) return nada;
      if (o.veh && vehiculosDe(hojaDeCuadrilla(dia, destino)).some((x) => x.vehiculoId === o.veh)) {
        return rechazo(`${vehTxt(dia, o.veh) || "Ese camión"} ya está con ${laN(dia, destino)}`);
      }
      if (o.filaId && o.c != null) {
        // De una cuadrilla a otra: el renglón se va con su modo y su chofer.
        const fila = vehiculosDe(hojaDeCuadrilla(dia, o.c)).find((x) => x.id === o.filaId);
        if (!fila) return nada;
        return gestos(
          hojaG({ accion: "vehiculo_quitar", fecha: f, cuadrilla: o.c, filaId: o.filaId }),
          hojaG({ accion: "vehiculo_sumar", fecha: f, cuadrilla: destino, modo: fila.modo, choferId: fila.choferId, vehiculoId: fila.vehiculoId }),
        );
      }
      if (!o.veh) return nada;
      // De los libres: entra "Todo el día" (lo más común; el horario se cambia en la ficha)
      // con el chofer que mostraba (el del día o el de sus viajes), si puede ir.
      const ch = choferDeLibre(dia, o.veh).ch;
      const sirve = ch && puedeManejar(persona(dia, ch)) && !ausenciaDe(dia, ch) ? ch : null;
      return gestos(hojaG({ accion: "vehiculo_sumar", fecha: f, cuadrilla: destino, modo: "todo_el_dia", choferId: sirve, vehiculoId: o.veh }));
    }

    case "persona":
    case "chofer": {
      const pid = o.pid;
      const en = hojaDe(dia, pid);
      const ausente = !!ausenciaDe(dia, pid);
      const quitar = o.k === "chofer" ? quitarChofer(dia, o) : null;
      const pre = (...g: (Gesto | null)[]) => g.filter((x): x is Gesto => !!x);

      if (d.k === "camion") {
        if (o.k === "chofer" && o.veh === d.veh && o.filaId === d.filaId) return nada;
        if (!puedeManejar(persona(dia, pid))) return rechazo(`${N(dia, pid)} no maneja`);
        if (ausente) return rechazo(`${N(dia, pid)} no viene ese día`);
        if (noAcepta && d.c != null) return rechazo(noAcepta);
        if (choferActual(dia, d) === pid) return nada;
        // Si era de otra cuadrilla, sale de ahí (una persona en un solo lugar). En la suya
        // puede ir a cargo y manejar todo el día: cuenta una vez.
        const sacar = o.k === "persona" && en != null && en !== d.c ? hojaG({ accion: "sacar", fecha: f, personaId: pid }) : null;
        return gestos(...pre(quitar, sacar, ponerChofer(dia, d, pid)));
      }
      if (d.k === "gente" || d.k === "camiones") {
        if (noAcepta) return rechazo(noAcepta);
        const sobre = d.k === "gente" && d.sobre && d.sobre !== pid && hojaDe(dia, d.sobre) === d.c ? d.sobre : null;
        if (o.k === "persona" && en === d.c && !sobre) return nada;
        return gestos(...pre(quitar, ausente ? volver(dia, pid) : null, hojaG({ accion: "agregar", fecha: f, cuadrilla: d.c, personaId: pid, reemplaza: sobre })));
      }
      if (d.k === "sin") {
        return gestos(...pre(quitar, en != null ? hojaG({ accion: "sacar", fecha: f, personaId: pid }) : null, ausente ? volver(dia, pid) : null));
      }
      if (d.k === "no") {
        if (ausente) return o.k === "chofer" ? gestos(...pre(quitar)) : nada;
        if (!d.tipo) return { k: "pedirMotivo", pid };
        // La ausencia saca a la persona de su hoja (el servidor, con historial); el chofer se
        // saca del camión aparte.
        return gestos(...pre(quitar, noViene(f, pid, d.tipo)));
      }
      return nada;
    }
  }
}

/** Un pedido soltado en un camión, en la franja de una cuadrilla o de vuelta en el panel. */
function soltarPedido(dia: DiaHoja, id: string, d: Destino): Soltar {
  const p = dia.pedidos.find((x) => x.id === id);
  if (!p || p.estado === "anulado") return nada;
  if (p.estado === "hecho") return rechazo("Ese pedido ya está hecho");
  const v = p.viajeId ? dia.viajes.find((x) => x.id === p.viajeId && x.estado !== "anulado") ?? null : null;
  if (v && v.estado !== "planeado") return rechazo("Ese viaje ya se hizo: no se mueve");
  if (d.k === "pedidos") return v ? gestos(viajeG({ accion: "volver_a_cola", viajeId: v.id })) : nada;
  let veh: string | null = null;
  if (d.k === "camion") veh = d.veh;
  else if (d.k === "camiones" || d.k === "gente") {
    if (esDeposito(d.c)) return rechazo("Soltalo en un camión");
    const vs = vehiculosDe(hojaDeCuadrilla(dia, d.c)).map((f) => f.vehiculoId).filter((x): x is string => !!x);
    if (!vs.length) return rechazo(`${cap1(laN(dia, d.c))} no tiene camión: soltalo en uno`);
    if (vs.length > 1) return rechazo(`${cap1(laN(dia, d.c))} tiene ${vs.length} camiones: soltalo en uno`);
    veh = vs[0];
  } else return nada;
  if (!veh) return rechazo("A ese renglón le falta el camión");
  const V = vehiculo(dia, veh);
  if (p.necesita === "hidrogrua" && V?.tipo !== "hidrogrua") return rechazo(`Necesita hidrogrúa: ${elVeh(dia, veh)} no es`);
  if (p.necesita === "camion" && V?.tipo === "camioneta") return rechazo(`No entra ${elVeh(dia, veh, "en el")}`);
  if (v) {
    if (v.vehiculoId === veh && !v.fleteExterno) return nada;
    // Ya iba en otro camión (o en un flete): el viaje pasa entero (con los otros pedidos, si lleva).
    return gestos(viajeG({ accion: "mover", viajeId: v.id, vehiculoId: veh }));
  }
  return gestos(viajeG({ accion: "poner_pedido", pedidoId: p.id, vehiculoId: veh }));
}
const cap1 = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const laN = (dia: DiaHoja, c: number) => {
  if (esDeposito(c)) return "el depósito";
  const n = cuadrilla(dia, c)?.numero;
  return n != null ? `la ${n}` : `la ${cNombre(dia, c)}`;
};

/** Lo que dice la barra de ayuda con una ficha elegida ("Tocá adónde va Pérez"). */
export function textoAyuda(dia: DiaHoja, o: Origen): string {
  if (o.k === "camion") return `Tocá adónde va ${o.veh ? `el ${vehTxt(dia, o.veh)}` : "el camión"}`;
  if (o.k === "contratista") return `Tocá la cuadrilla adonde va uno de ${nombreDe(dia, o.kid)}`;
  if (o.k === "pedido") return `Tocá el camión que lleva «${dia.pedidos.find((x) => x.id === o.id)?.que ?? "el pedido"}»`;
  return `Tocá adónde va ${N(dia, o.pid)}`;
}
