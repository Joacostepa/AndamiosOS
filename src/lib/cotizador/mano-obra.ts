// Mano de obra por jornada-cuadrilla, y viáticos fuera de radio (modelo D y regla de corte).
//
// Reglas (criterio §3.4, §4.9):
//   · Las jornadas NO se inventan: las da el técnico. Por eso son obligatorias acá.
//   · Valor de la jornada por persona = UOCRA (con carga patronal) × (1 + recargo), redondeado a
//     $1.000; por la cuadrilla, × personas. Así salen exactos los valores del criterio
//     ($1.010.000 / $606.000 al +70 %, $1.190.000 / $714.000 al +100 %, cuadrillas de 5 y 3).
//   · En obra industrial se pregunta el mecanismo: UOCRA +100 % (bottom-up) o la jornada
//     industrial top-down ($1.150.000 la cuadrilla de 5).
//   · Recargos: sábado, domingo, nocturno (rango) y condiciones adversas (sobre todo).
//   · Fuera de radio: jornadas de viaje al %, alojamiento, comida, y mínimo 2 días por
//     movilización (la cuadrilla duerme allá).
//   · El factor de productividad por altura NO se aplica solo: si las jornadas son del
//     técnico, ya deberían contemplarlo. Se avisa para que lo confirme.

import { alMultiplo, alPeso, nuevaLinea, numero, pesos, type Aviso, type Linea, type Pendiente, type Resultado, type Tarifas } from "./tipos.ts";

export type MecanismoMO = "uocra_estandar" | "uocra_alto" | "industria";

export type EntradaManoObra = {
  jornadasArmado: number;
  jornadasDesarme: number;
  personas?: number;
  mecanismo: MecanismoMO;
  /** Cuántas de todas las jornadas caen en sábado, domingo o de noche. */
  jornadasSabado?: number;
  jornadasDomingo?: number;
  jornadasNocturnas?: number;
  /** % de recargo nocturno dentro del rango de Parámetros. */
  recargoNocturnoPct?: number;
  condicionesAdversas?: boolean;
  alturaMaxima?: number;
  fueraDeRadio?: { jornadasViaje: number; noches: number; dias: number };
};

export type DetalleManoObra = {
  valorPersonaJornada: number;
  valorJornadaCuadrilla: number;
  personas: number;
  jornadas: number;
  manoDeObra: number;
  viaticos: number;
  factorAltura: number | null;
};

export function valorJornadaPersona(mecanismo: MecanismoMO, t: Tarifas): number {
  switch (mecanismo) {
    case "uocra_estandar":
      return alMultiplo(t.manoObra.personaJornada * (1 + t.manoObra.recargoEstandarPct / 100), 1000);
    case "uocra_alto":
      return alMultiplo(t.manoObra.personaJornada * (1 + t.manoObra.recargoAltoPct / 100), 1000);
    case "industria":
      return alMultiplo(t.manoObra.industriaCuadrilla / 5, 1000);
  }
}

export function factorProductividad(alturaM: number, t: Tarifas): number {
  return t.manoObra.productividad.find((f) => alturaM <= f.hastaM)?.factor ?? 1;
}

const NOMBRE_MECANISMO: Record<MecanismoMO, string> = {
  uocra_estandar: "UOCRA estándar",
  uocra_alto: "UOCRA según trabajo",
  industria: "jornada industrial",
};

