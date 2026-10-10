// La cuenta de la vista Camiones (camiones.ts) con el escenario de la maqueta: martes 13/10.

import { test } from "node:test";
import assert from "node:assert/strict";
import { filasOrden, horaSoltada, mensajeSacarUnRato, ordenEnFila, pedidoDesdeCajon, pidioTxt, sacarPedidoDeViaje, seguimientoAviso, urgenciaTxt, cuadrillaDeDestino } from "./camiones.ts";
import { calcVeh, cola, fletesDelDia, viajeCalc } from "./estado.ts";
import type { DiaHoja } from "./tipos.ts";
import { LUGARES, OT, enviarATodos, martesArmado, pedido, viaje } from "./escenario.test-fixture.ts";

const MAR_1020 = 620;

test("filasOrden: con chofer, todo el día y sin usar (con la VTV vencida en ámbar)", () => {
  const d = martesArmado();
  const f = filasOrden(d);
  assert.deepEqual(f.conViajes, ["af669", "ab497"]);
  assert.deepEqual(f.todo, ["ab831", "ab799"]);
  assert.deepEqual(f.sinUsar.map((x) => [x.txt, x.nota]), [["AH 410 LD", "VTV vencida desde el 02/10"], ["S10", "sin chofer"], ["moto", null]]);
  assert.equal(f.sinUsar[0].amb, true);
});

test("urgenciaTxt: frena en rojo con el tiempo, hora límite ámbar en la última hora, viene de ayer", () => {
  const d = martesArmado();
  const fr = pedido("x", { urgencia: "frena", creadoMin: 608 });
  assert.deepEqual(urgenciaTxt(d, fr, MAR_1020), { t: "Frena la obra · hace 12 min", tono: "rojo" });
  const hl = pedido("y", { urgencia: "hora", horaLimite: "13:00", creadoMin: 616 });
  assert.deepEqual(urgenciaTxt(d, hl, MAR_1020), { t: "Antes de las 13 · hace 4 min", tono: "" });
  assert.equal(urgenciaTxt(d, hl, 12 * 60 + 10).tono, "amb");
  assert.deepEqual(urgenciaTxt(d, pedido("z", { fechaOriginal: "2026-10-12" }), MAR_1020), { t: "Viene de ayer", tono: "amb" });
  // La tarde anterior no hay "hace": el pedido es de otro día.
  assert.equal(urgenciaTxt(d, pedido("w", { creadoMin: -300 }), -280).t, "Hoy");
});

test("pidioTxt: el capataz a cargo, el cajón, la oficina", () => {
  const d = martesArmado();
  assert.equal(pidioTxt(d, pedido("a", { pidioId: "conte", creadoMin: 620 })), "pidió Conte (a cargo de la Cuadrilla 2)");
  assert.equal(pidioTxt(d, pedido("b", { pidioId: "conte", creadoMin: -385 })), "pidió Conte (a cargo de la Cuadrilla 2) · lun 17:35");
  assert.equal(pidioTxt(d, pedido("c", { canal: "cajon" })), "del cajón del tablero");
  assert.equal(pidioTxt(d, pedido("d", {})), "oficina");
  assert.deepEqual(cuadrillaDeDestino(d, { otId: OT.cab, lugarId: null, texto: null }), { c: 2, txt: "Cuadrilla 2 (Conte)" });
});

test("ordenEnFila: entre dos fichas, antes de la primera y después de la última", () => {
  const d = martesArmado();
  const ts = calcVeh(d, "ab497"); // Gurruchaga 8:00 (480), Juramento ~10:15 (615), Rivadavia 15:00 (900)
  assert.deepEqual(ts.map((v) => v.orden), [480, 615, 900]);
  assert.equal(ordenEnFila(d, "ab497", 11 * 60), (615 + 900) / 2);
  assert.equal(ordenEnFila(d, "ab497", 7 * 60), 450);
  assert.equal(ordenEnFila(d, "ab497", 17 * 60), 930);
  // Moviendo la de Juramento a las 16, no cuenta ella misma.
  assert.equal(ordenEnFila(d, "ab497", 16 * 60, "v-jur"), 930);
  assert.equal(horaSoltada(14 * 60 + 8), "14:15");
});

