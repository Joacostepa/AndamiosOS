// La cuenta de la Hoja del día (estado.ts), con el escenario de la maqueta: martes 13/10.
// Cubre los criterios de aceptación de §18 y los errores que encontró el revisor (la
// bandeja que no pierde problemas, los estados después de enviar, el cambio de tablero que
// avisa el encuentro y la sobrecarga, el chofer con las teclas 1–5, el alta que no borra
// el pasado).

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  afectadosPorCambio, altaDeAusencia, ausenciasDeAsistencia, bandeja, calcVeh, camionesQueSirven, cola, dondeAnda,
  estadoHoja, fletesDelDia, fmtComa, fotoDe, hm, leerHora, minutosDesde, nombresCortos, ordenCola, planCopiarComoHoy,
  planPonerPedido, planPrecarga, planSoltarChofer, problemas, sugerirACargo, sugeridosDe, textoViaje, viajesChofer,
  avisosVeh, sinAsignar, estadoPedido, hoyManana, listaCarga, diferencias, ausenteEn, panelGente, tipoPorDestino,
  pidioPorDefecto,
} from "./estado.ts";
import type { DiaHoja, Viaje } from "./tipos.ts";
import { OT, aplicarPlan, enviarATodos, martesArmado, martesPrecargado, martesVacio, pedido, viaje } from "./escenario.test-fixture.ts";

const LUN_1730 = -390;
const LUN_1830 = -330;
const LUN_1905 = -295;
const MAR_0640 = 400;

const sinCargo = (d: DiaHoja, c: number) => d.hojas.find((h) => h.cuadrillaOdooId === c)!;
function conAusencia(d: DiaHoja, pid: string, tipo: "enfermedad" | "vacaciones" = "enfermedad"): DiaHoja {
  return { ...d, ausencias: [...d.ausencias, { id: `a-${pid}`, personaId: pid, desde: d.fecha, hasta: d.fecha, tipo, horaDesde: null, horaHasta: null, nota: null, origen: "planificador" }] };
}
function sacar(d: DiaHoja, pid: string): DiaHoja {
  return { ...d, hojas: d.hojas.map((h) => ({ ...h, integrantes: h.integrantes.filter((i) => i.personaId !== pid) })) };
}
function poner(d: DiaHoja, c: number, pid: string): DiaHoja {
  return { ...d, hojas: d.hojas.map((h) => (h.cuadrillaOdooId === c ? { ...h, integrantes: [...h.integrantes, { id: `i-${pid}`, personaId: pid, aCargo: false, nota: null, orden: 99 }] } : h)) };
}

// ─── Horas ──────────────────────────────────────────────────────────────────

test("las horas: minutos relativos al día de la hoja, en Buenos Aires", () => {
  // 21:42 UTC del lunes 12 son las 18:42 en Buenos Aires: 318 minutos antes del martes.
  assert.equal(minutosDesde("2026-10-13", "2026-10-12T21:42:00Z"), -318);
  assert.equal(hm(-318), "18:42");
  assert.equal(minutosDesde("2026-10-13", "2026-10-13T09:40:00Z"), 400);
  assert.equal(leerHora("745"), "7:45");
  assert.equal(leerHora("7.45"), "7:45");
  assert.equal(leerHora("25"), null);
  assert.equal(hoyManana("2026-10-13", LUN_1730), "mañana");
  assert.equal(hoyManana("2026-10-13", MAR_0640), "hoy");
});

test("nombres cortos: el apellido, con la inicial si dos lo comparten", () => {
  const n = nombresCortos([
    { id: "a", apellido: "MIÑO", nombre: "HORACIO ADRIAN" },
    { id: "b", apellido: "MIÑO", nombre: "JONAS ADRIEL" },
    { id: "c", apellido: "ORTEGA", nombre: "CARLOS RAUL" },
  ], (s) => s.charAt(0) + s.slice(1).toLowerCase());
  assert.equal(n.get("a"), "Miño H.");
  assert.equal(n.get("b"), "Miño J.");
  assert.equal(n.get("c"), "Ortega");
});

