// Lo que ve el capataz o el chofer en su celular (/h/<token>), armado a partir del día.
//
// PURO: sin red ni base. `publico.ts` (servidor) lee el link, el día y los archivos de Odoo
// y llama a `armarVista`; los tests (vista.test.ts) lo arman con el escenario de la maqueta;
// la pantalla (src/components/hoja-dia/celular) sólo importa los TIPOS.
//
// ES LA MAQUETA APROBADA: capatazHTML, paraTuObra, choferHTML, ahoraBloque. Los textos
// salen de acá ya escritos ("Te lleva Kiska", "Tu pedido de las 10:21", "entregado 10:52")
// para que el celular no tenga reglas propias.
//
// MUESTRA LO MÍNIMO (§14): nombres y celulares de los que van ese día, contactos y archivos
// de las obras de esa hoja; al chofer, sus viajes. Nada de DNI, legajos ni otras cuadrillas.
//
// Imports relativos y con extensión: este archivo corre en `node --test` sin Next.

import type { DiaHoja, Diferencia, Envio, Fecha, ObraDia, TipoViaje } from "./tipos.ts";
import {
  aCargoDe, cNombre, cap, choferDe, cuadrillaDeViaje, diaSemana, encTxt, envioDe, estadoPedido, fechaMensaje, fmtFrases,
  frLargo, genteDe, hCorta, hm, hm5, hojaDeCuadrilla, horaTxt, lowFirst, lugar, lugarDeKey, nombreDe, normHora, obrasCon,
  pedidosDeViaje, recibeDe, suspendida, textoViaje, todoDe, vehiculo, vehiculoNombre, elVeh, viajesCalc, viajesChofer,
  persona, contratistasDe, aCargoContratista, vanDe, vehiculosDe, genteConChoferes, conLlevaTrae, choferesTodoDe, laCuadrilla, esDeposito, type ViajeCalc,
} from "./estado.ts";
import { vanEnPalabras } from "./contratistas.ts";
import { urlComoLlegar } from "./maps.ts";
import { recorridoChofer } from "./rutas.ts";
import { llevaDeFila, quienBusca } from "./vehiculos.ts";

// ═══════════════════════════ Tipos (los usa la pantalla) ══════════════════════

export type ArchivoPublico = { id: number; nombre: string; mimetype: string; url: string };

/** Un trozo de texto: `b` en negrita. Una línea es una lista de trozos. */
export type Trozo = { t: string; b?: boolean };

/**
 * Una línea de "Para tu obra": "**Tu pedido de las 10:21** (6 tablones y 2 bases): entregado 10:52".
 * `b` va en negrita, `t` normal y `estado` con el tono (verde si llegó, rojo si no se pudo).
 */
export type LineaObra = { b: string | null; t: string; estado: string | null; tono: "ok" | "no" | null };

export type ObraPublica = {
  otId: number;
  n: number;
  /** "8:30" o "~11:45" (estimada). */
  hora: string;
  est: boolean;
  direccion: string;
  mapsUrl: string;
  tipo: string;
  tipoTxt: string;
  /** "jornada completa · día 2 de 3" */
  detalle: string;
  hoy: string | null;
  chips: string[];
  queHacer: string | null;
  observaciones: string | null;
  contacto: string | null;
  telefono: string | null;
  archivos: ArchivoPublico[];
  /** "Para tu obra": los viajes y pedidos de material de esa obra, con su estado. */
  paraTuObra: LineaObra[];
};

export type GentePublica = {
  nombre: string;
  telefono: string | null;
  aCargo: boolean;
  /** El chofer de "Todo el día": cuenta en "Van N" y se marca "chofer". */
  chofer: boolean;
  nota: string | null;
  nuevo: boolean;
  /**
   * Gente de un contratista: `nombre` es el del contratista y `cantidad`, cuántos van
   * ("3 de Quintana"). Sin nombres: de su gente sólo se sabe la cantidad. El teléfono es el
   * del referente. Opcional: las vistas guardadas en el celular de antes no lo tienen.
   */
  cantidad?: number;
  contratista?: boolean;
  /** El nombre de pila ("Fernando"): "Taboada · Fernando". Opcional (vistas viejas guardadas). */
  pila?: string | null;
};

