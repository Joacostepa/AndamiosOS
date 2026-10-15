/**
 * Contrato del núcleo del modelador (arquitectura-produccion.md §3).
 * Solo tipos: sin runtime. Unidades en metros, Y hacia arriba, planta en (x, z), rumbo en grados.
 * Todo cálculo es PREDIMENSIONADO.
 *
 * Los campos marcados «§11» son agregados al contrato original; están anotados en
 * arquitectura-produccion.md §11 (Cambios al contrato).
 */

// ───────────── 3.1 Básicos ─────────────
export type V2 = [number, number]; // planta (x, z) o local (s, t)
export type V3 = [number, number, number]; // mundo (x, y, z) o local (s, y, t)
export type Sistema = 'multi' | 'bastidor';
export type SistemaPieza = Sistema | 'comun';
export type ModoMedida = 'catalogo' | 'libre';
export type ModoBom = 'kit' | 'despiezado';
/** En sentido antihorario, sin repetir el primero. */
export type Poligono = V2[];

// ───────────── 3.2 Diseño y estructura ─────────────
export interface Diseno {
  esquema: number;
  nombre: string;
  obra?: { id: string; codigo: string; nombre: string } | null;
  contexto: Contexto;
  estructuras: Estructura[];
  uniones: Union[];
  modoBom: ModoBom;
  ajustesBom: AjusteBom[];
}

export interface Contexto {
  terreno: 'cemento' | 'tierra' | 'losa';
  enVereda: boolean;
  anchoVereda?: number;
  claseCarga: number;
  zonaViento?: string;
  volumenes: Volumen[];
}

export interface Volumen {
  id: string;
  tipo: 'edificio' | 'losa' | 'puente' | 'cupula' | 'cilindro' | 'muro' | 'escalera';
  nombre?: string;
  planta: Poligono;
  yBase: number;
  yTope: number;
  escalera?: {
    peldanos: { s: number; huella: number; contrahuella: number }[];
    rumbo: number;
    origen: V2;
    descansos: { s0: number; s1: number; cota: number }[];
  };
}

export interface Estructura {
  id: string;
  tipologia: string;
  tipologiaVersion: number;
  preset?: string;
  nombre: string;
  sistema: Sistema;
  origen: V2;
  rumbo: number;
  apoyo: Apoyo;
  medida: ModoMedida;
  params: Record<string, unknown>;
  overrides: Record<string, OverrideCelda>;
  esqueleto?: Esqueleto;
  convertidaDe?: { tipologia: string; tipologiaVersion: number; params: Record<string, unknown> };
}

export type Apoyo =
  | { tipo: 'suelo'; terreno?: Contexto['terreno'] }
  | {
      tipo: 'colgado';
      modo: 'suspendido' | 'volado';
      soporte: { volumenId?: string; estructuraId?: string; cota: number };
      sujecion: 'cano_grampa' | 'viga_celosia' | 'mensula' | 'anclaje_quimico';
    }
  | { tipo: 'sobre_estructura'; estructuraId: string };

export interface OverrideCelda {
  abertura?: boolean;
  viga?: boolean;
  sinPlataforma?: boolean;
  lona?: boolean;
  mensula?: 'afuera' | 'fachada' | false;
  anclaje?: boolean;
  /** Forzar o quitar la diagonal de una celda de cara. */
  diagonal?: 'sube' | 'baja' | false;
  /** §11: armar la celda con caño y grampa (horizontal, baranda y diagonal). */
  cano?: boolean;
  /** §11: solo la diagonal con caño y grampa. */
  diagonalCano?: boolean;
}

export interface Union {
  id: string;
  a: { estructuraId: string; puerto: string; s?: number };
  b: { estructuraId: string; puerto: string };
  modo: 'vertical_compartida' | 'vano_giro' | 'apoyo' | 'embebida';
}

export interface AjusteBom {
  codigo: string;
  delta: number;
  motivo?: string;
}

