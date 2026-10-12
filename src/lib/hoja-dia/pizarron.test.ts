// El modelo de vista del Pizarrón (pizarron.ts) sobre el martes 13 de la maqueta: columnas,
// bandeja, avisos por columna, la secuencia de obras y los contadores. Las reglas son las de
// estado.ts: acá se mira que el pizarrón las muestre sin inventar otras.

import { test } from "node:test";
import assert from "node:assert/strict";
import { pizarron, sinAsignarPizarron, comoLlega, fraseCorta, colorDeCamion, cuadrillasDelPizarron, porQueNoAcepta } from "./pizarron.ts";
import { problemas, vanDe } from "./estado.ts";
import type { DiaHoja } from "./tipos.ts";
import { martesArmado, martesPrecargado, martesVacio, fila, OT, viaje } from "./escenario.test-fixture.ts";
import { modoPizarron } from "./modo-pizarron.ts";
import { moduloDeRuta } from "../auth/acceso.ts";

const LUNES_1830 = -330; // el lunes 12 a las 18:30, en minutos del martes

/** Todos los lugares donde aparece una persona en el pizarrón (para "una persona en un solo lugar"). */
function dondeAparece(d: DiaHoja, pid: string): string[] {
  const v = pizarron(d, LUNES_1830);
  const out: string[] = [];
  for (const c of v.columnas) {
    if (c.gente.some((x) => x.pid === pid)) out.push(`col${c.c}`);
    for (const k of c.camiones) if (k.choferId === pid) out.push(`camion:${k.k}`);
  }
  if (v.sinAsignar.some((x) => x.pid === pid)) out.push("sin");
  if (v.noVienen.some((x) => x.pid === pid)) out.push("no");
  for (const k of v.camionesLibres) if (k.choferId === pid) out.push(`libre:${k.k}`);
  return out;
}

test("columnas: las cinco cuadrillas en orden, con su obra, su gente, '4 de 5' y su color por número", () => {
  const d = martesArmado();
  const v = pizarron(d, LUNES_1830);
  assert.deepEqual(v.columnas.map((c) => c.numero), [1, 2, 3, 4, 5]);
  const c1 = v.columnas[0];
  assert.equal(c1.color, 0);
  assert.equal(c1.obras[0].corto, "Av. del Libertador 5980");
  assert.equal(c1.obras[0].tipo, "Armado");
  assert.equal(c1.obras[0].jornada, "día 3 de 5");
  assert.equal(c1.van, vanDe(d, 1));
  assert.equal(c1.prevista, 5);
  assert.ok(c1.acepta);
  assert.equal(v.vacio, false);
  assert.equal(v.pasado, false);
});

test("una cuadrilla sin obra en el tablero aparece grisada y no acepta gente (decisión 3)", () => {
  const d0 = martesArmado();
  const d: DiaHoja = { ...d0, obras: d0.obras.filter((o) => o.cuadrillaOdooId !== 4) };
  const c4 = pizarron(d, LUNES_1830).columnas.find((c) => c.c === 4)!;
  assert.ok(cuadrillasDelPizarron(d).includes(4));
  assert.equal(c4.conObra, false);
  assert.equal(c4.acepta, false);
  assert.equal(c4.motivo, "La 4 no tiene obra en el tablero");
  assert.deepEqual(c4.avisos, [], "una columna sin obra no tiene avisos");
  assert.equal(porQueNoAcepta(d, 4, LUNES_1830), "La 4 no tiene obra en el tablero");
});

test("contratistas: suman en el conteo de la columna y salen como '+N de …'", () => {
  const d0 = martesArmado();
  const d: DiaHoja = { ...d0, hojas: d0.hojas.map((h) => (h.cuadrillaOdooId === 5 ? { ...h, contratistas: [{ id: "k1", contratistaId: "quintana", cantidad: 2, nota: null, orden: 1 }] } : h)) };
  const antes = pizarron(d0, LUNES_1830).columnas.find((c) => c.c === 5)!;
  const c5 = pizarron(d, LUNES_1830).columnas.find((c) => c.c === 5)!;
  assert.equal(c5.van, antes.van + 2);
  assert.deepEqual(c5.contratistas, [{ kid: "quintana", nombre: "Quintana", cantidad: 2, aCargo: false }]);
  const bandeja = pizarron(d, LUNES_1830).contratistas;
  assert.equal(bandeja.find((k) => k.kid === "quintana")!.puestos, 2);
  assert.ok(!bandeja.some((k) => k.kid === "viejo"), "los dados de baja no se ofrecen");
});