export type ViajePublico = {
  id: string;
  i: number;
  /** "7:45" o "~10:45" (estimada). */
  hora: string;
  horaFija: boolean;
  tipo: TipoViaje;
  /** Cómo lo lee el chofer: "Llevá 6 tablones y 2 bases a Av. Cabildo 3260". */
  texto: string;
  /** De dónde sale (donde estaba el camión): "Depósito", "Gurruchaga 1650". */
  desde: string | null;
  hacia: string;
  /** Vuelve al depósito después ("→ depósito"). */
  vuelta: boolean;
  direccion: string | null;
  mapsUrl: string | null;
  /** Lo que lleva además de la gente (sólo en "Lleva" / "Busca" cuadrilla). */
  carga: string | null;
  pidio: string | null;
  /** "13" de "antes de las 13". */
  antesDe: string | null;
  llamar: { nombre: string; telefono: string } | null;
  estado: "planeado" | "hecho" | "no_pudo" | "anulado";
  hechoHora: string | null;
  motivo: string | null;
  nuevo: boolean;
  foto: boolean;
  /** Después de "Hecho" se ofrece "Sacar foto del remito" (compras y viajes de material). */
  remito: boolean;
};

export type CambioPublico = {
  hora: string;
  /** "Cambió a las 6:43", "Nuevo viaje 10:23", "Te sacaron un viaje 10:23". */
  titulo: string;
  /** "No va Ávila. Va Ramírez." */
  txt: string;
  /** Sólo le sacaron viajes: la tarjeta va en gris, no en ámbar. */
  gris: boolean;
};

export type CoordinadorPublico = { nombre: string; telefono: string | null };

type Comun = {
  fecha: Fecha;
  /** "Martes 13/10" */
  fechaTxt: string;
  generadoAt: string;
  persona: string;
  /** ¿Ya se le mandó? Si no, el pie dice "Todavía no se mandó" (el link existe desde que se arma la lista). */
  enviada: boolean;
  /** Cambio sin confirmar con su botón "Entendido". */
  cambio: CambioPublico | null;
  recibido: { hora: string; entendido: boolean } | null;
  version: number;
  coordinador: CoordinadorPublico;
};

export type ChoferDeHoja = {
  modo: "sin" | "todo_el_dia" | "lleva_trae";
  /** El texto plano ("Te lleva Kiska · Iveco AF 669 ZL\nLos busca a las 16:30 en Av. Rivadavia 6150"). */
  texto: string;
  /** Lo mismo en líneas, con las negritas de la maqueta. */
  lineas: Trozo[][];
  nombre: string | null;
  telefono: string | null;
  /** Para "Quiénes van": "los lleva y los busca", "los lleva", "todo el día". */
  rol: string;
  /**
   * Los otros choferes de la hoja (otro vehículo, o el que los busca si es otro), para
   * "Quiénes van" con su "Llamar". Opcional: las vistas guardadas de antes no lo tienen.
   */
  otros?: { nombre: string; telefono: string | null; rol: string }[];
};

/** "Tu pedido de las 10:21 · 6 tablones y 2 bases para Cabildo: entregado 10:52" (el resumen de arriba). */
export type TuPedido = { k: string; que: string; estado: string; tono: "ok" | "no" | null };

