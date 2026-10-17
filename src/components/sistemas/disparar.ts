"use client";

// Cómo se pide un reporte desde cualquier lado (botón del header, menú del avatar, ⌘K, Mis
// reportes): un CustomEvent en window que escucha <ReportarSistemas/> (contrato §7.1). Así
// nadie importa el panel y el recorrido puede abrirlo y cerrarlo sin conocer sus piezas.
//
// Y un estado mínimo, «sacando la foto», que comparten el panel y el botón: snapdom tarda
// entre medio y dos segundos, y sin una señal el botón parece no responder.

import { useSyncExternalStore } from "react";
import { EVENTOS } from "@/lib/sistemas/tipos";

/**
 * Pide un reporte (primero la foto, después el panel).
 *
 * `despuesDePopup`: desde un menú o desde ⌘K. El popup recién se está cerrando; si la foto
 * se saca ya, sale el menú en la captura. Se espera a que termine la animación de salida
 * (~250 ms) y dos cuadros más, para que el navegador lo haya despintado.
 */
export function pedirReporte(opciones: { despuesDePopup?: boolean } = {}): void {
  if (typeof window === "undefined") return;
  const disparar = () => {
    window.dispatchEvent(new CustomEvent(EVENTOS.reportar));
  };
  if (!opciones.despuesDePopup) return disparar();
  window.setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(disparar)), 250);
}

// ── «Sacando la foto» ────────────────────────────────────────────────────────

let capturando = false;
const oyentes = new Set<() => void>();

export function ponerCapturando(v: boolean): void {
  if (capturando === v) return;
  capturando = v;
  oyentes.forEach((o) => o());
}

function suscribir(o: () => void) {
  oyentes.add(o);
  return () => oyentes.delete(o);
}

export function useCapturando(): boolean {
  return useSyncExternalStore(suscribir, () => capturando, () => false);
}
