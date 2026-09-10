// Mapa de Obras: las obras que HOY están armadas, con su punto en el mapa.
//
// SOLO server-side. Se consume desde /api/operaciones/mapa-obras.
//
// QUÉ ENTRA: `x_studio_estado_de_obra = "Armado"` y tipo de contrato "Obra ". Las "Simple"
// (módulos hogareños) y "Alquiler Sin Montaje" quedan afuera a propósito: muchas ni
// siquiera tienen obra —"RETIRA DE CUCHA CUCHA 2345", el cliente pasa por el depósito— y
// sólo ensuciarían el mapa.
//
// LAS COORDENADAS YA VIENEN CALCULADAS. Las escribe scripts/odoo-geocodificar-obras.mjs
// una vez por dirección; acá no se geocodifica nada. Geocodificar en cada carga sería
// lento y se pagaría cada visita.
//
// EL DATO QUE HACE ÚTIL AL MAPA es `diasArmado`. Una obra armada hace 160 días es una renta
// excelente o una estructura que alguien se olvidó de bajar, y hasta ahora no había ninguna
// pantalla que lo mostrara. Por eso el color del punto sale de ahí y no del tipo de trabajo.

import { searchRead, read } from "./client";

type M2O = [number, string] | false;

function m2oName(v: M2O | undefined): string | null {
  return Array.isArray(v) ? v[1] : null;
}
function str(v: string | false | null | undefined): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : null;
}

export type ObraEnMapa = {
  ventaId: number;
  venta: string;
  cliente: string | null;
  direccion: string;
  /** Cómo se reconoce el lugar desde la calle ("Banco Galicia"). */
  referencia: string | null;
  lat: number;
  lng: number;
  /**
   * Días desde que se armó. null cuando la venta no tiene fecha de armado (5%).
   *
   * OJO con las viejas: la importación de agosto dejó a muchas con la misma fecha, así que
   * para ésas el contador arranca en la importación y no en el armado real. Se nota porque
   * varias marcan exactamente el mismo número.
   */
  diasArmado: number | null;
  /** Fin de obra estimado. Si ya pasó, la obra sigue armada más de lo previsto. */
  finEstimado: string | null;
  /**
   * Qué estructura hay parada. Sale de la PRIMERA OT de armado de la venta.
   *
   * Prefiere el as-built (`x_ejecutado_real`, lo que Operaciones registró al cerrar) sobre el
   * detalle planificado: en un mapa de lo que está armado HOY, lo que se armó de verdad vale
   * más que lo que se había previsto. Sólo 26 de 83 lo tienen, así que el resto cae al plan.
   */
  queEstaArmado: string | null;
  /** El texto de arriba es el as-built y no el plan. Cambia cuánto hay que confiarle. */
  esAsBuilt: boolean;
  /** Fotos de los partes de esa obra, la más nueva primero. Puede venir vacío. */
  fotos: FotoObra[];
  vencida: boolean;
  url: string;
};

const CAMPOS = [
  "name", "partner_id", "x_direccion_obra", "x_obra_referencia",
  "x_obra_lat", "x_obra_lng", "x_fecha_armado", "x_fecha_fin_obra_estimada",
];

type Fila = {
  id: number;
  name: string;
  partner_id: M2O;
  x_direccion_obra: string | false;
  x_obra_referencia: string | false;
  x_obra_lat: number | false;
  x_obra_lng: number | false;
  x_fecha_armado: string | false;
  x_fecha_fin_obra_estimada: string | false;
};

/** Días enteros entre una fecha de Odoo y hoy. Negativo = todavía no llegó. */
function diasDesde(fecha: string, hoy: Date): number {
  const d = new Date(fecha.replace(" ", "T") + "Z");
  return Math.floor((hoy.getTime() - d.getTime()) / 86_400_000);
}

export type FotoObra = {
  id: number;
  /** Fecha del parte donde se cargó, no de la foto. Es lo que hay. */
  fecha: string | null;
  descripcion: string | null;
  /** Ruta propia, no de Odoo: /web/image necesita la sesión de Odoo en el browser. */
  url: string;
};

type FilaOt = {
  id: number;
  x_order_id: M2O;
  x_detalle_tecnico: string | false;
  x_ejecutado_real: string | false;
};

