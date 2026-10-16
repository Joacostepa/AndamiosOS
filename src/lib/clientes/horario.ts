// El horario de atención de las personas, para que Sofía diga cuándo sigue una (§6). Puro, con
// tests (horario.test.ts).
//
// Decisión 14 de JS (15/10): la IA atiende las 24 h. El horario se usa SÓLO para decir cuándo
// responde una persona: «te escribe una persona mañana a primera hora», «…el lunes…». Los
// feriados salen de src/lib/feriados/argentina.ts (los pasa quien llama: acá no hay red).
//
// El horario es `clientes_horario` de Parámetros, «08:00-17:00», de lunes a viernes hábiles.
// Buenos Aires no tiene horario de verano: siempre UTC−3.

export type Horario = { desdeMin: number; hastaMin: number };

export const HORARIO_POR_DEFECTO: Horario = { desdeMin: 8 * 60, hastaMin: 17 * 60 };

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

/** «08:00-17:00», «8-17», «8 a 17» → minutos. Si no se entiende, el de por defecto. */
export function leerHorario(texto: string | null | undefined): Horario {
  const m = /^\s*(\d{1,2})(?::(\d{2}))?\s*(?:-|a|–)\s*(\d{1,2})(?::(\d{2}))?\s*$/.exec(texto ?? "");
  if (!m) return HORARIO_POR_DEFECTO;
  const desdeMin = Number(m[1]) * 60 + Number(m[2] ?? 0);
  const hastaMin = Number(m[3]) * 60 + Number(m[4] ?? 0);
  if (!(desdeMin < hastaMin) || hastaMin > 24 * 60) return HORARIO_POR_DEFECTO;
  return { desdeMin, hastaMin };
}

const hhmm = (min: number) => (min % 60 ? `${Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")}` : `${min / 60}`);

/** «de lunes a viernes de 8 a 17». */
export function describirHorario(h: Horario): string {
  return `de lunes a viernes de ${hhmm(h.desdeMin)} a ${hhmm(h.hastaMin)}`;
}

/** La fecha (YYYY-MM-DD), el día de la semana (0 = domingo) y los minutos del día en Buenos Aires. */
export function enBuenosAires(ahora: Date): { fecha: string; dia: number; minutos: number } {
  const ba = new Date(ahora.getTime() - 3 * 3_600_000);
  return { fecha: ba.toISOString().slice(0, 10), dia: ba.getUTCDay(), minutos: ba.getUTCHours() * 60 + ba.getUTCMinutes() };
}

function sumarDias(fecha: string, n: number): string {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const diaDeSemana = (fecha: string) => new Date(`${fecha}T12:00:00Z`).getUTCDay();

export function esDiaHabil(fecha: string, feriados: ReadonlySet<string>): boolean {
  const d = diaDeSemana(fecha);
  return d !== 0 && d !== 6 && !feriados.has(fecha);
}

export type Atencion = {
  /** Hay personas ahora mismo. */
  enHorario: boolean;
  /** Cuándo sigue una persona, para decírselo al cliente: «hoy desde las 8», «mañana a primera hora», «el lunes a primera hora», «el martes 24 a primera hora». null si es ahora. */
  cuando: string | null;
  /** El día hábil en que sigue (YYYY-MM-DD). */
  fecha: string;
};

/** ¿Hay personas ahora? Y si no, cuándo vuelven. */
export function atencion(ahora: Date, horario: Horario, feriados: ReadonlySet<string>): Atencion {
  const { fecha, minutos } = enBuenosAires(ahora);
  if (esDiaHabil(fecha, feriados)) {
    if (minutos >= horario.desdeMin && minutos < horario.hastaMin) return { enHorario: true, cuando: null, fecha };
    // Antes de que empiece el horario: «hoy desde las 8» (JS, 16/10: «hoy a primera hora» a las
    // 7:58 sonaba raro).
    if (minutos < horario.desdeMin) return { enHorario: false, cuando: `hoy desde las ${horaLegible(horario.desdeMin)}`, fecha };
  }
  let siguiente = sumarDias(fecha, 1);
  for (let i = 0; i < 30 && !esDiaHabil(siguiente, feriados); i++) siguiente = sumarDias(siguiente, 1);
  const dias = Math.round((Date.parse(`${siguiente}T12:00:00Z`) - Date.parse(`${fecha}T12:00:00Z`)) / 86_400_000);
  const nombre = DIAS[diaDeSemana(siguiente)];
  const cuando = dias === 1
    ? "mañana a primera hora"
    : dias < 7
      ? `el ${nombre} a primera hora`
      : `el ${nombre} ${Number(siguiente.slice(8, 10))} a primera hora`;
  return { enHorario: false, cuando, fecha: siguiente };
}

/** «viernes 22:40»: para el aviso de cada turno. */
export function ahoraLegible(ahora: Date): string {
  const { fecha, minutos } = enBuenosAires(ahora);
  return `${DIAS[diaDeSemana(fecha)]} ${fecha.slice(8, 10)}/${fecha.slice(5, 7)} ${String(Math.floor(minutos / 60)).padStart(2, "0")}:${String(minutos % 60).padStart(2, "0")}`;
}

/** 480 → «8», 510 → «8:30». */
function horaLegible(min: number): string {
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h}:${String(m).padStart(2, "0")}` : String(h);
}
