// El recorrido de un camión (rediseño F3, docs/equipos-del-dia/rediseno-plan.md "El recorrido
// sobre hd_viajes"; maqueta: drawRec / stopHtml). UNA PARADA ES UN VIAJE de ese vehículo, en
// el orden de `orden`: no hay datos aparte. La salida del depósito y la vuelta son paradas
// VIRTUALES (salen de las horas que calcula estado.ts y de `vuelta`): se muestran, no se guardan.
//
// PURO (sin React ni servidor) y con tests (recorrido.test.ts). Lo de los viajes de una
// cuadrilla (lleva, busca, mueve) sigue siendo de la hoja: en el recorrido se ven y se
// reordenan, pero su destino lo pone el tablero y su hora la tarjeta (`editable`).

import type { AccionParada, DiaHoja, Minutos, Pedido, Punto, TipoViaje, Viaje } from "./tipos.ts";
import {
  accionDe, accionTxt, calcVeh, camionesQueSirven, cNombre, choferDe, cuadrillaDeViaje, desvioMin, distanciaTxt, horaFija, horaTxt, hm5, km, lugar,
  lugarDeKey, mejorHueco, nombreDe, normHora, normalizar,
  type Hueco, type ViajeCalc,
} from "./estado.ts";

/** Lo que el editor puede cambiar de una parada. */
export type Editable = {
  /** El lugar (no en lleva/busca/mueve: van a la obra del tablero). */
  lugar: boolean;
  /** Qué hace (no en lleva/busca/mueve: llevan o buscan gente). */
  accion: boolean;
  /** La hora: en lleva/busca la cambia la tarjeta (el gesto de la hoja); acá también, por el mismo camino. */
  hora: boolean;
  /** Quitarla (anular o devolver a la cola). Hecha o anulada, no. */
  quitar: boolean;
  /** Moverla de lugar en la lista. */
  mover: boolean;
};

export type Parada =
  | {
      k: "viaje";
      id: string;
      v: ViajeCalc;
      /** "7:00" (fija) o "~10:45" (estimada o aproximada). */
      hora: string;
      fija: boolean;
      /** "Juramento 2145", "Galvanizados Sanz", "Depósito". */
      lugar: string;
      /** "la Cuadrilla 2 · desarme", "proveedor"… */
      sub: string | null;
      /** La etiqueta del destino: "2" (la cuadrilla de la obra), "D" o null. */
      tag: string | null;
      accion: AccionParada;
      accionTxt: string;
      /** La nota de la parada (la carga del viaje). */
      nota: string | null;
      chofer: string | null;
      estado: Viaje["estado"];
      /** Es de la hoja de una cuadrilla (lleva, busca, mueve): el tablero y la tarjeta mandan. */
      deCuadrilla: boolean;
      editable: Editable;
      /** Un pedido que va en esta parada ("Material del armado"). */
      pedido: string | null;
    }
  | { k: "salida" | "vuelta"; id: string; hora: string; lugar: string; texto: string };

const DE_CUADRILLA: readonly TipoViaje[] = ["lleva", "busca", "mueve"];
export const esDeCuadrilla = (v: Pick<Viaje, "tipo" | "hojaId">) => DE_CUADRILLA.includes(v.tipo) && !!v.hojaId;

