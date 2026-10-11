// La Hoja del día al instante: cómo queda el día (`DiaHoja`) después de un gesto, ANTES de
// que conteste el servidor. Lo usa use-hoja-dia.ts (TanStack Query, `onMutate`): la
// pantalla muestra esto enseguida y, cuando el servidor confirma, se vuelve a pedir el día
// en segundo plano (y si el servidor dice que no, se vuelve atrás y se muestra el error).
//
// PURO (sin React ni servidor) y con tests (optimista.test.ts). Hace lo mismo que
// acciones.ts con las MISMAS reglas de estado.ts (planModo, planSoltarChofer) y el cambio
// mínimo al objeto: no crea textos ni avisos (eso lo dice el servidor en el toast).
//
// Lo que no se puede adivinar bien (copiar como hoy, precarga, viajes de camión, pedidos)
// devuelve null: ese gesto espera al servidor como antes.
//
// Las filas nuevas llevan un id provisorio ("tmp-…"): duran hasta que llega el día del
// servidor (uno o dos segundos). No hay que mandarlos al servidor (esTemporal).

import type { AccionHoja } from "./acciones.ts";
import type { DiaHoja, Hoja, Hora, ModoChofer, Viaje } from "./tipos.ts";
import { choferDelCamion, contratista, minutosDesde, normHora, planModo, planSoltarChofer, toMin, type CambioHoja } from "./estado.ts";

let n = 0;
const tmp = (que: string) => `tmp-${que}-${Date.now().toString(36)}-${++n}`;
/** Un id provisorio (de una fila que el servidor todavía no confirmó). */
export const esTemporal = (id: string | null | undefined) => !!id && id.startsWith("tmp-");

type Opciones = { /** Minutos de "ahora" en la escala del día (para choferTocadoMin y creadoMin). */ ahora?: number };

/**
 * El día después del gesto, o null si este gesto no se adivina (se espera al servidor).
 * No toca el `dia` que recibe: devuelve uno nuevo (las funciones de estado.ts guardan sus
 * índices por objeto).
 */
export function aplicarOptimista(dia: DiaHoja, a: AccionHoja, o: Opciones = {}): DiaHoja | null {
  if (a.fecha !== dia.fecha) return null;
  const d = aplicar(dia, a, o);
  // Un objeto nuevo AL FINAL: estado.ts guarda sus índices por objeto (WeakMap), y mientras
  // se aplicaba el gesto (planModo) se armaron con el día a medio cambiar.
  return d ? { ...d } : null;
}

