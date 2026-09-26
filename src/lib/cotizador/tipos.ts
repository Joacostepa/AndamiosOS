// Motor de precios — tipos compartidos.
//
// EL MOTOR ES EL ÚNICO QUE HACE CUENTAS. El asistente decide qué se cotiza (modelo, medidas,
// opciones que eligió el vendedor) y llama a estas funciones; los importes que van al PDF y a
// Odoo salen de acá y de ningún otro lado. Un modelo de lenguaje que multiplica 43,88 × 175.000
// de cabeza se equivoca una vez cada tanto, y en un presupuesto una vez es demasiado.
//
// PURO: sin base, sin red, sin Next. Recibe las tarifas como argumento (ver tarifas.ts) y se
// prueba con `node --test` sin levantar nada. Por eso los imports internos llevan `.ts`.

export type Rango = { min: number; max: number };

/** Los números de Parámetros de cotización, con nombres del dominio. Ver tarifas.ts. */
export type Tarifas = {
  ivaPct: number;
  validezDias: number;
  periodoMinimoDias: number;
  renovacionObraPct: number;
  renovacionAlquilerPuroPct: number;
  corteMoPct: number;
  plazoInicioDiasHabiles: number;
  bandeja: { m3: number; m6: Rango; m8: number; minimoMl: number; concertinaPct: number };
  fachada: {
    lista: number;
    licitacion: number;
    estandar: Rango;
    escaleras: number;
    completa: Rango;
    compleja: Rango;
    especial: Rango;
    saltoAPct: number;
    saltoBPct: number;
  };
  alquiler: { recargoListaPct: number; fueraListaPct: number };
  venta: { amortizacionAMeses: number; amortizacionBMeses: number };
  complementarios: {
    gestoriaCaba: number;
    mediaSombraM2: number;
    fenolicoM2: number;
    ingenieria: Rango;
    ingenieriaTorreSimple: number;
    syh: Rango;
    fleteGbaCercano: number;
    fleteCaba: Rango;
    fleteLaPlata: number;
  };
  manoObra: {
    personaJornada: number;
    recargoEstandarPct: number;
    recargoAltoPct: number;
    industriaCuadrilla: number;
    cuadrillaPersonas: number;
    sabadoPct: number;
    domingoPct: number;
    nocturnoPct: Rango;
    adversasPct: number;
    /** Ordenado por altura: el primero cuyo `hastaM` alcanza. El último es Infinity. */
    productividad: { hastaM: number; factor: number }[];
  };
  viaticos: { viajePct: number; alojamientoNoche: number; comidaDia: number; minimoDias: number };
};

/** base: suma al subtotal · adicional: se muestra aparte, no suma · opcional: lo evalúa el cliente. */
export type Seccion = "base" | "adicional" | "opcional";

/** Qué cálculo produjo la línea. Re-cotizar un grupo reemplaza sus líneas y deja las otras. */
export type Grupo = "bandeja" | "fachada" | "alquiler" | "mano_obra" | "complementario" | "venta" | "manual";

export type Linea = {
  /** Estable dentro del presupuesto: "bandeja", "bandeja:concertina", "flete"… */
  id: string;
  grupo: Grupo;
  seccion: Seccion;
  /** Clave de cotizacion_productos_odoo. El motor nunca inventa un product_id. */
  producto: string;
  /** Lo que se lee en el PDF y en la línea de Odoo. Corto: el detalle va en la Sección 2. */
  descripcion: string;
  /** Cantidad en Odoo: m², m.l. o unidades (para montos fijos, 1). */
  cantidad: number;
  /** price_unit en Odoo, a valor de lista (sin la bonificación). */
  precioUnitario: number;
  /** Bonificación declarada (encuadre B). Va al campo `discount` de la línea en Odoo. */
  descuentoPct?: number;
  /** Lo que se cobra: cantidad × precio × (1 − descuento), redondeado al peso. */
  importe: number;
  /** Lo mismo sin descuento: la renovación se calcula sobre lista (criterio §4.6). */
  importeLista: number;
  /** Ingeniería, S&H, gestoría, flete, viáticos, mano de obra: fuera de la base de la renovación. */
  unicaVez: boolean;
  esManoDeObra?: boolean;
  /** Para opcionales: "por jornada", "por mes". */
  unidad?: string;
  /** Cómo salió el número, en castellano: se muestra al vendedor y va a la nota de Odoo. */
  calculo: string;
  /** Cuando el precio no es el de la tarifa: cuál era la tarifa y por qué se cambió. */
  desvio?: { tarifa: string; motivo: string };
};

export type Aviso = {
  /** bloqueo: no se puede emitir así · advertencia: revisar antes de mandar · info: para saber. */
  nivel: "info" | "advertencia" | "bloqueo";
  codigo: string;
  texto: string;
};

/** Una decisión que el criterio manda preguntar y todavía no se tomó. */
export type Pendiente = { codigo: string; pregunta: string; opciones?: string[] };

export type Resultado<D = Record<string, unknown>> = {
  lineas: Linea[];
  avisos: Aviso[];
  pendientes: Pendiente[];
  /** Porcentaje de renovación que corresponde a este tipo de trabajo (null: se declara aparte). */
  renovacionPct?: number | null;
  detalle?: D;
};

// ── Utilidades de redondeo y formato (compartidas por todo el motor) ──────────────────────

/** Al peso. */
export const alPeso = (n: number) => Math.round(n);
/** A los centavos. */
export const alCentavo = (n: number) => Math.round(n * 100) / 100;
/** Al múltiplo de `paso` más cercano (100 → valores presentables de $/m²). */
export const alMultiplo = (n: number, paso: number) => Math.round(n / paso) * paso;

export function nuevaLinea(l: Omit<Linea, "importe" | "importeLista">): Linea {
  const lista = alPeso(l.cantidad * l.precioUnitario);
  const importe = alPeso(l.cantidad * l.precioUnitario * (1 - (l.descuentoPct ?? 0) / 100));
  return { ...l, importe, importeLista: lista };
}

/** "$ 1.440.000" */
export function pesos(n: number): string {
  return `$ ${alPeso(n).toLocaleString("es-AR")}`;
}

/** "43,88" */
export function numero(n: number, decimales = 2): string {
  return n.toLocaleString("es-AR", { maximumFractionDigits: decimales });
}
