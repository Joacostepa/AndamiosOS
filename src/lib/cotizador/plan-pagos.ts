// Plan de pagos: la forma de pago en cuotas (e-cheqs diferidos, transferencias), como tabla en
// el PDF.
//
// LAS CUOTAS SE ARMAN CON PARTES DE LA OFERTA, NO CON MONTOS. «Ingeniería + 50 % de la MO»,
// «50 % de los canones» (Joaquín, 06/10). El vendedor dice qué parte va en cada cuota y el motor
// pone los números. Así, si se recotiza, el plan acompaña solo.
//
// CIERRA AL PESO. Cada línea se reparte entera entre sus cuotas (la última se lleva el resto
// del redondeo: 7.624.288 + 7.624.287), y la columna con IVA suma exacto el total con IVA de la
// oferta: los pesos de redondeo van a las cuotas con mayor fracción.

import { alPeso, type Aviso, type Linea } from "./tipos.ts";

/** Grupos de líneas de la base que se pueden nombrar en una cuota, además del id de una línea. */
export const GRUPOS_PLAN = {
  todo: "toda la base",
  canon: "los canones (lo que entra en la renovación)",
  mano_obra: "la mano de obra y los viáticos",
  unica_vez: "lo de única vez que no es mano de obra (ingeniería, SyH, gestoría, flete)",
} as const;
export type GrupoPlan = keyof typeof GRUPOS_PLAN;

export type ParteCuota = {
  /** Un grupo (GRUPOS_PLAN) o el id de una línea de la base. */
  que: string;
  /** Qué porcentaje de eso va en esta cuota. */
  pct: number;
};

export type CuotaPlan = {
  /** YYYY-MM-DD, la fecha del cheque o del pago. null si es un momento («a la aceptación»). */
  fecha: string | null;
  /** Cuando no hay fecha: «A la aceptación», «Al finalizar el montaje». */
  cuando: string | null;
  /** Lo que se lee en la tabla: «Ingeniería completa + 50 % MO». */
  concepto: string;
  partes: ParteCuota[];
};

export type PlanPagos = {
  /** El medio, para el encabezado de la tabla: «e-cheq diferido». */
  medio: string | null;
  cuotas: CuotaPlan[];
};

export type FilaPlan = {
  /** «vie 9/10/2026» o el momento («A la aceptación»). */
  cuando: string;
  concepto: string;
  neto: number;
  conIva: number;
};

export type PlanCalculado = {
  medio: string | null;
  filas: FilaPlan[];
  totalNeto: number;
  totalConIva: number;
  /** El plan no cubre la base completa (o nombra algo que no está): no se puede guardar así. */
  problemas: string[];
  avisos: Aviso[];
};

const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const DIAS_LARGOS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

function diaDeLaSemana(iso: string): number {
  return new Date(`${iso.slice(0, 10)}T12:00:00Z`).getUTCDay();
}

