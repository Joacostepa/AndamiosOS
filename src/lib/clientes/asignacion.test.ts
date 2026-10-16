// Asignación de la pareja (crm-propuesta.md §5 y §12, decisiones 3 y 4): el orden de las reglas
// y el turno, con los escenarios 2, 3b y 6 de la maqueta.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PAREJAS_15_10, asignarPareja, cuentaDeSocio, siguienteEnTurno, tecnicoDeOdoo,
  type ClienteAsignacion, type ContextoAsignacion, type CuentaSocio,
} from "./asignacion.ts";

// Unas filas de docs/sofia/cuentas-socios.md, como llegarían de Parámetros.
const SOCIOS: CuentaSocio[] = [
  { nombre: "MIG S.A", tecnico: "RIVEROS, Jorge", partnerId: 501 },
  { nombre: "Kir Construcciones SRL", tecnico: "STEPANSKY, Gabriel", cuit: "30-70000000-1" },
  { nombre: "QUANTIA SA", tecnico: "STEPANSKY, Joaquin" },
  { nombre: "BRICKLANE CONSTRUCCIONES S.A.", tecnico: null },
];

const ctx = (cambios: Partial<ContextoAsignacion> = {}): ContextoAsignacion => ({
  config: PAREJAS_15_10, cuentasSocios: SOCIOS, turno: { ultimo: null }, hoyNoEsta: [], ...cambios,
});
const nuevo = (cambios: Partial<ClienteAsignacion> = {}): ClienteAsignacion => ({ alquilerSimple: false, ...cambios });

test("regla 1: una cuenta de los socios va al socio, con su asistente y sin turno", () => {
  const a = asignarPareja(nuevo({ partnerId: 501, nombre: "MIG S.A" }), ctx({ turno: { ultimo: "Jorge" } }));
  assert.deepEqual([a.tecnico, a.asistente, a.regla, a.requiereConfirmacion], ["Jorge", "Rocío", "cuenta_socio", false]);
  assert.deepEqual(a.turnoSiguiente, { ultimo: "Jorge" }, "no consume turno");
});

test("regla 1: se reconoce por CUIT y por el nombre, sin importar «S.A.» ni mayúsculas", () => {
  assert.equal(cuentaDeSocio(nuevo({ cuit: "30700000001" }), SOCIOS)?.nombre, "Kir Construcciones SRL");
  assert.equal(cuentaDeSocio(nuevo({ nombre: "Quantia S.A." }), SOCIOS)?.nombre, "QUANTIA SA");
  assert.equal(cuentaDeSocio(nuevo({ nombre: "Mig SA" }), SOCIOS)?.nombre, "MIG S.A");
  assert.equal(cuentaDeSocio(nuevo({ nombre: "Construcciones Delta SRL" }), SOCIOS), null);
  const a = asignarPareja(nuevo({ nombre: "Quantia S.A." }), ctx());
  assert.deepEqual([a.tecnico, a.asistente], ["Joaquín", "Agustina"]);
});

test("regla 1: una cuenta sin técnico en la lista la decide una persona", () => {
  const a = asignarPareja(nuevo({ nombre: "Bricklane Construcciones SA" }), ctx());
  assert.equal(a.regla, "cuenta_socio");
  assert.equal(a.tecnico, null);
  assert.equal(a.requiereConfirmacion, true);
});

test("regla 1 antes que la 2: una cuenta de los socios que pide alquiler simple va igual al socio", () => {
  assert.equal(asignarPareja(nuevo({ partnerId: 501, alquilerSimple: true }), ctx()).regla, "cuenta_socio");
});

test("regla 2: el alquiler simple va a Tamara sin técnico, aunque ya sea cliente", () => {
  const a = asignarPareja(nuevo({ alquilerSimple: true, ultimaOrdenGanada: { tecnico: "RIVEROS, Jorge" } }), ctx());
  assert.deepEqual([a.tecnico, a.asistente, a.regla, a.requiereConfirmacion], [null, "Tamara", "alquiler_simple", false]);
});

test("regla 3 (escenario 3b): Consorcio Las Lilas 400 va a su pareja, Agustina y Joaquín, sin botón", () => {
  const a = asignarPareja(nuevo({ nombre: "Consorcio Las Lilas 400", ultimaOrdenGanada: { tecnico: "STEPANSKY, Joaquin", venta: "S02100", fecha: "2026-10-02" } }), ctx());
  assert.deepEqual([a.tecnico, a.asistente, a.regla, a.requiereConfirmacion], ["Joaquín", "Agustina", "ya_es_cliente", false]);
  assert.match(a.motivo, /Lo atiende siempre: última orden ganada con Joaquín \(S02100, 2026-10-02\)/);
});

test("regla 3 (escenario 6): con más de un técnico manda la última orden ganada, y se avisa el otro", () => {
  const a = asignarPareja(nuevo({ ultimaOrdenGanada: { tecnico: "RIVEROS, Jorge" }, otrosTecnicos: ["STEPANSKY, Gabriel", "RIVEROS, Jorge"] }), ctx({ turno: { ultimo: "Gabriel" } }));
  assert.deepEqual([a.tecnico, a.asistente], ["Jorge", "Rocío"]);
  assert.deepEqual(a.tambienTrabajoCon, ["Gabriel"]);
  assert.deepEqual(a.turnoSiguiente, { ultimo: "Gabriel" }, "no consume turno");
});

