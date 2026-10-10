// El link del capataz y del chofer (/h/<token>) y el webhook de Telegram: lo que entra a la
// Hoja del día SIN sesión.
//
// SOLO SERVER-SIDE, con la service role. Por eso cada función empieza validando: el token
// (que exista, que no esté anulado ni vencido, que la persona siga a cargo o siga siendo
// chofer ese día) o el chat de Telegram (que sea el de la persona del link o del viaje).
//
// MUESTRA LO MÍNIMO (§14): nombres y celulares de los que van ese día, contactos y archivos
// de las obras de esa hoja; al chofer, sus viajes. Nada de DNI, legajos, otras cuadrillas
// ni viajes de otros. ESCRIBE LO MÍNIMO: "Recibido", "Entendido", y el chofer "Hecho" /
// "No pude" sólo sobre SUS viajes de ese día.

import { createAdminClient } from "@/lib/supabase/admin";
import { fetchDocumentosOt } from "@/lib/odoo/asignaciones";
import { tipoOtLabel } from "@/lib/tablero/tipos";
import type { DiaHoja, Fecha, Foto, ObraDia } from "./tipos";
import {
  aCargoDe, cNombre, choferDe, encTxt, envioDe, esHoy, frLargo, genteDe, hm, hm5, hojaDeCuadrilla, horaTxt, lugar, minutosDesde,
  nombreDe, normHora, obrasCon, pedidosDeViaje, recibeDe, suspendida, textoViaje, todoDe, vehiculoNombre, viajesChofer, cap, lowFirst,
  estadoPedido, fechaMensaje, diaSemana, ddmm, type ViajeCalc,
} from "./estado";
import { TELEGRAM } from "./mensajes";
import { codigoValido, situacionLink, tokenValido } from "./tokens";
import { anotar, avisarPantallas, grabador, leerDia } from "./servicio";
import { deshacerEstadoViaje, marcarHecho, marcarNoPude } from "./acciones";
import {
  contestarBoton, decodificar, editarBotones, editarMensaje, enviarMensaje, leerStart, tecladoMotivos, tecladoViaje, type Teclado,
} from "./telegram";

type Fila = Record<string, unknown>;
const ts = () => new Date().toISOString();

// ═══════════════════════════ La vista del celular ═════════════════════════════

export type ArchivoPublico = { id: number; nombre: string; mimetype: string; url: string };
export type ObraPublica = {
  otId: number;
  n: number;
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
  paraTuObra: string[];
};
export type GentePublica = { nombre: string; telefono: string | null; aCargo: boolean; nota: string | null; nuevo: boolean };
export type ViajePublico = {
  id: string;
  i: number;
  hora: string;
  horaFija: boolean;
  /** Cómo lo lee el chofer: "Llevá 6 tablones y 2 bases a Av. Cabildo 3260". */
  texto: string;
  desde: string | null;
  hacia: string;
  direccion: string | null;
  mapsUrl: string | null;
  carga: string | null;
  pidio: string | null;
  llamar: { nombre: string; telefono: string } | null;
  estado: "planeado" | "hecho" | "no_pudo" | "anulado";
  hechoHora: string | null;
  motivo: string | null;
  nuevo: boolean;
  foto: boolean;
};
type Comun = {
  fecha: Fecha;
  /** "Martes 13/10" */
  fechaTxt: string;
  generadoAt: string;
  persona: string;
  /** Cambio sin confirmar ("Cambió a las 6:43: …") con su botón "Entendido". */
  cambio: { hora: string; txt: string } | null;
  recibido: { hora: string } | null;
  version: number;
  coordinador: { nombre: string; telefono: string | null };
};
export type VistaPublica =
  | { situacion: "invalido" }
  | { situacion: "vencido"; fecha: Fecha; texto: string }
  | { situacion: "ya_no"; fecha: Fecha; texto: string; coordinador: { nombre: string; telefono: string | null } }
  | (Comun & { situacion: "suspendida"; texto: string })
  | (Comun & {
      situacion: "ok"; rol: "a_cargo"; cuadrilla: string; aCargo: string | null; vos: boolean; nota: string | null; encuentro: string;
      chofer: { modo: string; texto: string; nombre: string | null; telefono: string | null } | null;
      obras: ObraPublica[]; gente: GentePublica[];
    })
  | (Comun & {
      situacion: "ok"; rol: "chofer"; vehiculo: string | null;
      todo: { cuadrilla: string; aCargo: string | null; encuentro: string; obras: ObraPublica[] } | null;
      viajes: ViajePublico[]; ahoraId: string | null; motivosNoPude: string[];
    });

