// Ciudad Armada (Mapa de Obras): todas las obras que están o estuvieron en la calle, listas
// para el mapa 3D. Contrato: src/lib/mapa-obras/tipos.ts. Especificación:
// docs/mapa-obras/ciudad-armada.md.
//
// SOLO server-side. Se consume desde /api/operaciones/mapa-obras.
//
// QUÉ ENTRA: tipo de contrato "Obra " en Armado, Pendiente de Desarme y Desarmado, con o sin
// coordenadas (las sin punto van a la lista con "sin ubicación"; las desarmadas son el
// histórico). Las "Simple" (módulos hogareños) y "Alquiler Sin Montaje" quedan afuera a
// propósito: muchas ni siquiera tienen obra —"RETIRA DE CUCHA CUCHA 2345", el cliente pasa
// por el depósito— y sólo ensuciarían el mapa.
//
// LAS COORDENADAS YA VIENEN CALCULADAS: las escribe el cron de /api/operaciones/geocodificar
// (src/lib/odoo/geocodificar.ts). Acá no se geocodifica nada.
//
// LA FACHADA SÍ SE CALCULA ACÁ (src/lib/mapa-obras/fachada.ts), con los tiles de
// OpenStreetMap, y se cachea: para la misma venta en el mismo punto no cambia nunca.
//
// NADA DE PLATA: decisión del dueño. Ni montos, ni deuda, ni presupuestos; no se leen.

import { unstable_cache } from "next/cache";
import { read, searchRead } from "./client";
import { AMBA, distanciaKm } from "./geocodificar-reglas";
import { fetchFotosTelegram } from "@/lib/mapa-obras/fotos-telegram";
import { direccionCorta, tieneAltura } from "@/lib/mapa-obras/direccion";
import { medidasDe } from "@/lib/mapa-obras/medidas";
import { ErrorTiles, FuenteTiles, fachadaDeObra } from "@/lib/mapa-obras/fachada";
import { FECHA_IMPORTACION, curvaEnLaCalle, diasEntre, fechaAr, hoyAr } from "@/lib/mapa-obras/curva";
import type {
  CalidadUbicacion,
  EstadoObra,
  Fachada,
  FotoObra,
  ObraMapa,
  RespuestaMapaObras,
} from "@/lib/mapa-obras/tipos";


type M2O = [number, string] | false;

const idDe = (v: M2O | undefined): number | null => (Array.isArray(v) ? v[0] : null);
const nombreDe = (v: M2O | undefined): string | null => (Array.isArray(v) ? v[1] : null);
function str(v: string | false | null | undefined): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : null;
}


const ESTADOS: Record<string, EstadoObra> = {
  Armado: "armada",
  "Pendiente de Desarme": "pendiente_desarme",
  Desarmado: "desarmada",
};

const CAMPOS_VENTA = [
  "name", "partner_id", "x_direccion_obra", "x_obra_referencia", "x_studio_estado_de_obra",
  "x_obra_lat", "x_obra_lng", "x_fecha_armado", "x_fecha_desmontaje", "x_fecha_fin_obra_estimada",
  "x_estructura_actual", "x_estructura_fecha", "x_trabajo_obra", "x_permiso_metros_lineales",
];

type FilaVenta = {
  id: number;
  name: string;
  partner_id: M2O;
  x_direccion_obra: string | false;
  x_obra_referencia: string | false;
  x_studio_estado_de_obra: string | false;
  x_obra_lat: number | false;
  x_obra_lng: number | false;
  x_fecha_armado: string | false;
  x_fecha_desmontaje: string | false;
  x_fecha_fin_obra_estimada: string | false;
  x_estructura_actual: string | false;
  x_estructura_fecha: string | false;
  x_trabajo_obra: string | false;
  x_permiso_metros_lineales: number | false;
};

