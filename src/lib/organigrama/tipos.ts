// Tipos del organigrama (maqueta, docs/organigrama/propuesta.md § 6.4).
//
// La ESTRUCTURA (nodos, jerarquía y manual de funciones) es versionada y se publica; la
// OCUPACIÓN (quién está en qué puesto) es inmediata y no pasa por el borrador. Por eso son
// tipos separados: un Nodo no sabe quién lo ocupa.

export type ColorArea = "gris" | "teal" | "ambar" | "violeta" | "verde" | "rosa" | "azul";
export type TipoNodo = "direccion" | "area" | "puesto";
export type RolDoc = "emite" | "firma" | "recibe" | "usa";
export type CodigoDoc = "SOL" | "OPC" | "RS" | "FS" | "RDP" | "RDF" | "ICO";

export type DocTarea = { codigo: CodigoDoc; rol: RolDoc };
export type Tarea = { texto: string; docs?: DocTarea[] };

export type Nodo = {
  /** Id estable y URL: 'stock'. */
  clave: string;
  /** Clave del padre; null = raíz (una sola). */
  dependeDe: string | null;
  tipo: TipoNodo;
  titulo: string;
  /** El "subtitle" del original: «Stock e Inventario». */
  rol?: string;
  /** Solo dirección y áreas: clave de la paleta --tb-*. */
  color?: ColorArea;
  mision?: string;
  tareas: Tarea[];
  noHace: string[];
  kpis: string[];
  /** PÚBLICA: «Separado de Operaciones a propósito…». */
  notaDiseno?: string;
  /** Solo la ven los editores. */
  notaInterna?: string;
  fuenteOcupantes?: "manual" | "cuadrillas";
  orden: number;
};

export type OrigenPersona = "legajo" | "usuario" | "externo";

export type Persona = {
  id: string;
  nombre: string;
  apellido: string;
  origen: OrigenPersona;
  telefono?: string;
  email?: string;
  activo: boolean;
  /** ISO (AAAA-MM-DD). */
  bajaEl?: string;
  tarea?: "andamista" | "chofer" | "herrero";
  /** Externos: la empresa. */
  empresa?: string;
};

export type Modalidad = "titular" | "interino";

export type Ocupante = {
  id: string;
  nodo: string;
  persona: string;
  modalidad: Modalidad;
  /** ISO. */
  desde: string;
  /** ISO; sin `hasta` = vigente. */
  hasta?: string;
};

export type Cuadrilla = { id: string; nombre: string; capataz: string | null; plantel: string[]; temporaria?: boolean };

export type Documento = { codigo: CodigoDoc; nombre: string };

export type TipoCambio = "nuevo" | "modificado" | "movido" | "eliminado";
export type Cambio = { tipo: TipoCambio; nodo: string; detalle: string };

export type Version = {
  id: string;
  numero: number | null;
  estado: "borrador" | "publicada" | "archivada";
  nota: string;
  /** ISO. */
  fecha: string;
  autor: string;
  cambios: Cambio[];
};

/** Todo lo que necesitan las funciones puras para responder sobre la ocupación. */
export type DatosOrg = {
  nodos: Nodo[];
  personas: Persona[];
  ocupantes: Ocupante[];
  cuadrillas: Cuadrilla[];
};

/** «Ver como» de la maqueta: reemplaza al permiso real mientras no hay base. */
export type VerComo = "direccion" | "administracion" | "encargado" | "capataz";
