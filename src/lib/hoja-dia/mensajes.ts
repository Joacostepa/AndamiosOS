// Todos los textos que la Hoja del día le manda a alguien: la hoja del capataz, los viajes
// del chofer, el cambio en palabras, el viaje nuevo, el aviso al depósito y al operario que
// entra a último momento, y lo que contesta el bot de Telegram.
//
// CORTOS Y PARA LEER EN LA NOTIFICACIÓN. El capataz los ve a las 20:00 en la pantalla
// bloqueada o a las 6:40 en el colectivo: lo importante (dónde, a qué hora, con quién) va
// en la primera línea. Rioplatense, con voseo, sin "estimado".
//
// DOS CANALES, UN TEXTO. Por Telegram el link va en un botón ("Ver la hoja") y el texto no
// lo repite; por WhatsApp (el camino manual, con wa.me, para quien no vinculó Telegram) el
// link va escrito. `canal` decide eso y nada más: lo que se dice es lo mismo.
//
// Lógica pura: usa estado.ts para las cuentas; sin red.

import type { DiaHoja, Diferencia, Minutos } from "./tipos.ts";
import {
  cNombre, cap, choferDe, encTxt, envioDe, esHoy, estadoEnvio, fechaMensaje, hCorta, hm, hm5, horaTxt, laC, lowFirst,
  lugar, nombreDe, normHora, obrasCon, patente, recibeDe, textoViaje, todoDe, vehiculoNombre, viajesChofer, yList,
  cortoV, hojaDeCuadrilla, hojaDe, aCargoDe, suspendida, type Destinatario, type ViajeCalc,
} from "./estado.ts";

export type Canal = "telegram" | "whatsapp";
type Opts = { canal: Canal; link: string | null; ahora: Minutos };

const coord = (dia: DiaHoja) => dia.parametros.coordinador.nombre;
/** El cierre del mensaje: el link escrito (WhatsApp) o nada (Telegram lo pone en un botón). */
const mirá = (o: Opts, verbo = "Mirá todo acá") => (o.canal === "whatsapp" && o.link ? ` ${verbo}: ${o.link}` : "");
const deHoy = (dia: DiaHoja, ahora: Minutos) => (esHoy(ahora) ? "de hoy" : `del ${fechaMensaje(dia.fecha)}`);

// ─── La hoja (primer envío) ─────────────────────────────────────────────────

/** "Hola Ortega, tu hoja del martes 13/10: Cuadrilla 3, a cargo vos. Encuentro 7:45 en el depósito, te lleva Kiska. Obra: Av. Rivadavia 6150." */
export function mensajeHoja(dia: DiaHoja, pid: string, c: number, o: Opts): string {
  const h = hojaDeCuadrilla(dia, c)!;
  const ob = obrasCon(dia, c);
  const aCargo = aCargoDe(h);
  const quien = aCargo === pid ? "a cargo vos" : `a cargo ${nombreDe(dia, aCargo) || "nadie todavía"}; la hoja te llega a vos`;
  const chof = h.modo === "lleva_trae" ? `, te lleva ${nombreDe(dia, choferLleva(dia, c)) || "un chofer"}` : h.modo === "todo_el_dia" ? `, va ${nombreDe(dia, h.choferId)} todo el día` : ", van por su cuenta";
  return `Hola ${nombreDe(dia, pid)}, tu hoja ${deHoy(dia, o.ahora)}: ${cNombre(dia, c)}, ${quien}. Encuentro ${encTxt(dia, c)}${chof}. ${ob.length > 1 ? "Obras" : "Obra"}: ${yList(ob.map((x) => x.o.corto))}.${mirá(o)} Cuando la veas tocá "Recibido".`;
}
/** El chofer del "lleva" (puede no ser el de la cuadrilla si se lo pasó a otro camión). */
function choferLleva(dia: DiaHoja, c: number): string | null {
  const h = hojaDeCuadrilla(dia, c)!;
  const ll = dia.viajes.find((v) => v.hojaId === h.id && v.tipo === "lleva" && v.estado !== "anulado");
  return (ll ? choferDe(dia, ll) : null) ?? h.choferId;
}

