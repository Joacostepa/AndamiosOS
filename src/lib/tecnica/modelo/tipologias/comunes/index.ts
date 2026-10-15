// Helpers para tipologías (los hace el núcleo; las tipologías nuevas los usan y no los modifican).
export { grillaRect, grillaPoligono, cotasNiveles } from './grilla.ts';
export type { GrillaRect, GrillaPoligono, OpcionesGrillaRect, OpcionesGrillaPoligono, CotasNiveles } from './grilla.ts';
export { visera, bandeja } from './visera.ts';
export type { OpcionesVisera } from './visera.ts';
export { vigaCelosia } from './viga-celosia.ts';
export { ruedas, estabilizadores } from './ruedas.ts';
export { escaleraInterior } from './escalera-interior.ts';
export { apoyoEscalonado, muestrearEscalera } from './apoyo-escalonado.ts';
export { colgar } from './colgar.ts';
export { poligonoCirculo, antihorario, rectangulo } from './poligono.ts';
export { puerto, puertosCaja, primViga, elegirViga, avisoEsbeltez } from './util-tipologias.ts';
export { tiraBastidor } from './tira-bastidor.ts';
