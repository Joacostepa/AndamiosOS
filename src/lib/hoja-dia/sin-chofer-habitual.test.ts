// El chofer habitual NUNCA cuenta como asignado (decisión del dueño, domingo 11/10 a la
// noche), con el día real de producción:
// - La Cuadrilla 1 tiene un solo renglón: Conte TODO EL DÍA con el Agrale hidrogrúa AB 831 LC.
// - El único viaje del día es un "lleva material" suelto (sin hoja), en el AB 799 CA, SIN
//   chofer, 8:00, a la obra de la Cuadrilla 1 (Ing. Huergo 913).
// - hd_camiones_dia no tiene nada para el 11/10.
// La tarjeta decía "Material: Nuñez lleva 8:00" y Camiones "Nuñez AB 799 CA", "Kiska AF 669
// ZL", "Borda LNE 368"… porque se caía al habitual del vehículo. El dueño: "¿por qué sigue
// apareciendo Nuñez si no está asignado en ningún lado?".

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ahoraItems, avisosVeh, bandeja, botonesConLleva, calcVeh, choferDe, choferesParaVehiculo, choferesTxt, destinatarios, dondeAnda, estadoPedido,
  fotoDe, llevasParaMaterial, panelGente, planConLleva, problemas, viajesChofer, viajesSinChofer, afectadosPorCambio,
} from "./estado.ts";
import type { DiaHoja, ObraDia, Viaje } from "./tipos.ts";
import { fila, hoja, martesVacio, pedido, viaje } from "./escenario.test-fixture.ts";
import { materialDe, opcionesChofer, textoVehiculo } from "./vista-cuadrillas.ts";
import { filasOrden } from "./camiones.ts";
import { filaEnvio, mensajeDe } from "./mensajes.ts";
import { porQueNoPuedeMarcar } from "./reglas-publico.ts";
import { paresDelDia } from "./rutas.ts";

const F = "2026-10-11";
const HUERGO = 1290;
const AHORA = 6 * 60;
const CARGA = "Material del armado de Ing. Huergo 913 esq. Estados Unidos 02 (según cómputo)";
const T = { canal: "telegram" as const, link: "https://andamios-os.vercel.app/h/7KQ2MX9P", ahora: -120 };

/** El domingo 11/10 como está en la base (servicio.ts sin filas en hd_camiones_dia: nadie). */
function domingo(): DiaHoja {
  const d = martesVacio();
  const huergo: ObraDia = {
    ...d.obras.find((o) => o.cuadrillaOdooId === 1)!, otId: HUERGO, asignacionId: 637, direccion: "Ing. Huergo 913 esq. Estados Unidos 02", corto: "Ing. Huergo 913",
    titulo: "Ing. Huergo 913", tipo: "armado", lat: -34.6175, lng: -58.3672, dia: 1, totalDias: 3,
  };
  const v = (id: string, o: Partial<Viaje>) => viaje(id, { fecha: F, ...o });
  return {
    ...d,
    fecha: F,
    obras: [huergo],
    hojas: [hoja(1, ["sack", "godoy", "sosa"], "sack", {
      id: "h11-1",
      vehiculos: [fila("f-831", "todo_el_dia", "conte", "ab831", 0)],
      encuentro: { lugar: "deposito", texto: null, hora: "7:00" },
    }, F)],
    viajes: [
      v("f43c6b07", { tipo: "lleva_material", vehiculoId: "ab799", choferId: null, cuadrillaOdooId: 1, hacia: { otId: HUERGO, lugarId: null, texto: null }, hora: "8:00", orden: 480, carga: CARGA }),
    ],
    pedidos: [pedido("p-huergo", { fecha: F, fechaOriginal: F, que: CARGA, hacia: { otId: HUERGO, lugarId: null, texto: null }, viajeId: "f43c6b07", estado: "en_camion", canal: "sugerido", sugeridoRegla: "arranca", sugeridoOtId: HUERGO })],
    anterior: { ...d.anterior!, hojas: [], viajes: [] },
    ultimasHojas: [],
  };
}