/** "Hola Kiska, tus viajes del martes 13/10: 7:00 lleva a la Cuadrilla 2 a Juramento 2145; …; y 3 más." */
export function mensajeViajes(dia: DiaHoja, ch: string, o: Opts): string {
  const vs = viajesChofer(dia, ch).filter((v) => v.estado !== "anulado");
  const td = todoDe(dia, ch);
  const dl = deHoy(dia, o.ahora);
  if (td.length) {
    const c = td[0];
    const h = hojaDeCuadrilla(dia, c)!;
    const ob = obrasCon(dia, c);
    const propios = vs.filter((v) => v.cuadrillaOdooId !== c || !v.hojaId);
    return `Hola ${nombreDe(dia, ch)}, ${o.ahora >= 0 && o.ahora < 1440 ? "hoy" : `el ${fechaMensaje(dia.fecha)}`} vas todo el día con la ${cNombre(dia, c)} (${nombreDe(dia, aCargoDe(h)) || "sin nadie a cargo"}) con el ${vehiculoNombre(dia, h.vehiculoId)}. Encuentro ${encTxt(dia, c)}. ${ob.length > 1 ? "Obras" : "Obra"}: ${yList(ob.map((x) => x.o.corto))}.${propios.length ? ` Además: ${propios.map((v) => `${horaTxt(v)} ${lowFirst(textoViaje(dia, v))}`).join("; ")}.` : ""}${mirá(o)} Cuando la veas tocá "Recibido".`;
  }
  const tx = vs.slice(0, 3).map((v) => `${horaTxt(v)} ${lowFirst(textoViaje(dia, v))}`).join("; ");
  const mas = vs.length > 3 ? `; y ${vs.length - 3} más` : "";
  return `Hola ${nombreDe(dia, ch)}, tus viajes ${dl}: ${tx}${mas}.${mirá(o)} Cuando los veas tocá "Recibido".`;
}

// ─── Cambios después de enviar (§11) ────────────────────────────────────────

/** "después de cargar en Juramento 2145, " — dónde cae el viaje nuevo en su recorrido. */
export function contextoViaje(dia: DiaHoja, ch: string, id: string): string {
  const vs = viajesChofer(dia, ch);
  const i = vs.findIndex((v) => v.id === id);
  if (i < 0) return "";
  const prev = vs.slice(0, i).reverse().find((v) => v.estado === "planeado");
  const next = vs.slice(i + 1).find((v) => v.estado === "planeado");
  const taller = (v: ViajeCalc) => (lugar(dia, v.haciaEf).tipo === "vtv" ? "la VTV" : "la visita al taller");
  if (prev) return prev.tipo === "trae_material" ? `después de cargar en ${lugar(dia, prev.haciaEf).n}, ` : prev.tipo === "taller" ? `después de ${taller(prev)}, ` : `después de ${lowFirst(cortoV(dia, prev))}, `;
  if (next) return next.tipo === "taller" ? `antes de ${taller(next)}, ` : `antes de ${lowFirst(cortoV(dia, next))}, `;
  return "";
}

/** Los cambios de los viajes de un chofer: "viaje nuevo", "te saqué un viaje", "cambió tu orden" o la lista. */
export function mensajeCambioChofer(dia: DiaHoja, ch: string, ds: Diferencia[], o: Opts): string {
  const n = nombreDe(dia, ch);
  const t = hm(o.ahora);
  const nuevos = ds.filter((x) => x.nuevo), sac = ds.filter((x) => x.sac), resto = ds.filter((x) => !x.nuevo && !x.sac);
  const link = mirá(o, "Mirá tus viajes");
  if (nuevos.length === 1 && !sac.length && !resto.filter((x) => !x.orden).length) {
    const ctx = nuevos[0].v ? contextoViaje(dia, ch, nuevos[0].v.k) : "";
    return `${n}, viaje nuevo (${t}): ${ctx}${nuevos[0].t}.${link}`;
  }
  if (sac.length && !nuevos.length && !resto.length) return `${n}, te saqué un viaje (${t}): ${sac.map((x) => x.t).join("; ")}.${mirá(o, "Mirá")}`;
  if (resto.length === 1 && resto[0].orden && !nuevos.length && !sac.length) return `${n}, cambió tu orden (${t}).${mirá(o, "Mirá")}`;
  return `${n}, cambiaron tus viajes ${deHoy(dia, o.ahora)} (${t}): ${ds.map((x) => x.t).join("; ")}.${link}`;
}

/** "Ortega, cambió tu hoja de hoy (6:43): no va Ávila, va Ramírez." */
export function mensajeCambioHoja(dia: DiaHoja, pid: string, c: number, ds: Diferencia[], o: Opts): string {
  const sus = suspendida(dia, c);
  if (sus) return `${nombreDe(dia, pid)}, se suspende la ${cNombre(dia, c)} ${deHoy(dia, o.ahora)} (${sus}). No hay que ir. Cualquier duda, llamá a ${coord(dia)}.`;
  return `${nombreDe(dia, pid)}, cambió tu hoja ${deHoy(dia, o.ahora)} (${hm(o.ahora)}): ${ds.map((z) => z.t).join(", ")}.${mirá(o, "Mirá")}`;
}

