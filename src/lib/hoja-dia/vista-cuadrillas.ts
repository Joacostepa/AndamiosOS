// Lo que la vista Cuadrillas de la Hoja del día dice en palabras y no está en estado.ts:
// la línea del chofer de la tarjeta, la del material, las opciones de los selectores de
// chofer y vehículo, el autocompletar de "+ Agregar", los textos del panel Gente, las
// opciones de "No viene…" y el resumen de las instrucciones.
//
// PURO (sin React ni servidor), como estado.ts, y con tests (vista-cuadrillas.test.ts).
// Los textos son los de la maqueta aprobada (renderEsc / cardHTML / genteHTML / menuHTML).

import type { Ausencia, DiaHoja, Fecha, Hoja, ModoChofer, Viaje } from "./tipos.ts";
import { TIPO_AUSENCIA_TXT } from "./tipos.ts";
import {
  addDia, aCargoDe, ausenciaDe, calcVeh, choferDe, cNombre, cuadrilla, cuadrillasActivas, ddmm, diaSemana, encTxt, esHoy,
  genteDe, hm, hojaDe, hojaDeCuadrilla, horaTxt, laC, lugar, nombreDe, normalizar, normHora, nuevosEnHoja, obrasCon,
  obrasDe, panelGente, parcialDe, patente, persona, prevista, recibeDe, todoDe, todoVeh, vanDe, vehiculo, viajeCalc,
  viajesCalc, viajesChofer, choferDelCamion, vencimientosTxt, type ViajeCalc,
} from "./estado.ts";

const N = (dia: DiaHoja, id: string | null | undefined) => nombreDe(dia, id);

/** El número de la cuadrilla (las teclas 1–5) o null si no tiene. */
export const numeroDe = (dia: DiaHoja, c: number) => cuadrilla(dia, c)?.numero ?? null;
/** La cuadrilla activa de la tecla `n` (1–9). */
export const cuadrillaDeTecla = (dia: DiaHoja, n: number) => cuadrillasActivas(dia).find((c) => numeroDe(dia, c) === n) ?? null;

/** Los viajes de cuadrilla (lleva, busca, mueve) de una hoja, sin los anulados. */
export function viajesDeHoja(dia: DiaHoja, h: Hoja): Viaje[] {
  return dia.viajes.filter((v) => v.hojaId === h.id && v.estado !== "anulado" && (v.tipo === "lleva" || v.tipo === "busca" || v.tipo === "mueve"));
}
const deTipo = (dia: DiaHoja, h: Hoja, t: "lleva" | "busca") => viajesDeHoja(dia, h).find((v) => v.tipo === t) ?? null;
const horaDeViaje = (dia: DiaHoja, v: Viaje) => {
  const c = viajeCalc(dia, v.id);
  return c ? horaTxt(c) : normHora(v.hora) ?? "";
};

/** Un pedazo de texto; `mono` para patentes. */
export type Trozo = { t: string; mono?: boolean };

/**
 * La línea del chofer de la tarjeta (resumenChofer de la maqueta):
 * "Sin chofer · van por su cuenta", "Todo el día · Borda · hidrogrúa AB 831 LC",
 * "Lleva y trae · Kiska · AF 669 ZL · 7:45 → 16:30".
 */
export function resumenChofer(dia: DiaHoja, c: number): { k: string; resto: Trozo[] } {
  const h = hojaDeCuadrilla(dia, c);
  if (!h || h.modo === "sin") return { k: "Sin chofer", resto: [{ t: " · van por su cuenta" }] };
  const vp: Trozo[] = h.vehiculoId ? [{ t: patente(dia, h.vehiculoId), mono: true }] : [{ t: "sin vehículo" }];
  if (h.modo === "todo_el_dia") {
    const hidro = h.vehiculoId && vehiculo(dia, h.vehiculoId)?.tipo === "hidrogrua" ? "hidrogrúa " : "";
    return { k: "Todo el día", resto: [{ t: ` · ${h.choferId ? N(dia, h.choferId) : "sin chofer"} · ${hidro}` }, ...vp] };
  }
  const ll = deTipo(dia, h, "lleva");
  const bu = deTipo(dia, h, "busca");
  const llevaTxt = ll && !ll.vehiculoId && !ll.fleteExterno ? "nadie los lleva" : ll ? horaDeViaje(dia, ll) : normHora(h.encuentro.hora) ?? "";
  let buscaTxt: string;
  if (!bu) buscaTxt = "vuelven solos";
  else if (!bu.vehiculoId && !bu.fleteExterno) buscaTxt = "nadie los busca";
  else {
    const ch = choferDe(dia, bu);
    buscaTxt = ch && ch !== h.choferId ? `${horaDeViaje(dia, bu)} (${N(dia, ch)})` : horaDeViaje(dia, bu);
  }
  return { k: "Lleva y trae", resto: [{ t: ` · ${h.choferId ? N(dia, h.choferId) : "sin chofer"} · ` }, ...vp, { t: ` · ${llevaTxt} → ${buscaTxt}` }] };
}