// ─── Precarga ───────────────────────────────────────────────────────────────

test("Empezar como hoy: copia el lunes, saca a los ausentes y lo dice", () => {
  const d = martesVacio();
  const plan = planPrecarga(d, "hoy");
  assert.equal(plan.hojas.length, 5);
  const c4 = plan.hojas.find((h) => h.cuadrillaOdooId === 4)!;
  assert.deepEqual(c4.gente, ["hepper", "perez", "romero", "molina"]);
  assert.ok(plan.avisos.some((a) => a === "Medina no entra: ART desde el 13/10 (según la asistencia). La Cuadrilla 4 quedó con 4 de 5."), plan.avisos.join("\n"));
  // La 5 no trabajó el lunes: toma su hoja del viernes, sin nadie a cargo.
  const c5 = plan.hojas.find((h) => h.cuadrillaOdooId === 5)!;
  assert.deepEqual(c5.gente, ["mino", "valenzuela", "aguirre"]);
  assert.equal(c5.aCargoId, null);
  assert.equal(c5.modo, "todo_el_dia");
  assert.ok(plan.avisos.some((a) => a.startsWith("La Cuadrilla 5 no trabajó el lunes")));
  // Nuñez va todo el día con la 5: a la 2 la lleva Kiska (y queda el choque de las 7:00).
  const c2 = plan.hojas.find((h) => h.cuadrillaOdooId === 2)!;
  assert.equal(c2.choferId, "kiska");
  assert.equal(c2.vehiculoId, "af669");
  assert.ok(plan.avisos.some((a) => a === "Nuñez va todo el día con la Cuadrilla 5: a la 2 la lleva Kiska."));
  // Copia las horas del lleva y el busca del lunes.
  const c3 = plan.hojas.find((h) => h.cuadrillaOdooId === 3)!;
  assert.equal(c3.lleva, "7:00");
  assert.equal(c3.busca, "16:30");
});

test("Empezar como hoy: la gente sigue a la obra si cambió de cuadrilla", () => {
  const d = martesVacio();
  // Rivadavia (de la 3 el lunes) pasa a la 4 el martes, y Gurruchaga a la 3.
  d.obras = d.obras.map((o) => (o.otId === OT.riv ? { ...o, cuadrillaOdooId: 4 } : o.otId === OT.gur ? { ...o, cuadrillaOdooId: 3 } : o));
  const plan = planPrecarga(d, "hoy");
  const c4 = plan.hojas.find((h) => h.cuadrillaOdooId === 4)!;
  assert.equal(c4.aCargoId, "ortega");
  assert.ok(c4.gente.includes("cabrera"));
});

test("Empezar con el plantel base y vacío", () => {
  const d = martesVacio();
  const pl = planPrecarga(d, "plantel");
  assert.equal(pl.hojas.find((h) => h.cuadrillaOdooId === 1)!.aCargoId, "sack");
  assert.ok(pl.avisos.some((a) => a.startsWith("La Cuadrilla 5 no está en Configuración")));
  const va = planPrecarga(d, "vacio");
  assert.ok(va.hojas.every((h) => h.gente.length === 0 && h.modo === "sin"));
});

test("Copiar como hoy una sola tarjeta", () => {
  const d = martesVacio();
  const p = planCopiarComoHoy(d, 3)!;
  assert.equal(p.aCargoId, "ortega");
  assert.equal(planCopiarComoHoy(d, 5), null);
});

// ─── Problemas y bandeja ────────────────────────────────────────────────────

test("recién precargado: lo que falta para mandar", () => {
  const d = martesPrecargado();
  const b = bandeja(d, LUN_1830);
  const t = b.vos.map((x) => x.t);
  assert.ok(t.includes("Cuadrilla 5 · sin nadie a cargo · Sugerido: Miño (la tuvo el 09/10)"), t.join("\n"));
  assert.ok(t.includes("Cuadrilla 4 · 4 de 5 personas"), t.join("\n"));
  assert.ok(t.includes("Kiska lleva a la Cuadrilla 2 y a la 3 a las 7:00"), t.join("\n"));
  assert.ok(t.includes("3 pedidos sugeridos para mañana"), t.join("\n"));
  // Un solo renglón para el choque, aunque lo vean las dos cuadrillas.
  assert.equal(t.filter((x) => x.startsWith("Kiska lleva")).length, 1);
});