/** "Ortega, ya no estás a cargo de la Cuadrilla 3 el martes 13/10. La tiene Hepper." */
export function mensajeEx(dia: DiaHoja, pid: string, c: number | null | undefined): string {
  const nuevo = c != null ? recibeDe(dia, c) : null;
  return `${nombreDe(dia, pid)}, ya no estás a cargo de la ${cNombre(dia, c)} el ${fechaMensaje(dia.fecha)}.${nuevo ? ` La tiene ${nombreDe(dia, nuevo)}.` : ""} Cualquier duda, llamá a ${coord(dia)}.`;
}

/**
 * EL mensaje para una persona de la lista de envío, según en qué estado está: la hoja
 * entera si todavía no se mandó, el cambio si cambió, el "ya no estás a cargo" si dejó de
 * estarlo. null si no hay nada que mandarle.
 */
export function mensajeDe(dia: DiaHoja, x: Destinatario, o: Opts): string | null {
  if (!x.pid) return null;
  const st = estadoEnvio(dia, x);
  if (st.k === "ex") return mensajeEx(dia, x.pid, x.c);
  if (st.k === "cambiada") {
    return x.rol === "chofer" ? mensajeCambioChofer(dia, x.pid, st.ds, o) : mensajeCambioHoja(dia, x.pid, x.c!, st.ds, o);
  }
  if (x.rol === "chofer") return mensajeViajes(dia, x.pid, o);
  if (x.rol === "cargo" && x.c != null) return mensajeHoja(dia, x.pid, x.c, o);
  return null;
}

/** La fila de la lista de envío: "Conte · Cuadrilla 2 · 3 obras", "Kiska · chofer · 6 viajes". */
export function filaEnvio(dia: DiaHoja, x: Destinatario): string {
  if (!x.pid) return `${cNombre(dia, x.c)} · sin nadie a cargo`;
  const n = nombreDe(dia, x.pid);
  if (x.rol === "chofer") {
    const td = todoDe(dia, x.pid)[0];
    const k = viajesChofer(dia, x.pid).length;
    return td != null ? `${n} · chofer · todo el día con ${laC(dia, td)}` : `${n} · chofer · ${k === 1 ? "1 viaje" : `${k} viajes`}`;
  }
  if (x.rol === "ex") return `${n} · ya no está a cargo de la ${cNombre(dia, x.c)}`;
  const ob = obrasCon(dia, x.c!);
  const p = dia.personas.find((q) => q.id === x.pid);
  const sinCel = p && !p.celular && !p.telegram ? " · sin celular cargado" : "";
  return `${n} · ${cNombre(dia, x.c)} · ${ob.length === 1 ? ob[0].o.corto : `${ob.length} obras`}${sinCel}`;
}

// ─── Avisos sueltos ─────────────────────────────────────────────────────────

/** Al que entra a una hoja a último momento (fase 1, sin link): "Ramírez, hoy vas con la Cuadrilla 3 (a cargo Ortega)…". */
export function mensajeOperario(dia: DiaHoja, pid: string, ahora: Minutos): string | null {
  const c = hojaDe(dia, pid);
  if (c == null) return null;
  const h = hojaDeCuadrilla(dia, c)!;
  const chof = h.modo === "lleva_trae" ? `, los lleva ${nombreDe(dia, choferLleva(dia, c))}` : h.modo === "todo_el_dia" ? `, va ${nombreDe(dia, h.choferId)} todo el día` : ", van por su cuenta";
  return `${nombreDe(dia, pid)}, ${esHoy(ahora) ? "hoy" : `el ${fechaMensaje(dia.fecha)}`} vas con la ${cNombre(dia, c)} (a cargo ${nombreDe(dia, aCargoDe(h)) || "todavía nadie"}). Encuentro ${encTxt(dia, c)}${chof}.`;
}

/** "Depósito: a las 11:00 carga Kiska (AF 669 ZL): 1 escalera y 10 caños de 3 m para Gurruchaga 1650." */
export function mensajeDeposito(dia: DiaHoja, v: ViajeCalc): string {
  const t = v.cargaDeposito ? normHora(v.cargaDeposito)! : hm5(v.t - 5);
  return `Depósito: a las ${t} carga ${nombreDe(dia, choferDe(dia, v))} (${patente(dia, v.vehiculoId)}): ${lowFirst(v.carga)} para ${lugar(dia, v.haciaEf).n}.`;
}

/** Al capataz que pidió: "Conte, lo que pediste para Cabildo (6 tablones y 2 bases) lo lleva Gómez, ~10:45." */
export function mensajeCapatazPedido(dia: DiaHoja, pedido: { pidioId: string | null; que: string; hacia: Parameters<typeof lugar>[1] }, v: ViajeCalc): string | null {
  if (!pedido.pidioId) return null;
  return `${nombreDe(dia, pedido.pidioId)}, lo que pediste para ${lugar(dia, pedido.hacia).corto} (${lowFirst(pedido.que)}) lo lleva ${nombreDe(dia, choferDe(dia, v))}, ~${hm5(v.t)}.`;
}