function aplicar(dia: DiaHoja, a: AccionHoja, o: Opciones): DiaHoja | null {
  const ahora = o.ahora ?? minutosDesde(dia.fecha, Date.now());
  const d: DiaHoja = { ...dia, hojas: dia.hojas.map((h) => ({ ...h, integrantes: [...h.integrantes], contratistas: [...h.contratistas] })), viajes: [...dia.viajes] };
  const hojaDe = (c: number) => d.hojas.find((h) => h.cuadrillaOdooId === c) ?? null;
  const asegurar = (c: number): Hoja => {
    const h = hojaDe(c);
    if (h) return h;
    const nueva: Hoja = {
      id: tmp("hoja"), fecha: d.fecha, cuadrillaOdooId: c, modo: "sin", choferId: null, vehiculoId: null, choferTocadoMin: null,
      encuentro: { lugar: "obra", texto: null, hora: normHora(d.parametros.encuentroObra) ?? d.parametros.encuentroObra }, nota: null, recibeId: null,
      origen: "manual", version: 1, integrantes: [], contratistas: [], aCargoContratistaId: null,
    };
    d.hojas.push(nueva);
    return nueva;
  };
  const dondeEsta = (pid: string) => {
    for (const h of d.hojas) {
      const i = h.integrantes.findIndex((x) => x.personaId === pid);
      if (i >= 0) return { h, i };
    }
    return null;
  };
  const sacarDe = (pid: string) => {
    const x = dondeEsta(pid);
    if (x) x.h.integrantes.splice(x.i, 1);
    return x;
  };

  switch (a.accion) {
    case "crear_hoja":
      asegurar(a.cuadrilla);
      return d;

    case "agregar": {
      const h = asegurar(a.cuadrilla);
      const actual = dondeEsta(a.personaId);
      if (actual && actual.h === h && !a.reemplaza) return null; // "ya está": nada que mostrar
      let orden = h.integrantes.length + 1;
      if (a.reemplaza) {
        const r = h.integrantes.findIndex((x) => x.personaId === a.reemplaza);
        if (r >= 0) { orden = h.integrantes[r].orden; h.integrantes.splice(r, 1); }
      }
      if (a.aCargo) {
        h.integrantes = h.integrantes.map((x) => (x.aCargo ? { ...x, aCargo: false } : x));
        h.aCargoContratistaId = null;
      }
      // Pasar de cuadrilla es la misma fila (el servidor cambia hoja_id): se conserva el id.
      const previo = dondeEsta(a.personaId);
      const id = previo ? previo.h.integrantes[previo.i].id : tmp("int");
      sacarDe(a.personaId);
      h.integrantes.push({ id, personaId: a.personaId, aCargo: !!a.aCargo, nota: null, orden });
      return d;
    }

    case "sacar":
      return sacarDe(a.personaId) ? d : null;

    case "a_cargo": {
      const h = asegurar(a.cuadrilla);
      h.integrantes = h.integrantes.map((x) => (x.aCargo ? { ...x, aCargo: false } : x));
      if (!a.personaId) { h.aCargoContratistaId = null; return d; }
      if (contratista(dia, a.personaId)) {
        // Tiene que tener gente en esa hoja (si no, el servidor lo dice y no se adivina).
        if (!h.contratistas.some((x) => x.contratistaId === a.personaId)) return null;
        h.aCargoContratistaId = a.personaId;
        h.recibeId = null;
        return d;
      }
      const x = dondeEsta(a.personaId);
      if (x && x.h === h) h.integrantes[x.i] = { ...h.integrantes[x.i], aCargo: true, orden: -1 };
      else {
        const id = x ? x.h.integrantes[x.i].id : tmp("int");
        if (x) x.h.integrantes.splice(x.i, 1);
        h.integrantes.push({ id, personaId: a.personaId, aCargo: true, nota: null, orden: -1 });
      }
      h.recibeId = null;
      h.aCargoContratistaId = null;
      return d;
    }

    case "recibe": {
      const h = asegurar(a.cuadrilla);
      h.recibeId = a.personaId;
      return d;
    }

    case "nota_persona": {
      const x = dondeEsta(a.personaId);
      if (!x) return null;
      x.h.integrantes[x.i] = { ...x.h.integrantes[x.i], nota: a.nota };
      return d;
    }

    case "nota": {
      asegurar(a.cuadrilla).nota = a.nota;
      return d;
    }

    case "modo": {
      asegurar(a.cuadrilla);
      // La misma regla que el servidor (planModo), con el día que se ve.
      aplicarCambio(d, a.cuadrilla, planModo(d, a.cuadrilla, a.modo), ahora);
      return d;
    }

    case "chofer": {
      asegurar(a.cuadrilla);
      const cambio: CambioHoja = a.choferId ? planSoltarChofer(d, a.cuadrilla, a.choferId) : { choferId: null };
      aplicarCambio(d, a.cuadrilla, cambio, ahora);
      return d;
    }

    case "vehiculo": {
      asegurar(a.cuadrilla);
      aplicarCambio(d, a.cuadrilla, { vehiculoId: a.vehiculoId }, ahora);
      return d;
    }

    case "pasar_chofer": {
      if (!hojaDe(a.cuadrilla) || !hojaDe(a.desde)) return null;
      aplicarCambio(d, a.desde, { modo: "sin", choferId: null, vehiculoId: null, encuentro: { lugar: "obra", texto: null, hora: normHora(d.parametros.encuentroObra) ?? d.parametros.encuentroObra } }, ahora);
      return d;
    }

    case "encuentro": {
      const h = asegurar(a.cuadrilla);
      const hora = normHora(a.hora) ?? a.hora;
      h.encuentro = { lugar: a.lugar, hora, texto: a.lugar === "otro" ? a.texto ?? null : null };
      if (h.modo === "lleva_trae" && a.lugar === "deposito") {
        const ll = viajeDe(d, h, "lleva");
        if (ll && ll.estado === "planeado") reemplazarViaje(d, { ...ll, hora, orden: toMin(hora) ?? ll.orden });
      }
      return d;
    }

    case "lleva":
    case "busca": {
      const h = hojaDe(a.cuadrilla);
      if (!h) return null;
      const v = viajeDe(d, h, a.accion);
      if (a.accion === "busca" && a.hora == null) {
        if (v) d.viajes = d.viajes.filter((x) => x.id !== v.id);
        return d;
      }
      const hora = normHora(a.hora) ?? a.hora!;
      if (v) reemplazarViaje(d, { ...v, hora, orden: toMin(hora) ?? v.orden });
      else d.viajes.push(viajeNuevo(d, h, a.accion, hora, ahora));
      if (a.accion === "lleva" && h.encuentro.lugar === "deposito") h.encuentro = { ...h.encuentro, hora };
      return d;
    }

    case "carga_lleva": {
      const h = hojaDe(a.cuadrilla);
      const ll = h ? viajeDe(d, h, "lleva") : null;
      if (!h || !ll || ll.estado !== "planeado") return null;
      reemplazarViaje(d, { ...ll, carga: a.carga || null });
      return d;
    }

    case "instrucciones": {
      const prev = d.instrucciones.find((i) => i.otId === a.otId);
      const nueva = {
        otId: a.otId, cuadrillaOdooId: a.cuadrilla ?? null,
        horaInicio: a.horaInicio !== undefined ? normHora(a.horaInicio) : prev?.horaInicio ?? null,
        hoy: a.hoy !== undefined ? a.hoy : prev?.hoy ?? null,
        chips: a.chips !== undefined ? a.chips : prev?.chips ?? [],
      };
      d.instrucciones = [...d.instrucciones.filter((i) => i.otId !== a.otId), nueva];
      return d;
    }

    case "liberar": {
      const h = hojaDe(a.cuadrilla);
      if (!h) return null;
      h.integrantes = [];
      h.contratistas = [];
      h.aCargoContratistaId = null;
      return d;
    }

    case "contratista_sumar": {
      const k = contratista(dia, a.contratistaId);
      if (!k) return null;
      const h = asegurar(a.cuadrilla);
      const i = h.contratistas.findIndex((x) => x.contratistaId === k.id);
      if (i < 0) {
        if (a.n < 0 || !k.activo) return null;
        h.contratistas.push({ id: tmp("contr"), contratistaId: k.id, cantidad: Math.min(60, a.n), nota: null, orden: h.contratistas.length + 1 });
        return d;
      }
      const cantidad = Math.max(0, Math.min(60, h.contratistas[i].cantidad + a.n));
      if (cantidad === h.contratistas[i].cantidad) return null;
      h.contratistas[i] = { ...h.contratistas[i], cantidad };
      return d;
    }

    case "contratista_quitar": {
      const h = hojaDe(a.cuadrilla);
      if (!h || !h.contratistas.some((x) => x.contratistaId === a.contratistaId)) return null;
      h.contratistas = h.contratistas.filter((x) => x.contratistaId !== a.contratistaId);
      if (h.aCargoContratistaId === a.contratistaId) h.aCargoContratistaId = null;
      return d;
    }

    case "contratista_nota": {
      const h = hojaDe(a.cuadrilla);
      const i = h ? h.contratistas.findIndex((x) => x.contratistaId === a.contratistaId) : -1;
      if (!h || i < 0) return null;
      h.contratistas[i] = { ...h.contratistas[i], nota: a.nota };
      return d;
    }

    // Lo que depende del día anterior o de las obras en detalle: espera al servidor.
    case "copiar_como_hoy":
    case "mueve":
      return null;
  }
  return null;
}

