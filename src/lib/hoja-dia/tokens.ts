// Los tokens del link sin contraseña (/h/<token>) y los códigos de vinculación de Telegram.
//
// UN TOKEN POR PERSONA Y POR DÍA (§14 "Seguridad del link"): 32 caracteres al azar, sin
// los que se confunden al dictarlos o copiarlos de un mensaje (0/O, 1/l/I). Son ~185 bits:
// no se adivinan, y no dicen nada (ni el nombre ni la fecha). El link no cambia con los
// cambios de la hoja ni con los viajes nuevos de ese día; se anula si la persona deja de
// estar a cargo o de ser chofer, o desde el escritorio ("Anular link").
//
// VENCE A LAS 23:59 DEL DÍA SIGUIENTE, en Buenos Aires: sirve la noche anterior y el día
// mismo, y después no.
//
// Lógica pura (usa `crypto.getRandomValues`, que está en Node y en el navegador).

import type { Fecha } from "./tipos.ts";
import { addDia } from "./estado.ts";

// El mismo alfabeto que valida el CHECK de hd_links.token en la migración.
const ALFABETO = "23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const URL_SEGURO = "23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function azar(largo: number, alfabeto: string): string {
  // Rechazo por módulo: sin sesgo hacia las primeras letras.
  const tope = 256 - (256 % alfabeto.length);
  let out = "";
  while (out.length < largo) {
    const buf = new Uint8Array(largo * 2);
    crypto.getRandomValues(buf);
    for (const b of buf) {
      if (b < tope) out += alfabeto[b % alfabeto.length];
      if (out.length === largo) break;
    }
  }
  return out;
}

export const nuevoToken = () => azar(32, ALFABETO);
export const tokenValido = (t: string | null | undefined): t is string => !!t && /^[2-9A-HJ-NP-Za-km-z]{32}$/.test(t);

/** Código de un solo uso para t.me/<bot>?start=<código> (Telegram acepta hasta 64, [A-Za-z0-9_-]). */
export const nuevoCodigoTelegram = () => azar(16, URL_SEGURO);
export const codigoValido = (c: string | null | undefined): c is string => !!c && /^[A-Za-z0-9_-]{8,64}$/.test(c);

/** 23:59:59 del día siguiente a la hoja, en Buenos Aires (UTC−3). */
export function expiraDe(fecha: Fecha): string {
  return new Date(`${addDia(fecha, 1)}T23:59:59-03:00`).toISOString();
}

export type FilaLink = { fecha: Fecha; expira_at: string; anulado_at: string | null };
export type SituacionLink = "ok" | "vencido" | "anulado";

/** Qué ve quien abre el link (§12 "Situaciones del link"). */
export function situacionLink(l: FilaLink, ahora: Date = new Date()): SituacionLink {
  if (l.anulado_at) return "anulado";
  if (Date.parse(l.expira_at) < ahora.getTime()) return "vencido";
  return "ok";
}

/** El link público de una persona para ese día. */
export function urlHoja(base: string | null, token: string): string | null {
  return base ? `${base.replace(/\/$/, "")}/h/${token}` : null;
}