test("la bandeja no pierde problemas: el mismo problema en dos cuadrillas son dos líneas", () => {
  const d = sacar(martesPrecargado(), "sosa"); // la 1 también queda corta
  const t = bandeja(d, LUN_1830).vos.map((x) => x.t);
  assert.ok(t.includes("Cuadrilla 4 · 4 de 5 personas"));
  assert.ok(t.includes("Cuadrilla 1 · 4 de 5 personas"), t.join("\n"));
});

test("sugerir a cargo: salta al ausente y al que ya está a cargo de otra", () => {
  let d = martesPrecargado();
  assert.deepEqual(sugerirACargo(d, 5), { pid: "mino", por: "la tuvo el 09/10" });
  d = conAusencia(d, "mino");
  assert.deepEqual(sugerirACargo(d, 5), { pid: "valenzuela", por: "de los que van" });
  // Ortega tuvo Rivadavia el lunes: es el primero para la 3.
  assert.deepEqual(sugerirACargo(martesPrecargado(), 3), { pid: "ortega", por: "ayer en Av. Rivadavia 6150" });
});

test("ausente puesto en una hoja y sin celular", () => {
  let d = conAusencia(martesArmado(), "avila");
  const ps = problemas(d, 3, LUN_1830).map((p) => p.t);
  assert.ok(ps.includes("Ávila está en la Cuadrilla 3 y no viene (enfermedad)"), ps.join("\n"));
  d = martesArmado();
  const p5 = problemas(d, 5, LUN_1830).map((p) => p.t);
  assert.ok(p5.includes("Miño no tiene celular cargado"), p5.join("\n"));
  // Más gente que la prevista no es problema.
  const d2 = poner(martesArmado(), 3, "ramirez");
  assert.ok(!problemas(d2, 3, LUN_1830).some((p) => p.k === "pocos"));
});

test("rojo recién a las 19:00 del día anterior", () => {
  const d = martesPrecargado();
  assert.ok(problemas(d, 4, LUN_1830).every((p) => !p.rojo));
  assert.ok(problemas(d, 4, LUN_1905).some((p) => p.rojo));
});

test("sin asignar: primero los que pueden estar a cargo; los ausentes no", () => {
  const d = martesPrecargado();
  const l = sinAsignar(d);
  assert.ok(l.includes("paz") && l.includes("ramirez"));
  assert.ok(!l.includes("medina"));
  assert.ok(!l.includes("kiska"));
});

// ─── El chofer ──────────────────────────────────────────────────────────────

test("chofer con 1–5: soltar un chofer en una cuadrilla sin chofer la pasa a lleva y trae", () => {
  const d = martesArmado();
  const c = planSoltarChofer(d, 4, "kiska");
  assert.equal(c.modo, "lleva_trae");
  assert.equal(c.choferId, "kiska");
  assert.equal(c.vehiculoId, "af669");
  assert.deepEqual(c.encuentro, { lugar: "deposito", texto: null, hora: "7:00" });
  assert.equal(c.lleva, "7:00");
  // En una que ya tiene modo, sólo cambia el chofer.
  const c3 = planSoltarChofer(d, 3, "gomez");
  assert.equal(c3.modo, "lleva_trae");
  assert.equal(c3.vehiculoId, "ab497");
});

test("chofer todo el día en dos cuadrillas: el aviso fuerte va en la que se tocó último", () => {
  const d = martesArmado();
  d.hojas = d.hojas.map((h) => (h.cuadrillaOdooId === 4 ? { ...h, modo: "todo_el_dia", choferId: "borda", vehiculoId: "ab831", choferTocadoMin: -300 } : h));
  const p4 = problemas(d, 4, LUN_1830).find((p) => p.k.startsWith("chdup"))!;
  assert.equal(p4.card, "Borda ya está todo el día con la 1");
  const p1 = problemas(d, 1, LUN_1830).find((p) => p.k.startsWith("chdup"))!;
  assert.equal(p1.card, "Borda también figura todo el día en la 4");
});