export type VistaCapataz = Comun & {
  situacion: "ok"; rol: "a_cargo"; cuadrilla: string; aCargo: string | null; vos: boolean; nota: string | null; encuentro: string;
  chofer: ChoferDeHoja | null;
  obras: ObraPublica[]; gente: GentePublica[]; tuPedido: TuPedido | null;
  /** Cuántos van (la gente, la de los contratistas y el chofer de todo el día). Opcional por las vistas viejas guardadas. */
  van?: number;
  /** "3 de Quintana + Ramírez, Pérez". */
  vanTxt?: string;
  /** La hoja del Depósito (F2): sin obras ni chofer; la dirección del depósito. Opcional por las vistas viejas guardadas. */
  deposito?: { direccion: string | null } | null;
};
export type VistaChofer = Comun & {
  situacion: "ok"; rol: "chofer"; vehiculo: string | null;
  todo: {
    cuadrilla: string; aCargo: string | null; aCargoTel: string | null; encuentro: string; nota: string | null;
    obras: ObraPublica[]; gente: { nombre: string; aCargo: boolean; pila?: string | null }[]; van: number;
  } | null;
  viajes: ViajePublico[]; ahoraId: string | null; motivosNoPude: string[];
  /** "Ver el recorrido en Maps": todas sus paradas que faltan, en orden. Opcional (vistas viejas guardadas). */
  recorridoUrl?: string | null;
};
export type VistaPublica =
  | { situacion: "invalido" }
  | { situacion: "vencido"; fecha: Fecha; texto: string; coordinador?: CoordinadorPublico }
  | { situacion: "ya_no"; fecha: Fecha; texto: string; coordinador: CoordinadorPublico }
  | (Comun & { situacion: "suspendida"; cuadrilla: string; texto: string })
  | VistaCapataz
  | VistaChofer;

// ═══════════════════════════ Armar la vista ═══════════════════════════════════

/** Lo que importa del link (`hd_links`). */
export type LinkVista = {
  rol: "a_cargo" | "chofer";
  personaId: string;
  cuadrillaOdooId: number | null;
  anulado: boolean;
  /** Se anuló porque cambió quién está a cargo (ve "la tiene Hepper", no "no es válido"). */
  anuladoPorRol: boolean;
  version: number;
};

export type OpcionesVista = {
  /** Los archivos (planos y fotos) de cada OT, ya con su `url` del link. */
  archivos?: (otId: number) => ArchivoPublico[];
  /** "Desarme", "Armado"… (el del tablero). */
  tipoTxt?: (tipo: string) => string;
};

export const mapsUrl = (dir: string | null) => (dir ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${dir}, Buenos Aires`)}` : null);
/** "Cómo llegar" a una obra: al pin si tiene coordenadas, si no a la dirección. */
const comoLlegarObra = (o: ObraDia) => urlComoLlegar({ lat: o.lat, lng: o.lng, dir: o.direccion }) ?? mapsUrl(o.direccion) ?? "";
const telDe = (dia: DiaHoja, pid: string | null | undefined) => persona(dia, pid)?.celular ?? null;

const TIPOS_REMITO: TipoViaje[] = ["compra", "lleva_material", "trae_material", "entre_depositos"];
/** ¿Después de "Hecho" se ofrece la foto del remito? (§12: compras y viajes de material). */
export const pideRemito = (tipo: TipoViaje) => TIPOS_REMITO.includes(tipo);

/** El título de la tarjeta del chofer (maqueta choferHTML): "Nuevo viaje", "Te sacaron un viaje"… */
export function tituloCambioChofer(ds: Diferencia[]): { titulo: string; gris: boolean } {
  if (ds.length && ds.every((x) => x.nuevo)) return { titulo: ds.length > 1 ? "Nuevos viajes" : "Nuevo viaje", gris: false };
  if (ds.length && ds.every((x) => x.sac)) return { titulo: ds.length > 1 ? "Te sacaron viajes" : "Te sacaron un viaje", gris: true };
  return { titulo: "Cambiaron tus viajes", gris: false };
}