/** Las horas que muestra el editor de "Lleva y trae": la del lleva, la del busca (null = vuelven solos) y los mueve. */
export function horasLlevaTrae(dia: DiaHoja, c: number): { lleva: string; busca: string | null; carga: string | null; mueve: { v: Viaje; dir: string; hora: string }[] } {
  const h = hojaDeCuadrilla(dia, c);
  if (!h) return { lleva: "", busca: null, carga: null, mueve: [] };
  const ll = deTipo(dia, h, "lleva");
  const bu = deTipo(dia, h, "busca");
  const mueve = viajesDeHoja(dia, h).filter((v) => v.tipo === "mueve").map((v) => ({ v, dir: lugar(dia, v.hacia).n, hora: horaDeViaje(dia, v).replace(/^~/, "") }));
  return {
    lleva: (ll ? horaDeViaje(dia, ll) : normHora(h.encuentro.hora) ?? "").replace(/^~/, ""),
    busca: bu ? horaDeViaje(dia, bu).replace(/^~/, "") : null,
    carga: ll?.carga ?? null,
    mueve,
  };
}

/** "Material: Gómez trae ~10:15 (Juramento)" — los viajes de material a las obras de la cuadrilla. */
export function materialDe(dia: DiaHoja, c: number): string | null {
  const ots = new Set(obrasDe(dia, c).map((o) => o.otId));
  const varias = ots.size > 1;
  const vs = viajesCalc(dia).filter((v) => (v.tipo === "lleva_material" || v.tipo === "trae_material") && v.haciaEf.otId != null && ots.has(v.haciaEf.otId));
  if (!vs.length) return null;
  return `Material: ${vs.map((v: ViajeCalc) => {
    const quien = v.fleteExterno ?? N(dia, choferDe(dia, v));
    const hora = v.estado === "hecho" && v.hechoMin != null ? `✓ ${hm(v.hechoMin)}` : horaTxt(v);
    return `${quien} ${v.tipo === "trae_material" ? "trae" : "lleva"} ${hora}${varias ? ` (${lugar(dia, v.haciaEf).corto})` : ""}`;
  }).join(" · ")}`;
}

/** La persona es del plantel base de otra cuadrilla ("de la 3"). */
function baseDe(dia: DiaHoja, pid: string): number | null {
  const c = dia.cuadrillas.find((x) => x.plantel?.personaIds.includes(pid));
  return c ? c.odooId : null;
}

export type Chip = { pid: string; nombre: string; tag: string | null; aCargo: boolean; ausente: boolean; nuevo: boolean };

/** Los nombres de la tarjeta, el que está a cargo primero, con su marca. */
export function chipsDe(dia: DiaHoja, c: number): Chip[] {
  const h = hojaDeCuadrilla(dia, c);
  if (!h) return [];
  const cargo = aCargoDe(h);
  const nuevos = nuevosEnHoja(dia, c);
  return genteDe(h).map((pid) => {
    const a = ausenciaDe(dia, pid);
    const base = baseDe(dia, pid);
    const nuevo = nuevos.includes(pid);
    const tag = a ? "no viene" : pid === cargo ? "a cargo" : nuevo ? "nuevo" : base != null && base !== c ? `de ${laC(dia, base)}` : null;
    return { pid, nombre: N(dia, pid), tag, aCargo: pid === cargo, ausente: !!a, nuevo };
  });
}

/** "Quiénes van 5 de 5 (con Borda)". */
export function quienesVan(dia: DiaHoja, c: number): { van: number; prevista: number; con: string | null } {
  const h = hojaDeCuadrilla(dia, c);
  return { van: vanDe(dia, c), prevista: prevista(dia, c), con: h && h.modo === "todo_el_dia" && h.choferId ? N(dia, h.choferId) : null };
}

export type Opcion = { value: string; label: string; aviso?: boolean };

