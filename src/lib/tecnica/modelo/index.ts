// Barril público del núcleo del modelador. A, B y C importan SOLO de acá (o de tipos.ts).
export * from './tipos.ts';
export { VERSION_MOTOR, ESQUEMA_DISENO, PREDIMENSIONADO, SIMPLIFICACIONES } from './constantes.ts';
export { CRITERIOS, VUELOS_MENSULA, VUELO_MENSULA_DEFECTO, vueloMensula } from './criterios.ts';
export type { Criterios } from './criterios.ts';
export { construir, generarTodas } from './construir.ts';
export { calcularBom, GRUPO_AJUSTE } from './bom.ts';
export { rellenarLargo, textoVanos, textoTramos } from './medida/rellenar.ts';
export {
  crearDiseno, agregarEstructura, quitarEstructura, setParam, setOverride, editarEsqueleto,
  convertirALibre, cambiarSistema, aplicarReparacion, unir, buscarSnap, puertosDe, migrarDiseno,
  instanciarPlantilla, validarDiseno, ejemploParana631,
} from './diseno.ts';
export type { OpcionesEstructura } from './diseno.ts';
export type { Snap } from './uniones/unir.ts';
export { TIPOLOGIAS, tipologia, presetsGaleria, presetPorId } from './tipologias/indice.ts';
export type { PresetGaleria } from './tipologias/indice.ts';
export type { Tipologia, Campo, Preset, CtxGenerar, Generado, Relaciones } from './tipologias/registro.ts';
export type { Catalogo, ItemCatalogo, EntradaMapa, MedidasCatalogo } from './catalogo/catalogo.ts';
export { catalogoVacio, medidasPorDefecto, resolverCodigo } from './catalogo/catalogo.ts';
export { CATALOGO_FIXTURE, CODIGOS_PLAUSIBLES } from './catalogo/fixture.ts';
export { aplicarOpEsqueleto } from './esqueleto/operaciones.ts';
export { validarEsqueleto } from './esqueleto/validar.ts';
export { celdaId, panoCeldaId, nodoId, partirClave } from './esqueleto/esqueleto.ts';
export { fusionarNodos } from './fusionar.ts';
export { fmt } from './util.ts';
// Volúmenes de referencia (edificio y obstáculos desde medidas, modelar arriba, choques).
export * from './volumenes/index.ts';