/** ¿Qué cambió desde lo último que confirmó? (la tarjeta de arriba, con "Entendido"). */
export function cambioPendiente(e: Envio | null, rol: "a_cargo" | "chofer"): CambioPublico | null {
  if (!e || e.cambioMin == null || (e.recibidaMin != null && e.recibidaMin >= e.cambioMin)) return null;
  const ds = e.cambioDiffs ?? [];
  const hora = hm(e.cambioMin);
  const txt = ds.length ? fmtFrases(ds, false) : rol === "chofer" ? "Cambiaron tus viajes." : "Cambió tu hoja.";
  if (rol === "a_cargo") return { hora, titulo: `Cambió a las ${hora}`, txt, gris: false };
  const t = tituloCambioChofer(ds);
  return { hora, titulo: `${t.titulo} ${hora}`, txt, gris: t.gris };
}

/** "Para tu obra" (§12, maqueta paraTuObra): lo que va o viene de esa obra, con su estado. */
export function paraTuObra(dia: DiaHoja, otId: number, pid: string, ahora: number): LineaObra[] {
  const out: LineaObra[] = [];
  const coord = dia.parametros.coordinador.nombre;
  const quienPidio = (p: { pidioId: string | null; creadoMin: number } | null) =>
    p?.pidioId ? (p.pidioId === pid ? `Tu pedido de las ${hm(p.creadoMin)}` : `El pedido de ${nombreDe(dia, p.pidioId)} de las ${hm(p.creadoMin)}`) : null;
  const materiales: TipoViaje[] = ["lleva_material", "trae_material", "entre_depositos", "otro"];
  for (const v of viajesCalc(dia)) {
    if (v.haciaEf.otId !== otId || !materiales.includes(v.tipo) || v.estado === "anulado" || v.estado === "no_pudo") continue;
    const ch = nombreDe(dia, choferDe(dia, v)) || "el camión";
    const pd = pedidosDeViaje(dia, v.id)[0] ?? null;
    const quien = quienPidio(pd);
    const hecho = v.estado === "hecho";
    const a = v.hechoMin != null ? hm(v.hechoMin) : "";
    if (v.tipo === "trae_material") {
      const que = lowFirst(v.carga || "lo desarmado");
      out.push(hecho
        ? { b: null, t: "", estado: `${ch} se llevó ${que}${a ? ` (${a})` : ""}`, tono: "ok" }
        : { b: null, t: `${v.hora ? `A las ${normHora(v.hora)}` : `Cerca de las ${hm5(v.t)}`} ${ch} trae ${que} al depósito`, estado: null, tono: null });
    } else if (quien) {
      const que = lowFirst(pd!.que);
      out.push(hecho
        ? { b: quien, t: ` (${que}): `, estado: `entregado ${a}`.trim(), tono: "ok" }
        : { b: quien, t: ` (${que}): lo lleva ${ch}, ${horaTxt(v)}`, estado: null, tono: null });
    } else {
      out.push(hecho
        ? { b: null, t: ` (${ch})`, estado: `El material llegó ${a}`.trim(), tono: "ok" }
        : { b: null, t: `El material lo lleva ${ch} a las ${horaTxt(v)}`, estado: null, tono: null });
    }
  }
  for (const p of dia.pedidos) {
    if (p.fecha !== dia.fecha || p.hacia.otId !== otId || p.estado === "anulado") continue;
    const st = estadoPedido(dia, p, ahora);
    if (st.k === "hecho" || st.k === "en" || st.k === "anulado") continue;
    const q = p.pidioId === pid ? `Tu pedido de las ${hm(p.creadoMin)}` : "Un pedido";
    if (p.ultimoNoPudo) out.push({ b: q, t: ": ", estado: `no se pudo (${lowFirst(p.ultimoNoPudo.motivo)}). ${coord} ya sabe`, tono: "no" });
    else out.push({ b: q, t: ` (${lowFirst(p.que)}): todavía sin camión. ${coord} ya lo tiene`, estado: null, tono: null });
  }
  return out;
}

