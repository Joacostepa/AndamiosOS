// El mismo chofer en dos camiones (domingo 11/10, 10:50, producción):
// - La Cuadrilla 1 tiene un renglón: Conte TODO EL DÍA con el Agrale hidrogrúa AB 831 LC,
//   obra Ing. Huergo 913 (encuentro 7:00).
// - Un "lleva material" suelto (sin hoja) en el Iveco AB 799 CA, 8:00 fija, a esa misma obra,
//   y a las 10:29 el dueño le eligió chofer = Conte (chofer_id guardado).
// Camiones mostraba "Conte · Iveco AB 799 CA" con "Sin noticias desde las 8:00 · tenía Ing.
// Huergo a las 8:00" y "Conte · Agrale hidrogrúa AB 831 LC · Todo el día con la Cuadrilla 1",
// sin ningún choque: la regla de "viajes de la misma cuadrilla sin aviso" lo dejaba pasar.
// El dueño: "sigue figurando Conte 2 veces… dice sin noticias de Conte cuando ya estaba
// asignado todo el día, aparece como duplicado".

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ahoraItems, avisosVeh, bandeja, choferDe, crucesChofer, crucesTodoElDia, dondeAnda, planConLleva, problemas,
} from "./estado.ts";
import type { DiaHoja, ObraDia, Viaje } from "./tipos.ts";
import { fila, hoja, martesVacio, viaje } from "./escenario.test-fixture.ts";
import { filasOrden, tambienManeja } from "./camiones.ts";

const F = "2026-10-11";
const HUERGO = 1290;
const A_LAS_1050 = 10 * 60 + 50;
const CHOQUE = "Conte está todo el día con el Agrale hidrogrúa AB 831 LC (Cuadrilla 1) y tiene el material para Ing. Huergo a las 8:00 en el Iveco AB 799 CA";

/** El domingo 11/10 a las 10:50, como está en la base. */
function domingo(material: Partial<Viaje> = {}, vehiculos = [fila("f-831", "todo_el_dia", "conte", "ab831", 0)]): DiaHoja {
  const d = martesVacio();
  const huergo: ObraDia = {
    ...d.obras.find((o) => o.cuadrillaOdooId === 1)!, otId: HUERGO, asignacionId: 637, direccion: "Ing. Huergo 913 esq. Estados Unidos 02", corto: "Ing. Huergo 913",
    titulo: "Ing. Huergo 913", tipo: "armado", lat: -34.6175, lng: -58.3672, dia: 1, totalDias: 3,
  };
  return {
    ...d,
    fecha: F,
    obras: [huergo],
    hojas: [hoja(1, ["sack", "godoy", "sosa"], "sack", { id: "h11-1", vehiculos, encuentro: { lugar: "deposito", texto: null, hora: "7:00" } }, F)],
    viajes: [
      viaje("f43c6b07", { fecha: F, tipo: "lleva_material", vehiculoId: "ab799", choferId: "conte", cuadrillaOdooId: 1, hacia: { otId: HUERGO, lugarId: null, texto: null }, hora: "8:00", orden: 480, carga: "Material del armado", ...material }),
    ],
    pedidos: [],
    anterior: { ...d.anterior!, hojas: [], viajes: [] },
    ultimasHojas: [],
  };
}
const conViaje = (d: DiaHoja, id: string, o: Partial<Viaje>): DiaHoja => ({ ...d, viajes: d.viajes.map((v) => (v.id === id ? { ...v, ...o } : v)) });