const archivosCache = new Map<number, { at: number; datos: Promise<ArchivoPublico[]> }>();
function archivos(token: string, otId: number): Promise<ArchivoPublico[]> {
  const hit = archivosCache.get(otId);
  const datos = hit && Date.now() - hit.at < 10 * 60_000 ? hit.datos
    : fetchDocumentosOt(otId).then((ds) => ds.map((d) => ({ id: d.id, nombre: d.nombre, mimetype: d.mimetype, url: "" }))).catch(() => []);
  if (!hit || hit.datos !== datos) archivosCache.set(otId, { at: Date.now(), datos });
  return datos.then((ds) => ds.map((d) => ({ ...d, url: `/api/public/hoja/${token}/archivo/${d.id}` })));
}

const maps = (dir: string | null) => (dir ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${dir}, Buenos Aires`)}` : null);
const tel = (dia: DiaHoja, pid: string | null | undefined) => (pid ? dia.personas.find((p) => p.id === pid)?.celular ?? null : null);

/** "Para tu obra" (§12). */
function paraTuObra(dia: DiaHoja, otId: number, ahora: number): string[] {
  const out: string[] = [];
  const coord = dia.parametros.coordinador.nombre;
  for (const p of dia.pedidos.filter((x) => x.fecha === dia.fecha && x.hacia.otId === otId && x.estado !== "anulado")) {
    const st = estadoPedido(dia, p, ahora);
    const tuyo = `${p.pidioId ? `Tu pedido de las ${hm(p.creadoMin)}` : "El pedido"} (${lowFirst(p.que)})`;
    if (st.k === "hecho") out.push(`${tuyo}: entregado ${st.v.hechoMin != null ? hm(st.v.hechoMin) : ""}`.trim());
    else if (st.k === "en") out.push(`${tuyo}: lo lleva ${nombreDe(dia, choferDe(dia, st.v))}, ${horaTxt(st.v)}`);
    else if (p.ultimoNoPudo) out.push(`${tuyo}: no se pudo (${lowFirst(p.ultimoNoPudo.motivo)}). ${coord} ya sabe`);
    else out.push(`${tuyo}: todavía sin camión`);
  }
  const conPedido = new Set(dia.pedidos.map((p) => p.viajeId).filter(Boolean));
  for (const veh of new Set(dia.viajes.map((v) => v.vehiculoId).filter(Boolean) as string[])) {
    for (const v of viajesChofer(dia, choferDe(dia, dia.viajes.find((x) => x.vehiculoId === veh)!) ?? "")) {
      if (v.haciaEf.otId !== otId || conPedido.has(v.id) || (v.tipo !== "lleva_material" && v.tipo !== "trae_material")) continue;
      const n = nombreDe(dia, choferDe(dia, v));
      if (v.estado === "hecho") out.push(`${v.tipo === "lleva_material" ? "Material entregado" : "Lo desarmado salió"} ${v.hechoMin != null ? hm(v.hechoMin) : ""} · ${n}`.trim());
      else if (v.tipo === "lleva_material") out.push(`Material: lo lleva ${n} ${horaTxt(v)}`);
      else out.push(`A las ${horaTxt(v).replace("~", "~")} ${n} trae ${lowFirst(v.carga ?? "lo desarmado")} al depósito`);
    }
  }
  return [...new Set(out)];
}

async function obrasPublicas(dia: DiaHoja, c: number, token: string, ahora: number): Promise<ObraPublica[]> {
  const ob = obrasCon(dia, c);
  return Promise.all(ob.map(async (x, i) => {
    const o: ObraDia = x.o;
    const ins = dia.instrucciones.find((y) => y.otId === o.otId);
    const diaTxt = o.dia && o.totalDias && o.totalDias > 1 ? ` · día ${o.dia} de ${o.totalDias}` : "";
    return {
      otId: o.otId, n: i + 1, hora: `${x.est ? "~" : ""}${x.est ? hm5(x.t) : x.hora}`, est: x.est, direccion: o.direccion, mapsUrl: maps(o.direccion)!,
      tipo: o.tipo, tipoTxt: tipoOtLabel(o.tipo), detalle: `${frLargo(o.fraccion)}${diaTxt}`, hoy: ins?.hoy ?? null, chips: ins?.chips ?? [],
      queHacer: o.detalleTecnico, observaciones: o.observaciones, contacto: o.contactoObra, telefono: o.telObra,
      archivos: o.cantArchivos ? await archivos(token, o.otId) : [], paraTuObra: paraTuObra(dia, o.otId, ahora),
    };
  }));
}