/** El último pedido que hizo esa persona ese día (el resumen de arriba del capataz). */
export function tuPedido(dia: DiaHoja, pid: string, ahora: number): TuPedido | null {
  const mios = dia.pedidos.filter((p) => p.fecha === dia.fecha && p.pidioId === pid && p.estado !== "anulado" && p.creadoMin >= 0);
  const p = mios.sort((a, b) => a.creadoMin - b.creadoMin).at(-1);
  if (!p) return null;
  const st = estadoPedido(dia, p, ahora);
  const coord = dia.parametros.coordinador.nombre;
  const estado: Pick<TuPedido, "estado" | "tono"> =
    st.k === "hecho" ? { estado: `entregado ${st.v.hechoMin != null ? hm(st.v.hechoMin) : ""}`.trim(), tono: "ok" }
    : st.k === "en" ? { estado: `lo lleva ${nombreDe(dia, choferDe(dia, st.v)) || "el camión"}, ${horaTxt(st.v)}`, tono: null }
    : p.ultimoNoPudo ? { estado: `no se pudo; ${coord} ya sabe`, tono: "no" }
    : { estado: "todavía sin camión", tono: null };
  return { k: `Tu pedido de las ${hm(p.creadoMin)}`, que: `${lowFirst(p.que)} para ${lugar(dia, p.hacia).corto}`, ...estado };
}

function obrasPublicas(dia: DiaHoja, c: number, pid: string, ahora: number, op: OpcionesVista): ObraPublica[] {
  return obrasCon(dia, c).map((x, i) => {
    const o: ObraDia = x.o;
    const ins = dia.instrucciones.find((y) => y.otId === o.otId);
    const diaTxt = o.dia && o.totalDias && o.totalDias > 1 ? ` · día ${o.dia} de ${o.totalDias}` : "";
    return {
      otId: o.otId, n: i + 1, hora: `${x.est ? "~" : ""}${x.est ? hm5(x.t) : x.hora}`, est: x.est, direccion: o.direccion, mapsUrl: comoLlegarObra(o),
      tipo: o.tipo, tipoTxt: op.tipoTxt ? op.tipoTxt(o.tipo) : cap(o.tipo), detalle: `${frLargo(o.fraccion)}${diaTxt}`,
      hoy: ins?.hoy ? ins.hoy.replace(/^Hoy:\s*/i, "") : null, chips: ins?.chips ?? [],
      queHacer: o.detalleTecnico, observaciones: o.observaciones, contacto: o.contactoObra, telefono: o.telObra,
      archivos: o.cantArchivos && op.archivos ? op.archivos(o.otId) : [], paraTuObra: paraTuObra(dia, o.otId, pid, ahora),
    };
  });
}

/** Las OT cuyos archivos hay que traer de Odoo para esta vista (las de su hoja o su "todo el día"). */
export function otsConArchivos(dia: DiaHoja, link: LinkVista): number[] {
  const c = link.rol === "a_cargo" ? link.cuadrillaOdooId : todoDe(dia, link.personaId)[0] ?? null;
  return c == null ? [] : obrasCon(dia, c).filter((x) => x.o.cantArchivos > 0).map((x) => x.o.otId);
}

/**
 * Los choferes de la hoja del capataz, en palabras (maqueta capatazHTML: "Te lleva **Kiska** ·
 * Iveco AF 669 ZL"). Una línea por vehículo ("Borda queda todo el día con el Agrale hidrogrúa
 * AB 831 LC", "Te lleva Nuñez · Iveco AB 799 CA") y la del busca ("Los busca Gómez a las 17:00
 * en …", "Todavía no hay quién los busque", "Vuelven por su cuenta").
 */
