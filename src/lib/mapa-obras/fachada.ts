// La fachada de una obra: dónde se apoya la estructura y hacia dónde queda el edificio.
//
// SOLO server-side (baja tiles de internet y usa zlib). La geometría (`calcularFachada`) es
// pura y tiene tests en fachada.test.ts; la descarga (`FuenteTiles`) recibe el fetch por
// parámetro para poder probarla sin red.
//
// POR QUÉ HACE FALTA: el punto que devuelve Google cae en cualquier lado —en el techo, en el
// medio de la calle, en el centroide de la parcela—, y el 3D necesita saber dónde está la
// línea municipal y para qué lado crece el andamio. Se saca de OpenStreetMap: se busca la
// calle de la dirección cerca del punto, se proyecta el punto sobre ella y se corre media
// calzada más 1,5 m hacia el lado de la obra. Ahí empieza la vereda.
//
// POR QUÉ EN EL SERVIDOR Y NO EN EL MAPA: el browser tendría que esperar a que estén todos
// los tiles alrededor de cada obra para poder dibujarla, y el resultado no cambia nunca para
// la misma dirección. Se calcula una vez y se cachea (src/lib/odoo/mapa-obras.ts).

import { gunzipSync } from "node:zlib";
import { VectorTile } from "@mapbox/vector-tile";
import { PbfReader } from "pbf";
import { calleDeDireccion, normalizarCalle } from "./direccion.ts";
import type { Fachada } from "./tipos.ts";

/** Zoom de los tiles: el máximo de OpenFreeMap, donde están todas las calles con nombre. */
export const ZOOM = 14;

/** Hasta dónde se busca la calle de la dirección (el punto de Google puede estar en el fondo del lote). */
export const RADIO_CALLE_NOMBRADA_M = 160;
/** Si la calle de la dirección no aparece, la más cercana, pero sólo si está realmente cerca. */
export const RADIO_CALLE_CERCANA_M = 90;
/** De la línea municipal hacia afuera: el andamio se apoya sobre la vereda. */
const VEREDA_M = 1.5;

/**
 * Media calzada por clase de calle de OpenMapTiles, en metros. Aproximado: OSM casi nunca trae
 * el ancho, y un error de 2 m no se ve a la escala del mapa. Las clases que no están (vías,
 * senderos, ríos) no sirven para apoyar una fachada.
 */
export const MEDIA_CALZADA_M: Record<string, number> = {
  motorway: 16, trunk: 14, primary: 12, secondary: 10, tertiary: 8, minor: 6, service: 4,
};

export type Coord = [number, number]; // [lng, lat]
export type Linea = { nombre: string | null; clase: string | null; coords: Coord[] };
/** Lo que se usa de un tile: las calles (para la más cercana) y sus nombres (para la de la dirección). */
export type LineasTile = { calles: Linea[]; nombres: Linea[] };

// ─── Tiles ───────────────────────────────────────────────────────────────────

export function lngATile(lng: number, z = ZOOM): number {
  return ((lng + 180) / 360) * 2 ** z;
}
export function latATile(lat: number, z = ZOOM): number {
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z;
}

/**
 * Los tiles que tocan un cuadrado de `radioM` alrededor del punto. Casi siempre es uno solo
 * (un tile z14 mide ~2 km en Buenos Aires); dos o cuatro cuando la obra está cerca del borde.
 * La maqueta pedía los 9 de alrededor: era cinco veces más descarga para el mismo resultado.
 */
export function tilesAlrededor(lat: number, lng: number, radioM = RADIO_CALLE_NOMBRADA_M + 40, z = ZOOM): { x: number; y: number }[] {
  const dLat = radioM / 110_574;
  const dLng = radioM / (111_320 * Math.cos((lat * Math.PI) / 180));
  const x0 = Math.floor(lngATile(lng - dLng, z)), x1 = Math.floor(lngATile(lng + dLng, z));
  const y0 = Math.floor(latATile(lat + dLat, z)), y1 = Math.floor(latATile(lat - dLat, z));
  const out: { x: number; y: number }[] = [];
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) out.push({ x, y });
  return out;
}

