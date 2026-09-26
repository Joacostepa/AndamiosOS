// De las filas de cotizacion_parametros a Tarifas.
//
// Un solo lugar sabe qué clave de la base es qué número del dominio. Si falta una clave (la
// borró alguien, o una migración nueva todavía no se aplicó) esto CORTA con la lista de lo
// que falta: cotizar con una tarifa en cero es peor que no cotizar.

import type { Rango, Tarifas } from "./tipos.ts";

export type FilaParametro = {
  clave: string;
  tipo: string;
  valor: number | null;
  valor_min: number | null;
  valor_max: number | null;
  texto?: string | null;
};

export function tarifasDesdeParametros(filas: FilaParametro[]): Tarifas {
  const porClave = new Map(filas.map((f) => [f.clave, f]));
  const faltan: string[] = [];

  const v = (clave: string): number => {
    const f = porClave.get(clave);
    if (!f || f.valor === null || f.valor === undefined || Number.isNaN(Number(f.valor))) {
      faltan.push(clave);
      return 0;
    }
    return Number(f.valor);
  };
  const r = (clave: string): Rango => {
    const f = porClave.get(clave);
    if (!f || f.valor_min === null || f.valor_max === null) {
      faltan.push(clave);
      return { min: 0, max: 0 };
    }
    return { min: Number(f.valor_min), max: Number(f.valor_max) };
  };

  const tarifas: Tarifas = {
    ivaPct: v("iva_pct"),
    validezDias: v("validez_dias"),
    periodoMinimoDias: v("periodo_minimo_dias"),
    renovacionObraPct: v("renovacion_obra_pct"),
    renovacionAlquilerPuroPct: v("renovacion_alquiler_puro_pct"),
    corteMoPct: v("corte_mo_pct"),
    plazoInicioDiasHabiles: v("plazo_inicio_dias_habiles"),
    bandeja: {
      m3: v("bandeja_3m_ml"),
      m6: r("bandeja_6m_ml"),
      m8: v("bandeja_8m_ml"),
      minimoMl: v("bandeja_minimo_ml"),
      concertinaPct: v("concertina_pct"),
    },
    fachada: {
      lista: v("fachada_lista_m2"),
      licitacion: v("fachada_licitacion_m2"),
      estandar: r("fachada_estandar_m2"),
      escaleras: v("fachada_escaleras_m2"),
      completa: r("fachada_completa_m2"),
      compleja: r("fachada_compleja_m2"),
      especial: r("fachada_especial_m2"),
      saltoAPct: v("fachada_salto_altura_a_pct"),
      saltoBPct: v("fachada_salto_altura_b_pct"),
    },
    alquiler: {
      recargoListaPct: v("alquiler_recargo_lista_pct"),
      fueraListaPct: v("alquiler_fuera_lista_pct"),
    },
    venta: {
      amortizacionAMeses: v("venta_amortizacion_a_meses"),
      amortizacionBMeses: v("venta_amortizacion_b_meses"),
    },
    complementarios: {
      gestoriaCaba: v("gestoria_caba"),
      mediaSombraM2: v("media_sombra_m2"),
      fenolicoM2: v("fenolico_18mm_m2"),
      ingenieria: r("ingenieria"),
      ingenieriaTorreSimple: v("ingenieria_torre_simple"),
      syh: r("syh"),
      fleteGbaCercano: v("flete_gba_cercano"),
      fleteCaba: r("flete_caba"),
      fleteLaPlata: v("flete_la_plata"),
    },
    manoObra: {
      personaJornada: v("uocra_persona_jornada"),
      recargoEstandarPct: v("mo_recargo_estandar_pct"),
      recargoAltoPct: v("mo_recargo_alto_pct"),
      industriaCuadrilla: v("mo_industria_cuadrilla"),
      cuadrillaPersonas: v("mo_cuadrilla_personas"),
      sabadoPct: v("recargo_sabado_pct"),
      domingoPct: v("recargo_domingo_pct"),
      nocturnoPct: r("recargo_nocturno_pct"),
      adversasPct: v("recargo_adversas_pct"),
      productividad: [
        { hastaM: 10, factor: v("productividad_hasta_10m") },
        { hastaM: 20, factor: v("productividad_10_20m") },
        { hastaM: 30, factor: v("productividad_20_30m") },
        { hastaM: 40, factor: v("productividad_30_40m") },
        { hastaM: Infinity, factor: v("productividad_mas_40m") },
      ],
    },
    viaticos: {
      viajePct: v("viaje_jornada_pct"),
      alojamientoNoche: v("alojamiento_persona_noche"),
      comidaDia: v("comida_persona_dia"),
      minimoDias: v("movilizacion_minimo_dias"),
    },
  };

  if (faltan.length) {
    throw new Error(`Faltan parámetros de cotización: ${faltan.join(", ")}. Revisá Comercial → Parámetros de cotización.`);
  }
  return tarifas;
}