/** Las paradas del camión en orden, con la salida y la vuelta al depósito. */
export function paradasDe(dia: DiaHoja, veh: string): Parada[] {
  const vs = calcVeh(dia, veh);
  if (!vs.length) return [];
  const out: Parada[] = [];
  // Sale del depósito si la primera parada sale de ahí (con la hora de carga, si se cargó).
  const primero = vs[0];
  if (lugarDeKey(dia, primero.desdeKey).tipo === "deposito") {
    out.push({ k: "salida", id: "salida", hora: primero.cargaDeposito ? normHora(primero.cargaDeposito) ?? "" : "", lugar: "Depósito", texto: primero.cargaDeposito ? "Carga y sale del depósito" : "Sale del depósito" });
  }
  for (const v of vs) {
    const L = lugar(dia, v.haciaEf);
    const c = cuadrillaDeViaje(dia, v);
    const deC = esDeCuadrilla(v);
    const vivo = v.estado === "planeado";
    const obraDe = L.otId != null ? dia.obras.find((o) => o.otId === L.otId) : null;
    const pedido = dia.pedidos.find((p) => p.viajeId === v.id && p.estado !== "anulado")?.que ?? null;
    out.push({
      k: "viaje", id: v.id, v, hora: horaTxt(v), fija: horaFija(v), lugar: L.n,
      sub: obraDe ? `${cNombre(dia, obraDe.cuadrillaOdooId).toLowerCase()} · ${obraDe.tipo.toLowerCase()}` : L.tipo === "deposito" ? null : L.dir,
      tag: obraDe ? String(dia.cuadrillas.find((x) => x.odooId === obraDe.cuadrillaOdooId)?.numero ?? "") || null : L.tipo === "deposito" ? "D" : null,
      accion: accionDe(v), accionTxt: accionTxt(accionDe(v)), nota: v.carga, chofer: choferDe(dia, v), estado: v.estado,
      deCuadrilla: deC,
      editable: { lugar: vivo && !deC, accion: vivo && !deC, hora: vivo, quitar: vivo, mover: vivo },
      pedido,
    });
    // La vuelta al depósito después de la parada (un "trae", o el lleva que deja y se vuelve).
    if (v.vuelta && v.estado !== "anulado") {
      out.push({ k: "vuelta", id: `vuelta-${v.id}`, hora: `~${hm5(v.fin)}`, lugar: "Depósito", texto: c != null && deC ? `Vuelve al depósito (dejó a ${cNombre(dia, c).toLowerCase()})` : "Vuelve al depósito" });
    }
  }
  return out;
}

/** "4 paradas · termina ~13:30" (el botón del camión en el pizarrón). */
export function resumenRecorrido(dia: DiaHoja, veh: string): string {
  const vs = calcVeh(dia, veh);
  if (!vs.length) return "";
  const fin = Math.max(...vs.map((v) => v.fin));
  return `${vs.length} ${vs.length === 1 ? "parada" : "paradas"} · termina ~${hm5(fin)}`;
}

/**
 * Los `orden` nuevos para dejar los viajes del camión en el orden `ids` (los planeados; los
 * hechos y anulados quedan donde están). Se reparten los MISMOS valores de `orden` que ya
 * tenían, de menor a mayor: así la escala no cambia (otros gestos usan los minutos del día como
 * orden) y sólo se escriben los que cambiaron de lugar. null si `ids` no son exactamente los
 * planeados del camión.
 */
export function planReordenar(dia: DiaHoja, veh: string, ids: string[]): { id: string; orden: number }[] | null {
  const vivos = calcVeh(dia, veh).filter((v) => v.estado === "planeado");
  if (ids.length !== vivos.length || new Set(ids).size !== ids.length || !ids.every((id) => vivos.some((v) => v.id === id))) return null;
  const valores = vivos.map((v) => v.orden).sort((a, b) => a - b);
  // Valores repetidos (dos viajes con el mismo orden): se separan apenas para que el orden quede firme.
  for (let i = 1; i < valores.length; i++) if (valores[i] <= valores[i - 1]) valores[i] = valores[i - 1] + 0.01;
  const out: { id: string; orden: number }[] = [];
  ids.forEach((id, i) => {
    const v = vivos.find((x) => x.id === id)!;
    if (v.orden !== valores[i]) out.push({ id, orden: valores[i] });
  });
  return out;
}

/** El `orden` de una parada nueva al final del recorrido (o la primera: a la hora de salida). */
export function ordenAlFinal(dia: DiaHoja, veh: string, salida: Minutos): number {
  const vs = calcVeh(dia, veh);
  return vs.length ? Math.max(...vs.map((v) => v.orden)) + 30 : salida;
}