/** Las líneas de un tile vectorial (.pbf) que sirven para la fachada. */
export function decodificarTile(buf: Uint8Array, x: number, y: number, z = ZOOM): LineasTile {
  // Algunos servidores mandan el pbf comprimido sin avisarlo en los headers.
  const datos = buf[0] === 0x1f && buf[1] === 0x8b ? gunzipSync(buf) : buf;
  // VectorTile tipa su propia copia de pbf (v4); PbfReader (v5) es la misma clase con otro nombre.
  const vt = new VectorTile(new PbfReader(datos) as unknown as ConstructorParameters<typeof VectorTile>[0]);
  const lineas = (capa: string): Linea[] => {
    const L = vt.layers[capa];
    if (!L) return [];
    const out: Linea[] = [];
    for (let i = 0; i < L.length; i++) {
      const f = L.feature(i);
      if (f.type !== 2) continue; // sólo líneas
      const g = f.toGeoJSON(x, y, z).geometry;
      const partes = g.type === "LineString" ? [g.coordinates] : g.type === "MultiLineString" ? g.coordinates : [];
      const nombre = typeof f.properties.name === "string" ? f.properties.name : null;
      const clase = typeof f.properties.class === "string" ? f.properties.class : null;
      for (const p of partes) if (p.length > 1) out.push({ nombre, clase, coords: p.map((c) => [c[0], c[1]] as Coord) });
    }
    return out;
  };
  return { calles: lineas("transportation"), nombres: lineas("transportation_name") };
}

// ─── Geometría ───────────────────────────────────────────────────────────────

/**
 * ¿El nombre de OSM es la calle de la dirección? Normalizados ("Avenida General Las Heras" y
 * "Av. Gral. Las Heras" son iguales), y si no, todas las palabras del más corto están en el
 * más largo: OSM suele traer el nombre completo y Odoo el apellido ("Mansilla" es "General
 * Lucio Norberto Mansilla", "Libertador" es "Avenida del Libertador", "Profesor Mariño" es
 * "Profesor J. Mariño").
 *
 * Con dos excepciones: el más corto tiene que tener alguna palabra de 4 letras o más ("Rio" no
 * es "La Rioja"), y el largo no puede sumar una fecha: "de Mayo" NO es "25 de Mayo", son dos
 * calles distintas a 400 m.
 */
export function mismaCalle(osm: string | null, buscada: string): boolean {
  const n = normalizarCalle(osm);
  if (n.length < 3 || buscada.length < 3) return false;
  if (n === buscada) return true;
  const a = n.split(" "), b = buscada.split(" ");
  const cubre = (corta: string[], larga: string[]) => {
    if (!corta.some((w) => w.length >= 4) || !corta.every((w) => larga.includes(w))) return false;
    // Un número que el corto no tiene, seguido de "de": es una fecha ("25 de mayo", "9 de julio").
    return !larga.some((w, i) => /^\d+$/.test(w) && !corta.includes(w) && larga[i + 1] === "de");
  };
  return cubre(a, b) || cubre(b, a);
}

type Candidata = { d: number; q: [number, number]; dir: [number, number]; clase: string | null; nombre: string | null };

/**
 * La fachada a partir del punto de Odoo, la dirección y las líneas de los tiles de alrededor.
 *
 *  1. La calle de la dirección (`transportation_name`, comparando normalizado) a menos de
 *     RADIO_CALLE_NOMBRADA_M. Si está, `coincideCalle`.
 *  2. Si no aparece (OSM la llama distinto, la dirección es una ruta, un nombre propio), la
 *     calle más cercana a menos de RADIO_CALLE_CERCANA_M.
 *  3. Si tampoco, null: el mapa dibuja la obra en el punto, sin orientar.
 *
 * Las cuentas se hacen en metros sobre un plano local (equirectangular): a 160 m el error de
 * la proyección es de milímetros.
 */
