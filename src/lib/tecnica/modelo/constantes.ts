/** Constantes del núcleo del modelador. Todo cálculo es PREDIMENSIONADO. */
export const VERSION_MOTOR = '1.0.0';
/** Versión del JSON de Diseno. La maqueta era 1. */
export const ESQUEMA_DISENO = 2;
export const PREDIMENSIONADO = 'PREDIMENSIONADO' as const;

export const SIMPLIFICACIONES: string[] = [
  'Reglas ⚠ provisorias y sin firma (diagonales cada ≤5 vanos, anclajes al tresbolillo 2×2, tablones por ancho).',
  'Niveles cada 2,00 m sobre la grilla de rosetas de 0,50. El arranque se regula con el tornillón entre 0,25 y 0,75.',
  'Diagonales roseta a roseta: una por vano y banda, alternando el sentido en altura (zigzag).',
  'Medida libre: lo que no es de catálogo se arma con caño y grampa y se muestra como ajuste.',
  'Bastidor 1,30 × 1,80 (supuesto Odoo). Kit = 1 bastidor + 2 riendas H + 2 riendas D (supuesto).',
  'Pesos y códigos salen del catálogo. Lo que no tiene peso va «sin peso» y lo que no tiene código va «sin código».',
  'Semáforo solo geométrico: H/B, gálibo, paso, diagonales y anclajes. No hay verificación estructural.',
];
