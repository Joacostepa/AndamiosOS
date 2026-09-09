export type { ObraEnMapa } from "@/lib/odoo/mapa-obras";
import type { ObraEnMapa } from "@/lib/odoo/mapa-obras";

// Los tramos de antigüedad son EL canal de color del mapa, y viven acá porque los usan tres
// cosas que tienen que coincidir: el punto, la leyenda y los chips de filtro. Con la escala
// repetida en cada componente, el día que alguien mueva un corte quedan diciendo cosas
// distintas sobre los mismos datos.
//
// Los cortes salen de la distribución real (85 obras armadas al 09/09/2026: mediana 56
// días, máximo 168), no de números redondos inventados:
//
//   · hasta 30  — dentro de lo normal, casi todas las obras pasan por acá
//   · 31 a 90   — larga pero esperable en fachadas y obra pública
//   · más de 90 — o es una renta muy buena, o nadie se acordó de bajarla
//
// El tercer tramo es el que justifica la pantalla: hoy no hay ningún lugar donde se vea.

export type TramoAntiguedad = "reciente" | "media" | "larga" | "sinFecha";

export const TRAMOS: Record<TramoAntiguedad, { label: string; color: string; corto: string }> = {
  reciente: { label: "Hasta 30 días", color: "#1F9D6B", corto: "≤30d" },
  media: { label: "31 a 90 días", color: "#D9A21B", corto: "31-90d" },
  larga: { label: "Más de 90 días", color: "#D1495B", corto: ">90d" },
  sinFecha: { label: "Sin fecha de armado", color: "#8A8F98", corto: "s/f" },
};

export function tramoDe(diasArmado: number | null): TramoAntiguedad {
  if (diasArmado == null) return "sinFecha";
  if (diasArmado <= 30) return "reciente";
  if (diasArmado <= 90) return "media";
  return "larga";
}

export function antiguedadDe(diasArmado: number | null) {
  return TRAMOS[tramoDe(diasArmado)];
}

/** "56 días" / "1 día" / "hoy". Sin fecha se dice, no se inventa un cero. */
export function textoDias(diasArmado: number | null): string {
  if (diasArmado == null) return "sin fecha de armado";
  if (diasArmado <= 0) return "armada hoy";
  return `${diasArmado} ${diasArmado === 1 ? "día" : "días"} armada`;
}

export function contarPorTramo(obras: ObraEnMapa[]): Record<TramoAntiguedad, number> {
  const base: Record<TramoAntiguedad, number> = { reciente: 0, media: 0, larga: 0, sinFecha: 0 };
  for (const o of obras) base[tramoDe(o.diasArmado)]++;
  return base;
}