/** Todos los textos que ve el dueño (tarjeta, bandeja, Camiones, "Ahora:") y los mensajes. */
function textos(d: DiaHoja): string[] {
  const out: string[] = [];
  for (const p of problemas(d, 1, AHORA)) out.push(p.t, p.card, p.corto ?? "", ...p.bs.map((b) => b.l));
  const b = bandeja(d, AHORA);
  for (const x of [...b.vos, ...b.esp]) out.push(x.t, x.corto ?? "", ...x.bs.map((y) => y.l));
  out.push(materialDe(d, 1) ?? "");
  const f = filasOrden(d);
  for (const veh of [...f.conViajes, ...f.todo]) {
    out.push(choferesTxt(d, veh), dondeAnda(d, veh, AHORA).t, textoVehiculo(d, veh).t);
    for (const a of avisosVeh(d, veh, AHORA)) out.push(a.t, ...a.bs.map((y) => y.l));
  }
  for (const s of f.sinUsar) out.push(s.txt, s.nota ?? "");
  for (const a of ahoraItems(d, AHORA)) out.push(a.t, ...a.bs.map((y) => y.l));
  for (const x of destinatarios(d)) out.push(filaEnvio(d, x), mensajeDe(d, x, T) ?? "");
  return out;
}

test("domingo 11/10: el material sin chofer NO es de Nuñez (el habitual del AB 799 CA)", () => {
  const d = domingo();
  const mat = d.viajes[0];
  assert.equal(choferDe(d, mat), null);
  assert.deepEqual(viajesChofer(d, "nunez"), []);
  assert.deepEqual(viajesSinChofer(d).map((v) => v.id), ["f43c6b07"]);
  assert.ok(!destinatarios(d).some((x) => x.pid === "nunez"), "a Nuñez no le llega nada");
  assert.equal(fotoDe(d, "nunez"), null);
});

test("domingo 11/10: Nuñez no aparece en ningún texto (tarjeta, bandeja, Camiones, mensajes)", () => {
  const d = domingo();
  const ts = textos(d).filter(Boolean);
  assert.ok(ts.length > 10);
  const conNunez = ts.filter((t) => /Nuñez/.test(t));
  assert.deepEqual(conNunez, []);
  // Tampoco los habituales de los camiones sin usar (Kiska, Borda, Gómez).
  assert.deepEqual(ts.filter((t) => /Kiska|Borda|Gómez/.test(t)), []);
  // En el panel Gente es un chofer más, libre (no "1 viaje").
  assert.equal(panelGente(d).choferes.find((x) => x.pid === "nunez")?.txt, "Nuñez · libre");
});

test("domingo 11/10: el problema «no tiene chofer» con «Elegir chofer» y «Que lo lleve Conte con la Cuadrilla 1»", () => {
  const d = domingo();
  const txt = "El material para Ing. Huergo (8:00, Iveco AB 799 CA) no tiene chofer";
  // La tarjeta de la Cuadrilla 1: bloquea ("Falta para mandar").
  const p = problemas(d, 1, AHORA).find((x) => x.k === "sinch-f43c6b07");
  assert.ok(p, problemas(d, 1, AHORA).map((x) => x.t).join("\n"));
  assert.equal(p.nivel, "bloq");
  assert.equal(p.t, txt);
  assert.equal(p.card, txt);
  assert.deepEqual(p.bs.map((b) => b.l), ["Elegir chofer", "Que lo lleve Conte con la Cuadrilla 1"]);
  assert.deepEqual(p.bs.map((b) => [b.a, b.id, b.con ?? null]), [["choferViaje", "f43c6b07", null], ["conLleva", "f43c6b07", "f-831"]]);
  // La bandeja lo dice una vez, con los mismos botones.
  const bv = bandeja(d, AHORA).vos.filter((x) => x.t === txt);
  assert.equal(bv.length, 1);
  assert.deepEqual(bv[0].bs.map((b) => b.l), ["Elegir chofer", "Que lo lleve Conte con la Cuadrilla 1"]);
  // La tarjeta: "Material: sin chofer · 8:00".
  assert.equal(materialDe(d, 1), "Material: sin chofer · 8:00");
  // Camiones: la fila dice "sin chofer" y el aviso rojo con los botones; también en "Ahora:".
  assert.equal(choferesTxt(d, "ab799"), "sin chofer");
  const av = avisosVeh(d, "ab799", AHORA).find((x) => x.k === "sinch-f43c6b07");
  assert.equal(av?.nivel, "rojo");
  assert.equal(av?.t, txt);
  assert.ok(ahoraItems(d, AHORA).some((x) => x.k === "sinch-f43c6b07"));
});

