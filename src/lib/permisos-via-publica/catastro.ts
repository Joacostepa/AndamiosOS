// Datos catastrales públicos de la Ciudad para una dirección: sección-manzana-parcela, las
// puertas del lote (los "frentes" que pide la encomienda del CPAU) y la geometría de toda la
// manzana para dibujar la plancheta del croquis.
//
// FUENTES (verificado 2026-09-15 con Trelles 1086):
//   USIG  servicios.usig.buenosaires.gob.ar/normalizar  → código de calle y altura
//   EPOK  epok.buenosaires.gob.ar/catastro/parcela      → SMP y puertas (por código de calle + altura)
//         epok.buenosaires.gob.ar/catastro/smp/{s}/{m}/ → los lotes de la manzana
//         epok.buenosaires.gob.ar/catastro/geometria    → contorno de cada lote (GeoJSON)
//
// EPOK DEVUELVE VACÍO a pedidos sin user agent de navegador (HTTP 200 con cuerpo vacío): no
// es un error de datos. Las planchetas escaneadas NO están publicadas (`planos/` da 404), por
// eso la plancheta se dibuja con la geometría — ya se presentó así (Gorriti 6009).
//
// Sin imports de alias: lo corre también un script de prueba fuera de Next.

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const EPOK = "https://epok.buenosaires.gob.ar/catastro";

/**
 * GET con reintentos. EPOK corta conexiones (ECONNRESET) si le llegan muchos pedidos juntos
 * —pasó dibujando una manzana con 12 en paralelo— y a veces devuelve 5xx o cuerpo vacío.
 * Tres intentos con espera creciente; un 4xx no se reintenta.
 */
async function pedir<T>(url: string, intentos = 3): Promise<T> {
  let ultimo: unknown;
  for (let i = 1; i <= intentos; i++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(20_000) });
      const texto = await res.text();
      if (res.status >= 400 && res.status < 500) throw Object.assign(new Error(`HTTP ${res.status} en ${new URL(url).pathname}`), { definitivo: true });
      if (!res.ok) throw new Error(`HTTP ${res.status} en ${new URL(url).pathname}`);
      if (!texto.trim()) throw new Error(`Respuesta vacía de ${new URL(url).pathname}`);
      return JSON.parse(texto) as T;
    } catch (e) {
      ultimo = e;
      if ((e as { definitivo?: boolean }).definitivo || i === intentos) break;
      await new Promise((r) => setTimeout(r, 600 * i));
    }
  }
  throw ultimo;
}

export type Puerta = { calle: string; altura: number; codigo_calle: number };
export type Parcela = { smp: string; seccion: string; manzana: string; parcela: string; puertas: Puerta[] };

/** "Ing. Huergo 913 esq. Estados Unidos, CABA" → "Ing. Huergo 913". */
function direccionBuscable(direccion: string): string {
  return direccion.split(/\s+esq\.?\s+|,|\s+al\s+\d/i)[0].replace(/\bC\.?A\.?B\.?A\.?\b/gi, "").trim();
}

export async function normalizar(direccion: string): Promise<{ codCalle: number; altura: number; calle: string } | null> {
  const url = `https://servicios.usig.buenosaires.gob.ar/normalizar/?direccion=${encodeURIComponent(direccionBuscable(direccion))}&geocodificar=true`;
  const r = await pedir<{ direccionesNormalizadas?: { tipo: string; cod_calle: number; altura: number; nombre_calle: string; cod_partido: string }[] }>(url);
  const d = r.direccionesNormalizadas?.find((x) => x.tipo === "calle_altura" && x.cod_partido === "caba");
  return d ? { codCalle: d.cod_calle, altura: d.altura, calle: d.nombre_calle } : null;
}

export async function parcelaPorDireccion(codCalle: number, altura: number): Promise<Parcela | null> {
  const r = await pedir<Partial<Parcela>>(`${EPOK}/parcela/?codigo_calle=${codCalle}&altura=${altura}`);
  return r.smp ? (r as Parcela) : null;
}

export type LoteDibujable = { smp: string; numero: string; anillo: [number, number][]; esObra: boolean; calles: string[] };
export type Manzana = { lotes: LoteDibujable[] };

/** "001A" → "1a": como figura en las planchetas. */
const numeroDeLote = (parcela: string) => parcela.replace(/^0+/, "").toLowerCase() || "0";

async function enParalelo<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const salida: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) {
      const k = i++;
      salida[k] = await fn(items[k]);
    }
  }));
  return salida;
}

/** Todos los lotes de la manzana de la obra, con contorno y calles. Unas decenas de pedidos. */
export async function manzanaDe(parcela: Parcela): Promise<Manzana> {
  const lista = await pedir<{ datos: { smp: string }[] }>(`${EPOK}/smp/${parcela.seccion}/${parcela.manzana}/`);
  // De a 3 lotes (6 pedidos a la vez): con más, EPOK empieza a cortar conexiones.
  const lotes = await enParalelo(lista.datos, 3, async ({ smp }) => {
    try {
      const [geo, datos] = await Promise.all([
        pedir<{ features: { geometry: { type: string; coordinates: number[][][][] } }[] }>(`${EPOK}/geometria/?smp=${smp}`),
        pedir<Partial<Parcela>>(`${EPOK}/parcela/?smp=${smp}`),
      ]);
      const anillo = geo.features[0]?.geometry.coordinates[0]?.[0] as [number, number][] | undefined;
      if (!anillo?.length) return null;
      return {
        smp,
        numero: numeroDeLote(smp.split("-")[2] ?? ""),
        anillo,
        esObra: smp.toUpperCase() === parcela.smp.toUpperCase(),
        calles: [...new Set((datos.puertas ?? []).map((p) => p.calle))],
      } satisfies LoteDibujable;
    } catch {
      return null;
    }
  });
  return { lotes: lotes.filter((l): l is LoteDibujable => !!l) };
}