// ─── Camiones ───────────────────────────────────────────────────────────────

test("las horas de Kiska: fijas donde alguien espera, el resto estimadas", () => {
  const d = martesArmado();
  const ts = calcVeh(d, "af669");
  assert.deepEqual(ts.map((v) => [v.id, hm(v.t)]), [
    ["c2-lleva", "7:00"], ["c3-lleva", "7:45"], ["v-sanz", "10:00"], ["v-vtv", "14:00"], ["c3-busca", "16:30"], ["c2-busca", "17:00"],
  ]);
  assert.ok(ts.every((v) => !v.conflicto));
  assert.equal(textoViaje(d, ts[0]), "Lleva a la Cuadrilla 2 a Juramento 2145");
  assert.equal(textoViaje(d, ts[2]), "Busca la compra en Galvanizados Sanz: 100 tablones");
  assert.equal(textoViaje(d, ts[4]), "Busca a la Cuadrilla 3 en Av. Rivadavia 6150");
});

test("la VTV a las 16:00 hace llegar tarde al busca de la 3", () => {
  const d = martesArmado();
  d.viajes = d.viajes.map((v) => (v.id === "v-vtv" ? { ...v, hora: "16:00", orden: 960 } : v));
  const av = avisosVeh(d, "af669", LUN_1830).map((a) => a.t);
  assert.ok(av.includes("Kiska llegaría ~17:30 a buscar a la Cuadrilla 3 (16:30)"), av.join("\n"));
});

test("dónde anda Kiska el martes a las 9:30, sin GPS", () => {
  const d = martesArmado();
  d.viajes = d.viajes.map((v) => (v.id === "c2-lleva" ? { ...v, estado: "hecho", hechoMin: 455 } : v.id === "c3-lleva" ? { ...v, estado: "hecho", hechoMin: 505 } : v));
  assert.equal(dondeAnda(d, "af669", 510).t, "Libre desde las 8:25 · en Av. Rivadavia 6150 · después compra Sanz ~10:00");
  assert.equal(dondeAnda(d, "af669", 570).t, "Hizo Av. Rivadavia 6150 (8:25) · ahora hacia Galvanizados Sanz (~10:00)");
  assert.equal(dondeAnda(d, "ab831", 510).t, "Con la Cuadrilla 1 en Av. del Libertador 5980");
  // Sin noticias: pasó más de una hora de lo estimado y no marcó nada.
  const sn = dondeAnda(d, "af669", 12 * 60 + 30);
  assert.equal(sn.sinNoticias, true);
});

test("10:20, el pedido de Conte: Gómez está cerca y Kiska libre; Borda y Nuñez no sirven", () => {
  const d = martesArmado();
  d.viajes = d.viajes.map((v) => {
    if (v.id === "c2-lleva") return { ...v, estado: "hecho", hechoMin: 455 };
    if (v.id === "c3-lleva") return { ...v, estado: "hecho", hechoMin: 505 };
    if (v.id === "v-gur") return { ...v, estado: "hecho", hechoMin: 520 };
    if (v.id === "v-sanz") return { ...v, estado: "no_pudo", hechoMin: 612, noPudoMotivo: "No estaba listo" };
    return v;
  });
  const ped = pedido("p-conte", { que: "6 tablones y 2 bases", hacia: { otId: OT.cab, lugarId: null, texto: null }, urgencia: "hora", horaLimite: "13:00", pidioId: "conte", creadoMin: 620 });
  const q = camionesQueSirven(d, ped, 620);
  assert.equal(q.cerca?.ch, "gomez");
  assert.equal(q.libre?.ch, "kiska");
  assert.deepEqual(q.no.map((x) => x.t).sort(), [
    "Borda está todo el día con la 1 (hidrogrúa)",
    "Nuñez está todo el día con la 5",
    "el AH 410 LD tiene la VTV vencida y no tiene chofer",
    "la S10 no tiene chofer hoy",
  ]);
  // Soltarlo en Gómez después de Juramento: hereda la vuelta y sale de Juramento.
  const plan = planPonerPedido({ ...d, pedidos: [...d.pedidos, ped] }, ped, "ab497", 620);
  assert.ok("nuevo" in plan);
  if ("nuevo" in plan) {
    assert.equal(plan.cederVueltaDe, "v-jur");
    assert.equal(plan.nuevo.vuelta, true);
    assert.equal(plan.nuevo.desde?.otId, OT.jur);
    assert.equal(plan.nuevo.carga, "6 tablones y 2 bases (de lo desarmado)");
  }
});

