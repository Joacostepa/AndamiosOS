// Los links a Google Maps ("Cómo llegar" y "Ver el recorrido en Maps"). Gratis y sin
// clave: es la URL pública de indicaciones (https://www.google.com/maps/dir/?api=1…), que
// en el celular abre la app de Maps si está instalada.
//
// Con coordenadas si las hay (el pin exacto de la obra), si no con la dirección en texto
// (", Buenos Aires" al final para que no busque en otro país).
//
// PURO y sin estado.ts: lo usan vista.ts (el celular), rutas.ts y la pantalla.
// Imports relativos y con extensión: este archivo corre en `node --test` sin Next.

export type PuntoMaps = { lat: number | null; lng: number | null; dir: string | null };

const BASE = "https://www.google.com/maps/dir/?api=1";
/**
 * Waypoints que acepta la URL de Maps entre el origen y el destino (9; en el navegador del
 * celular sin la app, Maps usa menos). Con más paradas, el recorrido llega hasta la que entra.
 */
export const MAX_WAYPOINTS = 9;

/** Cómo va un punto en la URL: "-34.603520,-58.381570" o "Av. Rivadavia 6150, Buenos Aires". null si no hay nada. */
export function puntoMaps(p: PuntoMaps | null | undefined): string | null {
  if (!p) return null;
  if (p.lat != null && p.lng != null && Number.isFinite(p.lat) && Number.isFinite(p.lng)) return `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;
  const d = p.dir?.trim();
  if (!d) return null;
  return /buenos aires|caba|capital federal/i.test(d) ? d : `${d}, Buenos Aires`;
}

const q = (k: string, v: string) => `&${k}=${encodeURIComponent(v)}`;

/** "Cómo llegar": hasta `destino`, desde donde está el teléfono (o desde `origen`). */
export function urlComoLlegar(destino: PuntoMaps | null | undefined, origen?: PuntoMaps | null): string | null {
  const d = puntoMaps(destino);
  if (!d) return null;
  const o = puntoMaps(origen);
  return `${BASE}${o ? q("origin", o) : ""}${q("destination", d)}&travelmode=driving`;
}

/**
 * Todas las paradas en orden: la primera es el origen, la última el destino y las del medio
 * van de waypoints. Se saltean las que no se pueden ubicar y las repetidas seguidas (el
 * depósito → el depósito). null si no queda ninguna.
 */
export function urlRecorrido(paradas: (PuntoMaps | null | undefined)[]): string | null {
  const ps: string[] = [];
  for (const p of paradas) {
    const x = puntoMaps(p);
    if (x && ps[ps.length - 1] !== x) ps.push(x);
  }
  if (!ps.length) return null;
  if (ps.length === 1) return `${BASE}${q("destination", ps[0])}&travelmode=driving`;
  const corto = ps.slice(0, MAX_WAYPOINTS + 2);
  const medio = corto.slice(1, -1);
  return `${BASE}${q("origin", corto[0])}${q("destination", corto[corto.length - 1])}${medio.length ? q("waypoints", medio.join("|")) : ""}&travelmode=driving`;
}
