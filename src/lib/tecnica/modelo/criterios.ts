/**
 * Criterios ⚠ provisorios (propuesta-recomendada.md §2.7). Sin firma: `firmado: false`.
 * La UI los muestra con ⚠ y todo el resultado dice PREDIMENSIONADO.
 */
export const CRITERIOS = Object.freeze({
  firmado: false as boolean,
  diagonalCadaVanos: 5,
  /** Bandas más bajas que esto no llevan diagonal (p. ej. la banda de 0,50 bajo la bandeja). */
  diagonalAltoMin: 1.0,
  anclajeDx: 2,
  anclajeDn: 2,
  anclajeMinimo: 5,
  /** Lado fachada sin baranda si el retiro es ≤ 0,30. */
  retiroLibre: 0.3,
  galiboPeatonal: 2.5,
  pasoPeatonal: 1.2,
  galiboVehicular: 4.5,
  /** Longitud libre máxima de vertical entre horizontales. */
  libreVerticalMax: 2.0,
  /** Con vía pública, travesaños intermedios de PB solo por encima de esta cota. */
  libreBajoTravesano: 2.0,
  /** Arranque útil del tornillón; por encima se avisa. */
  arranqueMax: 0.6,
  arranqueMin: 0.25,
  /** Extensión máxima del tornillón (medida libre y apoyos escalonados). */
  tornillonMax: 0.75,
  /** Hasta acá alcanza el caño de amarre del anclaje químico. */
  retiroAmarreCorto: 0.45,
  hbMax: 3,
  hbMovilInterior: 3.5,
  hbMovilExterior: 3,
  accesoCadaMl: 25,
  toleranciaRelleno: 0.1,
  anchoTablon: 0.32,
  /** Medida libre: tramo de caño y grampa mínimo y máximo. */
  tramoLibreMin: 0.2,
  /** Medida libre: el vano de ajuste con columnas propias no baja de esto (si sobra menos, se reacomoda). */
  vanoLibreMin: 0.73,
  tramoLibreMax: 2.5,
  /** Vuelo del caño más allá de la grampa en cada punta. */
  vueloGrampa: 0.15,
  /** Solape máximo de un tablón de catálogo sobre un vano libre. */
  solapeTablonMax: 0.5,
  /** Carga de diseño provisoria de una bandeja (peso propio + escombro), kN/m² ⚠. Solo para predimensionar. */
  cargaBandeja: 1.5,
  pasoRoseta: 0.5,
  pasoNivel: 2.0,
});

export type Criterios = typeof CRITERIOS;
