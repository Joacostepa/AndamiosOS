// Ciudad Armada: la geometría de cada obra en el mapa. Funciones puras, sin MapLibre.
//
// Portado de `geom()`, `square()` y `refresh()` de la maqueta aprobada
// (docs/mapa-obras/maqueta/ciudad-armada.html). La estructura se dibuja con polígonos que el
// mapa levanta con `fill-extrusion` (cada feature trae su base `b` y su tope `t` en metros):
// no hay three.js, así que un andamio son ~50 prismas finos.
//
// Sistema de referencia local, en metros, apoyado en el punto de la fachada:
//   · s — a lo largo de la fachada (vector u, perpendicular a la normal);
//   · d — distancia hacia la CALLE (vector w = −normal). d < 0 es adentro del edificio.
// La normal de `Fachada` apunta de la calle al edificio, por eso la estructura (d > 0) queda
// del lado de la vereda y el edificio aproximado (d < 0) del otro.

import type { Feature, FeatureCollection, Point, Polygon, Position } from "geojson";
import type { CategoriaMapa, ObraMapa, ObraParaMapa } from "./tipos.ts";
import { COLOR_CATEGORIA, COLOR_ESTRUCTURA, type TemaMapa } from "./colores.ts";

/** p = parante/travesaño/plataforma/baranda/diagonal · n = malla · b = edificio aproximado. */
export type ParteEstructura = "p" | "n" | "b";

export type PropsEstructura = { id: number; part: ParteEstructura; c: string; b: number; t: number };
export type PropsColumna = { id: number; c: string; h: number };
export type PropsPunto = { id: number; c: string; cat: CategoriaMapa; lab: string; sub: string };

export type FeatureEstructura = Feature<Polygon, PropsEstructura>;
export type FeatureColumna = Feature<Polygon, PropsColumna>;
export type FeaturePunto = Feature<Point, PropsPunto>;

type Vec = [number, number];

/** Metros por grado (aproximación local, sobra para unos metros alrededor de un punto). */
const M_POR_GRADO_LAT = 110574;
const mPorGradoLng = (lat: number) => 111320 * Math.cos((lat * Math.PI) / 180);

/** Las obras sin coordenadas o con la ubicación equivocada no se dibujan. */
export function seDibuja(o: ObraMapa): boolean {
  if (o.ubicacion === "sin_ubicacion" || o.ubicacion === "lejos") return false;
  return anclaDe(o) != null;
}

/**
 * Dónde se apoya la obra y hacia dónde queda el edificio. Sin fachada, el punto de Odoo y la
 * normal [0, 1] (el edificio al norte): la estructura queda bien armada, sólo que orientada al azar.
 */
export function anclaDe(o: ObraMapa): { punto: Vec; normal: Vec } | null {
  const f = o.fachada;
  if (f && Number.isFinite(f.lng) && Number.isFinite(f.lat)) {
    return { punto: [f.lng, f.lat], normal: normalizar(f.normal) };
  }
  if (o.lat != null && o.lng != null && Number.isFinite(o.lat) && Number.isFinite(o.lng)) {
    return { punto: [o.lng, o.lat], normal: [0, 1] };
  }
  return null;
}

function normalizar(n: [number, number] | null | undefined): Vec {
  if (!n) return [0, 1];
  const [x, y] = n;
  const l = Math.hypot(x, y);
  if (!Number.isFinite(l) || l < 1e-9) return [0, 1];
  return [x / l, y / l];
}

const acotar = (v: number, min: number, max: number, def: number) =>
  Number.isFinite(v) && v > 0 ? Math.min(max, Math.max(min, v)) : def;

/** Medidas que se dibujan: las de la obra, acotadas para que un dato roto no dibuje un rascacielos. */
export function medidasDibujo(o: ObraMapa) {
  const m = o.medidas;
  return {
    largo: acotar(m?.largo, 1, 200, 6),
    ancho: Math.max(0.9, acotar(m?.ancho, 0.5, 6, 1.25)),
    alto: acotar(m?.alto, 1, 120, 3),
  };
}