test("11/10 10:50: Conte todo el día con el Agrale y el material en el Iveco es un choque rojo (aunque sea de su cuadrilla)", () => {
  const d = domingo();
  assert.deepEqual(crucesTodoElDia(d).map((x) => [x.ch, x.v.id, x.c, x.filaId, x.veh]), [["conte", "f43c6b07", 1, "f-831", "ab831"]]);
  // No se repite como "el mismo chofer en dos camiones" (no hay otro viaje con el que pisarse).
  assert.deepEqual(crucesChofer(d), []);

  // Camiones: el aviso rojo en la fila del Iveco, con los dos botones.
  const av = avisosVeh(d, "ab799", A_LAS_1050);
  const x = av.find((a) => a.k === "todoch-f43c6b07");
  assert.ok(x, av.map((a) => a.t).join("\n"));
  assert.equal(x.nivel, "rojo");
  assert.equal(x.t, CHOQUE);
  assert.deepEqual(x.bs.map((b) => b.l), ["Que lo lleve en el Agrale AB 831 LC con la Cuadrilla 1", "Elegir otro chofer"]);
  assert.deepEqual(x.bs.map((b) => [b.a, b.id, b.con ?? null]), [["conLleva", "f43c6b07", "f-831"], ["choferViaje", "f43c6b07", null]]);
  // Mientras haya choque, NO es "sin noticias": sólo el choque.
  assert.ok(!av.some((a) => a.k.startsWith("sinnot")), av.map((a) => a.k).join(", "));
  const da = dondeAnda(d, "ab799", A_LAS_1050);
  assert.equal(da.t, "El viaje de las 8:00 a Ing. Huergo sigue pendiente: Conte está todo el día con la Cuadrilla 1");
  assert.equal(da.tono, "rojo");
  assert.ok(!da.sinNoticias);
  // La fila del Agrale no avisa nada (el choque es del viaje del Iveco).
  assert.deepEqual(avisosVeh(d, "ab831", A_LAS_1050), []);
  assert.equal(dondeAnda(d, "ab831", A_LAS_1050).t, "Todo el día con la Cuadrilla 1 en Ing. Huergo 913");

  // La tarjeta de la Cuadrilla 1: bloquea, con el mismo texto y botones.
  const p = problemas(d, 1, A_LAS_1050).find((y) => y.k === "todoch-f43c6b07");
  assert.ok(p, problemas(d, 1, A_LAS_1050).map((y) => y.t).join("\n"));
  assert.equal(p.nivel, "bloq");
  assert.equal(p.t, CHOQUE);
  assert.equal(p.card, CHOQUE);
  assert.deepEqual(p.bs.map((b) => b.l), ["Que lo lleve en el Agrale AB 831 LC con la Cuadrilla 1", "Elegir otro chofer"]);
  // La bandeja lo dice una vez; "Ahora:" también, y sin "sin noticias".
  assert.equal(bandeja(d, A_LAS_1050).vos.filter((y) => y.t === CHOQUE).length, 1);
  const ah = ahoraItems(d, A_LAS_1050);
  assert.equal(ah.filter((y) => y.t === CHOQUE).length, 1);
  assert.ok(!ah.some((y) => y.k.startsWith("sinnot")));
});

test("11/10: en Camiones se entiende que es el mismo Conte en dos camiones", () => {
  const d = domingo();
  const f = filasOrden(d);
  assert.deepEqual([f.conViajes, f.todo], [["ab799"], ["ab831"]]);
  assert.deepEqual(tambienManeja(d, "ab799").map((x) => [x.ch, x.veh, x.t]), [["conte", "ab831", "también maneja el Agrale hidrogrúa AB 831 LC (todo el día)"]]);
  assert.deepEqual(tambienManeja(d, "ab831").map((x) => [x.ch, x.veh, x.t]), [["conte", "ab799", "también maneja el Iveco AB 799 CA a las 8:00"]]);
  // Con otro chofer en el material, ninguno "también maneja".
  const otro = conViaje(d, "f43c6b07", { choferId: "ortega" });
  assert.deepEqual(tambienManeja(otro, "ab799"), []);
  assert.deepEqual(tambienManeja(otro, "ab831"), []);
});

test("«Que lo lleve en el Agrale con la Cuadrilla 1» resuelve el choque (como lo escribe con_lleva)", () => {
  const d = domingo();
  const plan = planConLleva(d, "f43c6b07", "f-831");
  assert.ok(plan.k === "todo");
  const d2 = conViaje(d, "f43c6b07", { vehiculoId: plan.vehiculoId, choferId: null, hora: plan.hora, orden: plan.orden, cuadrillaOdooId: plan.cuadrillaOdooId });
  assert.equal(choferDe(d2, d2.viajes[0]), "conte");
  assert.deepEqual(crucesTodoElDia(d2), []);
  assert.deepEqual(avisosVeh(d2, "ab831", A_LAS_1050).filter((a) => a.nivel === "rojo"), []);
  assert.ok(!problemas(d2, 1, A_LAS_1050).some((y) => y.k.startsWith("todoch")));
  assert.deepEqual(tambienManeja(d2, "ab831"), []);
});

