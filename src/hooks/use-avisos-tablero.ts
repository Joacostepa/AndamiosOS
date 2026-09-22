"use client";

// El lado que ESCUCHA los avisos del tablero (ver src/lib/tablero/avisos.ts).
//
// Hace dos cosas con cada aviso ajeno: vuelve a pedir el tablero y lo DICE. Lo segundo no
// es decoración: sin una línea que explique el cambio, las tarjetas mutan solas delante de
// quien está planificando y vuelve el mismo desconcierto que esto viene a resolver —sólo
// que sin siquiera un gesto propio al que culpar—.
//
// AGRUPA LAS RÁFAGAS, que es lo que lo hace viable. Planificar son veinte arrastres
// seguidos; veinte avisos por cinco pantallas serían cien recargas del tablero y cien
// carteles. Se espera a que el otro TERMINE de escribir y recién ahí se refresca una vez,
// con una línea que resume.

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { conectarAvisos, type AvisoTablero } from "@/lib/tablero/avisos";
import { CLAVE_ACTIVIDAD } from "@/hooks/use-actividad";
import { useUser } from "@/hooks/use-user";

/**
 * Cuánto se espera a que el otro deje de escribir antes de refrescar.
 *
 * MÁS LARGO QUE EL REFRESCO PROPIO (1,5 s), a propósito: lo que hace uno mismo tiene que
 * verse ya, lo que hace otro puede esperar tres segundos y a cambio una ráfaga entera
 * termina en UNA consulta en vez de veinte. Cada consulta del tablero son ~1,2 s y seis
 * llamadas a una Odoo Online que limita la concurrencia.
 */
const ESPERA = 3000;

function frase(avisos: AvisoTablero[]): string {
  const autores = [...new Set(avisos.map((a) => a.autor))];

  if (avisos.length === 1) {
    const a = avisos[0];
    return a.obra ? `${a.autor} ${a.accion}: ${a.obra}` : `${a.autor} ${a.accion} una jornada`;
  }
  // Dos personas planificando a la vez pasa, y decir sólo "12 cambios" escondería que hay
  // alguien más metido en el mismo tablero, que es la mitad del dato.
  const quienes =
    autores.length === 1
      ? autores[0]
      : `${autores.slice(0, -1).join(", ")} y ${autores[autores.length - 1]}`;
  return `${quienes}: ${avisos.length} cambios en el tablero`;
}

/**
 * Escucha los cambios de los demás mientras el tablero esté en pantalla.
 *
 * El nombre propio viaja en cada aviso que uno EMITE, así que hasta que carga el perfil se
 * usa un genérico en vez de esperar: el aviso sin nombre sigue sirviendo, y una ráfaga
 * silenciosa por no tener el nombre todavía no.
 */
export function useAvisosTablero() {
  const qc = useQueryClient();
  const { data: user } = useUser();
  const nombre = user?.nombre?.trim() || "Alguien";

  // En refs para que el timer no se reinicie en cada render ni arrastre valores viejos.
  const pendientes = useRef<AvisoTablero[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const desconectar = conectarAvisos(nombre, (aviso) => {
      pendientes.current.push(aviso);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        const lote = pendientes.current;
        pendientes.current = [];
        timer.current = null;
        if (lote.length === 0) return;

        void qc.invalidateQueries({ queryKey: ["tablero"] });
        void qc.invalidateQueries({ queryKey: CLAVE_ACTIVIDAD });

        // `info` y no `warning`: que otro planifique no es un problema, es el uso normal
        // de un tablero compartido. El ámbar está reservado para lo que hay que mirar.
        toast.info(frase(lote), {
          description: "El tablero se actualizó con lo que hicieron los demás.",
        });
      }, ESPERA);
    });

    return () => {
      desconectar();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [qc, nombre]);
}