/** ¿Qué cambió desde lo último que confirmó? (la tarjeta ámbar de arriba). */
function cambioPendiente(dia: DiaHoja, pid: string): Comun["cambio"] {
  const e = envioDe(dia, pid);
  if (!e || e.cambioMin == null || (e.recibidaMin != null && e.recibidaMin >= e.cambioMin)) return null;
  const ds = (e.cambioDiffs ?? []).map((d) => d.t);
  return { hora: hm(e.cambioMin), txt: ds.length ? `${ds.map(cap).join(". ")}.` : "Cambió tu hoja." };
}

/** Lo que ve quien abre el link. */
export async function vistaPublica(token: string): Promise<{ vista: VistaPublica; link: Fila | null }> {
  if (!tokenValido(token)) return { vista: { situacion: "invalido" }, link: null };
  const adm = createAdminClient();
  const r = await adm.from("hd_links").select("*").eq("token", token).maybeSingle();
  const l = r.data;
  if (!l) return { vista: { situacion: "invalido" }, link: null };
  const fecha = String(l.fecha);
  const sit = situacionLink({ fecha, expira_at: String(l.expira_at), anulado_at: (l.anulado_at as string) ?? null });
  if (sit === "vencido") {
    const co = (await adm.from("hd_parametros").select("valor").eq("clave", "coordinador").maybeSingle()).data?.valor as { nombre?: string } | undefined;
    return { vista: { situacion: "vencido", fecha, texto: `Este link era de la hoja del ${diaSemana(fecha)} ${Number(fecha.slice(8))}. Pedile la nueva a ${co?.nombre ?? "la oficina"}.` }, link: l };
  }
  const dia = await leerDia(fecha, { cacheOdoo: true });
  const coordinador = dia.parametros.coordinador;
  const vencidoTxt = (t: string) => ({ situacion: "ya_no" as const, fecha, texto: t, coordinador });
  const pid = String(l.persona_id ?? l.externa_id);
  const ahora = minutosDesde(fecha, new Date());
  const e = envioDe(dia, pid);
  const comun: Comun = {
    fecha, fechaTxt: cap(fechaMensaje(fecha)), generadoAt: dia.generadoAt, persona: nombreDe(dia, pid),
    cambio: cambioPendiente(dia, pid), recibido: e?.recibidaMin != null ? { hora: hm(e.recibidaMin) } : null, version: Number(l.version ?? 0), coordinador,
  };

  if (l.rol === "a_cargo") {
    const c = Number(l.cuadrilla_odoo_id);
    const h = hojaDeCuadrilla(dia, c);
    const anuladoPorRol = !!l.anulado_at && /rol|a cargo/i.test(String(l.anulado_motivo ?? ""));
    if (l.anulado_at && !anuladoPorRol) return { vista: { situacion: "invalido" }, link: l };
    if (!h || recibeDe(dia, c) !== pid || anuladoPorRol) {
      const otro = h ? recibeDe(dia, c) : null;
      return { vista: vencidoTxt(`El ${diaSemana(fecha)} ${Number(fecha.slice(8))} la ${cNombre(dia, c)} la tiene ${otro ? nombreDe(dia, otro) : "otra persona"}. Si es un error, llamá a ${coordinador.nombre}.`), link: l };
    }
    const sus = suspendida(dia, c);
    if (sus) return { vista: { ...comun, situacion: "suspendida", texto: `Suspendida · ${sus}. No hay que ir. Cualquier duda, llamá a ${coordinador.nombre}.` }, link: l };
    const aCargo = aCargoDe(h);
    const ll = dia.viajes.find((v) => v.hojaId === h.id && v.tipo === "lleva" && v.estado !== "anulado");
    const bu = dia.viajes.find((v) => v.hojaId === h.id && v.tipo === "busca" && v.estado !== "anulado");
    const chLleva = ll ? choferDe(dia, ll) : h.choferId;
    const ultima = obrasCon(dia, c).at(-1)?.o.corto ?? "";
    const chofer = h.modo === "sin" ? { modo: "sin", texto: "Van por su cuenta", nombre: null, telefono: null }
      : h.modo === "todo_el_dia" ? { modo: "todo_el_dia", texto: `${nombreDe(dia, h.choferId)} queda todo el día${h.vehiculoId ? ` con el ${vehiculoNombre(dia, h.vehiculoId)}` : ""}`, nombre: nombreDe(dia, h.choferId), telefono: tel(dia, h.choferId) }
      : { modo: "lleva_trae", texto: `Te lleva ${nombreDe(dia, chLleva) || "un chofer"}${h.vehiculoId ? ` · ${vehiculoNombre(dia, ll?.vehiculoId ?? h.vehiculoId)}` : ""}${bu ? `\nLos busca a las ${normHora(bu.hora)} en ${ultima}` : "\nVuelven por su cuenta"}`, nombre: nombreDe(dia, chLleva), telefono: tel(dia, chLleva) };
    const primero = e?.snapRecibido?.tipo === "hoja" ? e.snapRecibido : e?.snapPrimero?.tipo === "hoja" ? e.snapPrimero : null;
    const gente = genteDe(h).map((p) => ({ nombre: nombreDe(dia, p), telefono: tel(dia, p), aCargo: p === aCargo, nota: h.integrantes.find((i) => i.personaId === p)?.nota ?? null, nuevo: !!primero && !primero.gente.includes(p) && !!comun.cambio }));
    if (h.modo === "todo_el_dia" && h.choferId) gente.push({ nombre: `${nombreDe(dia, h.choferId)} (chofer)`, telefono: tel(dia, h.choferId), aCargo: false, nota: null, nuevo: false });
    return {
      vista: {
        ...comun, situacion: "ok", rol: "a_cargo", cuadrilla: cNombre(dia, c), aCargo: aCargo ? nombreDe(dia, aCargo) : null, vos: aCargo === pid,
        nota: h.nota, encuentro: encTxt(dia, c), chofer, obras: await obrasPublicas(dia, c, token, ahora), gente,
      },
      link: l,
    };
  }

  // Chofer.
  if (l.anulado_at) return { vista: { situacion: "invalido" }, link: l };
  const vs = viajesChofer(dia, pid);
  const td = todoDe(dia, pid)[0] ?? null;
  const visto = e?.snapRecibido?.tipo === "chofer" ? e.snapRecibido : null;
  const vehId = vs[0]?.vehiculoId ?? (td != null ? hojaDeCuadrilla(dia, td)?.vehiculoId : null) ?? null;
  const viajes: ViajePublico[] = vs.map((v: ViajeCalc) => {
    const p = pedidosDeViaje(dia, v.id)[0] ?? null;
    const destino = lugar(dia, v.haciaEf);
    const c = v.cuadrillaOdooId;
    const capataz = c != null ? recibeDe(dia, c) : null;
    const llamarA = p?.pidioId ?? capataz;
    const telL = llamarA ? tel(dia, llamarA) : destino.telefono;
    return {
      id: v.id, i: v.i, hora: horaTxt(v), horaFija: !!v.hora, texto: textoViaje(dia, v, true), desde: v.desde ? lugar(dia, v.desde).n : null,
      hacia: destino.n, direccion: destino.dir, mapsUrl: maps(destino.dir ?? (destino.obra ? destino.n : null)), carga: v.carga,
      pidio: p?.pidioId ? nombreDe(dia, p.pidioId) : null,
      llamar: telL ? { nombre: llamarA ? nombreDe(dia, llamarA) : destino.n, telefono: telL } : null,
      estado: v.estado, hechoHora: v.hechoMin != null ? hm(v.hechoMin) : null, motivo: v.noPudoMotivo,
      nuevo: !!visto && !visto.viajes.some((x) => x.k === v.id), foto: v.foto,
    };
  });
  return {
    vista: {
      ...comun, situacion: "ok", rol: "chofer", vehiculo: vehId ? vehiculoNombre(dia, vehId) : null,
      todo: td != null ? { cuadrilla: cNombre(dia, td), aCargo: nombreDe(dia, aCargoDe(hojaDeCuadrilla(dia, td))) || null, encuentro: encTxt(dia, td), obras: await obrasPublicas(dia, td, token, ahora) } : null,
      viajes, ahoraId: vs.find((v) => v.estado === "planeado")?.id ?? null, motivosNoPude: dia.parametros.motivosNoPude,
    },
    link: l,
  };
}