test("Camiones: las filas sin viajes ni renglón no existen por el habitual; «Sin usar» no nombra a nadie", () => {
  const d = domingo();
  const f = filasOrden(d);
  assert.deepEqual(f.conViajes, ["ab799"]);
  assert.deepEqual(f.todo, ["ab831"]);
  assert.deepEqual(f.sinUsar.map((x) => [x.txt, x.nota]), [["Iveco AF 669 ZL", null], ["Iveco AB 497 YY", null], ["Iveco AH 410 LD", "VTV vencida desde el 02/10"], ["Chevrolet LNE 368", null], ["Moto A091SWF", null], ["Clark CYS47", null], ["SIN MATRICULA 10", null]]);
  // El habitual queda a mano para el tooltip en gris, nada más.
  assert.equal(f.sinUsar.find((x) => x.veh === "af669")?.habitual, "kiska");
  assert.equal(choferesTxt(d, "af669"), "");
  assert.equal(dondeAnda(d, "af669", AHORA).t, "Sin chofer");
  assert.equal(textoVehiculo(d, "af669").t, "camión · sin chofer");
  // Con chofer del día (hd_camiones_dia: "Elegir chofer" en la fila), sí es una fila con su nombre.
  const conDia: DiaHoja = { ...d, camiones: d.camiones.map((c) => (c.vehiculoId === "af669" ? { ...c, choferId: "kiska" } : c)) };
  assert.deepEqual(filasOrden(conDia).conViajes, ["af669", "ab799"]);
  assert.equal(choferesTxt(conDia, "af669"), "Kiska");
});

test("los selectores: el habitual primero, marcado; elegir un vehículo no lo pone solo", () => {
  const d = domingo();
  const ps = choferesParaVehiculo(d, "ab799");
  assert.deepEqual(ps[0], { id: "nunez", habitual: true });
  assert.ok(ps.slice(1).every((x) => !x.habitual));
  assert.equal(ps.filter((x) => x.id === "nunez").length, 1);
  // El selector del renglón de la tarjeta: el del AB 831 LC es Borda.
  assert.match(opcionesChofer(d, 1, "f-831")[0].label, /^Borda · habitual · /);
});

test("el link del chofer: Nuñez no puede marcar el material por ser el habitual", () => {
  const d = domingo();
  const v = d.viajes[0];
  const vm = { fecha: F, estado: "planeado", chofer_id: null, vehiculo_id: "ab799" };
  assert.equal(porQueNoPuedeMarcar(vm, { fecha: F, rol: "chofer", personaId: "nunez" }, choferDe(d, v)), "Ese viaje no es tuyo.");
});

test("«Que lo lleve Conte con la Cuadrilla 1» con un renglón «Todo el día»: el material pasa al AB 831 LC", () => {
  const d = domingo();
  const ls = llevasParaMaterial(d, "f43c6b07");
  assert.deepEqual(ls.map((x) => [x.con, x.lleva, x.ch, x.veh, x.t]), [["f-831", null, "conte", "ab831", 7 * 60]]);
  const plan = planConLleva(d, "f43c6b07", "f-831");
  assert.ok(plan.k === "todo");
  assert.deepEqual([plan.vehiculoId, plan.hora, plan.orden, plan.cuadrillaOdooId, plan.chMaterial, plan.chLleva], ["ab831", "7:00", 420, 1, null, "conte"]);
  assert.equal(plan.texto, "El material para Ing. Huergo va con la Cuadrilla 1: lo lleva Conte (Agrale AB 831 LC), que va todo el día con ellos (7:00)");
  // Como lo escribe acciones.ts (con_lleva): el mismo viaje, sin chofer guardado, en el camión de todo el día.
  const d2: DiaHoja = { ...d, viajes: d.viajes.map((v) => (v.id === "f43c6b07" ? { ...v, vehiculoId: plan.vehiculoId, choferId: null, hora: plan.hora, orden: plan.orden, cuadrillaOdooId: plan.cuadrillaOdooId } : v)) };
  const mat = d2.viajes[0];
  assert.equal(choferDe(d2, mat), "conte", "lo hace el del renglón (y lo sigue si se cambia)");
  assert.deepEqual(viajesSinChofer(d2), []);
  assert.equal(materialDe(d2, 1), "Material: Conte lleva 7:00");
  assert.ok(viajesChofer(d2, "conte").some((v) => v.id === "f43c6b07"));
  // Es de su cuadrilla: sin "está todo el día con la Cuadrilla 1. Si lo sacás…".
  assert.deepEqual(avisosVeh(d2, "ab831", AHORA).map((x) => x.k), []);
  assert.ok(!problemas(d2, 1, AHORA).some((x) => /^(sinch|todo|noentra)/.test(x.k)));
  assert.equal(calcVeh(d2, "ab831")[0].t, 7 * 60);
  const st = estadoPedido(d2, d2.pedidos[0], AHORA);
  assert.ok(st.k === "en" && st.v.id === "f43c6b07");
  assert.deepEqual(botonesConLleva(d2, "f43c6b07"), [], "ya va con ellos");
  // Si el dueño cambia el chofer del renglón, el material lo sigue.
  const d3: DiaHoja = { ...d2, hojas: d2.hojas.map((h) => ({ ...h, vehiculos: h.vehiculos.map((f) => ({ ...f, choferId: "ortega" })) })) };
  assert.equal(choferDe(d3, d3.viajes[0]), "ortega");
  // Un renglón que arranca mucho después de la hora del material no sirve.
  const tarde: DiaHoja = { ...d, hojas: d.hojas.map((h) => ({ ...h, encuentro: { ...h.encuentro, hora: "10:00" } })) };
  assert.deepEqual(llevasParaMaterial(tarde, "f43c6b07"), []);
  // Sin chofer en el renglón: "Que lo lleve el Agrale AB 831 LC con la Cuadrilla 1".
  const sinCh: DiaHoja = { ...d, hojas: d.hojas.map((h) => ({ ...h, vehiculos: h.vehiculos.map((f) => ({ ...f, choferId: null })) })) };
  assert.deepEqual(botonesConLleva(sinCh, "f43c6b07").map((b) => b.l), ["Que lo lleve el Agrale AB 831 LC con la Cuadrilla 1"]);
});

