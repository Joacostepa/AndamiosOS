// La cuenta de la vista Camiones que no estaba en estado.ts: el orden de las filas, cómo se
// dice la urgencia y quién pidió un pedido, dónde cae una ficha soltada en la línea de
// tiempo, qué sale de un pendiente del cajón y a quién más avisar después de avisarle al
// chofer. Pura como estado.ts (la usan la pantalla y los tests) y en un archivo aparte para
// no pisar lo que otras pantallas agregan a estado.ts al mismo tiempo.
//
// Cada función tiene su gemela en la maqueta aprobada: filasOrden ↔ filasOrden,
// urgenciaTxt ↔ urgHTML, pidioTxt ↔ pidioTxt, ordenEnFila ↔ posDesdeX.
//
// Imports relativos y con extensión: corre en `node --test` sin Next.

import type { DiaHoja, Lugar, Minutos, Pedido, Punto } from "./tipos.ts";
import { URGENCIAS } from "./tipos.ts";
import {
  aCargoDe, addDia, calcVeh, cap, choferDelCamion, cNombre, cuadrillaDeObra, ddmm, diaSemana, esHoy, estadoEnvio,
  hCorta, hm, hm5, hojaDe, hojaDeCuadrilla, lowFirst, normalizar, normHora, nombreDe, pedidosDeViaje, textoViaje,
  todoVeh, toMin, vehiculo, viajeCalc, viajesVigentes, vieneDeAyer, type ViajeCalc,
} from "./estado.ts";

// ─── Las filas, en orden (§9) ───────────────────────────────────────────────

export type SinUsar = { veh: string; txt: string; nota: string | null; amb: boolean };

/**
 * Una fila por camión: los que tienen chofer (con o sin viajes), después los de "Todo el
 * día", y al final "Sin usar" en una línea (sin chofer, o lo que no es camión y no tiene
 * viajes: la moto, los autoelevadores).
 */
export function filasOrden(dia: DiaHoja): { conViajes: string[]; todo: string[]; sinUsar: SinUsar[] } {
  const conViajes: string[] = [], todo: string[] = [], sinUsar: SinUsar[] = [];
  const conViaje = new Set(viajesVigentes(dia).filter((v) => !v.fleteExterno).map((v) => v.vehiculoId));
  for (const V of dia.vehiculos) {
    if (todoVeh(dia, V.id) != null) { todo.push(V.id); continue; }
    const ch = choferDelCamion(dia, V.id);
    if (ch && (V.tipo !== "otro" || conViaje.has(V.id))) { conViajes.push(V.id); continue; }
    if (conViaje.has(V.id)) { conViajes.push(V.id); continue; }
    const vtv = V.vencimientos.filter((x) => x.tipo === "vtv").sort((a, b) => (a.vence < b.vence ? 1 : -1))[0];
    const vencida = vtv && vtv.vence < dia.fecha ? vtv.vence : null;
    if (V.tipo === "otro") {
      const n = (V.modelo || V.marca || V.patente).toLowerCase();
      sinUsar.push({ veh: V.id, txt: n, nota: ch ? nombreDe(dia, ch) : null, amb: false });
    } else if (vencida) sinUsar.push({ veh: V.id, txt: V.patente, nota: `VTV vencida desde el ${ddmm(vencida)}`, amb: true });
    else if (V.estado === "en_taller" || V.estado === "fuera_servicio") sinUsar.push({ veh: V.id, txt: V.patente, nota: V.estado === "en_taller" ? "en el taller" : "fuera de servicio", amb: true });
    else sinUsar.push({ veh: V.id, txt: V.tipo === "camioneta" && V.modelo ? V.modelo : V.patente, nota: "sin chofer", amb: false });
  }
  return { conViajes, todo, sinUsar };
}

// ─── Cómo se dice un pedido en la cola (§7) ─────────────────────────────────