/** Que abrió el link: "Abierta 20:15" en el escritorio. Nunca tira. */
export async function anotarVista(l: Fila): Promise<void> {
  try {
    const adm = createAdminClient();
    const v: Fila = { ultima_vista_at: ts(), version_vista: l.version };
    const primeraDesdeCambio = !l.abierta_at || (l.cambio_at && String(l.abierta_at) < String(l.cambio_at));
    if (l.enviada_at && primeraDesdeCambio) v.abierta_at = ts();
    await adm.from("hd_links").update(v).eq("id", l.id);
    if (v.abierta_at) await avisarPantallas(String(l.fecha), "abrió su hoja");
  } catch (e) {
    console.error("[hoja-dia] no se pudo anotar que abrió el link", e instanceof Error ? e.message : e);
  }
}

// ═══════════════════════════ Lo que se toca en el celular ═════════════════════

export type AccionPublica =
  | { accion: "recibido" | "entendido" }
  | { accion: "hecho" | "deshacer"; viajeId: string }
  | { accion: "no_pude"; viajeId: string; motivo: string };

/** Cuándo se tocó: el que manda el celular (sin señal llega después) si es creíble; si no, ahora. */
function instante(at: string | null | undefined): string {
  const t = at ? Date.parse(at) : NaN;
  const now = Date.now();
  return Number.isFinite(t) && t <= now + 60_000 && t >= now - 12 * 3_600_000 ? new Date(Math.min(t, now)).toISOString() : new Date(now).toISOString();
}

