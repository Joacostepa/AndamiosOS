// El certificado del CPAU: el formato nuevo de 1 hoja (noviembre de 2026, tarea 122 de Tres
// Arroyos 2964) y el viejo de 5 hojas, con frentes que no coinciden y calles parecidas.

import { test } from "node:test";
import assert from "node:assert/strict";
import { leerCertificado, mismaCalle, mismoFrente, retpGuardado, revisarCertificado } from "./certificado-cpau.mjs";

// Texto que saca unpdf del certificado real de la tarea 122 (S02808, R.Nro 00329527415).
const NUEVO = `De conformidad con lo dispuesto para la iniciación de expedientes sujetos a la jurisdicción
de la Dirección General de Fiscalización de Obras y Catastro, del Gobierno de la Ciudad de
Buenos Aires (LEY N° 962, Art. N° 2.1.2.2.)
EL CONSEJO PROFESIONAL DE ARQUITECTURA Y URBANISMO CERTIFICA QUE:
PRIMERO: Está inscripto y en condiciones de ejercer las funciones atinentes a su título.
SEGUNDO: Ha dado cumplimiento a las disposiciones legales y reglamentaciones y demás
disposiciones dictadas en consecuencia.
TERCERO: El Profesional responsable desempeñará las siguientes tareas:
APELLIDO y NOMBRE TITULO MATRÍCULA N°
RETP: 2902298
HOUGASSIAN, EDUARDO Arquitecto 12658
HABILITACIÓN
HABILITACIÓN ESTRUCTURA TRANSITORIA
para el COMITENTE: Joaquin Stepansky - Emprendimientos y Estructuras S.A.
En el inmueble/predio sito en: TRES ARROYOS (2964 - 2964) - Unidad:`;

const conInmueble = (inmueble: string) => NUEVO.replace("TRES ARROYOS (2964 - 2964)", inmueble);

const TRES_ARROYOS = { registro: "00329527415", frente: { calle: "TRES ARROYOS", desde: 2964, hasta: 2964 }, calle_cpau: "TRES ARROYOS" };

const ok = (r: ReturnType<typeof revisarCertificado>) => r.chequeos.filter((c) => c.bloquea && !c.ok).map((c) => c.clave);

test("formato nuevo: reconoce el certificado de Tres Arroyos 2964 y saca el RETP", () => {
  const r = revisarCertificado([NUEVO], TRES_ARROYOS);
  assert.equal(r.formato, "nuevo");
  assert.equal(r.deLaTarea, true);
  assert.equal(r.retp, "2902298");
  assert.deepEqual(r.inmueble, { calle: "TRES ARROYOS", desde: 2964, hasta: 2964 });
  assert.deepEqual(ok(r), []);
  // Sin "Número de Registro", sin comprobante y con 1 hoja no bloquea.
  assert.ok(!r.chequeos.some((c) => ["registro", "comprobante", "hojas"].includes(c.clave)));
});

test("formato nuevo: el texto en una sola línea (como lo junta textoPdf) también se lee", () => {
  const r = revisarCertificado([NUEVO.replace(/\s+/g, " ")], TRES_ARROYOS);
  assert.equal(r.deLaTarea, true);
  assert.equal(r.retp, "2902298");
});

test("formato nuevo: otro frente no es de la tarea", () => {
  const humahuaca = { registro: "00329527999", frente: { calle: "HUMAHUACA", desde: 4625, hasta: 4629 } };
  const r = revisarCertificado([NUEVO], humahuaca);
  assert.equal(r.formato, "nuevo");
  assert.equal(r.deLaTarea, false);
  assert.deepEqual(ok(r), ["inmueble"]);
  assert.match(r.chequeos.find((c) => c.clave === "inmueble")!.detalle, /TRES ARROYOS 2964 y la encomienda se cargó con HUMAHUACA 4625-4629/);
});

test("formato nuevo: misma calle con otra numeración no es de la tarea", () => {
  assert.equal(revisarCertificado([NUEVO], { ...TRES_ARROYOS, frente: { calle: "TRES ARROYOS", desde: 2960, hasta: 2964 } }).deLaTarea, false);
  assert.equal(revisarCertificado([NUEVO], { ...TRES_ARROYOS, frente: { calle: "TRES ARROYOS", desde: 2964, hasta: 2968 } }).deLaTarea, false);
  assert.equal(revisarCertificado([NUEVO], { ...TRES_ARROYOS, frente: { calle: "TRES ARROYOS", desde: 296, hasta: 296 } }).deLaTarea, false);
});

test("formato nuevo: el rango desde-hasta de Humahuaca 4625-4629", () => {
  const r = revisarCertificado([conInmueble("HUMAHUACA (4625 - 4629)")], { registro: "1", frente: { calle: "HUMAHUACA", desde: 4625, hasta: 4629 } });
  assert.equal(r.deLaTarea, true);
  assert.deepEqual(r.inmueble, { calle: "HUMAHUACA", desde: 4625, hasta: 4629 });
});

