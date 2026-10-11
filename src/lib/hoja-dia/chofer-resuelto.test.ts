// El chofer de un viaje sin chofer elegido y el material para la obra de una cuadrilla, con
// el caso real del domingo 11/10 (Cuadrilla 1, Ing. Huergo):
// - El sábado 22:33 se aceptó el sugerido de material y se puso en el AB 799 CA: el código
//   viejo guardó el chofer fijo con el habitual del camión (Nuñez).
// - El domingo el dueño armó la hoja: AB 799 CA con Conte (lleva 7:00, vuelve al depósito;
//   busca 16:30) y AB 831 LC con Borda (lleva 7:00, vuelve).
// - La tarjeta decía "Nuñez: lleva C1 Ing. Huergo termina ~8:45 y lleva Ing. Huergo es a las
//   8:00" y "Material: Nuñez lleva 8:00". El dueño: "me dice algo de Diego Nuñez que no lo
//   puse en ningún lado".

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  avisosVeh, botonesConLleva, calcVeh, choferDe, choferSugerido, estadoPedido, llevasParaMaterial, planConLleva, planPonerPedido, problemas, viajesChofer,
} from "./estado.ts";
import type { DiaHoja, ObraDia, Viaje } from "./tipos.ts";
import { fila, hoja, martesVacio, pedido, viaje } from "./escenario.test-fixture.ts";
import { planVehiculos } from "./vehiculos.ts";
import { materialDe } from "./vista-cuadrillas.ts";
import { sacarPedidoDeViaje } from "./camiones.ts";
import { claveTramo } from "./tiempos.ts";
import { paresDelDia } from "./rutas.ts";

const F = "2026-10-11";
const HUERGO = 3101;
const SAB_2233 = -(24 * 60 - (22 * 60 + 33));
const CARGA = "Material del armado de Ing. Huergo 913 esq. Estados Unidos 02 (según cómputo)";

/** El domingo 11/10 como lo dejó el dueño. `chMaterial`: el chofer guardado en el viaje de material. */
function domingo(chMaterial: string | null): DiaHoja {
  const d = martesVacio();
  const huergo: ObraDia = {
    ...d.obras.find((o) => o.cuadrillaOdooId === 1)!, otId: HUERGO, asignacionId: 31011, direccion: "Ing. Huergo 913 esq. Estados Unidos 02", corto: "Ing. Huergo 913",
    titulo: "Ing. Huergo 913", tipo: "armado", lat: -34.6175, lng: -58.3672, dia: 1, totalDias: 3,
  };
  const v = (id: string, o: Partial<Viaje>) => viaje(id, { fecha: F, ...o });
  return {
    ...d,
    fecha: F,
    obras: [huergo],
    hojas: [hoja(1, ["sack", "godoy", "sosa", "arrieta"], "sack", {
      id: "h11-1",
      vehiculos: [fila("f-799", "lleva_trae", "conte", "ab799", 0), fila("f-831", "lleva_trae", "borda", "ab831", 1)],
      encuentro: { lugar: "deposito", texto: null, hora: "7:00" },
    }, F)],
    viajes: [
      v("c1-lleva", { tipo: "lleva", hojaId: "h11-1", hojaVehiculoId: "f-799", cuadrillaOdooId: 1, vehiculoId: "ab799", choferId: "conte", hora: "7:00", orden: 420, vuelta: true }),
      v("c1-lleva-2", { tipo: "lleva", hojaId: "h11-1", hojaVehiculoId: "f-831", cuadrillaOdooId: 1, vehiculoId: "ab831", choferId: "borda", hora: "7:00", orden: 420, vuelta: true }),
      v("c1-busca", { tipo: "busca", hojaId: "h11-1", hojaVehiculoId: "f-799", cuadrillaOdooId: 1, vehiculoId: "ab799", choferId: "conte", hora: "16:30", orden: 990 }),
      // f43c6b07…: sin hoja ni renglón, AB 799 CA, hora fija 8:00 (canal sugerido).
      v("f43c6b07", { tipo: "lleva_material", vehiculoId: "ab799", choferId: chMaterial, cuadrillaOdooId: 1, hacia: { otId: HUERGO, lugarId: null, texto: null }, hora: "8:00", orden: 480, carga: CARGA, creadoMin: SAB_2233 }),
    ],
    pedidos: [pedido("p-huergo", { fecha: F, fechaOriginal: F, que: CARGA, hacia: { otId: HUERGO, lugarId: null, texto: null }, viajeId: "f43c6b07", estado: "en_camion", canal: "sugerido", sugeridoRegla: "arranca", sugeridoOtId: HUERGO, creadoMin: SAB_2233 })],
    anterior: { ...d.anterior!, hojas: [], viajes: [] },
    ultimasHojas: [],
  };
}
const AHORA = 6 * 60;

