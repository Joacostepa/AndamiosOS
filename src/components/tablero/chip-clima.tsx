"use client";

import { CloudRain, Wind } from "lucide-react";
import { CLIMA, PELIGRO_SUAVE, PELIGRO_TEXTO } from "@/lib/tablero/colores";
import type { ClimaDia } from "@/lib/clima/pronostico";

/**
 * Lluvia y viento del día, en el encabezado del tablero.
 *
 * APARECE SÓLO CUANDO HAY ALGO QUE AVISAR. Un chip en las 21 columnas del rango diciendo
 * "0mm" sería ruido, y le sacaría fuerza justo a los días que sí tienen un problema — el
 * mismo criterio que ya rige el botón de notas. La contra es que la ausencia de chip queda
 * ambigua entre "no va a llover" y "todavía no hay pronóstico", y eso se resuelve en el
 * encabezado: cuando hay dato, la línea del clima va al tooltip del día aunque no haya
 * nada que avisar.
 *
 * VA ABSOLUTO, abajo a la izquierda, espejando al de notas. Si estuviera en el flujo del
 * flex, los días con clima correrían el número de lugar y la fila de fechas dejaría de
 * leerse de un barrido: es la misma razón por la que las notas están absolutas.
 */
export function ChipClima({ clima }: { clima: ClimaDia }) {
  if (clima.nivel === "nada") return null;

  const fuerte = clima.nivel === "fuerte";
  const llueve = clima.mm >= 2;
  const sopla = clima.viento >= 30;

  return (
    // NO CAPTURA EL PUNTERO. El encabezado es el agarre para desplazar la grilla, y un
    // elemento que se coma el pointerdown haría que arrastrar justo desde el chip no mueva
    // nada. Como contrapartida el chip no puede tener tooltip propio: el hover lo recibe el
    // encabezado, que ya lleva la línea del clima en su title.
    <span
      role="img"
      aria-label={textoClima(clima)}
      className="pointer-events-none absolute bottom-0.5 left-0.5 flex h-[15px] items-center gap-1 rounded px-1"
      style={{
        backgroundColor: fuerte ? PELIGRO_SUAVE : CLIMA.fondo,
        color: fuerte ? PELIGRO_TEXTO : CLIMA.texto,
      }}
    >
      {llueve && (
        <span className="flex items-center gap-0.5">
          <CloudRain className="h-2.5 w-2.5" />
          <span className="text-[9px] font-bold tabular-nums leading-none">{clima.mm}</span>
        </span>
      )}
      {sopla && (
        <span className="flex items-center gap-0.5">
          <Wind className="h-2.5 w-2.5" />
          <span className="text-[9px] font-bold tabular-nums leading-none">{clima.viento}</span>
        </span>
      )}
    </span>
  );
}

/**
 * La línea del clima en palabras. Se usa en el tooltip del chip y en el del encabezado.
 *
 * Dice las unidades porque "12 · 45" no se entiende, y nombra la fuente porque los datos
 * de MET Norway son CC BY 4.0 y hay que dar crédito. Aclara además que el viento es
 * SOSTENIDO: el modelo global no da ráfagas para Argentina, y en altura la ráfaga es
 * bastante peor que el sostenido. Mejor que lo sepa quien decide.
 */
export function textoClima(clima: ClimaDia): string {
  const partes = [
    clima.mm > 0 ? `${clima.mm} mm de lluvia` : "sin lluvia",
    `viento sostenido hasta ${clima.viento} km/h`,
  ];
  return `En horario de trabajo: ${partes.join(", ")}. Pronóstico MET Norway (CC BY 4.0).`;
}