type FilaOt = {
  id: number;
  x_order_id: M2O;
  x_tipo: string | false;
  x_estado: string | false;
  x_fecha_programada: string | false;
  x_detalle_tecnico: string | false;
  x_ejecutado_real: string | false;
};

// ─── Lectura paginada ────────────────────────────────────────────────────────

/** De a cuántas filas se le pide a Odoo. */
const PAGINA_ODOO = 2000;
/** Tope de una lectura entera. Si se llega, se loguea: antes un `limit` cortaba sin avisar. */
const TOPE_ODOO = 20_000;

/**
 * search_read de TODO lo que cumple el dominio, de a páginas. Los `limit: 2000` de antes
 * cortaban en silencio: con el histórico entero, las fotos y las OTs crecen todos los meses.
 * `order: "id"` hace que las páginas no se pisen.
 */
async function leerTodo<T>(model: string, domain: unknown[], fields: string[]): Promise<T[]> {
  const out: T[] = [];
  for (let offset = 0; offset < TOPE_ODOO; offset += PAGINA_ODOO) {
    const pagina = await searchRead<T>(model, domain, fields, { limit: PAGINA_ODOO, offset, order: "id" });
    out.push(...pagina);
    if (pagina.length < PAGINA_ODOO) return out;
  }
  console.warn(`[mapa-obras] ${model}: se llegó al tope de ${TOPE_ODOO} filas, faltan datos`);
  return out;
}

// ─── Fachada, cacheada ───────────────────────────────────────────────────────

/**
 * Los tiles se bajan por instancia y se comparten entre pedidos (FuenteTiles guarda las
 * calles de cada tile un día). Las fachadas, que es lo que cuesta, se guardan en dos lugares:
 *
 *  · en memoria de la instancia, para que la segunda carga no espere nada;
 *  · en la Data Cache de Next (`unstable_cache`), que sobrevive a los deploys y a las
 *    instancias nuevas de Vercel: sin ella, cada lambda fría volvería a bajar ~50 tiles.
 *
 * Next 16 recomienda "use cache", pero exige activar Cache Components en todo el proyecto
 * (next.config), un cambio que toca todas las pantallas. `unstable_cache` es lo que la guía
 * "caching without cache components" indica para funciones que no son fetch.
 *
 * La clave es venta + punto + dirección: si el geocodificador mueve el punto o le corrigen la
 * dirección, la fachada se recalcula sola. VERSION_FACHADA invalida todo si cambia el cálculo.
 * Un "no hay calle cerca" se cachea (es un resultado); un tile que no bajó, no (es un error).
 */
const VERSION_FACHADA = "fachada-v1";
const VIDA_FACHADA_S = 30 * 24 * 60 * 60; // OSM cambia; un mes es de sobra para tomar calles nuevas.
const MAX_MEMORIA = 3000;
/** Cuánto se espera a las fachadas antes de responder sin las que falten. */
const ESPERA_FACHADAS_MS = 25_000;

const fuente = new FuenteTiles({ concurrencia: 6, timeoutMs: 10_000 });
const memoria = new Map<string, Fachada | null>();
let sinDataCache = false;

const fachadaPersistente = unstable_cache(
  // `ventaId` no se usa adentro: está para que sea parte de la clave.
  async (_ventaId: number, lat: number, lng: number, direccion: string | null) => ({
    f: await fachadaDeObra(fuente, lat, lng, direccion),
  }),
  [VERSION_FACHADA],
  { revalidate: VIDA_FACHADA_S, tags: ["mapa-obras-fachada"] },
);