export async function fetchMapaObras(): Promise<ObraEnMapa[]> {
  const base = (process.env.ODOO_URL ?? "").replace(/\/+$/, "");
  const filas = await searchRead<Fila>(
    "sale.order",
    [
      ["x_studio_tipo_de_contrato", "=", "Obra "],
      ["x_studio_estado_de_obra", "=", "Armado"],
      // Sin punto no hay nada que dibujar. Quedan afuera las que el geocodificador no pudo
      // resolver; se ven corriendo el script, no acá.
      ["x_obra_lat", "!=", 0],
    ],
    CAMPOS,
    { limit: 1000 },
  );

  // Qué hay armado en cada obra, de la PRIMERA OT de armado. Una venta puede tener varias
  // —ampliaciones, etapas—; la primera es la que levantó la estructura. Va en una segunda
  // consulta y no en un `related`: son dos modelos y el dato es opcional.
  const todasLasOts = filas.length
    ? await searchRead<FilaOt & { x_tipo: string | false }>(
        "x_aba_orden_trabajo",
        [["x_order_id", "in", filas.map((f) => f.id)]],
        ["x_order_id", "x_tipo", "x_detalle_tecnico", "x_ejecutado_real"],
        { limit: 3000, order: "id" },
      )
    : [];
  const ots = todasLasOts.filter((o) => o.x_tipo === "armado");
  const armadoPorVenta = new Map<number, FilaOt>();
  for (const o of ots) {
    const ventaId = Array.isArray(o.x_order_id) ? o.x_order_id[0] : null;
    // `order: "id"` garantiza que la primera que llega es la más vieja.
    if (ventaId != null && !armadoPorVenta.has(ventaId)) armadoPorVenta.set(ventaId, o);
  }

  // LAS FOTOS QUE YA EXISTEN. Salen de los partes diarios: parte → OT → venta. Se toman de
  // CUALQUIER parte de la venta y no sólo de los de armado —son 15 obras contra 13, y las
  // 98 fotos cargadas tienen momento "final", o sea que todas muestran cómo quedó—.
  //
  // Sólo se traen los METADATOS. El binario pesa ~200 KB por foto y viaja por su propia
  // ruta, para no meter 20 MB de base64 en la respuesta del mapa.
  const partes = ots.length
    ? await searchRead<{ id: number; x_orden_trabajo_id: M2O; x_fecha: string | false }>(
        "x_aba_parte_diario",
        [["x_orden_trabajo_id", "in", todasLasOts.map((o) => o.id)], ["x_cant_fotos", ">", 0]],
        ["x_orden_trabajo_id", "x_fecha"],
        { limit: 3000 },
      )
    : [];
  const ventaDeOt = new Map(todasLasOts.map((o) => [o.id, Array.isArray(o.x_order_id) ? o.x_order_id[0] : null]));
  const parteInfo = new Map(partes.map((p) => [p.id, p]));
  const fotos = partes.length
    ? await searchRead<{ id: number; x_parte_diario_id: M2O; x_descripcion: string | false }>(
        "x_aba_foto",
        [["x_parte_diario_id", "in", partes.map((p) => p.id)]],
        ["x_parte_diario_id", "x_descripcion"],
        { limit: 2000 },
      )
    : [];
  const fotosPorVenta = new Map<number, FotoObra[]>();
  for (const f of fotos) {
    const parte = parteInfo.get(Array.isArray(f.x_parte_diario_id) ? f.x_parte_diario_id[0] : -1);
    if (!parte) continue;
    const ventaId = ventaDeOt.get(Array.isArray(parte.x_orden_trabajo_id) ? parte.x_orden_trabajo_id[0] : -1);
    if (ventaId == null) continue;
    const lista = fotosPorVenta.get(ventaId) ?? [];
    lista.push({
      id: f.id,
      fecha: str(parte.x_fecha),
      descripcion: str(f.x_descripcion),
      url: `/api/operaciones/foto/${f.id}`,
    });
    fotosPorVenta.set(ventaId, lista);
  }
  // La más nueva primero: es la que muestra el estado actual.
  for (const lista of fotosPorVenta.values()) {
    lista.sort((a, b) => (b.fecha ?? "").localeCompare(a.fecha ?? ""));
  }

  const hoy = new Date();
  return filas
    .filter((f) => typeof f.x_obra_lat === "number" && typeof f.x_obra_lng === "number")
    .map((f) => {
      const fin = str(f.x_fecha_fin_obra_estimada);
      const ot = armadoPorVenta.get(f.id);
      const asBuilt = str(ot?.x_ejecutado_real);
      return {
        ventaId: f.id,
        venta: f.name,
        cliente: m2oName(f.partner_id),
        direccion: str(f.x_direccion_obra) ?? f.name,
        referencia: str(f.x_obra_referencia),
        lat: f.x_obra_lat as number,
        lng: f.x_obra_lng as number,
        diasArmado: str(f.x_fecha_armado) ? diasDesde(str(f.x_fecha_armado)!, hoy) : null,
        finEstimado: fin,
        queEstaArmado: asBuilt ?? str(ot?.x_detalle_tecnico),
        esAsBuilt: asBuilt != null,
        fotos: fotosPorVenta.get(f.id) ?? [],
        // Sigue armada después de la fecha en que se estimó que terminaba.
        vencida: fin ? diasDesde(fin, hoy) > 0 : false,
        url: `${base}/odoo/sales/${f.id}`,
      };
    });
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