export function calcularFachada(lat: number, lng: number, direccion: string | null, lineas: LineasTile): Fachada | null {
  const kx = 111_320 * Math.cos((lat * Math.PI) / 180), ky = 110_574;
  const P0: [number, number] = [lng * kx, lat * ky];
  const buscada = calleDeDireccion(direccion);

  const masCercana = (ls: Linea[], maxD: number, P: [number, number] = P0): Candidata | null => {
    let mejor: Candidata | null = null;
    for (const l of ls) {
      for (let i = 0; i < l.coords.length - 1; i++) {
        const A = [l.coords[i][0] * kx, l.coords[i][1] * ky], B = [l.coords[i + 1][0] * kx, l.coords[i + 1][1] * ky];
        const dx = B[0] - A[0], dy = B[1] - A[1], L2 = dx * dx + dy * dy;
        if (!L2) continue;
        const u = Math.max(0, Math.min(1, ((P[0] - A[0]) * dx + (P[1] - A[1]) * dy) / L2));
        const q: [number, number] = [A[0] + u * dx, A[1] + u * dy];
        const d = Math.hypot(P[0] - q[0], P[1] - q[1]);
        if (d < maxD && (!mejor || d < mejor.d)) {
          const largo = Math.sqrt(L2);
          mejor = { d, q, dir: [dx / largo, dy / largo], clase: l.clase, nombre: l.nombre };
        }
      }
    }
    return mejor;
  };

  const nombradas = buscada ? lineas.nombres.filter((l) => mismaCalle(l.nombre, buscada)) : [];
  let mejor = masCercana(nombradas, RADIO_CALLE_NOMBRADA_M);
  const coincide = mejor != null;
  if (!mejor) {
    mejor = masCercana(lineas.calles.filter((l) => l.clase != null && l.clase in MEDIA_CALZADA_M), RADIO_CALLE_CERCANA_M);
    if (!mejor) return null;
    // La capa de calles no trae nombres: el nombre es el de `transportation_name` que pasa
    // por ese mismo lugar (a pocos metros del punto proyectado), si hay.
    if (!mejor.nombre) mejor.nombre = masCercana(lineas.nombres, 15, mejor.q)?.nombre ?? null;
  }

  // La normal apunta de la calle hacia el punto de Odoo: de ese lado está la obra. Si el punto
  // cae justo sobre el eje (Google a veces interpola sobre la calle), el lado es arbitrario;
  // no hay de dónde sacar algo mejor sin las alturas de cada vereda.
  let n: [number, number] = [-mejor.dir[1], mejor.dir[0]];
  if ((P0[0] - mejor.q[0]) * n[0] + (P0[1] - mejor.q[1]) * n[1] < 0) n = [-n[0], -n[1]];
  const corrimiento = (MEDIA_CALZADA_M[mejor.clase ?? ""] ?? 7) + VEREDA_M;
  const F = [mejor.q[0] + n[0] * corrimiento, mejor.q[1] + n[1] * corrimiento];

  // `|| 0`: sin él, una normal [1, 0] sale [1, -0] y el JSON igual dice 0, pero los tests no.
  const r = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d || 0;
  return {
    lng: r(F[0] / kx, 7),
    lat: r(F[1] / ky, 7),
    normal: [r(n[0], 4), r(n[1], 4)],
    calle: mejor.nombre,
    coincideCalle: coincide,
  };
}

// ─── Descarga ────────────────────────────────────────────────────────────────

/** Un tile que no se pudo bajar: la fachada no se calcula, pero tampoco se cachea como "no hay". */
export class ErrorTiles extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ErrorTiles";
  }
}

const TILEJSON = "https://tiles.openfreemap.org/planet";
/** OpenFreeMap publica una versión nueva del planeta cada tanto y cambia la URL de los tiles. */
const VIDA_TILEJSON_MS = 6 * 60 * 60_000;
const VIDA_TILE_MS = 24 * 60 * 60_000;
/** Tiles en memoria (sólo sus calles, no el pbf: ~10 veces menos). CABA entera son ~150. */
const MAX_TILES = 400;

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

/**
 * Baja tiles de OpenFreeMap: cada tile UNA sola vez aunque lo pidan varias obras a la vez
 * (se guarda la promesa, no el resultado), con un tope de descargas simultáneas y timeout.
 */
export class FuenteTiles {
  private plantilla: { url: string; at: number } | null = null;
  private tiles = new Map<string, { p: Promise<LineasTile>; at: number }>();
  private enVuelo = 0;
  private cola: (() => void)[] = [];
  private readonly opciones: { fetch?: Fetch; timeoutMs?: number; concurrencia?: number; tilejson?: string };

  // Sin "parameter properties": los tests corren con --experimental-strip-types, que no las soporta.
  constructor(opciones: { fetch?: Fetch; timeoutMs?: number; concurrencia?: number; tilejson?: string } = {}) {
    this.opciones = opciones;
  }

  private get fetch(): Fetch {
    return this.opciones.fetch ?? fetch;
  }