async function fachadaCacheada(ventaId: number, lat: number, lng: number, direccion: string | null): Promise<Fachada | null> {
  const clave = `${ventaId}|${lat.toFixed(6)}|${lng.toFixed(6)}|${direccion ?? ""}`;
  if (memoria.has(clave)) return memoria.get(clave)!;
  let f: Fachada | null;
  try {
    if (sinDataCache) {
      f = await fachadaDeObra(fuente, lat, lng, direccion);
    } else {
      try {
        f = (await fachadaPersistente(ventaId, lat, lng, direccion)).f;
      } catch (e) {
        if (e instanceof ErrorTiles) throw e;
        // Fuera de un pedido de Next (scripts, tests) no hay Data Cache: se calcula directo.
        if (!sinDataCache) console.warn("[mapa-obras] sin Data Cache de Next, la fachada se cachea sólo en memoria:", e instanceof Error ? e.message.slice(0, 120) : e);
        sinDataCache = true;
        f = await fachadaDeObra(fuente, lat, lng, direccion);
      }
    }
  } catch (e) {
    // El mapa igual se dibuja: la obra queda en su punto, sin orientar. No se recuerda el
    // fallo, así que la próxima carga lo vuelve a intentar.
    console.warn(`[mapa-obras] fachada de la venta ${ventaId}:`, e instanceof Error ? e.message : e);
    return null;
  }
  if (memoria.size >= MAX_MEMORIA) memoria.delete(memoria.keys().next().value!);
  memoria.set(clave, f);
  return f;
}

/**
 * Las fachadas de varias obras, en paralelo (el límite de descargas lo pone FuenteTiles).
 * Si algo tarda más de ESPERA_FACHADAS_MS se responde sin esas: el cálculo sigue en segundo
 * plano y queda en memoria para la próxima carga.
 */
async function fachadas(obras: { ventaId: number; lat: number; lng: number; direccion: string | null }[]): Promise<Map<number, Fachada | null>> {
  const out = new Map<number, Fachada | null>();
  const todas = Promise.all(obras.map(async (o) => out.set(o.ventaId, await fachadaCacheada(o.ventaId, o.lat, o.lng, o.direccion))));
  let reloj: ReturnType<typeof setTimeout> | undefined;
  const plazo = new Promise<"plazo">((ok) => { reloj = setTimeout(() => ok("plazo"), ESPERA_FACHADAS_MS); });
  if ((await Promise.race([todas, plazo])) === "plazo") {
    console.warn(`[mapa-obras] fachadas: ${obras.length - out.size} sin terminar a los ${ESPERA_FACHADAS_MS / 1000} s, van sin fachada`);
  }
  clearTimeout(reloj);
  return new Map(out);
}

// ─── Fotos de los partes ─────────────────────────────────────────────────────

/**
 * Las fotos de los partes diarios, agrupadas por venta: parte → OT → venta. De CUALQUIER parte
 * de la venta, no sólo los de armado: todas muestran cómo está la obra.
 *
 * Sólo los METADATOS. El binario pesa ~200 KB por foto y viaja por su propia ruta
 * (/api/operaciones/foto/[id]), para no meter decenas de MB de base64 en la respuesta.
 */
async function fotosDePartes(ots: FilaOt[]): Promise<Map<number, FotoObra[]>> {
  const salida = new Map<number, FotoObra[]>();
  if (!ots.length) return salida;
  const partes = await leerTodo<{ id: number; x_orden_trabajo_id: M2O; x_fecha: string | false }>(
    "x_aba_parte_diario",
    [["x_orden_trabajo_id", "in", ots.map((o) => o.id)], ["x_cant_fotos", ">", 0]],
    ["x_orden_trabajo_id", "x_fecha"],
  );
  if (!partes.length) return salida;
  const fotos = await leerTodo<{ id: number; x_parte_diario_id: M2O; x_descripcion: string | false }>(
    "x_aba_foto",
    [["x_parte_diario_id", "in", partes.map((p) => p.id)]],
    ["x_parte_diario_id", "x_descripcion"],
  );
  const ventaDeOt = new Map(ots.map((o) => [o.id, idDe(o.x_order_id)]));
  const parteInfo = new Map(partes.map((p) => [p.id, p]));
  for (const f of fotos) {
    const parte = parteInfo.get(idDe(f.x_parte_diario_id) ?? -1);
    const ventaId = parte ? ventaDeOt.get(idDe(parte.x_orden_trabajo_id) ?? -1) : null;
    if (!parte || ventaId == null) continue;
    const lista = salida.get(ventaId) ?? [];
    lista.push({
      id: f.id,
      fecha: fechaAr(parte.x_fecha),
      descripcion: str(f.x_descripcion),
      url: `/api/operaciones/foto/${f.id}`,
      origen: "parte",
    });
    salida.set(ventaId, lista);
  }
  return salida;
}