test("regla 3: aunque su técnico haya marcado «Hoy no estoy», no se rota a otra pareja", () => {
  const a = asignarPareja(nuevo({ ultimaOrdenGanada: { tecnico: "RIVEROS, Jorge" } }), ctx({ hoyNoEsta: ["Jorge"] }));
  assert.equal(a.tecnico, "Jorge");
});

test("regla 3: si su técnico ya no está en ninguna pareja, decide una persona", () => {
  const a = asignarPareja(nuevo({ ultimaOrdenGanada: { tecnico: "PEREZ, Mario" } }), ctx());
  assert.equal(a.regla, "ya_es_cliente");
  assert.equal(a.asistente, null);
  assert.equal(a.requiereConfirmacion, true);
});

test("regla 3 antes que la 4: ya es cliente aunque la dirección la haya cotizado otro", () => {
  const a = asignarPareja(nuevo({ ultimaOrdenGanada: { tecnico: "RIVEROS, Jorge" }, direccionCotizada: { tecnico: "STEPANSKY, Gabriel" } }), ctx());
  assert.equal(a.regla, "ya_es_cliente");
  assert.equal(a.tecnico, "Jorge");
});

test("regla 4 (escenario 6, variante): la dirección la cotizó Gabriel el 03/05 → Gabriel con Sandra, con botón", () => {
  const a = asignarPareja(nuevo({ direccionCotizada: { tecnico: "STEPANSKY, Gabriel", fecha: "03/05" } }), ctx({ turno: { ultimo: "Jorge" } }));
  assert.deepEqual([a.tecnico, a.asistente, a.regla, a.requiereConfirmacion], ["Gabriel", "Sandra", "direccion_cotizada", true]);
  assert.equal(a.motivo, "Esta dirección la cotizó Gabriel (03/05)");
  assert.deepEqual(a.turnoSiguiente, { ultimo: "Jorge" }, "no consume turno");
});

test("regla 4: una cotización sin técnico (o de alguien que no está) no decide: va al turno", () => {
  const a = asignarPareja(nuevo({ direccionCotizada: { tecnico: null } }), ctx());
  assert.equal(a.regla, "turno");
  assert.match(a.motivo, /La dirección ya se cotizó, sin técnico/);
});

test("regla 5: los nuevos rotan Jorge → Gabriel → Joaquín → Jorge, y el turno se devuelve sin guardarlo", () => {
  let turno = { ultimo: null as string | null };
  const vistos: string[] = [];
  for (let i = 0; i < 4; i++) {
    const a = asignarPareja(nuevo(), ctx({ turno }));
    assert.equal(a.regla, "turno");
    assert.equal(a.requiereConfirmacion, true);
    vistos.push(`${a.tecnico}+${a.asistente}`);
    turno = a.turnoSiguiente;
  }
  assert.deepEqual(vistos, ["Jorge+Rocío", "Gabriel+Sandra", "Joaquín+Agustina", "Jorge+Rocío"]);
  // Sin efectos: llamar dos veces con el mismo estado da lo mismo.
  assert.deepEqual(asignarPareja(nuevo(), ctx({ turno: { ultimo: "Gabriel" } })), asignarPareja(nuevo(), ctx({ turno: { ultimo: "Gabriel" } })));
});

test("regla 5 (escenario 6): Joaquín marcó «Hoy no estoy» y el siguiente después de Gabriel es Jorge", () => {
  const a = asignarPareja(nuevo(), ctx({ turno: { ultimo: "Gabriel" }, hoyNoEsta: ["Joaquín"] }));
  assert.deepEqual([a.tecnico, a.asistente], ["Jorge", "Rocío"]);
  assert.equal(a.motivo, "Cliente nuevo → turno: Jorge con Rocío (hoy no está: Joaquín)");
  assert.deepEqual(a.turnoSiguiente, { ultimo: "Jorge" });
});

test("regla 5: el que no recibe pedidos del asistente no entra en el turno", () => {
  const config = { ...PAREJAS_15_10, parejas: PAREJAS_15_10.parejas.map((p) => (p.tecnico === "Joaquín" ? { ...p, recibeTurno: false } : p)) };
  const vistos = [null, "Jorge", "Gabriel"].map((ultimo) => siguienteEnTurno(config, { ultimo })?.tecnico);
  assert.deepEqual(vistos, ["Jorge", "Gabriel", "Jorge"]);
});

test("regla 5: si no hay nadie, decide una persona; si el último ya no está en la lista, arranca de nuevo", () => {
  const a = asignarPareja(nuevo(), ctx({ hoyNoEsta: ["Jorge", "Gabriel", "Joaquín"] }));
  assert.deepEqual([a.tecnico, a.asistente, a.regla, a.requiereConfirmacion], [null, null, "sin_turno", true]);
  assert.equal(siguienteEnTurno(PAREJAS_15_10, { ultimo: "Mario" })?.tecnico, "Jorge");
});

test("los técnicos de Odoo se reconocen por palabra, sin tildes ni mayúsculas", () => {
  assert.equal(tecnicoDeOdoo("STEPANSKY, Joaquin", PAREJAS_15_10)?.asistente, "Agustina");
  assert.equal(tecnicoDeOdoo("RIVEROS, Jorge", PAREJAS_15_10)?.asistente, "Rocío");
  assert.equal(tecnicoDeOdoo("Gabriel Stepansky", PAREJAS_15_10)?.asistente, "Sandra");
  assert.equal(tecnicoDeOdoo("Jorgelina Paz", PAREJAS_15_10), null);
  assert.equal(tecnicoDeOdoo(null, PAREJAS_15_10), null);
});