/** "Frena la obra · hace 12 min" (rojo), "Antes de las 13 · hace 4 min" (ámbar en la última hora), "Viene de ayer". */
export function urgenciaTxt(dia: DiaHoja, p: Pedido, ahora: Minutos): { t: string; tono: "" | "rojo" | "amb" } {
  const hoy = esHoy(ahora);
  const hace = hoy && p.creadoMin >= 0 ? ` · hace ${Math.max(0, Math.round(ahora - p.creadoMin))} min` : "";
  if (p.urgencia === "frena") return { t: `Frena la obra${hace}`, tono: "rojo" };
  if (p.urgencia === "hora" && p.horaLimite) {
    const falta = toMin(p.horaLimite)! - ahora;
    return { t: `Antes de las ${hCorta(normHora(p.horaLimite))}${hace}`, tono: hoy && falta <= 60 ? "amb" : "" };
  }
  if (p.horaFija) return { t: `A las ${normHora(p.horaFija)} (acordado)${vieneDeAyer(p) ? " · viene de ayer" : ""}`, tono: "" };
  if (vieneDeAyer(p)) return { t: "Viene de ayer", tono: "amb" };
  return { t: `${p.urgencia === "hora" ? URGENCIAS.hoy : URGENCIAS[p.urgencia]}${hace}`, tono: "" };
}

/** "pidió Conte (a cargo de la Cuadrilla 2)", "del cajón del tablero", "oficina". */
export function pidioTxt(dia: DiaHoja, p: Pedido): string {
  if (p.canal === "sugerido") return "sugerido por el tablero";
  if (p.canal === "cajon") return "del cajón del tablero";
  if (!p.pidioId) return p.pidioTexto ? `pidió ${p.pidioTexto}` : "oficina";
  const c = hojaDe(dia, p.pidioId);
  const h = c != null ? hojaDeCuadrilla(dia, c) : null;
  const aCargo = h && aCargoDe(h) === p.pidioId ? ` (a cargo de la ${cNombre(dia, c)})` : "";
  const antes = p.creadoMin < 0 ? ` · ${diaSemana(addDia(dia.fecha, Math.floor(p.creadoMin / 1440))).slice(0, 3)} ${hm(p.creadoMin)}` : "";
  return `pidió ${nombreDe(dia, p.pidioId)}${aCargo}${antes}`;
}

/** "Cuadrilla 2 (Conte)" de una obra, o null si el destino no es una obra del día. */
export function cuadrillaDeDestino(dia: DiaHoja, hacia: Punto): { c: number; txt: string } | null {
  if (hacia.otId == null) return null;
  const c = cuadrillaDeObra(dia, hacia.otId);
  if (c == null) return null;
  const h = hojaDeCuadrilla(dia, c);
  const ac = h ? aCargoDe(h) : null;
  return { c, txt: `${cNombre(dia, c)}${ac ? ` (${nombreDe(dia, ac)})` : ""}` };
}

// ─── Soltar en la línea de tiempo ───────────────────────────────────────────

/**
 * El `orden` de un viaje soltado a la hora `m` de la fila (entre las dos fichas vecinas,
 * o 30 antes/después de la primera/última). `sin`: la ficha que se está moviendo.
 */
export function ordenEnFila(dia: DiaHoja, veh: string, m: number, sin?: string | null): number {
  const ts = calcVeh(dia, veh).filter((v) => v.id !== sin);
  const prev = ts.filter((v) => v.t <= m).pop();
  const next = ts.find((v) => v.t > m);
  return prev ? (next ? (prev.orden + next.orden) / 2 : prev.orden + 30) : next ? next.orden - 30 : Math.round(m);
}

/** La hora fija de una ficha soltada en `m`: redondeada a 15 minutos. */
export const horaSoltada = (m: number) => hm(Math.round(m / 15) * 15);

// ─── Del cajón del tablero a un pedido ──────────────────────────────────────

const VERBOS = /^(pasar a buscar|ir a buscar|retirar|buscar|llevar|traer|comprar|levantar)\s+/i;

/**
 * "RETIRAR 100 TABLONES EN GALVANIZADOS SANZ" → qué: "100 tablones", dónde: Galvanizados
 * Sanz (el lugar frecuente que nombra el texto). Si no nombra ninguno, dónde queda vacío y
 * lo elige quien lo pasa.
 */