test("un pedido en un camión de todo el día avisa y deja seguir", () => {
  const d = martesArmado();
  d.viajes.push(viaje("v-hep", { tipo: "lleva_material", vehiculoId: "ab831", choferId: "borda", hacia: { otId: OT.gur, lugarId: null, texto: null }, carga: "1 escalera", orden: 700, noAntesDe: "11:15" }));
  const av = avisosVeh(d, "ab831", 665);
  assert.ok(av.some((a) => a.k === "todo-v-hep" && a.t.startsWith("Borda está todo el día con la Cuadrilla 1. Si lo sacás, la 1 se queda sin hidrogrúa")));
});

test("nadie busca a la Cuadrilla 3 si se saca el busca del camión", () => {
  const d = martesArmado();
  d.viajes = d.viajes.map((v) => (v.id === "c3-busca" ? { ...v, vehiculoId: null, choferId: null } : v));
  const t = problemas(d, 3, LUN_1830).map((p) => p.t);
  assert.ok(t.includes("Nadie busca a la Cuadrilla 3 en Av. Rivadavia 6150"), t.join("\n"));
});

test("Galvanizados Sanz atiende hasta las 16", () => {
  const d = martesArmado();
  d.viajes = d.viajes.map((v) => (v.id === "v-sanz" ? { ...v, noAntesDe: "15:30", orden: 950 } : v));
  const av = avisosVeh(d, "af669", LUN_1830).map((a) => a.t);
  assert.ok(av.some((t) => t.startsWith("Galvanizados Sanz atiende hasta las 16:00")), av.join("\n"));
});

// ─── Pedidos ────────────────────────────────────────────────────────────────

test("la cola: frena la obra, con hora, prometido, hoy; el orden a mano gana", () => {
  const ps = [
    pedido("hoy", { urgencia: "hoy", creadoMin: 1 }),
    pedido("hora", { urgencia: "hora", horaLimite: "13:00", creadoMin: 2 }),
    pedido("frena", { urgencia: "frena", creadoMin: 3 }),
    pedido("cliente", { urgencia: "cliente", creadoMin: 0 }),
  ];
  assert.deepEqual(ordenCola(ps).map((p) => p.id), ["frena", "hora", "cliente", "hoy"]);
  ps[0].ordenManual = -1;
  assert.equal(ordenCola(ps)[0].id, "hoy");
});

test("No pude: el pedido vuelve a la cola; esperando vuelve solo a su hora", () => {
  const d = martesArmado();
  const p = pedido("p-sanz2", { que: "100 tablones", tipo: "compra", hacia: { otId: null, lugarId: "sanz", texto: null }, esperandoHastaMin: 900, esperandoMotivo: "No está listo" });
  d.pedidos.push(p);
  assert.equal(estadoPedido(d, p, 700).k, "esperando");
  assert.equal(estadoPedido(d, p, 901).k, "sin");
  const c = cola(d, 901);
  assert.ok(c.vos.some((x) => x.p.id === "p-sanz2"));
});

test("sugeridos de la noche anterior: arranca Gurruchaga, terminan Juramento y San Juan", () => {
  const d = martesPrecargado();
  const s = sugeridosDe(d, LUN_1830);
  assert.deepEqual(s.map((x) => x.key).sort(), [`arranca-${OT.gur}`, `termina-${OT.jur}`, `termina-${OT.sj}`].sort());
  const sj = s.find((x) => x.otId === OT.sj)!;
  assert.equal(sj.enCamion, "ab799");
  assert.equal(sj.txt, "Termina el desarme de Av. San Juan 2840: Nuñez trae lo desarmado al terminar");
  assert.equal(s.find((x) => x.otId === OT.jur)!.noAntesDe, "10:15");
  // "No hace falta" (o aceptado): no vuelve a aparecer.
  d.pedidos.push(pedido("x", { estado: "anulado", sugeridoRegla: "termina", sugeridoOtId: OT.jur }));
  assert.equal(sugeridosDe(d, LUN_1830).length, 2);
});