/** "2026-10-09" → "vie 9/10/2026". */
export function fechaCuota(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${DIAS[diaDeLaSemana(iso)]} ${d}/${m}/${a}`;
}

function lineasDe(que: string, base: Linea[]): Linea[] | null {
  const mo = (l: Linea) => !!l.esManoDeObra || l.id === "viaticos";
  switch (que) {
    case "todo": return base;
    case "canon": return base.filter((l) => !l.unicaVez);
    case "mano_obra": return base.filter(mo);
    case "unica_vez": return base.filter((l) => l.unicaVez && !mo(l));
    default: {
      const l = base.find((x) => x.id === que);
      return l ? [l] : null;
    }
  }
}

const redondo = (n: number) => Math.round(n * 1000) / 1000;
const pctTxt = (n: number) => `${n.toLocaleString("es-AR", { maximumFractionDigits: 2 })} %`;

/**
 * Reparte `total` en partes proporcionales a `brutos`, al peso, sin perder ni sobrar un peso:
 * cada uno va a su piso y los que faltan, a los de mayor fracción.
 */
function repartirAlPeso(brutos: number[], total: number): number[] {
  const pisos = brutos.map(Math.floor);
  let faltan = total - pisos.reduce((a, b) => a + b, 0);
  const orden = brutos.map((b, i) => ({ i, f: b - Math.floor(b) })).sort((x, y) => y.f - x.f || x.i - y.i);
  for (let k = 0; faltan > 0 && orden.length; k = (k + 1) % orden.length, faltan--) pisos[orden[k].i]++;
  return pisos;
}

export function calcularPlanPagos(
  plan: PlanPagos,
  lineas: Linea[],
  p: { ivaPct: number; totalConIva: number; hoy: string },
): PlanCalculado {
  const base = lineas.filter((l) => l.seccion === "base");
  const problemas: string[] = [];
  const avisos: Aviso[] = [];

  // Qué porcentaje de cada línea va en cada cuota.
  const pctPorCuota: Map<string, number>[] = plan.cuotas.map((c) => {
    const m = new Map<string, number>();
    for (const parte of c.partes) {
      const ls = lineasDe(parte.que, base);
      if (!ls) {
        problemas.push(`La cuota «${c.concepto}» nombra «${parte.que}», que no es una línea de la base ni un grupo (${Object.keys(GRUPOS_PLAN).join(", ")}).`);
        continue;
      }
      if (!ls.length) problemas.push(`La cuota «${c.concepto}» nombra «${parte.que}», pero la base no tiene ${GRUPOS_PLAN[parte.que as GrupoPlan] ?? parte.que}.`);
      for (const l of ls) m.set(l.id, (m.get(l.id) ?? 0) + parte.pct);
    }
    return m;
  });

  // Cada línea de la base tiene que quedar repartida entera, ni más ni menos.
  for (const l of base) {
    const suma = redondo(pctPorCuota.reduce((a, m) => a + (m.get(l.id) ?? 0), 0));
    if (suma === 100) continue;
    problemas.push(
      suma === 0
        ? `«${l.descripcion}» no está en ninguna cuota.`
        : `«${l.descripcion}» suma ${pctTxt(suma)} entre las cuotas: tiene que sumar 100 %.`,
    );
  }

  // El neto: cada línea se reparte al peso; la última cuota que la lleva se queda con el resto.
  const netos = plan.cuotas.map(() => 0);
  for (const l of base) {
    const cuotas = pctPorCuota.map((m, i) => ({ i, pct: m.get(l.id) ?? 0 })).filter((x) => x.pct > 0);
    let resto = l.importe;
    cuotas.forEach(({ i, pct }, k) => {
      const monto = k === cuotas.length - 1 && !problemas.length ? resto : alPeso((l.importe * pct) / 100);
      netos[i] += monto;
      resto -= monto;
    });
  }
  const totalNeto = netos.reduce((a, b) => a + b, 0);

  // Con IVA: si el plan cierra, la columna suma exacto el total con IVA de la oferta.
  const brutos = netos.map((n) => n * (1 + p.ivaPct / 100));
  const conIva = problemas.length ? brutos.map(alPeso) : repartirAlPeso(brutos, p.totalConIva);

  const filas: FilaPlan[] = plan.cuotas.map((c, i) => ({
    cuando: c.fecha ? fechaCuota(c.fecha) : c.cuando?.trim() || "—",
    concepto: c.concepto,
    neto: netos[i],
    conIva: conIva[i],
  }));

  for (const c of plan.cuotas) {
    if (!c.fecha && !c.cuando?.trim()) problemas.push(`La cuota «${c.concepto}» no tiene fecha ni momento de pago.`);
    if (!c.fecha) continue;
    if (c.fecha.slice(0, 10) < p.hoy) {
      avisos.push({ nivel: "advertencia", codigo: "plan_fecha_pasada", texto: `La cuota «${c.concepto}» tiene fecha ${fechaCuota(c.fecha)}, que ya pasó.` });
    }
    const dia = diaDeLaSemana(c.fecha);
    if (dia === 0 || dia === 6) {
      avisos.push({ nivel: "advertencia", codigo: "plan_fin_de_semana", texto: `La cuota «${c.concepto}» cae ${DIAS_LARGOS[dia]} (${fechaCuota(c.fecha)}): se cobraría el lunes.` });
    }
  }

  return { medio: plan.medio?.trim() || null, filas, totalNeto, totalConIva: conIva.reduce((a, b) => a + b, 0), problemas, avisos };
}
