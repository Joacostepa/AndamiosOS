// Regla de desbloqueo de jornadas en la cola (spec v2):
// las 2 primeras siempre arrastrables si están pendientes; de la 3ra en adelante,
// se desbloquea cuando la anterior ya está asignada.

type JornadaLike = { estado: string };

export function jornadaArrastrable(jornadas: JornadaLike[], i: number): boolean {
  if (jornadas[i]?.estado !== "pendiente") return false;
  if (i < 2) return true;
  return jornadas[i - 1]?.estado === "asignada";
}

// Índice de la "siguiente sugerida" = primera jornada pendiente.
export function indiceSiguienteSugerida(jornadas: JornadaLike[]): number {
  return jornadas.findIndex((j) => j.estado === "pendiente");
}

export function contarAsignadas(jornadas: JornadaLike[]): number {
  return jornadas.filter((j) => j.estado === "asignada" || j.estado === "ejecutada").length;
}
