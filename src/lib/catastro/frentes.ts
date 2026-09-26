// El frente de una parcela medido sobre el plano del catastro de la Ciudad: los lados de la
// parcela que caen sobre el borde de la manzana son los que dan a la vereda. Si esos lados
// doblan, el lote es esquina y cada cara se mide por separado (criterio 2.1: "el desarrollo es
// la suma de los frentes, en esquina cada cara por separado").
//
// Sirve para las parcelas que no tienen el frente cargado en AGIP y para detectar las esquinas,
// que AGIP no distingue (da un solo "frente"). Verificado el 26/09 contra AGIP: Riobamba 653
// 7,84 = 7,84 · Navarro 2369 27,04 vs 27,02 · Chile 865 14,90 vs 14,72.
//
// Puro (sin red): los anillos vienen del GeoJSON del catastro, en [lon, lat].

export type Punto = [number, number];

export type Frentes = {
  /** Las caras a la calle, en metros (las de más de TRAMO_CORTO_M), en el orden del polígono. */
  caras: number[];
  /** Tramos cortos sobre la vereda (ochava, quiebres del lote). */
  tramosCortos: number[];
};

/** Hasta dónde un vértice de la parcela "está" sobre el borde de la manzana (los planos no coinciden al centímetro). */
const TOLERANCIA_M = 1.2;
/** Cambio de rumbo a partir del cual empieza otra cara. */
const QUIEBRE_GRADOS = 20;
/** Una cara más corta que esto es una ochava o un quiebre, no un frente. */
export const TRAMO_CORTO_M = 1.5;

/** A metros, alrededor de la latitud de la parcela (en una manzana el error es despreciable). */
function proyectar(lat0: number): (p: Punto) => Punto {
  const kx = Math.cos((lat0 * Math.PI) / 180) * 111_320;
  const ky = 110_574;
  return ([lon, lat]) => [lon * kx, lat * ky];
}

function distanciaASegmento([px, py]: Punto, [ax, ay]: Punto, [bx, by]: Punto): number {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Diferencia de rumbo entre dos lados, en grados (0 a 180). */
function giro(a: number, b: number): number {
  const d = Math.abs(a - b) % (2 * Math.PI);
  return ((d > Math.PI ? 2 * Math.PI - d : d) * 180) / Math.PI;
}

const redondear = (n: number) => Math.round(n * 100) / 100;

export function medirFrentes(parcela: Punto[], manzana: Punto[]): Frentes {
  if (parcela.length < 3 || manzana.length < 3) return { caras: [], tramosCortos: [] };
  const aM = proyectar(parcela[0][1]);
  const P = parcela.map(aM);
  const M = manzana.map(aM);
  const sobreBorde = (p: Punto) => M.some((a, i) => distanciaASegmento(p, a, M[(i + 1) % M.length]) <= TOLERANCIA_M);

  // Los lados de la parcela que van por el borde de la manzana (los dos extremos y el medio).
  const lados: { largo: number; rumbo: number }[] = [];
  for (let i = 0; i < P.length; i++) {
    const a = P[i];
    const b = P[(i + 1) % P.length];
    const largo = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (largo < 0.05) continue;
    const medio: Punto = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    lados.push({ largo: sobreBorde(a) && sobreBorde(b) && sobreBorde(medio) ? largo : 0, rumbo: Math.atan2(b[1] - a[1], b[0] - a[0]) });
  }

  // Lados seguidos con el mismo rumbo son una sola cara; un lado que no va por la vereda corta.
  const caras: { largo: number; rumbo: number; desde: number }[] = [];
  let cortada = true;
  lados.forEach((l, i) => {
    if (!l.largo) {
      cortada = true;
      return;
    }
    const u = caras.at(-1);
    if (u && !cortada && giro(l.rumbo, u.rumbo) < QUIEBRE_GRADOS) u.largo += l.largo;
    else caras.push({ largo: l.largo, rumbo: l.rumbo, desde: i });
    cortada = false;
  });
  // El polígono puede arrancar a mitad de una cara: la última y la primera se unen si siguen.
  if (caras.length > 1) {
    const primera = caras[0];
    const ultima = caras.at(-1)!;
    const cierra = primera.desde === 0 && lados.at(-1)!.largo > 0;
    if (cierra && giro(primera.rumbo, ultima.rumbo) < QUIEBRE_GRADOS) {
      primera.largo += ultima.largo;
      caras.pop();
    }
  }

  return {
    caras: caras.filter((c) => c.largo >= TRAMO_CORTO_M).map((c) => redondear(c.largo)),
    tramosCortos: caras.filter((c) => c.largo < TRAMO_CORTO_M).map((c) => redondear(c.largo)),
  };
}