/** Un punto a `s` metros sobre la fachada y `d` metros hacia la calle. */
function proyector(punto: Vec, normal: Vec) {
  const kx = 1 / mPorGradoLng(punto[1]);
  const ky = 1 / M_POR_GRADO_LAT;
  const u: Vec = [-normal[1], normal[0]];
  const w: Vec = [-normal[0], -normal[1]];
  return (s: number, d: number): Position => [
    punto[0] + (u[0] * s + w[0] * d) * kx,
    punto[1] + (u[1] * s + w[1] * d) * ky,
  ];
}

/** Un punto `metros` adentro del edificio, detrás de la fachada (para buscar el edificio de OSM). */
export function puntoDetras(o: ObraMapa, metros = 5): Vec | null {
  const a = anclaDe(o);
  if (!a) return null;
  const P = proyector(a.punto, a.normal);
  const [x, y] = P(0, -metros);
  return [x, y];
}

export type OpcionesEstructura = {
  /** Color de la categoría: parantes, travesaños, baranda, diagonales y malla. */
  color: string;
  tema: TemaMapa;
  /** Dibujar el edificio aproximado detrás (false si OpenStreetMap ya tiene uno). */
  edificio?: boolean;
};

/**
 * La estructura de la obra sobre la vereda: parantes, travesaños, plataformas, baranda,
 * diagonales en escalera, malla y (opcional) el edificio aproximado. `geom()` de la maqueta.
 */
export function estructura(o: ObraMapa, op: OpcionesEstructura): FeatureEstructura[] {
  const a = anclaDe(o);
  if (!a) return [];
  const P = proyector(a.punto, a.normal);
  const out: FeatureEstructura[] = [];
  const R = (s0: number, s1: number, d0: number, d1: number): Position[][] => [
    [P(s0, d0), P(s1, d0), P(s1, d1), P(s0, d1), P(s0, d0)],
  ];
  const add = (poly: Position[][], b: number, t: number, part: ParteEstructura, c = op.color) =>
    out.push({
      type: "Feature",
      properties: { id: o.ventaId, part, c, b: redondear(b), t: redondear(t) },
      geometry: { type: "Polygon", coordinates: poly },
    });

  const { largo: L, ancho: D, alto: H } = medidasDibujo(o);
  const pt = 0.13; // medio lado del parante
  const lt = 0.09; // medio lado del travesaño
  const nb = Math.max(1, Math.round(L / 2.57)); // cuerpos de ~2,57 m
  const bw = L / nb;
  const lev: number[] = [];
  for (let y = 2; y < H - 0.4; y += 2) lev.push(y);
  lev.push(H);
  const d0 = 0.25; // separación de la fachada
  const d1 = D;

  // Parantes (el de afuera sube 1 m más: la baranda) y travesaños transversales por nivel.
  for (let i = 0; i <= nb; i++) {
    const s = -L / 2 + i * bw;
    for (const d of [d0, d1]) add(R(s - pt, s + pt, d - pt, d + pt), 0, H + (d === d1 ? 1 : 0), "p");
    for (const y of lev) add(R(s - lt, s + lt, d0, d1), y - 0.12, y, "p");
  }
  // Largueros, plataforma y baranda por nivel.
  const madera = COLOR_ESTRUCTURA.plataforma[op.tema];
  for (const y of lev) {
    for (const d of [d0, d1]) add(R(-L / 2, L / 2, d - lt, d + lt), y - 0.12, y, "p");
    add(R(-L / 2, L / 2, d0 + 0.06, d1 - 0.06), y - 0.07, y - 0.01, "p", madera);
    add(R(-L / 2, L / 2, d1 - lt, d1 + lt), y + 0.95, y + 1.05, "p");
  }
  // Diagonales en escalera, en un cuerpo sí y otro no, del lado de la calle.
  const pasos = 6;
  const tramos = [0, ...lev].slice(0, -1);
  for (let i = 0; i < nb; i += 2) {
    const s = -L / 2 + i * bw;
    for (const y of tramos) {
      const yn = lev.find((v) => v > y) ?? H;
      for (let k = 0; k < pasos; k++) {
        const s0 = s + (bw * k) / pasos;
        const s1 = s + (bw * (k + 1)) / pasos;
        add(R(s0, s1, d1 + 0.12, d1 + 0.2), y + ((yn - y) * k) / pasos, y + ((yn - y) * (k + 1)) / pasos, "p");
      }
    }
  }
  // Malla (la pantalla), translúcida en su capa.
  add(R(-L / 2, L / 2, d1 + 0.24, d1 + 0.3), 0, H + 1, "n");
  // Edificio aproximado: 3 m más ancho que la estructura de cada lado, 16 m de fondo.
  if (op.edificio !== false) {
    add(R(-L / 2 - 3, L / 2 + 3, -16, -0.05), 0, Math.max(H + 7, 12), "b", COLOR_ESTRUCTURA.edificio[op.tema]);
  }
  return out;
}