test("domingo 11/10, con el habitual guardado (datos de antes): el aviso nombra el camión y el chofer de cada viaje", () => {
  const d = domingo("nunez");
  const av = avisosVeh(d, "ab799", AHORA).find((x) => x.k === "noentra-f43c6b07");
  assert.ok(av, avisosVeh(d, "ab799", AHORA).map((x) => x.t).join("\n"));
  assert.equal(av.t, "El AB 799 CA no llega: lleva C1 Ing. Huergo (Conte) vuelve al depósito ~8:45 y el material para Ing. Huergo (Nuñez) es a las 8:00");
  // La tarjeta y la bandeja ya no arrancan con "Nuñez:" como si fuera el chofer de la fila.
  const ps = problemas(d, 1, AHORA);
  assert.ok(ps.some((p) => p.card === av.t), ps.map((p) => p.card).join("\n"));
  assert.ok(!ps.some((p) => /^Nuñez:/.test(p.t) || /^Nuñez:/.test(p.card)));
});

test("domingo 11/10, sin chofer guardado: el material lo hace Conte (el del renglón del AB 799 CA)", () => {
  const d = domingo(null);
  const mat = d.viajes.find((v) => v.id === "f43c6b07")!;
  assert.equal(choferDe(d, mat), "conte");
  assert.equal(choferSugerido(d, "ab799", 8 * 60), "conte");
  assert.ok(viajesChofer(d, "conte").some((v) => v.id === "f43c6b07"));
  assert.ok(!viajesChofer(d, "nunez").length, "Nuñez no tiene nada ese día");
  assert.equal(materialDe(d, 1), "Material: Conte lleva 8:00");
  const av = avisosVeh(d, "ab799", AHORA).find((x) => x.k === "noentra-f43c6b07")!;
  assert.equal(av.t, "El AB 799 CA no llega: lleva C1 Ing. Huergo (Conte) vuelve al depósito ~8:45 y el material para Ing. Huergo es a las 8:00");
  assert.ok(!problemas(d, 1, AHORA).some((p) => /Nuñez/.test(p.t)));
});

test("el chofer del renglón cambia: el viaje sin chofer guardado lo sigue solo (sin escribirlo)", () => {
  const d = domingo(null);
  const p = planVehiculos(d, 1, { k: "cambiar", filaId: "f-799", choferId: "ortega" }, { nuevoId: (q) => `n-${q}`, ahora: 300 });
  assert.ok(!p.viajes.cambiar.some((x) => x.id === "f43c6b07"), "el material no se escribe");
  const cambios = new Map(p.viajes.cambiar.map((x) => [x.id, x.valores]));
  const d2: DiaHoja = { ...d, hojas: d.hojas.map((h) => ({ ...h, vehiculos: p.filas })), viajes: d.viajes.map((v) => ({ ...v, ...cambios.get(v.id) })) };
  assert.equal(choferDe(d2, d2.viajes.find((v) => v.id === "f43c6b07")), "ortega");
  // Sin renglón ni otro viaje con chofer en el camión, el sugerido del día (hd_camiones_dia / habitual).
  const solo: DiaHoja = { ...d, hojas: [], viajes: d.viajes.filter((v) => v.id === "f43c6b07") };
  assert.equal(choferDe(solo, solo.viajes[0]), "nunez");
  // Sin renglón pero con un viaje de antes con chofer elegido: el de ese viaje.
  const conAntes: DiaHoja = { ...solo, viajes: [...solo.viajes, viaje("antes", { fecha: F, tipo: "compra", vehiculoId: "ab799", choferId: "gomez", orden: 400, hacia: { otId: null, lugarId: "sanz", texto: null } })] };
  assert.equal(choferDe(conAntes, conAntes.viajes[0]), "gomez");
});