function choferDeHoja(dia: DiaHoja, c: number, pid: string): ChoferDeHoja {
  const h = hojaDeCuadrilla(dia, c)!;
  const coord = dia.parametros.coordinador.nombre;
  const fs = vehiculosDe(h);
  if (!fs.length) return { modo: "sin", texto: "Van por su cuenta", lineas: [[{ t: "Van por su cuenta" }]], nombre: null, telefono: null, rol: "" };
  const lineas: Trozo[][] = [];
  const quienes: { ch: string | null; rol: string }[] = [];
  for (const f of fs) {
    if (f.modo === "todo_el_dia") {
      const n = f.choferId === pid ? "Vos" : nombreDe(dia, f.choferId) || "El chofer";
      const V = vehiculo(dia, f.vehiculoId);
      const resto = ` ${f.choferId === pid ? "manejás" : "queda"} todo el día${V ? ` ${elVeh(dia, f.vehiculoId, "con el", true)}` : ""}`;
      lineas.push([{ t: n, b: true }, { t: resto }]);
      quienes.push({ ch: f.choferId, rol: "todo el día" });
      continue;
    }
    const ll = llevaDeFila(dia, h, f);
    const ch = (ll ? choferDe(dia, ll) : null) ?? f.choferId;
    const veh = vehiculoNombre(dia, ll?.vehiculoId ?? f.vehiculoId);
    const hora = fs.filter((x) => x.modo === "lleva_trae").length > 1 && ll ? normHora(ll.hora) : null;
    lineas.push(ch === pid
      ? [{ t: "Manejás vos" }, ...(veh ? [{ t: ` · ${veh}` }] : [])]
      : [{ t: "Te lleva " }, { t: nombreDe(dia, ch) || "un chofer", b: true }, ...(veh ? [{ t: ` · ${veh}` }] : []), ...(hora ? [{ t: ` · ${hora}` }] : [])]);
    quienes.push({ ch, rol: "los lleva" });
  }
  if (conLlevaTrae(h)) {
    const q = quienBusca(dia, h);
    const ultima = obrasCon(dia, c).at(-1)?.o.corto ?? "la obra";
    if (q.k === "solos") lineas.push([{ t: "Vuelven por su cuenta" }]);
    else if (q.k === "definir") lineas.push([{ t: `Todavía no hay quién los busque: ${coord} te avisa` }]);
    else {
      const chB = choferDe(dia, q.v);
      const yaLleva = quienes.find((x) => x.ch && x.ch === chB && x.rol === "los lleva");
      const otro = chB && !yaLleva ? [{ t: " " }, { t: chB === pid ? "vos" : nombreDe(dia, chB), b: true }] : [];
      const hb = normHora(q.v.hora);
      lineas.push([{ t: "Los busca" }, ...otro, ...(hb ? [{ t: " a las " }, { t: hb, b: true }] : []), { t: ` en ${ultima}` }]);
      if (yaLleva) yaLleva.rol = "los lleva y los busca";
      else if (chB) quienes.push({ ch: chB, rol: "los busca" });
    }
  }
  const plano = (l: Trozo[]) => l.map((x) => x.t).join("");
  // El que se llama desde "Quiénes van": los de todo el día ya están en la gente (con "chofer").
  const llaman = quienes.filter((x) => x.rol !== "todo el día" && x.ch && x.ch !== pid);
  const pri = llaman[0] ?? null;
  const fl = fs.find((f) => f.modo === "lleva_trae");
  return {
    modo: fl ? "lleva_trae" : "todo_el_dia",
    texto: lineas.map(plano).join("\n"), lineas,
    nombre: pri?.ch ? nombreDe(dia, pri.ch) : null, telefono: telDe(dia, pri?.ch), rol: pri?.rol ?? "",
    otros: llaman.slice(1).map((x) => ({ nombre: nombreDe(dia, x.ch), telefono: telDe(dia, x.ch), rol: x.rol })),
  };
}

/**
 * La vista del link, para un token válido y no vencido (eso lo mira `publico.ts`).
 * `ahora`: minutos desde las 0:00 del día de la hoja.
 */