/** "Recibido" / "Entendido": vale para la versión que tenía delante. */
export async function confirmarRecibido(l: Fila, at: string, origen: "link" | "telegram"): Promise<string> {
  const adm = createAdminClient();
  const g = grabador(adm);
  await g.actualizar("hd_links", String(l.id), { recibida_at: at, version_recibida: l.version, snap_recibido: l.snap as Foto, ...(l.abierta_at ? {} : { abierta_at: at }) });
  const fecha = String(l.fecha);
  const nombre = await nombreDeLink(l);
  const entendido = !!l.cambio_at;
  const texto = `${nombre}: ${entendido ? "entendido" : "recibido"} ${hm(minutosDesde(fecha, at))}`;
  await anotar(adm, null, { fecha, entidad: "link", entidadId: String(l.id), accion: entendido ? "entendido" : "recibido", texto, origen, porTexto: nombre }, g.cambios);
  await avisarPantallas(fecha, entendido ? "entendió el cambio" : "tocó Recibido", nombre);
  return texto;
}

async function nombreDeLink(l: Fila): Promise<string> {
  const adm = createAdminClient();
  const t = l.persona_id ? "personal" : "pan_personas_externas";
  const r = await adm.from(t).select("apellido").eq("id", l.persona_id ?? l.externa_id).maybeSingle();
  return r.data ? cap(String(r.data.apellido).toLowerCase()) : "El chofer";
}

/** El viaje, si es de este chofer y de este día. Si no, null (no se toca nada). */
async function viajeDelChofer(l: Fila, viajeId: string): Promise<Fila | null> {
  if (l.rol !== "chofer") return null;
  const adm = createAdminClient();
  const v = await adm.from("hd_viajes").select("*").eq("id", viajeId).maybeSingle();
  if (!v.data || v.data.fecha !== l.fecha) return null;
  const pid = String(l.persona_id ?? l.externa_id);
  if (v.data.chofer_id === pid) return v.data;
  if (v.data.chofer_id) return null;
  const cam = await adm.from("hd_camiones_dia").select("chofer_id, sin_chofer").eq("fecha", l.fecha).eq("vehiculo_id", v.data.vehiculo_id).maybeSingle();
  const hab = await adm.from("vehiculos").select("chofer_habitual_id").eq("id", v.data.vehiculo_id).maybeSingle();
  const ch = cam.data ? (cam.data.sin_chofer ? null : cam.data.chofer_id) : hab.data?.chofer_habitual_id;
  return ch === pid ? v.data : null;
}

export async function marcarViajeDesdeChofer(l: Fila, viajeId: string, que: "hecho" | "no_pude" | "deshacer", motivo: string | null, at: string, origen: "link" | "telegram"): Promise<string> {
  const v = await viajeDelChofer(l, viajeId);
  if (!v) throw new Error("Ese viaje no es tuyo.");
  const adm = createAdminClient();
  const g = grabador(adm);
  const fecha = String(l.fecha);
  const nombre = await nombreDeLink(l);
  const hora = hm(minutosDesde(fecha, at));
  let texto: string;
  if (que === "hecho") { await marcarHecho(g, v, "chofer", at); texto = `${nombre}: hecho ${hora}`; }
  else if (que === "no_pude") { await marcarNoPude(g, v, motivo ?? "Otro (te llamo)", at); texto = `${nombre} no pudo (${hora}): ${lowFirst(motivo ?? "")}`; }
  else {
    // El "Deshacer" de 10 segundos: sólo lo que marcó él, y hace poco.
    if (v.hecho_por && v.hecho_por !== "chofer") throw new Error("Eso lo marcó la oficina.");
    if (v.hecho_at && Date.now() - Date.parse(String(v.hecho_at)) > 15 * 60_000) throw new Error("Pasó mucho tiempo: llamá a la oficina.");
    await deshacerEstadoViaje(g, v);
    texto = `${nombre} deshizo lo que marcó`;
  }
  await anotar(adm, null, { fecha, entidad: "viaje", entidadId: viajeId, viajeId, accion: que, texto, origen, porTexto: nombre }, g.cambios);
  await avisarPantallas(fecha, que === "hecho" ? "marcó Hecho" : que === "no_pude" ? "marcó No pude" : "deshizo un viaje", nombre);
  return texto;
}