test("aceptar el sugerido / poner un pedido ya no guarda el chofer", () => {
  const d = domingo(null);
  const ped = pedido("p-nuevo", { fecha: F, fechaOriginal: F, que: "2 escaleras", hacia: { otId: HUERGO, lugarId: null, texto: null } });
  const plan = planPonerPedido({ ...d, pedidos: [...d.pedidos, ped] }, ped, "ab799", SAB_2233);
  assert.ok("nuevo" in plan);
  assert.equal(plan.nuevo.choferId, null);
});

test("«Que lo lleve Conte con la Cuadrilla 1»: un botón por renglón, en el aviso y en la tarjeta", () => {
  const d = domingo(null);
  const ls = llevasParaMaterial(d, "f43c6b07");
  assert.deepEqual(ls.map((x) => [x.lleva.id, x.ch]), [["c1-lleva", "conte"], ["c1-lleva-2", "borda"]]);
  const bs = botonesConLleva(d, "f43c6b07");
  assert.deepEqual(bs.map((b) => b.l), ["Que lo lleve Conte con la Cuadrilla 1", "Que lo lleve Borda con la Cuadrilla 1"]);
  assert.deepEqual(bs.map((b) => [b.a, b.id, b.con]), [["conLleva", "f43c6b07", "c1-lleva"], ["conLleva", "f43c6b07", "c1-lleva-2"]]);
  const av = avisosVeh(d, "ab799", AHORA).find((x) => x.k === "noentra-f43c6b07")!;
  assert.deepEqual(av.bs.filter((b) => b.a === "conLleva").map((b) => b.con), ["c1-lleva", "c1-lleva-2"]);
  const card = problemas(d, 1, AHORA).find((p) => p.k === "noentra-f43c6b07")!;
  assert.deepEqual(card.bs.map((b) => b.l), ["Ver el camión", "Que lo lleve Conte con la Cuadrilla 1", "Que lo lleve Borda con la Cuadrilla 1"]);
  // Un lleva que llega mucho después de la hora del material no sirve; uno de otra obra tampoco.
  const tarde: DiaHoja = { ...d, viajes: d.viajes.map((v) => (v.id === "c1-lleva-2" ? { ...v, hora: "10:00", orden: 600 } : v)) };
  assert.deepEqual(llevasParaMaterial(tarde, "f43c6b07").map((x) => x.lleva.id), ["c1-lleva"]);
  // Un viaje de una cuadrilla (el lleva) o uno que no es de material no ofrece nada.
  assert.deepEqual(llevasParaMaterial(d, "c1-lleva"), []);
});