export function armarVista(dia: DiaHoja, link: LinkVista, ahora: number, op: OpcionesVista = {}): VistaPublica {
  const fecha = dia.fecha;
  const coordinador = dia.parametros.coordinador;
  const pid = link.personaId;
  const e = envioDe(dia, pid);
  const diaNum = `${diaSemana(fecha)} ${Number(fecha.slice(8))}`;
  const comun: Comun = {
    fecha, fechaTxt: cap(fechaMensaje(fecha)), generadoAt: dia.generadoAt, persona: nombreDe(dia, pid),
    enviada: e?.enviadaMin != null,
    cambio: cambioPendiente(e, link.rol),
    recibido: e?.recibidaMin != null ? { hora: hm(e.recibidaMin), entendido: e.cambioMin != null && e.recibidaMin >= e.cambioMin } : null,
    version: link.version, coordinador,
  };

  if (link.rol === "a_cargo") {
    const c = link.cuadrillaOdooId;
    if (link.anulado && !link.anuladoPorRol) return { situacion: "invalido" };
    const h = c != null ? hojaDeCuadrilla(dia, c) : null;
    if (c == null || !h || recibeDe(dia, c) !== pid || link.anuladoPorRol) {
      const otro = h && c != null ? recibeDe(dia, c) : null;
      return { situacion: "ya_no", fecha, coordinador, texto: `El ${diaNum} ${laCuadrilla(dia, c)} la tiene ${otro ? nombreDe(dia, otro) : "otra persona"}. Si es un error, llamá a ${coordinador.nombre}.` };
    }
    const sus = suspendida(dia, c);
    if (sus) return { ...comun, situacion: "suspendida", cuadrilla: cNombre(dia, c), texto: `Suspendida · ${sus}. No hay que ir. Cualquier duda, llamá a ${coordinador.nombre}.` };
    const aCargo = aCargoDe(h);
    // "nuevo": los que no estaban en lo último que confirmó, mientras no toque "Entendido".
    const base = e?.snapRecibido?.tipo === "hoja" ? e.snapRecibido : e?.snapPrimero?.tipo === "hoja" ? e.snapPrimero : null;
    const gente: GentePublica[] = genteDe(h).map((p) => ({
      nombre: nombreDe(dia, p), pila: persona(dia, p)?.pila ?? null, telefono: telDe(dia, p), aCargo: p === aCargo, chofer: choferesTodoDe(h).includes(p),
      nota: h.integrantes.find((i) => i.personaId === p)?.nota ?? null, nuevo: !!base && !!comun.cambio && !base.gente.includes(p),
    }));
    // La gente de los contratistas: primero, como "3 de Quintana" (sin nombres), con el
    // teléfono del referente. "nuevo" si no estaba en lo último que confirmó.
    const kCargo = aCargoContratista(h);
    const kBase = base?.contr ?? {};
    gente.unshift(...contratistasDe(h).map((x) => ({
      nombre: nombreDe(dia, x.contratistaId), telefono: telDe(dia, x.contratistaId), aCargo: x.contratistaId === kCargo, chofer: false,
      nota: x.nota, nuevo: !!base && !!comun.cambio && !(x.contratistaId in kBase), cantidad: x.cantidad, contratista: true,
    })));
    // Los choferes de todo el día que no son de la gente (si lo son, ya están: cuentan una vez).
    const conChofer = genteConChoferes(h);
    for (const ch of conChofer.filter((x) => !genteDe(h).includes(x))) gente.push({ nombre: nombreDe(dia, ch), pila: persona(dia, ch)?.pila ?? null, telefono: telDe(dia, ch), aCargo: false, chofer: true, nota: null, nuevo: false });
    return {
      van: vanDe(dia, c), vanTxt: vanEnPalabras(dia, c, conChofer),
      ...comun, situacion: "ok", rol: "a_cargo", cuadrilla: cNombre(dia, c), aCargo: aCargo ? nombreDe(dia, aCargo) : null, vos: aCargo === pid,
      nota: h.nota, encuentro: encTxt(dia, c), chofer: esDeposito(c) ? null : choferDeHoja(dia, c, pid), obras: esDeposito(c) ? [] : obrasPublicas(dia, c, pid, ahora, op), gente,
      tuPedido: tuPedido(dia, pid, ahora),
      deposito: esDeposito(c) ? { direccion: dia.lugares.find((l) => l.tipo === "deposito" && l.activo)?.direccion ?? null } : null,
    };
  }

  // Chofer.
  if (link.anulado) return { situacion: "invalido" };
  const vs = viajesChofer(dia, pid);
  const td = todoDe(dia, pid)[0] ?? null;
  const visto = e?.snapRecibido?.tipo === "chofer" ? e.snapRecibido : null;
  const vehTd = td != null ? vehiculosDe(hojaDeCuadrilla(dia, td)).find((f) => f.modo === "todo_el_dia" && f.choferId === pid)?.vehiculoId ?? null : null;
  const vehId = vehTd ?? vs.find((v) => v.estado === "planeado")?.vehiculoId ?? vs[0]?.vehiculoId ?? null;
  const viajes: ViajePublico[] = vs.map((v: ViajeCalc) => {
    const p = pedidosDeViaje(dia, v.id)[0] ?? null;
    const destino = lugar(dia, v.haciaEf);
    const c = cuadrillaDeViaje(dia, v);
    const capataz = c != null ? recibeDe(dia, c) : null;
    const llamarA = p?.pidioId ?? capataz;
    const telL = llamarA ? telDe(dia, llamarA) : null;
    const llamar = telL ? { nombre: nombreDe(dia, llamarA), telefono: telL }
      : destino.telefono ? { nombre: destino.corto, telefono: destino.telefono }
      : destino.obra && destino.otId != null ? (() => { const o = dia.obras.find((x) => x.otId === destino.otId); return o?.telObra ? { nombre: (o.contactoObra ?? "la obra").split(" (")[0], telefono: o.telObra } : null; })()
      : null;
    return {
      id: v.id, i: v.i, hora: horaTxt(v), horaFija: !!v.hora, tipo: v.tipo, texto: textoViaje(dia, v, true),
      desde: lugarDeKey(dia, v.desdeKey).n, hacia: destino.n, vuelta: v.vuelta, direccion: destino.dir,
      mapsUrl: urlComoLlegar({ lat: destino.lat, lng: destino.lng, dir: destino.dir ?? (destino.obra ? destino.n : null) }),
      carga: (v.tipo === "lleva" || v.tipo === "busca") && v.carga ? v.carga : null,
      pidio: p?.pidioId ? nombreDe(dia, p.pidioId) : null, antesDe: p?.horaLimite ? hCorta(normHora(p.horaLimite)) : null,
      llamar, estado: v.estado, hechoHora: v.hechoMin != null ? hm(v.hechoMin) : null, motivo: v.noPudoMotivo,
      nuevo: !!visto && !!comun.cambio && !visto.viajes.some((x) => x.k === v.id), foto: v.foto, remito: pideRemito(v.tipo),
    };
  });
  const hTd = td != null ? hojaDeCuadrilla(dia, td) : null;
  const aCargoTd = aCargoDe(hTd);
  return {
    ...comun, situacion: "ok", rol: "chofer", vehiculo: vehId ? vehiculoNombre(dia, vehId) : null,
    todo: td != null && hTd ? {
      cuadrilla: cNombre(dia, td), aCargo: nombreDe(dia, aCargoTd) || null, aCargoTel: telDe(dia, aCargoTd), encuentro: encTxt(dia, td), nota: hTd.nota,
      obras: obrasPublicas(dia, td, pid, ahora, op),
      gente: [
        ...contratistasDe(hTd).map((x) => ({ nombre: x.cantidad > 0 ? `${x.cantidad} de ${nombreDe(dia, x.contratistaId)}` : nombreDe(dia, x.contratistaId), aCargo: x.contratistaId === aCargoTd })),
        ...genteDe(hTd).map((p) => ({ nombre: nombreDe(dia, p), pila: persona(dia, p)?.pila ?? null, aCargo: p === aCargoTd })),
      ],
      van: vanDe(dia, td),
    } : null,
    viajes, ahoraId: vs.find((v) => v.estado === "planeado")?.id ?? null, motivosNoPude: dia.parametros.motivosNoPude,
    recorridoUrl: recorridoChofer(dia, pid),
  };
}