export function cotizarManoObra(e: EntradaManoObra, t: Tarifas): Resultado<DetalleManoObra> {
  const avisos: Aviso[] = [];
  const pendientes: Pendiente[] = [];
  const lineas: Linea[] = [];

  const jornadas = (e.jornadasArmado ?? 0) + (e.jornadasDesarme ?? 0);
  if (!(e.jornadasArmado > 0) || !(e.jornadasDesarme >= 0)) {
    pendientes.push({ codigo: "jornadas", pregunta: "¿Cuántas jornadas de armado y cuántas de desarme? Las confirma el técnico: nunca se asumen." });
  }
  const personas = e.personas && e.personas > 0 ? e.personas : t.manoObra.cuadrillaPersonas;
  const persona = valorJornadaPersona(e.mecanismo, t);
  const cuadrilla = persona * personas;

  const sab = Math.min(e.jornadasSabado ?? 0, jornadas);
  const dom = Math.min(e.jornadasDomingo ?? 0, jornadas - sab);
  const noc = Math.min(e.jornadasNocturnas ?? 0, jornadas);
  let nocPct = 0;
  if (noc > 0) {
    if (e.recargoNocturnoPct === undefined) {
      pendientes.push({ codigo: "recargo_nocturno", pregunta: `El nocturno va de +${numero(t.manoObra.nocturnoPct.min)} % a +${numero(t.manoObra.nocturnoPct.max)} %. ¿Cuánto aplicamos?` });
    } else {
      nocPct = e.recargoNocturnoPct;
      if (nocPct < t.manoObra.nocturnoPct.min || nocPct > t.manoObra.nocturnoPct.max) {
        avisos.push({ nivel: "advertencia", codigo: "nocturno_fuera_rango", texto: `Recargo nocturno de ${numero(nocPct)} % fuera del rango de Parámetros.` });
      }
    }
  }

  const normales = jornadas - sab - dom;
  let mo =
    normales * cuadrilla +
    sab * cuadrilla * (1 + t.manoObra.sabadoPct / 100) +
    dom * cuadrilla * (1 + t.manoObra.domingoPct / 100) +
    noc * cuadrilla * (nocPct / 100);
  if (e.condicionesAdversas) mo *= 1 + t.manoObra.adversasPct / 100;
  mo = alPeso(mo);

  const partes = [`${numero(jornadas)} jornadas × ${pesos(cuadrilla)} (cuadrilla de ${personas}, ${NOMBRE_MECANISMO[e.mecanismo]})`];
  if (sab) partes.push(`${numero(sab)} en sábado +${numero(t.manoObra.sabadoPct)} %`);
  if (dom) partes.push(`${numero(dom)} en domingo +${numero(t.manoObra.domingoPct)} %`);
  if (noc && nocPct) partes.push(`${numero(noc)} nocturnas +${numero(nocPct)} %`);
  if (e.condicionesAdversas) partes.push(`condiciones adversas +${numero(t.manoObra.adversasPct)} %`);

  if (jornadas > 0) {
    lineas.push(
      nuevaLinea({
        id: "mano_obra",
        grupo: "mano_obra",
        seccion: "base",
        producto: "mano_obra",
        descripcion: `Mano de obra de armado y desarme — ${numero(e.jornadasArmado)} + ${numero(e.jornadasDesarme)} jornadas, cuadrilla de ${personas}`,
        cantidad: 1,
        precioUnitario: mo,
        unicaVez: true,
        esManoDeObra: true,
        calculo: partes.join(" · "),
      }),
    );
  }

  let viaticos = 0;
  if (e.fueraDeRadio) {
    const f = e.fueraDeRadio;
    const dias = Math.max(f.dias, t.viaticos.minimoDias);
    if (f.dias < t.viaticos.minimoDias) {
      avisos.push({ nivel: "info", codigo: "minimo_movilizacion", texto: `Toda movilización cuenta mínimo ${numero(t.viaticos.minimoDias)} días: se toman ${numero(dias)}.` });
    }
    if (!(f.noches > 0)) {
      pendientes.push({ codigo: "noches", pregunta: "Fuera de radio la cuadrilla duerme allá: ¿cuántas noches de alojamiento?" });
    }
    const viaje = alPeso(f.jornadasViaje * cuadrilla * (t.viaticos.viajePct / 100));
    const alojamiento = alPeso(personas * Math.max(f.noches, 0) * t.viaticos.alojamientoNoche);
    const comida = alPeso(personas * dias * t.viaticos.comidaDia);
    viaticos = viaje + alojamiento + comida;
    lineas.push(
      nuevaLinea({
        id: "viaticos",
        grupo: "mano_obra",
        seccion: "base",
        producto: "traslado",
        descripcion: `Movilización y viáticos fuera de radio — ${personas} personas, ${numero(dias)} días`,
        cantidad: 1,
        precioUnitario: viaticos,
        unicaVez: true,
        calculo: [
          `viaje ${numero(f.jornadasViaje)} jornadas al ${numero(t.viaticos.viajePct)} % = ${pesos(viaje)}`,
          `alojamiento ${personas} × ${numero(f.noches)} noches × ${pesos(t.viaticos.alojamientoNoche)} = ${pesos(alojamiento)}`,
          `comida ${personas} × ${numero(dias)} días × ${pesos(t.viaticos.comidaDia)} = ${pesos(comida)}`,
        ].join(" · "),
      }),
    );
  }

  let factor: number | null = null;
  if (e.alturaMaxima && e.alturaMaxima > 0) {
    factor = factorProductividad(e.alturaMaxima, t);
    if (factor > 1) {
      avisos.push({
        nivel: "info",
        codigo: "productividad_altura",
        texto: `Con ${numero(e.alturaMaxima)} m el rendimiento cae (factor ${numero(factor)}): confirmá que las jornadas del técnico ya lo contemplan. No se multiplica solo.`,
      });
    }
  }

  return {
    lineas,
    avisos,
    pendientes,
    renovacionPct: null,
    detalle: { valorPersonaJornada: persona, valorJornadaCuadrilla: cuadrilla, personas, jornadas, manoDeObra: mo, viaticos, factorAltura: factor },
  };
}