// ───────────── 3.3 Medida libre ─────────────
export interface TramoVano {
  medida: number;
  /** No es largo de catálogo → caño y grampa. */
  libre: boolean;
}

export interface Relleno {
  modo: ModoMedida;
  pedido: number;
  vanos: TramoVano[];
  total: number;
  desvio: number;
  texto: string;
  alternativas: { id: string; etiqueta: string; vanos: TramoVano[]; texto: string; desvio: number }[];
}

// ───────────── 3.4 Esqueleto ─────────────
/** Grafo estructural en coordenadas LOCALES de la estructura (s a lo largo, t hacia afuera, y arriba). */
export interface Esqueleto {
  sistema: Sistema;
  columnas: Columna[];
  vanos: Vano[];
  panos: Pano[];
  cotas: number[];
  celdas: Record<string, CeldaCara>;
  celdasPano: Record<string, CeldaPano>;
  nodos: Record<string, NodoExtra>;
  elementos: Elemento[];
  /** §11: terreno bajo las bases (tierra → madera bajo cada base). */
  terreno?: Contexto['terreno'];
  /** §11: puertos locales congelados (estructura libre convertida). */
  puertos?: Omit<Puerto, 'estructuraId'>[];
}

export interface Columna {
  id: string;
  p: V2;
  yBase: number;
  yTope: number;
  apoyo: 'base_fija' | 'base_regulable' | 'rueda' | 'rueda_freno' | 'colgada' | 'sobre' | 'ninguno';
  ySuelo?: number;
  /** §11: base móvil (tornillón de base móvil). */
  movil?: boolean;
}

export interface Vano {
  id: string;
  a: string;
  b: string;
  cara: 'exterior' | 'interior' | 'transversal' | 'interna';
  medida: number;
  libre: boolean;
  /** §11: normal hacia afuera de la cara, en local (para ménsulas, cerramientos y anclajes). */
  normal?: V2;
}

export interface Pano {
  id: string;
  vanos: string[];
  libre: boolean;
  /** §11: id de un vano paralelo a los tablones (si falta, se deduce). */
  sentido?: string;
}

export interface CeldaCara {
  horizontal?: boolean;
  /** 0 = sin baranda; 1 = baranda baja (0,50, faldón); 2 = doble baranda (0,50 y 1,00). */
  baranda?: 0 | 1 | 2;
  rodapie?: boolean;
  diagonal?: 'sube' | 'baja' | null;
  cerramiento?: 'lona' | 'media_sombra' | 'fenolico' | 'chapa' | null;
  abertura?: boolean;
  /** §11: armar con caño y grampa (horizontal, baranda y diagonal). */
  cano?: boolean;
  /** §11: solo la diagonal con caño y grampa (banda sin diagonal de catálogo). */
  diagonalCano?: boolean;
}

export interface CeldaPano {
  plataforma?: 'tablones' | 'escotilla' | 'fenolico' | null;
  diagonalPlanta?: boolean;
  /** §11: placa de fenólico encima de los tablones (bandeja). */
  fenolico?: boolean;
}

export interface NodoExtra {
  anclaje?: boolean | { retiro: number; dir?: V2 };
  /** §11: `baranda` = baranda doble en la punta de la ménsula (default true). */
  mensula?: { dir: 'afuera' | 'fachada'; brazo: number; baranda?: boolean } | null;
  estabilizador?: { brazo: number } | null;
}

export interface Elemento {
  id: string;
  familia: Familia;
  medidas: Medidas;
  a: V3;
  b: V3;
  primitivas?: { a: V3; b: V3 }[];
  ajuste?: Pieza['ajuste'];
  rinde?: number;
  grupo?: string;
  /** §11: sistema para resolver el código (default el de la estructura). */
  sistema?: SistemaPieza;
  /** §11: m² o m para códigos con rinde. */
  medida?: number;
  /** §11: kit al que pertenece (bastidor). */
  kit?: { codigo: string | null; grupo: string; medidas?: Medidas };
}