test("el chofer habitual nunca aparece como asignado: un camión libre sin chofer del día no muestra a nadie", () => {
  const d = martesVacio();
  const v = pizarron(d, LUNES_1830);
  for (const k of v.camionesLibres) assert.equal(k.choferId, null, `${k.nombre} no tiene chofer (el habitual no cuenta)`);
  // Kiska (habitual del AF 669 ZL) está suelto, en "Sin asignar", para poder ponerlo.
  assert.deepEqual(dondeAparece(d, "kiska"), ["sin"]);
  assert.ok(sinAsignarPizarron(d).includes("nunez"));
});

test("un camión libre muestra el chofer del día o el de sus viajes, nunca el habitual", () => {
  const d0 = martesVacio();
  const conDia: DiaHoja = { ...d0, camiones: d0.camiones.map((x) => (x.vehiculoId === "ab497" ? { ...x, choferId: "borda" } : x)) };
  const k = pizarron(conDia, LUNES_1830).camionesLibres.find((x) => x.veh === "ab497")!;
  assert.equal(k.choferId, "borda");
  assert.equal(k.choferDe, "dia");
  assert.deepEqual(dondeAparece(conDia, "borda"), ["libre:veh:ab497"]);
  // Un viaje suelto con chofer elegido: lo muestra "por sus viajes".
  const conViaje: DiaHoja = { ...d0, viajes: [viaje("v1", { tipo: "lleva_material", vehiculoId: "ab799", choferId: "gomez", hacia: { otId: OT.gur, lugarId: null, texto: null }, hora: "8:00", orden: 480 })] };
  const k2 = pizarron(conViaje, LUNES_1830).camionesLibres.find((x) => x.veh === "ab799")!;
  assert.equal(k2.choferId, "gomez");
  assert.equal(k2.choferDe, "viajes");
  assert.equal(k2.viajes, 1);
});

test("una persona en un solo lugar: el que maneja un camión de una hoja va adentro del camión, no suelto", () => {
  const d = martesArmado();
  const v = pizarron(d, LUNES_1830);
  const c3 = v.columnas.find((c) => c.c === 3)!;
  const k = c3.camiones[0];
  assert.equal(k.choferId, "kiska");
  assert.equal(k.modo, "lleva_trae");
  assert.equal(k.lleva, "7:45");
  assert.ok(k.busca);
  // Kiska lleva la 2 y la 3 con el mismo camión (dos renglones): aparece en los dos camiones,
  // nunca suelto, y no es choque.
  assert.deepEqual(dondeAparece(d, "kiska"), ["camion:fila:f13-2-0", `camion:${k.k}`]);
  assert.equal(k.choque, false);
  for (const p of ["sack", "conte", "ortega", "paz", "borda", "nunez", "gomez", "medina"]) {
    assert.ok(dondeAparece(d, p).length <= 1, `${p} aparece en ${dondeAparece(d, p).join(", ")}`);
  }
  // Conte (puede manejar) chofer de un renglón "lleva y trae" no queda también en "Sin asignar".
  const d2: DiaHoja = { ...d, hojas: d.hojas.map((h) => (h.cuadrillaOdooId === 3 ? { ...h, vehiculos: [fila("f-x", "lleva_trae", "conte", "af669")] } : h.cuadrillaOdooId === 2 ? { ...h, integrantes: h.integrantes.filter((i) => i.personaId !== "conte") } : h)) };
  assert.ok(!pizarron(d2, LUNES_1830).sinAsignar.some((x) => x.pid === "conte"));
});

test("No vienen: las ausencias del día con su motivo (la ART de la asistencia)", () => {
  const v = pizarron(martesArmado(), LUNES_1830);
  const m = v.noVienen.find((x) => x.pid === "medina")!;
  assert.equal(m.tipo, "art");
  assert.equal(m.motivo, "ART / accidente");
  assert.equal(m.asistencia, true);
  assert.ok(!v.sinAsignar.some((x) => x.pid === "medina"));
});