test("un viaje sin chofer que no es de ninguna tarjeta (una compra) igual está en «Falta para mandar»", () => {
  const d = domingo();
  const conCompra: DiaHoja = { ...d, viajes: [...d.viajes, viaje("compra", { fecha: F, tipo: "compra", vehiculoId: "ab497", hacia: { otId: null, lugarId: "sanz", texto: null }, hora: "10:00", orden: 600 })] };
  const it = bandeja(conCompra, AHORA).vos.find((x) => x.k === "sinch-compra");
  assert.equal(it?.t, "La compra en Sanz (10:00, Iveco AB 497 YY) no tiene chofer");
  assert.deepEqual(it?.bs.map((b) => b.l), ["Elegir chofer"]);
});

test("a Nuñez le llegó el material antes del arreglo: «ya no tenés viajes» (no «ya no estás a cargo»)", () => {
  const d = domingo();
  const viejo: DiaHoja = {
    ...d,
    envios: [{
      id: "e-n", token: "X".repeat(32), fecha: F, personaId: "nunez", rol: "chofer", cuadrillaOdooId: null, anulado: false, enviadaMin: -150, enviadaCanal: "telegram",
      reenviadaMin: null, abiertaMin: null, ultimaVistaMin: null, recibidaMin: null, cambioMin: null, cambioDiffs: null,
      snap: { tipo: "chofer", viajes: [] } as never, snapPrimero: null, snapRecibido: null, snapOk: null, okMin: null, version: 1, versionVista: 0, versionRecibida: 0,
    }],
  };
  const x = destinatarios(viejo).find((y) => y.pid === "nunez")!;
  assert.equal(x.rol, "ex");
  assert.equal(filaEnvio(viejo, x), "Nuñez · chofer · ya no tiene viajes");
  assert.match(mensajeDe(viejo, x, T)!, /^Nuñez, ya no tenés viajes el domingo 11\/10\./);
  assert.deepEqual(afectadosPorCambio(viejo).find((y) => y.pid === "nunez")?.ds.map((z) => z.t), ["ya no tenés viajes"]);
  assert.ok(bandeja(viejo, AHORA).vos.some((y) => y.t === "Nuñez ya no tiene viajes y tiene su hoja de ruta"));
});

test("Google: con el día real, el único tramo es depósito → Ing. Huergo para el material (sin coordenadas, ninguno)", () => {
  // Producción (11/10): la venta S02385 tiene x_obra_lat = x_obra_lng = 0 → la obra sin
  // coordenadas, y hd_tiempos queda vacía porque no hay nada que pedir. No es un error de código.
  const d = domingo();
  assert.deepEqual(paresDelDia(d, new Set()).map((p) => `${p.desde}>${p.hacia}@${p.salida}`), [`l:dep>o:${HUERGO}@450`]);
  const sin = new Set<string>();
  const sinCoord: DiaHoja = { ...d, obras: d.obras.map((o) => ({ ...o, lat: null, lng: null })) };
  assert.deepEqual(paresDelDia(sinCoord, sin), []);
  assert.deepEqual([...sin], ["Ing. Huergo 913"]);
});
