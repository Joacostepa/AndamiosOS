// Poner coordenadas donde hay una dirección de obra escrita.
//
// SOLO server-side. Lo consume el cron de /api/operaciones/geocodificar.
//
// POR QUÉ NO ES UN CRON DE ODOO: el sandbox de Odoo Online no deja hacer llamadas HTTP
// salientes desde una acción de servidor —lo mismo que frenó la automatización del CRM—, así
// que un cron ahí no podría llamar a Google. Vive acá, que es el lado que sí puede salir a
// internet y además ya escribe en Odoo.
//
// NO USA LA GEOCODING API. Usa `places:searchText` de la Places API (New), que ya está
// habilitada y devuelve `location`. Una API menos que habilitar y que pagar, y de yapa
// resuelve nombres propios: "Embajada EEUU" cae en Av. Colombia 4300.
//
// ES IDEMPOTENTE. `x_obra_geo_dir` guarda contra QUÉ TEXTO se geocodificó. Una obra ya
// resuelta no se vuelve a consultar; una a la que le corrigieron la dirección deja de
// coincidir y se rehace sola. Puede correr todos los días sin gastar de más: en régimen sólo
// toca las obras nuevas y las corregidas.

import { searchRead, write } from "./client";

/** Argentina continental, con margen. */
const CAJA_AR = { latMin: -56, latMax: -21, lngMin: -74, lngMax: -52 };

/**
 * Tope de consultas por corrida. Es una red contra un error nuestro —un cambio que haga que
 * todo se vea desactualizado y dispare 2000 consultas pagas de una— más que contra el uso
 * normal, que son unas pocas por día.
 */
const MAX_POR_CORRIDA = 120;

export type ResultadoGeo = {
  candidatas: number;
  geocodificadas: number;
  sinResultado: { venta: string; consulta: string }[];
  fueraDeArgentina: { venta: string; consulta: string; lat: number; lng: number }[];
  truncado: boolean;
};

type Fila = {
  id: number;
  name: string;
  x_direccion_obra: string | false;
  x_obra_ciudad: string | false;
  x_obra_lat: number | false;
  x_obra_lng: number | false;
  x_obra_geo_dir: string | false;
};

/** La ciudad y el país acotan: sin ellos "Alsina 2028" es ambigua. */
function consultaDe(f: Fila): string {
  return [f.x_direccion_obra, f.x_obra_ciudad || "", "Argentina"]
    .filter(Boolean)
    .join(", ")
    .replace(/\s+/g, " ")
    .trim();
}

async function geocodificarTexto(texto: string, key: string) {
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": "places.location",
    },
    body: JSON.stringify({ textQuery: texto, regionCode: "AR", maxResultCount: 1 }),
  });
  const json = await res.json();
  const loc = json?.places?.[0]?.location;
  if (!loc) return null;
  return { lat: loc.latitude as number, lng: loc.longitude as number };
}

/**
 * Geocodifica las obras que lo necesitan.
 *
 * ALCANCE: tipo de contrato "Obra " y estado **Armado**. Nada más.
 *
 * Se probó incluir también "Pendiente de Armado" —para que una obra recién armada apareciera
 * en el mapa sin esperar a la corrida siguiente— y se descartó: son 1163 registros, de los
 * cuales 1160 no tienen fecha de armado y CERO se arman en los próximos 30 días. Ese estado
 * es el valor por defecto de todo lo que nunca se actualizó, no una cola de trabajo. Habrían
 * sido 1165 consultas pagas y diez días de corridas para obras que en su mayoría no se van a
 * armar nunca.
 *
 * El precio de acotar así es un día de demora: la obra que se arma hoy entra al mapa mañana a
 * las 7:30. Para un mapa de estructuras paradas, aceptable.
 */
export async function geocodificarObras(): Promise<ResultadoGeo> {
  const [param] = await searchRead<{ value: string | false }>(
    "ir.config_parameter",
    [["key", "=", "google_address_autocomplete.google_places_api_key"]],
    ["value"],
  );
  const key = typeof param?.value === "string" ? param.value : "";
  if (!key) throw new Error("No hay API key de Google Places cargada en Odoo");

  const filas = await searchRead<Fila>(
    "sale.order",
    [
      ["x_studio_tipo_de_contrato", "=", "Obra "],
      ["x_studio_estado_de_obra", "=", "Armado"],
      ["x_direccion_obra", "!=", false],
    ],
    ["name", "x_direccion_obra", "x_obra_ciudad", "x_obra_lat", "x_obra_lng", "x_obra_geo_dir"],
    { limit: 3000 },
  );

  const pendientes = filas.filter((f) => {
    const tienePunto = Boolean(f.x_obra_lat && f.x_obra_lng);
    const alDia = f.x_obra_geo_dir === f.x_direccion_obra;
    return !(tienePunto && alDia);
  });

  const lote = pendientes.slice(0, MAX_POR_CORRIDA);
  const out: ResultadoGeo = {
    candidatas: pendientes.length,
    geocodificadas: 0,
    sinResultado: [],
    fueraDeArgentina: [],
    truncado: pendientes.length > lote.length,
  };

  for (const f of lote) {
    const consulta = consultaDe(f);
    const punto = await geocodificarTexto(consulta, key);
    if (!punto) {
      out.sinResultado.push({ venta: f.name, consulta });
      continue;
    }
    const dentro =
      punto.lat >= CAJA_AR.latMin && punto.lat <= CAJA_AR.latMax &&
      punto.lng >= CAJA_AR.lngMin && punto.lng <= CAJA_AR.lngMax;
    if (!dentro) {
      // Google resuelve direcciones ambiguas en otro país —hay "Corrientes 1125" en
      // varios— y un punto en México rompe el encuadre del mapa para todos los demás.
      out.fueraDeArgentina.push({ venta: f.name, consulta, ...punto });
      continue;
    }
    await write("sale.order", [f.id], {
      x_obra_lat: punto.lat,
      x_obra_lng: punto.lng,
      x_obra_geo_dir: f.x_direccion_obra,
    });
    out.geocodificadas++;
  }
  return out;
}