// ─── El chofer de una tarjeta (lo mismo que aplicarCambioHoja + sincronizarViajes) ───

const DE_CUADRILLA = new Set(["lleva", "busca", "mueve"]);

function viajeDe(d: DiaHoja, h: Hoja, tipo: "lleva" | "busca"): Viaje | null {
  return d.viajes.find((v) => v.hojaId === h.id && v.tipo === tipo && v.estado !== "anulado") ?? null;
}
function reemplazarViaje(d: DiaHoja, v: Viaje) {
  d.viajes = d.viajes.map((x) => (x.id === v.id ? v : x));
}
function viajeNuevo(d: DiaHoja, h: Hoja, tipo: "lleva" | "busca", hora: Hora, ahora: number, ch = h.choferId, veh = h.vehiculoId): Viaje {
  return {
    id: tmp("viaje"), fecha: d.fecha, vehiculoId: veh, choferId: ch, fleteExterno: null, tipo, hojaId: h.id, cuadrillaOdooId: h.cuadrillaOdooId,
    hacia: { otId: null, lugarId: null, texto: null }, desde: null, orden: toMin(hora) ?? 420, hora, noAntesDe: null, duracionMin: null,
    vuelta: false, vueltaCarga: null, carga: null, cargaDeposito: null, okTodoElDia: false, estado: "planeado", hechoMin: null, hechoPor: null,
    noPudoMotivo: null, anuladoMotivo: null, foto: false, creadoMin: ahora, version: 1,
  };
}

