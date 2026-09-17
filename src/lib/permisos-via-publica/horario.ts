// Horario de presentación en TAD (JS, 16/09): de 19:00 a 07:00, hora de Buenos Aires.
//
// A la tarde TAD falla seguido y cada intento fallido cuesta: un adjunto colgado rompe el borrador
// y deja sus IF sueltos. El 15/09 S02466 falló 12 veces entre 14:10 y 18:52 y salió a las 19:03; el
// 16/09 S02128 falló 8 veces entre 12:31 y 14:27, y a las 18:54 el mismo estatuto que se colgaba a
// la tarde entró en 22 s. Esperar unas horas no cambia nada: el GCBA tarda días en revisar.
//
// Una presentación pedida fuera de horario queda en la cola con `reintentar_desde` = las próximas
// 19:00; "Presentar ya" la adelanta. Los reintentos del robot (robot/tad-presentar.mjs, misma
// cuenta) también caen dentro del horario. Revisar el horario con más datos (~30/09).

export const HORARIO_DESDE = 19;
export const HORARIO_HASTA = 7;

function horaBuenosAires(d: Date): number {
  return Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", timeZone: "America/Argentina/Buenos_Aires" }).format(d));
}

export function enHorarioDePresentacion(d = new Date()): boolean {
  const h = horaBuenosAires(d);
  return h >= HORARIO_DESDE || h < HORARIO_HASTA;
}

/** null si ya es horario; si no, las 19:00 de hoy (fuera de horario es entre las 7 y las 19). */
export function proximoHorarioDePresentacion(d = new Date()): Date | null {
  if (enHorarioDePresentacion(d)) return null;
  const fecha = d.toLocaleDateString("sv-SE", { timeZone: "America/Argentina/Buenos_Aires" });
  // Argentina no tiene horario de verano: siempre -03:00.
  return new Date(`${fecha}T${String(HORARIO_DESDE).padStart(2, "0")}:00:00-03:00`);
}