test("el pedido se deduce del destino", () => {
  const d = martesArmado();
  assert.equal(tipoPorDestino(d, { otId: OT.cab, lugarId: null, texto: null }), "lleva_material");
  assert.equal(tipoPorDestino(d, { otId: OT.cab, lugarId: null, texto: null }, true), "trae_material");
  assert.equal(tipoPorDestino(d, { otId: null, lugarId: "sanz", texto: null }), "compra");
  assert.equal(tipoPorDestino(d, { otId: null, lugarId: "vtv", texto: null }), "taller");
  assert.equal(pidioPorDefecto(d, { otId: OT.cab, lugarId: null, texto: null }), "conte");
});

// ─── Envíos ─────────────────────────────────────────────────────────────────

const DEST = ["sack", "conte", "ortega", "hepper", "mino", "kiska", "gomez", "borda", "nunez"];

test("estados después de enviar: enviada, abierta, recibida, cambiada, cambio enviado, entendido", () => {
  let d = enviarATodos(martesArmado(), -318, DEST);
  assert.equal(estadoHoja(d, 3, LUN_1905).txt, "Enviada 18:44");
  const e = (pid: string) => d.envios.find((x) => x.personaId === pid)!;
  e("ortega").abiertaMin = 20 * 60 + 15 - 1440;
  assert.equal(estadoHoja({ ...d }, 3, -200).txt, "Abierta 20:15");
  d = { ...d, envios: d.envios.map((x) => (x.personaId === "ortega" ? { ...x, recibidaMin: 20 * 60 + 16 - 1440, snapRecibido: x.snap } : x)) };
  assert.equal(estadoHoja(d, 3, -200).txt, "Recibida 20:16");
  // 6:40: Ávila no viene, entra Ramírez.
  let d2 = poner(sacar(conAusencia(d, "avila"), "avila"), 3, "ramirez");
  const st = estadoHoja(d2, 3, MAR_0640);
  assert.equal(st.k, "cambiada");
  assert.equal(fmtComa(st.ds!), "No va Ávila, va Ramírez");
  assert.equal(st.ds![0].motivo, "enfermedad");
  // Sólo a los afectados: Ortega sí, Conte no.
  assert.deepEqual(afectadosPorCambio(d2).map((x) => x.pid), ["ortega"]);
  // Se avisa: la foto pasa a ser la de ahora.
  d2 = { ...d2, envios: d2.envios.map((x) => (x.personaId === "ortega" ? { ...x, cambioMin: 403, snap: fotoDe(d2, "ortega"), version: 2 } : x)) };
  assert.equal(estadoHoja(d2, 3, 404).txt, "Cambio enviado 6:43");
  d2 = { ...d2, envios: d2.envios.map((x) => (x.personaId === "ortega" ? { ...x, abiertaMin: 404, recibidaMin: 405 } : x)) };
  assert.equal(estadoHoja(d2, 3, 406).txt, "Entendido 6:45");
});

test("enviada y no abierta: en rojo a las 6:30", () => {
  const d = enviarATodos(martesArmado(), -316, DEST);
  assert.equal(estadoHoja(d, 4, 389).k, "enviada");
  assert.equal(estadoHoja(d, 4, 391).txt, "No la abrió · enviada 18:47");
  const b = bandeja(d, 391);
  assert.ok(b.esp.some((x) => x.t.startsWith("Hepper no la abrió")));
});