// ───────────── 3.5 Pieza, BOM, avisos ─────────────
export type Familia =
  | 'vertical' | 'horizontal' | 'baranda' | 'diagonal' | 'diagonal_planta'
  | 'tablon' | 'tablon_escotilla' | 'rodapie' | 'fenolico'
  | 'base_fija' | 'base_regulable' | 'collarin' | 'rueda' | 'rueda_freno' | 'estabilizador'
  | 'anclaje' | 'mensula' | 'viga_celosia' | 'viga_puente' | 'zanca' | 'escalera_interior' | 'baranda_escalera'
  | 'bastidor' | 'bastidor_baranda' | 'rienda_h' | 'rienda_d' | 'modulo_kit'
  | 'cano' | 'grampa_fija' | 'grampa_giratoria' | 'manguito'
  | 'lona' | 'media_sombra' | 'chapa' | 'colgador' | 'recubrimiento' | 'esfera' | 'defensa' | 'accesorio';

export interface Medidas {
  largo?: number;
  alto?: number;
  ancho?: number;
  variante?: string;
}

export interface Pieza {
  id: string;
  familia: Familia;
  medidas: Medidas;
  codigo: string | null;
  peso_kg: number | null;
  a: V3;
  b: V3;
  estructuraId: string;
  owner: string;
  celda?: string;
  nodo?: string;
  elemento?: string;
  kit?: { codigo: string; grupo: string };
  medida?: number;
  ajuste?: {
    motivo: 'vano_libre' | 'altura_libre' | 'profundidad_libre' | 'amarre' | 'manual';
    medidaPedida: number;
    medidaPieza: number;
  };
  primitivas?: { a: V3; b: V3 }[];
}

export interface LineaBom {
  clave: string;
  codigo: string | null;
  piezaId: string | null;
  descripcion: string;
  familia: Familia;
  grupo: string;
  cantidad: number;
  unidad: string;
  peso_unit: number | null;
  peso_total: number | null;
  stockLibre: number | null;
  falta: number | null;
  esKit: boolean;
  esAjuste: boolean;
  sinCodigo: boolean;
  ajusteManual: number;
  /** §11: m² o m medidos (códigos con rinde). */
  medida?: number;
}

export type Nivel = 'error' | 'aviso' | 'info';

export interface Aviso {
  id: string;
  regla: string;
  nivel: Nivel;
  texto: string;
  estructuraId: string | null;
  celda?: string;
  reparaciones: { etiqueta: string; accion: Accion }[];
}

export interface Regla {
  id: string;
  regla: string;
  texto: string;
  estructuraId: string | null;
  deshacer?: Accion;
}

export type Accion =
  | { tipo: 'param'; estructuraId: string; ruta: string; valor: unknown }
  | { tipo: 'override'; estructuraId: string; celda: string; valor: OverrideCelda | null }
  | { tipo: 'esqueleto'; estructuraId: string; op: OpEsqueleto }
  | { tipo: 'medida'; estructuraId: string; modo: ModoMedida }
  | { tipo: 'modoUnion'; unionId: string; modo: Union['modo'] }
  | { tipo: 'quitarUnion'; unionId: string }
  | { tipo: 'agregarEstructura'; tipologia: string; preset?: string; opciones?: Record<string, unknown> }
  // §11
  | { tipo: 'overrides'; estructuraId: string; celdas: string[]; valor: Record<string, unknown> | null }
  | { tipo: 'sistema'; estructuraId: string; sistema: Sistema }
  | { tipo: 'modoBom'; modo: ModoBom }
  | { tipo: 'lote'; acciones: Accion[] };

// ───────────── 3.6 Operaciones de la estructura libre ─────────────
/** Parcial donde `null` borra el campo. */
export type Anulable<T> = { [K in keyof T]?: T[K] | null };

