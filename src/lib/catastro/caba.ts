// Catastro de la Ciudad de Buenos Aires: frente, fondo, pisos y esquina de la parcela de una
// dirección. Es la fuente oficial (AGIP / DGROC) de lo que muestran Ciudad 3D y Dateas.
//
// Criterio, Geometría 3: "En CABA se verifica el frente contra la parcela; fuera de CABA lo
// tiene que dar el cliente". Esto es la verificación, para que el asistente la haga siempre.
//
// Servicios públicos del GCBA, sin clave (probados el 26/09):
// - USIG normalizar: "riobamba 651" → calle (código), altura y partido (también del conurbano).
// - EPOK catastro/parcela: por código de calle y altura, o por SMP → frente y fondo (AGIP),
//   superficie, pisos y las puertas oficiales. SÓLO responde por puertas oficiales: si la
//   altura no es una (Riobamba 651), se buscan las vecinas y se pregunta cuál es.
// - EPOK catastro/geometria: el polígono de la parcela (?smp=) y el de la manzana (?sm=), para
//   medir las caras a la calle (frentes.ts).
// EPOK contesta vacío sin un User-Agent de navegador.
//
// SOLO server-side.

import { medirFrentes, type Punto } from "./frentes";

const USIG = "https://servicios.usig.buenosaires.gob.ar/normalizar/";
const EPOK = "https://epok.buenosaires.gob.ar/catastro";
const CABECERAS = { "User-Agent": "Mozilla/5.0 (compatible; AndamiosOS/1.0)", Accept: "application/json" };

export type Lote = {
  fuente: "catastro" | "vendedor";
  /** La dirección del borrador cuando se verificó: si cambia, hay que volver a verificar. */
  direccionConsultada: string;
  /** Sección-manzana-parcela. */
  smp: string | null;
  direccionOficial: string | null;
  /** El frente que registra AGIP (uno solo, aunque sea esquina). */
  frenteCatastro: number | null;
  /** Las caras a la calle medidas sobre el plano (o la que declaró el vendedor). */
  caras: number[];
  tramosCortos: number[];
  esquina: boolean;
  calles: string[];
  fondo: number | null;
  superficie: number | null;
  pisos: number | null;
  /** Si lo declaró el vendedor: de dónde sale la medida. */
  nota: string | null;
  consultado: string;
};

export type Vecina = { smp: string; direccion: string; puertas: string[]; frenteCatastro: number | null };

export type ConsultaLote =
  | { estado: "encontrado"; lote: Lote }
  | { estado: "puerta_no_oficial"; direccion: string; vecinas: Vecina[] }
  | { estado: "fuera_de_caba"; direccion: string }
  | { estado: "no_encontrado"; motivo: string };

type Normalizada = { cod_calle: number; altura: number | null; cod_partido: string; direccion: string; nombre_partido: string };

type ParcelaEpok = {
  smp?: string;
  direccion?: string;
  seccion?: string;
  manzana?: string;
  frente?: string | null;
  fondo?: string | null;
  superficie_total?: string | null;
  pisos_sobre_rasante?: string | null;
  puertas?: { calle: string; altura: number }[];
};

async function pedir<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: CABECERAS, signal: AbortSignal.timeout(8_000), cache: "no-store" });
  if (!res.ok) throw new Error(`El catastro respondió ${res.status}`);
  const texto = await res.text();
  return (texto.trim() ? JSON.parse(texto) : {}) as T;
}

const numero = (s: string | null | undefined) => {
  const n = s == null ? NaN : Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
};

async function normalizar(direccion: string, enCaba: boolean | null): Promise<{ caba: Normalizada | null; otra: Normalizada | null }> {
  const r = await pedir<{ direccionesNormalizadas?: Normalizada[] }>(`${USIG}?direccion=${encodeURIComponent(direccion)}`);
  const lista = r.direccionesNormalizadas ?? [];
  const caba = enCaba === false ? null : lista.find((x) => x.cod_partido === "caba") ?? null;
  return { caba, otra: lista.find((x) => x.cod_partido !== "caba") ?? null };
}

async function geometria(q: string): Promise<Punto[] | null> {
  const g = await pedir<{ features?: { geometry?: { coordinates?: Punto[][][] } }[] }>(`${EPOK}/geometria/?${q}`).catch(() => null);
  return g?.features?.[0]?.geometry?.coordinates?.[0]?.[0] ?? null;
}