/** El selector de chofer (choferOpts): "Kiska · lleva a la 3 · 6 viajes", "Gómez · libre". */
export function opcionesChofer(dia: DiaHoja, c: number): Opcion[] {
  const h = hojaDeCuadrilla(dia, c);
  const sel = h?.choferId ?? null;
  return panelGente(dia).choferes.map(({ pid: ch }) => {
    const td = todoDe(dia, ch).filter((x) => x !== c);
    const vs = viajesChofer(dia, ch).filter((v) => v.hojaId !== h?.id);
    const a = ausenciaDe(dia, ch);
    const pa = parcialDe(dia, ch);
    const cs = [...new Set(vs.map((v) => v.cuadrillaOdooId ?? (v.hojaId ? dia.hojas.find((x) => x.id === v.hojaId)?.cuadrillaOdooId ?? null : null)).filter((x): x is number => x != null))];
    const s = sel === ch ? "con esta cuadrilla"
      : a ? `no viene (${TIPO_AUSENCIA_TXT[a.tipo]})`
      : td.length ? `todo el día con ${laC(dia, td[0])}`
      : cs.length ? `lleva a ${cs.map((x) => laC(dia, x)).join(" y ")}${vs.length > cs.length * 2 ? ` · ${vs.length} viajes` : ""}`
      : vs.length ? `${vs.length} viajes` : "libre";
    const par = pa ? ` · ${pa.horaHasta ? `se retira ${normHora(pa.horaHasta)}` : `llega ${normHora(pa.horaDesde)}`}` : "";
    return { value: ch, label: `${N(dia, ch)} · ${s}${par}`, aviso: !!a || td.length > 0 };
  });
}

const TIPO_VEH: Record<string, string> = { camion: "camión", camioneta: "camioneta", hidrogrua: "hidrogrúa", utilitario: "utilitario", otro: "otro" };

/** El selector de vehículo (vehOpts): "AF 669 ZL · camión · lo maneja Kiska". */
export function opcionesVehiculo(dia: DiaHoja, c: number): Opcion[] {
  const h = hojaDeCuadrilla(dia, c);
  const sel = h?.vehiculoId ?? null;
  return dia.vehiculos.map((V) => {
    const con = cuadrillasActivas(dia).filter((x) => x !== c && hojaDeCuadrilla(dia, x)!.vehiculoId === V.id && hojaDeCuadrilla(dia, x)!.modo !== "sin");
    const ch = choferDelCamion(dia, V.id);
    const venc = vencimientosTxt(dia, V.id)[0];
    const s = sel === V.id ? "con esta cuadrilla" : venc ? "VTV vencida" : con.length ? `con ${con.map((x) => laC(dia, x)).join(" y ")}` : ch ? `lo maneja ${N(dia, ch)}` : "sin chofer";
    return { value: V.id, label: `${V.patente} · ${TIPO_VEH[V.tipo] ?? V.tipo} · ${s}`, aviso: !!venc };
  });
}

export type Sugerencia = { pid: string; nombre: string; s: string; deshabilitada: boolean };

/** El autocompletar de "+ Agregar" (sugHTML): hasta 6, primero los sin asignar que empiezan así. */
export function sugerenciasAgregar(dia: DiaHoja, c: number, q: string): Sugerencia[] {
  const n = normalizar(q.trim());
  if (!n) return [];
  const rank = (pid: string, nom: string) =>
    (hojaDe(dia, pid) === c ? 9 : ausenciaDe(dia, pid) ? 8 : hojaDe(dia, pid) != null ? 2 : 0) + (normalizar(nom).startsWith(n) ? 0 : 1);
  return dia.personas
    .filter((p) => p.activo && !p.esChofer && normalizar(p.nombre).includes(n))
    .sort((a, b) => rank(a.id, a.nombre) - rank(b.id, b.nombre) || a.nombre.localeCompare(b.nombre, "es"))
    .slice(0, 6)
    .map((p) => {
      const de = hojaDe(dia, p.id);
      const a = ausenciaDe(dia, p.id);
      const s = de === c ? "ya está acá" : a ? `no viene (${TIPO_AUSENCIA_TXT[a.tipo]})` : de != null ? `está en ${laC(dia, de)}` : "sin asignar";
      return { pid: p.id, nombre: p.nombre, s, deshabilitada: de === c || !!a };
    });
}

/** El viernes de esa semana (o el mismo día si ya es viernes o sábado: no hay "hasta el viernes"). */
export function ultimoViernes(fecha: Fecha): Fecha {
  const d = new Date(`${fecha}T12:00:00Z`).getUTCDay();
  return addDia(fecha, (5 - d + 7) % 7);
}

