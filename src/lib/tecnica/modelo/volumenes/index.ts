// Volúmenes de referencia: dibujar el edificio y los obstáculos desde medidas, modelar arriba y choques.
export * from './tipos.ts';
export { normalizarDef, solidosDe, carasDe, volumenDesdeDef, desplazarLados, rectanguloCaja, circulo, dentroSolido } from './geometria.ts';
export { agregarVolumen, actualizarVolumen, quitarVolumen, migrarVolumenes } from './crear.ts';
export { carasDelDiseno, buscarCara, cadenaContorno, propuestaParaCara, agregarEnCara } from './frentes.ts';
export type { OpcionesCara, Propuesta } from './frentes.ts';
export { detectarChoques, avisosDeChoque, accionesRetiro } from './choques.ts';
export type { Choque } from './choques.ts';
