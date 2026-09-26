// Tarifas de prueba: los valores sembrados del criterio v2 (agosto 2026). Sólo para tests —
// pasan por tarifasDesdeParametros, así también se prueba el mapeo de claves.

import { tarifasDesdeParametros, type FilaParametro } from "./tarifas.ts";

const fila = (clave: string, valor: number | null, rango?: [number, number]): FilaParametro => ({
  clave,
  tipo: rango ? "rango" : "numero",
  valor: rango ? null : valor,
  valor_min: rango ? rango[0] : null,
  valor_max: rango ? rango[1] : null,
});

export const FILAS_AGO26: FilaParametro[] = [
  fila("iva_pct", 21), fila("validez_dias", 15), fila("periodo_minimo_dias", 30),
  fila("renovacion_obra_pct", 35), fila("renovacion_alquiler_puro_pct", 100), fila("corte_mo_pct", 50),
  fila("plazo_inicio_dias_habiles", 7),
  fila("bandeja_3m_ml", 140000), fila("bandeja_6m_ml", null, [175000, 210000]), fila("bandeja_8m_ml", 235000),
  fila("bandeja_minimo_ml", 10), fila("concertina_pct", 10),
  fila("fachada_lista_m2", 45000), fila("fachada_licitacion_m2", 35000), fila("fachada_estandar_m2", null, [40000, 45000]),
  fila("fachada_escaleras_m2", 50000), fila("fachada_completa_m2", null, [60000, 75000]),
  fila("fachada_compleja_m2", null, [80000, 95000]), fila("fachada_especial_m2", null, [122000, 124000]),
  fila("fachada_salto_altura_a_pct", 25), fila("fachada_salto_altura_b_pct", 44),
  fila("alquiler_recargo_lista_pct", 80), fila("alquiler_fuera_lista_pct", 7.5),
  fila("venta_amortizacion_a_meses", 36), fila("venta_amortizacion_b_meses", 24),
  fila("gestoria_caba", 350000), fila("media_sombra_m2", 3500), fila("fenolico_18mm_m2", 32000),
  fila("ingenieria", null, [1250000, 3500000]), fila("ingenieria_torre_simple", 750000), fila("syh", null, [1200000, 5500000]),
  fila("flete_gba_cercano", 850000), fila("flete_caba", null, [1200000, 2400000]), fila("flete_la_plata", 2500000),
  fila("uocra_persona_jornada", 118835), fila("mo_recargo_estandar_pct", 70), fila("mo_recargo_alto_pct", 100),
  fila("mo_industria_cuadrilla", 1150000), fila("mo_cuadrilla_personas", 5),
  fila("recargo_sabado_pct", 50), fila("recargo_domingo_pct", 100), fila("recargo_nocturno_pct", null, [50, 100]),
  fila("recargo_adversas_pct", 10),
  fila("productividad_hasta_10m", 1), fila("productividad_10_20m", 1.15), fila("productividad_20_30m", 1.3),
  fila("productividad_30_40m", 1.5), fila("productividad_mas_40m", 1.75),
  fila("viaje_jornada_pct", 60), fila("alojamiento_persona_noche", 95000), fila("comida_persona_dia", 50000),
  fila("movilizacion_minimo_dias", 2),
];

export const TARIFAS_AGO26 = tarifasDesdeParametros(FILAS_AGO26);