/** POST del link. Límite simple: 30 toques por minuto por token. */
export async function accionPublica(token: string, a: AccionPublica, at?: string | null): Promise<{ ok: true; texto: string } | { ok: false; error: string; status: number }> {
  if (!tokenValido(token)) return { ok: false, error: "El link no es válido.", status: 404 };
  const adm = createAdminClient();
  const r = await adm.from("hd_links").select("*").eq("token", token).maybeSingle();
  const l = r.data;
  if (!l || l.anulado_at) return { ok: false, error: "El link no es válido.", status: 404 };
  if (situacionLink({ fecha: String(l.fecha), expira_at: String(l.expira_at), anulado_at: null }) === "vencido") return { ok: false, error: "Este link ya venció.", status: 410 };
  const ventana = l.pedidos_ventana ? Date.parse(String(l.pedidos_ventana)) : 0;
  const n = Date.now() - ventana < 60_000 ? Number(l.pedidos_n ?? 0) + 1 : 1;
  if (n > 30) return { ok: false, error: "Demasiados toques seguidos: esperá un minuto.", status: 429 };
  await adm.from("hd_links").update(n === 1 ? { pedidos_ventana: ts(), pedidos_n: 1 } : { pedidos_n: n }).eq("id", l.id);
  const cuando = instante(at);
  try {
    if (a.accion === "recibido" || a.accion === "entendido") {
      const texto = await confirmarRecibido(l, cuando, "link");
      await marcarMensajesTelegram(String(l.id), (min) => (l.cambio_at ? TELEGRAM.entendido(min) : TELEGRAM.recibido(min)), String(l.fecha), cuando);
      return { ok: true, texto };
    }
    const b = a as Exclude<AccionPublica, { accion: "recibido" | "entendido" }>;
    return { ok: true, texto: await marcarViajeDesdeChofer(l, b.viajeId, b.accion, b.accion === "no_pude" ? b.motivo : null, cuando, "link") };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e), status: 403 };
  }
}

/** Saca el botón "Recibido" de los mensajes de Telegram de ese link cuando se confirmó por el link. */
async function marcarMensajesTelegram(linkId: string, texto: (min: number) => string, fecha: Fecha, at: string): Promise<void> {
  try {
    const adm = createAdminClient();
    const r = await adm.from("hd_telegram_mensajes").select("id, chat_id, message_id, texto, botones").eq("link_id", linkId).eq("ok", true).is("respondido_at", null).in("tipo", ["hoja", "cambio", "viaje_nuevo"]);
    for (const m of r.data ?? []) {
      if (!m.message_id) continue;
      const urlBotones = ((m.botones as Teclado) ?? []).filter((f) => f.some((b) => b.url));
      await editarMensaje(Number(m.chat_id), Number(m.message_id), `${m.texto}\n\n${texto(minutosDesde(fecha, at))}`, urlBotones);
      await adm.from("hd_telegram_mensajes").update({ respondido_at: at, respuesta: "recibido", editado_at: ts() }).eq("id", m.id);
    }
  } catch (e) {
    console.error("[hoja-dia] no se pudo editar el mensaje de Telegram", e instanceof Error ? e.message : e);
  }
}

// ═══════════════════════════ Archivos de la OT ════════════════════════════════

/** ¿Este adjunto es de una OT de la hoja (o de los viajes) de este token? */
export async function archivoPermitido(token: string, adjuntoId: number): Promise<boolean> {
  const { vista } = await vistaPublica(token);
  if (vista.situacion !== "ok") return false;
  const obras = vista.rol === "a_cargo" ? vista.obras : vista.todo?.obras ?? [];
  return obras.some((o) => o.archivos.some((x) => x.id === adjuntoId));
}

