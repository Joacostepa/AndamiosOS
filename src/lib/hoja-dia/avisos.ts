"use client";

// Avisos en vivo entre las pantallas que tienen abierta la Hoja del día. El mismo mecanismo
// que el tablero (src/lib/tablero/avisos.ts, que explica el porqué): un mensaje suelto por
// Supabase Realtime (broadcast) que dice "cambió algo, volvé a pedir". No guarda nada.
//
// UN CANAL PROPIO ("hoja-dia-cambios") y no el del tablero: un cambio en la hoja no tiene por
// qué hacer que el tablero vuelva a leer Odoo. Al revés sí: la hoja escucha TAMBIÉN el canal
// del tablero (ver use-hoja-dia.ts), porque mover una obra cambia la hoja.
//
// Los avisos que vienen de AFUERA del escritorio (el capataz tocó "Recibido", el chofer
// marcó "Hecho", desde el link o desde Telegram) los manda el servidor por REST
// (avisarPantallas en servicio.ts) en este mismo canal.

import { createClient } from "@/lib/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

export const CANAL_HOJA = "hoja-dia-cambios";
const EVENTO = "cambio";

export type AvisoHoja = {
  /** Nombre de pila de quien lo hizo ("Ortega" si vino del link). */
  autor: string;
  /** "movió a Ramírez a la Cuadrilla 3", "tocó Recibido". */
  accion: string;
  /** El día que cambió: cada pantalla refresca sólo si es el que mira. */
  fecha: string;
  /** "afuera" = el link o Telegram. */
  desde?: "escritorio" | "afuera";
};

let canal: RealtimeChannel | null = null;
let autorLocal = "Alguien";
const oyentes = new Set<(a: AvisoHoja) => void>();

export function conectarAvisosHoja(autor: string, oyente: (a: AvisoHoja) => void): () => void {
  autorLocal = autor;
  oyentes.add(oyente);
  if (!canal) {
    canal = createClient()
      .channel(CANAL_HOJA, { config: { broadcast: { self: false } } })
      .on("broadcast", { event: EVENTO }, ({ payload }) => {
        const a = payload as AvisoHoja;
        if (!a || typeof a.fecha !== "string") return;
        for (const o of oyentes) o(a);
      });
    canal.subscribe();
  }
  return () => {
    oyentes.delete(oyente);
    if (oyentes.size === 0 && canal) {
      void canal.unsubscribe();
      canal = null;
    }
  };
}

/** Avisa a los demás que cambió algo de ese día. Nunca tira. */
export function avisarCambioHoja(fecha: string, accion: string): void {
  if (!canal) return;
  void canal.send({ type: "broadcast", event: EVENTO, payload: { autor: autorLocal, accion, fecha, desde: "escritorio" } satisfies AvisoHoja }).catch(() => {});
}
