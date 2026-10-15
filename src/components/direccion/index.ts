// Componentes comunes de Dirección. Contrato y ejemplos: docs/direccion/implementacion.md.
export { DireccionProvider, useDiccionario, useDireccion, useFormato, useMoneda, useQueryMoneda } from "./contexto";
export { EncabezadoDireccion, PestanasDireccion, ToggleMoneda, AvisoSinAcceso } from "./encabezado";
export { BarraInferior } from "./barra-inferior";
export { TarjetaPregunta, TarjetaPreguntaCompacta, TarjetaCifra, FilaCifras } from "./tarjetas";
export { BotonDefinicion, DefinicionIndicador } from "./boton-definicion";
export { PanelDesglose } from "./panel-desglose";
export { BarraTramos, Ranking, type Tramo, type FilaRanking } from "./barras";
export { EstadoVacio, EstadoSinDatos, BandaOdooCaido, LecturaPantalla } from "./estados";
export { ChipComparacion, MarcaConfianza, PuntoMeta, ValorCifra, TextoFrase } from "./piezas";
export { MarcoPantalla } from "./marco-pantalla";
export { EnConstruccion } from "./en-construccion";