test("avisos por columna: los problemas() de siempre, en una frase corta con su botón", () => {
  const d0 = martesPrecargado();
  // La 4 sin nadie a cargo.
  const d: DiaHoja = { ...d0, hojas: d0.hojas.map((h) => (h.cuadrillaOdooId === 4 ? { ...h, integrantes: h.integrantes.map((i) => ({ ...i, aCargo: false })) } : h)) };
  const c4 = pizarron(d, LUNES_1830).columnas.find((c) => c.c === 4)!;
  const ps = problemas(d, 4, LUNES_1830);
  assert.equal(c4.avisos.length, ps.length, "uno por problema");
  const cargo = c4.avisos.find((a) => a.k === "cargo")!;
  assert.equal(cargo.texto, "Sin nadie a cargo");
  assert.match(cargo.largo, /^Sin nadie a cargo\. Sugerido: /);
  assert.equal(cargo.boton?.a, "usarCargo");
  assert.equal(pizarron(d, LUNES_1830).avisos, pizarron(d, LUNES_1830).columnas.reduce((s, c) => s + c.avisos.length, 0));
  assert.equal(fraseCorta({ card: "Falta 1 persona (4 de 5). Sugerido: Paz (sin asignar)" }), "Falta 1 persona (4 de 5)");
});

test("varias obras en el día: la secuencia con hora, 'hasta' y cómo llegan a la siguiente", () => {
  const d = martesArmado();
  const c2 = pizarron(d, LUNES_1830).columnas.find((c) => c.c === 2)!;
  assert.deepEqual(c2.obras.map((o) => o.corto), ["Juramento 2145", "Cuba 1980", "Av. Cabildo 3260"]);
  assert.equal(c2.obras[0].hora, "8:00");
  assert.ok(c2.obras[0].hasta, "la primera dice hasta cuándo");
  assert.equal(c2.obras[0].llega, null);
  assert.equal(c2.obras[1].llega, "van por su cuenta");
  assert.equal(c2.obras[2].hasta, null);
  assert.equal(c2.obras[0].jornada, "¼ jornada");
  // Con un camión de todo el día, van en él.
  const d2: DiaHoja = { ...d, hojas: d.hojas.map((h) => (h.cuadrillaOdooId === 2 ? { ...h, vehiculos: [fila("f-2t", "todo_el_dia", "nunez", "ab799")] } : h)) };
  assert.equal(comoLlega(d2, 2, OT.cuba), "en el Iveco AB 799 CA");
});

test("instrucciones de la obra en el popover y el día vacío", () => {
  const d0 = martesArmado();
  const d: DiaHoja = { ...d0, instrucciones: [{ otId: OT.gur, cuadrillaOdooId: 4, horaInicio: "8:30", hoy: "Avisar al portero antes de descargar", chips: ["Llevar arnés y cabo de vida"] }] };
  const c4 = pizarron(d, LUNES_1830).columnas.find((c) => c.c === 4)!;
  assert.deepEqual(c4.obras[0].notas, ["Empiezan a las 8:30", "Avisar al portero antes de descargar", "Llevar arnés y cabo de vida"]);
  assert.equal(pizarron(martesVacio(), LUNES_1830).vacio, true);
  assert.equal(pizarron(martesArmado(), 1500).pasado, true);
});

test("el color de un camión es fijo por patente", () => {
  assert.equal(colorDeCamion("AB 799 CA"), colorDeCamion("AB799CA"));
  assert.ok(colorDeCamion("AF 669 ZL") >= 0 && colorDeCamion("AF 669 ZL") < 8);
});

test("parámetro pizarron: oculto por defecto; la ruta es del módulo hoja-dia", () => {
  assert.equal(modoPizarron(undefined), "oculto");
  assert.equal(modoPizarron(null), "oculto");
  assert.equal(modoPizarron("probar"), "probar");
  assert.equal(modoPizarron('"principal"'), "principal");
  assert.equal(modoPizarron("cualquiera"), "oculto");
  assert.equal(moduloDeRuta("/planificacion/hoja/pizarron")?.id, "hoja-dia");
  assert.equal(moduloDeRuta("/planificacion/hoja/cuadrillas")?.id, "hoja-dia");
  assert.equal(moduloDeRuta("/planificacion")?.id, "planificacion");
});