test("pedidoDesdeCajon: saca el verbo y el lugar del texto", () => {
  assert.deepEqual(pedidoDesdeCajon("RETIRAR 100 TABLONES EN GALVANIZADOS SANZ", LUGARES), { que: "100 tablones", hacia: { otId: null, lugarId: "sanz", texto: null } });
  assert.deepEqual(pedidoDesdeCajon("buscar caños de 3 m en Sanz", LUGARES), { que: "Caños de 3 m", hacia: { otId: null, lugarId: "sanz", texto: null } });
  assert.deepEqual(pedidoDesdeCajon("Devolver el alquilado", LUGARES), { que: "Devolver el alquilado", hacia: null });
});

test("seguimientoAviso: el capataz que pidió y el depósito, sólo de los viajes nuevos", () => {
  let d: DiaHoja = enviarATodos(martesArmado(), -320, ["kiska", "gomez", "nunez", "borda"]);
  // 10:20: el pedido de Conte va en un viaje nuevo de Kiska que sale del depósito con carga.
  d = {
    ...d,
    viajes: [...d.viajes, viaje("v-cab", { tipo: "lleva_material", vehiculoId: "af669", choferId: "kiska", hacia: { otId: OT.cab, lugarId: null, texto: null }, carga: "6 tablones y 2 bases", orden: 700, creadoMin: 621 })],
    pedidos: [...d.pedidos, pedido("p-cab", { que: "6 tablones y 2 bases", hacia: { otId: OT.cab, lugarId: null, texto: null }, pidioId: "conte", viajeId: "v-cab", estado: "en_camion", creadoMin: 620 })],
  };
  const s = seguimientoAviso(d, "kiska", MAR_1020);
  assert.deepEqual(s.capataces, [{ pedidoId: "p-cab", pid: "conte" }]);
  assert.deepEqual(s.deposito, ["v-cab"]);
  // A Gómez no le cambió nada.
  assert.deepEqual(seguimientoAviso(d, "gomez", MAR_1020), { capataces: [], deposito: [] });
});

test("mensajeSacarUnRato: al capataz de la cuadrilla que se queda sin la hidrogrúa", () => {
  let d = martesArmado();
  d = { ...d, viajes: [...d.viajes, viaje("v-gur2", { tipo: "lleva_material", vehiculoId: "ab831", choferId: "borda", hacia: { otId: OT.gur, lugarId: null, texto: null }, carga: "1 escalera", noAntesDe: "11:00", orden: 660 })] };
  const v = viajeCalc(d, "v-gur2")!;
  const m = mensajeSacarUnRato(d, v)!;
  assert.equal(m.pid, "sack");
  assert.match(m.texto, /^Sack, Borda sale un rato con la hidrogrúa \(\d+:\d\d a \d+:\d\d\): lleva 1 escalera a Gurruchaga 1650\. Vuelve después\.$/);
});

test("I5: sacar un pedido de un viaje con otros pedidos no anula el viaje", () => {
  assert.deepEqual(sacarPedidoDeViaje("20 tablones + 2 escaleras", "2 escaleras", [{ que: "20 tablones" }]), { anular: false, carga: "20 tablones" });
  assert.deepEqual(sacarPedidoDeViaje("20 tablones + 2 escaleras", "20 tablones", [{ que: "2 escaleras" }]), { anular: false, carga: "2 escaleras" });
  // Carga editada a mano: se rearma con lo que queda.
  assert.deepEqual(sacarPedidoDeViaje("Material varios", "10 caños", [{ que: "1 escalera" }, { que: "Bases" }]), { anular: false, carga: "1 escalera + bases" });
});

test("I5: si era el único pedido, el viaje se anula", () => {
  assert.deepEqual(sacarPedidoDeViaje("10 caños", "10 caños", []), { anular: true });
});

test("I6: un pedido atado a un flete de afuera queda en camino (no anulado, no sin camión)", () => {
  const d = martesArmado();
  d.viajes.push(viaje("v-flete", { tipo: "lleva_material", vehiculoId: null, choferId: null, fleteExterno: "Semi de Fernando", hacia: { otId: OT.cab, lugarId: null, texto: null }, carga: "Mekano", hora: "11:00", orden: 660 }));
  d.pedidos.push(pedido("p-flete", { que: "Mekano", hacia: { otId: OT.cab, lugarId: null, texto: null }, viajeId: "v-flete", estado: "en_camion" }));
  const c = cola(d, MAR_1020);
  assert.ok(c.camino.some((x) => x.p.id === "p-flete" && x.st.k === "en" && x.st.v.fleteExterno === "Semi de Fernando"));
  assert.ok(!c.vos.some((x) => x.p.id === "p-flete"));
  // Y cuenta como flete tercerizado para el parte.
  assert.ok(fletesDelDia(d, OT.cab).some((x) => x.tercerizado));
});