export type OpEsqueleto =
  | {
      op: 'agregarVano';
      desde: { vanoId?: string; columnaId?: string };
      hacia: 'izq' | 'der' | 'afuera' | 'adentro';
      medida: number;
      libre?: boolean;
      desdeK?: number;
      hastaK?: number;
    }
  | { op: 'quitarVano'; vanoId: string }
  | { op: 'medidaVano'; vanoId: string; medida: number; libre?: boolean }
  | { op: 'agregarNivel'; cota: number; columnas?: string[] }
  | { op: 'quitarNivel'; k: number; columnas?: string[] }
  | { op: 'celda'; clave: string; valor: Anulable<CeldaCara> | null }
  | { op: 'pano'; clave: string; valor: Anulable<CeldaPano> | null }
  | { op: 'nodo'; clave: string; valor: Anulable<NodoExtra> | null }
  | { op: 'columna'; columnaId: string; yBase?: number; yTope?: number; apoyo?: Columna['apoyo']; ySuelo?: number }
  | { op: 'agregarElemento'; elemento: Elemento }
  | { op: 'quitarElemento'; id: string }
  | { op: 'moverElemento'; id: string; delta: V3 };

// ───────────── 3.7 Resultado ─────────────
export interface Puerto {
  id: string;
  estructuraId: string;
  tipo: 'cara' | 'extremo' | 'base' | 'tope';
  etiqueta: string;
  p0: V3;
  p1: V3;
  normal: V3;
  /** Dirección p0 → p1. */
  d: V3;
  largo: number;
  /** Posiciones (m desde p0 hacia p1) donde hay verticales. */
  cols: number[];
  altura: number;
}

export interface UnionResuelta {
  id: string;
  tipo: 'estructura' | 'esquina';
  modo: string;
  estructuraId?: string;
  a: { estructuraId: string; puerto?: string; s?: number; frente?: number };
  b: { estructuraId: string; puerto?: string; frente?: number };
  etiqueta: string;
  editable: boolean;
  alternar: Accion | null;
  compartidas: number;
  nombreA?: string;
  nombreB?: string;
  apoyado?: string;
  soporte?: string;
}

export interface EstructuraResuelta {
  id: string;
  nombre: string;
  tipologia: string;
  esqueleto: Esqueleto;
  marco: { origen: V2; rumbo: number };
  m2: number;
  ml: number;
  alturaReal: number;
  huella: Poligono;
  apoyaEn: string[];
  regenerable: boolean;
  /** §11: datos propios de la tipología para la UI (frentes, relleno, gálibo…). */
  info: Record<string, unknown>;
}

export interface CeldaResuelta {
  id: string;
  estructuraId: string;
  tipo: 'cara' | 'pano';
  esquinas: V3[];
  vanoId?: string;
  panoId?: string;
  k: number;
  estado: 'ok' | 'aviso' | 'error';
  /** §11: cara del vano (para el alzado). */
  cara?: Vano['cara'];
  /** §11: lo que tiene la celda (resumen para overlays). */
  contenido?: { plataforma: boolean; diagonal: boolean; baranda: boolean; abertura: boolean; cerramiento: string | null; override: boolean };
}

export interface Resultado {
  piezas: Pieza[];
  bom: LineaBom[];
  avisos: Aviso[];
  reglas: Regla[];
  estructuras: EstructuraResuelta[];
  celdas: CeldaResuelta[];
  puertos: Puerto[];
  uniones: UnionResuelta[];
  resumen: {
    m2: number;
    ml: number;
    alturaMax: number;
    pesoKg: number;
    pesoParcial: boolean;
    codigosSinPeso: string[];
    sinCodigo: { clave: string; familia: Familia; medidas: Medidas; cantidad: number }[];
    piezas: number;
    piezasAjuste: number;
    anclajes: number;
    faltantesStock: { codigo: string; falta: number }[];
    modoBom: ModoBom;
    etiqueta: 'PREDIMENSIONADO';
    catalogoFuente: 'base' | 'fixture';
    texto: string;
  };
  ms: number;
}
