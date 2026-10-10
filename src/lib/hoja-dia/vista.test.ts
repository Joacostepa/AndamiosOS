// Lo que ve el celular (vista.ts) con el martes 13/10 de la maqueta: Ortega con el cambio
// de las 6:43, Conte con tres obras y su pedido entregado, Kiska con siete viajes y uno
// nuevo, Borda todo el día. Los textos son los de la maqueta aprobada.

import { test } from "node:test";
import assert from "node:assert/strict";
import { armarVista, cambioPendiente, paraTuObra, pideRemito, tituloCambioChofer, tuPedido, type VistaCapataz, type VistaChofer } from "./vista.ts";
import { LINKS, MAR_1110, archivosDe, martesEnCelular } from "./vista.test-fixture.ts";
import { OT } from "./escenario.test-fixture.ts";

const dia = martesEnCelular();
const vista = (k: keyof typeof LINKS) => armarVista(dia, LINKS[k], MAR_1110, { archivos: archivosDe("T".repeat(32)) });

test("capataz: el cambio de las 6:43, en palabras, y Ramírez marcado «nuevo»", () => {
  const v = vista("ortega") as VistaCapataz;
  assert.equal(v.situacion, "ok");
  assert.equal(v.rol, "a_cargo");
  assert.deepEqual(v.cambio, { hora: "6:43", titulo: "Cambió a las 6:43", txt: "No va Ávila. Va Ramírez.", gris: false });
  assert.equal(v.vos, true);
  assert.equal(v.encuentro, "7:45 en el depósito");
  assert.equal(v.chofer?.texto, "Te lleva Kiska · Iveco AF 669 ZL\nLos busca a las 16:30 en Av. Rivadavia 6150");
  assert.equal(v.chofer?.rol, "los lleva y los busca");
  assert.deepEqual(v.gente.map((g) => `${g.nombre}${g.nuevo ? "·nuevo" : ""}`), ["Ortega", "Cabrera", "Acosta", "Villalba", "Ramírez·nuevo"]);
  assert.deepEqual(v.recibido, { hora: "20:16", entendido: false });
  assert.equal(v.enviada, true);
  const riv = v.obras[0];
  assert.equal(riv.hora, "8:30");
  assert.equal(riv.detalle, "jornada completa · día 2 de 3");
  assert.equal(riv.archivos.length, 9);
  assert.deepEqual(riv.paraTuObra, [{ b: null, t: "A las 15:00 Gómez trae lo bajado de los pisos 6 a 3 al depósito", estado: null, tono: null }]);
});

test("capataz con varias obras: horas estimadas, la nota y «Tu pedido de las 10:21: entregado 10:52»", () => {
  const v = vista("conte") as VistaCapataz;
  assert.deepEqual(v.obras.map((o) => `${o.n} ${o.hora} ${o.direccion}`), ["1 8:00 Juramento 2145", "2 ~10:15 Cuba 1980", "3 ~13:00 Av. Cabildo 3260"]);
  assert.equal(v.nota, "Los tablones para Cabildo van en el camión de las 7:00.");
  assert.equal(v.cambio, null);
  assert.deepEqual(v.tuPedido, { k: "Tu pedido de las 10:21", que: "6 tablones y 2 bases para Cabildo", estado: "entregado 10:52", tono: "ok" });
  assert.deepEqual(v.obras[2].paraTuObra, [{ b: "Tu pedido de las 10:21", t: " (6 tablones y 2 bases): ", estado: "entregado 10:52", tono: "ok" }]);
  assert.deepEqual(v.obras[0].paraTuObra, [{ b: null, t: "", estado: "Gómez se llevó lo desarmado (10:40)", tono: "ok" }]);
});

test("«Para tu obra»: el pedido de otro no dice «Tu pedido»; el que no se pudo, en rojo", () => {
  const ajeno = paraTuObra(dia, OT.cab, "ortega", MAR_1110);
  assert.equal(ajeno[0].b, "El pedido de Conte de las 10:21");
  const d2 = { ...dia, pedidos: [...dia.pedidos, { ...dia.pedidos.find((p) => p.id === "p-cab")!, id: "p-x", viajeId: null, estado: "sin_camion" as const, creadoMin: 600, que: "2 escaleras", ultimoNoPudo: { min: 650, choferId: "gomez", motivo: "Estaba cerrado", viajeId: "v-x", hacia: { otId: OT.cab, lugarId: null, texto: null } } }] };
  const l = paraTuObra(d2, OT.cab, "conte", MAR_1110).at(-1)!;
  assert.deepEqual(l, { b: "Tu pedido de las 10:00", t: ": ", estado: "no se pudo (estaba cerrado). Juan Agustín ya sabe", tono: "no" });
  assert.equal(tuPedido(d2, "conte", MAR_1110)?.estado, "entregado 10:52");
});

