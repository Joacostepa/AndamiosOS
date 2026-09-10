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

import { searchRead } from "./client";

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
  const ots = filas.length
    ? await searchRead<FilaOt>(
        "x_aba_orden_trabajo",
        [["x_order_id", "in", filas.map((f) => f.id)], ["x_tipo", "=", "armado"]],
        ["x_order_id", "x_detalle_tecnico", "x_ejecutado_real"],
        { limit: 2000, order: "id" },
      )
    : [];
  const armadoPorVenta = new Map<number, FilaOt>();
  for (const o of ots) {
    const ventaId = Array.isArray(o.x_order_id) ? o.x_order_id[0] : null;
    // `order: "id"` garantiza que la primera que llega es la más vieja.
    if (ventaId != null && !armadoPorVenta.has(ventaId)) armadoPorVenta.set(ventaId, o);
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
        // Sigue armada después de la fecha en que se estimó que terminaba.
        vencida: fin ? diasDesde(fin, hoy) > 0 : false,
        url: `${base}/odoo/sales/${f.id}`,
      };
    });
}