export function pedidoDesdeCajon(texto: string, lugares: Pick<Lugar, "id" | "nombre" | "corto" | "activo">[]): { que: string; hacia: Punto | null } {
  const limpio = texto.trim().replace(/\s+/g, " ");
  const n = normalizar(limpio);
  let mejor: { l: (typeof lugares)[number]; desde: number; largo: number } | null = null;
  for (const l of lugares) {
    if (!l.activo) continue;
    for (const nom of [l.nombre, l.corto]) {
      if (!nom || nom.trim().length < 4) continue;
      const k = normalizar(nom.trim());
      const re = new RegExp(`(^|[^a-z0-9])${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`);
      const m = re.exec(n);
      if (m && (!mejor || k.length > mejor.largo)) mejor = { l, desde: m.index + m[1].length, largo: k.length };
    }
  }
  let que = limpio;
  if (mejor) {
    // Saca "en Galvanizados Sanz" / "de Sanz" del final (o de donde esté).
    const antes = limpio.slice(0, mejor.desde).replace(/\s+(en|de|a|del|al|desde|hasta)\s*$/i, "");
    const despues = limpio.slice(mejor.desde + mejor.largo);
    que = `${antes}${despues}`.trim();
  }
  que = que.replace(VERBOS, "").trim() || limpio;
  if (que === que.toUpperCase()) que = que.toLowerCase();
  return { que: cap(que), hacia: mejor ? { otId: null, lugarId: mejor.l.id, texto: null } : null };
}

// ─── Después de avisarle al chofer ──────────────────────────────────────────

/**
 * Lo que conviene avisar después de mandarle el cambio a un chofer (§9 "Cómo se despacha"):
 * al capataz que pidió cada viaje nuevo ("Avisar a Conte") y al depósito si un viaje nuevo
 * sale de ahí con carga hoy ("Avisar al depósito"). Se calcula ANTES de avisar: después ya
 * no hay diferencia con lo enviado.
 */
export function seguimientoAviso(dia: DiaHoja, ch: string, ahora: Minutos): { capataces: { pedidoId: string; pid: string }[]; deposito: string[] } {
  const capataces: { pedidoId: string; pid: string }[] = [];
  const deposito: string[] = [];
  const st = estadoEnvio(dia, { pid: ch, rol: "chofer" });
  if (st.k !== "cambiada") return { capataces, deposito };
  const dep = dia.lugares.find((l) => l.tipo === "deposito" && l.activo);
  const depKeys = new Set(["dep", dep ? `l:${dep.id}` : "dep"]);
  for (const d of st.ds) {
    if (!d.nuevo || !d.v) continue;
    const id = d.v.k;
    for (const p of pedidosDeViaje(dia, id)) {
      if (p.pidioId && !capataces.some((x) => x.pid === p.pidioId)) capataces.push({ pedidoId: p.id, pid: p.pidioId });
    }
    const v = viajeCalc(dia, id);
    if (v && esHoy(ahora) && v.carga && depKeys.has(v.desdeKey) && (v.tipo === "lleva_material" || v.tipo === "entre_depositos")) deposito.push(id);
  }
  return { capataces, deposito };
}

/**
 * "Sacarlo un rato y avisar a Sack": el mensaje al capataz de la cuadrilla que se queda un
 * rato sin su camión de todo el día.
 */
export function mensajeSacarUnRato(dia: DiaHoja, v: ViajeCalc): { pid: string | null; texto: string } | null {
  if (!v.vehiculoId) return null;
  const td = todoVeh(dia, v.vehiculoId);
  if (td == null) return null;
  const h = hojaDeCuadrilla(dia, td)!;
  const pid = aCargoDe(h) ?? h.recibeId;
  const V = vehiculo(dia, v.vehiculoId);
  const que = V?.tipo === "hidrogrua" ? "la hidrogrúa" : "el camión";
  return { pid, texto: `${nombreDe(dia, pid)}, ${nombreDe(dia, choferDelCamion(dia, v.vehiculoId))} sale un rato con ${que} (${hm5(v.t)} a ${hm5(v.fin)}): ${lowFirst(textoViaje(dia, v))}. Vuelve después.` };
}