test("formato nuevo: calles parecidas no coinciden", () => {
  const valle = { registro: "1", frente: { calle: "VALLE", desde: 510, hasta: 510 } };
  assert.equal(revisarCertificado([conInmueble("VALLEJOS (510 - 510)")], valle).deLaTarea, false);
  assert.equal(revisarCertificado([conInmueble("VALLE (510 - 510)")], valle).deLaTarea, true);
  const paz = { registro: "1", frente: { calle: "PAZ", desde: 100, hasta: 110 } };
  assert.equal(revisarCertificado([conInmueble("PAZ SOLDAN, MARIANO (100 - 110)")], paz).deLaTarea, false);
  const cavia = { registro: "1", frente: { calle: "CAVIA", desde: 3063, hasta: 3063 } };
  assert.equal(revisarCertificado([conInmueble("CAVIA (3063 - 3063)")], cavia).deLaTarea, true);
  assert.equal(revisarCertificado([conInmueble("CAVIAS (3063 - 3063)")], cavia).deLaTarea, false);
});

test("formato nuevo: avenidas con AV. adelante, atrás o escrito entero, y tildes", () => {
  const olleros = { registro: "00329527226", frente: { calle: "OLLEROS AV.", desde: 1637, hasta: 1641 } };
  for (const calle of ["OLLEROS AV.", "AV. OLLEROS", "AVENIDA OLLEROS", "Olleros  Av", "OLLEROS"]) {
    assert.equal(revisarCertificado([conInmueble(`${calle} (1637 - 1641)`)], olleros).deLaTarea, true, calle);
  }
  const cordoba = { registro: "1", frente: { calle: "CÓRDOBA AV.", desde: 950, hasta: 950 } };
  assert.equal(revisarCertificado([conInmueble("CORDOBA AV. (950 - 950)")], cordoba).deLaTarea, true);
});

test("formato nuevo: el nombre del catálogo del CPAU gana sobre el del catastro, y las abreviaturas con punto", () => {
  // El catastro abrevia ("TRELLES, MANUEL R.") y el CPAU no ("TRELLES MANUEL RICARDO").
  const trelles = { registro: "1", frente: { calle: "TRELLES, MANUEL R.", desde: 1084, hasta: 1088 } };
  assert.equal(revisarCertificado([conInmueble("TRELLES MANUEL RICARDO (1084 - 1088)")], trelles).deLaTarea, true);
  assert.equal(revisarCertificado([conInmueble("TRELLES MANUEL RICARDO (1084 - 1088)")], { ...trelles, calle_cpau: "TRELLES MANUEL RICARDO" }).deLaTarea, true);
  assert.equal(revisarCertificado([conInmueble("TRELLES (1084 - 1088)")], trelles).deLaTarea, false);
});

test("formato nuevo: sin comitente ABA, sin estructura transitoria o sin Hougassian no se toma", () => {
  const otroComitente = NUEVO.replace("Emprendimientos y Estructuras S.A.", "Otra Empresa S.A.");
  assert.equal(revisarCertificado([otroComitente], TRES_ARROYOS).deLaTarea, false);
  const otraTarea = NUEVO.replace("HABILITACIÓN ESTRUCTURA TRANSITORIA", "DEMOLICION");
  assert.equal(revisarCertificado([otraTarea], TRES_ARROYOS).deLaTarea, false);
  const otroProfesional = NUEVO.replace("HOUGASSIAN, EDUARDO Arquitecto 12658", "PEREZ, JUAN Arquitecto 99999");
  const r = revisarCertificado([otroProfesional], TRES_ARROYOS);
  assert.equal(r.deLaTarea, true); // es del frente: se toma y frena por la matrícula, para que lo mire una persona
  assert.deepEqual(ok(r), ["matricula"]);
});

test("formato nuevo: sin RETP legible bloquea", () => {
  const r = revisarCertificado([NUEVO.replace("RETP: 2902298", "")], TRES_ARROYOS);
  assert.equal(r.retp, null);
  assert.deepEqual(ok(r), ["retp"]);
});

test("formato nuevo: sin frente para comparar (subida a mano sin tarea) avisa sin bloquear", () => {
  const r = revisarCertificado([NUEVO], {});
  assert.equal(r.deLaTarea, false);
  const inmueble = r.chequeos.find((c) => c.clave === "inmueble")!;
  assert.equal(inmueble.ok, false);
  assert.equal(inmueble.bloquea, false);
  assert.deepEqual(ok(r), []);
});

