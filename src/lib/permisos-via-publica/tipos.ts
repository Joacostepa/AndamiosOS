// Tipos y reglas de presentación de Permisos vía pública — compartidos por servidor y cliente.
//
// Ver docs/modulo-gestoria-permisos.md. Lo importante para leer este archivo: el estado es
// EL DE TAD, tal cual lo lee el robot. Acá no se decide nada sobre el trámite; sólo cómo se
// agrupa y cómo se nombra lo que dice el Gobierno.

export type Solapa = "en_curso" | "finalizado";

export type Expediente = {
  id: string;
  expediente: string;
  numero: string;
  nombre: string | null;
  titular: string | null;
  estado_tad: string;
  solapa: Solapa;
  creado_tad: string | null;
  estado_desde: string;
  tarea_pendiente: boolean;
  motivo_subsanacion: string | null;
  motivo_leido_at: string | null;
  permiso_notificacion: string | null;
  permiso_path: string | null;
  odoo_venta_id: number | null;
  odoo_venta_nombre: string | null;
  direccion: string | null;
  cliente: string | null;
  /** De la carátula del expediente (la lee el robot una sola vez). */
  barrio: string | null;
  comuna: string | null;
  seccion: string | null;
  manzana: string | null;
  parcela: string | null;
  pedido_desde: string | null;
  pedido_hasta: string | null;
  seguro_compania: string | null;
  seguro_vence: string | null;
  contacto_mail: string | null;
  caratula_path: string | null;
  caratula_leida_at: string | null;
  caratula_error: string | null;
  visto_primero_at: string;
  visto_ultimo_at: string;
};

export type TipoEvento =
  | "alta" | "cambio_estado" | "tarea_subsanacion" | "tarea_resuelta"
  | "motivo" | "permiso_descargado" | "vinculado_odoo" | "error_robot" | "caratula_leida";

export type Evento = {
  id: number;
  expediente_id: string | null;
  tipo: TipoEvento;
  detalle: string | null;
  datos: Record<string, unknown>;
  actor: "robot" | "gcba" | "persona";
  created_at: string;
};

export type EstadoRobot = {
  ultima_revision_at: string | null;
  ultimo_ok_at: string | null;
  proxima_revision_at: string | null;
  ultimo_error: string | null;
  ultimo_error_at: string | null;
  equipo: string | null;
};

export type ClaveGrupo = "accion" | "gobierno" | "emitidos";

export type GrupoExpedientes = { clave: ClaveGrupo; titulo: string; descripcion: string; filas: Expediente[] };

export type Bandeja = {
  grupos: GrupoExpedientes[];
  total: number;
  robot: EstadoRobot | null;
  /** Hay una revisión pedida o corriendo. */
  revisando: boolean;
};

export type FichaExpediente = {
  expediente: Expediente;
  eventos: Evento[];
  /** URL firmada del permiso emitido, válida 10 minutos. */
  permisoUrl: string | null;
};

/** Sin tildes y en mayúsculas: TAD escribe "SUBSANACIÓN" y "SUBSANACION" en la misma lista. */
export function normalizarEstado(estado: string): string {
  return estado.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().trim();
}

const ETIQUETAS: Record<string, string> = {
  INICIACION: "Iniciación",
  SUBSANACION: "Subsanación",
  TRAMITACION: "Tramitación",
  "GUARDA TEMPORAL": "Guarda temporal",
};

export function etiquetaEstado(estado: string): string {
  const n = normalizarEstado(estado);
  return ETIQUETAS[n] ?? n.charAt(0) + n.slice(1).toLowerCase();
}

/**
 * Qué significa cada estado, en palabras de quien no conoce TAD.
 *
 * "Tramitación" suena a "en trámite" y es lo contrario: en este trámite es el estado en el
 * que queda el expediente cuando el permiso YA salió. El instructivo lo aclara con
 * mayúsculas; acá se dice una vez y la pantalla no lo vuelve a confundir.
 */
export function explicacionEstado(e: Pick<Expediente, "estado_tad" | "solapa" | "tarea_pendiente">): string {
  const n = normalizarEstado(e.estado_tad);
  if (e.tarea_pendiente) return "El Gobierno observó algo y hay que corregirlo.";
  // TAD deja el expediente en SUBSANACIÓN también DESPUÉS de que se subsanó, hasta que lo
  // vuelven a revisar. Lo que distingue "hay que corregir" de "ya se corrigió" es la tarea
  // pendiente, no el estado (medido 2026-09-14: 8 en subsanación, sólo 2 con tarea).
  if (n === "SUBSANACION") return "Ya se subsanó. El Gobierno todavía no lo volvió a revisar.";
  if (n === "INICIACION") return "Presentado. El Gobierno todavía no lo revisó.";
  if (n === "TRAMITACION") return "El permiso salió.";
  if (e.solapa === "finalizado") return "Archivado por el Gobierno.";
  return "Estado informado por TAD.";
}

export type ColorEstado = "red" | "yellow" | "green" | "gray" | "blue";

export function colorEstado(e: Pick<Expediente, "estado_tad" | "solapa" | "tarea_pendiente">): ColorEstado {
  const n = normalizarEstado(e.estado_tad);
  if (e.tarea_pendiente) return "red";
  if (n === "SUBSANACION") return "blue";
  if (n === "INICIACION") return "yellow";
  if (n === "TRAMITACION" || e.solapa === "finalizado") return "green";
  return "gray";
}

export function grupoDe(e: Expediente): ClaveGrupo {
  const n = normalizarEstado(e.estado_tad);
  if (e.tarea_pendiente) return "accion";
  if (n === "TRAMITACION" || e.solapa === "finalizado") return "emitidos";
  return "gobierno";
}

const GRUPOS: Omit<GrupoExpedientes, "filas">[] = [
  { clave: "accion", titulo: "Necesitan acción", descripcion: "Con tarea de subsanación en TAD: hay que corregir y volver a presentar." },
  { clave: "gobierno", titulo: "Esperando al Gobierno", descripcion: "Presentados o ya subsanados, todavía sin revisar." },
  { clave: "emitidos", titulo: "Permiso emitido", descripcion: "Salió el permiso o el expediente se archivó." },
];

/**
 * Agrupa por lo que hay que hacer. Dentro de cada grupo, el que lleva más tiempo en su
 * estado primero: en "Esperando al Gobierno" eso deja arriba a los trabados, y en
 * "Necesitan acción" a la observación más vieja.
 */
export function agrupar(expedientes: Expediente[]): GrupoExpedientes[] {
  return GRUPOS.map((g) => ({
    ...g,
    filas: expedientes
      .filter((e) => grupoDe(e) === g.clave)
      .sort((a, b) =>
        g.clave === "emitidos"
          ? b.estado_desde.localeCompare(a.estado_desde)
          : a.estado_desde.localeCompare(b.estado_desde),
      ),
  }));
}

export function coincide(e: Expediente, busqueda: string): boolean {
  const q = normalizarEstado(busqueda);
  if (!q) return true;
  return [e.expediente, e.titular, e.odoo_venta_nombre, e.direccion, e.barrio, e.cliente, e.motivo_subsanacion]
    .some((v) => v && normalizarEstado(v).includes(q));
}
