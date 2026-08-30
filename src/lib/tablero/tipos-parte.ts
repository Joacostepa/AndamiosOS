// Tipos del cierre de jornada, compartidos entre el servidor (capa Odoo) y el cliente.
// Mismo criterio que tipos.ts: el bundle del browser no toca el módulo server-only.

export type EstadoParte = "ejecutado" | "no_ejecutado";

/** Motivos de no ejecución, tal como están en x_aba_parte_diario.x_motivo_no_ejec. */
export const MOTIVOS_NO_EJEC = [
  { value: "lluvia", label: "Lluvia / clima" },
  { value: "cliente", label: "Cliente no habilitó el acceso" },
  { value: "permiso", label: "Falta de permiso" },
  { value: "material", label: "Falta de material" },
  { value: "personal", label: "Falta de personal" },
  { value: "reprogramada", label: "Reprogramada por logística" },
  { value: "otro", label: "Otro" },
] as const;

/** Tareas de x_aba_mano_obra.x_tarea. */
export const TAREAS = [
  { value: "armado", label: "Armado" },
  { value: "desarme", label: "Desarme" },
  { value: "carga_descarga", label: "Carga / descarga" },
] as const;

// OJO: la lista real de Odoo trae `problema_cliente` y NO `falta_material`. Mandar un
// valor fuera de la selección lo rechaza el servidor, así que manda la de Odoo.
export const TIPOS_INCIDENCIA = [
  { value: "clima", label: "Clima" },
  { value: "rotura_material", label: "Rotura de material" },
  { value: "accidente", label: "Accidente" },
  { value: "parada_obra", label: "Parada de obra" },
  { value: "problema_cliente", label: "Problema con el cliente" },
  { value: "otro", label: "Otro" },
] as const;

/** Momentos de x_aba_foto.x_momento. */
export const MOMENTOS_FOTO = [
  { value: "antes", label: "Antes" },
  { value: "durante", label: "Durante" },
  { value: "final", label: "Terminado" },
  { value: "incidencia", label: "Incidencia" },
  { value: "entrega", label: "Entrega / conformidad" },
] as const;

/**
 * Odoo guarda las horas como decimal (8.5 = 08:30) pero nadie piensa así: en obra se
 * dice "de 8:30 a 9:23". La app muestra y pide HH:MM y convierte en el borde.
 */
export function horaADecimal(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  if (!Number.isFinite(h)) return 0;
  return h + (Number.isFinite(m) ? m : 0) / 60;
}

export function decimalAHora(decimal: number): string {
  if (!Number.isFinite(decimal) || decimal < 0) return "";
  // Se redondea al minuto: 9.383333 vuelve a ser 09:23 y no 09:22:59.
  const total = Math.round(decimal * 60);
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export type LineaManoObra = {
  tarea: string;
  personas: number;
  /** Formato decimal: 8.0 = 08:00, 17.5 = 17:30. */
  horaDesde: number;
  horaHasta: number;
};

export type LineaFlete = {
  cantidad: number;
  tercerizado: boolean;
  costoManual?: number;
};

export type LineaIncidencia = {
  tipo: string;
  descripcion: string;
};

export type FotoParaSubir = {
  nombre: string;
  /** Ya comprimida del lado del cliente, sin el prefijo data:. */
  base64: string;
  momento: string;
  descripcion?: string | null;
};

export type Empleado = { id: number; nombre: string; escala: string | null };

export type DatosCierre = {
  fecha: string;
  cuadrillaId: number | null;
  /** El capataz que estuvo a cargo ese día. Cambia con ausencias y rotaciones. */
  punteroId: number | null;
  /**
   * El camión no volvió: se quedó en la obra. Con el desde/hasta del parte alcanza para
   * medir cuánto tiempo estuvo parado, así que no hace falta cargar las horas aparte.
   */
  camionEnObra: boolean;
  estado: EstadoParte;
  motivoNoEjec: string | null;
  sector: string | null;
  clima: string | null;
  objetivo: string | null;
  tareas: string | null;
  observaciones: string | null;
  manoObra: LineaManoObra[];
  flete: LineaFlete | null;
  incidencias: LineaIncidencia[];
  fotos: FotoParaSubir[];
  /**
   * Qué quedó efectivamente armado. Sólo viaja cuando se cierra la OT (`finalizarOt`) y
   * el tipo deja estructura en pie: armado, ampliación o desmonte parcial.
   *
   * Es el dato que después lee Comercial para emitir el desarme. Sin esto, la OT de
   * desarme describe lo vendido, que meses más tarde no es lo que hay en la obra.
   */
  ejecutadoReal: string | null;
};

export type PasoCierre = { nombre: string; ok: boolean; detalle?: string };

export type ResultadoCierre = {
  parteId: number;
  /** true si ya había un parte para esa OT y fecha y se actualizó en vez de duplicar. */
  reutilizado: boolean;
  pasos: PasoCierre[];
  fotosFallidas: string[];
};

export type ParteCargado = {
  id: number;
  otId: number;
  fecha: string;
  cuadrillaId: number | null;
  punteroId: number | null;
  camionEnObra: boolean;
  estado: EstadoParte;
  motivoNoEjec: string | null;
  sector: string | null;
  clima: string | null;
  objetivo: string | null;
  tareas: string | null;
  observaciones: string | null;
  /** Calculados por Odoo, solo lectura. */
  horasHombre: number;
  costoTotal: number;
  manoObra: (LineaManoObra & { horas: number; horasHombre: number })[];
  flete: LineaFlete | null;
  incidencias: LineaIncidencia[];
  fotos: { momento: string; descripcion: string | null }[];
};

/** Los tipos de OT que redefinen qué hay armado en la obra. */
export const DEJAN_ESTRUCTURA = new Set(["armado", "ampliacion", "desmonte_parcial"]);

/**
 * El motivo por el que no se puede guardar todavía, o null si está listo.
 *
 * Se exige que el texto CAMBIE cuando dijeron que hubo diferencias: apretar "hubo
 * diferencias" y dejar el texto igual es no haber contestado.
 */
export function faltaAsBuilt(
  tipo: string,
  finalizada: boolean,
  coincide: boolean | null,
  texto: string,
  previsto: string | null,
): string | null {
  if (!finalizada || !DEJAN_ESTRUCTURA.has(tipo)) return null;
  if (coincide === null) return "Falta decir si quedó como estaba previsto";
  if (coincide) return null;
  const limpio = texto.trim();
  if (!limpio) return "Falta describir qué quedó armado";
  if (limpio === (previsto ?? "").trim()) {
    return "Dijiste que hubo diferencias: escribí cuáles";
  }
  return null;
}

/** El texto que se manda a Odoo, o null si no corresponde sellar nada. */
export function asBuiltAEnviar(
  tipo: string,
  finalizada: boolean,
  coincide: boolean | null,
  texto: string,
  previsto: string | null,
): string | null {
  if (!finalizada || !DEJAN_ESTRUCTURA.has(tipo)) return null;
  if (coincide === true) return previsto?.trim() || null;
  return texto.trim() || null;
}
