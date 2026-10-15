// Las 7 secciones de Dirección (diseno.md §2.1): ruta, pestaña, pregunta del encabezado.
// Puro: lo usan el layout, las pestañas, la barra inferior y los tests.

import type { PantallaId } from "./tipos.ts";

export type Seccion = {
  id: PantallaId;
  href: string;
  /** Texto de la pestaña. */
  titulo: string;
  /** Texto corto de la barra inferior del celular. */
  corto: string;
  /** El h1 de la pantalla (La semana dice "Dirección"). */
  pregunta: string;
  /** Sólo con direccion-socios: sin permiso NO se muestra (no un candado deshabilitado). */
  socios?: boolean;
  /** Saldos de hoy: el encabezado dice "Hoy, jue 15/10". */
  fotoDeHoy?: boolean;
};

export const SECCIONES: readonly Seccion[] = [
  { id: "semana", href: "/direccion", titulo: "La semana", corto: "Semana", pregunta: "Dirección" },
  { id: "caja", href: "/direccion/caja", titulo: "Caja", corto: "Caja", pregunta: "¿Cuánta plata hay y llegamos?", fotoDeHoy: true },
  { id: "ventas", href: "/direccion/ventas", titulo: "Ventas", corto: "Ventas", pregunta: "¿Facturamos y ganamos?" },
  { id: "cobranzas", href: "/direccion/cobranzas", titulo: "Cobranzas", corto: "Cobranzas", pregunta: "¿Quién nos debe?", fotoDeHoy: true },
  { id: "calle", href: "/direccion/calle", titulo: "En la calle", corto: "En la calle", pregunta: "¿Qué está en la calle?", fotoDeHoy: true },
  { id: "socios", href: "/direccion/socios", titulo: "Socios", corto: "Socios", pregunta: "¿Cuánto retiramos?", socios: true },
  { id: "datos", href: "/direccion/datos", titulo: "Datos", corto: "Datos", pregunta: "Datos y definiciones" },
];

/** La barra inferior del celular: 4 destinos + "Más" (§7.8). */
export const BARRA_INFERIOR: readonly PantallaId[] = ["semana", "caja", "cobranzas", "ventas"];
export const EN_MAS: readonly PantallaId[] = ["calle", "socios", "datos"];

export const seccionesVisibles = (conSocios: boolean): Seccion[] => SECCIONES.filter((s) => !s.socios || conSocios);

/** La sección de una ruta (/direccion/caja → caja). Fuera de Dirección, La semana. */
export function seccionDeRuta(pathname: string): Seccion {
  const largo = [...SECCIONES].sort((a, b) => b.href.length - a.href.length);
  return largo.find((s) => pathname === s.href || pathname.startsWith(`${s.href}/`)) ?? SECCIONES[0];
}
