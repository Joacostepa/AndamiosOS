/**
 * Volúmenes de referencia (el edificio y sus obstáculos) dibujados a partir de medidas.
 * Se guardan en `diseno.contexto.volumenes` como `VolumenModelado`: un `Volumen` del contrato (planta, cotas)
 * más su definición paramétrica `def` y la versión `defVersion`. Las tipologías y el núcleo leen solo los
 * campos de `Volumen`; la UI y este módulo leen `def`. Coordenadas de MUNDO (x, z), y arriba, metros.
 */
import type { Poligono, V2, Volumen } from '../tipos.ts';

export const VERSION_VOLUMENES = 1;

/** Hueco o patio dentro de un cuerpo (aire luz, patio interno, pulmón de manzana). */
export interface HuecoDef {
  nombre?: string;
  planta: Poligono;
  /** default: base del cuerpo */
  yBase?: number;
  /** default: tope del cuerpo */
  yTope?: number;
}

export interface TramoEscalonado {
  /** cota superior del tramo */
  hasta: number;
  /** retranqueo respecto de la planta base: un número (todos los lados) o uno por lado (0 = al ras, p. ej. medianeras) */
  retiro: number | number[];
}

export type ClaseSaliente = 'balcon' | 'marquesina' | 'cornisa';

export type DefVolumen =
  /** Caja de largo × ancho × alto, con el primer lado sobre la línea municipal (origen, rumbo). */
  | { tipo: 'caja'; origen: V2; rumbo: number; largo: number; ancho: number; alto: number; yBase?: number; medianeras?: number[]; huecos?: HuecoDef[] }
  /** Prisma de planta poligonal + altura. */
  | { tipo: 'prisma'; planta: Poligono; alto: number; yBase?: number; medianeras?: number[]; huecos?: HuecoDef[] }
  /** Volumen escalonado: tramos con retranqueos por piso respecto de la planta base. */
  | { tipo: 'escalonado'; planta: Poligono; tramos: TramoEscalonado[]; yBase?: number; medianeras?: number[]; huecos?: HuecoDef[] }
  /** Cilindro (tanque, torre, columna) con cúpula opcional. */
  | { tipo: 'cilindro'; centro: V2; radio: number; alto: number; yBase?: number; lados?: number; cupula?: { alto: number } | null; clase?: 'tanque' | 'torre' | 'columna' | 'cupula' }
  /** Saliente pegado a un lado de otro volumen: balcón, marquesina o cornisa, con su vuelo y altura. */
  | {
      tipo: 'saliente'; padre: string; lado: number; desde: number; largo: number; vuelo: number; yBase: number; espesor: number;
      clase: ClaseSaliente;
      /** antepecho/baranda del balcón por encima de la losa (default 1,00 en balcón, 0 en el resto) */
      antepecho?: number;
      /** repetir hacia arriba (balcones de cada piso) */
      repetir?: { cada: number; hasta: number } | null;
    };

export interface VolumenModelado extends Volumen {
  def: DefVolumen;
  defVersion: number;
}

/** Prisma resuelto (lo que se dibuja en 3D y contra lo que se chequean los choques). */
export interface Solido {
  id: string;
  volumenId: string;
  planta: Poligono;
  yBase: number;
  yTope: number;
  rol: 'cuerpo' | 'tramo' | 'saliente' | 'cupula' | 'hueco';
  clase?: string;
}

/** Cara vertical de un volumen donde se puede «modelar arriba» (crear una fachada). */
export interface Cara {
  /** `${volumenId}:${solido}:${lado}` */
  id: string;
  volumenId: string;
  solidoId: string;
  lado: number;
  /** extremos en planta, en el sentido del polígono (antihorario) */
  a: V2;
  b: V2;
  /** normal hacia afuera (o hacia el patio en un hueco) */
  normal: V2;
  largo: number;
  yBase: number;
  yTope: number;
  /** rumbo de una fachada sobre esta cara (recorre de b a a, con el edificio a la derecha) */
  rumbo: number;
  tipo: 'pared' | 'saliente' | 'curva' | 'patio';
  medianera: boolean;
  /**
   * Si los tramos de arriba siguen al ras solo en una parte del lado, la altura cambia a lo largo de la cara:
   * tramos medidos desde `a` hacia `b` con su cota superior (la fachada los arma como frentes alineados).
   */
  tramosAltura?: { desde: number; hasta: number; yTope: number }[];
}
