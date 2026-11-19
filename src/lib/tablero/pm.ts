// El PM (project manager) de cada obra: lo puro, que comparten la ruta, el tablero y los tests.
//
// Pedido de JS (19/11/2026): Augusto y Juani, de Oficina Técnica, se reparten las obras que
// vienen y uno queda como PM. Que no se pisen y que Operaciones lo vea. Se guarda en
// plan_pm_ot (migración 20261119000001); diseño en docs/oficina-tecnica/proyectos/.

import { diasHabilesEntre, type Feriados } from "./dias-habiles.ts";

/** El PM de una obra, como viaja a la pantalla. */
export type PmDeObra = {
  otId: number;
  pmId: string;
  pmNombre: string;
  asignadoEl: string;
  /** Quién la asignó: el mismo PM al tomarla, u Operaciones. null si se borró el usuario. */
  asignadoPorNombre: string | null;
};

/** Alguien que puede ser PM: tiene "PM de obras" en «editar» en su perfil. */
export type CandidatoPm = { id: string; nombre: string };

/**
 * ¿Esta OT lleva PM? Todo menos el desarme (JS, 19/11: "desarmes parciales también, armados
 * parciales también; lo único que no llevaría es si dice Desarme"). Una tarea del tablero no
 * es una OT y no llega acá.
 */
export function llevaPm(tipo: string | null | undefined): boolean {
  return tipo !== "desarme";
}

/**
 * Cuántos días hábiles faltan para que una obra sin PM arranque y todavía se avisa en rojo.
 * Con 2: la obra que arranca pasado mañana, mañana, hoy, o que ya arrancó sin PM.
 */
export const DIAS_AVISO_SIN_PM = 2;

/**
 * ¿La obra está por arrancar (o ya arrancó) sin PM? `primerDia` es la primera jornada
 * planificada; sin ella no hay apuro que medir.
 */
export function sinPmUrgente(primerDia: string | null | undefined, hoy: string, feriados: Feriados): boolean {
  if (!primerDia) return false;
  return diasHabilesEntre(hoy, primerDia, feriados) <= DIAS_AVISO_SIN_PM;
}

/** "Augusto", "Juan Ignacio": el nombre como se muestra en la tarjeta. */
export function nombrePm(nombre: string | null | undefined): string {
  const limpio = (nombre ?? "").trim();
  return limpio || "Sin nombre";
}

/**
 * Lo que la tarjeta del tablero muestra en modo PM, en el segundo renglón. Sólo en obras que
 * llevan PM; el resto se atenúa.
 */
export type PmEnTarjeta = {
  /** null = sin PM. */
  nombre: string | null;
  /** El PM es quien mira: dice "vos". */
  esMio: boolean;
  /** Sin PM y arranca en DIAS_AVISO_SIN_PM días hábiles o menos (o ya arrancó): en rojo. */
  urgente: boolean;
  /** "Tomar" de un clic. null = quien mira no es PM (Operaciones asigna desde el ⋮). */
  onTomar: (() => void) | null;
};

/** Una opción de la sección "Proyecto" del ⋮: tomar, asignar a…, pasar, soltar. */
export type AccionPm = { clave: string; etiqueta: string; onClick: () => void; quitar?: boolean };

/** Lo que la grilla necesita del modo PM. */
export type PmGrilla = {
  /** El modo PM está prendido: el renglón 2 dice el PM y lo que no lleva se atenúa. */
  activo: boolean;
  enTarjeta: (ot: { id: number; tipo: string } | undefined) => PmEnTarjeta | null;
  /** Las opciones del ⋮ para esa obra (en cualquier modo). null o vacío = sin sección. */
  acciones: (ot: { id: number; tipo: string; titulo: string } | undefined) => AccionPm[] | null;
};
