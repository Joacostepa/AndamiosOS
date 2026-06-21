import type { TipoOtKey } from "./colores";

// Estado de la OT en el tablero (mapea estados reales de ordenes_trabajo al spec).
export type OtBucket = "habilitada" | "pendiente_hab" | "en_ejecucion" | "cerrada";

type OtLike = {
  estado: string;
  requiere_habilitacion: boolean;
  habilitacion_aprobada: boolean;
};

export function otBucket(ot: OtLike): OtBucket {
  if (ot.estado === "en_curso") return "en_ejecucion";
  if (ot.estado === "completada" || ot.estado === "cancelada") return "cerrada";
  // pendiente | programada → depende del gate de habilitación
  const habilitada = !ot.requiere_habilitacion || ot.habilitacion_aprobada;
  return habilitada ? "habilitada" : "pendiente_hab";
}

export function otEsArrastrable(ot: OtLike): boolean {
  return otBucket(ot) === "habilitada";
}

// Tipo real de OT (+ es_adicional) → clave de color del spec.
export function tipoOtKey(tipo: string, esAdicional: boolean): TipoOtKey {
  if (esAdicional) return "adicional";
  if (tipo === "armado") return "armado";
  if (tipo === "desarme") return "desarme";
  // mantenimiento, ampliacion, desmonte_parcial, otro → color mantenimiento (verde)
  return "mantenimiento";
}

// La jornada está completa si tiene ≥1 operario y ≥1 viaje con camión + chofer.
export function asignacionCompleta(
  cantPersonal: number,
  viajes: { camion_id: string | null; chofer_id: string | null }[],
): boolean {
  const tieneCamionConChofer = viajes.some((v) => v.camion_id && v.chofer_id);
  return cantPersonal > 0 && tieneCamionConChofer;
}
