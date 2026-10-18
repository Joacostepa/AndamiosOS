"use client";

import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { ShieldCheck } from "lucide-react";
import { AVISO } from "@/lib/tablero/colores";
import { DIAS_INDICADOR, GUARDIAS_POR_SEMANA, type LugarProtegido } from "@/lib/tablero/guardias-tipos";

// "Lugar protegido próximos 5 días hábiles: X de N j" (guardias-contrato.md §1.6).
//
// X son las jornadas que todavía se pueden dar a lo imprevisto sin mover a nadie: lo libre
// de las cuadrillas propias más las guardias activas. N son las guardias que corresponden a
// esos días. Contesta, arriba de todo y sin abrir nada, "si mañana entra una urgencia,
// ¿dónde la pongo?".
//
// DOS TONOS Y NINGUNO ROJO: gris si están todas las guardias activas y no falta ninguna;
// ámbar si alguna ya se usó o alguna semana quedó con menos de dos. Ámbar es "mirá esto",
// no "se rompió": quedarse sin guardias es lo que pasa en una semana cargada, y para eso
// están. El ámbar es el del recuadro de aviso del tablero, que ya dice eso.
//
// Va en la barra de arriba y no en la grilla: habla de los próximos días desde HOY, no de
// lo que se está mirando, y la grilla scrollea.

const DECIMAL = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 });
const dia = (f: string) => format(parseISO(f), "EEE d", { locale: es });

export function IndicadorProtegido({ lugar }: { lugar: LugarProtegido | null }) {
  if (!lugar || lugar.dias.length === 0) return null;
  const ambar = lugar.nivel === "ambar";
  const usadas = lugar.esperadas - lugar.activas;
  // SIN GUARDIAS ESOS DÍAS (la semana del arranque: la en curso nunca lleva) "7 de 0 j" se lee
  // como un error. Se dice lo que hay: lo libre, y que todavía no hay guardias.
  const sinGuardias = lugar.esperadas === 0;
  const cifra = sinGuardias
    ? `sin guardias · libre ${DECIMAL.format(lugar.protegido)} j`
    : `${DECIMAL.format(lugar.protegido)} de ${lugar.esperadas} j`;
  const motivos = [
    usadas > 0 ? `${usadas} guardia${usadas === 1 ? " ya se usó" : "s ya se usaron"}` : null,
    lugar.falta && !sinGuardias ? `alguna semana tiene menos de ${GUARDIAS_POR_SEMANA} guardias` : null,
  ].filter(Boolean);
  const titulo = [
    `Próximos ${DIAS_INDICADOR} días hábiles (${dia(lugar.dias[0])} a ${dia(lugar.dias[lugar.dias.length - 1])}).`,
    `${DECIMAL.format(lugar.protegido)} j se pueden dar a lo imprevisto sin mover a nadie: lo libre de las cuadrillas propias más las guardias activas.`,
    `Guardias de esos días: ${lugar.esperadas}, activas: ${lugar.activas}.`,
    motivos.length > 0 ? `Ojo: ${motivos.join(" y ")}.` : null,
  ]
    .filter(Boolean)
    .join("\n");

  // EL LECTOR DE PANTALLA LEE UNA SOLA FRASE, ENTERA, en cualquier ancho: lo visible va con
  // aria-hidden (en celular sólo queda "Protegido: 2 de 2 j", que sin contexto no dice nada).
  // Sin role="status": es un dato que está, no un anuncio, y con status el lector lo repetía
  // cada vez que llegaba un aviso en vivo y el tablero se recalculaba.
  const frase =
    `Lugar protegido próximos ${DIAS_INDICADOR} días hábiles: ${cifra}.` +
    (motivos.length > 0 ? ` Ojo: ${motivos.join(" y ")}.` : "");

  return (
    <span
      title={titulo}
      className="inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-xs font-medium tabular-nums"
      style={
        ambar
          ? { backgroundColor: AVISO.fondo, borderColor: AVISO.borde, color: AVISO.texto }
          : { color: "var(--muted-foreground)" }
      }
    >
      <ShieldCheck className="h-3.5 w-3.5 shrink-0" style={ambar ? { color: AVISO.icono } : undefined} aria-hidden />
      <span className="sr-only">{frase}</span>
      {/* En celular queda el número: la frase entera va en el tooltip y en el lector. */}
      <span className="hidden lg:inline" aria-hidden>
        Lugar protegido próximos {DIAS_INDICADOR} días hábiles:
      </span>
      <span className="lg:hidden" aria-hidden>
        Protegido:
      </span>
      <span aria-hidden>{cifra}</span>
    </span>
  );
}
