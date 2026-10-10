// La cuenta del Pañol: qué significa un lugar, cuándo algo está vencido, cuánto reponer y
// qué decirle al operario cuando la base rechaza un vale. Lógica pura, sin red: la usan el
// kiosco, la oficina y los tests (estado.test.ts), así la regla se escribe una vez.

import type { EstadoUnidad, Saldo, TipoMovimiento } from "./tipos.ts";

// ─── Lugares ────────────────────────────────────────────────────────────────

export type Lugar =
  | { clase: "ubicacion"; id: string }
  | { clase: "persona"; id: string }
  | { clase: "externa"; id: string }
  | { clase: "cuadrilla"; id: string }
  | { clase: "obra"; ot: number }
  | { clase: "taller" | "faltante" | "perdida" | "baja" }
  | { clase: "fuente"; nombre: "proveedor" | "consumo" | "alta" | "ajuste" };

const PREFIJO = { u: "ubicacion", p: "persona", x: "externa", c: "cuadrilla" } as const;

export function leerLugar(lugar: string): Lugar | null {
  const m = /^(u|p|x|c):([0-9a-f-]{36})$/.exec(lugar);
  if (m) return { clase: PREFIJO[m[1] as keyof typeof PREFIJO], id: m[2] };
  const o = /^o:(\d+)$/.exec(lugar);
  if (o) return { clase: "obra", ot: Number(o[1]) };
  if (lugar === "taller" || lugar === "faltante" || lugar === "perdida" || lugar === "baja") return { clase: lugar };
  if (lugar === "proveedor" || lugar === "consumo" || lugar === "alta" || lugar === "ajuste") return { clase: "fuente", nombre: lugar };
  return null;
}

export const lugarDePersona = (tipo: "persona" | "externa", id: string) => `${tipo === "externa" ? "x" : "p"}:${id}`;
export const lugarDeCuadrilla = (id: string) => `c:${id}`;
export const lugarDeUbicacion = (id: string) => `u:${id}`;
export const lugarDeObra = (ot: number) => `o:${ot}`;

/** En el pañol: en un estante, cajón o estantería. */
export const enPanol = (lugar: string) => lugar.startsWith("u:");
/** Afuera con alguien: persona, externa, cuadrilla u obra. */
export const conTitular = (lugar: string) => /^(p|x|c|o):/.test(lugar);

// ─── Stock ──────────────────────────────────────────────────────────────────

export type Existencias = { enPanol: number; afuera: number; faltante: number; enTaller: number };

/** Suma los saldos de un artículo (y talle, si se pasa) por clase de lugar. */
export function existencias(saldos: readonly Saldo[], articuloId: string, varianteId?: string | null): Existencias {
  const e: Existencias = { enPanol: 0, afuera: 0, faltante: 0, enTaller: 0 };
  for (const s of saldos) {
    if (s.articulo_id !== articuloId) continue;
    if (varianteId !== undefined && s.variante_id !== varianteId) continue;
    const n = Number(s.cantidad);
    if (enPanol(s.lugar)) e.enPanol += n;
    else if (conTitular(s.lugar)) e.afuera += n;
    else if (s.lugar === "faltante") e.faltante += n;
    else if (s.lugar === "taller") e.enTaller += n;
  }
  return e;
}

export function bajoMinimo(enPanolActual: number, minimo: number | null): boolean {
  return minimo !== null && minimo > 0 && enPanolActual < minimo;
}

/**
 * Cuánto pedir: hasta "reponer hasta". Sin ese número, el doble del mínimo, que es la
 * regla que usa cualquiera a ojo. Siempre en la unidad de retiro, redondeado para arriba a
 * la unidad de compra si se pasa el factor (no se compra media bolsa).
 */
export function sugeridoReponer(
  enPanolActual: number,
  minimo: number | null,
  reponerHasta: number | null,
  factorCompra = 1,
): number {
  const objetivo = reponerHasta ?? (minimo ? minimo * 2 : 0);
  const falta = Math.max(0, objetivo - enPanolActual);
  if (falta === 0) return 0;
  const f = factorCompra > 0 ? factorCompra : 1;
  return Math.ceil(falta / f) * f;
}

/** "3 bolsas de 100" → 300 en la unidad de retiro. */
export function aUnidadDeRetiro(cantidadCompra: number, factorCompra: number): number {
  return Math.round(cantidadCompra * (factorCompra > 0 ? factorCompra : 1) * 1000) / 1000;
}

// ─── Fechas (todo en días calendario, fecha de Buenos Aires) ────────────────

/** YYYY-MM-DD de hoy en Buenos Aires: el préstamo vence a la medianoche de acá, no de UTC. */
export function hoyBA(ahora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(ahora);
}

export function diasEntre(desdeISO: string, hastaISO: string): number {
  const a = Date.parse(desdeISO.slice(0, 10) + "T00:00:00Z");
  const b = Date.parse(hastaISO.slice(0, 10) + "T00:00:00Z");
  return Math.round((b - a) / 86_400_000);
}

/** Un préstamo a una persona está vencido el día DESPUÉS de su fecha. */
export function prestamoVencido(venceEl: string | null, hoy: string): boolean {
  return !!venceEl && venceEl < hoy;
}

export type Inspeccion = "sin_fecha" | "al_dia" | "por_vencer" | "vencida";

export function inspeccion(proxima: string | null, hoy: string, avisoDias: number): Inspeccion {
  if (!proxima) return "sin_fecha";
  if (proxima < hoy) return "vencida";
  return diasEntre(hoy, proxima) <= avisoDias ? "por_vencer" : "al_dia";
}