test("cambio en el tablero: Cuba pasa a la 4 y avisa el encuentro y la sobrecarga", () => {
  const base = enviarATodos(martesArmado(), -318, DEST);
  const d: DiaHoja = { ...base, obras: base.obras.map((o) => (o.otId === OT.cuba ? { ...o, cuadrillaOdooId: 4, ordenDia: 0 } : o)) };
  const s4 = estadoHoja(d, 4, 450);
  assert.equal(s4.k, "cambiada");
  const t4 = s4.ds!.map((x) => x.t);
  assert.ok(t4.includes("entra Cuba 1980 a las 8:00"), t4.join(" | "));
  assert.ok(t4.includes("encuentro 8:00 en Cuba 1980 (antes Gurruchaga 1650)"), t4.join(" | "));
  const s2 = estadoHoja(d, 2, 450);
  assert.ok(s2.ds!.some((x) => x.t === "sale Cuba 1980" && x.motivo === "pasó a la Cuadrilla 4"));
  // La 4 queda con 1¼ jornada.
  assert.ok(problemas(d, 4, 450).some((p) => p.t.startsWith("La Cuadrilla 4 tiene 1¼ jornada: Gurruchaga 1650 terminaría")));
  // Afecta a Conte y a Hepper.
  assert.deepEqual(afectadosPorCambio(d).map((x) => x.pid).sort(), ["conte", "hepper"]);
});

test("las horas estimadas que se corren no marcan cambiada; las fijas sí", () => {
  const base = enviarATodos(martesArmado(), -318, DEST);
  // Corre la compra de Sanz (estimada): a Kiska no le cambia nada que haya que avisar.
  const d1 = { ...base, viajes: base.viajes.map((v) => (v.id === "v-sanz" ? { ...v, noAntesDe: "10:30" } : v)) };
  assert.equal(afectadosPorCambio(d1).length, 0);
  // La VTV (fija) pasa a las 14:30: sí.
  const d2 = { ...base, viajes: base.viajes.map((v) => (v.id === "v-vtv" ? { ...v, hora: "14:30", orden: 870 } : v)) };
  const af = afectadosPorCambio(d2);
  assert.deepEqual(af.map((x) => x.pid), ["kiska"]);
  assert.equal(af[0].ds[0].t, "Planta de VTV a las 14:30 (antes 14:00)");
});

test("viaje nuevo al chofer: la diferencia lo dice con quién lo pidió", () => {
  const base = enviarATodos(martesArmado(), -318, DEST);
  const v: Viaje = viaje("v-cab", { tipo: "lleva_material", vehiculoId: "ab497", choferId: "gomez", hacia: { otId: OT.cab, lugarId: null, texto: null }, desde: { otId: OT.jur, lugarId: null, texto: null }, carga: "6 tablones y 2 bases", orden: 620, creadoMin: 623 });
  const d: DiaHoja = { ...base, viajes: [...base.viajes, v], pedidos: [...base.pedidos, pedido("pc", { viajeId: "v-cab", pidioId: "conte", horaLimite: "13:00", hacia: v.hacia, que: "6 tablones y 2 bases" })] };
  const e = d.envios.find((x) => x.personaId === "gomez")!;
  const ds = diferencias(d, e.snap, fotoDe(d, "gomez"));
  assert.equal(ds.length, 1);
  assert.equal(ds[0].t, "llevá 6 tablones y 2 bases a Av. Cabildo 3260 (Conte, antes de las 13)");
  assert.ok(viajesChofer(d, "gomez").some((x) => x.id === "v-cab"));
});

// ─── Después ────────────────────────────────────────────────────────────────

test("fletes del día por obra: el busca no suma", () => {
  const d = martesArmado();
  d.viajes.push(viaje("v-cab", { tipo: "lleva_material", vehiculoId: "ab497", choferId: "gomez", hacia: { otId: OT.cab, lugarId: null, texto: null }, carga: "6 tablones", orden: 620 }));
  assert.equal(fletesDelDia(d, OT.jur).length, 2); // el lleva de las 7:00 y el trae de Gómez
  assert.equal(fletesDelDia(d, OT.cuba).length, 0);
  assert.equal(fletesDelDia(d, OT.cab).length, 1); // el pedido; el busca de las 17 no suma
});