test("formato nuevo, subido a mano: matrícula y RETP ilegibles avisan si el inmueble coincide", () => {
  // El robot frena con esto y manda a subirlo a mano: la ficha no lo puede volver a bloquear.
  const raro = NUEVO.replace("RETP: 2902298", "").replace("12658", "12.658");
  const robot = revisarCertificado([raro], TRES_ARROYOS);
  assert.deepEqual(ok(robot), ["matricula", "retp"]);
  const aMano = revisarCertificado([raro], TRES_ARROYOS, { aMano: true });
  assert.deepEqual(ok(aMano), []);
  assert.deepEqual(aMano.chequeos.filter((c) => !c.ok).map((c) => c.clave), ["matricula", "retp"]);
  // Con otro frente sigue bloqueando todo.
  const otro = revisarCertificado([raro], { registro: "1", frente: { calle: "HUMAHUACA", desde: 4625, hasta: 4629 } }, { aMano: true });
  assert.deepEqual(ok(otro), ["matricula", "inmueble", "retp"]);
  // Otro comitente o sin estructura transitoria no se relajan nunca.
  const otroComitente = revisarCertificado([NUEVO.replace("Emprendimientos y Estructuras S.A.", "Otra S.A.")], TRES_ARROYOS, { aMano: true });
  assert.deepEqual(ok(otroComitente), ["comitente"]);
});

// El formato viejo: registro ×3, certificación y comprobante (resumido).
const VIEJO = [
  "Registro de Encomienda de Tarea Profesional RETP Nro 2897802 Número de Registro 329522249 Firma Comitente Firma Matriculado Firma CPAU",
  "Registro de Encomienda de Tarea Profesional Número de Registro 329522249",
  "Registro de Encomienda de Tarea Profesional Número de Registro 329522249",
  "EL CONSEJO PROFESIONAL DE ARQUITECTURA Y URBANISMO CERTIFICA QUE: ... sito en: NAHUEL HUAPI (5082 - 5100)",
  "EVHA Reg.Habilit. Hasta 120 Enc Nº:2933/329522249 50000.00 Sistema Pago Seguro",
];

test("formato viejo: sigue valiendo por el R.Nro", () => {
  const r = revisarCertificado(VIEJO, { registro: "00329522249", frente: { calle: "NAHUEL HUAPI", desde: 5082, hasta: 5100 } });
  assert.equal(r.formato, "viejo");
  assert.equal(r.deLaTarea, true);
  assert.deepEqual(ok(r), []);
  assert.equal(r.chequeos.find((c) => c.clave === "comprobante")!.ok, true);
});

test("formato viejo: otro R.Nro no es de la tarea aunque coincida el frente", () => {
  const r = revisarCertificado(VIEJO, { registro: "00329527415", frente: { calle: "NAHUEL HUAPI", desde: 5082, hasta: 5100 } });
  assert.equal(r.formato, "viejo");
  assert.equal(r.deLaTarea, false);
  assert.deepEqual(ok(r), ["registro"]);
});

test("formato viejo: sin la certificación o con menos de 4 hojas bloquea", () => {
  const sinCert = revisarCertificado(VIEJO.slice(0, 3), { registro: "00329522249" });
  assert.equal(sinCert.deLaTarea, true);
  assert.deepEqual(ok(sinCert), ["certificacion", "hojas"]);
});

test("un PDF que no es del CPAU no es de nadie", () => {
  const r = revisarCertificado(["Póliza de responsabilidad civil"], TRES_ARROYOS);
  assert.equal(r.formato, null);
  assert.equal(r.deLaTarea, false);
  assert.deepEqual(ok(r), ["certificacion"]);
});

test("leerCertificado: el texto suelto también sirve", () => {
  const l = leerCertificado(NUEVO);
  assert.equal(l.hojas, 1);
  assert.equal(l.retp, "2902298");
  assert.equal(l.certifica && l.estructuraTransitoria && l.comitenteAba && l.matricula, true);
});

test("mismaCalle y mismoFrente", () => {
  assert.equal(mismaCalle("VALLE", "VALLEJOS"), false);
  assert.equal(mismaCalle("Av. Entre Ríos", "ENTRE RIOS AV."), true);
  assert.equal(mismaCalle("AV.", "AVENIDA"), false); // sin nombre no hay calle
  assert.equal(mismoFrente({ calle: "HUMAHUACA", desde: 4625, hasta: 4629 }, { calle: "HUMAHUACA", desde: "4625", hasta: "4629" }), true);
  assert.equal(mismoFrente({ calle: "HUMAHUACA", desde: 4625, hasta: 4629 }, { calle: "HUMAHUACA", desde: 4625, hasta: 4627 }), false);
  assert.equal(mismoFrente({ calle: "X", calle_cpau: "TRELLES MANUEL RICARDO", desde: 1, hasta: 2 }, { calle: "TRELLES MANUEL RICARDO", desde: 1, hasta: 2 }), true);
});

test("retpGuardado: el guardado o el del nombre del archivo viejo", () => {
  assert.equal(retpGuardado({ retp: "2902298", nombre: "certificado.pdf" }), "2902298");
  assert.equal(retpGuardado({ nombre: "2897802.pdf" }), "2897802");
  assert.equal(retpGuardado({ nombre: "Encomienda.pdf" }), null);
  assert.equal(retpGuardado(null), null);
});
