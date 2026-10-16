// A qué pareja (técnico + asistente) va un cliente que escribe al WhatsApp. Puro, con tests
// (asignacion.test.ts). Sin IA y sin efectos: recibe lo que el servidor averiguó en Odoo, la
// lista de cuentas de los socios, las parejas y el estado del turno, y devuelve la propuesta
// y el turno siguiente. Guardar el turno es cosa de quien llama, y sólo cuando se confirma.
//
// docs/clientes/crm-propuesta.md §5, con lo que decidió JS el 15/10 (§12, decisiones 3 y 4).
// Las reglas van en este orden y corta la primera que se cumple:
//   1. cuenta de los socios → al socio de esa cuenta (con su asistente);
//   2. alquiler simple sin montaje → Tamara, sin técnico (aunque ya sea cliente);
//   3. ya es cliente → el técnico de su ÚLTIMA ORDEN GANADA, con su asistente. Si tuvo otros,
//      se avisa («también trabajó con…»), pero manda la última;
//   4. la dirección se cotizó en los últimos 12 meses → el técnico de esa cotización;
//   5. cliente nuevo → por turno entre los técnicos que reciben pedidos (Jorge, Gabriel y JS),
//      salteando al que marcó «Hoy no estoy». El técnico arrastra a su asistente.
//
// Al cliente que ya es de una pareja nunca se lo pasa a otra: por eso las reglas 1 y 3 no
// piden confirmación. La 4 y la 5 son una asignación nueva y van con el botón (§3).
//
// LOS NOMBRES SON CLAVES: las parejas y las cuentas los traen como los use quien llama (acá,
// los nombres de pila). Lo que viene de Odoo («STEPANSKY, Joaquin», «RIVEROS, Jorge») se
// reconoce sin tildes ni mayúsculas y por palabra (tecnicoDeOdoo).

import { normalizar } from "./texto.ts";

export type Pareja = {
  tecnico: string;
  asistente: string;
  /** «Recibe pedidos del asistente»: entra en el turno de los clientes nuevos. */
  recibeTurno: boolean;
};

export type ConfigParejas = {
  /** En el orden del turno. */
  parejas: Pareja[];
  /** Quien atiende el alquiler simple sin montaje (Tamara). */
  asistenteSimple: string;
};

/** Las parejas del 15/10 (§12, decisión 3): en este orden rota el turno. */
export const PAREJAS_15_10: ConfigParejas = {
  parejas: [
    { tecnico: "Jorge", asistente: "Rocío", recibeTurno: true },
    { tecnico: "Gabriel", asistente: "Sandra", recibeTurno: true },
    { tecnico: "Joaquín", asistente: "Agustina", recibeTurno: true },
  ],
  asistenteSimple: "Tamara",
};

/**
 * Una cuenta de los socios (docs/clientes/cuentas-socios.md). La lista NO está en el código: la
 * arma JS y va a Parámetros. Se reconoce por partner de Odoo, por CUIT o por el nombre.
 */
export type CuentaSocio = {
  nombre: string;
  /** El técnico de la cuenta, como lo da Odoo o por su clave. null: lo decide JS. */
  tecnico: string | null;
  partnerId?: number | null;
  cuit?: string | null;
};

/** Lo que el servidor sabe del cliente (de Odoo, por phone_sanitized o CUIT). La IA no lo ve. */
export type ClienteAsignacion = {
  partnerId?: number | null;
  /** El nombre del partner en Odoo (o de su empresa, si es un contacto). */
  nombre?: string | null;
  cuit?: string | null;
  /** Alquiler simple sin montaje (módulos y tablones, lo de Tamara). */
  alquilerSimple: boolean;
  /** Su última orden ganada (confirmada), si tiene. */
  ultimaOrdenGanada?: { tecnico: string | null; venta?: string; fecha?: string } | null;
  /** Otros técnicos con los que trabajó (para el «también trabajó con…»). */
  otrosTecnicos?: string[];
  /** Si la dirección de la obra se cotizó en los últimos 12 meses (conflictoCanal). */
  direccionCotizada?: { tecnico: string | null; venta?: string; fecha?: string } | null;
};

/** El turno de los clientes nuevos: a quién le tocó el último (su clave de técnico). */
export type EstadoTurno = { ultimo: string | null };