/** "Recorrido · Iveco AB 799 CA · Nuñez" (el título de la hoja lateral). */
export function choferDelRecorrido(dia: DiaHoja, veh: string): string | null {
  const vs = calcVeh(dia, veh);
  const ch = vs.map((v) => choferDe(dia, v)).find(Boolean) ?? null;
  return ch ? nombreDe(dia, ch) : null;
}

// ─── Elegir el lugar de una parada ──────────────────────────────────────────

export type LugarParaElegir = { key: string; punto: Punto; n: string; sub: string; grupo: string; tag: string | null };
const GRUPO_LUGAR: Record<string, string> = { deposito: "depósito", proveedor: "proveedor", taller: "taller", vtv: "VTV", otro: "lugar" };

/**
 * Los lugares para una parada (el "¿Adónde va?" de la maqueta): el depósito primero, las obras
 * del día (con su cuadrilla), los lugares frecuentes y, si se escribió algo que no está, "Usar
 * «…» como dirección". `q` filtra por nombre o dirección, sin tildes.
 */
export function lugaresParaElegir(dia: DiaHoja, q: string, max = 12): LugarParaElegir[] {
  const n = normalizar(q.trim());
  const ok = (s: string) => !n || normalizar(s).includes(n);
  const out: LugarParaElegir[] = [];
  const lugares = dia.lugares.filter((l) => l.activo).sort((a, b) => Number(b.tipo === "deposito") - Number(a.tipo === "deposito"));
  for (const l of lugares.filter((x) => x.tipo === "deposito")) {
    if (ok(`${l.nombre} ${l.direccion ?? ""} deposito`)) out.push({ key: `l:${l.id}`, punto: { otId: null, lugarId: l.id, texto: null }, n: l.nombre, sub: l.direccion ?? "", grupo: "depósito", tag: "D" });
  }
  for (const o of [...dia.obras].sort((a, b) => a.cuadrillaOdooId - b.cuadrillaOdooId || a.ordenDia - b.ordenDia)) {
    if (!ok(`${o.corto} ${o.direccion} ${o.titulo}`)) continue;
    const num = dia.cuadrillas.find((x) => x.odooId === o.cuadrillaOdooId)?.numero ?? null;
    out.push({ key: `o:${o.otId}`, punto: { otId: o.otId, lugarId: null, texto: null }, n: o.corto, sub: `${cNombre(dia, o.cuadrillaOdooId).toLowerCase()} · ${o.tipo.toLowerCase()}`, grupo: "obra", tag: num != null ? String(num) : null });
  }
  for (const l of lugares.filter((x) => x.tipo !== "deposito")) {
    if (ok(`${l.nombre} ${l.corto ?? ""} ${l.direccion ?? ""}`)) out.push({ key: `l:${l.id}`, punto: { otId: null, lugarId: l.id, texto: null }, n: l.nombre, sub: l.direccion ?? "", grupo: GRUPO_LUGAR[l.tipo] ?? "lugar", tag: null });
  }
  // "Otra dirección": si no encontró nada, o si lo escrito parece una dirección (tiene número).
  if (n && q.trim().length >= 3 && (!out.length || /\d/.test(q)) && !out.some((x) => normalizar(x.n) === n)) {
    out.push({ key: "t", punto: { otId: null, lugarId: null, texto: q.trim() }, n: `Usar «${q.trim()}» como dirección`, sub: "otra dirección, se escribe tal cual", grupo: "texto", tag: null });
  }
  return out.slice(0, max);
}

/** Qué hace por defecto una parada nueva en ese lugar (se cambia en la parada). */
export function accionPorDefecto(dia: DiaHoja, hacia: Punto, haySalida: boolean): AccionParada {
  const L = lugar(dia, hacia);
  if (L.tipo === "deposito") return haySalida ? "descarga" : "carga";
  if (L.tipo === "proveedor") return "compra";
  if (L.tipo === "taller" || L.tipo === "vtv") return "espera";
  return "deja_material";
}