/**
 * "No apta": se calcula, no se guarda. Con la inspección de seguridad vencida no sale del
 * pañol (la base también lo frena: INSPECCION_VENCIDA).
 */
export function noApta(seguridadCritica: boolean, proximaInspeccion: string | null, hoy: string): boolean {
  return seguridadCritica && inspeccion(proximaInspeccion, hoy, 0) === "vencida";
}

/** Un faltante se puede pasar a pérdida cumplidos los días del parámetro. */
export function faltantePuedePasarAPerdida(desdeISO: string, hoy: string, diasParametro: number): boolean {
  return diasEntre(desdeISO, hoy) >= diasParametro;
}

// ─── Conteo ─────────────────────────────────────────────────────────────────

/** La misma cuenta que pan_conteo_cerrar: % sobre lo esperado, con piso 1. */
export function diferenciaSuperaUmbral(contado: number, esperado: number, umbralPct: number): boolean {
  return (Math.abs(contado - esperado) * 100) / Math.max(esperado, 1) > umbralPct;
}

// ─── Textos ─────────────────────────────────────────────────────────────────

export const ESTADO_UNIDAD: Record<EstadoUnidad, string> = {
  disponible: "Disponible",
  afuera: "Afuera",
  en_revision: "En revisión",
  en_mantenimiento: "En mantenimiento",
  fuera_de_servicio: "Fuera de servicio",
  faltante: "Faltante",
  perdida: "Perdida",
  baja: "De baja",
};

export const TIPO_MOVIMIENTO: Record<TipoMovimiento, string> = {
  retiro: "Retiro",
  sobrante: "Devolución de sobrante",
  prestamo: "Préstamo",
  devolucion: "Devolución",
  transferencia: "Pasó de mano",
  ingreso: "Ingreso de compra",
  alta: "Alta",
  ajuste: "Ajuste por conteo",
  taller_envio: "Al taller",
  taller_vuelta: "Volvió del taller",
  faltante: "Faltante",
  perdida: "Pérdida",
  recuperada: "Recuperada",
  baja: "Baja",
  revision: "Revisión",
  anulacion: "Anulación",
};

/**
 * Un rechazo de la base → qué decirle a quien está parado frente al kiosco.
 *
 * Los errores con código (LA_TIENE:…, INSPECCION_VENCIDA:…) los arma pan_registrar_vale a
 * propósito para que acá se puedan contestar con lo que sigue, no con un "Error 400". El
 * `nombreDe` resuelve un lugar a un nombre ("Diego Acosta", "Cuadrilla 3").
 */
export type Rechazo =
  | { codigo: "la_tiene"; lugar: string; texto: string }
  | { codigo: "inspeccion_vencida"; numero: string; texto: string }
  | { codigo: "no_disponible"; estado: string; texto: string }
  | { codigo: "ya_en_panol"; numero: string; texto: string }
  | { codigo: "sesion_vencida" | "solo_encargado" | "ya_se_movio" | "pin_bloqueado" | "pin_incorrecto"
      | "credencial_reemplazada" | "credencial_desconocida" | "persona_inactiva" | "otro"; texto: string };

export function leerRechazo(mensaje: string, nombreDe: (lugar: string) => string = () => "otra persona"): Rechazo {
  const m = /([A-Z_]+)(?::(\S+))?/.exec(mensaje);
  const codigo = m?.[1] ?? "";
  const dato = m?.[2] ?? "";
  switch (codigo) {
    case "LA_TIENE":
      return { codigo: "la_tiene", lugar: dato, texto: `La tiene ${nombreDe(dato)}.` };
    case "INSPECCION_VENCIDA":
      return { codigo: "inspeccion_vencida", numero: dato, texto: `${dato} tiene la inspección de seguridad vencida: no se puede prestar.` };
    case "NO_DISPONIBLE":
      return { codigo: "no_disponible", estado: dato, texto: `Está ${(ESTADO_UNIDAD[dato as EstadoUnidad] ?? dato).toLowerCase()}: no se puede prestar.` };
    case "YA_EN_PANOL":
      return { codigo: "ya_en_panol", numero: dato, texto: `${dato} ya figura en el pañol.` };
    case "SESION_VENCIDA":
      return { codigo: "sesion_vencida", texto: "Pasó mucho tiempo: identificate de nuevo." };
    case "SOLO_ENCARGADO":
      return { codigo: "solo_encargado", texto: "Esto lo hace alguien a cargo del pañol." };
    case "YA_SE_MOVIO":
      return { codigo: "ya_se_movio", texto: "Ya se movió después: anulá primero lo que vino después." };
    case "PIN_BLOQUEADO":
      return { codigo: "pin_bloqueado", texto: "Demasiados PIN equivocados. Esperá 5 minutos o usá tu credencial." };
    case "PIN_INCORRECTO":
      return { codigo: "pin_incorrecto", texto: "Ese PIN no es de nadie. Probá de nuevo." };
    case "CREDENCIAL_REEMPLAZADA":
      return { codigo: "credencial_reemplazada", texto: "Esa credencial fue reemplazada por una nueva. Usá la nueva o tu PIN." };
    case "CREDENCIAL_DESCONOCIDA":
      return { codigo: "credencial_desconocida", texto: "No reconozco esa credencial." };
    case "PERSONA_INACTIVA":
      return { codigo: "persona_inactiva", texto: "Esa persona está dada de baja." };
    default:
      return { codigo: "otro", texto: mensaje };
  }
}