export type ContextoAsignacion = {
  config: ConfigParejas;
  cuentasSocios: CuentaSocio[];
  turno: EstadoTurno;
  /** Técnicos que marcaron «Hoy no estoy» (no entran en el turno). */
  hoyNoEsta?: string[];
};

export type ReglaAsignacion = "cuenta_socio" | "alquiler_simple" | "ya_es_cliente" | "direccion_cotizada" | "turno" | "sin_turno";

export type Asignacion = {
  tecnico: string | null;
  asistente: string | null;
  regla: ReglaAsignacion;
  /** Va con el botón «Confirmar asignación» (en la etapa 1a lo toca JS). */
  requiereConfirmacion: boolean;
  /** Para la tarjeta: por qué esta pareja. */
  motivo: string;
  /** «También trabajó con…» (regla 3). */
  tambienTrabajoCon: string[];
  /**
   * El turno como queda si se confirma esta propuesta. Sólo cambia con la regla 5: las demás
   * no consumen turno.
   */
  turnoSiguiente: EstadoTurno;
};

// ── Reconocer nombres ───────────────────────────────────────────────────────────────────

const palabras = (s: string) => normalizar(s).replace(/[^a-z0-9 ]/g, " ").split(" ").filter(Boolean);

/** ¿«STEPANSKY, Joaquin» es «Joaquín»? Todas las palabras de la clave están en el nombre. */
function mismaPersona(nombre: string, clave: string): boolean {
  const n = new Set(palabras(nombre));
  const c = palabras(clave);
  return c.length > 0 && c.every((p) => n.has(p));
}

/** La pareja de un técnico, por su clave o por como lo escribe Odoo. null si no es de ninguna. */
export function tecnicoDeOdoo(nombre: string | null | undefined, config: ConfigParejas): Pareja | null {
  if (!nombre?.trim()) return null;
  return config.parejas.find((p) => mismaPersona(nombre, p.tecnico)) ?? null;
}

const FORMAS_SOCIETARIAS = new Set(["sa", "s", "a", "srl", "r", "l", "sas", "saic", "sacif", "sh", "de", "y", "la", "el", "los", "las"]);

/** «MIG S.A» y «Mig SA» son la misma cuenta; «Construcciones Delta SRL» y «Delta», no. */
function claveNombre(nombre: string): string {
  return palabras(nombre).filter((p) => !FORMAS_SOCIETARIAS.has(p)).join(" ");
}

export function cuentaDeSocio(cliente: ClienteAsignacion, cuentas: CuentaSocio[]): CuentaSocio | null {
  const cuit = (cliente.cuit ?? "").replace(/\D/g, "");
  const nombre = cliente.nombre ? claveNombre(cliente.nombre) : "";
  return (
    cuentas.find((c) => cliente.partnerId && c.partnerId && c.partnerId === cliente.partnerId) ??
    cuentas.find((c) => cuit.length === 11 && (c.cuit ?? "").replace(/\D/g, "") === cuit) ??
    cuentas.find((c) => nombre.length > 0 && claveNombre(c.nombre) === nombre) ??
    null
  );
}

// ── El turno ────────────────────────────────────────────────────────────────────────────

/**
 * El siguiente en el turno después de `ultimo`, salteando a los que no reciben pedidos o hoy no
 * están. Si `ultimo` ya no está en la lista (o es null), arranca por el primero. null si no hay
 * nadie disponible.
 */
export function siguienteEnTurno(config: ConfigParejas, turno: EstadoTurno, hoyNoEsta: string[] = []): Pareja | null {
  const fuera = (p: Pareja) => !p.recibeTurno || hoyNoEsta.some((n) => mismaPersona(n, p.tecnico) || mismaPersona(p.tecnico, n));
  const lista = config.parejas;
  const desde = turno.ultimo ? lista.findIndex((p) => mismaPersona(turno.ultimo!, p.tecnico)) : -1;
  for (let i = 1; i <= lista.length; i++) {
    const p = lista[(desde + i + lista.length) % lista.length];
    if (!fuera(p)) return p;
  }
  return null;
}

// ── La regla ────────────────────────────────────────────────────────────────────────────