const redondear = (v: number) => Math.round(v * 1000) / 1000;

/** Cuadrado de `lado` metros centrado en el punto de la obra (la columna de lejos). `square()`. */
export function columna(o: ObraMapa, color: string, alto: number, lado = 70): FeatureColumna | null {
  const a = anclaDe(o);
  if (!a) return null;
  const [x, y] = a.punto;
  const kx = 1 / mPorGradoLng(y);
  const ky = 1 / M_POR_GRADO_LAT;
  const s = lado / 2;
  return {
    type: "Feature",
    properties: { id: o.ventaId, c: color, h: alto },
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [x - s * kx, y - s * ky],
          [x + s * kx, y - s * ky],
          [x + s * kx, y + s * ky],
          [x - s * kx, y + s * ky],
          [x - s * kx, y - s * ky],
        ],
      ],
    },
  };
}

/** Altura de la columna: más alta cuanto más días lleva en la calle; las pendientes, bien visibles. */
export function alturaColumna(categoria: CategoriaMapa, diasArmado: number | null): number {
  if (categoria === "pendiente") return 420;
  if (categoria === "desarmada") return 90;
  return Math.min(900, 60 + (diasArmado ?? 40) * 3.2);
}

/** El punto de la etiqueta y del círculo: sobre la fachada. */
export function punto(p: ObraParaMapa): FeaturePunto | null {
  const a = anclaDe(p.obra);
  if (!a) return null;
  return {
    type: "Feature",
    properties: {
      id: p.obra.ventaId,
      c: COLOR_CATEGORIA[p.categoria],
      cat: p.categoria,
      lab: p.obra.direccionCorta || "Sin dirección",
      sub: p.subtitulo,
    },
    geometry: { type: "Point", coordinates: a.punto },
  };
}

export type CapasObras = {
  estructura: FeatureCollection<Polygon, PropsEstructura>;
  columnas: FeatureCollection<Polygon, PropsColumna>;
  puntos: FeatureCollection<Point, PropsPunto>;
};

/**
 * Todo lo que el mapa necesita para las obras, listo para `setData`.
 * `conEdificioOsm`: obras donde ya se encontró un edificio de OpenStreetMap detrás; a esas no
 * se les dibuja el aproximado.
 */
export function armarCapas(
  obras: ObraParaMapa[],
  tema: TemaMapa,
  conEdificioOsm: ReadonlySet<number> = new Set(),
): CapasObras {
  const estr: FeatureEstructura[] = [];
  const cols: FeatureColumna[] = [];
  const pts: FeaturePunto[] = [];
  for (const p of obras) {
    const o = p.obra;
    if (!seDibuja(o)) continue;
    const color = COLOR_CATEGORIA[p.categoria];
    const col = columna(o, color, alturaColumna(p.categoria, o.diasArmado));
    if (col) cols.push(col);
    estr.push(...estructura(o, { color, tema, edificio: !conEdificioOsm.has(o.ventaId) }));
    const pu = punto(p);
    if (pu) pts.push(pu);
  }
  return {
    estructura: { type: "FeatureCollection", features: estr },
    columnas: { type: "FeatureCollection", features: cols },
    puntos: { type: "FeatureCollection", features: pts },
  };
}