  private async conTurno<T>(fn: () => Promise<T>): Promise<T> {
    const max = this.opciones.concurrencia ?? 6;
    if (this.enVuelo >= max) await new Promise<void>((ok) => this.cola.push(ok));
    this.enVuelo++;
    try {
      return await fn();
    } finally {
      this.enVuelo--;
      this.cola.shift()?.();
    }
  }

  private async bajar(url: string): Promise<Response> {
    let res: Response;
    try {
      res = await this.fetch(url, { signal: AbortSignal.timeout(this.opciones.timeoutMs ?? 10_000), cache: "no-store" });
    } catch (e) {
      throw new ErrorTiles(`${url}: ${e instanceof Error ? e.message : String(e)}`);
    }
    if (!res.ok) throw new ErrorTiles(`${url}: HTTP ${res.status}`);
    return res;
  }

  /** La URL de los tiles sale del TileJSON (`tiles[0]`): la versión cambia y no se escribe a mano. */
  private async urlTiles(): Promise<string> {
    if (this.plantilla && Date.now() - this.plantilla.at < VIDA_TILEJSON_MS) return this.plantilla.url;
    const res = await this.bajar(this.opciones.tilejson ?? TILEJSON);
    // Un cuerpo cortado o que no es JSON también es un error de red (ErrorTiles, ver `tile`).
    const json = (await res.json().catch((e: unknown) => {
      throw new ErrorTiles(`TileJSON ilegible: ${e instanceof Error ? e.message : String(e)}`);
    })) as { tiles?: string[] };
    const url = json.tiles?.[0];
    if (!url) throw new ErrorTiles("El TileJSON de OpenFreeMap no trae tiles");
    this.plantilla = { url, at: Date.now() };
    return url;
  }

  tile(x: number, y: number, z = ZOOM): Promise<LineasTile> {
    const k = `${z}/${x}/${y}`;
    const hit = this.tiles.get(k);
    if (hit && Date.now() - hit.at < VIDA_TILE_MS) return hit.p;
    const p = this.conTurno(async () => {
      const url = (await this.urlTiles()).replace("{z}", String(z)).replace("{x}", String(x)).replace("{y}", String(y));
      let buf: Uint8Array;
      try {
        buf = new Uint8Array(await (await this.bajar(url)).arrayBuffer());
      } catch (e) {
        // El timeout puede saltar leyendo el cuerpo, no sólo en los headers.
        throw e instanceof ErrorTiles ? e : new ErrorTiles(`${url}: ${e instanceof Error ? e.message : String(e)}`);
      }
      try {
        return decodificarTile(buf, x, y, z);
      } catch (e) {
        // Un tile cortado o corrupto es un error de red, no un "no hay calle": tiene que ser
        // ErrorTiles. Si no, mapa-obras.ts lo toma por "no hay Data Cache" y deja de usarla
        // para todas las obras de esa instancia.
        throw new ErrorTiles(`${url}: tile ilegible (${e instanceof Error ? e.message : String(e)})`);
      }
    });
    // Un fallo no se recuerda: la próxima vez se vuelve a intentar. Sólo si sigue siendo ESTA
    // promesa: si ya la reemplazó una descarga nueva, no se borra la buena.
    p.catch(() => {
      if (this.tiles.get(k)?.p === p) this.tiles.delete(k);
    });
    if (this.tiles.size >= MAX_TILES) this.tiles.delete(this.tiles.keys().next().value!);
    this.tiles.set(k, { p, at: Date.now() });
    return p;
  }

  /** Las líneas de todos los tiles alrededor del punto, juntas. Tira ErrorTiles si falta alguno. */
  async alrededor(lat: number, lng: number): Promise<LineasTile> {
    const partes = await Promise.all(tilesAlrededor(lat, lng).map(({ x, y }) => this.tile(x, y)));
    return { calles: partes.flatMap((t) => t.calles), nombres: partes.flatMap((t) => t.nombres) };
  }
}

/** La fachada de una obra, bajando lo que haga falta. Tira ErrorTiles si la red falla. */
export async function fachadaDeObra(fuente: FuenteTiles, lat: number, lng: number, direccion: string | null): Promise<Fachada | null> {
  return calcularFachada(lat, lng, direccion, await fuente.alrededor(lat, lng));
}