export function asignarPareja(cliente: ClienteAsignacion, contexto: ContextoAsignacion): Asignacion {
  const { config, turno } = contexto;
  const igual = { turnoSiguiente: turno, tambienTrabajoCon: [] as string[] };
  const conPareja = (tecnico: string | null) => {
    const p = tecnicoDeOdoo(tecnico, config);
    return { tecnico: p?.tecnico ?? tecnico, asistente: p?.asistente ?? null, conocida: !!p };
  };

  // 1. Cuenta de los socios.
  const socio = cuentaDeSocio(cliente, contexto.cuentasSocios);
  if (socio) {
    const p = conPareja(socio.tecnico);
    return {
      ...igual,
      tecnico: p.tecnico,
      asistente: p.asistente,
      regla: "cuenta_socio",
      // Sin técnico en la lista, o con uno que no es de ninguna pareja: lo decide una persona.
      requiereConfirmacion: !p.conocida,
      motivo: p.conocida ? `Cuenta de los socios (${socio.nombre}): va a ${p.tecnico}` : `Cuenta de los socios (${socio.nombre}) sin técnico asignado: decidí a quién va`,
    };
  }

  // 2. Alquiler simple sin montaje.
  if (cliente.alquilerSimple) {
    return { ...igual, tecnico: null, asistente: config.asistenteSimple, regla: "alquiler_simple", requiereConfirmacion: false, motivo: `Alquiler simple: lo atiende ${config.asistenteSimple}` };
  }

  // 3. Ya es cliente: la pareja de su última orden ganada.
  const ultima = cliente.ultimaOrdenGanada;
  if (ultima) {
    const p = conPareja(ultima.tecnico);
    const otros = [...new Set((cliente.otrosTecnicos ?? []).map((t) => tecnicoDeOdoo(t, config)?.tecnico ?? t))].filter((t) => t !== p.tecnico);
    const donde = [ultima.venta, ultima.fecha].filter(Boolean).join(", ");
    return {
      ...igual,
      tambienTrabajoCon: otros,
      tecnico: p.tecnico,
      asistente: p.asistente,
      regla: "ya_es_cliente",
      // Si su técnico ya no está en ninguna pareja (o la orden no tiene técnico), decide una persona.
      requiereConfirmacion: !p.conocida,
      motivo: p.conocida
        ? `Lo atiende siempre: última orden ganada con ${p.tecnico}${donde ? ` (${donde})` : ""}`
        : `Ya es cliente, pero su última orden ganada${donde ? ` (${donde})` : ""} ${ultima.tecnico ? `es de ${ultima.tecnico}, que no está en ninguna pareja` : "no tiene técnico"}: decidí a quién va`,
    };
  }

  // 4. La dirección se cotizó en los últimos 12 meses.
  const cotizada = cliente.direccionCotizada;
  if (cotizada?.tecnico) {
    const p = conPareja(cotizada.tecnico);
    if (p.conocida) {
      const cuando = [cotizada.venta, cotizada.fecha].filter(Boolean).join(", ");
      return { ...igual, tecnico: p.tecnico, asistente: p.asistente, regla: "direccion_cotizada", requiereConfirmacion: true, motivo: `Esta dirección la cotizó ${p.tecnico}${cuando ? ` (${cuando})` : ""}` };
    }
  }

  // 5. Cliente nuevo: el turno.
  const siguiente = siguienteEnTurno(config, turno, contexto.hoyNoEsta);
  if (!siguiente) {
    return { ...igual, tecnico: null, asistente: null, regla: "sin_turno", requiereConfirmacion: true, motivo: "Cliente nuevo y nadie disponible en el turno: decidí a quién va" };
  }
  const salteados = (contexto.hoyNoEsta ?? []).filter((n) => config.parejas.some((p) => mismaPersona(n, p.tecnico) && p.recibeTurno));
  return {
    tecnico: siguiente.tecnico,
    asistente: siguiente.asistente,
    regla: "turno",
    requiereConfirmacion: true,
    motivo: `Cliente nuevo → turno: ${siguiente.tecnico} con ${siguiente.asistente}${salteados.length ? ` (hoy no está: ${salteados.join(", ")})` : ""}${cotizada ? `. La dirección ya se cotizó${cotizada.tecnico ? ` con ${cotizada.tecnico}, que no está en ninguna pareja` : ", sin técnico"}` : ""}`,
    tambienTrabajoCon: [],
    turnoSiguiente: { ultimo: siguiente.tecnico },
  };
}
