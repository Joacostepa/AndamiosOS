// Chequeos de razonabilidad antes de emitir (criterio §8). No cambian números: avisan.

import { numero, pesos, type Aviso, type Linea, type Tarifas } from "./tipos.ts";
import type { Totales } from "./totales.ts";

export function chequear(lineas: Linea[], totales: Totales, t: Tarifas): Aviso[] {
  const avisos: Aviso[] = [];
  const base = lineas.filter((l) => l.seccion === "base");

  if (base.length === 0) {
    avisos.push({ nivel: "bloqueo", codigo: "sin_oferta", texto: "La oferta no tiene ninguna línea base." });
    return avisos;
  }

  // 1. $/m² de fachada contra los comparables.
  const fachada = base.find((l) => l.producto === "fachada_m2");
  if (fachada && fachada.cantidad > 0) {
    const efectivo = fachada.importe / fachada.cantidad;
    if (efectivo < t.fachada.licitacion) {
      avisos.push({ nivel: "advertencia", codigo: "m2_bajo", texto: `El $/m² efectivo (${pesos(efectivo)}) queda por debajo del piso de licitación (${pesos(t.fachada.licitacion)}): revisá el cómputo o explicitá por qué.` });
    } else if (efectivo > t.fachada.especial.max) {
      avisos.push({ nivel: "advertencia", codigo: "m2_alto", texto: `El $/m² efectivo (${pesos(efectivo)}) supera el techo de obras especiales (${pesos(t.fachada.especial.max)}): si se justifica, explicitalo en la propuesta.` });
    }
  }

  // 3. Peso de la mano de obra — y la regla de corte del §1.
  if (totales.pesoManoDeObraPct !== null && totales.pesoManoDeObraPct > t.corteMoPct) {
    avisos.push({
      nivel: "advertencia",
      codigo: "mo_pesada",
      texto: `La mano de obra es el ${numero(totales.pesoManoDeObraPct, 1)} % del primer mes (más del ${numero(t.corteMoPct)} %): revisá las jornadas, que son la estimación más frágil, y si corresponde abrí mano de obra por única vez + alquiler mensual.`,
    });
  }

  // 6. La renovación tiene que salir del canon, no del subtotal.
  if (totales.renovacion && totales.renovacion.base !== totales.canonLocativo) {
    avisos.push({ nivel: "advertencia", codigo: "renovacion_base", texto: `La renovación se está calculando sobre ${pesos(totales.renovacion.base)} y el canon locativo es ${pesos(totales.canonLocativo)}: confirmá que es a propósito.` });
  }

  // Desvíos de tarifa: la razón va a la nota de la orden (§10).
  const desvios = lineas.filter((l) => l.desvio);
  if (desvios.length) {
    avisos.push({
      nivel: "info",
      codigo: "desvios",
      texto: `Precios fuera de tarifa (quedan en la nota de la orden): ${desvios.map((l) => `${l.descripcion.split(" — ")[0]} (${l.desvio!.motivo})`).join("; ")}.`,
    });
  }

  // Líneas manuales sin motivo: el criterio no es recuperable después.
  for (const l of lineas.filter((x) => x.grupo === "manual" && !x.desvio?.motivo)) {
    avisos.push({ nivel: "bloqueo", codigo: "manual_sin_motivo", texto: `«${l.descripcion}» es un precio cargado a mano: falta el motivo.` });
  }

  return avisos;
}