// ═══════════════════════════ Webhook de Telegram ══════════════════════════════

type UpdateTelegram = {
  update_id: number;
  message?: { message_id: number; text?: string; chat: { id: number; type: string }; from?: { id: number; username?: string; first_name?: string } };
  callback_query?: { id: string; data?: string; from: { id: number; username?: string }; message?: { message_id: number; text?: string; chat: { id: number }; reply_markup?: { inline_keyboard: Teclado } } };
};

/** La persona de un chat de Telegram (Legajos o externa). */
async function personaDeChat(chat: number): Promise<{ id: string; tabla: "personal" | "pan_personas_externas"; apellido: string } | null> {
  const adm = createAdminClient();
  for (const tabla of ["personal", "pan_personas_externas"] as const) {
    const r = await adm.from(tabla).select("id, apellido").eq("telegram_chat_id", chat).maybeSingle();
    if (r.data) return { id: String(r.data.id), tabla, apellido: String(r.data.apellido) };
  }
  return null;
}
const nombreCorto = (apellido: string) => cap(apellido.toLowerCase().replace(/(^|\s)\S/g, (x) => x.toUpperCase()).trim());

/**
 * Un update del webhook. IDEMPOTENTE: Telegram reintenta si no contestamos a tiempo, y el
 * update_id se anota antes de hacer nada (si ya estaba, no se repite). Lo que hace queda
 * en el historial.
 */
