// Tipos del módulo Habilitaciones — compartidos entre servidor y cliente.
//
// Ver docs/modulo-habilitaciones.md. Lo importante para leer este archivo:
// el ESTADO de la habilitación vive en Odoo y la GESTIÓN en Supabase.

/** Estados de un requisito. `observado` es el que hoy no existe en ningún lado. */
export type EstadoRequisito = "pendiente" | "enviado" | "observado" | "aprobado";

/** Los 4 valores escribibles de x_hab_estado en Odoo. */
export type HabEstado = "pendiente" | "en_curso" | "habilitada" | "no_aplica";

/** x_hab_etapa: COMPUTADO en Odoo, readonly. La app nunca lo escribe. */
export type HabEtapa = "a" | "b" | "c" | "d" | "e" | "f";

/** x_hab_alerta: COMPUTADO en Odoo, readonly. */
export type HabAlerta = "ok" | "proxima" | "critica" | "atrasada" | "vencida";

/** x_hab_semaforo: COMPUTADO en Odoo, readonly. */
export type HabSemaforo = "rojo" | "amarillo" | "verde" | "vencida" | "gris";

export type ModalidadPermiso = "sin_permiso" | "con_expediente" | "esperar_permiso";
export type TramiteEstado = "no_presentado" | "presentado" | "emitido";

export type TipoGestion =
  | "triage" | "consulta" | "reclamo" | "envio" | "aprobacion"
  | "observacion" | "permiso" | "renovacion" | "excepcion";

export const ETAPA_LABEL: Record<HabEtapa, string> = {
  a: "Falta consultar requisitos al cliente",
  b: "Esperando requisitos del cliente",
  c: "Documentación enviada — esperando validación",
  d: "Habilitada",
  e: "Habilitación vencida — renovar",
  f: "No aplica",
};

export const MODALIDAD_LABEL: Record<ModalidadPermiso, string> = {
  sin_permiso: "Sin permiso — el cliente asume",
  con_expediente: "Con expediente en trámite",
  esperar_permiso: "Esperar el permiso emitido",
};

export const TRAMITE_LABEL: Record<TramiteEstado, string> = {
  no_presentado: "No presentado",
  presentado: "Presentado",
  emitido: "Emitido",
};

export const TIPO_GESTION_LABEL: Record<TipoGestion, string> = {
  triage: "Triage",
  consulta: "Consulta",
  reclamo: "Reclamo",
  envio: "Envío",
  aprobacion: "Aprobación",
  observacion: "Observación",
  permiso: "Permiso",
  renovacion: "Renovación",
  excepcion: "Excepción",
};

/** Lo que la app SÍ escribe en Odoo. Los otros cuatro x_hab_* son computados. */
export type InputsHabilitacion = {
  hab_estado: HabEstado | null;
  hab_fecha_consulta: string | null;
  hab_fecha_envio: string | null;
  hab_fecha: string | null;
  hab_vencimiento: string | null;
};

export type Requisito = {
  id: string;
  odoo_ot_id: number;
  nombre: string;
  estado: EstadoRequisito;
  fecha_envio: string | null;
  fecha_resolucion: string | null;
  motivo_obs: string | null;
  origen: "paquete" | "manual";
  orden: number;
  adjuntos?: AdjuntoRequisito[];
};

export type AdjuntoRequisito = { nombre: string; path: string; tamano: number | null };

export type Nota = {
  id: string;
  odoo_ot_id: number;
  texto: string;
  fijada: boolean;
  autor_id: string | null;
  autor_nombre?: string | null;
  created_at: string;
};

export type Gestion = {
  id: string;
  odoo_ot_id: number;
  tipo: TipoGestion;
  detalle: string | null;
  autor_id: string | null;
  autor_nombre?: string | null;
  created_at: string;
};

export type Paquete = {
  id: string;
  nombre: string;
  requisitos: string[];
  orden: number;
  es_default: boolean;
  activo: boolean;
};

export type EstadoSync = "pendiente" | "sincronizado" | "error" | "huerfana";

/** La fila de `hab_ots`: cabecera local de la habilitación. */
export type HabOt = InputsHabilitacion & {
  odoo_ot_id: number;
  triage: "aplica" | "no_aplica" | null;
  triage_fecha: string | null;
  sync_estado: EstadoSync;
  sync_error: string | null;
  sync_intentos: number;
};

/** Los datos de permiso, que viven en `sale.order`. */
export type Permiso = {
  ventaId: number | null;
  ventaNombre: string | null;
  modalidad: ModalidadPermiso | null;
  modalidadDefinida: string | null;
  tramite: TramiteEstado | null;
  expedienteNro: string | null;
  expedienteFecha: string | null;
  permisoFecha: string | null;
  /** sale.order.x_studio_tcnico — many2one a hr.employee. A quién se le pide la modalidad. */
  tecnicoId: number | null;
  tecnicoNombre: string | null;
};

/** Una fila de la bandeja. */
export type FilaBandeja = {
  otId: number;
  titulo: string;
  ventaNombre: string | null;
  tipo: string;
  estadoOt: string;
  fechaProgramada: string | null;
  etapa: HabEtapa | null;
  alerta: HabAlerta | null;
  semaforo: HabSemaforo | null;
  /** x_hab_dias — computado en Odoo, antigüedad del trámite. */
  dias: number;
  vencimiento: string | null;
  triage: "aplica" | "no_aplica" | null;
  syncEstado: EstadoSync;
  modalidad: ModalidadPermiso | null;
  tramite: TramiteEstado | null;
  tecnicoNombre: string | null;
  requisitos: { total: number; aprobados: number; observados: number };
  notasFijadas: string[];
  url: string;
};

export type ClaveGrupo =
  | "recien_llegadas" | "critica" | "atrasada"
  | "esperando_cliente" | "validacion" | "por_vencer";

export type GrupoBandeja = {
  clave: ClaveGrupo;
  titulo: string;
  filas: FilaBandeja[];
  peligro: boolean;
};

export type Bandeja = {
  grupos: GrupoBandeja[];
  total: number;
  desincronizadas: number;
};

export type FichaHabilitacion = {
  otId: number;
  titulo: string;
  tipo: string;
  estadoOt: string;
  fechaProgramada: string | null;
  etapa: HabEtapa | null;
  semaforo: HabSemaforo | null;
  alerta: HabAlerta | null;
  dias: number;
  fechaConsulta: string | null;
  fechaEnvio: string | null;
  fechaHabilitada: string | null;
  vencimiento: string | null;
  observaciones: string | null;
  triage: "aplica" | "no_aplica" | null;
  syncEstado: EstadoSync;
  syncError: string | null;
  permiso: Permiso;
  requisitos: Requisito[];
  notas: Nota[];
  gestiones: Gestion[];
  reclamos: number;
  url: string;
  urlVenta: string | null;
};