async function armarLote(p: ParcelaEpok, direccionConsultada: string): Promise<Lote> {
  const [parcela, manzana] = await Promise.all([
    geometria(`smp=${encodeURIComponent(p.smp!)}`),
    p.seccion && p.manzana ? geometria(`sm=${encodeURIComponent(`${p.seccion}-${p.manzana}`)}`) : Promise.resolve(null),
  ]);
  const medidos = parcela && manzana ? medirFrentes(parcela, manzana) : { caras: [], tramosCortos: [] };
  const calles = [...new Set((p.puertas ?? []).map((x) => x.calle))];
  return {
    fuente: "catastro",
    direccionConsultada,
    smp: p.smp ?? null,
    direccionOficial: p.direccion ?? null,
    frenteCatastro: numero(p.frente),
    caras: medidos.caras,
    tramosCortos: medidos.tramosCortos,
    // Dos caras sobre la vereda, o puertas sobre dos calles.
    esquina: medidos.caras.length > 1 || calles.length > 1,
    calles,
    fondo: numero(p.fondo),
    superficie: numero(p.superficie_total),
    pisos: numero(p.pisos_sobre_rasante),
    nota: null,
    consultado: new Date().toISOString(),
  };
}

/** Las puertas oficiales más cercanas, del mismo lado de la calle (misma paridad). */
async function vecinas(codCalle: number, altura: number): Promise<Vecina[]> {
  const deltas = [2, -2, 4, -4, 6, -6, 8, -8, 10, -10, 12, -12, 14, -14, 16, -16, 18, -18, 20, -20].filter((d) => altura + d > 0);
  const halladas = await Promise.all(
    deltas.map((d) => pedir<ParcelaEpok>(`${EPOK}/parcela/?codigo_calle=${codCalle}&altura=${altura + d}`).then((p) => ({ d, p })).catch(() => ({ d, p: {} as ParcelaEpok }))),
  );
  // De la más cercana a la más lejana: las tres primeras parcelas distintas.
  const porSmp = new Map<string, Vecina>();
  for (const { p } of halladas.sort((a, b) => Math.abs(a.d) - Math.abs(b.d))) {
    if (!p.smp || porSmp.has(p.smp)) continue;
    porSmp.set(p.smp, {
      smp: p.smp, direccion: p.direccion ?? "", frenteCatastro: numero(p.frente),
      puertas: (p.puertas ?? []).map((x) => `${x.calle} ${x.altura}`),
    });
  }
  return [...porSmp.values()].slice(0, 3);
}

/**
 * Verifica el lote de una dirección. `smp` elige una parcela puntual (una de las vecinas).
 * `enCaba`: lo que dice el borrador (false = ni se busca en la Ciudad).
 */
export async function consultarLote(p: { direccion: string; enCaba: boolean | null; smp?: string }): Promise<ConsultaLote> {
  if (p.smp) {
    const parcela = await pedir<ParcelaEpok>(`${EPOK}/parcela/?smp=${encodeURIComponent(p.smp)}`);
    if (!parcela.smp) return { estado: "no_encontrado", motivo: `El catastro no tiene la parcela ${p.smp}.` };
    return { estado: "encontrado", lote: await armarLote(parcela, p.direccion) };
  }
  const { caba, otra } = await normalizar(p.direccion, p.enCaba);
  if (!caba) {
    return otra
      ? { estado: "fuera_de_caba", direccion: otra.direccion }
      : { estado: "no_encontrado", motivo: `No reconozco la dirección «${p.direccion}»: pedí calle y altura.` };
  }
  if (!caba.altura) return { estado: "no_encontrado", motivo: `A «${caba.direccion}» le falta la altura.` };
  const parcela = await pedir<ParcelaEpok>(`${EPOK}/parcela/?codigo_calle=${caba.cod_calle}&altura=${caba.altura}`);
  if (parcela.smp) return { estado: "encontrado", lote: await armarLote(parcela, p.direccion) };
  const cerca = await vecinas(caba.cod_calle, caba.altura);
  return cerca.length
    ? { estado: "puerta_no_oficial", direccion: caba.direccion, vecinas: cerca }
    : { estado: "no_encontrado", motivo: `El catastro no tiene parcelas cerca de ${caba.direccion}.` };
}