// ─── ¿Quién pasa cerca? (F4; maqueta: nearList / nearMenu) ───────────────────

export type PasaCerca = {
  veh: string;
  /** Quién lo tomaría (el chofer a esa altura del día). */
  ch: string;
  /** Sin recorrido: sale del depósito sólo para esto (van al final). */
  libre: boolean;
  /** El hueco de menor desvío (null si es libre o no se pudo medir). */
  hueco: Hueco | null;
  extraKm: number | null;
  min: number | null;
  /** "Kiska · pasa por Juramento a las ~10:45 · a 6 cuadras", "Gómez · libre · sale del depósito". */
  linea: string;
  paradas: number;
};

/**
 * Los camiones que pueden llevar un pedido, del que menos se desvía al que más; los libres
 * (sin recorrido) al final y los que no se pueden medir (sin coordenadas) después. Los que no
 * sirven (sin chofer, todo el día con una cuadrilla, no es hidrogrúa, en el taller) van en
 * `no`, con el porqué, como en "Cerca y libre". Ayuda a decidir, no decide.
 */
export function quienPasaCerca(dia: DiaHoja, ped: Pick<Pedido, "hacia" | "necesita">, ahora: Minutos): { si: PasaCerca[]; no: { veh: string; t: string }[]; donde: string } {
  const q = camionesQueSirven(dia, ped, ahora);
  const P = lugar(dia, ped.hacia);
  const dep = dia.lugares.find((l) => l.tipo === "deposito" && l.activo) ?? null;
  const si = q.si.map((x): PasaCerca => {
    const paradas = calcVeh(dia, x.veh).length;
    const nom = nombreDe(dia, x.ch);
    if (!paradas) {
      const k = km(dep, P);
      return { veh: x.veh, ch: x.ch, libre: true, hueco: null, extraKm: k != null ? 2 * k : null, min: k != null ? desvioMin(2 * k) : null, linea: `${nom} · libre · sale del depósito`, paradas };
    }
    const h = mejorHueco(dia, x.veh, P, ahora);
    if (!h) return { veh: x.veh, ch: x.ch, libre: false, hueco: null, extraKm: null, min: null, linea: `${nom} · ${paradas} ${paradas === 1 ? "parada" : "paradas"} · sin ubicar en el mapa`, paradas };
    const via = lugarDeKey(dia, h.viaKey);
    const pasa = via.tipo === "deposito" ? "sale del depósito" : `pasa por ${via.n}${h.viaHora ? ` a las ${h.viaHora}` : ""}`;
    return { veh: x.veh, ch: x.ch, libre: false, hueco: h, extraKm: h.extraKm, min: h.min, linea: `${nom} · ${pasa} · a ${distanciaTxt(h.dKm)}${paradas >= 4 ? ` · ${paradas} paradas` : ""}`, paradas };
  });
  const rango = (x: PasaCerca) => (x.min == null ? 2 : x.libre ? 1 : 0);
  si.sort((a, b) => rango(a) - rango(b) || (a.extraKm ?? 0) - (b.extraKm ?? 0));
  return { si, no: q.no.map((x) => ({ veh: x.veh, t: x.t })), donde: P.n };
}

/**
 * Los pedidos del día sin camión que se pueden sumar al recorrido de un camión, del que menos
 * lo desvía al que más (el bloque "Pedidos sin camión" del Recorrido). Sólo los que tienen
 * dónde medirse; sin hora fija (esos van a su hora).
 */
export function pedidosParaSumar(dia: DiaHoja, veh: string, ahora: Minutos): { p: Pedido; hueco: Hueco }[] {
  return dia.pedidos
    .filter((p) => p.fecha === dia.fecha && (p.estado === "sin_camion" || p.estado === "esperando") && !p.viajeId && !p.horaFija)
    .flatMap((p) => {
      const h = mejorHueco(dia, veh, lugar(dia, p.hacia), ahora);
      return h ? [{ p, hueco: h }] : [];
    })
    .sort((a, b) => a.hueco.extraKm - b.hueco.extraKm);
}