// ─── Armado de cada obra ─────────────────────────────────────────────────────

function calidadUbicacion(lat: number | null, lng: number | null, direccion: string | null): CalidadUbicacion {
  if (lat == null || lng == null) return "sin_ubicacion";
  // El mismo criterio que el geocodificador (70 km del Obelisco): La Plata o Campana bien
  // ubicadas no son "lejos"; Bolívar, a 300 km, sí. Con dos criterios distintos el mapa
  // pedía corregir obras que el geocodificador daba por buenas.
  if (distanciaKm({ lat, lng }, AMBA) > AMBA.radioKm) return "lejos";
  return tieneAltura(direccion) ? "ok" : "sin_altura";
}

/** Una coordenada de Odoo: `false` o 0 es "no hay" (Odoo guarda 0 en un float vacío). */
const coord = (v: number | false): number | null => (typeof v === "number" && v !== 0 ? v : null);

export async function fetchMapaObras(): Promise<RespuestaMapaObras> {
  const base = (process.env.ODOO_URL ?? "").replace(/\/+$/, "");
  const hoy = hoyAr();

  const filas = (
    await leerTodo<FilaVenta>(
      "sale.order",
      [["x_studio_tipo_de_contrato", "=", "Obra "], ["x_studio_estado_de_obra", "in", Object.keys(ESTADOS)]],
      CAMPOS_VENTA,
    )
  ).filter((f) => typeof f.x_studio_estado_de_obra === "string" && f.x_studio_estado_de_obra in ESTADOS);
  const ids = filas.map((f) => f.id);

  // Las OTs de todas esas ventas: para "qué está armado" cuando la obra no lo confirmó, para
  // el desarme programado de las pendientes y para llegar a los partes con fotos. Va en una
  // consulta aparte y no en un `related`: son dos modelos y el dato es opcional.
  const ots = ids.length
    ? await leerTodo<FilaOt>(
        "x_aba_orden_trabajo",
        [["x_order_id", "in", ids]],
        ["x_order_id", "x_tipo", "x_estado", "x_fecha_programada", "x_detalle_tecnico", "x_ejecutado_real"],
      )
    : [];
  const armadoPorVenta = new Map<number, FilaOt>();
  const desarmePorVenta = new Map<number, string>();
  for (const o of ots) {
    const v = idDe(o.x_order_id);
    if (v == null) continue;
    // La PRIMERA OT de armado (vienen por id) es la que levantó la estructura; las demás son
    // ampliaciones o etapas.
    if (o.x_tipo === "armado" && !armadoPorVenta.has(v)) armadoPorVenta.set(v, o);
    // El desarme programado: la fecha más temprana de una OT de desarme todavía abierta.
    const f = fechaAr(o.x_fecha_programada);
    if (o.x_tipo === "desarme" && o.x_estado !== "completada" && o.x_estado !== "cancelada" && f) {
      const actual = desarmePorVenta.get(v);
      if (!actual || f < actual) desarmePorVenta.set(v, f);
    }
  }

  // Fotos y fachadas no dependen entre sí: van en paralelo.
  const ubicadas = filas.flatMap((f) => {
    const lat = coord(f.x_obra_lat), lng = coord(f.x_obra_lng), dir = str(f.x_direccion_obra);
    // Sólo donde el punto es la obra: "lejos" no se dibuja y "sin_altura" es el centro de la
    // localidad, donde la calle más cercana no tiene nada que ver con la obra.
    return lat != null && lng != null && calidadUbicacion(lat, lng, dir) === "ok" ? [{ ventaId: f.id, lat, lng, direccion: dir }] : [];
  });
  const [deTelegram, dePartes, fachadaPorVenta] = await Promise.all([
    fetchFotosTelegram(ids),
    fotosDePartes(ots),
    fachadas(ubicadas),
  ]);

  const obras = filas.map((f): ObraMapa => {
    const estado = ESTADOS[f.x_studio_estado_de_obra as string];
    const direccion = str(f.x_direccion_obra);
    const lat = coord(f.x_obra_lat), lng = coord(f.x_obra_lng);

    const fechaArmado = fechaAr(f.x_fecha_armado);
    const fechaDesarme = estado === "desarmada" ? fechaAr(f.x_fecha_desmontaje) : null;
    const finEstimado = fechaAr(f.x_fecha_fin_obra_estimada);
    // Desarmada: hasta el desarme (sin fecha de desarme no se sabe cuánto estuvo).
    const hasta = estado === "desarmada" ? fechaDesarme : hoy;

    // Qué está armado: lo confirmado en obra gana; si no, lo de la primera OT de armado,
    // as-built antes que el plan (lo que se armó de verdad vale más que lo previsto).
    const ot = armadoPorVenta.get(f.id);
    const enObra = str(f.x_estructura_actual);
    const deOt = str(ot?.x_ejecutado_real) ?? str(ot?.x_detalle_tecnico);
    const queEstaArmado = enObra ?? deOt;
    const { medidas, tipo } = medidasDe(queEstaArmado, { tipo: f.x_trabajo_obra, metrosLineales: f.x_permiso_metros_lineales });

    const fotos = [...(dePartes.get(f.id) ?? []), ...(deTelegram.get(f.id) ?? [])]
      // La más nueva primero: es la que muestra el estado actual.
      .sort((a, b) => (b.fecha ?? "").localeCompare(a.fecha ?? ""));

    return {
      ventaId: f.id,
      venta: f.name,
      cliente: nombreDe(f.partner_id),
      direccion: direccion ?? f.name,
      direccionCorta: direccionCorta(direccion),
      referencia: str(f.x_obra_referencia),
      estado,
      lat,
      lng,
      ubicacion: calidadUbicacion(lat, lng, direccion),
      fachada: fachadaPorVenta.get(f.id) ?? null,
      fechaArmado,
      fechaDeImportacion: fechaArmado === FECHA_IMPORTACION,
      fechaDesarme,
      desarmeProgramado: estado === "desarmada" ? null : desarmePorVenta.get(f.id) ?? null,
      finEstimado,
      vencida: estado !== "desarmada" && finEstimado != null && finEstimado < hoy,
      diasArmado: fechaArmado && hasta ? Math.max(0, diasEntre(fechaArmado, hasta)) : null,
      tipo,
      medidas,
      queEstaArmado,
      queEstaArmadoFuente: enObra ? "obra" : deOt ? "ot" : null,
      queEstaArmadoFecha: enObra ? fechaAr(f.x_estructura_fecha) : deOt ? fechaAr(ot?.x_fecha_programada) : null,
      fotos,
      url: `${base}/odoo/sales/${f.id}`,
    };
  });

  return { obras, curva: curvaEnLaCalle(obras, hoy), generado: new Date().toISOString() };
}

/**
 * El JPEG de una foto. Va por una ruta propia y no por /web/image de Odoo, que exige la
 * sesión de Odoo en el browser del usuario — algo que la app no puede dar por hecho.
 */
export async function fetchFotoBinaria(fotoId: number): Promise<Buffer | null> {
  const [f] = await read<{ x_imagen: string | false }>("x_aba_foto", [fotoId], ["x_imagen"]);
  if (!f || typeof f.x_imagen !== "string" || !f.x_imagen) return null;
  return Buffer.from(f.x_imagen, "base64");
}