/** Cuando la cuadrilla queda sin que la busquen y vuelve sola. */
export function mensajeVuelvenSolos(dia: DiaHoja, c: number): string | null {
  const r = recibeDe(dia, c);
  if (!r) return null;
  return `${nombreDe(dia, r)}, hoy no los busca nadie: la ${cNombre(dia, c)} vuelve por su cuenta. Cualquier duda, llamá a ${coord(dia)}.`;
}

/**
 * "Avisar tarde" (§9): al capataz de la cuadrilla que el chofer llega tarde a buscarlos (o
 * a llevarlos). "Ortega, Kiska llega ~16:50 a buscarlos (no a las 16:30)…"
 */
export function mensajeTarde(dia: DiaHoja, v: ViajeCalc): { pid: string | null; texto: string } | null {
  if (!v.conflicto) return null;
  const c = v.cuadrillaOdooId ?? dia.hojas.find((h) => h.id === v.hojaId)?.cuadrillaOdooId ?? null;
  if (c == null) return null;
  const pid = recibeDe(dia, c);
  const para = v.tipo === "busca" ? " a buscarlos" : v.tipo === "lleva" ? " a llevarlos" : "";
  return {
    pid,
    texto: `${nombreDe(dia, pid) || "Hola"}, ${nombreDe(dia, choferDe(dia, v))} llega ~${hm5(v.conflicto.llega)}${para} (no a las ${normHora(v.hora)}). Esperalo en ${lugar(dia, v.haciaEf).n}; cualquier cosa, llamá a ${coord(dia)}.`,
  };
}

// ─── Telegram: lo que contesta el bot ───────────────────────────────────────

export const TELEGRAM = {
  vinculado: (nombre: string) => `Listo, ${nombre}. Acá te van a llegar tus hojas del día.`,
  yaVinculado: (nombre: string) => `${nombre}, ya estás vinculado. Acá te llegan tus hojas del día.`,
  codigoInvalido: (coordinador: string) => `Ese link de vinculación no sirve (ya se usó o venció). Pedile uno nuevo a ${coordinador}.`,
  sinCodigo: (coordinador: string) => `Hola. Para recibir tus hojas del día, abrí el link que te mandó ${coordinador}.`,
  otroChat: "Ese botón no es para vos.",
  linkVencido: (coordinador: string) => `Ese mensaje es de una hoja vieja. Si tenés dudas, llamá a ${coordinador}.`,
  versionVieja: "Esa hoja cambió, mirá la nueva.",
  viajeAnulado: "Ese viaje lo sacó la oficina.",
  recibido: (t: Minutos) => `✓ Recibido ${hm(t)}`,
  entendido: (t: Minutos) => `✓ Entendido ${hm(t)}`,
  hecho: (t: Minutos) => `✓ Hecho ${hm(t)}`,
  noPude: (t: Minutos, motivo: string) => `✗ No pude ${hm(t)} · ${lowFirst(motivo)}`,
  noPudeListo: (coordinador: string) => `Listo, ${coordinador} ya lo ve. Si es urgente, llamalo.`,
  elegiMotivo: "¿Qué pasó?",
  botonVer: "Ver la hoja",
  botonVerViajes: "Ver tus viajes",
  botonRecibido: "Recibido",
  botonEntendido: "Entendido",
  botonHecho: "Hecho",
  botonNoPude: "No pude",
  botonVolver: "Volver",
} as const;

/** Para el panel: "Ortega · Telegram vinculado" / "sin Telegram: se manda a mano". */
export function canalDe(dia: DiaHoja, pid: string): string {
  const p = dia.personas.find((x) => x.id === pid);
  if (!p) return "";
  if (p.telegram) return "Telegram";
  return p.celular ? "WhatsApp (a mano)" : "sin celular cargado";
}

/** "Recibido 20:16" para la fila de envío ya mandada. */
export function estadoCorto(dia: DiaHoja, pid: string): string {
  const e = envioDe(dia, pid);
  if (!e || e.enviadaMin == null) return "Sin enviar";
  if (e.anulado) return "Link anulado";
  if (e.recibidaMin != null && (e.cambioMin == null || e.recibidaMin >= e.cambioMin)) return `${e.cambioMin != null ? "Entendido" : "Recibida"} ${hm(e.recibidaMin)}`;
  if (e.abiertaMin != null) return `Abierta ${hm(e.abiertaMin)}`;
  return `${e.cambioMin != null ? "Cambio enviado" : "Enviada"} ${hm(e.cambioMin ?? e.enviadaMin)}${e.enviadaCanal === "telegram" ? " por Telegram" : ""}`;
}

/** "antes de las 13" */
export const antesDe = (h: string | null) => (h ? `antes de las ${hCorta(normHora(h))}` : "");
export { cap };