/** Las opciones de "¿Hasta cuándo?" de "No viene…" (el último día incluido). */
export function opcionesHasta(fecha: Fecha, ahora: number): { l: string; hasta: Fecha }[] {
  const vie = ultimoViernes(fecha);
  const out = [{ l: `Sólo ${esHoy(ahora) ? "hoy" : `el ${diaSemana(fecha)}`}`, hasta: fecha }];
  if (vie !== fecha) out.push({ l: `Hasta el viernes ${ddmm(vie)}`, hasta: vie });
  out.push({ l: "1 semana", hasta: addDia(fecha, 6) });
  return out;
}

/** La línea de "No disponibles" del panel Gente. */
export function textoNoDisponible(dia: DiaHoja, a: Ausencia): string {
  const tipo = TIPO_AUSENCIA_TXT[a.tipo];
  if (a.horaDesde || a.horaHasta) return `${a.horaHasta ? `se retira a las ${normHora(a.horaHasta)}` : `llega a las ${normHora(a.horaDesde)}`} · ${tipo}`;
  const vuelta = a.hasta ? (a.hasta === dia.fecha ? `sólo el ${diaSemana(dia.fecha)}` : `vuelve el ${ddmm(addDia(a.hasta, 1))}`) : "sin fecha de alta";
  return `${tipo} · ${vuelta}${a.origen === "asistencia" && a.id == null ? " (según la asistencia)" : ""}`;
}

/** Los que no vienen ese día (todo el día o parcial), para el panel. */
export function noDisponibles(dia: DiaHoja): { pid: string; nombre: string; txt: string }[] {
  return dia.personas
    .filter((p) => p.activo)
    .map((p) => ({ p, a: ausenciaDe(dia, p.id) ?? parcialDe(dia, p.id) }))
    .filter((x): x is { p: typeof x.p; a: Ausencia } => !!x.a)
    .map(({ p, a }) => ({ pid: p.id, nombre: p.nombre, txt: textoNoDisponible(dia, a) }));
}

/** La línea de un chofer en el panel (chofTxt): "6 viajes", "todo el día con la 1 · 1 viaje", "libre". */
export function textoChofer(dia: DiaHoja, ch: string): { t: string; tono: "" | "rojo" | "amb" } {
  const a = ausenciaDe(dia, ch);
  if (a) return { t: `no viene (${TIPO_AUSENCIA_TXT[a.tipo]})`, tono: "rojo" };
  const td = todoDe(dia, ch);
  const n = viajesChofer(dia, ch).filter((v) => !(v.hojaId && td.some((c) => hojaDeCuadrilla(dia, c)?.id === v.hojaId))).length;
  const partes: string[] = [];
  if (td.length) partes.push(`todo el día con ${td.map((c) => laC(dia, c)).join(" y ")}`);
  if (n) partes.push(`${n} ${n === 1 ? "viaje" : "viajes"}`);
  return { t: partes.join(" · ") || "libre", tono: td.length > 1 ? "amb" : "" };
}

/** La línea de un vehículo en el panel (vehTxt): "camión · Kiska · 6 viajes", "camión · VTV vencida desde el 02/10". */
export function textoVehiculo(dia: DiaHoja, vehId: string): { nombre: string; t: string; tono: "" | "amb" } {
  const V = vehiculo(dia, vehId)!;
  const tipo = TIPO_VEH[V.tipo] ?? V.tipo;
  const nombre = V.tipo === "camioneta" || V.tipo === "otro" ? [V.marca, V.modelo].filter(Boolean).join(" ") || V.patente : V.patente;
  if (V.estado === "en_taller" || V.estado === "fuera_servicio") return { nombre, t: `${tipo} · ${V.estado === "en_taller" ? "en el taller" : "fuera de servicio"}`, tono: "amb" };
  const venc = vencimientosTxt(dia, V.id)[0];
  if (venc) return { nombre, t: `${tipo} · ${venc.replace(/^El .+? tiene (la |el )?/, "")}`, tono: "amb" };
  const td = todoVeh(dia, V.id);
  const n = calcVeh(dia, V.id).length;
  const ch = choferDelCamion(dia, V.id);
  const resto = td != null ? `todo el día con ${laC(dia, td)}` : n ? `${N(dia, ch) || "sin chofer"} · ${n} ${n === 1 ? "viaje" : "viajes"}` : ch ? `${N(dia, ch)} · sin viajes` : "sin chofer";
  return { nombre, t: `${tipo} · ${resto}`, tono: "" };
}