/** Un cambio de modo / chofer / vehículo / encuentro sobre la hoja de `c` y sus viajes. */
function aplicarCambio(d: DiaHoja, c: number, cambio: CambioHoja, ahora: number) {
  const i = d.hojas.findIndex((h) => h.cuadrillaOdooId === c);
  if (i < 0) return;
  const antes = d.hojas[i];
  const h: Hoja = {
    ...antes,
    modo: cambio.modo ?? antes.modo,
    choferId: cambio.choferId !== undefined ? cambio.choferId : antes.choferId,
    vehiculoId: cambio.vehiculoId !== undefined ? cambio.vehiculoId : antes.vehiculoId,
    encuentro: cambio.encuentro ? { ...cambio.encuentro, hora: normHora(cambio.encuentro.hora) ?? cambio.encuentro.hora } : antes.encuentro,
    choferTocadoMin: cambio.choferId !== undefined || cambio.vehiculoId !== undefined || cambio.modo !== undefined ? ahora : antes.choferTocadoMin,
  };
  d.hojas[i] = h;
  const modo: ModoChofer = h.modo;
  const propios = d.viajes.filter((v) => v.hojaId === h.id && v.estado !== "anulado");
  if (modo !== "lleva_trae") {
    const fuera = new Set(propios.filter((v) => v.estado === "planeado" && DE_CUADRILLA.has(v.tipo)).map((v) => v.id));
    d.viajes = d.viajes.filter((v) => !fuera.has(v.id));
    return;
  }
  const enc = cambio.encuentro?.hora ?? h.encuentro.hora ?? d.parametros.encuentroDeposito;
  for (const tipo of ["lleva", "busca"] as const) {
    const v = propios.find((x) => x.tipo === tipo);
    const hora = normHora(tipo === "lleva" ? cambio.lleva ?? enc : cambio.busca ?? d.parametros.finJornada) ?? d.parametros.finJornada;
    if (!v) d.viajes.push(viajeNuevo(d, h, tipo, hora, ahora));
    else if (v.estado === "planeado" && (cambio.choferId !== undefined || cambio.vehiculoId !== undefined)) reemplazarViaje(d, { ...v, choferId: h.choferId, vehiculoId: h.vehiculoId });
  }
  // Si el vehículo no tiene chofer ese día, queda el de la cuadrilla (asegurarCamion).
  if (h.vehiculoId && h.choferId && !choferDelCamion(d, h.vehiculoId)) {
    const ya = d.camiones.some((x) => x.vehiculoId === h.vehiculoId);
    d.camiones = ya
      ? d.camiones.map((x) => (x.vehiculoId === h.vehiculoId ? { ...x, choferId: h.choferId } : x))
      : [...d.camiones, { vehiculoId: h.vehiculoId, choferId: h.choferId, nota: null }];
  }
}
