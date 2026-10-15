// Calculador de Datos y definiciones (/direccion/datos).
//
// Qué calcula: el registro de calidad de los datos (avisos automáticos de calidad.ts +
// manuales de direccion_avisos_calidad) y la confianza de HOY de cada indicador del
// diccionario según esos avisos. El diccionario en sí es fijo (diccionario.ts) y las metas
// son por usuario (leerPropios, fuera de la caché): no pasan por acá.
//
// Los avisos de retiros van marcados `reservado` y su efecto en la confianza va en
// `detalle.reservado`: servidor.ts los recorta a quien no tiene direccion-socios.

import type { Aviso, MarcaConfianza, NivelAviso } from "../tipos.ts";
import { definirCalculador } from "./contrato.ts";
import { calcularCalidad } from "./calidad.ts";
import { contarAvisos, ordenarAvisos } from "./calidad-reglas.ts";
import { inicioHistoria } from "./socios.ts";

export type DetalleDatos = {
  /** Confianza de hoy por indicador (id del diccionario). Sin entrada = la del diccionario. */
  confianza: Record<string, MarcaConfianza>;
  /** Detectores que no se pudieron correr (Odoo no respondió esa parte). */
  sinRevisar: string[];
  /** false = todavía no existe la tabla de avisos manuales (no se pueden cargar). */
  manualesDisponibles: boolean;
  /** Sólo socios: la confianza que sale de avisos reservados (retiros). */
  reservado?: { confianza: Record<string, MarcaConfianza> };
};

export const calculador = definirCalculador<DetalleDatos>({
  pantalla: "datos",
  async calcular(ctx) {
    const c = await calcularCalidad(ctx, inicioHistoria(ctx));
    return {
      cifras: [],
      detalle: {
        confianza: c.confianza,
        sinRevisar: c.sinRevisar,
        manualesDisponibles: c.manualesDisponibles,
        ...(Object.keys(c.confianzaReservada).length ? { reservado: { confianza: c.confianzaReservada } } : {}),
      },
      avisos: c.avisos,
    };
  },
});

// ─── Para La semana ─────────────────────────────────────────────────────────────────────

export type ResumenCalidad = {
  /** TODOS los avisos, ⚠ primero, con su `reservado`. El panel muestra los primeros 6 de los que lleguen. */
  avisos: Aviso[];
  /** Cuántos hay de cada nivel. */
  conteo: Record<NivelAviso, number>;
  /** Confianza de hoy por indicador, para las tarjetas (MarcaConfianza). */
  confianza: Record<string, MarcaConfianza>;
};

/**
 * Lo que La semana toma de Datos para el panel de Calidad y para la marca de confianza de
 * sus tarjetas. Conserva el `reservado` de cada aviso: el servidor recorta después.
 *
 *   const d = await ctx.pantalla<DetalleDatos>("datos");
 *   const cal = resumenCalidad(d);
 *   avisos.push(...cal.avisos);              // la UI corta a 6 DESPUÉS del recorte de reservados
 *
 * El conteo incluye los reservados: si se muestra, calcularlo en el cliente sobre los
 * avisos que llegaron (ya recortados), no mandarlo desde el servidor.
 */
export function resumenCalidad(r: { avisos: Aviso[]; detalle: DetalleDatos }): ResumenCalidad {
  const ordenados = ordenarAvisos(r.avisos);
  return { avisos: ordenados, conteo: contarAvisos(ordenados), confianza: r.detalle.confianza };
}
