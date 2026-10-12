// Poner coordenadas donde hay una dirección de obra escrita.
//
// SOLO server-side. Lo consumen el cron de /api/operaciones/geocodificar (`geocodificarObras`)
// y la Hoja del día, que geocodifica en el momento las obras del día que no tienen
// coordenadas (`geocodificarVentas`). Las reglas —qué ventas, qué consultas, qué punto vale—
// viven en geocodificar-reglas.ts, sin Google ni Odoo, con tests; scripts/geocodificar-obras.mjs
// usa las mismas.
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

import { read, searchRead, write } from "./client";
import {
  CAMPOS_VENTA,
  MAX_CONSULTAS_POR_CORRIDA,
  buscadorPlaces,
  candidatas,
  geocodificarFilas,
  hoyAr,
  resolverDireccion,
  type FilaVenta,
  type Resolucion,
  type ResultadoGeo,
} from "./geocodificar-reglas";

export type { ResultadoGeo } from "./geocodificar-reglas";

const odoo = { searchRead, read, write };

/** La clave dura una hora en memoria: la Hoja del día no le pregunta a Odoo en cada lectura. */
const VIDA_CLAVE_MS = 60 * 60_000;
let claveGuardada: { valor: string; at: number } | null = null;

/** La clave de Places: el parámetro de Odoo que usa el widget de direcciones. Tira si no hay. */
async function clavePlaces(): Promise<string> {
  if (claveGuardada && Date.now() - claveGuardada.at < VIDA_CLAVE_MS) return claveGuardada.valor;
  const [param] = await searchRead<{ value: string | false }>(
    "ir.config_parameter",
    [["key", "=", "google_address_autocomplete.google_places_api_key"]],
    ["value"],
  );
  const key = typeof param?.value === "string" ? param.value : "";
  if (!key) throw new Error("No hay API key de Google Places cargada en Odoo");
  claveGuardada = { valor: key, at: Date.now() };
  return key;
}

// ─── Una dirección suelta (la "otra dirección" de un pedido o una parada, F4) ─

const VIDA_DIRECCION_MS = 24 * 60 * 60_000;
const MAX_DIRECCIONES = 500;
const direcciones = new Map<string, { r: Resolucion; at: number }>();
const claveDir = (dir: string) => dir.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/**
 * Las coordenadas de una dirección escrita a mano ("Thames 1820", "Cramer 2190 piso 3"), con
 * las mismas variantes y el mismo control (en la Argentina; sin ciudad = CABA, a menos de 70 km
 * del Obelisco) que las obras. Hasta 3 consultas a Places. En memoria por instancia 24 h: el
 * pizarrón pregunta mientras se escribe (con pausa) y la misma dirección no se vuelve a pagar.
 */
export async function geocodificarDireccion(dir: string): Promise<Resolucion> {
  const k = claveDir(dir);
  const hit = direcciones.get(k);
  if (hit && Date.now() - hit.at < VIDA_DIRECCION_MS) return hit.r;
  const r = await resolverDireccion(dir, null, buscadorPlaces(await clavePlaces()), 3);
  if (direcciones.size >= MAX_DIRECCIONES) direcciones.delete(direcciones.keys().next().value!);
  direcciones.set(k, { r, at: Date.now() });
  return r;
}

/**
 * Geocodifica las obras que lo necesitan.
 *
 * ALCANCE: dos grupos, sin repetir (la elección vive en geocodificar-reglas.ts, con tests).
 *   1. Las ventas tipo de contrato "Obra " en estado **Armado**: el Mapa de Obras.
 *   2. Las ventas de las OTs con jornadas en el tablero de planificación desde hace 7 días
 *      hasta dentro de 45 (asignación → `x_ot_id` → `x_order_id`), en cualquier estado: la
 *      Hoja del día arma con sus coordenadas los tiempos de manejo (Routes API) y los links
 *      de Maps, y una obra que se planifica para armar todavía no está "Armado". Van primero,
 *      la jornada más próxima adelante: si el tope corta, corta lo que menos apura.
 *
 * Se probó incluir también "Pendiente de Armado" —para que una obra recién armada apareciera
 * en el mapa sin esperar a la corrida siguiente— y se descartó: son 1163 registros, de los
 * cuales 1160 no tienen fecha de armado y CERO se arman en los próximos 30 días. Ese estado
 * es el valor por defecto de todo lo que nunca se actualizó, no una cola de trabajo. El
 * grupo 2 es la versión acotada de esa idea: lo que de verdad tiene fecha en el tablero
 * (~70 ventas en octubre de 2026).
 *
 * CÓMO CONSULTA: la consulta de siempre y, si no hay resultado o el punto no sirve, hasta 5
 * variantes (sin piso/dto/"02", la primera parte de una esquina, "X y Y", CABA si no hay
 * ciudad). El punto tiene que caer en Argentina y, si la obra es en CABA, en el AMBA. Ver
 * `consultasDe` y `validarPunto`. El tope es de consultas, no de ventas
 * (MAX_CONSULTAS_POR_CORRIDA).
 *
 * Los fallos se devuelven; una venta que Google no resuelve se vuelve a probar en cada
 * corrida (hasta que alguien corrija la dirección o cargue lat/lng a mano).
 */
export async function geocodificarObras(): Promise<ResultadoGeo> {
  const key = await clavePlaces();
  const { lista } = await candidatas(odoo, hoyAr());
  return geocodificarFilas(lista, buscadorPlaces(key), odoo, MAX_CONSULTAS_POR_CORRIDA);
}

/**
 * Geocodifica estas ventas (las que lo necesiten) y escribe en Odoo. La usa la Hoja del día
 * para las obras del día sin coordenadas, en segundo plano. Tope: 5 consultas por venta.
 */
export async function geocodificarVentas(ventaIds: number[]): Promise<ResultadoGeo> {
  const ids = [...new Set(ventaIds)];
  const key = await clavePlaces();
  const filas = ids.length ? await read<FilaVenta>("sale.order", ids, CAMPOS_VENTA) : [];
  return geocodificarFilas(filas, buscadorPlaces(key), odoo, ids.length * 5);
}
