// Mapeo del modelo del spec (3 estados visuales) sobre el enum estado_computo (6 valores).
// No se modifica la BD: se traduce el estado real a un "bucket" para la UI.

export type ComputoBucket = "en_proceso" | "completado";

// Estados que cuentan como cómputo confirmado por Oficina Técnica.
const ESTADOS_COMPLETADOS = new Set([
  "verificado",
  "aprobado",
  "en_preparacion",
  "preparado",
]);

export function bucketDeComputo(estado: string): ComputoBucket {
  return ESTADOS_COMPLETADOS.has(estado) ? "completado" : "en_proceso";
}

export function esCompletado(estado: string): boolean {
  return bucketDeComputo(estado) === "completado";
}

// Estado al que pasa el cómputo cuando Oficina Técnica hace "Confirmar cómputo".
export const ESTADO_AL_CONFIRMAR = "verificado";

// Tokens de marca por bucket (hex del spec) para bordes/badges de las cards del Home.
export const BUCKET_TOKENS = {
  pendiente: {
    borde: "#EF9F27",
    badgeBg: "#FAEEDA",
    badgeText: "#854F0B",
    iconColor: "#BA7517",
  },
  en_proceso: {
    borde: "#378ADD",
    badgeBg: "#E6F1FB",
    badgeText: "#185FA5",
    barra: "#378ADD",
  },
  completado: {
    borde: "#639922",
    badgeBg: "#EAF3DE",
    badgeText: "#3B6D11",
    botonBorde: "#C0DD97",
  },
} as const;

type ItemConCategoria = { cantidad: number; categoria: string };

// Progreso del spec: (categorías con ≥1 ítem cargado / total de categorías) * 100.
export function progresoComputo(
  items: ItemConCategoria[],
  totalCategorias: number,
): number {
  if (totalCategorias <= 0) return 0;
  const categoriasConItems = new Set(
    items.filter((i) => i.cantidad > 0).map((i) => i.categoria),
  );
  return Math.round((categoriasConItems.size / totalCategorias) * 100);
}