test("el gesto «Que lo lleve Conte…»: el pedido pasa al lleva, la carga se suma y el material se anula", () => {
  const d = domingo("nunez");
  const plan = planConLleva(d, "f43c6b07", "c1-lleva");
  assert.equal(plan.carga, CARGA);
  assert.equal(plan.motivo, "va con la Cuadrilla 1 (Conte)");
  assert.equal(plan.texto, "El material para Ing. Huergo va con la Cuadrilla 1: lo lleva Conte (AB 799 CA) a las 7:00");
  assert.equal(plan.chMaterial, "nunez");
  // Con el lleva que ya tenía carga: se suma ("Varios pedidos, un viaje").
  const conCarga: DiaHoja = { ...d, viajes: d.viajes.map((v) => (v.id === "c1-lleva-2" ? { ...v, carga: "20 tablones" } : v)) };
  assert.equal(planConLleva(conCarga, "f43c6b07", "c1-lleva-2").carga, `20 tablones + ${CARGA.charAt(0).toLowerCase()}${CARGA.slice(1)}`);
  // La regla de siempre: sin otros pedidos, el viaje de material se anula.
  assert.deepEqual(sacarPedidoDeViaje(CARGA, CARGA, []), { anular: true });
  // Como lo escribe el servidor (acciones.ts, con_lleva): el aviso se va y el pedido queda en el lleva.
  const d2: DiaHoja = {
    ...d,
    viajes: d.viajes.map((v) => (v.id === "f43c6b07" ? { ...v, estado: "anulado" as const, anuladoMotivo: plan.motivo } : v.id === "c1-lleva" ? { ...v, carga: plan.carga } : v)),
    pedidos: d.pedidos.map((p) => ({ ...p, viajeId: "c1-lleva" })),
  };
  assert.ok(!avisosVeh(d2, "ab799", AHORA).some((x) => x.k.startsWith("noentra")));
  assert.ok(!problemas(d2, 1, AHORA).some((p) => /no llega/.test(p.t)));
  const st = estadoPedido(d2, d2.pedidos[0], AHORA);
  assert.equal(st.k, "en");
  assert.equal(st.k === "en" && st.v.id, "c1-lleva");
  assert.equal(materialDe(d2, 1), null);
  // Un lleva que ya no sirve (pasó a otra hora): el gesto no se hace.
  assert.throws(() => planConLleva({ ...d, viajes: d.viajes.map((v) => (v.id === "c1-lleva" ? { ...v, hora: "11:00", orden: 660 } : v)) }, "f43c6b07", "c1-lleva"));
});

test("la vuelta al depósito: ~8:45 con las típicas (7:00 + 45 + 60), con Google el manejo real", () => {
  const d = domingo(null);
  assert.equal(calcVeh(d, "ab799").find((v) => v.id === "c1-lleva")!.fin, 8 * 60 + 45);
  // Con los dos tramos de Google (24 min de ida y de vuelta): sale 7:00, llega 7:24, deja (10 min) y vuelve 7:58.
  const dep = "l:dep", obra = `o:${HUERGO}`;
  const g: DiaHoja = { ...d, tiempos: { [claveTramo(dep, obra)]: { min: 24, m: 12700, fuente: "google" }, [claveTramo(obra, dep)]: { min: 24, m: 12700, fuente: "google" } } };
  assert.equal(calcVeh(g, "ab799").find((v) => v.id === "c1-lleva")!.fin, 7 * 60 + 58);
  // …pero el material de las 8:00 (hora de llegada) igual no entra: del depósito a la obra son
  // 24 min más. El aviso lo dice con el manejo, y "Que lo lleve Conte…" sigue siendo la salida.
  const av = avisosVeh(g, "ab799", AHORA).find((x) => x.k === "noentra-f43c6b07")!;
  assert.equal(av.t, "El AB 799 CA no llega: lleva C1 Ing. Huergo (Conte) vuelve al depósito ~8:00 (llega a Ing. Huergo ~8:20) y el material para Ing. Huergo es a las 8:00");
});

test("los tramos que se le piden a Google ese día: depósito → Ing. Huergo y la vuelta (con coordenadas en los dos)", () => {
  const d = domingo(null);
  const sin = new Set<string>();
  const ps = paresDelDia(d, sin).map((p) => `${p.desde}>${p.hacia}@${p.salida}`);
  assert.ok(ps.includes(`l:dep>o:${HUERGO}@420`), ps.join("\n"));
  assert.ok(ps.includes(`o:${HUERGO}>l:dep@465`), ps.join("\n"));
  assert.equal(sin.size, 0);
  // Sin las coordenadas de la obra (venta de Odoo sin x_obra_lat / x_obra_lng): nada que pedir, y dice por qué.
  const sinCoord: DiaHoja = { ...d, obras: d.obras.map((o) => ({ ...o, lat: null, lng: null })) };
  const sin2 = new Set<string>();
  assert.equal(paresDelDia(sinCoord, sin2).filter((p) => p.hacia === `o:${HUERGO}` || p.desde === `o:${HUERGO}`).length, 0);
  assert.ok([...sin2].some((x) => /Huergo/.test(x)), [...sin2].join(" · "));
});