test("un viaje de Conte a OTRA obra en otro camión: «Pasarlo al Agrale» (y ahí avisa que saca la hidrogrúa)", () => {
  const d = domingo({ tipo: "compra", cuadrillaOdooId: null, hacia: { otId: null, lugarId: "sanz", texto: null }, hora: "10:00", orden: 600, carga: "100 tablones" });
  const x = avisosVeh(d, "ab799", 9 * 60).find((a) => a.k === "todoch-f43c6b07");
  assert.equal(x?.t, "Conte está todo el día con el Agrale hidrogrúa AB 831 LC (Cuadrilla 1) y tiene la compra en Sanz a las 10:00 en el Iveco AB 799 CA");
  assert.deepEqual(x?.bs.map((b) => [b.l, b.a, b.veh ?? null]), [["Pasarlo al Agrale AB 831 LC", "pasarA", "ab831"], ["Elegir otro chofer", "choferViaje", null]]);
  // Es de la tarjeta de la 1 (la de Conte) aunque la compra no sea de ninguna cuadrilla.
  assert.ok(problemas(d, 1, 9 * 60).some((y) => y.k === "todoch-f43c6b07"));
  // Como lo escribe "mover": al Agrale sin chofer guardado. El choque se va y queda el de siempre del vehículo.
  const d2 = conViaje(d, "f43c6b07", { vehiculoId: "ab831", choferId: null });
  assert.deepEqual(crucesTodoElDia(d2), []);
  assert.deepEqual(avisosVeh(d2, "ab831", 9 * 60).map((a) => a.k), ["todo-f43c6b07"]);
});

test("varios camiones en el día SÍ vale si no se pisan: a la mañana el Iveco, a la tarde el Agrale (sin todo el día)", () => {
  const d0 = domingo({}, []);
  const d: DiaHoja = { ...d0, viajes: [...d0.viajes, viaje("tarde", { fecha: F, tipo: "lleva_material", vehiculoId: "ab831", choferId: "conte", cuadrillaOdooId: 1, hacia: { otId: HUERGO, lugarId: null, texto: null }, hora: "14:00", orden: 840, carga: "Más material" })] };
  assert.deepEqual(crucesTodoElDia(d), []);
  assert.deepEqual(crucesChofer(d), []);
  for (const veh of ["ab799", "ab831"]) assert.deepEqual(avisosVeh(d, veh, 7 * 60).filter((a) => a.nivel === "rojo"), [], veh);
  assert.ok(!problemas(d, 1, 7 * 60).some((p) => /^(todoch|chch)/.test(p.k)));
  // Igual se entiende que es el mismo Conte.
  assert.deepEqual(tambienManeja(d, "ab799").map((x) => x.t), ["también maneja el Agrale hidrogrúa AB 831 LC a las 14:00"]);
  assert.deepEqual(tambienManeja(d, "ab831").map((x) => x.t), ["también maneja el Iveco AB 799 CA a las 8:00"]);
  // Si se pisan (el de la tarde a las 8:15), es el choque de siempre, una vez.
  const pisa = conViaje(d, "tarde", { hora: "8:15", orden: 495 });
  assert.equal(crucesChofer(pisa).length, 1);
});

test("fuera de la jornada no choca: Conte todo el día y un viaje a las 17:30 en el Iveco", () => {
  const d = domingo({ hora: "17:30", orden: 1050 });
  assert.deepEqual(crucesTodoElDia(d), []);
  assert.ok(!avisosVeh(d, "ab799", 9 * 60).some((a) => a.nivel === "rojo"));
});

test("sin choque, el seguimiento se lee claro: «El viaje de las 8:00 a Ing. Huergo no está marcado como hecho (Ortega)»", () => {
  const d = domingo({ choferId: "ortega" });
  const v = d.viajes[0];
  // El mismo umbral de siempre: la hora, más lo que dura, más minutosSinNoticias.
  const dur = 8 * 60 + 60 + d.parametros.minutosSinNoticias; // lleva_material desde el depósito: 60 min típicos
  assert.ok(!dondeAnda(d, "ab799", dur).sinNoticias);
  const da = dondeAnda(d, "ab799", dur + 1);
  assert.equal(da.sinNoticias, true);
  assert.equal(da.t, "El viaje de las 8:00 a Ing. Huergo no está marcado como hecho");
  const x = avisosVeh(d, "ab799", A_LAS_1050).find((a) => a.k === "sinnot-ab799");
  assert.equal(x?.t, "El viaje de las 8:00 a Ing. Huergo no está marcado como hecho (Ortega)");
  assert.deepEqual(x?.bs.map((b) => [b.l, b.a]), [["Marcar hecho", "marcarHecho"], ["Llamar a Ortega", "llamar"], ["No se hizo", "noSeHizo"]]);
  assert.equal(x?.bs[2].id, v.id);
  // Sin chofer es otro choque rojo ("no tiene chofer"), no "sin noticias".
  const sin = domingo({ choferId: null }, [fila("f-831", "todo_el_dia", "conte", "ab831", 0)]);
  assert.equal(dondeAnda(sin, "ab799", A_LAS_1050).t, "El viaje de las 8:00 a Ing. Huergo sigue pendiente: no tiene chofer");
  assert.ok(!avisosVeh(sin, "ab799", A_LAS_1050).some((a) => a.k.startsWith("sinnot")));
});
