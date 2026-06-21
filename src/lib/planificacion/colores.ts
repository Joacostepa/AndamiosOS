// Tokens de color del módulo Planificación (hex literales del spec ABA).

export type TipoOtKey = "armado" | "desarme" | "mantenimiento" | "adicional" | "bloqueado";

// Color por tipo de OT (consistente con la tabla del spec).
export const TIPO_OT_TOKENS: Record<
  TipoOtKey,
  { bg: string; borde: string; text: string; label: string }
> = {
  armado: { bg: "#E6F1FB", borde: "#378ADD", text: "#0C447C", label: "Armado" },
  desarme: { bg: "#FAEEDA", borde: "#EF9F27", text: "#633806", label: "Desarme" },
  mantenimiento: { bg: "#EAF3DE", borde: "#639922", text: "#27500A", label: "Mantenimiento" },
  adicional: { bg: "#FBEAF0", borde: "#E06090", text: "#72243E", label: "Adicional" },
  bloqueado: {
    bg: "var(--color-background-secondary, var(--secondary))",
    borde: "var(--color-border-secondary, var(--border))",
    text: "var(--color-text-tertiary, var(--muted-foreground))",
    label: "Bloqueado",
  },
};

// Color de la barra de capacidad por porcentaje ocupado.
export function capacidadColor(pct: number): string {
  if (pct >= 100) return "#D85A30"; // coral — completa/sobreasignada
  if (pct >= 50) return "#EF9F27"; // ámbar
  return "#639922"; // verde
}

// Color del dot de estado de la jornada.
export function dotColor(estado: string): string {
  return estado === "completa" ? "#639922" : "#EF9F27";
}

// Marca ABA.
export const CORAL = "#D85A30";
export const ACENTO_BG = "#FAECE7";
export const ACENTO_TEXT = "#993C1D";
// Avatar de camión (azul).
export const CAMION_BG = "#E6F1FB";
export const CAMION_TEXT = "#185FA5";