export async function procesarUpdate(u: UpdateTelegram): Promise<void> {
  const adm = createAdminClient();
  const nuevo = await adm.from("hd_telegram_updates").insert({ update_id: u.update_id, tipo: u.callback_query ? "boton" : u.message ? "mensaje" : "otro" });
  if (nuevo.error) return; // ya procesado (o no se pudo anotar: mejor no repetir)
  const coord = (await adm.from("hd_parametros").select("valor").eq("clave", "coordinador").maybeSingle()).data?.valor as { nombre?: string } | undefined;
  const coordinador = coord?.nombre ?? "la oficina";

  if (u.message?.text != null && u.message.chat.type === "private") {
    const chat = u.message.chat.id;
    const codigo = leerStart(u.message.text);
    if (codigo == null) return;
    const ya = await personaDeChat(chat);
    if (!codigo) { await enviarMensaje(chat, ya ? TELEGRAM.yaVinculado(nombreCorto(ya.apellido)) : TELEGRAM.sinCodigo(coordinador)); return; }
    if (!codigoValido(codigo)) { await enviarMensaje(chat, TELEGRAM.codigoInvalido(coordinador)); return; }
    const c = await adm.from("hd_telegram_codigos").select("*").eq("codigo", codigo).maybeSingle();
    if (!c.data || c.data.usado_at || Date.parse(String(c.data.expira_at)) < Date.now()) { await enviarMensaje(chat, TELEGRAM.codigoInvalido(coordinador)); return; }
    const tabla = c.data.persona_id ? "personal" : "pan_personas_externas";
    const pid = String(c.data.persona_id ?? c.data.externa_id);
    // Un chat, una persona: si el chat estaba en otro legajo (un teléfono que cambió de mano), se suelta.
    await adm.from("personal").update({ telegram_chat_id: null, telegram_usuario: null, telegram_vinculado_at: null }).eq("telegram_chat_id", chat).neq("id", pid);
    await adm.from("pan_personas_externas").update({ telegram_chat_id: null, telegram_usuario: null, telegram_vinculado_at: null }).eq("telegram_chat_id", chat).neq("id", pid);
    const p = await adm.from(tabla).update({ telegram_chat_id: chat, telegram_usuario: u.message.from?.username ?? null, telegram_vinculado_at: ts() }).eq("id", pid).select("apellido").single();
    await adm.from("hd_telegram_codigos").update({ usado_at: ts(), chat_id: chat }).eq("codigo", codigo);
    const nombre = nombreCorto(String(p.data?.apellido ?? ""));
    const r = await enviarMensaje(chat, TELEGRAM.vinculado(nombre));
    await adm.from("hd_telegram_mensajes").insert({ [c.data.persona_id ? "persona_id" : "externa_id"]: pid, chat_id: chat, message_id: r.ok ? r.result.message_id : null, tipo: "vinculado", texto: TELEGRAM.vinculado(nombre), ok: r.ok, error: r.ok ? null : r.error });
    await anotar(adm, null, { fecha: null, entidad: "telegram", entidadId: pid, accion: "vinculado", texto: `${nombre} vinculó su Telegram`, origen: "telegram", porTexto: nombre });
    return;
  }

  const q = u.callback_query;
  if (!q) return;
  const cb = decodificar(q.data);
  const chat = q.message?.chat.id ?? q.from.id;
  const mid = q.message?.message_id ?? null;
  const textoMsj = q.message?.text ?? "";
  const urlBotones = (q.message?.reply_markup?.inline_keyboard ?? []).filter((f) => f.some((b) => b.url));
  if (!cb) { await contestarBoton(q.id); return; }
  const quien = await personaDeChat(chat);
  if (!quien) { await contestarBoton(q.id, TELEGRAM.otroChat); return; }
  const at = ts();

  try {
    if (cb.a === "recibido" || cb.a === "entendido") {
      const l = (await adm.from("hd_links").select("*").eq("id", cb.link).maybeSingle()).data;
      if (!l || String(l.persona_id ?? l.externa_id) !== quien.id) { await contestarBoton(q.id, TELEGRAM.otroChat); return; }
      if (l.anulado_at || situacionLink({ fecha: String(l.fecha), expira_at: String(l.expira_at), anulado_at: null }) === "vencido") { await contestarBoton(q.id, TELEGRAM.linkVencido(coordinador)); return; }
      await confirmarRecibido(l, at, "telegram");
      const min = minutosDesde(String(l.fecha), at);
      const marca = cb.a === "entendido" ? TELEGRAM.entendido(min) : TELEGRAM.recibido(min);
      if (mid) await editarMensaje(chat, mid, `${textoMsj}\n\n${marca}`, urlBotones);
      await adm.from("hd_telegram_mensajes").update({ respondido_at: at, respuesta: cb.a, editado_at: at }).eq("chat_id", chat).eq("message_id", mid ?? -1);
      await contestarBoton(q.id, marca);
      return;
    }
    const v = (await adm.from("hd_viajes").select("id, fecha").eq("id", cb.viaje).maybeSingle()).data;
    if (!v) { await contestarBoton(q.id, "Ese viaje ya no existe."); return; }
    const l = (await adm.from("hd_links").select("*").eq("fecha", v.fecha).eq(quien.tabla === "personal" ? "persona_id" : "externa_id", quien.id).is("anulado_at", null).maybeSingle()).data;
    if (!l) { await contestarBoton(q.id, TELEGRAM.otroChat); return; }
    const fecha = String(v.fecha);
    const motivos = ((await adm.from("hd_parametros").select("valor").eq("clave", "motivos_no_pude").maybeSingle()).data?.valor as string[] | undefined) ?? ["No estaba listo", "Estaba cerrado", "No había nadie para recibir", "No entra en el camión", "Problema con el camión", "Otro (te llamo)"];
    if (cb.a === "no_pude") { if (mid) await editarBotones(chat, mid, tecladoMotivos(cb.viaje, motivos)); await contestarBoton(q.id, TELEGRAM.elegiMotivo); return; }
    if (cb.a === "volver") { if (mid) await editarBotones(chat, mid, [...tecladoViaje(null, cb.viaje), ...urlBotones]); await contestarBoton(q.id); return; }
    const min = minutosDesde(fecha, at);
    if (cb.a === "hecho") {
      await marcarViajeDesdeChofer(l, cb.viaje, "hecho", null, at, "telegram");
      if (mid) await editarMensaje(chat, mid, `${textoMsj}\n\n${TELEGRAM.hecho(min)}`, urlBotones);
      await contestarBoton(q.id, TELEGRAM.hecho(min));
    } else {
      const motivo = motivos[cb.i] ?? "Otro (te llamo)";
      await marcarViajeDesdeChofer(l, cb.viaje, "no_pude", motivo, at, "telegram");
      if (mid) await editarMensaje(chat, mid, `${textoMsj}\n\n${TELEGRAM.noPude(min, motivo)}\n${TELEGRAM.noPudeListo(coordinador)}`, urlBotones);
      await contestarBoton(q.id, TELEGRAM.noPudeListo(coordinador));
    }
    await adm.from("hd_telegram_mensajes").update({ respondido_at: at, respuesta: cb.a === "hecho" ? "hecho" : `no_pude`, editado_at: at }).eq("chat_id", chat).eq("message_id", mid ?? -1);
  } catch (e) {
    await contestarBoton(q.id, e instanceof Error ? e.message.slice(0, 180) : "No se pudo.");
  }
}

// Reexport para las rutas.
export { esHoy, ddmm };
