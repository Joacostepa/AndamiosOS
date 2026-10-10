// La cuenta de la Hoja del día: qué le falta a cada hoja, qué hace cada camión y a qué hora,
// dónde anda, qué camión sirve para un pedido, qué cambió desde lo que se mandó y a quién
// hay que avisarle. Lógica pura, sin red ni base: la usan el servidor (para armar los
// mensajes y precargar el parte), la pantalla (con el mismo `DiaHoja` que devuelve la API)
// y los tests (estado.test.ts). Así la regla se escribe una vez.
//
// ES LA MAQUETA APROBADA PORTADA A TIPOS. Cada función tiene su gemela en la maqueta
// (docs/equipos-del-dia/modulo.md, "Maqueta"): problemas() ↔ problemas, calcVeh() ↔ calcVeh,
// bandeja() ↔ bandeja… Si una regla cambia, cambia acá y en la maqueta no hace falta.
// Lo que la maqueta tenía en un estado global (`S`, la hora simulada) acá entra por
// parámetro: el día (`DiaHoja`) y `ahora` (minutos desde las 0:00 del día de la hoja, ver
// tipos.ts).
//
// ADVIERTE, NO BLOQUEA. Ninguna función de acá impide nada: dicen qué está mal y qué botón
// lo arregla. La única regla dura del módulo (una persona, una cuadrilla por día) la hace
// cumplir la base con un UNIQUE.
//
// Imports relativos y con extensión: este archivo corre en `node --test` sin Next.

import type {
  Ausencia, CamionDia, Cuadrilla, DiaHoja, Diferencia, Envio, Foto, FotoChofer, FotoHoja, Fecha,
  Hoja, Hora, Lugar, LugarEncuentro, Minutos, ModoChofer, ObraDia, Parametros, Pedido, Persona, Punto,
  TipoLugar, TipoPedido, TipoViaje, Vehiculo, Viaje,
} from "./tipos.ts";
import { TIPOS_VIAJE, TIPO_AUSENCIA_TXT } from "./tipos.ts";

// ═══════════════════════════ Horas y fechas ═══════════════════════════════════

/** "7:45" → 465. Acepta "07:45:00" (como viene de Postgres). null si no hay hora. */
export function toMin(h: Hora | number | null | undefined): number | null {
  if (h == null || h === "") return null;
  if (typeof h === "number") return h;
  const [a, b] = String(h).split(":").map(Number);
  if (!Number.isFinite(a)) return null;
  return a * 60 + (Number.isFinite(b) ? b : 0);
}
/** 465 → "7:45". Da la vuelta al día: −300 → "19:00". */
export function hm(m: number): Hora {
  let x = Math.round(m);
  x = ((x % 1440) + 1440) % 1440;
  return `${Math.floor(x / 60)}:${String(x % 60).padStart(2, "0")}`;
}
const r5 = (m: number) => Math.round(m / 5) * 5;
/** Redondeado a 5 minutos: las estimadas se dicen "~10:45", no "~10:47". */
export const hm5 = (m: number) => hm(r5(m));
/** "13:00" → "13" (en "antes de las 13"). */
export const hCorta = (h: Hora | null | undefined) => (h ? String(h).replace(/:00$/, "") : "");
/** Normaliza lo que viene de Postgres ("07:45:00") a "7:45". */
export function normHora(h: string | null | undefined): Hora | null {
  const m = toMin(h);
  return m == null ? null : hm(m);
}
/** Lo que escribe una persona ("7", "745", "7.45", "7h45") → "7:45". null si no es una hora. */
export function leerHora(v: string | null | undefined): Hora | null {
  const s = String(v ?? "").trim().replace(/[.h]/g, ":");
  if (!s) return null;
  let h: number, m: number;
  if (s.includes(":")) [h, m] = s.split(":").map(Number);
  else if (/^\d+$/.test(s) && s.length <= 2) { h = Number(s); m = 0; }
  else if (/^\d+$/.test(s)) { h = Number(s.slice(0, -2)); m = Number(s.slice(-2)); }
  else return null;
  if (!(h >= 0 && h < 24 && m >= 0 && m < 60)) return null;
  return hm(h * 60 + m);
}

const NOMBRES_DIA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

