// Contrato de los calculadores de Dirección. Un archivo por pantalla en esta carpeta
// (caja.ts, ventas.ts, …), cada uno exporta `calculador = definirCalculador({...})`.
//
// UN CALCULADOR:
//  · Lee Odoo SÓLO con ../odoo-lectura.ts (search_read, read_group, …). Nunca escribe.
//  · Porta la lógica de Odoo-Claude/direccion/datos/<área>_definiciones.md y las
//    correcciones de la maqueta (bloque "2b": deduplicar por x_obra_id, octubre parcial fuera
//    de los cocientes, etc.). Nada hardcodeado del snapshot del 15/10.
//  · Devuelve cifras + detalle + avisos (+ decisiones/oraciones si corresponde). Todo JSON.
//  · Un dato que falta es sinDato("motivo") (formato.ts), NUNCA 0.
//  · Lo de socios va marcado `reservado: true` (o bajo detalle.reservado). Se recorta solo
//    por usuario (reservado.ts). La pantalla "socios" entera sólo se calcula con permiso.
//  · Corre DENTRO de la caché compartida de la pantalla (servidor.ts): no puede leer cookies
//    ni nada del usuario. Para Supabase usa ctx.supabase() (service role) y sólo para datos
//    que no dependen de quién mira (órdenes de trabajo, historia del snapshot).
//  · Si Odoo falla, que tire (OdooError): servidor.ts muestra el último snapshot con la banda
//    "No pudimos leer Odoo". Si falla UNA cifra y el resto sirve, esa cifra va sin dato.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { SerieDolar } from "../dolar.ts";
import type { PantallaId, ResultadoCalculador, TcDia } from "../tipos.ts";

export type CtxCalculo = {
  /** Hoy en Buenos Aires, 'AAAA-MM-DD'. */
  hoy: string;
  /** Instante del cálculo (ISO). */
  ahora: string;
  /** Parámetros de la URL que cambian el cálculo (Ventas: g, p, vs). Ya forman parte de la clave de caché. */
  params: Record<string, string>;
  /** Serie completa del dólar de Odoo (dolar.ts: tcEn, aUsd, tcPromedioMes). */
  dolar: SerieDolar;
  /** Dólar de hoy (para los saldos). null si Odoo no tiene cotización. */
  tc: TcDia | null;
  /**
   * El resultado de OTRA pantalla, cacheado y SIN recortar (La semana arma sus tarjetas con
   * los de Caja, Ventas, …). Marcar `reservado` lo que se tome de "socios".
   */
  pantalla: <D = unknown>(p: PantallaId, params?: Record<string, string>) => Promise<ResultadoCalculador<D>>;
  /** Cliente de Supabase con service role, para lecturas compartidas. */
  supabase: () => SupabaseClient;
};

/** Lo que arma un calculador (pantalla y dólar los completa servidor.ts). */
export type SalidaCalculo<D = unknown> = Omit<ResultadoCalculador<D>, "pantalla" | "tc">;

export type Calculador<D = unknown> = {
  pantalla: PantallaId;
  calcular: (ctx: CtxCalculo) => Promise<SalidaCalculo<D>>;
};

export function definirCalculador<D>(c: Calculador<D>): Calculador<D> {
  return c;
}

/** Salida vacía de una pantalla que todavía no tiene calculador (sin cifras inventadas). */
export const SIN_CALCULAR: SalidaCalculo<null> = { cifras: [], detalle: null, avisos: [] };
