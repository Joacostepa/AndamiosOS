// Ciudad Armada: el contrato entre lo que arma el servidor y lo que dibuja el mapa 3D.
//
// Vive en un archivo propio y sin dependencias porque lo importan las dos puntas: el
// server (src/lib/odoo/mapa-obras.ts) y el cliente (mapa, lista, ficha). Si un campo cambia
// de significado, cambia acá y el compilador avisa en los dos lados.
//
// Especificación funcional: docs/mapa-obras/ciudad-armada.md y la maqueta en
// docs/mapa-obras/maqueta/ciudad-armada.html.

export type EstadoObra = "armada" | "pendiente_desarme" | "desarmada";

export type TipoTrabajo =
  | "pantalla_proteccion"
  | "estructura_pantalla"
  | "estructura_sin_pantalla"
  | "torre"
  | "plataforma"
  | "sercha"
  | "apuntalamiento_vertical";

/**
 * Por qué el punto de la obra es (o no es) confiable.
 *  · ok             — coordenadas de Odoo dentro del AMBA y la dirección tiene calle y número.
 *  · sin_ubicacion  — la venta no tiene coordenadas. Aparece en la lista, no en el mapa.
 *  · lejos          — las coordenadas caen fuera del AMBA (ej. "Bolívar 1887" ubicada en la
 *                     ciudad de Bolívar). No se dibuja: sería un punto a 300 km.
 *  · sin_altura     — se dibuja, pero la dirección no tiene calle y número y el punto es el
 *                     centro de la localidad ("INGENIERIO BUDGE PVCIA BS AS").
 */
export type CalidadUbicacion = "ok" | "sin_ubicacion" | "lejos" | "sin_altura";

/** Medidas de la estructura en metros. Ninguna obra tiene x_permiso_altura cargado. */
export type Medidas = {
  largo: number;
  /** Profundidad desde la fachada hacia la calle (1,25 en las pantallas). */
  ancho: number;
  alto: number;
  /** true si alguna medida se estimó por tipo de trabajo en vez de leerse del texto. */
  estimadas: boolean;
};

/**
 * Dónde se apoya la estructura: el punto sobre la línea municipal y hacia dónde queda el
 * edificio. Se calcula buscando, en los tiles de OpenStreetMap, la calle de la dirección
 * más cercana al punto de Odoo.
 */
export type Fachada = {
  lng: number;
  lat: number;
  /** Vector unitario [este, norte] que apunta de la calle hacia el edificio. */
  normal: [number, number];
  /** Nombre de la calle según el mapa. */
  calle: string | null;
  /** La calle del mapa coincide con la de la dirección (si no, es la calle más cercana). */
  coincideCalle: boolean;
};

export type FotoObra = {
  /** Número para las de Odoo (partes), uuid para las de Telegram. */
  id: number | string;
  /** Fecha del parte donde se cargó (YYYY-MM-DD), no de la foto. */
  fecha: string | null;
  descripcion: string | null;
  /** Ruta propia, no de Odoo: /web/image necesita la sesión de Odoo en el browser. */
  url: string;
  origen: "parte" | "telegram";
};

export type ObraMapa = {
  ventaId: number;
  /** "S02758" */
  venta: string;
  cliente: string | null;
  /** Tal cual está en Odoo. */
  direccion: string;
  /** Limpia para etiquetas: "Av. Olazábal 2939", sin "CABA" ni notas entre paréntesis. */
  direccionCorta: string;
  referencia: string | null;
  estado: EstadoObra;
  lat: number | null;
  lng: number | null;
  ubicacion: CalidadUbicacion;
  /** null si no hay ubicación o no se encontró una calle cerca. */
  fachada: Fachada | null;
  /** YYYY-MM-DD en hora argentina. */
  fechaArmado: string | null;
  /** La fecha de armado es la de la importación (24/03/2026), no la real. */
  fechaDeImportacion: boolean;
  /** YYYY-MM-DD. Sólo desarmadas (x_fecha_desmontaje). */
  fechaDesarme: string | null;
  /** Pendientes de desarme: la fecha programada de la OT de desarme abierta, si hay. */
  desarmeProgramado: string | null;
  finEstimado: string | null;
  /** No desarmada y el fin estimado ya pasó. */
  vencida: boolean;
  /** Días desde el armado hasta hoy (o hasta el desarme, si está desarmada). */
  diasArmado: number | null;
  tipo: TipoTrabajo | null;
  medidas: Medidas;
  /** x_estructura_actual; si no hay, el as-built o el detalle de la primera OT de armado. */
  queEstaArmado: string | null;
  /** "obra" = confirmado en obra (x_estructura_actual); "ot" = sale de la OT (previsto). */
  queEstaArmadoFuente: "obra" | "ot" | null;
  queEstaArmadoFecha: string | null;
  /** Fotos de los partes y de Telegram, la más nueva primero. */
  fotos: FotoObra[];
  /** Link a la venta en Odoo. */
  url: string;
};

/** Cuántas obras había en la calle cada semana (para la línea de tiempo del histórico). */
export type PuntoCurva = { fecha: string; enLaCalle: number };

/** Respuesta de GET /api/operaciones/mapa-obras */
export type RespuestaMapaObras = {
  obras: ObraMapa[];
  curva: PuntoCurva[];
  /** ISO, cuándo se armó la respuesta. */
  generado: string;
};

// ---------------------------------------------------------------------------------------
// Contrato del componente de mapa (src/components/mapa-obras/ciudad/ciudad-armada-mapa.tsx)

/** Categoría de color de cada obra en el mapa. La decide la página, el mapa sólo pinta. */
export type CategoriaMapa =
  | "reciente" // ≤ 30 días
  | "media" // 31–90
  | "larga" // > 90
  | "importacion" // fecha de armado = importación
  | "sinFecha"
  | "pendiente" // pendiente de desarme
  | "sigue" // histórico: hoy sigue en la calle
  | "desarmada"; // histórico: ya se desarmó

export type ObraParaMapa = {
  obra: ObraMapa;
  categoria: CategoriaMapa;
  /** Segunda línea de la etiqueta: "28 días armada · pantalla". */
  subtitulo: string;
};

export type CiudadArmadaMapaProps = {
  /** Sólo las que se dibujan (ya filtradas). Las sin coordenadas o "lejos" se ignoran. */
  obras: ObraParaMapa[];
  seleccionada: number | null;
  onSeleccionar: (ventaId: number | null) => void;
  tema: "noche" | "dia";
  /** Vista desde arriba (2D) o inclinada (3D). */
  plano: boolean;
  /** Margen que ocupan los paneles, para centrar bien los vuelos de cámara. */
  margen?: { top: number; right: number; bottom: number; left: number };
};

/** Lo que la página le puede pedir al mapa por ref. */
export type CiudadArmadaMapaApi = {
  /** Vuela de frente a la fachada de la obra. */
  volarA: (ventaId: number, duracionMs?: number) => void;
  /** Vista general de CABA inclinada. */
  irAGeneral: (duracionMs?: number) => void;
  /** Encuadra un conjunto de obras (resultado de una búsqueda). */
  encuadrar: (ventaIds: number[]) => void;
};