export function addDia(fecha: Fecha, n = 1): Fecha {
  const t = new Date(`${fecha}T12:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}
export function diasEntre(desde: Fecha, hasta: Fecha): number {
  return Math.round((Date.parse(`${hasta}T12:00:00Z`) - Date.parse(`${desde}T12:00:00Z`)) / 86_400_000);
}
/** "martes" */
export const diaSemana = (fecha: Fecha) => NOMBRES_DIA[new Date(`${fecha}T12:00:00Z`).getUTCDay()];
/** "13/10" */
export const ddmm = (fecha: Fecha | null | undefined) => (fecha ? `${fecha.slice(8, 10)}/${fecha.slice(5, 7)}` : "");
/** "martes 13" */
export const fechaLarga = (fecha: Fecha) => `${diaSemana(fecha)} ${Number(fecha.slice(8, 10))}`;
/** "martes 13/10" */
export const fechaMensaje = (fecha: Fecha) => `${diaSemana(fecha)} ${ddmm(fecha)}`;

/**
 * Un instante real → minutos desde las 0:00 de `fecha` en Buenos Aires (UTC−3 todo el año:
 * la Argentina no cambia de hora desde 2009). Es la escala de todo el módulo (tipos.ts).
 */
export function minutosDesde(fecha: Fecha, instante: Date | string | number): Minutos {
  const t = instante instanceof Date ? instante.getTime() : typeof instante === "number" ? instante : Date.parse(instante);
  return (t - Date.parse(`${fecha}T00:00:00-03:00`)) / 60_000;
}
/** La inversa: minutos del día de la hoja → ISO. */
export function instanteDe(fecha: Fecha, min: Minutos): string {
  return new Date(Date.parse(`${fecha}T00:00:00-03:00`) + min * 60_000).toISOString();
}

export const esHoy = (ahora: Minutos) => ahora >= 0 && ahora < 1440;
export const esPasado = (ahora: Minutos) => ahora >= 1440;

/** "hoy" / "mañana" / "el martes": cómo se nombra el día de la hoja visto desde ahora. */
export function hoyManana(fecha: Fecha, ahora: Minutos): string {
  if (esHoy(ahora)) return "hoy";
  if (ahora < 0 && ahora >= -1440) return "mañana";
  return `el ${diaSemana(fecha)}`;
}

// ═══════════════════════════ Textos chicos ════════════════════════════════════

export const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
/** "Ávila, Cabrera y Acosta" */
export function yList(xs: string[]): string {
  const a = xs.filter(Boolean);
  return a.length <= 1 ? (a[0] ?? "") : `${a.slice(0, -1).join(", ")} y ${a[a.length - 1]}`;
}
/** "6 Tablones" → "6 tablones"; "IVECO" queda (sigla). */
export const lowFirst = (s: string | null | undefined) =>
  s ? (/^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s) : "";
export const frJ = (f: number) =>
  f >= 1 && f % 1 === 0 ? `${f} j` : f === 0.5 ? "½ j" : f === 0.25 ? "¼ j" : f === 0.75 ? "¾ j" : f === 1.25 ? "1¼ j" : `${f} j`;
export const frSuma = (f: number) =>
  f === 1.25 ? "1¼" : f === 1.5 ? "1½" : f === 1.75 ? "1¾" : String(Math.round(f * 100) / 100).replace(".", ",");
export const frLargo = (f: number) =>
  f >= 1 ? "jornada completa" : f === 0.5 ? "½ jornada" : f === 0.25 ? "¼ jornada" : f === 0.75 ? "¾ jornada" : `${frSuma(f)} jornada`;

/** Distancia en línea recta, en km. "Cerca" es para mirar, no un ruteo (§7). */
export function km(a: { lat: number | null; lng: number | null } | null, b: { lat: number | null; lng: number | null } | null): number | null {
  if (!a || !b || a.lat == null || b.lat == null || a.lng == null || b.lng == null) return null;
  const R = 6371;
  const rad = (x: number) => (x * Math.PI) / 180;
  const dLa = rad(b.lat - a.lat);
  const dLo = rad(b.lng - a.lng);
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
export const kmTxt = (k: number) => (k < 1.5 ? "1 km" : `${Math.round(k)} km`);

/** Sin tildes ni mayúsculas, para buscar ("ram" encuentra a Ramírez). */
export const normalizar = (s: string) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// ═══════════════════════════ Contexto del día ═════════════════════════════════
//
// Índices que todas las funciones necesitan. Se arman una vez por objeto `DiaHoja` (el
// WeakMap los suelta cuando la pantalla recibe un día nuevo).

export type LugarInfo = {
  key: string;
  n: string;
  corto: string;
  dir: string | null;
  lat: number | null;
  lng: number | null;
  obra: boolean;
  tipo: TipoLugar | null;
  cierra: number | null;
  telefono: string | null;
  otId: number | null;
  lugarId: string | null;
};

type Ctx = {
  dia: DiaHoja;
  P: Map<string, Persona>;
  V: Map<string, Vehiculo>;
  L: Map<string, Lugar>;
  dep: Lugar | null;
  depKey: string;
  C: Map<number, Cuadrilla>;
  obrasPor: Map<number, ObraDia[]>;
  obraPorOt: Map<number, ObraDia>;
  hojaPor: Map<number, Hoja>;
  hojaPorId: Map<string, Hoja>;
  cam: Map<string, string | null>;
  instr: Map<number, DiaHoja["instrucciones"][number]>;
  pedidosPorViaje: Map<string, Pedido[]>;
  envioPor: Map<string, Envio>;
  memo: Map<string, unknown>;
};

const CACHE = new WeakMap<DiaHoja, Ctx>();

function ctx(dia: DiaHoja): Ctx {
  const hit = CACHE.get(dia);
  if (hit) return hit;
  const dep = dia.lugares.find((l) => l.tipo === "deposito" && l.activo) ?? null;
  const obrasPor = new Map<number, ObraDia[]>();
  for (const o of [...dia.obras].sort((a, b) => a.ordenDia - b.ordenDia || a.asignacionId - b.asignacionId)) {
    const l = obrasPor.get(o.cuadrillaOdooId) ?? [];
    l.push(o);
    obrasPor.set(o.cuadrillaOdooId, l);
  }
  const cam = new Map<string, string | null>();
  for (const c of dia.camiones) cam.set(c.vehiculoId, c.choferId);
  const pedidosPorViaje = new Map<string, Pedido[]>();
  for (const p of dia.pedidos) {
    if (!p.viajeId || p.estado === "anulado") continue;
    const l = pedidosPorViaje.get(p.viajeId) ?? [];
    l.push(p);
    pedidosPorViaje.set(p.viajeId, l);
  }
  // Un envío por persona: el vigente; si no hay, el último anulado (para "Ya no estás a cargo").
  const envioPor = new Map<string, Envio>();
  for (const e of dia.envios) {
    const prev = envioPor.get(e.personaId);
    if (!prev || (prev.anulado && !e.anulado)) envioPor.set(e.personaId, e);
  }
  const c: Ctx = {
    dia,
    P: new Map(dia.personas.map((p) => [p.id, p])),
    V: new Map(dia.vehiculos.map((v) => [v.id, v])),
    L: new Map(dia.lugares.map((l) => [l.id, l])),
    dep,
    depKey: dep ? `l:${dep.id}` : "dep",
    C: new Map(dia.cuadrillas.map((x) => [x.odooId, x])),
    obrasPor,
    obraPorOt: new Map(dia.obras.map((o) => [o.otId, o])),
    hojaPor: new Map(dia.hojas.map((h) => [h.cuadrillaOdooId, h])),
    hojaPorId: new Map(dia.hojas.map((h) => [h.id, h])),
    cam,
    instr: new Map(dia.instrucciones.map((i) => [i.otId, i])),
    pedidosPorViaje,
    envioPor,
    memo: new Map(),
  };
  CACHE.set(dia, c);
  return c;
}

function memo<T>(dia: DiaHoja, clave: string, f: () => T): T {
  const m = ctx(dia).memo;
  if (m.has(clave)) return m.get(clave) as T;
  const v = f();
  m.set(clave, v);
  return v;
}

const P = (dia: DiaHoja) => ctx(dia).dia.parametros;

// ─── Nombres ────────────────────────────────────────────────────────────────

/** El nombre de una persona como se dice ("Ortega"). "" si no se conoce. */
export const nombreDe = (dia: DiaHoja, id: string | null | undefined) => (id ? ctx(dia).P.get(id)?.nombre ?? "" : "");
export const persona = (dia: DiaHoja, id: string | null | undefined) => (id ? ctx(dia).P.get(id) ?? null : null);
export const vehiculo = (dia: DiaHoja, id: string | null | undefined) => (id ? ctx(dia).V.get(id) ?? null : null);
export const patente = (dia: DiaHoja, id: string | null | undefined) => vehiculo(dia, id)?.patente ?? "";
/** "Iveco AF 669 ZL", "Agrale hidrogrúa AB 831 LC", "Chevrolet S10 LNE 368". */
export function vehiculoNombre(dia: DiaHoja, id: string | null | undefined): string {
  const v = vehiculo(dia, id);
  if (!v) return "";
  return [v.marca, v.tipo === "hidrogrua" ? "hidrogrúa" : null, v.patente].filter(Boolean).join(" ");
}
const tipoVehTxt = (v: Vehiculo) =>
  v.tipo === "hidrogrua" ? "hidrogrúa" : v.tipo === "camion" ? "camión" : v.tipo;

/**
 * Los nombres cortos de un grupo de personas: el apellido, y si dos lo comparten, con la
 * inicial del nombre ("Miño H." y "Miño J."). Lo usa el servidor al armar `personas`.
 */
export function nombresCortos(gente: { id: string; apellido: string; nombre: string }[], formato: (s: string) => string = (s) => s): Map<string, string> {
  const base = new Map(gente.map((g) => [g.id, formato(g.apellido.trim())]));
  const cuenta = new Map<string, number>();
  for (const n of base.values()) cuenta.set(normalizar(n), (cuenta.get(normalizar(n)) ?? 0) + 1);
  const out = new Map<string, string>();
  for (const g of gente) {
    const n = base.get(g.id)!;
    const ini = formato(g.nombre.trim()).charAt(0).toUpperCase();
    out.set(g.id, (cuenta.get(normalizar(n)) ?? 0) > 1 && ini ? `${n} ${ini}.` : n);
  }
  return out;
}

// ─── Cuadrillas ─────────────────────────────────────────────────────────────

export const cuadrilla = (dia: DiaHoja, c: number) => ctx(dia).C.get(c) ?? null;
const numeroDe = (dia: DiaHoja, c: number) => cuadrilla(dia, c)?.numero ?? null;
/** "Cuadrilla 3" */
export const cNombre = (dia: DiaHoja, c: number | null | undefined) =>
  c == null ? "" : cuadrilla(dia, c)?.nombre ?? `Cuadrilla ${c}`;
/** "la 3" (o "la Quintana" si no tiene número). */
export const laC = (dia: DiaHoja, c: number) => {
  const n = numeroDe(dia, c);
  return n != null ? `la ${n}` : `la ${cNombre(dia, c)}`;
};
/** "C3" */
export const cTag = (dia: DiaHoja, c: number) => {
  const n = numeroDe(dia, c);
  return n != null ? `C${n}` : cNombre(dia, c);
};

export const hojaDeCuadrilla = (dia: DiaHoja, c: number) => ctx(dia).hojaPor.get(c) ?? null;
export const obrasDe = (dia: DiaHoja, c: number): ObraDia[] => ctx(dia).obrasPor.get(c) ?? [];
export const suspendida = (dia: DiaHoja, c: number): string | null => dia.suspendidas[c] ?? null;

/** Cuadrillas con hoja y con obras ese día, en el orden de las cuadrillas (incluye suspendidas). */
export function cuadrillasConHoja(dia: DiaHoja): number[] {
  return memo(dia, "conHoja", () =>
    ordenCuadrillas(dia).filter((c) => hojaDeCuadrilla(dia, c) && obrasDe(dia, c).length > 0));
}
/** Las que trabajan: con hoja, con obras y sin suspender. Las que se mandan. */
export function cuadrillasActivas(dia: DiaHoja): number[] {
  return memo(dia, "activas", () => cuadrillasConHoja(dia).filter((c) => !suspendida(dia, c)));
}
/** Cuadrillas con obras ese día (tengan hoja o no). Para "El martes todavía no tiene hojas". */
export function cuadrillasConObras(dia: DiaHoja): number[] {
  return ordenCuadrillas(dia).filter((c) => obrasDe(dia, c).length > 0);
}
function ordenCuadrillas(dia: DiaHoja): number[] {
  return memo(dia, "ordenC", () => {
    const ids = new Set<number>([...dia.cuadrillas.map((c) => c.odooId), ...dia.obras.map((o) => o.cuadrillaOdooId), ...dia.hojas.map((h) => h.cuadrillaOdooId)]);
    return [...ids].sort((a, b) => (numeroDe(dia, a) ?? 999) - (numeroDe(dia, b) ?? 999) || a - b);
  });
}

// ─── Lugares ────────────────────────────────────────────────────────────────

/** Un punto (obra, lugar o texto) con lo que hace falta para nombrarlo y medirlo. */
export function lugar(dia: DiaHoja, p: Punto | null | undefined): LugarInfo {
  const k = ctx(dia);
  const vacio: LugarInfo = { key: "", n: "—", corto: "—", dir: null, lat: null, lng: null, obra: false, tipo: null, cierra: null, telefono: null, otId: null, lugarId: null };
  if (!p) return vacio;
  if (p.otId != null) {
    const o = k.obraPorOt.get(p.otId);
    if (o) return { ...vacio, key: `o:${o.otId}`, n: o.corto, corto: cortoCalle(o.corto), dir: o.direccion, lat: o.lat, lng: o.lng, obra: true, otId: o.otId };
    const n = p.texto ?? `OT ${p.otId}`;
    return { ...vacio, key: `o:${p.otId}`, n, corto: cortoCalle(n), obra: true, otId: p.otId };
  }
  if (p.lugarId) {
    const l = k.L.get(p.lugarId);
    if (l) return { ...vacio, key: `l:${l.id}`, n: l.nombre, corto: l.corto ?? l.nombre, dir: l.direccion, lat: l.lat, lng: l.lng, tipo: l.tipo, cierra: toMin(l.cierra), telefono: l.telefono, lugarId: l.id };
  }
  if (p.texto) return { ...vacio, key: `t:${normalizar(p.texto)}`, n: p.texto, corto: p.texto };
  return vacio;
}
/** "Av. Rivadavia 6150" → "Rivadavia" (la ficha del camión: "Lleva C2 Juramento"). */
function cortoCalle(dir: string): string {
  const s = dir.replace(/^(Av\.?|Avenida|Calle|Pje\.?|Pasaje)\s+/i, "").replace(/\s+\d+.*$/, "").trim();
  return s || dir;
}
function lugarDeKey(dia: DiaHoja, key: string): LugarInfo {
  if (key === "dep") return { key, n: "Depósito", corto: "Depósito", dir: null, lat: null, lng: null, obra: false, tipo: "deposito", cierra: null, telefono: null, otId: null, lugarId: null };
  const [t, id] = [key.slice(0, 1), key.slice(2)];
  if (t === "o") return lugar(dia, { otId: Number(id), lugarId: null, texto: null });
  if (t === "l") return lugar(dia, { otId: null, lugarId: id, texto: null });
  return lugar(dia, { otId: null, lugarId: null, texto: id });
}
const keyDe = (dia: DiaHoja, p: Punto | null | undefined) => lugar(dia, p).key;
/** "el depósito", "la planta de VTV", "el taller", o el nombre. */
export function conArticulo(info: LugarInfo): string {
  if (info.obra || !info.tipo) return info.n;
  return info.tipo === "deposito" ? "el depósito" : info.tipo === "vtv" ? "la planta de VTV" : info.tipo === "taller" ? "el taller" : info.n;
}
const esDep = (dia: DiaHoja, key: string) => key === ctx(dia).depKey || key === "dep";

// ═══════════════════════════ Ausencias ════════════════════════════════════════

const esParcial = (a: Ausencia) => a.horaDesde != null || a.horaHasta != null;
const cubre = (a: Ausencia, fecha: Fecha) => a.desde <= fecha && (!a.hasta || a.hasta >= fecha);

/** La ausencia de todo el día de una persona en la fecha de la hoja. */
export function ausenciaDe(dia: DiaHoja, pid: string | null | undefined, fecha: Fecha = dia.fecha): Ausencia | null {
  if (!pid) return null;
  return dia.ausencias.find((a) => a.personaId === pid && cubre(a, fecha) && !esParcial(a)) ?? null;
}
/** La parcial ("se retira a las 14", "llega a las 10"). */
export function parcialDe(dia: DiaHoja, pid: string | null | undefined, fecha: Fecha = dia.fecha): Ausencia | null {
  if (!pid) return null;
  return dia.ausencias.find((a) => a.personaId === pid && cubre(a, fecha) && esParcial(a)) ?? null;
}
/** ¿Está ausente a esa hora? Sin hora, sólo las de todo el día. */
export function ausenteEn(dia: DiaHoja, pid: string, hora?: Hora | number | null): Ausencia | null {
  const a = ausenciaDe(dia, pid);
  if (a) return a;
  const p = parcialDe(dia, pid);
  const t = toMin(hora ?? null);
  if (!p || t == null) return null;
  if (p.horaHasta && t >= toMin(p.horaHasta)!) return p;
  if (p.horaDesde && t < toMin(p.horaDesde)!) return p;
  return null;
}
/** "ART desde el 13/10 · sin fecha de alta", "enfermedad · sólo el martes". */
export function ausTexto(a: Ausencia, conVuelta: boolean, fecha?: Fecha): string {
  let t = TIPO_AUSENCIA_TXT[a.tipo];
  if (a.tipo === "art" || a.origen === "asistencia") t += ` desde el ${ddmm(a.desde)}`;
  if (conVuelta) {
    t += a.hasta
      ? a.hasta === a.desde
        ? ` · sólo ${fecha && a.hasta === fecha ? `el ${diaSemana(fecha)}` : `el ${ddmm(a.hasta)}`}`
        : ` hasta el ${ddmm(a.hasta)}`
      : " · sin fecha de alta";
  }
  return t;
}

/**
 * "Ya tiene el alta": cierra la ausencia el día anterior al que se mira. NO BORRA EL PASADO:
 * los días que faltó siguen siendo ausencia. Si la ausencia empieza ese mismo día (o
 * después), no hubo nada: se anula.
 */
export function altaDeAusencia(a: Pick<Ausencia, "desde" | "hasta">, fecha: Fecha): { hasta: Fecha } | { anular: true } {
  if (a.desde >= fecha) return { anular: true };
  const hasta = addDia(fecha, -1);
  return { hasta: a.hasta && a.hasta < hasta ? a.hasta : hasta };
}

/** Una fila de la asistencia de Odoo (x_parte_diario), ya cruzada con Legajos. */
export type FilaAsistencia = { personaId: string; fecha: Fecha; estado: string; tipoAusencia: string | null };

/**
 * Las ART (y enfermedades) largas que Juan Pablo cargó en la asistencia y nadie cargó como
 * ausencia prevista (§5): aparecen "según la asistencia", sin fecha de alta.
 *
 * Cuenta sólo si la ÚLTIMA fila de esa persona en la ventana sigue ausente con ese tipo (si
 * después figura presente, ya volvió), y si no hay una ausencia guardada que cubra esos
 * días (la que cargó el planificador, o el "Ya tiene el alta" que la cerró).
 */
export function ausenciasDeAsistencia(filas: FilaAsistencia[], guardadas: Ausencia[]): Ausencia[] {
  const tipo = (f: FilaAsistencia) =>
    f.estado === "ausente" && f.tipoAusencia === "accidente" ? "art" : f.estado === "ausente" && f.tipoAusencia === "enfermedad" ? "enfermedad" : null;
  const porPersona = new Map<string, FilaAsistencia[]>();
  for (const f of filas) {
    const l = porPersona.get(f.personaId) ?? [];
    l.push(f);
    porPersona.set(f.personaId, l);
  }
  const out: Ausencia[] = [];
  for (const [pid, l] of porPersona) {
    l.sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
    const t = tipo(l[0]);
    if (!t) continue;
    let desde = l[0].fecha;
    for (const f of l.slice(1)) {
      if (tipo(f) !== t) break;
      desde = f.fecha;
    }
    const cubierta = guardadas.some((g) => g.personaId === pid && !esParcial(g) && g.desde <= l[0].fecha && (!g.hasta || g.hasta >= desde));
    if (cubierta) continue;
    out.push({ id: null, personaId: pid, desde, hasta: null, tipo: t, horaDesde: null, horaHasta: null, nota: null, origen: "asistencia" });
  }
  return out;
}

// ═══════════════════════════ La hoja de una cuadrilla ═════════════════════════

export type ObraConHora = { o: ObraDia; t: number; hora: Hora; est: boolean; fin: number };

/**
 * Las obras de la cuadrilla con su hora aproximada (§2): la primera a las 8:00 (o la de la
 * instrucción), las siguientes cuando termina la anterior según su fracción (¼ ≈ 2 h 15),
 * con media hora de almuerzo si cruzan el mediodía.
 */
export function obrasCon(dia: DiaHoja, c: number): ObraConHora[] {
  return memo(dia, `obrasCon:${c}`, () => {
    const out: ObraConHora[] = [];
    let prev: { o: ObraDia; t: number } | null = null;
    for (const [i, o] of obrasDe(dia, c).entries()) {
      const ins = ctx(dia).instr.get(o.otId);
      let t: number;
      let est = false;
      if (ins?.horaInicio) t = toMin(ins.horaInicio)!;
      else if (i === 0 || !prev) t = toMin(P(dia).inicioObra)!;
      else {
        t = prev.t + Math.round(prev.o.fraccion * 540);
        if (prev.t < 720 && t >= 720) t += 30;
        est = true;
      }
      prev = { o, t };
      out.push({ o, t, hora: hm(t), est, fin: t + Math.round(o.fraccion * 540) + (t < 720 && t + o.fraccion * 540 > 720 ? 60 : 0) });
    }
    return out;
  });
}
export const sumaFr = (dia: DiaHoja, c: number) => obrasDe(dia, c).reduce((s, o) => s + o.fraccion, 0);
/** La dotación prevista: el máximo de personal por jornada de sus obras. */
export const prevista = (dia: DiaHoja, c: number) => Math.max(0, ...obrasDe(dia, c).map((o) => o.personalPorJornada || 0));
/** Cuántos van: la gente más el chofer de "Todo el día" (que puede ayudar: Pendiente 10). */
export function vanDe(dia: DiaHoja, c: number): number {
  const h = hojaDeCuadrilla(dia, c);
  if (!h) return 0;
  return h.integrantes.length + (h.modo === "todo_el_dia" && h.choferId ? 1 : 0);
}
export const genteDe = (h: Hoja) => [...h.integrantes].sort((a, b) => Number(b.aCargo) - Number(a.aCargo) || a.orden - b.orden).map((i) => i.personaId);
export const aCargoDe = (h: Hoja | null | undefined) => h?.integrantes.find((i) => i.aCargo)?.personaId ?? null;

/** En qué cuadrilla está una persona ese día (cualquier hoja, aunque no tenga obras). */
export function hojaDe(dia: DiaHoja, pid: string): number | null {
  for (const h of dia.hojas) if (h.integrantes.some((i) => i.personaId === pid)) return h.cuadrillaOdooId;
  return null;
}
export const cuadrillaDeObra = (dia: DiaHoja, otId: number) => ctx(dia).obraPorOt.get(otId)?.cuadrillaOdooId ?? null;

export function encDir(dia: DiaHoja, c: number): string | null {
  const h = hojaDeCuadrilla(dia, c);
  const ob = obrasCon(dia, c)[0];
  return h && h.encuentro.lugar === "obra" && ob ? ob.o.corto : null;
}
/** "7:00 en el depósito", "8:00 en la obra", "8:00 en la obra (Juramento 2145)". */
export function encTxt(dia: DiaHoja, c: number): string {
  const h = hojaDeCuadrilla(dia, c);
  if (!h) return "";
  const hora = normHora(h.encuentro.hora) ?? h.encuentro.hora;
  if (h.encuentro.lugar === "deposito") return `${hora} en el depósito`;
  if (h.encuentro.lugar === "otro") return `${hora} en ${h.encuentro.texto ?? "otro lugar"}`;
  const ob = obrasCon(dia, c)[0];
  return `${hora} en la obra${ob && obrasDe(dia, c).length > 1 ? ` (${ob.o.corto})` : ""}`;
}
/** A quién le llega la hoja: el que está a cargo o, si no hay, el elegido para recibirla. */
export function recibeDe(dia: DiaHoja, c: number): string | null {
  const h = hojaDeCuadrilla(dia, c);
  if (!h) return null;
  return aCargoDe(h) ?? (h.recibeId && h.integrantes.some((i) => i.personaId === h.recibeId) ? h.recibeId : null);
}
/** Las cuadrillas con las que un chofer está "Todo el día". */
export const todoDe = (dia: DiaHoja, ch: string) =>
  cuadrillasActivas(dia).filter((c) => { const h = hojaDeCuadrilla(dia, c)!; return h.modo === "todo_el_dia" && h.choferId === ch; });
/** La cuadrilla con la que un vehículo está "Todo el día". */
export const todoVeh = (dia: DiaHoja, veh: string | null) =>
  veh ? cuadrillasActivas(dia).find((c) => { const h = hojaDeCuadrilla(dia, c)!; return h.modo === "todo_el_dia" && h.vehiculoId === veh; }) ?? null : null;
/** El chofer de un vehículo ese día. */
export const choferDelCamion = (dia: DiaHoja, veh: string | null | undefined) => (veh ? ctx(dia).cam.get(veh) ?? null : null);

// ═══════════════════════════ Viajes y camiones ════════════════════════════════

export type ViajeCalc = Viaje & {
  /** Posición en la fila (1, 2, 3…). */
  i: number;
  haciaEf: Punto;
  haciaKey: string;
  desdeKey: string;
  /** Hora de la parada: la fija, o la estimada con el orden y las duraciones. */
  t: number;
  /** Cuándo queda libre el camión (con la vuelta al depósito si la hay). */
  fin: number;
  dur: number;
  /** Una hora fija que lo anterior no deja cumplir. */
  conflicto: { llega: number; prevId: string | null } | null;
  finParada: number;
};

/**
 * Hacia dónde va de verdad. El "lleva" y el "busca" de una cuadrilla NO guardan la obra:
 * van a la primera y a la última obra que tenga hoy en el tablero. Si el tablero cambia el
 * orden, el viaje lo sigue solo (y la diferencia con lo enviado lo dice).
 */
export function haciaDe(dia: DiaHoja, v: Viaje): Punto {
  if (v.hojaId && (v.tipo === "lleva" || v.tipo === "busca")) {
    const h = ctx(dia).hojaPorId.get(v.hojaId);
    const ob = h ? obrasDe(dia, h.cuadrillaOdooId) : [];
    const o = v.tipo === "lleva" ? ob[0] : ob[ob.length - 1];
    if (o) return { otId: o.otId, lugarId: null, texto: null };
  }
  return v.hacia;
}
const cuadrillaDeViaje = (dia: DiaHoja, v: Viaje): number | null =>
  v.cuadrillaOdooId ?? (v.hojaId ? ctx(dia).hojaPorId.get(v.hojaId)?.cuadrillaOdooId ?? null : null);

/**
 * Los viajes que cuentan ese día: sin los anulados y sin los de cuadrillas que no trabajan
 * (suspendidas o sin obras: sus lleva y trae quedan "anulados" en los hechos).
 */
export function viajesVigentes(dia: DiaHoja): Viaje[] {
  return memo(dia, "vigentes", () => {
    const act = new Set(cuadrillasActivas(dia));
    return dia.viajes.filter((v) => {
      if (v.estado === "anulado") return false;
      if (!v.hojaId) return true;
      const h = ctx(dia).hojaPorId.get(v.hojaId);
      return !!h && act.has(h.cuadrillaOdooId);
    });
  });
}

/** El chofer que hace el viaje: el que se guardó al ponerlo o el del camión ese día. */
export function choferDe(dia: DiaHoja, v: Pick<Viaje, "vehiculoId" | "choferId" | "fleteExterno"> | null | undefined): string | null {
  if (!v || !v.vehiculoId || v.fleteExterno) return null;
  return v.choferId ?? choferDelCamion(dia, v.vehiculoId);
}

function durDe(dia: DiaHoja, v: Viaje, desdeKey: string): number {
  if (v.duracionMin) return v.duracionMin;
  if (v.tipo === "lleva_material" && desdeKey && !esDep(dia, desdeKey)) return 30;
  return P(dia).duracionViaje[v.tipo] ?? 60;
}

/**
 * Las horas de un camión (§6): fijas donde alguien espera; el resto estimadas con el orden
 * y las duraciones típicas. Así el coordinador no escribe horas: ordena.
 */
export function calcVeh(dia: DiaHoja, veh: string): ViajeCalc[] {
  return memo(dia, `calc:${veh}`, () => {
    const k = ctx(dia);
    const list = viajesVigentes(dia).filter((v) => v.vehiculoId === veh && !v.fleteExterno)
      .sort((a, b) => a.orden - b.orden || (a.id < b.id ? -1 : 1));
    const td = todoVeh(dia, veh);
    const h0 = td ? toMin(hojaDeCuadrilla(dia, td)!.encuentro.hora)! : toMin(P(dia).encuentroDeposito)!;
    let cur: number | null = null;
    let loc = k.depKey;
    const out: ViajeCalc[] = [];
    list.forEach((v, i) => {
      const haciaEf = haciaDe(dia, v);
      const haciaKey = keyDe(dia, haciaEf);
      const desdeKey = v.desde ? keyDe(dia, v.desde) : loc;
      const dur = durDe(dia, v, desdeKey);
      const vu = v.vuelta ? P(dia).minutosVueltaDeposito : 0;
      const fija = !!v.hora;
      let t = fija ? toMin(v.hora)! : Math.max(cur ?? h0, toMin(v.noAntesDe) ?? 0);
      if (!fija && td && cur == null) t = Math.max(t, toMin(v.noAntesDe) ?? 16 * 60);
      const prev = out[out.length - 1];
      const conflicto = fija && cur != null && cur > t && v.estado === "planeado" ? { llega: cur, prevId: prev?.id ?? null } : null;
      let fin: number;
      if (v.estado === "hecho") fin = (v.hechoMin ?? t + dur) + vu;
      else if (v.estado === "no_pudo") fin = (v.hechoMin ?? t) + 30;
      else fin = t + dur + vu;
      out.push({ ...v, i: i + 1, haciaEf, haciaKey, desdeKey, t, fin, dur, conflicto, finParada: v.estado === "hecho" ? (v.hechoMin ?? t + dur) : t + dur });
      cur = fin;
      loc = v.vuelta || v.estado === "no_pudo" || v.tipo === "compra" ? k.depKey : haciaKey;
    });
    return out;
  });
}

/** Los vehículos que tienen fila en Camiones: los que salen a la calle, o los que tienen viajes. */
export function filasCamiones(dia: DiaHoja): string[] {
  return memo(dia, "filas", () => {
    const conViajes = new Set(viajesVigentes(dia).map((v) => v.vehiculoId).filter(Boolean) as string[]);
    return dia.vehiculos.filter((v) => v.tipo !== "otro" || conViajes.has(v.id)).map((v) => v.id);
  });
}
/** Todos los viajes de todos los camiones, con sus horas. */
export const viajesCalc = (dia: DiaHoja): ViajeCalc[] => memo(dia, "calcTodo", () => filasCamiones(dia).flatMap((veh) => calcVeh(dia, veh)));
/** Los fletes de afuera (sin vehículo propio), con su hora tal cual. */
export function fletesDeAfuera(dia: DiaHoja): ViajeCalc[] {
  return viajesVigentes(dia).filter((v) => v.fleteExterno).map((v, i) => {
    const haciaEf = haciaDe(dia, v);
    const t = toMin(v.hora) ?? toMin(v.noAntesDe) ?? 8 * 60;
    const dur = v.duracionMin ?? P(dia).duracionViaje[v.tipo] ?? 60;
    return { ...v, i: i + 1, haciaEf, haciaKey: keyDe(dia, haciaEf), desdeKey: v.desde ? keyDe(dia, v.desde) : ctx(dia).depKey, t, fin: t + dur, dur, conflicto: null, finParada: t + dur };
  });
}
/** Los viajes de un chofer en el día, por hora (su "hoja de ruta"). */
export function viajesChofer(dia: DiaHoja, ch: string): ViajeCalc[] {
  return memo(dia, `chofer:${ch}`, () => viajesCalc(dia).filter((v) => choferDe(dia, v) === ch).sort((a, b) => a.t - b.t || a.orden - b.orden));
}
export const viajeCalc = (dia: DiaHoja, id: string) => viajesCalc(dia).find((v) => v.id === id) ?? fletesDeAfuera(dia).find((v) => v.id === id) ?? null;
export const pedidosDeViaje = (dia: DiaHoja, viajeId: string) => ctx(dia).pedidosPorViaje.get(viajeId) ?? [];

const cuadTag = (dia: DiaHoja, v: Viaje) => {
  const c = cuadrillaDeViaje(dia, v);
  return c != null && (v.tipo === "lleva" || v.tipo === "busca" || v.tipo === "mueve") ? ` ${cTag(dia, c)}` : "";
};
/** La ficha del camión: "Lleva C2 Juramento", "Compra Sanz", "VTV". */
export function cortoV(dia: DiaHoja, v: Viaje): string {
  const h = lugar(dia, haciaDe(dia, v));
  if (v.tipo === "taller") return h.tipo === "vtv" ? "VTV" : "Taller";
  if (v.fleteExterno) return v.fleteExterno;
  return `${TIPOS_VIAJE[v.tipo].corto}${cuadTag(dia, v)} ${h.corto}`;
}
/** "7:00" si es fija, "~10:45" si es estimada. */
export const horaTxt = (v: ViajeCalc) => `${v.hora ? "" : "~"}${hm5(v.t)}`;

/** Cómo lo lee el chofer: "Lleva a la Cuadrilla 2 a Juramento 2145". Con `imper`, "Llevá…". */
export function textoViaje(dia: DiaHoja, v: Viaje & { desdeKey?: string }, imper = false): string {
  const dest = lugar(dia, haciaDe(dia, v)).n;
  const c = cuadrillaDeViaje(dia, v);
  const T = imper
    ? { lleva: "Llevá", busca: "Buscá", mueve: "Mové", trae: "Traé", compra: "Buscá", carga: "Cargá" }
    : { lleva: "Lleva", busca: "Busca", mueve: "Mueve", trae: "Trae", compra: "Busca", carga: "Carga" };
  switch (v.tipo) {
    case "lleva": return `${T.lleva} a la ${cNombre(dia, c)} a ${dest}`;
    case "busca": return `${T.busca} a la ${cNombre(dia, c)} en ${dest}`;
    case "mueve": return `${T.mueve} a la ${cNombre(dia, c)} de ${lugar(dia, v.desde).n} a ${dest}`;
    case "lleva_material": return `${T.lleva} ${v.carga ? lowFirst(v.carga) : "material"} a ${dest}`;
    case "trae_material":
      return v.vuelta === false && v.estado !== "hecho" && hayVueltaDespues(dia, v)
        ? `${T.carga} ${v.carga ? lowFirst(v.carga) : "lo desarmado"} en ${dest}`
        : `${T.trae} ${v.carga ? lowFirst(v.carga) : "lo desarmado"} de ${dest} al depósito`;
    case "compra": return `${T.compra} la compra en ${dest}${v.carga ? `: ${lowFirst(v.carga)}` : ""}`;
    case "entre_depositos": return `${T.lleva} ${lowFirst(v.carga || "material")} del depósito a ${dest}`;
    case "taller": return `${v.carga || "VTV"} del ${patente(dia, v.vehiculoId)}${v.hora ? " (turno)" : ""}`;
    default: return v.carga || "Otro viaje";
  }
}
/** Un "trae" que cede su vuelta al viaje siguiente (cargó y siguió a otra obra). */
function hayVueltaDespues(dia: DiaHoja, v: Viaje): boolean {
  return dia.viajes.some((x) => x.vehiculoId === v.vehiculoId && x.id !== v.id && x.vuelta && x.desde?.otId != null && x.desde.otId === haciaDe(dia, v).otId);
}

// ─── Dónde anda cada camión, sin GPS (§9) ───────────────────────────────────

export type DondeAnda = { t: string; tono: "" | "ok" | "amb" | "rojo"; libre?: boolean; sinNoticias?: boolean };

export function dondeAnda(dia: DiaHoja, veh: string, ahora: Minutos): DondeAnda {
  const ts = calcVeh(dia, veh);
  const td = todoVeh(dia, veh);
  const ch = choferDelCamion(dia, veh);
  const hoy = esHoy(ahora);
  const p = P(dia);
  if (!ch) return { t: "Sin chofer", tono: "" };
  const pend = ts.filter((v) => v.estado === "planeado");
  const done = ts.filter((v) => v.estado === "hecho" || v.estado === "no_pudo");
  const last = done.length ? done.reduce((a, b) => ((a.hechoMin ?? a.t) > (b.hechoMin ?? b.t) ? a : b)) : null;
  const at = (v: ViajeCalc) => v.hechoMin ?? v.t;
  if (td) {
    const ob = obrasCon(dia, td)[0];
    const own = pend[0];
    let t = `Con la ${cNombre(dia, td)} en ${ob ? ob.o.corto : "—"}`;
    if (hoy && own && own.t <= ahora) t = `${textoViaje(dia, own)} (${horaTxt(own)})`;
    else if (own) t += ` · después ${lowFirst(cortoV(dia, own))} ${horaTxt(own)}`;
    else if (hoy && last && ahora >= toMin(p.finJornada)!) t = `Terminó ${hm(at(last))} · con la ${cNombre(dia, td)}`;
    return { t, tono: "" };
  }
  if (!ts.length) return { t: hoy ? "Sin viajes · en el depósito" : "Sin viajes", tono: "" };
  if (!hoy) {
    if (esPasado(ahora)) return { t: `${ts.length} viajes`, tono: "" };
    return { t: `Sale ${horaTxt(ts[0])} del depósito · ${ts.length} viajes`, tono: "" };
  }
  if (!pend.length) {
    const np = done.filter((v) => v.estado === "no_pudo").length;
    return { t: `Terminó ${hm(at(last!))} · ${done.length - np} viajes${np ? ` · ${np} no pudo` : ""}`, tono: "ok" };
  }
  const cur = pend[0];
  const curLug = lugar(dia, cur.haciaEf);
  if (cur.tipo === "taller" && cur.t <= ahora) return { t: `En ${curLug.tipo === "vtv" ? "la VTV" : "el taller"} hasta ~${hm5(cur.t + cur.dur)}`, tono: "" };
  if (ahora > cur.t + cur.dur + p.minutosSinNoticias && (!last || at(last) < cur.t)) {
    return { t: `Sin noticias desde las ${hm(last ? at(last) : cur.t)} · tenía ${curLug.corto} a las ${hm5(cur.t)}`, tono: "amb", sinNoticias: true };
  }
  if (last && last.estado === "no_pudo" && ahora - at(last) <= 15) {
    return { t: `No pudo en ${lugar(dia, last.haciaEf).n} (${lowFirst(last.noPudoMotivo)}) · vuelve al depósito ~${hm(Math.ceil((at(last) + 30) / 5) * 5)}`, tono: "rojo" };
  }
  if (cur.t - ahora > 60 && (!last || at(last) <= ahora)) {
    const enDep = !last || last.vuelta || last.estado === "no_pudo" || last.tipo === "compra";
    const llega = last ? last.fin : ahora;
    const donde = enDep ? (llega > ahora ? `en el depósito ~${hm5(llega)}` : "en el depósito") : `en ${lugar(dia, last!.haciaEf).n}`;
    return { t: `Libre desde las ${hm(last ? at(last) : toMin(p.encuentroDeposito)!)} · ${donde} · después ${lowFirst(cortoV(dia, cur))} ${horaTxt(cur)}`, tono: "ok", libre: true };
  }
  if (!done.length && cur.t > ahora) return { t: `En el depósito · sale ${horaTxt(cur)}`, tono: "" };
  const hizo = last ? `Hizo ${lugar(dia, last.haciaEf).n} (${hm(at(last))}) · ` : "";
  if (cur.tipo === "trae_material" && cur.t <= ahora) return { t: `${hizo}ahora cargando en ${curLug.n}`, tono: "" };
  return { t: `${hizo}ahora hacia ${curLug.n} (${horaTxt(cur)})`, tono: "" };
}

// ─── Cerca y libre: ayuda para decidir, nunca decide (§7) ───────────────────

export type CamionQueSirve = {
  veh: string;
  ch: string;
  libreDesde: number;
  hasta: number;
  loc: string;
  km: number | null;
  cur: ViajeCalc | null;
  last: ViajeCalc | null;
  ocupado: string;
  vuelve: boolean;
  por?: "cerca" | "libre" | "otro";
};
export type CamionesQueSirven = {
  si: CamionQueSirve[];
  no: { veh: string; ch?: string; t: string; todo?: number }[];
  cerca: CamionQueSirve | null;
  libre: CamionQueSirve | null;
  /** Los sugeridos, hasta 4 (las teclas 1–4). */
  orden: CamionQueSirve[];
  nadieLibre: boolean;
  ahora: number;
};

export function camionesQueSirven(dia: DiaHoja, ped: Pick<Pedido, "hacia" | "necesita">, ahoraReal: Minutos): CamionesQueSirven {
  const hoy = esHoy(ahoraReal);
  const now = hoy ? ahoraReal : toMin(P(dia).encuentroDeposito)!;
  const dest = lugar(dia, ped.hacia);
  const k = ctx(dia);
  const si: CamionQueSirve[] = [];
  const no: CamionesQueSirven["no"] = [];
  for (const veh of filasCamiones(dia)) {
    const V = k.V.get(veh)!;
    if (V.tipo === "otro") continue;
    const ch = choferDelCamion(dia, veh);
    const vtv = vencido(dia, V, "vtv");
    if (!ch) {
      const elV = V.tipo === "camioneta" && V.modelo ? `la ${V.modelo}` : `el ${V.patente}`;
      no.push({ veh, t: vtv ? `el ${V.patente} tiene la VTV vencida y no tiene chofer` : `${elV} no tiene chofer hoy` });
      continue;
    }
    const td = todoVeh(dia, veh);
    if (td) {
      no.push({ veh, ch, t: `${nombreDe(dia, ch)} está todo el día con ${laC(dia, td)}${V.tipo === "hidrogrua" ? " (hidrogrúa)" : ""}`, todo: td });
      continue;
    }
    if (ped.necesita === "hidrogrua" && V.tipo !== "hidrogrua") { no.push({ veh, ch, t: `el ${V.patente} no es hidrogrúa` }); continue; }
    if (ped.necesita === "camion" && V.tipo === "camioneta") { no.push({ veh, ch, t: `no entra en la ${V.patente}` }); continue; }
    if (V.estado === "en_taller" || V.estado === "fuera_servicio") { no.push({ veh, ch, t: `el ${V.patente} está ${V.estado === "en_taller" ? "en el taller" : "fuera de servicio"}` }); continue; }
    const ts = calcVeh(dia, veh);
    const cur = hoy ? ts.find((v) => v.estado === "planeado" && v.t <= now) ?? null : null;
    const done = ts.filter((v) => v.estado !== "planeado");
    const last = done.length ? done.reduce((a, b) => ((a.hechoMin ?? a.t) > (b.hechoMin ?? b.t) ? a : b)) : null;
    let libreDesde: number;
    let loc: string;
    // Como en la maqueta: el que está haciendo algo, está ahí (Gómez "en Juramento", aunque
    // después vuelva al depósito).
    if (cur) { libreDesde = cur.fin; loc = cur.haciaKey; }
    else if (hoy && last) { libreDesde = Math.max(now, last.fin); loc = last.vuelta || last.estado === "no_pudo" || last.tipo === "compra" ? k.depKey : last.haciaKey; }
    else { libreDesde = now; loc = k.depKey; }
    let next = ts.find((v) => v.estado === "planeado" && v !== cur && v.t >= libreDesde - 1);
    while (next && next.t - libreDesde < P(dia).minutosEntreViajes) {
      libreDesde = next.fin;
      loc = next.vuelta || next.tipo === "compra" ? k.depKey : next.haciaKey;
      const nx = next;
      next = ts.find((v) => v.estado === "planeado" && v.orden > nx.orden);
    }
    const kmv = km(lugarDeKey(dia, loc), dest);
    let ocupado = !cur && libreDesde > now ? `${nombreDe(dia, ch)} vuelve al depósito ~${hm(Math.ceil(libreDesde / 5) * 5)}` : "";
    if (cur) {
      const cl = lugar(dia, cur.haciaEf);
      ocupado = cur.tipo === "taller" ? `${nombreDe(dia, ch)} en ${cl.tipo === "vtv" ? "la VTV" : "el taller"} hasta ~${hm5(cur.fin)}` : `${nombreDe(dia, ch)} en ${cl.n}`;
    }
    si.push({ veh, ch, libreDesde, hasta: next ? next.t : 18 * 60, loc, km: kmv, cur, last, ocupado, vuelve: !cur && !!last && libreDesde > now });
  }
  const cerca = si.filter((x) => x.km != null && x.km <= P(dia).kmCerca && x.libreDesde <= now + 90).sort((a, b) => a.km! - b.km!)[0] ?? null;
  const libre = [...si].sort((a, b) => a.libreDesde - b.libreDesde)[0] ?? null;
  const orden: CamionQueSirve[] = [];
  if (cerca) orden.push({ ...cerca, por: "cerca" });
  if (libre && (!cerca || libre.veh !== cerca.veh)) orden.push({ ...libre, por: "libre" });
  si.filter((x) => !orden.find((o) => o.veh === x.veh)).sort((a, b) => a.libreDesde - b.libreDesde).forEach((x) => orden.push({ ...x, por: "otro" }));
  const nadieLibre = hoy && si.length > 0 && si.every((x) => x.libreDesde > now + 45);
  return { si, no, cerca, libre, orden: orden.slice(0, 4), nadieLibre, ahora: now };
}
export const txtCerca = (dia: DiaHoja, x: CamionQueSirve) => `${nombreDe(dia, x.ch)} en ${lugarDeKey(dia, x.loc).n} (${kmTxt(x.km ?? 0)})`;
export function txtLibre(dia: DiaHoja, x: CamionQueSirve, now: number): string {
  const n = nombreDe(dia, x.ch);
  if (x.libreDesde <= now + 5) return `${n}, ${esDep(dia, x.loc) ? "en el depósito" : `en ${lugarDeKey(dia, x.loc).n}`}`;
  if (x.cur && x.cur.tipo === "taller") return `${n}, después de ${lugar(dia, x.cur.haciaEf).tipo === "vtv" ? "la VTV" : "el taller"} ~${hm5(x.libreDesde)}`;
  if (x.vuelve || x.cur?.vuelta) return `${n}, vuelve al depósito ~${hm(Math.ceil(x.libreDesde / 5) * 5)}`;
  return `${n}, ~${hm5(x.libreDesde)}`;
}
export const txtNadieLibre = (dia: DiaHoja, q: CamionesQueSirven) =>
  `Nadie libre a las ${hm(q.ahora)}: ${q.si.map((x) => x.ocupado || `${nombreDe(dia, x.ch)} hasta ~${hm5(x.libreDesde)}`).join(" · ")}`;

function vencido(dia: DiaHoja, V: Vehiculo, tipo: "vtv" | "seguro_vehiculo" | "cnrt"): string | null {
  const v = V.vencimientos.filter((x) => x.tipo === tipo).sort((a, b) => (a.vence < b.vence ? 1 : -1))[0];
  return v && v.vence < dia.fecha ? v.vence : null;
}
/** "El AH 410 LD tiene la VTV vencida desde el 02/10" (advierte, no bloquea). */
export function vencimientosTxt(dia: DiaHoja, vehId: string): string[] {
  const V = vehiculo(dia, vehId);
  if (!V) return [];
  const nombres = { vtv: "la VTV", seguro_vehiculo: "el seguro", cnrt: "la CNRT" } as const;
  return (["vtv", "seguro_vehiculo", "cnrt"] as const).flatMap((t) => {
    const f = vencido(dia, V, t);
    return f ? [`El ${V.patente} tiene ${nombres[t]} vencid${t === "seguro_vehiculo" ? "o" : "a"} desde el ${ddmm(f)}`] : [];
  });
}

// ═══════════════════════════ Pedidos ══════════════════════════════════════════

export type EstadoPedido =
  | { k: "anulado" }
  | { k: "hecho"; v: ViajeCalc }
  | { k: "en"; v: ViajeCalc }
  | { k: "esperando" }
  | { k: "sin" };

export function estadoPedido(dia: DiaHoja, p: Pedido, ahora: Minutos): EstadoPedido {
  if (p.estado === "anulado") return { k: "anulado" };
  if (p.viajeId) {
    const v = viajeCalc(dia, p.viajeId);
    if (v && v.estado === "hecho") return { k: "hecho", v };
    if (v && v.estado === "planeado") return { k: "en", v };
  }
  if (p.estado === "hecho") return { k: "sin" };
  if (p.esperandoHastaMin != null && ahora < p.esperandoHastaMin) return { k: "esperando" };
  return { k: "sin" };
}

const URG_ORD: Record<Pedido["urgencia"], number> = { frena: 0, hora: 1, cliente: 2, hoy: 3, cuando_se_pueda: 4 };
/**
 * La cola (§7): frena la obra, con hora límite (la más cercana), le prometimos al cliente,
 * hoy, cuando se pueda; dentro del grupo el más viejo. El orden a mano gana.
 */
export function ordenCola(ps: Pedido[]): Pedido[] {
  return [...ps].sort((a, b) =>
    a.ordenManual != null || b.ordenManual != null
      ? (a.ordenManual ?? 999) - (b.ordenManual ?? 999)
      : URG_ORD[a.urgencia] - URG_ORD[b.urgencia] ||
        (toMin(a.horaLimite) ?? 9999) - (toMin(b.horaLimite) ?? 9999) ||
        (vieneDeAyer(a) ? 0 : 1) - (vieneDeAyer(b) ? 0 : 1) ||
        a.creadoMin - b.creadoMin);
}
export const vieneDeAyer = (p: Pedido) => p.fechaOriginal < p.fecha;

function avisoChoferPend(dia: DiaHoja, ch: string): EstadoEnvio | null {
  const e = ctx(dia).envioPor.get(ch);
  if (!e || e.enviadaMin == null || e.anulado) return null;
  const st = estadoEnvio(dia, { pid: ch, rol: "chofer" });
  return st.k === "cambiada" ? st : null;
}
/** ¿El chofer todavía no sabe de este viaje (o de su nueva hora)? */
export function viajeSinAvisar(dia: DiaHoja, v: ViajeCalc): boolean {
  const ch = choferDe(dia, v);
  if (!ch) return false;
  const e = ctx(dia).envioPor.get(ch);
  if (!e || e.enviadaMin == null || e.anulado) return false;
  if (!avisoChoferPend(dia, ch)) return false;
  const snap = e.snap?.tipo === "chofer" ? e.snap : null;
  const o = snap?.viajes.find((x) => x.k === v.id);
  return !o || (!!v.hora && o.hora !== normHora(v.hora));
}

export type ItemCola = { p: Pedido; st: EstadoPedido; sinAvisar?: string; noVisto?: string };
/** La cola agrupada por de quién es la pelota (§7). */
export function cola(dia: DiaHoja, ahora: Minutos): { vos: ItemCola[]; esp: ItemCola[]; camino: ItemCola[]; hechos: ItemCola[] } {
  const ps = dia.pedidos.filter((p) => p.fecha === dia.fecha && p.estado !== "anulado");
  const vos: ItemCola[] = [], esp: ItemCola[] = [], camino: ItemCola[] = [], hechos: ItemCola[] = [];
  for (const p of ordenCola(ps)) {
    const st = estadoPedido(dia, p, ahora);
    if (st.k === "sin") vos.push({ p, st });
    else if (st.k === "esperando") esp.push({ p, st });
    else if (st.k === "en") {
      const ch = choferDe(dia, st.v);
      if (ch && viajeSinAvisar(dia, st.v)) vos.push({ p, st, sinAvisar: ch });
      else {
        const e = ch ? ctx(dia).envioPor.get(ch) : null;
        const snap = e?.snap?.tipo === "chofer" ? e.snap : null;
        if (e && ch && e.cambioMin != null && (e.recibidaMin == null || e.recibidaMin < e.cambioMin) && ahora - e.cambioMin > P(dia).minutosNoVisto && snap?.viajes.find((x) => x.k === st.v.id)) esp.push({ p, st, noVisto: ch });
        else camino.push({ p, st });
      }
    } else if (st.k === "hecho") hechos.push({ p, st });
  }
  return { vos, esp, camino, hechos };
}

export type Sugerido = {
  key: string;
  regla: "arranca" | "termina";
  otId: number;
  c: number;
  tipo: TipoPedido;
  txt: string;
  que: string;
  horaFija: Hora | null;
  cargaDeposito: Hora | null;
  noAntesDe: Hora | null;
  /** Si la cuadrilla va todo el día con un camión, se propone en ese camión. */
  enCamion: string | null;
};

/**
 * Los pedidos que la app propone para un día a partir del tablero (§7): el material del
 * primer día de un armado y lo desarmado del último día de un desarme. Un "No hace falta"
 * (pedido anulado con la regla) o uno aceptado hacen que no vuelva a aparecer.
 */
export function sugeridosDe(dia: DiaHoja, ahora: Minutos): Sugerido[] {
  if (esPasado(ahora)) return [];
  const usados = new Set(dia.pedidos.filter((p) => p.sugeridoRegla && p.fechaOriginal === dia.fecha).map((p) => `${p.sugeridoRegla}-${p.sugeridoOtId}`));
  const out: Sugerido[] = [];
  const ini = toMin(P(dia).inicioObra)!;
  for (const c of cuadrillasActivas(dia)) {
    for (const ob of obrasCon(dia, c)) {
      const o = ob.o;
      const pri = o.dia == null || o.dia === 1;
      const ult = o.dia == null || o.totalDias == null || o.dia === o.totalDias;
      let s: Sugerido | null = null;
      if (o.tipo === "armado" && pri) {
        s = { key: `arranca-${o.otId}`, regla: "arranca", otId: o.otId, c, tipo: "lleva_material", txt: `Arranca el armado de ${o.corto} (${cNombre(dia, c)}): llevar el material`, que: `Material del armado de ${o.corto} (según cómputo)`, horaFija: hm(ini), cargaDeposito: hm(ini - 30), noAntesDe: null, enCamion: null };
      } else if (o.tipo === "desarme" && ult) {
        s = { key: `termina-${o.otId}`, regla: "termina", otId: o.otId, c, tipo: "trae_material", txt: `Termina el desarme de ${o.corto}: traer lo desarmado`, que: "Lo desarmado", horaFija: null, cargaDeposito: null, noAntesDe: o.fraccion < 1 ? hm(ob.fin) : hm(toMin(P(dia).finJornada)! - 60), enCamion: null };
      }
      if (!s || usados.has(s.key)) continue;
      const h = hojaDeCuadrilla(dia, c);
      if (h && h.modo === "todo_el_dia" && h.vehiculoId && s.regla === "termina") {
        s.enCamion = h.vehiculoId;
        s.txt = `Termina el desarme de ${o.corto}: ${nombreDe(dia, h.choferId)} trae lo desarmado al terminar`;
      }
      out.push(s);
    }
  }
  return out;
}

/** Dónde soltarlo por defecto en la fila: después de lo hecho (hoy) o cerca de su hora. */
export function posicionAuto(dia: DiaHoja, veh: string, ped: Pick<Pedido, "horaFija" | "noAntesDe" | "horaLimite">, ahora: Minutos): { orden: number; prevId: string | null } {
  const ts = calcVeh(dia, veh);
  let i = -1;
  if (esHoy(ahora)) ts.forEach((v, k) => { if (v.estado !== "planeado" || v.t <= ahora) i = k; });
  else {
    const target = toMin(ped.horaFija) ?? toMin(ped.noAntesDe) ?? (toMin(ped.horaLimite) != null ? toMin(ped.horaLimite)! - 90 : 9 * 60);
    ts.forEach((v, k) => { if (v.t <= target) i = k; });
  }
  const a = ts[i], b = ts[i + 1];
  return { orden: a ? (b ? (a.orden + b.orden) / 2 : a.orden + 30) : b ? b.orden - 30 : 9 * 60, prevId: a?.id ?? null };
}

export type ViajeNuevo = Omit<Viaje, "id" | "fecha" | "estado" | "hechoMin" | "hechoPor" | "noPudoMotivo" | "anuladoMotivo" | "foto" | "creadoMin" | "version">;
export type PlanPoner =
  | { sumarA: string; carga: string }
  | { nuevo: ViajeNuevo; cederVueltaDe: string | null };

/**
 * Poner un pedido en un camión: se vuelve un viaje, o se suma a uno que va al mismo lugar
 * (`sobre`). Si el viaje de antes era un "trae" que volvía al depósito, la vuelta pasa al
 * nuevo ("después de cargar en Juramento 2145, llevá 6 tablones a Cabildo"). Devuelve qué
 * escribir; lo escribe servicio.ts.
 */
export function planPonerPedido(dia: DiaHoja, ped: Pedido, veh: string, ahora: Minutos, o: { sobre?: string | null; orden?: number | null } = {}): PlanPoner {
  if (o.sobre) {
    const v = dia.viajes.find((x) => x.id === o.sobre);
    if (v && keyDe(dia, haciaDe(dia, v)) === keyDe(dia, ped.hacia)) {
      return { sumarA: v.id, carga: `${v.carga ? `${v.carga} + ` : ""}${lowFirst(ped.que)}` };
    }
  }
  const ts = calcVeh(dia, veh);
  let orden: number;
  let prev: ViajeCalc | null;
  if (ped.horaFija) { orden = toMin(ped.horaFija)!; prev = ts.filter((v) => v.orden < orden).pop() ?? null; }
  else if (o.orden != null) { orden = o.orden; prev = ts.filter((v) => v.orden < orden).pop() ?? null; }
  else { const pa = posicionAuto(dia, veh, ped, ahora); orden = pa.orden; prev = pa.prevId ? ts.find((v) => v.id === pa.prevId) ?? null : null; }
  const hoy = esHoy(ahora);
  const nuevo: ViajeNuevo = {
    vehiculoId: veh,
    choferId: choferDelCamion(dia, veh),
    fleteExterno: null,
    tipo: ped.tipo,
    hojaId: null,
    cuadrillaOdooId: ped.hacia.otId != null ? cuadrillaDeObra(dia, ped.hacia.otId) : null,
    hacia: ped.hacia,
    desde: ped.desde,
    orden,
    hora: ped.horaFija,
    noAntesDe: ped.horaFija ? null : hoy ? hm(Math.max(r5(ahora + 10), toMin(ped.noAntesDe) ?? 0)) : ped.noAntesDe,
    duracionMin: ped.duracionMin,
    vuelta: ped.tipo === "trae_material",
    vueltaCarga: null,
    carga: ped.que,
    cargaDeposito: ped.cargaDeposito,
    okTodoElDia: false,
  };
  let cederVueltaDe: string | null = null;
  if (prev && prev.vuelta && !prev.hojaId && prev.estado !== "no_pudo" && !nuevo.vuelta && (nuevo.tipo === "lleva_material" || nuevo.tipo === "otro")) {
    if (prev.estado === "planeado" || (hoy && ahora < prev.fin)) {
      cederVueltaDe = prev.id;
      nuevo.vuelta = true;
      nuevo.vueltaCarga = `${prev.carga ? lowFirst(prev.carga) : "lo desarmado"} de ${lugar(dia, prev.haciaEf).n}`;
      nuevo.desde = prev.haciaEf;
      if (nuevo.carga && !/de lo desarmado/.test(nuevo.carga) && prev.tipo === "trae_material") nuevo.carga = `${nuevo.carga} (de lo desarmado)`;
    }
  }
  return { nuevo, cederVueltaDe };
}

// ═══════════════════════════ Avisos del despacho (§9) ═════════════════════════

export type Boton = {
  /** Lo que dice el botón. */
  l: string;
  /**
   * Qué hace (lo interpreta la pantalla): sacar · usarCargo · agregar · focoAgregar · chEd ·
   * pasarChofer · irA · elegirChoferViaje · vuelvenSolos · verCamion · verViaje · avisarTarde ·
   * okTodo · volverCola · llamar · marcarHecho · avisarChofer · abrirEnvio · reenviar · dlgCel ·
   * irCamiones · tablero · esperar · poner · pasarManana · fleteDe · liberar.
   */
  a: string;
  c?: number;
  p?: string;
  id?: string;
  veh?: string;
  from?: number;
  foco?: "lleva" | "busca";
};

export type Aviso = {
  k: string;
  nivel: "rojo" | "amb" | "";
  t: string;
  bs: Boton[];
  ids?: (string | null)[];
  c?: number | null;
  cruce?: [number, number];
  veh?: string;
  ch?: string;
  ped?: string;
};

/** Los avisos de la fila de un camión (la tabla de §9). Advierten, no bloquean. */
export function avisosVeh(dia: DiaHoja, veh: string, ahora: Minutos): Aviso[] {
  const ts = calcVeh(dia, veh);
  const ch = choferDelCamion(dia, veh);
  const V = vehiculo(dia, veh)!;
  const td = todoVeh(dia, veh);
  const N = (id: string | null | undefined) => nombreDe(dia, id);
  const out: Aviso[] = [];
  for (const v of ts) {
    if (v.estado !== "planeado") continue;
    const c = cuadrillaDeViaje(dia, v);
    if (v.conflicto) {
      const pv = v.conflicto.prevId ? ts.find((x) => x.id === v.conflicto!.prevId) ?? null : null;
      const pc = pv ? cuadrillaDeViaje(dia, pv) : null;
      if (v.tipo === "busca" && c != null) {
        out.push({ k: `tarde-${v.id}`, nivel: "rojo", c, ids: [v.id, pv?.id ?? null], t: `${N(ch)} llegaría ~${hm5(v.conflicto.llega)} a buscar a la ${cNombre(dia, c)} (${normHora(v.hora)})`, bs: [{ l: "Ver el viaje", a: "verViaje", id: pv ? pv.id : v.id }, { l: `Avisar a ${N(recibeDe(dia, c))}`, a: "avisarTarde", id: v.id }] });
      } else if (pv && pv.tipo === "lleva" && v.tipo === "lleva" && normHora(pv.hora) === normHora(v.hora) && pc != null && c != null) {
        out.push({ k: `choque-${pv.id}-${v.id}`, nivel: "rojo", cruce: [pc, c], ids: [pv.id, v.id], t: `${N(ch)} lleva a la ${cNombre(dia, pc)} y a ${laC(dia, c)} a las ${normHora(v.hora)}`, bs: [] });
      } else if (pv && pc != null && c != null && pc !== c && (pv.tipo === "lleva" || pv.tipo === "busca") && (v.tipo === "lleva" || v.tipo === "busca")) {
        out.push({ k: `choque-${pv.id}-${v.id}`, nivel: "rojo", cruce: [pc, c], ids: [pv.id, v.id], t: `${N(ch)} ${pv.tipo} a la ${cNombre(dia, pc)} a las ${normHora(pv.hora)} y ${v.tipo} a ${laC(dia, c)} a las ${normHora(v.hora)}: no llega`, bs: [] });
      } else {
        const queEs = v.tipo === "taller" ? (lugar(dia, v.haciaEf).tipo === "vtv" ? "la VTV" : "el taller") : lowFirst(cortoV(dia, v));
        out.push({ k: `noentra-${v.id}`, nivel: "rojo", c, ids: [v.id, pv?.id ?? null], t: `${N(ch)}: ${pv ? `${lowFirst(cortoV(dia, pv))} termina ~${hm5(v.conflicto.llega)}` : "lo anterior termina tarde"} y ${queEs} es a las ${normHora(v.hora)}`, bs: [{ l: "Ver el viaje", a: "verViaje", id: pv ? pv.id : v.id }] });
      }
    }
    const L = lugar(dia, v.haciaEf);
    if (L.cierra != null && v.t + v.dur > L.cierra) {
      out.push({ k: `cerrado-${v.id}`, nivel: "rojo", ids: [v.id], t: `${L.n} atiende hasta las ${hm(L.cierra)} y ${N(ch)} terminaría de cargar ~${hm5(v.t + v.dur)}`, bs: [{ l: "Ver el viaje", a: "verViaje", id: v.id }] });
    }
    if (td && c !== td && !v.okTodoElDia) {
      const hTd = hojaDeCuadrilla(dia, td)!;
      out.push({ k: `todo-${v.id}`, nivel: "amb", ids: [v.id], c: td, t: `${N(ch)} está todo el día con la ${cNombre(dia, td)}. Si lo sacás, ${laC(dia, td)} se queda sin ${V.tipo === "hidrogrua" ? "hidrogrúa" : "camión"} de ${hm5(v.t)} a ${hm5(v.fin)}`, bs: [{ l: `Sacarlo un rato y avisar a ${N(aCargoDe(hTd))}`, a: "okTodo", id: v.id }, { l: "Volver a la cola", a: "volverCola", id: v.id }] });
    }
    for (const p of pedidosDeViaje(dia, v.id)) {
      if (p.necesita === "hidrogrua" && V.tipo !== "hidrogrua") out.push({ k: `hid-${v.id}`, nivel: "rojo", ids: [v.id], t: `El pedido necesita hidrogrúa y el ${V.patente} es ${tipoVehTxt(V)}`, bs: [{ l: "Volver a la cola", a: "volverCola", id: v.id }] });
      if (p.horaLimite && v.t > toMin(p.horaLimite)!) out.push({ k: `hl-${v.id}`, nivel: "rojo", ids: [v.id], t: `Lo necesitan antes de las ${hCorta(normHora(p.horaLimite))} y llega ~${hm5(v.t)}`, bs: [{ l: "Ver el viaje", a: "verViaje", id: v.id }] });
    }
    const pa = parcialDe(dia, ch);
    if (pa && pa.horaHasta && v.t + v.dur > toMin(pa.horaHasta)!) {
      out.push({ k: `parcial-${ch}`, nivel: "rojo", ids: [v.id], t: `${N(ch)} se retira a las ${hCorta(normHora(pa.horaHasta))} (${TIPO_AUSENCIA_TXT[pa.tipo]}) y tiene viajes después`, bs: [] });
    }
  }
  if (esHoy(ahora)) {
    const da = dondeAnda(dia, veh, ahora);
    if (da.sinNoticias) {
      const cur = ts.find((v) => v.estado === "planeado")!;
      out.push({ k: `sinnot-${veh}`, nivel: "amb", ids: [cur.id], t: `${N(ch)}: ${lowFirst(da.t)}`, bs: [{ l: `Llamar a ${N(ch)}`, a: "llamar", p: ch ?? undefined }, { l: "Marcar hecho", a: "marcarHecho", id: cur.id }] });
    }
  }
  if (ts.length) for (const [i, t] of vencimientosTxt(dia, veh).entries()) out.push({ k: `venc-${veh}-${i}`, nivel: "amb", ids: [], t, bs: [] });
  if (ts.length && (V.estado === "en_taller" || V.estado === "fuera_servicio")) {
    out.push({ k: `estado-${veh}`, nivel: "rojo", ids: [], t: `El ${V.patente} está ${V.estado === "en_taller" ? "en el taller" : "fuera de servicio"} (Vehículos)`, bs: [] });
  }
  const seen = new Set<string>();
  return out.filter((x) => (seen.has(x.k) ? false : (seen.add(x.k), true))).map((x) => ({ ...x, veh }));
}

/** Viaje sin avisar al chofer, o aviso que no vio. */
export function avisosChofer(dia: DiaHoja, ch: string, ahora: Minutos): Aviso[] {
  const out: Aviso[] = [];
  const e = ctx(dia).envioPor.get(ch);
  if (!e || e.enviadaMin == null || e.anulado) return out;
  const N = nombreDe(dia, ch);
  const st = avisoChoferPend(dia, ch);
  if (st && st.k === "cambiada") {
    const creados = st.ds.filter((x) => x.nuevo).map((x) => dia.viajes.find((v) => v.id === x.v?.k)?.creadoMin).filter((x): x is number => x != null);
    const desde = Math.min(...creados, ahora);
    const uno = st.ds.length === 1 && st.ds[0].nuevo;
    out.push({ k: `sinav-${ch}`, ch, nivel: ahora - desde >= P(dia).minutosSinAvisar ? "amb" : "", t: uno ? `${N} no sabe del viaje a ${st.ds[0].v?.hacia ?? ""}` : `${N} no sabe ${st.ds.length === 1 ? "el cambio" : `${st.ds.length} cambios`} de sus viajes`, bs: [{ l: `Avisar a ${N}${st.ds.length > 1 ? ` (${st.ds.length} cambios)` : ""}`, a: "avisarChofer", p: ch }] });
  } else if (e.cambioMin != null && (e.recibidaMin == null || e.recibidaMin < e.cambioMin) && ahora - e.cambioMin > P(dia).minutosNoVisto) {
    out.push({ k: `novisto-${ch}`, ch, nivel: "amb", t: `${N} no abrió el viaje nuevo (${hm(e.cambioMin)})`, bs: [{ l: `Llamar a ${N}`, a: "llamar", p: ch }] });
  }
  return out;
}

/** Los lleva y busca de las hojas que quedaron sin camión: "Nadie busca a la Cuadrilla 3". */
export function sinCamionDe(dia: DiaHoja): Viaje[] {
  return viajesVigentes(dia).filter((v) => v.hojaId && (v.tipo === "lleva" || v.tipo === "busca") && !v.vehiculoId && !v.fleteExterno && v.estado === "planeado");
}

// ═══════════════════════════ Problemas de una hoja (§8) ═══════════════════════

export type Problema = {
  k: string;
  /** bloq: cuenta en "Falta para mandar" · aviso: ámbar, no cuenta. */
  nivel: "bloq" | "aviso";
  /** La línea de la bandeja. */
  t: string;
  /** El texto en la tarjeta. */
  card: string;
  corto?: string;
  bs: Boton[];
  /** Botones distintos en la bandeja que en la tarjeta. */
  bsFalta?: Boton[];
  cruce?: boolean;
  /** Pasó la hora de alarma (19:00 del día anterior). */
  rojo: boolean;
};

const alarmaEnvio = (dia: DiaHoja, ahora: Minutos) => ahora >= toMin(P(dia).horaLimiteEnvio)! - 1440;

/**
 * A quién sugerir a cargo (§3), en este orden: el que tuvo esta obra el día anterior, el
 * que tuvo esta cuadrilla, el responsable de Configuración. Si el sugerido no viene o ya
 * está a cargo de otra, se salta al siguiente y se dice por qué.
 */
export function sugerirACargo(dia: DiaHoja, c: number): { pid: string; por: string } | null {
  const ant = dia.anterior;
  const cands: { pid: string; por: string }[] = [];
  const cuando = ant ? (addDia(ant.fecha, 1) === dia.fecha ? "ayer" : `el ${diaSemana(ant.fecha)}`) : "";
  if (ant) {
    for (const o of obrasDe(dia, c)) {
      const oa = ant.obras.find((x) => x.otId === o.otId);
      const ha = oa ? ant.hojas.find((h) => h.cuadrillaOdooId === oa.cuadrillaOdooId) : null;
      const pid = aCargoDe(ha);
      if (pid) cands.push({ pid, por: `${cuando} en ${o.corto}` });
    }
    const hc = ant.hojas.find((h) => h.cuadrillaOdooId === c);
    const pid = aCargoDe(hc);
    if (pid) cands.push({ pid, por: `la tuvo el ${diaSemana(ant.fecha)}` });
  }
  const ult = dia.ultimasHojas.find((u) => u.hoja.cuadrillaOdooId === c && (!ant || u.fecha !== ant.fecha));
  if (ult && aCargoDe(ult.hoja)) cands.push({ pid: aCargoDe(ult.hoja)!, por: `la tuvo el ${ddmm(ult.fecha)}` });
  const resp = cuadrilla(dia, c)?.plantel?.responsableId;
  if (resp) cands.push({ pid: resp, por: "responsable en Configuración" });
  const saltos: string[] = [];
  for (const k of cands) {
    if (!persona(dia, k.pid)?.activo) continue;
    if (ausenciaDe(dia, k.pid)) { saltos.push(`${nombreDe(dia, k.pid)} no viene`); continue; }
    const otra = cuadrillasActivas(dia).find((x) => x !== c && aCargoDe(hojaDeCuadrilla(dia, x)) === k.pid);
    if (otra != null) { saltos.push(`${nombreDe(dia, k.pid)} está a cargo de ${laC(dia, otra)}`); continue; }
    return { pid: k.pid, por: saltos.length ? saltos[0] : k.por };
  }
  const h = hojaDeCuadrilla(dia, c);
  const gente = h ? genteDe(h) : [];
  const disponibles = gente.filter((x) => !ausenciaDe(dia, x));
  const p = disponibles.find((x) => persona(dia, x)?.puedeEstarACargo) ?? disponibles[0];
  return p ? { pid: p, por: "de los que van" } : null;
}

/** Los que pueden ir y no están en ninguna hoja: primero los que pueden estar a cargo. */
export function sinAsignar(dia: DiaHoja): string[] {
  return memo(dia, "sinAsignar", () =>
    dia.personas
      .filter((p) => p.activo && !p.externa && !p.esChofer && !ausenciaDe(dia, p.id) && hojaDe(dia, p.id) == null)
      .sort((a, b) => Number(b.puedeEstarACargo) - Number(a.puedeEstarACargo) || a.nombre.localeCompare(b.nombre, "es"))
      .map((p) => p.id));
}
export function sugerirPersona(dia: DiaHoja): string | null {
  const l = sinAsignar(dia);
  return l.find((p) => !persona(dia, p)?.puedeEstarACargo) ?? l[0] ?? null;
}
/** De dos tarjetas que reclaman lo mismo, la que se tocó último (la que muestra el aviso fuerte). */
function tocada(dia: DiaHoja, a: number, b: number): number {
  const ta = hojaDeCuadrilla(dia, a)?.choferTocadoMin ?? -1e9;
  const tb = hojaDeCuadrilla(dia, b)?.choferTocadoMin ?? -1e9;
  return ta === tb ? Math.max(a, b) : ta > tb ? a : b;
}
const verboV = (v: { tipo: TipoViaje }) => (v.tipo === "lleva" ? "lleva" : v.tipo === "busca" ? "busca" : v.tipo === "mueve" ? "mueve" : "");

/** Lo que está mal en una hoja, en una línea de texto cada cosa, con el botón que lo arregla. */
export function problemas(dia: DiaHoja, c: number, ahora: Minutos): Problema[] {
  if (esPasado(ahora) || suspendida(dia, c)) return [];
  const h = hojaDeCuadrilla(dia, c);
  if (!h) return [];
  const out: Problema[] = [];
  const rojo = alarmaEnvio(dia, ahora);
  const N = (id: string | null | undefined) => nombreDe(dia, id);
  const C = cNombre(dia, c);
  const add = (o: Omit<Problema, "nivel" | "rojo" | "bs"> & { nivel?: Problema["nivel"]; bs?: Boton[] }) =>
    out.push({ nivel: "bloq", bs: [], rojo: false, ...o });

  for (const p of genteDe(h)) {
    const a = ausenciaDe(dia, p);
    if (a) add({ k: `aus-${p}`, corto: `${N(p)} no viene (${cTag(dia, c)})`, t: `${N(p)} está en la ${C} y no viene (${TIPO_AUSENCIA_TXT[a.tipo]})`, card: `${N(p)} no viene (${ausTexto(a, true, dia.fecha)})`, bs: [{ l: "Sacarlo", a: "sacar", c, p }] });
  }
  if (!recibeDe(dia, c)) {
    const s = sugerirACargo(dia, c);
    add({ k: "cargo", corto: `${C} sin nadie a cargo`, t: `${C} · sin nadie a cargo${s ? ` · Sugerido: ${N(s.pid)} (${s.por})` : ""}`, card: `Sin nadie a cargo${s ? `. Sugerido: ${N(s.pid)} (${s.por})` : ""}`, bs: s ? [{ l: `Usar ${N(s.pid)}`, a: "usarCargo", c, p: s.pid }] : [] });
  }
  const van = vanDe(dia, c), pv = prevista(dia, c);
  if (van < pv) {
    const s = sugerirPersona(dia);
    add({ k: "pocos", corto: `${C} · ${van} de ${pv}`, t: `${C} · ${van} de ${pv} personas`, card: `Falta ${pv - van === 1 ? "1 persona" : `${pv - van} personas`} (${van} de ${pv})${s ? `. Sugerido: ${N(s)} (sin asignar)` : ""}`, bs: s ? [{ l: `Poner a ${N(s)}`, a: "agregar", c, p: s }, { l: "Agregar", a: "focoAgregar", c }] : [{ l: "Agregar", a: "focoAgregar", c }] });
  }
  const fr = sumaFr(dia, c);
  if (fr > 1) {
    const ob = obrasCon(dia, c);
    const u = ob[ob.length - 1];
    add({ k: "carga", t: `La ${C} tiene ${frSuma(fr)} jornada: ${u.o.corto} terminaría ~${hm5(u.fin)}`, card: `Tiene ${frSuma(fr)} jornada: ${u.o.corto} terminaría ~${hm5(u.fin)}`, bs: [{ l: "Ver el tablero", a: "tablero" }] });
  }
  if (h.modo !== "sin") {
    if (!h.choferId) add({ k: "chofer", t: `${C} · falta el chofer`, card: "Falta el chofer", bs: [{ l: "Elegir", a: "chEd", c }] });
    else {
      const a = ausenciaDe(dia, h.choferId);
      if (a) add({ k: "chaus", t: `${N(h.choferId)} no viene (${TIPO_AUSENCIA_TXT[a.tipo]}): la ${C} quedó sin chofer para llevarlos`, card: `${N(h.choferId)} no viene (${TIPO_AUSENCIA_TXT[a.tipo]})`, bs: [{ l: "Elegir otro", a: "chEd", c }] });
      const pa = parcialDe(dia, h.choferId);
      const bu = dia.viajes.find((v) => v.hojaId === h.id && v.tipo === "busca" && v.estado !== "anulado");
      if (pa?.horaHasta && h.modo === "lleva_trae" && bu?.hora && toMin(bu.hora)! > toMin(pa.horaHasta)!) {
        add({ k: "chpar", t: `${N(h.choferId)} se retira a las ${hCorta(normHora(pa.horaHasta))} y busca a la ${C} a las ${normHora(bu.hora)}`, card: `${N(h.choferId)} se retira a las ${hCorta(normHora(pa.horaHasta))} (${TIPO_AUSENCIA_TXT[pa.tipo]}) y los busca a las ${normHora(bu.hora)}`, bs: [{ l: "Elegir otro", a: "chEd", c }] });
      }
      if (h.modo === "todo_el_dia") {
        for (const o of todoDe(dia, h.choferId).filter((x) => x !== c)) {
          if (tocada(dia, c, o) === c) add({ k: `chdup-${o}`, cruce: true, t: `${N(h.choferId)} está todo el día con la ${cNombre(dia, o)} y con ${laC(dia, c)}`, card: `${N(h.choferId)} ya está todo el día con ${laC(dia, o)}`, bs: [{ l: `Sacarlo de ${laC(dia, o)}`, a: "pasarChofer", c, from: o }, { l: "Elegir otro", a: "chEd", c }] });
          else add({ k: `chdup-${c}`, cruce: true, t: `${N(h.choferId)} está todo el día con la ${cNombre(dia, o)} y con ${laC(dia, c)}`, card: `${N(h.choferId)} también figura todo el día en ${laC(dia, o)}`, bs: [{ l: `Ver ${laC(dia, o)}`, a: "irA", c: o }] });
        }
        for (const v of viajesVigentes(dia).filter((v) => v.hojaId && v.hojaId !== h.id && v.vehiculoId === h.vehiculoId && h.vehiculoId && (v.tipo === "lleva" || v.tipo === "busca"))) {
          const vc = cuadrillaDeViaje(dia, v)!;
          add({ k: `chmix-${v.id}`, t: `${N(h.choferId)} está todo el día con ${laC(dia, c)} y ${verboV(v)} a ${laC(dia, vc)} a las ${normHora(v.hora)}`, card: `${N(h.choferId)} también ${verboV(v)} a ${laC(dia, vc)} a las ${normHora(v.hora)}`, bs: [{ l: "Elegir otro", a: "chEd", c: vc }] });
        }
      }
    }
    if (!h.vehiculoId) add({ k: "veh", t: `${C} · falta el vehículo`, card: "Falta el vehículo", bs: [{ l: "Elegir", a: "chEd", c }] });
    else {
      const otro = cuadrillasActivas(dia).find((x) => x !== c && hojaDeCuadrilla(dia, x)!.modo === "todo_el_dia" && hojaDeCuadrilla(dia, x)!.vehiculoId === h.vehiculoId);
      if (otro != null && !(h.modo === "todo_el_dia" && hojaDeCuadrilla(dia, otro)!.choferId === h.choferId) && (h.modo === "lleva_trae" || tocada(dia, c, otro) === c)) {
        add({ k: `vehdup-${otro}`, t: `El ${patente(dia, h.vehiculoId)} está todo el día con la ${cNombre(dia, otro)}`, card: `El ${patente(dia, h.vehiculoId)} está todo el día con la ${cNombre(dia, otro)}`, bs: [{ l: "Elegir otro", a: "chEd", c }] });
      }
      const quien = choferDelCamion(dia, h.vehiculoId);
      if (h.choferId && quien && quien !== h.choferId) add({ k: "vehch", t: `El ${patente(dia, h.vehiculoId)} lo maneja ${N(quien)} el ${diaSemana(dia.fecha)}`, card: `El ${patente(dia, h.vehiculoId)} lo maneja ${N(quien)} el ${diaSemana(dia.fecha)}`, bs: [{ l: "Elegir otro", a: "chEd", c }] });
      const V = vehiculo(dia, h.vehiculoId);
      if (V && (V.estado === "en_taller" || V.estado === "fuera_servicio")) add({ k: "vehest", t: `El ${V.patente} está ${V.estado === "en_taller" ? "en el taller" : "fuera de servicio"}`, card: `El ${V.patente} está ${V.estado === "en_taller" ? "en el taller" : "fuera de servicio"}`, bs: [{ l: "Elegir otro", a: "chEd", c }] });
      for (const [i, t] of vencimientosTxt(dia, h.vehiculoId).entries()) add({ k: `venc-${i}`, nivel: "aviso", t, card: t });
    }
    // Lo que viene de los camiones (el mismo motor que la vista Camiones).
    if (h.modo === "lleva_trae") {
      for (const v of sinCamionDe(dia).filter((v) => v.hojaId === h.id)) {
        const dest = lugar(dia, haciaDe(dia, v)).n;
        add({ k: `nadie-${v.id}`, t: `Nadie ${v.tipo} a la ${C} ${v.tipo === "busca" ? "en" : "a"} ${dest}${v.tipo === "lleva" ? ` a las ${normHora(v.hora)}` : ""}`, card: `Nadie ${v.tipo === "busca" ? "los busca" : "los lleva"} (${normHora(v.hora)})`, bs: [{ l: "Elegir chofer", a: "elegirChoferViaje", id: v.id }, ...(v.tipo === "busca" ? [{ l: "Vuelven por su cuenta", a: "vuelvenSolos", c }] : [])] });
      }
      for (const veh of filasCamiones(dia)) {
        for (const x of avisosVeh(dia, veh, ahora)) {
          if (x.cruce && x.cruce.includes(c)) {
            const otra = x.cruce.find((z) => z !== c) ?? c;
            const yo = tocada(dia, c, otra) === c;
            const vs = (x.ids ?? []).map((i) => (i ? dia.viajes.find((v) => v.id === i) : null)).filter(Boolean) as Viaje[];
            const vo = vs.find((v) => cuadrillaDeViaje(dia, v) === otra);
            const vy = vs.find((v) => cuadrillaDeViaje(dia, v) === c);
            const cc = tocada(dia, c, otra);
            add({ k: x.k, cruce: true, t: x.t, bsFalta: [{ l: "Cambiar hora", a: "chEd", c: cc, foco: "lleva" }], card: yo ? x.t : `${nombreDe(dia, choferDelCamion(dia, veh))} también ${vo ? verboV(vo) : "lleva"} a ${laC(dia, otra)} a las ${vo ? normHora(vo.hora) : ""}`, bs: yo ? [{ l: "Cambiar hora", a: "chEd", c, foco: vy?.tipo === "busca" ? "busca" : "lleva" }] : [{ l: `Ver ${laC(dia, otra)}`, a: "irA", c: otra }] });
          } else if (x.c === c && (x.k.startsWith("tarde-") || x.k.startsWith("noentra-"))) {
            add({ k: x.k, t: x.t, card: x.t, bs: [{ l: "Ver el camión", a: "verCamion", veh }] });
          }
        }
      }
      for (const v of dia.viajes.filter((v) => v.hojaId === h.id && (v.tipo === "lleva" || v.tipo === "busca") && v.estado === "no_pudo")) {
        const w = v.tipo === "lleva" ? "llevar" : "buscar";
        add({ k: `np-${v.id}`, t: `${N(choferDe(dia, v))} no pudo ${w} a la ${C}: ${lowFirst(v.noPudoMotivo)}`, card: `${N(choferDe(dia, v))} no pudo ${w === "llevar" ? "llevarlos" : "buscarlos"}: ${lowFirst(v.noPudoMotivo)}`, bs: [{ l: "Ver el camión", a: "verCamion", veh: v.vehiculoId ?? undefined }] });
      }
    }
  }
  const r = recibeDe(dia, c);
  const pr = persona(dia, r);
  if (r && pr && !pr.celular && !pr.telegram) {
    add({ k: `cel-${r}`, corto: `${N(r)} sin celular`, t: `${N(r)} no tiene celular cargado`, card: `${N(r)} no tiene celular cargado: no le puede llegar la hoja`, bs: [{ l: "Cargar celular", a: "dlgCel", p: r }] });
  }
  for (const p of out) p.rojo = p.nivel === "bloq" && rojo;
  return out;
}
export const bloqueos = (dia: DiaHoja, c: number, ahora: Minutos) => problemas(dia, c, ahora).filter((p) => p.nivel === "bloq");

// ═══════════════════════════ Fotos de lo enviado y diferencias ════════════════

export function fotoHoja(dia: DiaHoja, c: number): FotoHoja {
  const h = hojaDeCuadrilla(dia, c)!;
  const ob = obrasCon(dia, c);
  const vs = dia.viajes.filter((v) => v.hojaId === h.id && v.estado !== "anulado");
  const ll = vs.find((v) => v.tipo === "lleva") ?? null;
  const bu = vs.find((v) => v.tipo === "busca") ?? null;
  const notas: Record<string, string> = {};
  for (const i of h.integrantes) if (i.nota) notas[i.personaId] = i.nota;
  const ins: Record<number, unknown> = {};
  for (const o of obrasDe(dia, c)) { const x = ctx(dia).instr.get(o.otId); ins[o.otId] = x ? { h: x.horaInicio, hoy: x.hoy, chips: x.chips } : null; }
  return {
    tipo: "hoja",
    c,
    suspendida: suspendida(dia, c),
    obras: ob.map((x) => ({ id: x.o.otId, dir: x.o.corto, hora: x.hora, est: x.est })),
    gente: genteDe(h),
    aCargo: aCargoDe(h),
    modo: h.modo,
    chofer: h.choferId,
    veh: h.vehiculoId,
    lleva: ll ? normHora(ll.hora) : null,
    busca: bu ? normHora(bu.hora) : null,
    llevaCh: ll ? choferDe(dia, ll) : null,
    buscaCh: bu ? choferDe(dia, bu) : null,
    buscaVeh: bu ? bu.vehiculoId : null,
    enc: { lugar: h.encuentro.lugar, hora: normHora(h.encuentro.hora) ?? h.encuentro.hora, dir: encDir(dia, c) },
    encTxt: encTxt(dia, c),
    nota: h.nota,
    notas,
    instr: JSON.stringify(obrasDe(dia, c).map((o) => ins[o.otId])),
  };
}

export function fotoChofer(dia: DiaHoja, ch: string): FotoChofer {
  return {
    tipo: "chofer",
    viajes: viajesChofer(dia, ch).map((v) => {
      const p = pedidosDeViaje(dia, v.id)[0] ?? null;
      return {
        k: v.id, tipo: v.tipo, c: cuadrillaDeViaje(dia, v), hacia: lugar(dia, v.haciaEf).n, desde: v.desde ? lugar(dia, v.desde).n : null,
        hora: normHora(v.hora), carga: v.carga ?? "", veh: v.vehiculoId,
        pidio: p ? { pid: p.pidioId, hl: normHora(p.horaLimite) } : null,
      };
    }),
    todo: todoDe(dia, ch),
    // Los viajes que se le sacaron y "pasan a mañana" (te saqué un viaje): los anula
    // servicio.ts con motivo, y acá vuelven como aviso mientras sean de su camión.
    sac: dia.viajes
      .filter((v) => v.estado === "anulado" && v.choferId === ch && v.anuladoMotivo && /pasa a mañana|ya no hace falta/i.test(v.anuladoMotivo))
      .map((v) => ({ k: `sac-${v.id}`, txt: `${lugar(dia, haciaDe(dia, v)).n} ${lowFirst(v.anuladoMotivo)}`, t: v.creadoMin })),
  };
}

export type Destinatario = { pid: string | null; rol: "cargo" | "chofer" | "ex"; c?: number | null };

export function rolDe(dia: DiaHoja, pid: string): Destinatario | null {
  for (const c of cuadrillasConHoja(dia)) if (recibeDe(dia, c) === pid) return { pid, rol: "cargo", c };
  if (viajesChofer(dia, pid).length || todoDe(dia, pid).length) return { pid, rol: "chofer" };
  return null;
}
export function fotoDe(dia: DiaHoja, pid: string): Foto | null {
  const r = rolDe(dia, pid);
  if (!r) return null;
  return r.rol === "cargo" ? fotoHoja(dia, r.c!) : fotoChofer(dia, pid);
}

/** Qué cambió entre lo que se le mandó (`old`) y lo de ahora (`cur`), en palabras (§11). */
export function diferencias(dia: DiaHoja, old: Foto | null, cur: Foto | null): Diferencia[] {
  if (!old || !cur) return [];
  const out: Diferencia[] = [];
  const N = (id: string | null | undefined) => nombreDe(dia, id);
  if (old.tipo === "hoja" && cur.tipo === "hoja") {
    if (cur.suspendida && !old.suspendida) return [{ t: `se suspende (${cur.suspendida})` }];
    if (!cur.suspendida && old.suspendida) out.push({ t: "ya no está suspendida" });
    for (const p of old.gente.filter((p) => !cur.gente.includes(p))) {
      const a = ausenciaDe(dia, p);
      const otra = hojaDe(dia, p);
      out.push({ t: `no va ${N(p)}`, motivo: a ? TIPO_AUSENCIA_TXT[a.tipo] : otra != null ? `pasó a la ${cNombre(dia, otra)}` : null });
    }
    for (const p of cur.gente.filter((p) => !old.gente.includes(p))) out.push({ t: `va ${N(p)}` });
    if (old.aCargo !== cur.aCargo && cur.aCargo) out.push({ t: `a cargo: ${N(cur.aCargo)}` });
    const oid = old.obras.map((o) => o.id), cid = cur.obras.map((o) => o.id);
    for (const o of old.obras.filter((o) => !cid.includes(o.id))) {
      const nc = cuadrillaDeObra(dia, o.id);
      out.push({ t: `sale ${o.dir}`, motivo: nc != null ? `pasó a la ${cNombre(dia, nc)}` : null });
    }
    for (const o of cur.obras.filter((o) => !oid.includes(o.id))) out.push({ t: `entra ${o.dir} a las ${o.hora}` });
    for (const o of cur.obras.filter((o) => oid.includes(o.id))) {
      const p = old.obras.find((x) => x.id === o.id)!;
      // Las horas ESTIMADAS no marcan "cambiada" solas (§11): sólo si alguna era fija.
      if (p.hora !== o.hora && !(o.est && p.est)) out.push({ t: `${o.dir} pasa a las ${o.est ? "~" : ""}${o.hora}` });
    }
    if (old.modo !== cur.modo) out.push({ t: cur.modo === "sin" ? "van sin chofer" : cur.modo === "todo_el_dia" ? `${N(cur.chofer) || "el chofer"} queda todo el día` : `los lleva ${N(cur.chofer) || "un chofer"}` });
    else if (old.chofer !== cur.chofer && cur.modo !== "sin") out.push({ t: cur.modo === "todo_el_dia" ? `va ${N(cur.chofer)} todo el día` : `los lleva ${N(cur.chofer)}` });
    if (old.veh !== cur.veh && cur.modo !== "sin" && cur.veh) out.push({ t: `vehículo: ${vehiculoNombre(dia, cur.veh)}`, chico: true });
    if (cur.modo === "lleva_trae" && old.modo === "lleva_trae") {
      if (old.lleva !== cur.lleva && old.enc.hora === cur.enc.hora) out.push({ t: `los lleva a las ${cur.lleva}` });
      if (old.busca !== cur.busca) out.push({ t: cur.busca ? `los busca a las ${cur.busca}` : "vuelven por su cuenta" });
      else if (cur.busca && (old.buscaCh !== cur.buscaCh || old.buscaVeh !== cur.buscaVeh)) out.push({ t: cur.buscaVeh ? `los busca ${N(cur.buscaCh)} a las ${cur.busca}` : "todavía no hay quién los busque" });
    }
    if (old.enc.hora !== cur.enc.hora || old.enc.lugar !== cur.enc.lugar || (cur.enc.lugar === "obra" && old.enc.dir !== cur.enc.dir)) {
      const donde = cur.enc.lugar === "deposito" ? "el depósito" : cur.enc.dir ?? "la obra";
      const antes = cur.enc.lugar === "obra" && old.enc.lugar === "obra" && old.enc.dir && old.enc.dir !== cur.enc.dir ? ` (antes ${old.enc.dir})` : "";
      out.push({ t: `encuentro ${cur.enc.hora} en ${donde}${antes}`, enc: true });
    }
    if (old.nota !== cur.nota && cur.nota) out.push({ t: `nota nueva: «${cur.nota}»` });
    if (old.instr !== cur.instr && oid.join() === cid.join()) out.push({ t: "cambiaron las instrucciones" });
    for (const p of Object.keys(cur.notas)) if (cur.notas[p] && cur.notas[p] !== old.notas[p] && cur.gente.includes(p)) out.push({ t: `${N(p)}: ${cur.notas[p]}` });
  } else if (old.tipo === "chofer" && cur.tipo === "chofer") {
    for (const v of old.viajes.filter((v) => !cur.viajes.find((x) => x.k === v.k))) {
      const sac = cur.sac.find((s) => s.k === `sac-${v.k}`);
      if (!sac) out.push({ t: v.c != null && verboV(v) ? `ya no ${verboV(v)} a la ${cNombre(dia, v.c)}` : `${v.hacia}: ya no va`, sac: true, v });
    }
    for (const v of cur.viajes.filter((v) => !old.viajes.find((x) => x.k === v.k))) {
      const vv = dia.viajes.find((x) => x.id === v.k);
      const txt = v.c != null && verboV(v)
        ? `${v.hora ?? ""} ${verboV(v)} a la ${cNombre(dia, v.c)}`.trim()
        : `${lowFirst(vv ? textoViaje(dia, vv, true) : v.hacia)}${v.pidio?.pid ? ` (${N(v.pidio.pid)}${v.pidio.hl ? `, antes de las ${hCorta(v.pidio.hl)}` : ""})` : ""}`;
      out.push({ t: txt, nuevo: true, v });
    }
    for (const v of cur.viajes) {
      const o = old.viajes.find((x) => x.k === v.k);
      if (o && o.hora !== v.hora && v.hora) out.push({ t: `${verboV(v) && v.c != null ? `${verboV(v)} a ${laC(dia, v.c)}` : v.hacia} a las ${v.hora} (antes ${o.hora ?? "sin hora"})`, hora: true, v });
    }
    const comunes = cur.viajes.filter((v) => old.viajes.find((x) => x.k === v.k)).map((v) => v.k);
    const oComunes = old.viajes.filter((v) => comunes.includes(v.k)).map((v) => v.k);
    if (comunes.join() !== oComunes.join() && !out.some((x) => x.hora)) out.push({ t: "cambió el orden de tus viajes", orden: true });
    if (old.todo.join() !== cur.todo.join()) out.push({ t: cur.todo.length ? `todo el día con la ${cNombre(dia, cur.todo[0])}` : "ya no vas todo el día con una cuadrilla" });
    for (const s of cur.sac.filter((s) => !old.sac.find((x) => x.k === s.k))) out.push({ t: s.txt, sac: true });
  } else out.push({ t: "cambió lo que tenés que hacer" });
  return out;
}
/** "No va Ávila, va Ramírez" */
export const fmtComa = (ds: Diferencia[]) => cap(ds.map((x) => x.t).join(", "));
/** "No va Ávila (enfermedad). Va Ramírez." */
export const fmtFrases = (ds: Diferencia[], motivos = true) => `${ds.map((x) => cap(x.t) + (motivos && x.motivo ? ` (${x.motivo})` : "")).join(". ")}.`;

// ═══════════════════════════ Envíos ═══════════════════════════════════════════

export const envioDe = (dia: DiaHoja, pid: string | null | undefined) => (pid ? ctx(dia).envioPor.get(pid) ?? null : null);

/** A quién le llega algo ese día: los capataces (o quien recibe), los choferes y los que dejaron de estar a cargo. */
export function destinatarios(dia: DiaHoja): Destinatario[] {
  return memo(dia, "destinatarios", () => {
    const out: Destinatario[] = [];
    for (const c of cuadrillasConHoja(dia)) {
      const r = recibeDe(dia, c);
      // Una suspendida sólo si ya se mandó: hay que avisar que no vayan.
      if (suspendida(dia, c) && !(r && envioDe(dia, r)?.enviadaMin != null)) continue;
      out.push({ pid: r, rol: "cargo", c });
    }
    const choferes = new Set<string>();
    for (const v of viajesCalc(dia)) { const ch = choferDe(dia, v); if (ch) choferes.add(ch); }
    for (const c of cuadrillasActivas(dia)) { const h = hojaDeCuadrilla(dia, c)!; if (h.modo === "todo_el_dia" && h.choferId) choferes.add(h.choferId); }
    for (const ch of [...choferes].sort((a, b) => nombreDe(dia, a).localeCompare(nombreDe(dia, b), "es"))) {
      if (!out.find((x) => x.pid === ch)) out.push({ pid: ch, rol: "chofer" });
    }
    for (const e of dia.envios) {
      if (e.enviadaMin != null && !e.anulado && !out.find((x) => x.pid === e.personaId)) {
        out.push({ pid: e.personaId, rol: "ex", c: e.snap?.tipo === "hoja" ? e.snap.c : e.cuadrillaOdooId });
      }
    }
    return out;
  });
}

export type EstadoEnvio =
  | { k: "sinrecibe" }
  | { k: "ex"; e: Envio | null }
  | { k: "sinenviar"; e: Envio | null }
  | { k: "anulado"; e: Envio }
  | { k: "cambiada"; e: Envio; ds: Diferencia[] }
  | { k: "okSinAvisar"; e: Envio; ds: Diferencia[] }
  | { k: "ok"; e: Envio };

export function estadoEnvio(dia: DiaHoja, x: Destinatario): EstadoEnvio {
  if (!x.pid) return { k: "sinrecibe" };
  return memo(dia, `estEnv:${x.pid}:${x.rol}`, () => {
    const e = envioDe(dia, x.pid);
    if (x.rol === "ex") return { k: "ex", e };
    if (!e || e.enviadaMin == null) return { k: "sinenviar", e };
    if (e.anulado) return { k: "anulado", e };
    const cur = fotoDe(dia, x.pid!);
    const ds = diferencias(dia, e.snap, cur);
    const ok = !!e.snapOk && JSON.stringify(e.snapOk) === JSON.stringify(cur);
    if (ds.length && !ok) return { k: "cambiada", e, ds };
    if (ds.length && ok) return { k: "okSinAvisar", e, ds };
    return { k: "ok", e };
  }) as EstadoEnvio;
}

export type EstadoHoja = { k: "borrador" | "enviada" | "abierta" | "recibida" | "cambiada" | "sinavisar" | "rojo" | "suspendida"; txt: string; ds?: Diferencia[] };

/** El estado en texto de la tarjeta (§11): Borrador, Enviada 18:42, Abierta, Recibida, Cambiada… */
export function estadoHoja(dia: DiaHoja, c: number, ahora: Minutos): EstadoHoja {
  const sus = suspendida(dia, c);
  const r = recibeDe(dia, c);
  if (!r) {
    const e0 = dia.envios.find((e) => e.snap?.tipo === "hoja" && e.snap.c === c && e.enviadaMin != null && !e.anulado);
    if (!e0) return sus ? { k: "suspendida", txt: `Suspendida · ${sus}` } : { k: "borrador", txt: "Borrador" };
    return { k: "cambiada", txt: "Cambiada después de enviar", ds: [{ t: "quedó sin nadie a cargo" }] };
  }
  const st = estadoEnvio(dia, { pid: r, rol: "cargo", c });
  if (st.k === "sinenviar" || st.k === "anulado") {
    const prev = dia.envios.find((e) => e.personaId !== r && e.snap?.tipo === "hoja" && e.snap.c === c && e.enviadaMin != null && !e.anulado);
    if (prev) return { k: "cambiada", txt: "Cambiada después de enviar", ds: [{ t: `a cargo: ${nombreDe(dia, r)} (antes ${nombreDe(dia, prev.personaId)})` }] };
    return sus ? { k: "suspendida", txt: `Suspendida · ${sus}` } : { k: "borrador", txt: "Borrador" };
  }
  if (st.k === "cambiada") return { k: "cambiada", txt: "Cambiada después de enviar", ds: st.ds };
  if (st.k !== "ok" && st.k !== "okSinAvisar") return { k: "borrador", txt: "Borrador" };
  const e = st.e;
  if (st.k === "okSinAvisar") {
    const base = e.recibidaMin != null ? `Recibida ${hm(e.recibidaMin)}` : e.abiertaMin != null ? `Abierta ${hm(e.abiertaMin)}` : `Enviada ${hm(e.enviadaMin!)}`;
    return { k: "sinavisar", txt: `${base} · cambio de las ${hm(e.okMin ?? ahora)} sin avisar` };
  }
  if (sus) return { k: "suspendida", txt: `Suspendida · ${sus}${e.cambioMin != null ? ` · avisado ${hm(e.cambioMin)}` : ""}` };
  if (e.cambioMin != null && (e.recibidaMin == null || e.recibidaMin < e.cambioMin)) {
    return { k: "enviada", txt: `Cambio enviado ${hm(e.cambioMin)}${e.abiertaMin != null && e.abiertaMin > e.cambioMin ? ` · abierta ${hm(e.abiertaMin)}` : ""}` };
  }
  if (e.recibidaMin != null) return { k: "recibida", txt: `${e.cambioMin != null ? "Entendido" : "Recibida"} ${hm(e.recibidaMin)}` };
  if (e.abiertaMin != null) return { k: "abierta", txt: `Abierta ${hm(e.abiertaMin)}` };
  const rojo = ahora >= toMin(P(dia).horaAlarmaNoAbierta)!;
  return { k: rojo ? "rojo" : "enviada", txt: rojo ? `No la abrió · enviada ${hm(e.enviadaMin!)}` : `Enviada ${hm(e.enviadaMin!)}${e.reenviadaMin != null ? ` · reenviada ${hm(e.reenviadaMin)}` : ""}` };
}

/** Los que entraron a la hoja después de mandarla y todavía no se les avisó ("Avisar a Ramírez"). */
export function nuevosEnHoja(dia: DiaHoja, c: number): string[] {
  const r = recibeDe(dia, c);
  const e = envioDe(dia, r);
  const h = hojaDeCuadrilla(dia, c);
  if (!e || !h || e.snapPrimero?.tipo !== "hoja") return [];
  const primero = e.snapPrimero;
  return genteDe(h).filter((p) => p !== r && !primero.gente.includes(p) && !dia.operariosAvisados.includes(p));
}

// ─── La bandeja del día: "¿qué falta para mandar?" (§8) ─────────────────────

export type ItemBandeja = { k: string; t: string; bs: Boton[]; c?: number | null; corto?: string; rojo?: boolean; gris?: boolean; nivel?: string; n?: number };
export type Bandeja = {
  vos: ItemBandeja[];
  esp: ItemBandeja[];
  listas: { t: string }[];
  listasN: number;
  total: number;
  enviadas: number;
  sinEnv: number;
  algunaEnviada: boolean;
};

export function bandeja(dia: DiaHoja, ahora: Minutos): Bandeja {
  const vos: ItemBandeja[] = [], esp: ItemBandeja[] = [], listas: { t: string }[] = [];
  const act = cuadrillasActivas(dia);
  if (!dia.hojas.length) return { vos, esp, listas, listasN: 0, total: 0, enviadas: 0, sinEnv: 0, algunaEnviada: false };
  // NO SE PIERDEN PROBLEMAS: la clave es por cuadrilla ("pocos" de la 2 y de la 4 son dos
  // líneas). Sólo los cruces (un choque entre dos cuadrillas) se cuentan una vez.
  const seen = new Set<string>();
  for (const c of act) {
    for (const p of bloqueos(dia, c, ahora)) {
      const key = p.cruce ? p.k : `${p.k}-${c}`;
      if (seen.has(key)) continue;
      seen.add(key);
      vos.push({ c, k: key, t: p.t, corto: p.corto, rojo: p.rojo, nivel: p.nivel, bs: p.bsFalta ?? p.bs });
    }
  }
  const PRI = (k: string) => (/^cargo/.test(k) ? 0 : /^aus/.test(k) ? 1 : /^pocos/.test(k) ? 2 : /^ch|^veh|^choque|^nadie/.test(k) ? 3 : 4);
  vos.sort((a, b) => PRI(a.k) - PRI(b.k));
  // Hojas de cuadrillas que ya no tienen obras ese día, con gente adentro.
  for (const h of dia.hojas) {
    if (obrasDe(dia, h.cuadrillaOdooId).length || !h.integrantes.length) continue;
    vos.push({ k: `sinobras-${h.cuadrillaOdooId}`, c: h.cuadrillaOdooId, t: `La ${cNombre(dia, h.cuadrillaOdooId)} no tiene obras el ${diaSemana(dia.fecha)}: ${yList(genteDe(h).map((p) => nombreDe(dia, p)))} siguen en su hoja`, bs: [{ l: "Dejarlos sin asignar", a: "liberar", c: h.cuadrillaOdooId }] });
  }
  if (ahora < 0) {
    const sg = sugeridosDe(dia, ahora);
    if (sg.length) vos.push({ k: "sug", t: `${sg.length === 1 ? "1 pedido sugerido" : `${sg.length} pedidos sugeridos`} para ${hoyManana(dia.fecha, ahora)}`, bs: [{ l: "Ver", a: "irCamiones" }] });
    for (const p of dia.pedidos.filter((p) => p.fecha === dia.fecha && estadoPedido(dia, p, ahora).k === "sin")) {
      vos.push({ k: `ped-${p.id}`, t: `${lugar(dia, p.hacia).n}${vieneDeAyer(p) ? " · viene de ayer" : ""} · sin camión`, bs: [{ l: "Ver", a: "irCamiones" }] });
    }
  }
  let sinEnv = 0, enviadas = 0;
  const sinAbrir: string[] = [];
  const rojoAbrir = ahora >= toMin(P(dia).horaAlarmaNoAbierta)!;
  const ds = destinatarios(dia);
  for (const x of ds) {
    const st = estadoEnvio(dia, x);
    const N = nombreDe(dia, x.pid);
    if (st.k === "sinenviar" || st.k === "sinrecibe" || st.k === "anulado") sinEnv++;
    else if (x.rol === "cargo") enviadas++;
    if (st.k === "cambiada") {
      const quien = x.rol === "chofer" ? `Los viajes de ${N} cambiaron después de enviar` : `${cNombre(dia, x.c)} cambió después de enviar`;
      vos.push({ k: `chg-${x.pid}`, nivel: "bloq", c: x.c, corto: x.rol === "chofer" ? `Viajes de ${N}: cambio sin avisar` : `${cNombre(dia, x.c)}: cambio sin avisar`, t: `${quien}: ${st.ds.map((z) => z.t).join(", ")}`, bs: [{ l: `Avisar a ${N}`, a: "abrirEnvio", p: x.pid! }] });
    }
    if (st.k === "ex") vos.push({ k: `ex-${x.pid}`, nivel: "bloq", t: `${N} ya no está a cargo y tiene la hoja de la ${cNombre(dia, x.c)}`, bs: [{ l: `Avisar a ${N}`, a: "abrirEnvio", p: x.pid! }] });
    if (st.k === "ok" || st.k === "okSinAvisar") {
      const e = st.e;
      if (e.cambioMin != null && (e.recibidaMin == null || e.recibidaMin < e.cambioMin)) esp.push({ k: `nv-${x.pid}`, rojo: ahora - e.cambioMin > 15, t: `${N} no vio el cambio de las ${hm(e.cambioMin)}`, bs: [{ l: "Llamar", a: "llamar", p: x.pid! }] });
      else if (e.abiertaMin == null) {
        if (rojoAbrir) esp.push({ k: `na-${x.pid}`, rojo: true, t: `${N} no la abrió · enviada ${hm(e.enviadaMin!)}${e.reenviadaMin != null ? ` · reenviada ${hm(e.reenviadaMin)}` : ""}`, bs: [{ l: "Reenviar", a: "reenviar", p: x.pid! }, { l: "Llamar", a: "llamar", p: x.pid! }] });
        else sinAbrir.push(x.pid!);
      } else if (e.recibidaMin == null) esp.push({ k: `nr-${x.pid}`, gris: true, t: `${N} la abrió a las ${hm(e.abiertaMin)} y no tocó Recibido`, bs: [{ l: "Llamar", a: "llamar", p: x.pid! }] });
      else listas.push({ t: `${N} · ${e.cambioMin != null ? "entendido" : "recibida"} ${hm(e.recibidaMin)}` });
    }
  }
  if (sinAbrir.length) esp.push({ k: "sinabrir", gris: true, n: sinAbrir.length, t: `${sinAbrir.length === 1 ? "1 sin abrir" : `${sinAbrir.length} sin abrir`} todavía (${yList(sinAbrir.map((p) => nombreDe(dia, p)))})`, corto: `${sinAbrir.length} sin abrir todavía`, bs: [] });
  const algunaEnviada = ds.some((x) => envioDe(dia, x.pid)?.enviadaMin != null);
  if (algunaEnviada && sinEnv) vos.push({ k: "sinenv", nivel: "bloq", rojo: alarmaEnvio(dia, ahora), t: sinEnv === 1 ? "1 hoja sin enviar" : `${sinEnv} hojas sin enviar`, bs: [{ l: "Enviar", a: "abrirEnvio" }] });
  const listasN = act.filter((c) => !bloqueos(dia, c, ahora).length).length;
  return { vos, esp, listas, listasN, total: act.length, enviadas, sinEnv, algunaEnviada };
}

/** Para el botón coral: "Enviar a los capataces" o "Avisar cambios (2)". */
export function pendientesEnvio(dia: DiaHoja): { sinEnv: number; cambios: number } {
  let sinEnv = 0, cambios = 0;
  for (const x of destinatarios(dia)) {
    const st = estadoEnvio(dia, x);
    if (st.k === "sinenviar" || st.k === "sinrecibe") sinEnv++;
    if (st.k === "cambiada" || st.k === "ex") cambios++;
  }
  return { sinEnv, cambios };
}
/** A quién hay que avisarle porque le cambió algo (§11 "Sólo se reenvía a los afectados"). */
export function afectadosPorCambio(dia: DiaHoja): (Destinatario & { ds: Diferencia[] })[] {
  return destinatarios(dia).flatMap((x) => {
    const st = estadoEnvio(dia, x);
    if (st.k === "cambiada") return [{ ...x, ds: st.ds }];
    if (st.k === "ex") return [{ ...x, ds: [{ t: "ya no estás a cargo" }] }];
    return [];
  });
}

// ─── "Ahora:" la bandeja del despacho (§9) ──────────────────────────────────

export function ahoraItems(dia: DiaHoja, ahora: Minutos): Aviso[] {
  const out: Aviso[] = [];
  const hoy = esHoy(ahora);
  const C = cola(dia, ahora);
  for (const { p, sinAvisar } of C.vos) {
    if (sinAvisar) continue;
    if (p.ultimoNoPudo && !p.noPudoVisto) {
      out.push({ k: `np-${p.id}`, nivel: "rojo", ped: p.id, t: `${nombreDe(dia, p.ultimoNoPudo.choferId)} no pudo en ${lugar(dia, p.ultimoNoPudo.hacia).n}: ${lowFirst(p.ultimoNoPudo.motivo)} (${hm(p.ultimoNoPudo.min)})`, bs: [{ l: "Esperar…", a: "esperar", id: p.id }, { l: `Llamar a ${nombreDe(dia, p.ultimoNoPudo.choferId)}`, a: "llamar", p: p.ultimoNoPudo.choferId ?? undefined }] });
    } else if (p.urgencia === "frena") {
      out.push({ k: `fr-${p.id}`, nivel: "rojo", ped: p.id, t: `Frena la obra: ${lugar(dia, p.hacia).corto} espera ${lowFirst(p.que)} hace ${Math.max(0, Math.round(ahora - p.creadoMin))} min`, bs: [{ l: "Poner en un camión", a: "poner", id: p.id }] });
    } else if (hoy && (p.horaLimite || p.esperandoHastaMin != null || vieneDeAyer(p))) {
      const q = camionesQueSirven(dia, p, ahora);
      if (q.nadieLibre) out.push({ k: `nl-${p.id}`, nivel: "rojo", ped: p.id, t: `${lugar(dia, p.hacia).n}: ${lowFirst(txtNadieLibre(dia, q))}`, bs: [{ l: "Pasar a mañana", a: "pasarManana", id: p.id }, { l: "Flete de afuera", a: "fleteDe", id: p.id }] });
      else if (p.horaLimite && (q.libre ? q.libre.libreDesde + 60 : 9999) > toMin(p.horaLimite)!) out.push({ k: `hl-${p.id}`, nivel: "rojo", ped: p.id, t: `Antes de las ${hCorta(normHora(p.horaLimite))}: ningún camión llega a tiempo (${lugar(dia, p.hacia).n})`, bs: [{ l: "Poner en un camión", a: "poner", id: p.id }] });
    }
  }
  for (const d of destinatarios(dia).filter((x) => x.rol === "chofer" && x.pid)) out.push(...avisosChofer(dia, d.pid!, ahora));
  for (const veh of filasCamiones(dia)) out.push(...avisosVeh(dia, veh, ahora).filter((x) => x.nivel === "rojo" || x.k.startsWith("sinnot") || x.k.startsWith("todo")));
  for (const v of sinCamionDe(dia)) {
    const c = cuadrillaDeViaje(dia, v);
    out.push({ k: `nadie-${v.id}`, nivel: "rojo", t: `Nadie ${v.tipo} a la ${cNombre(dia, c)} ${v.tipo === "busca" ? "en" : "a"} ${lugar(dia, haciaDe(dia, v)).n}`, bs: [{ l: "Elegir chofer", a: "elegirChoferViaje", id: v.id }, ...(v.tipo === "busca" && c != null ? [{ l: "Vuelven por su cuenta", a: "vuelvenSolos", c }] : [])] });
  }
  if (ahora < 0) {
    const sg = sugeridosDe(dia, ahora);
    if (sg.length) out.unshift({ k: "sug", nivel: "", t: `${sg.length} pedidos sugeridos sin revisar`, bs: [] });
  }
  const seen = new Set<string>();
  return out.filter((x) => (seen.has(x.k) ? false : (seen.add(x.k), true)));
}

// ─── Lista de carga del depósito (§9) ───────────────────────────────────────

export type FilaCarga = { t: number; veh: string; ch: string | null; txt: string; nuevo: number | null; hecho: boolean; viajeId: string };
export function listaCarga(dia: DiaHoja, ahora: Minutos): { sale: FilaCarga[]; recibir: FilaCarga[] } {
  const sale: FilaCarga[] = [], recibir: FilaCarga[] = [];
  const hoy = esHoy(ahora);
  for (const veh of filasCamiones(dia)) {
    for (const v of calcVeh(dia, veh)) {
      const ch = choferDe(dia, v);
      const nuevo = v.creadoMin >= 7 * 60 && v.creadoMin < 1440 ? v.creadoMin : null;
      const c = cuadrillaDeViaje(dia, v);
      if (esDep(dia, v.desdeKey) && v.carga && (v.tipo === "lleva" || v.tipo === "lleva_material" || v.tipo === "entre_depositos" || v.tipo === "otro")) {
        sale.push({ t: toMin(v.cargaDeposito) ?? v.t, veh, ch, txt: `${v.carga} → ${lugar(dia, v.haciaEf).n}${v.tipo === "lleva" && c != null ? ` (va con la ${cNombre(dia, c)})` : ""}`, nuevo, hecho: v.estado === "hecho", viajeId: v.id });
      }
      if ((v.vuelta || v.tipo === "compra") && v.estado !== "no_pudo") {
        const t = v.vuelta ? v.finParada + 30 : v.fin;
        recibir.push({ t, veh, ch, txt: v.vuelta ? cap(v.vueltaCarga || v.carga || "lo desarmado") + (v.vueltaCarga ? "" : ` de ${lugar(dia, v.haciaEf).n}`) : `La compra de ${lugar(dia, v.haciaEf).n}: ${lowFirst(v.carga)}`, nuevo: null, hecho: v.estado === "hecho" && hoy && ahora >= t, viajeId: v.id });
      }
    }
  }
  sale.sort((a, b) => a.t - b.t);
  recibir.sort((a, b) => a.t - b.t);
  return { sale, recibir };
}
export function textoListaCarga(dia: DiaHoja, ahora: Minutos): string {
  const L = listaCarga(dia, ahora);
  return `Lista de carga · ${fechaLarga(dia.fecha)}\n` +
    L.sale.map((x) => `${hm(x.t)} ${patente(dia, x.veh)} · ${nombreDe(dia, x.ch)}: ${x.txt}${x.nuevo != null ? ` (nuevo ${hm(x.nuevo)})` : ""}`).join("\n") +
    (L.recibir.length ? `\nPara recibir:\n${L.recibir.map((x) => `~${hm5(x.t)} ${patente(dia, x.veh)} · ${nombreDe(dia, x.ch)}: ${x.txt}`).join("\n")}` : "");
}

// ─── Fletes del día por obra (precarga de "Cerrar jornada", §13) ─────────────

/**
 * Cada ida a la obra con gente o material suma 1 (lleva, lleva material, trae, mueve); el
 * "busca" no suma (cierra el redondo del "lleva"). Los fletes de afuera van como
 * tercerizados. Pendiente 19: confirmar con quien cierra los partes.
 */
export function fletesDelDia(dia: DiaHoja, otId: number): { v: ViajeCalc; txt: string; tercerizado: boolean; hecho: boolean }[] {
  const vs = [...viajesCalc(dia), ...fletesDeAfuera(dia)].filter((v) =>
    v.haciaEf.otId === otId && (v.tipo === "lleva" || v.tipo === "lleva_material" || v.tipo === "trae_material" || v.tipo === "mueve") && v.estado !== "anulado" && v.estado !== "no_pudo");
  return vs.map((v) => {
    const p = pedidosDeViaje(dia, v.id)[0];
    const que = v.tipo === "lleva" ? `lleva de las ${normHora(v.hora) ?? hm5(v.t)}` : v.tipo === "trae_material" ? "trae" : p ? `pedido de las ${hm(p.creadoMin)}` : "material";
    return { v, txt: `${que} de ${v.fleteExterno ?? nombreDe(dia, choferDe(dia, v))}`, tercerizado: !!v.fleteExterno, hecho: v.estado === "hecho" };
  });
}

// ═══════════════════════════ Precarga (§8) ════════════════════════════════════

export type ModoPrecarga = "hoy" | "plantel" | "vacio";

export type PlanHoja = {
  cuadrillaOdooId: number;
  modo: ModoChofer;
  choferId: string | null;
  vehiculoId: string | null;
  encuentro: { lugar: LugarEncuentro; texto: string | null; hora: Hora };
  aCargoId: string | null;
  gente: string[];
  /** Hora del "lleva" (sólo lleva y trae). */
  lleva: Hora | null;
  /** Hora del "busca"; null = vuelven por su cuenta. */
  busca: Hora | null;
  origen: ModoPrecarga | "copia";
  copiadaDe: Fecha | null;
};
export type PlanPrecarga = { hojas: PlanHoja[]; camiones: CamionDia[]; avisos: string[] };

const encuentroPorModo = (dia: DiaHoja, m: ModoChofer) =>
  m === "sin" ? { lugar: "obra" as const, texto: null, hora: P(dia).encuentroObra } : { lugar: "deposito" as const, texto: null, hora: P(dia).encuentroDeposito };

/** Lo que la hoja de otro día dice de su lleva y su busca. */
function horasDe(viajes: Viaje[] | null, h: Hoja, dia: DiaHoja): { lleva: Hora | null; busca: Hora | null } {
  if (h.modo !== "lleva_trae") return { lleva: null, busca: null };
  if (!viajes) return { lleva: normHora(h.encuentro.hora), busca: P(dia).finJornada };
  const vs = viajes.filter((v) => v.hojaId === h.id && v.estado !== "anulado");
  const ll = vs.find((v) => v.tipo === "lleva");
  const bu = vs.find((v) => v.tipo === "busca");
  return { lleva: normHora(ll?.hora) ?? normHora(h.encuentro.hora), busca: bu ? normHora(bu.hora) ?? P(dia).finJornada : null };
}
function planDesde(dia: DiaHoja, h: Hoja, viajes: Viaje[] | null, fecha: Fecha, conCargo: boolean, c: number): PlanHoja {
  const { lleva, busca } = horasDe(viajes, h, dia);
  return {
    cuadrillaOdooId: c, modo: h.modo, choferId: h.choferId, vehiculoId: h.vehiculoId,
    encuentro: { lugar: h.encuentro.lugar, texto: h.encuentro.texto, hora: normHora(h.encuentro.hora) ?? h.encuentro.hora },
    aCargoId: conCargo ? aCargoDe(h) : null, gente: genteDe(h), lleva, busca, origen: "hoy", copiadaDe: fecha,
  };
}

/**
 * "Empezar como hoy" (el recomendado), "con el plantel base" o "vacío" (§8). Devuelve las
 * hojas a crear; las escribe servicio.ts. Copia gente, quién estuvo a cargo, el modo de
 * chofer, el chofer, el vehículo, el encuentro y las horas del lleva y el busca. NO copia
 * las instrucciones (son de cada obra y cada día) ni los viajes sueltos.
 *
 * - Si una obra sigue de ayer pero cambió de cuadrilla, la gente SIGUE A LA OBRA.
 * - Saca a los ausentes y lo dice ("Ávila no entra: vacaciones hasta el 16/10…").
 * - Una cuadrilla que el día anterior no trabajó toma su última hoja, sin nadie a cargo.
 */
export function planPrecarga(dia: DiaHoja, modo: ModoPrecarga): PlanPrecarga {
  const ant = dia.anterior;
  const avisos: string[] = [];
  const hojas: PlanHoja[] = [];
  const usadasAnt = new Set<number>();
  const vacia = (c: number): PlanHoja => ({ cuadrillaOdooId: c, modo: "sin", choferId: null, vehiculoId: null, encuentro: encuentroPorModo(dia, "sin"), aCargoId: null, gente: [], lleva: null, busca: null, origen: modo, copiadaDe: null });
  const conObras = cuadrillasConObras(dia).filter((c) => !hojaDeCuadrilla(dia, c));
  // La gente sigue a la obra: primero se resuelve de qué hoja de ayer copia cada cuadrilla.
  const fuente = new Map<number, number>();
  if (modo === "hoy" && ant) {
    for (const c of conObras) {
      for (const o of obrasDe(dia, c)) {
        const oa = ant.obras.find((x) => x.otId === o.otId);
        if (oa && oa.cuadrillaOdooId !== c && ant.hojas.some((h) => h.cuadrillaOdooId === oa.cuadrillaOdooId) && !obrasDe(dia, oa.cuadrillaOdooId).some((x) => x.otId === o.otId)) {
          if (![...fuente.values()].includes(oa.cuadrillaOdooId)) { fuente.set(c, oa.cuadrillaOdooId); break; }
        }
      }
    }
    for (const c of conObras) {
      if (fuente.has(c)) continue;
      if (ant.hojas.some((h) => h.cuadrillaOdooId === c) && ![...fuente.values()].includes(c)) fuente.set(c, c);
    }
  }
  if (modo === "hoy" && ant) {
    for (const h of ant.hojas) {
      const c = h.cuadrillaOdooId;
      if (!obrasDe(dia, c).length && h.integrantes.length && ![...fuente.values()].includes(c)) {
        avisos.push(`La ${cNombre(dia, c)} no tiene obras el ${diaSemana(dia.fecha)}: ${yList(genteDe(h).map((p) => nombreDe(dia, p)))} quedaron sin asignar.`);
      }
    }
  }
  for (const c of conObras) {
    let ph: PlanHoja;
    if (modo === "vacio") ph = vacia(c);
    else if (modo === "plantel") {
      const pl = cuadrilla(dia, c)?.plantel;
      if (pl && pl.personaIds.length) ph = { ...vacia(c), gente: [...pl.personaIds], aCargoId: pl.responsableId, origen: "plantel" };
      else { ph = vacia(c); avisos.push(`La ${cNombre(dia, c)} no está en Configuración de cuadrillas: quedó vacía.`); }
    } else if (ant && fuente.has(c)) {
      const fc = fuente.get(c)!;
      usadasAnt.add(fc);
      ph = planDesde(dia, ant.hojas.find((h) => h.cuadrillaOdooId === fc)!, ant.viajes, ant.fecha, true, c);
      if (fc !== c) avisos.push(`La gente de la ${cNombre(dia, fc)} sigue a su obra: pasa a la ${cNombre(dia, c)}.`);
    } else {
      const ult = dia.ultimasHojas.find((u) => u.hoja.cuadrillaOdooId === c);
      if (ult) {
        ph = planDesde(dia, ult.hoja, null, ult.fecha, false, c);
        avisos.push(`La ${cNombre(dia, c)} no trabajó el ${ant ? diaSemana(ant.fecha) : "día anterior"}: se copió su gente del ${fechaLarga(ult.fecha)} (${ddmm(ult.fecha)}), sin nadie a cargo.`);
      } else ph = vacia(c);
    }
    hojas.push(ph);
  }
  // Ausentes afuera, y una persona en una sola hoja.
  const usados = new Set<string>(dia.hojas.flatMap((h) => h.integrantes.map((i) => i.personaId)));
  const ausAvisos: string[] = [];
  for (const h of hojas) {
    h.gente = h.gente.filter((p) => {
      const a = ausenciaDe(dia, p);
      if (a) {
        if (h.aCargoId === p) h.aCargoId = null;
        ausAvisos.push(`${nombreDe(dia, p)} no entra: ${ausTexto(a, false)}${a.hasta ? ` hasta el ${ddmm(a.hasta)}` : ""}${a.origen === "asistencia" ? " (según la asistencia)" : ""}. La ${cNombre(dia, h.cuadrillaOdooId)} quedó con __VAN_${h.cuadrillaOdooId}__ de ${prevista(dia, h.cuadrillaOdooId)}.`);
        return false;
      }
      if (usados.has(p) || !persona(dia, p)?.activo) { if (h.aCargoId === p) h.aCargoId = null; return false; }
      usados.add(p);
      return true;
    });
    if (h.aCargoId && !h.gente.includes(h.aCargoId)) h.aCargoId = null;
    if (h.choferId && ausenciaDe(dia, h.choferId)) {
      avisos.push(`${nombreDe(dia, h.choferId)} no viene: la ${cNombre(dia, h.cuadrillaOdooId)} quedó sin chofer.`);
      h.choferId = null;
    }
  }
  // Un chofer de "Todo el día" no puede además llevar a otra.
  const tomados = new Map<string, number>();
  for (const h of hojas) if (h.modo === "todo_el_dia" && h.choferId) tomados.set(h.choferId, h.cuadrillaOdooId);
  for (const h of hojas) {
    if (h.modo !== "lleva_trae" || !h.choferId || !tomados.has(h.choferId)) continue;
    const antCh = h.choferId;
    const otro = hojas.find((o) => o.modo === "lleva_trae" && o.choferId && !tomados.has(o.choferId));
    if (otro) { h.choferId = otro.choferId; h.vehiculoId = otro.vehiculoId; } else { h.choferId = null; h.vehiculoId = null; }
    avisos.push(`${nombreDe(dia, antCh)} va todo el día con la ${cNombre(dia, tomados.get(antCh)!)}: a ${laC(dia, h.cuadrillaOdooId)} la lleva ${h.choferId ? nombreDe(dia, h.choferId) : "nadie todavía"}.`);
  }
  const camiones: CamionDia[] = [];
  for (const h of hojas) if (h.vehiculoId && h.choferId && !camiones.find((x) => x.vehiculoId === h.vehiculoId)) camiones.push({ vehiculoId: h.vehiculoId, choferId: h.choferId, nota: null });
  const vanPlan = (c: number) => { const h = hojas.find((x) => x.cuadrillaOdooId === c)!; return h.gente.length + (h.modo === "todo_el_dia" && h.choferId ? 1 : 0); };
  const ausFinal = ausAvisos.map((t) => t.replace(/__VAN_(\d+)__/, (_, c) => String(vanPlan(Number(c)))));
  avisos.unshift(...ausFinal);
  if (modo === "vacio") avisos.push(`Las ${hojas.length} hojas quedaron vacías, con las obras del tablero: sin gente, sin nadie a cargo y sin chofer.`);
  if (modo === "plantel") avisos.push("Con el plantel base no hay choferes ni encuentros: elegilos en cada tarjeta.");
  if (modo === "hoy") {
    const n = hojas.filter((h) => h.modo === "lleva_trae" && h.choferId).reduce((s, h) => s + 1 + (h.busca ? 1 : 0), 0);
    avisos.push(`Se armaron ${n} viajes de lleva y trae en las filas de los camiones. Las instrucciones no se copian: son de cada obra y cada día.`);
  }
  return { hojas, camiones, avisos };
}

/** "Copiar como hoy" de una sola tarjeta. null si esa cuadrilla no tuvo hoja el día anterior. */
export function planCopiarComoHoy(dia: DiaHoja, c: number): PlanHoja | null {
  const ant = dia.anterior;
  const h = ant?.hojas.find((x) => x.cuadrillaOdooId === c);
  if (!ant || !h) return null;
  const plan = planDesde(dia, h, ant.viajes, ant.fecha, true, c);
  plan.origen = "copia";
  plan.gente = plan.gente.filter((p) => !ausenciaDe(dia, p));
  if (plan.aCargoId && !plan.gente.includes(plan.aCargoId)) plan.aCargoId = null;
  return plan;
}

// ═══════════════════════════ Chofer de una cuadrilla ══════════════════════════

/** El vehículo de un chofer ese día: el que maneja, o el que tiene de habitual. */
export function vehiculoDeChofer(dia: DiaHoja, ch: string): string | null {
  return dia.camiones.find((x) => x.choferId === ch)?.vehiculoId ?? dia.vehiculos.find((v) => v.choferHabitualId === ch)?.id ?? null;
}

export type CambioHoja = {
  modo?: ModoChofer;
  choferId?: string | null;
  vehiculoId?: string | null;
  encuentro?: { lugar: LugarEncuentro; texto: string | null; hora: Hora };
  /** Hora del lleva a crear (lleva y trae). */
  lleva?: Hora | null;
  busca?: Hora | null;
};

/**
 * Cambiar el modo de chofer (§4). Al pasar a "Sin chofer" el encuentro pasa a la obra; al
 * volver, al depósito (el que tenía, o el de por defecto). Si no hay chofer, propone el de
 * la misma cuadrilla el día anterior o el habitual del vehículo.
 */
export function planModo(dia: DiaHoja, c: number, m: ModoChofer): CambioHoja {
  const h = hojaDeCuadrilla(dia, c)!;
  const out: CambioHoja = { modo: m };
  if (m === "sin") { out.encuentro = encuentroPorModo(dia, "sin"); return out; }
  if (h.encuentro.lugar === "obra") out.encuentro = encuentroPorModo(dia, m);
  const enc = out.encuentro ?? h.encuentro;
  let ch = h.choferId;
  let veh = h.vehiculoId;
  if (!ch || (m === "todo_el_dia" && todoDe(dia, ch).some((x) => x !== c))) {
    const ph = dia.anterior?.hojas.find((x) => x.cuadrillaOdooId === c);
    if (ph?.choferId && !(m === "todo_el_dia" && todoDe(dia, ph.choferId).some((x) => x !== c))) { ch = ph.choferId; veh = ph.vehiculoId; }
  }
  if (ch && !veh) veh = vehiculoDeChofer(dia, ch);
  out.choferId = ch;
  out.vehiculoId = veh;
  if (m === "lleva_trae") { out.lleva = normHora(enc.hora); out.busca = P(dia).finJornada; }
  return out;
}

/**
 * Soltar un chofer en una tarjeta (o elegirlo en el panel y apretar 1–5): UN cambio, que
 * si la cuadrilla iba sin chofer la pasa a "Lleva y trae" con encuentro en el depósito.
 * Es el arreglo del revisor: antes cambiaba el chofer pero dejaba el modo en "Sin chofer".
 */
export function planSoltarChofer(dia: DiaHoja, c: number, ch: string): CambioHoja {
  const h = hojaDeCuadrilla(dia, c)!;
  const base = h.modo === "sin" ? planModo(dia, c, "lleva_trae") : { modo: h.modo };
  const veh = vehiculoDeChofer(dia, ch) ?? base.vehiculoId ?? h.vehiculoId;
  return { ...base, choferId: ch, vehiculoId: veh };
}

// ═══════════════════════════ Panel "Gente" (§8) ═══════════════════════════════

export type PanelGente = {
  sinAsignar: string[];
  noDisponibles: { pid: string; a: Ausencia; txt: string }[];
  asignados: { pid: string; c: number }[];
  choferes: { pid: string; txt: string; viajes: number; todo: number | null }[];
  vehiculos: { veh: string; txt: string; problema: string | null }[];
};

export function panelGente(dia: DiaHoja): PanelGente {
  const noDisponibles = dia.personas
    .map((p) => ({ p, a: ausenciaDe(dia, p.id) }))
    .filter((x) => x.a && x.p.activo)
    .map(({ p, a }) => ({ pid: p.id, a: a!, txt: `${p.nombre} · ${ausTexto(a!, true, dia.fecha)}${a!.origen === "asistencia" && a!.id == null ? " (según la asistencia)" : ""}` }));
  const asignados = dia.hojas.flatMap((h) => h.integrantes.map((i) => ({ pid: i.personaId, c: h.cuadrillaOdooId })));
  const choferIds = new Set<string>([...dia.personas.filter((p) => p.esChofer && p.activo).map((p) => p.id), ...dia.camiones.map((c) => c.choferId).filter(Boolean) as string[]]);
  const choferes = [...choferIds].map((pid) => {
    const vs = viajesChofer(dia, pid);
    const td = todoDe(dia, pid)[0] ?? null;
    const a = ausenciaDe(dia, pid);
    const txt = a ? `${nombreDe(dia, pid)} · no viene (${TIPO_AUSENCIA_TXT[a.tipo]})`
      : td != null ? `${nombreDe(dia, pid)} · todo el día con ${laC(dia, td)}${vs.length ? ` · ${vs.length} viajes` : ""}`
      : vs.length ? `${nombreDe(dia, pid)} · ${vs.length === 1 ? "1 viaje" : `${vs.length} viajes`}` : `${nombreDe(dia, pid)} · libre`;
    return { pid, txt, viajes: vs.length, todo: td };
  }).sort((a, b) => nombreDe(dia, a.pid).localeCompare(nombreDe(dia, b.pid), "es"));
  const vehiculos = dia.vehiculos.map((V) => {
    const td = todoVeh(dia, V.id);
    const n = calcVeh(dia, V.id).length;
    const venc = vencimientosTxt(dia, V.id)[0] ?? null;
    const estado = V.estado === "en_taller" ? "en el taller" : V.estado === "fuera_servicio" ? "fuera de servicio" : null;
    const txt = `${V.patente} · ${tipoVehTxt(V)}${td != null ? ` · con ${laC(dia, td)}` : n ? ` · ${n === 1 ? "1 viaje" : `${n} viajes`}` : ""}`;
    return { veh: V.id, txt, problema: estado ?? (venc ? venc.replace(/^El \S+ \S+ \S+ tiene /, "") : null) };
  });
  return { sinAsignar: sinAsignar(dia), noDisponibles, asignados, choferes, vehiculos };
}

/** Los vehículos sin uso ese día ("Sin usar: AH 410 LD (VTV vencida) · S10 (sin chofer)…"). */
export function camionesSinUsar(dia: DiaHoja): { veh: string; txt: string }[] {
  return dia.vehiculos.filter((V) => !calcVeh(dia, V.id).length && todoVeh(dia, V.id) == null).map((V) => {
    const venc = vencido(dia, V, "vtv");
    const ch = choferDelCamion(dia, V.id);
    const por = venc ? "VTV vencida" : !ch ? "sin chofer" : V.estado === "en_taller" ? "en el taller" : null;
    return { veh: V.id, txt: `${V.patente}${por ? ` (${por})` : ""}` };
  });
}

/** El tipo de un pedido por el destino (§7 "Se deduce solo"). */
export function tipoPorDestino(dia: DiaHoja, hacia: Punto, esParaTraer = false): TipoPedido {
  const l = lugar(dia, hacia);
  if (l.obra) return esParaTraer ? "trae_material" : "lleva_material";
  if (l.tipo === "proveedor") return "compra";
  if (l.tipo === "taller" || l.tipo === "vtv") return "taller";
  if (l.tipo === "deposito") return "entre_depositos";
  return "otro";
}
/** Quién pidió por defecto: el que está a cargo de esa obra hoy según la hoja. */
export function pidioPorDefecto(dia: DiaHoja, hacia: Punto): string | null {
  if (hacia.otId == null) return null;
  const c = cuadrillaDeObra(dia, hacia.otId);
  return c != null ? recibeDe(dia, c) : null;
}
/** Para qué día va un pedido nuevo: hoy hasta la hora de corte, mañana después. */
export function fechaPorDefecto(hoy: Fecha, ahoraDeHoy: Minutos, p: Parametros): Fecha {
  return ahoraDeHoy >= toMin(p.horaCorteManana)! ? addDia(hoy, 1) : hoy;
}