test("chofer: siete viajes, el de «Ahora», el nuevo de las 11:06 y la foto del remito", () => {
  const v = vista("kiska") as VistaChofer;
  assert.equal(v.rol, "chofer");
  assert.equal(v.viajes.length, 7);
  assert.equal(v.vehiculo, "Iveco AF 669 ZL");
  assert.deepEqual(v.cambio, { hora: "11:06", titulo: "Nuevo viaje 11:06", txt: "Llevá 1 escalera y 10 caños de 3 m a Gurruchaga 1650 (Hepper, antes de las 13).", gris: false });
  const ahora = v.viajes.find((x) => x.id === v.ahoraId)!;
  assert.equal(ahora.texto, "Llevá 1 escalera y 10 caños de 3 m a Gurruchaga 1650");
  assert.equal(ahora.nuevo, true);
  assert.equal(ahora.remito, true);
  assert.deepEqual([ahora.pidio, ahora.antesDe, ahora.llamar?.nombre], ["Hepper", "13", "Hepper"]);
  assert.deepEqual(v.viajes.filter((x) => x.estado !== "planeado").map((x) => `${x.estado} ${x.hechoHora}`), ["hecho 7:35", "hecho 8:25", "no_pudo 10:12"]);
  assert.equal(v.viajes[2].motivo, "No estaba listo");
  assert.equal(v.viajes[1].desde, "Juramento 2145");
  assert.equal(v.motivosNoPude.length, 6);
});

test("chofer todo el día: la hoja de la cuadrilla y sus viajes propios", () => {
  const v = vista("borda") as VistaChofer;
  assert.equal(v.todo?.cuadrilla, "Cuadrilla 1");
  assert.equal(v.todo?.aCargo, "Sack");
  assert.equal(v.todo?.encuentro, "7:00 en el depósito");
  assert.equal(v.todo?.van, 5);
  assert.deepEqual(v.viajes.map((x) => `${x.hora} ${x.texto}`), ["16:00 Traé lo desarmado de Av. San Juan 2840 al depósito"]);
});

test("situaciones: ya no está a cargo (nombra al real) y el link anulado", () => {
  const ya = armarVista(dia, { ...LINKS.ortega, personaId: "cabrera" }, MAR_1110);
  assert.deepEqual(ya, { situacion: "ya_no", fecha: "2026-10-13", coordinador: dia.parametros.coordinador, texto: "El martes 13 la Cuadrilla 3 la tiene Ortega. Si es un error, llamá a Juan Agustín." });
  assert.deepEqual(armarVista(dia, { ...LINKS.kiska, anulado: true }, MAR_1110), { situacion: "invalido" });
  const sus = armarVista({ ...dia, suspendidas: { 3: "lluvia" } }, LINKS.ortega, MAR_1110);
  assert.equal(sus.situacion, "suspendida");
  assert.equal(sus.situacion === "suspendida" && sus.texto, "Suspendida · lluvia. No hay que ir. Cualquier duda, llamá a Juan Agustín.");
});

test("el título de la tarjeta del chofer y cuándo se pide la foto", () => {
  assert.deepEqual(tituloCambioChofer([{ t: "x", sac: true }]), { titulo: "Te sacaron un viaje", gris: true });
  assert.deepEqual(tituloCambioChofer([{ t: "x", nuevo: true }, { t: "y", nuevo: true }]), { titulo: "Nuevos viajes", gris: false });
  assert.deepEqual(tituloCambioChofer([{ t: "x", nuevo: true }, { t: "y", hora: true }]), { titulo: "Cambiaron tus viajes", gris: false });
  assert.equal(cambioPendiente({ ...dia.envios[0], cambioMin: 400, recibidaMin: 401 }, "a_cargo"), null);
  assert.equal(pideRemito("compra"), true);
  assert.equal(pideRemito("lleva"), false);
});
