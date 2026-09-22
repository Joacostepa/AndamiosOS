"use client";

// Avisos en vivo entre las pantallas que tienen el tablero abierto.
//
// EL PROBLEMA QUE RESUELVE, con nombre y apellido: el 21/09 Ezequiel pasó Azara 856 a
// tentativa a las 10:43. Juan tenía el tablero abierto y no se enteró: la consulta sólo se
// repite cuando uno mismo escribe algo. A las 10:59 confirmó otra obra, ese gesto disparó
// el refresco, y Azara "se puso rayadita" delante suyo — dieciséis minutos tarde y pegado
// a un gesto que no tenía nada que ver. A las 11:04 la volvió a confirmar, pisando la
// decisión de Ezequiel sin saber que existía.
//
// POR QUÉ UN AVISO Y NO CONSULTAR CADA N MINUTOS. Preguntarle a Odoo cada dos minutos
// cuesta ~1,2 s y seis consultas POR PANTALLA, haya pasado algo o no: con cinco personas
// mirando son ~900 consultas por hora contra una Odoo Online que limita la concurrencia y
// que ya devuelve 429 cuando se la aprieta. Esto no consulta nada hasta que alguien
// cambia algo de verdad: un día tranquilo cuesta cero.
//
// NO PASA POR ODOO NI POR LA BASE. Es un mensaje suelto entre navegadores (Supabase
// Realtime, broadcast), medido en ~180 ms contra este proyecto. No se guarda en ningún
// lado y no tiene por qué: si alguien no lo recibe, el refresco al volver a la pestaña lo
// cubre. Es una pista para ir a buscar el dato, no el dato.
//
// LO QUE NO CUBRE: editar una asignación directamente en Odoo. Nadie se entera, igual que
// hoy. El tablero es la única boca de escritura que avisa.

import { createClient } from "@/lib/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

const CANAL = "tablero-cambios";
const EVENTO = "cambio";

/**
 * Lo que viaja. Es CORTO a propósito: alcanza para escribir una línea y decidir refrescar.
 * Los datos de verdad se vuelven a pedir; mandar el estado entero sería otra fuente de
 * verdad viajando por un canal que no garantiza entrega.
 */
export type AvisoTablero = {
  /** Nombre de pila de quien lo hizo, para la línea que ve el resto. */
  autor: string;
  /** Qué hizo, ya conjugado: "confirmó", "movió", "quitó". */
  accion: string;
  /** La obra tocada, cuando el gesto es sobre una sola. */
  obra?: string | null;
};

let canal: RealtimeChannel | null = null;
let autorLocal = "Alguien";
const oyentes = new Set<(a: AvisoTablero) => void>();

/**
 * Abre el canal y devuelve cómo cerrarlo. Lo llama el tablero al montarse.
 *
 * El canal es uno solo por pestaña aunque se llame dos veces: lo comparten el que escucha
 * y el que emite, y abrir dos sockets para lo mismo es gastar una conexión al pedo.
 */
export function conectarAvisos(autor: string, oyente: (a: AvisoTablero) => void): () => void {
  autorLocal = autor;
  oyentes.add(oyente);

  if (!canal) {
    canal = createClient()
      .channel(CANAL, {
        // Sin esto el que escribe recibe su propio aviso y refresca de más, justo después
        // de haber actualizado la pantalla por su cuenta. OJO: es por CONEXIÓN, no por
        // persona — la segunda pestaña del mismo usuario sí lo recibe, que es lo correcto.
        config: { broadcast: { self: false } },
      })
      .on("broadcast", { event: EVENTO }, ({ payload }) => {
        const a = payload as AvisoTablero;
        if (!a || typeof a.autor !== "string") return;
        for (const o of oyentes) o(a);
      });
    canal.subscribe();
  }

  return () => {
    oyentes.delete(oyente);
    // El último que se va apaga la luz: si quedara abierto, una pestaña en otra sección
    // seguiría sosteniendo una conexión de Realtime para nada.
    if (oyentes.size === 0 && canal) {
      void canal.unsubscribe();
      canal = null;
    }
  };
}

/**
 * Avisa que cambió algo. No espera respuesta y NUNCA tira: es una mejora sobre el estado
 * de otro, no parte del gesto que el usuario pidió. Si el canal está caído, el que sufre
 * es el refresco ajeno, y para eso está la red de seguridad del foco de pestaña.
 */
export function avisarCambio(accion: string, obra?: string | null): void {
  if (!canal) return;
  void canal
    .send({ type: "broadcast", event: EVENTO, payload: { autor: autorLocal, accion, obra } })
    .catch(() => {});
}
