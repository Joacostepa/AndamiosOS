// Volúmenes de referencia: dibujar el edificio y los obstáculos desde medidas, modelar arriba, choques y mover.
export * from './tipos.ts';
export { normalizarDef, solidosDe, carasDe, volumenDesdeDef, desplazarLados, rectanguloCaja, circulo, dentroSolido } from './geometria.ts';
export { agregarVolumen, actualizarVolumen, quitarVolumen, migrarVolumenes } from './crear.ts';
export { carasDelDiseno, buscarCara, cadenaContorno, propuestaParaCara, agregarEnCara } from './frentes.ts';
export type { OpcionesCara, Propuesta } from './frentes.ts';
export { detectarChoques, avisosDeChoque, accionesRetiro } from './choques.ts';
export type { Choque } from './choques.ts';
export { volumenesCompatibles, volumenSugerido, vincularVolumenSugerido } from './sugerido.ts';
export type { TipoVolumen } from './sugerido.ts';
export {
  grupoDeMovimiento, movilidadDe, limitarDelta, moverDef, moverVolumen, inferirEje, proyectar, puntoEnEje, formaMovil,
  candidatosEncastre, encastrar, encastrarCota, deltaPorDistancia, distanciaMovimiento, nombreMovimiento,
} from './mover.ts';
export type { EjeMovimiento, EjePlano, Movilidad, EncastreVolumen, CandidatosEncastre } from './mover.ts';
