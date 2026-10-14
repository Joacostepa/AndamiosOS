// La Hoja del día al instante: cómo queda el día (`DiaHoja`) después de un gesto, ANTES de
// que conteste el servidor. Lo usa use-hoja-dia.ts (TanStack Query, `onMutate`): la
// pantalla muestra esto enseguida y, cuando el servidor confirma, se vuelve a pedir el día
// en segundo plano (y si el servidor dice que no, se vuelve atrás y se muestra el error).
//
// PURO (sin React ni servidor) y con tests (optimista.test.ts). Hace lo mismo que
// acciones.ts con las MISMAS reglas (vehiculos.ts para los vehículos de la hoja y sus lleva /
// busca: el servidor escribe el mismo plan) y el cambio mínimo al objeto: no crea textos ni
// avisos (eso lo dice el servidor en el toast).
//
// Lo que no se puede adivinar bien (copiar como hoy, precarga, viajes de camión, pedidos)
// devuelve null: ese gesto espera al servidor como antes.
//
// Las filas nuevas llevan un id provisorio ("tmp-…"): duran hasta que llega el día del
// servidor (uno o dos segundos). No hay que mandarlos al servidor (esTemporal).

import type { AccionHoja } from "./acciones.ts";
import type { DiaHoja, Hoja } from "./tipos.ts";
import { contratista, minutosDesde, normHora } from "./estado.ts";
import { planVehiculos, type CambioVehiculos } from "./vehiculos.ts";

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
      id: tmp("hoja"), fecha: d.fecha, cuadrillaOdooId: c, vehiculos: [],
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

    // Los vehículos y sus lleva / busca: el mismo plan que escribe el servidor (vehiculos.ts).
    case "modo":
      asegurar(a.cuadrilla);
      return conPlan(d, a.cuadrilla, { k: "modo", modo: a.modo }, ahora);
    case "chofer":
      asegurar(a.cuadrilla);
      return conPlan(d, a.cuadrilla, a.choferId ? { k: "soltar", choferId: a.choferId } : { k: "chofer", choferId: null }, ahora);
    case "vehiculo":
      asegurar(a.cuadrilla);
      return conPlan(d, a.cuadrilla, { k: "vehiculo", vehiculoId: a.vehiculoId }, ahora);
    case "vehiculo_sumar":
      asegurar(a.cuadrilla);
      return conPlan(d, a.cuadrilla, { k: "sumar", modo: a.modo, choferId: a.choferId, vehiculoId: a.vehiculoId }, ahora);
    case "vehiculo_quitar":
      return conPlan(d, a.cuadrilla, { k: "quitar", filaId: a.filaId }, ahora);
    case "vehiculo_cambiar":
      return conPlan(d, a.cuadrilla, { k: "cambiar", filaId: a.filaId, modo: a.modo, choferId: a.choferId, vehiculoId: a.vehiculoId }, ahora);
    case "pasar_chofer": {
      if (!hojaDe(a.cuadrilla) || !hojaDe(a.desde)) return null;
      const enOtra = hojaDe(a.desde)!.vehiculos.map((x) => x.choferId);
      const ch = a.choferId ?? hojaDe(a.cuadrilla)!.vehiculos.find((x) => x.modo === "todo_el_dia" && x.choferId && enOtra.includes(x.choferId))?.choferId;
      return ch ? conPlan(d, a.desde, { k: "quitarChofer", choferId: ch }, ahora) : null;
    }
    case "encuentro":
      asegurar(a.cuadrilla);
      return conPlan(d, a.cuadrilla, { k: "encuentro", lugar: a.lugar, hora: a.hora, texto: a.texto }, ahora);
    case "lleva":
      return conPlan(d, a.cuadrilla, { k: "lleva", filaId: a.filaId, hora: a.hora }, ahora);
    case "vuelta":
      return conPlan(d, a.cuadrilla, { k: "vuelta", filaId: a.filaId, vuelve: a.vuelve, llega: a.llega ?? null }, ahora);
    case "busca":
      return conPlan(d, a.cuadrilla, { k: "busca", hora: a.hora }, ahora);
    case "busca_con":
      return conPlan(d, a.cuadrilla, { k: "buscaCon", filaId: a.filaId, vehiculoId: a.vehiculoId, choferId: a.choferId }, ahora);
    case "carga_lleva":
      return conPlan(d, a.cuadrilla, { k: "carga", filaId: a.filaId, carga: a.carga }, ahora);

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


// ─── Los vehículos de una tarjeta (el mismo plan que escribe acciones.ts) ───

/**
 * Aplica sobre `d` el plan de vehiculos.ts: los vehículos como quedan, el encuentro y los
 * viajes de la hoja (los nuevos con id provisorio). Si el plan no se puede (un busca sin
 * nadie que los lleve, un vehículo que ya no está), null: el gesto espera al servidor, que
 * lo dice en palabras.
 */
function conPlan(d: DiaHoja, c: number, cambio: CambioVehiculos, ahora: number): DiaHoja | null {
  let plan;
  try {
    plan = planVehiculos(d, c, cambio, { nuevoId: (q) => tmp(q), ahora });
  } catch {
    return null;
  }
  const i = d.hojas.findIndex((h) => h.cuadrillaOdooId === c);
  if (i < 0) return null;
  const h: Hoja = { ...d.hojas[i], vehiculos: plan.filas };
  if (plan.encuentro) h.encuentro = { ...plan.encuentro, hora: normHora(plan.encuentro.hora) ?? plan.encuentro.hora };
  d.hojas[i] = h;
  const borrar = new Set(plan.viajes.borrar);
  const cambios = new Map(plan.viajes.cambiar.map((x) => [x.id, x.valores]));
  d.viajes = [
    ...d.viajes.filter((v) => !borrar.has(v.id)).map((v) => (cambios.has(v.id) ? { ...v, ...cambios.get(v.id) } : v)),
    ...plan.viajes.crear,
  ];
  return d;
}