/** Las instrucciones de la tarjeta: cuántas hay y la primera línea (o la nota). */
export function instruccionesDe(dia: DiaHoja, c: number): { n: number; lineas: { k: string | null; t: string }[] } {
  const h = hojaDeCuadrilla(dia, c);
  const ob = obrasCon(dia, c);
  const con = ob
    .map((x) => ({ x, ins: dia.instrucciones.find((i) => i.otId === x.o.otId) }))
    .filter(({ ins }) => ins && (ins.hoy || ins.chips.length || ins.horaInicio));
  const n = con.length + (h?.nota ? 1 : 0);
  const lineas: { k: string | null; t: string }[] = [];
  if (h?.nota) lineas.push({ k: "Nota:", t: h.nota });
  else if (con[0]) {
    const { x, ins } = con[0];
    const bits = [ins!.hoy, ...ins!.chips].filter(Boolean) as string[];
    lineas.push({ k: ob.length > 1 ? `${x.o.corto}:` : null, t: bits.join(" · ") || `hora ${normHora(ins!.horaInicio)}` });
  }
  return { n, lineas };
}

/** El diálogo "¿Lo pasás a la N?". */
export function textoMover(dia: DiaHoja, p: string, de: number, c: number, reemplaza: string | null): { titulo: string; texto: string } {
  const hDe = hojaDeCuadrilla(dia, de);
  const eraCargo = aCargoDe(hDe) === p;
  const num = numeroDe(dia, c);
  return {
    titulo: `${N(dia, p)} está en la ${cNombre(dia, de)}. ¿Lo pasás a ${num != null ? `la ${num}` : laC(dia, c)}?`,
    texto: `${reemplaza ? `Reemplaza a ${N(dia, reemplaza)}, que queda sin asignar. ` : ""}Una persona va en una sola cuadrilla por día.${eraCargo ? ` ${cap1(laC(dia, de))} queda sin nadie a cargo.` : ` ${cap1(laC(dia, de))} queda con ${vanDe(dia, de) - 1} de ${prevista(dia, de)}.`}`,
  };
}
const cap1 = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** El encabezado del menú de una persona: "Cuadrilla 3 · operario · 11 5555-0000". */
export function encabezadoPersona(dia: DiaHoja, c: number, p: string): string {
  const pr = persona(dia, p);
  const partes = [cNombre(dia, c), pr?.puesto ?? null, pr?.celular ?? "sin celular", ausenciaDe(dia, p) ? "no viene" : null].filter(Boolean);
  return partes.join(" · ");
}

/** Las ausencias de la hoja lateral: vigentes ese día, próximas y (si vienen) terminadas. */
export function ausenciasPorGrupo(dia: DiaHoja, terminadasGuardadas: Ausencia[] = []): { vigentes: Ausencia[]; proximas: Ausencia[]; terminadas: Ausencia[] } {
  const f = dia.fecha;
  const vigentes = dia.ausencias.filter((a) => a.desde <= f && (!a.hasta || a.hasta >= f));
  const proximas = dia.ausencias.filter((a) => a.desde > f).sort((a, b) => (a.desde < b.desde ? -1 : 1));
  const terminadas = terminadasGuardadas.filter((a) => a.hasta && a.hasta < f).sort((a, b) => (a.hasta! < b.hasta! ? 1 : -1));
  return { vigentes, proximas, terminadas };
}

/** "del 13/10 al 16/10", "sólo el 13/10", "desde el 13/10 · sin fecha de alta", "se retira a las 14:00 · 13/10". */
export function rangoAusencia(a: Ausencia): string {
  if (a.horaDesde || a.horaHasta) return `${a.horaHasta ? `se retira a las ${normHora(a.horaHasta)}` : `llega a las ${normHora(a.horaDesde)}`} · ${ddmm(a.desde)}`;
  if (!a.hasta) return `desde el ${ddmm(a.desde)} · sin fecha de alta`;
  if (a.hasta < a.desde) return `tenía ${TIPO_AUSENCIA_TXT[a.tipo]} desde el ${ddmm(a.desde)}; alta antes de empezar`;
  return a.hasta === a.desde ? `sólo el ${ddmm(a.desde)}` : `del ${ddmm(a.desde)} al ${ddmm(a.hasta)}`;
}

/** El modo que se ve en el selector de tres. */
export const MODOS: [ModoChofer, string][] = [["sin", "Sin chofer"], ["lleva_trae", "Lleva y trae"], ["todo_el_dia", "Todo el día"]];

/** A quién le llega la hoja (para "Lista para mandar · le llega a Sack"). */
export const recibe = (dia: DiaHoja, c: number) => recibeDe(dia, c);
/** Texto del encuentro (re-export para la vista). */
export const encuentroTxt = (dia: DiaHoja, c: number) => encTxt(dia, c);