test("lista de carga: lo que sale del depósito con carga y lo que vuelve", () => {
  const L = listaCarga(martesArmado(), LUN_1830);
  assert.ok(L.sale.some((x) => x.txt === "20 tablones y 2 escaleras para Cabildo → Juramento 2145 (va con la Cuadrilla 2)"));
  assert.ok(L.sale.some((x) => hm(x.t) === "7:30" && x.veh === "ab497"));
  assert.ok(L.recibir.some((x) => x.txt.startsWith("La compra de Galvanizados Sanz")));
});

// ─── Ausencias ──────────────────────────────────────────────────────────────

test("el alta no borra el pasado", () => {
  assert.deepEqual(altaDeAusencia({ desde: "2026-10-13", hasta: null }, "2026-10-16"), { hasta: "2026-10-15" });
  assert.deepEqual(altaDeAusencia({ desde: "2026-10-13", hasta: "2026-10-14" }, "2026-10-20"), { hasta: "2026-10-14" });
  // Empezaba ese mismo día: no hubo ausencia, se anula.
  assert.deepEqual(altaDeAusencia({ desde: "2026-10-16", hasta: null }, "2026-10-16"), { anular: true });
});

test("las ART de la asistencia aparecen solas, hasta que alguien carga algo", () => {
  const filas = [
    { personaId: "medina", fecha: "2026-10-12", estado: "ausente", tipoAusencia: "accidente" },
    { personaId: "medina", fecha: "2026-10-09", estado: "presente", tipoAusencia: null },
    { personaId: "avila", fecha: "2026-10-12", estado: "ausente", tipoAusencia: "personal" },
    { personaId: "paz", fecha: "2026-10-09", estado: "ausente", tipoAusencia: "enfermedad" },
    { personaId: "paz", fecha: "2026-10-12", estado: "presente", tipoAusencia: null },
  ];
  const a = ausenciasDeAsistencia(filas, []);
  assert.deepEqual(a.map((x) => [x.personaId, x.tipo, x.desde, x.hasta]), [["medina", "art", "2026-10-12", null]]);
  // "Ya tiene el alta" la cierra con una ausencia guardada: deja de aparecer.
  const cerrada = { ...a[0], id: "g1", hasta: "2026-10-15" };
  assert.equal(ausenciasDeAsistencia(filas, [cerrada]).length, 0);
});

test("ausencia parcial: se retira a las 14", () => {
  const d = martesArmado();
  d.ausencias.push({ id: "p1", personaId: "kiska", desde: d.fecha, hasta: d.fecha, tipo: "tramite", horaDesde: null, horaHasta: "14:00", nota: null, origen: "planificador" });
  assert.equal(ausenteEn(d, "kiska", "10:00"), null);
  assert.ok(ausenteEn(d, "kiska", "15:00"));
  const t = problemas(d, 2, LUN_1830).map((p) => p.t);
  assert.ok(t.includes("Kiska se retira a las 14 y busca a la Cuadrilla 2 a las 17:00"), t.join("\n"));
  assert.ok(avisosVeh(d, "af669", LUN_1830).some((a) => a.t === "Kiska se retira a las 14 (trámite) y tiene viajes después"));
});

test("panel Gente: no disponibles, choferes y vehículos", () => {
  const p = panelGente(martesArmado());
  assert.ok(p.noDisponibles.some((x) => x.txt === "Medina · ART desde el 13/10 · sin fecha de alta (según la asistencia)"));
  assert.ok(p.choferes.some((x) => x.txt === "Kiska · 6 viajes"));
  assert.ok(p.choferes.some((x) => x.txt === "Borda · todo el día con la 1"));
  assert.ok(p.vehiculos.some((x) => x.veh === "ah410" && x.problema === "la VTV vencida desde el 02/10"));
});

test("aplicarPlan es la misma escritura que hace el servidor (sanidad del fixture)", () => {
  const d = martesVacio();
  const p = aplicarPlan(d, planPrecarga(d, "hoy").hojas);
  assert.equal(p.hojas.length, 5);
  assert.equal(sinCargo(p, 5).integrantes.some((i) => i.aCargo), false);
});
