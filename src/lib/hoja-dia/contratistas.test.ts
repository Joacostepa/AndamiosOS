// Los contratistas en la Hoja del día (decisiones del dueño del 10/10, noche), con el
// martes 13/10 de la maqueta: el martes la Cuadrilla 5 es Quintana (3 suyos + Ramírez, a
// cargo Quintana) y la Cuadrilla 4 tiene un refuerzo de 1 de Quintana.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  aCargoDe, bandeja, destinatarios, diferencias, fotoDe, fotoHoja, horariosCierre, planCopiarComoHoy, planPrecarga, problemas,
  recibeDe, sinAsignar, sugerirACargo, vanDe, nombreDe, persona, pidioPorDefecto,
} from "./estado.ts";
import {
  chipsContratistas, destinosContratista, leerPesos, mesTexto, panelContratistas, pesos, rangoMes, resumenContratistas, resumenMes, vanEnPalabras,
} from "./contratistas.ts";
import { mensajeDe, mensajeHoja, filaEnvio, canalDe } from "./mensajes.ts";
import { armarVista, type VistaCapataz } from "./vista.ts";
import type { DiaHoja, Hoja } from "./tipos.ts";
import { CONTRATISTAS, OT, enviarATodos, hoja, martesArmado, martesVacio } from "./escenario.test-fixture.ts";

const LUN_1830 = -330;
const W = { canal: "whatsapp" as const, link: "https://x/h/T", ahora: LUN_1830 };

const conK = (h: Hoja, kid: string, cantidad: number, aCargo = false): Hoja => ({
  ...h,
  contratistas: [...h.contratistas, { id: `k-${h.cuadrillaOdooId}-${kid}`, contratistaId: kid, cantidad, nota: null, orden: h.contratistas.length }],
  aCargoContratistaId: aCargo ? kid : h.aCargoContratistaId,
  integrantes: aCargo ? h.integrantes.map((i) => ({ ...i, aCargo: false })) : h.integrantes,
});

/** El martes armado con la 5 de Quintana (3 + Ramírez, a cargo Quintana) y 1 de Quintana reforzando la 4. */
function martesConQuintana(): DiaHoja {
  const d = martesArmado();
  const hojas = d.hojas.map((h) => {
    if (h.cuadrillaOdooId === 5) return conK({ ...h, modo: "sin" as const, choferId: null, vehiculoId: null, encuentro: { lugar: "obra" as const, texto: null, hora: "8:00" }, integrantes: [{ id: "i-ram", personaId: "ramirez", aCargo: false, nota: null, orden: 0 }] }, "quintana", 3, true);
    if (h.cuadrillaOdooId === 4) return conK(h, "quintana", 1);
    return h;
  });
  return { ...d, hojas, viajes: d.viajes.filter((v) => v.vehiculoId !== "ab799" || v.hojaId !== "h13-5") };
}

test("Quiénes van: la gente del contratista suma a la dotación", () => {
  const d = martesConQuintana();
  assert.equal(vanDe(d, 5), 4); // 3 de Quintana + Ramírez
  assert.equal(vanDe(d, 4), 6); // 5 nuestros (con Paz; Medina tiene ART) + 1 de Quintana
  assert.equal(resumenContratistas(d, 5), "3 de Quintana");
  assert.equal(vanEnPalabras(d, 5, ["ramirez"]), "3 de Quintana + Ramírez");
  // La 5 prevé 4: con los de Quintana no falta nadie.
  assert.ok(!problemas(d, 5, LUN_1830).some((p) => p.k === "pocos"));
  // Ramírez sigue en una sola cuadrilla y el contratista no aparece en "Sin asignar".
  assert.ok(!sinAsignar(d).includes("quintana"));
});

test("A cargo un contratista: su referente recibe la hoja como un capataz", () => {
  const d = martesConQuintana();
  const h5 = d.hojas.find((h) => h.cuadrillaOdooId === 5)!;
  assert.equal(aCargoDe(h5), "quintana");
  assert.equal(recibeDe(d, 5), "quintana");
  assert.equal(nombreDe(d, "quintana"), "Quintana");
  assert.equal(persona(d, "quintana")?.contratista, true);
  assert.deepEqual(destinatarios(d).find((x) => x.pid === "quintana"), { pid: "quintana", rol: "cargo", c: 5 });
  assert.equal(canalDe(d, "quintana"), "Telegram");
  assert.equal(filaEnvio(d, { pid: "quintana", rol: "cargo", c: 5 }), "Quintana · Cuadrilla 5 · Av. San Juan 2840");
  assert.equal(
    mensajeHoja(d, "quintana", 5, W),
    'Hola Quintana, tu hoja del martes 13/10: Cuadrilla 5, a cargo vos. Encuentro 8:00 en la obra, van por su cuenta. Obra: Av. San Juan 2840. Van: 3 de Quintana + Ramírez. Mirá todo acá: https://x/h/T Cuando la veas tocá "Recibido".',
  );
  // Sin nadie a cargo no es problema; un contratista no es "quien pidió" un pedido (no tiene legajo).
  assert.ok(!problemas(d, 5, LUN_1830).some((p) => p.k === "cargo"));
  assert.equal(pidioPorDefecto(d, { otId: OT.sj, lugarId: null, texto: null }), null);
});

test("el link del referente: «Van 4: 3 de Quintana + Ramírez», a cargo vos", () => {
  const d = enviarATodos(martesConQuintana(), -320, ["quintana"]);
  const v = armarVista(d, { rol: "a_cargo", personaId: "quintana", cuadrillaOdooId: 5, anulado: false, anuladoPorRol: false, version: 1 }, 400) as VistaCapataz;
  assert.equal(v.situacion, "ok");
  assert.equal(v.vos, true);
  assert.equal(v.aCargo, "Quintana");
  assert.equal(v.van, 4);
  assert.equal(v.vanTxt, "3 de Quintana + Ramírez");
  assert.deepEqual(v.gente.map((g) => [g.nombre, g.cantidad ?? 1, !!g.contratista, g.aCargo]), [["Quintana", 3, true, true], ["Ramírez", 1, false, false]]);
  assert.equal(v.gente[0].telefono, "11 4444-1234");
});

test("problemas: sin cuántos (0) y un contratista dado de baja", () => {
  const d0 = martesConQuintana();
  const d: DiaHoja = { ...d0, hojas: d0.hojas.map((h) => (h.cuadrillaOdooId === 4 ? conK(h, "viejo", 0) : h)) };
  const ps = problemas(d, 4, LUN_1830);
  const cant = ps.find((p) => p.k === "kcant-viejo")!;
  assert.equal(cant.card, "Falta cuántos van de Ferraro");
  assert.deepEqual(cant.bs, [{ l: "Poner 1", a: "sumarContratista", c: 4, p: "viejo", n: 1 }]);
  assert.equal(ps.find((p) => p.k === "kbaja-viejo")?.nivel, "aviso");
  assert.ok(bandeja(d, LUN_1830).vos.some((x) => x.k === "kcant-viejo-4"));
  const chips = chipsContratistas(d, 4);
  assert.deepEqual(chips.map((x) => [x.texto, x.tag]), [["+1 de Quintana", null], ["Ferraro", "¿cuántos?"]]);
});

test("sin nadie nuestro que suela estar a cargo, se sugiere al contratista", () => {
  const d0 = martesConQuintana();
  const d: DiaHoja = { ...d0, hojas: d0.hojas.map((h) => (h.cuadrillaOdooId === 5 ? { ...h, aCargoContratistaId: null } : h)) };
  // El que tuvo la 5 la última vez (Miño) ya no está en la hoja y Ramírez no suele estar a cargo.
  const s = sugerirACargo({ ...d, ultimasHojas: [] }, 5);
  assert.deepEqual(s, { pid: "quintana", por: "van 3 de Quintana" });
  assert.equal(problemas({ ...d, ultimasHojas: [] }, 5, LUN_1830).find((p) => p.k === "cargo")?.bs[0].l, "Usar Quintana");
});

test("los cambios en palabras: va con 4, pasa de 4 a 3, no va", () => {
  const d0 = martesConQuintana();
  const antes = fotoHoja(d0, 4);
  assert.deepEqual(antes.contr, { quintana: 1 });
  const mas = { ...d0, hojas: d0.hojas.map((h) => (h.cuadrillaOdooId === 4 ? { ...h, contratistas: h.contratistas.map((x) => ({ ...x, cantidad: 4 })) } : h)) };
  assert.deepEqual(diferencias(mas, antes, fotoHoja(mas, 4)).map((x) => x.t), ["Quintana pasa de 1 a 4"]);
  const sin = { ...d0, hojas: d0.hojas.map((h) => (h.cuadrillaOdooId === 4 ? { ...h, contratistas: [] } : h)) };
  assert.deepEqual(diferencias(sin, antes, fotoHoja(sin, 4)).map((x) => x.t), ["no va Quintana"]);
  const sinFoto = { ...antes, contr: undefined };
  assert.deepEqual(diferencias(mas, sinFoto, fotoHoja(mas, 4)).map((x) => x.t), ["va Quintana con 4"]);
  // Mandada la hoja, el cambio de cantidad la deja "Cambiada después de enviar" con el aviso.
  const env = enviarATodos(d0, -320, ["hepper"]);
  const cambio = { ...env, hojas: mas.hojas };
  const m = mensajeDe(cambio, { pid: "hepper", rol: "cargo", c: 4 }, W);
  assert.equal(m, "Hepper, cambió tu hoja del martes 13/10 (18:30): Quintana pasa de 1 a 4. Mirá: https://x/h/T");
  assert.equal(fotoDe(cambio, "hepper")?.tipo, "hoja");
});

test("Empezar como hoy copia los contratistas (y el a cargo) del día anterior", () => {
  const v = martesVacio();
  const lunes = v.anterior!;
  const d: DiaHoja = {
    ...v,
    anterior: { ...lunes, hojas: lunes.hojas.map((h) => (h.cuadrillaOdooId === 4 ? conK(conK(h, "quintana", 4, true), "viejo", 2) : h)) },
  };
  const plan = planPrecarga(d, "hoy");
  const p4 = plan.hojas.find((h) => h.cuadrillaOdooId === 4)!;
  assert.deepEqual(p4.contratistas, [{ contratistaId: "quintana", cantidad: 4, nota: null }]);
  assert.equal(p4.aCargoContratistaId, "quintana");
  assert.equal(p4.aCargoId, null);
  assert.ok(plan.avisos.some((a) => a === "Ferraro está dado de baja: no se copió a la Cuadrilla 4."));
  assert.ok(plan.avisos.some((a) => a.startsWith("Contratistas como el lunes: 4 de Quintana en la 4 (a cargo).")));
  // "Copiar como hoy" de una tarjeta: si el contratista ya está a cargo de otra hoja hoy, no.
  const ocupado: DiaHoja = { ...d, hojas: [conK(hoja(2, [], null), "quintana", 2, true)] };
  const c4 = planCopiarComoHoy(ocupado, 4)!;
  assert.equal(c4.contratistas[0]?.cantidad, 4);
  assert.equal(c4.aCargoContratistaId, null);
});

test("Cerrar jornada: la gente del contratista cuenta en la cantidad (el parte no cambia)", () => {
  const d = martesConQuintana();
  assert.deepEqual(horariosCierre(d, 5, OT.sj), [{ personas: 4, desde: "8:00", hasta: "17:00" }]);
  assert.equal(horariosCierre(d, 4, OT.gur).reduce((s, l) => s + l.personas, 0), 6);
});

test("el panel Gente: dónde está cada contratista y adónde se puede sumar", () => {
  const d = martesConQuintana();
  const p = panelContratistas(d);
  assert.deepEqual(p.map((x) => [x.nombre, x.t, x.total]), [["Quintana", "en la 4 (1) · la 5 (3) a cargo", 4], ["Benegas", "sin cuadrilla", 0]]);
  const dest = destinosContratista(d, "quintana");
  assert.equal(dest.find((x) => x.c === 5)?.detalle, "4 de 4 · ya van 3");
});

test("el resumen del mes: jornadas-persona, dos cuadrillas el mismo día, total y prorrateo por obra", () => {
  const obrasC2 = [{ otId: 1, nombre: "Juramento 2145", fraccion: 0.5 }, { otId: 2, nombre: "Cuba 1980", fraccion: 0.5 }];
  const r = resumenMes(CONTRATISTAS, [
    { fecha: "2026-10-13", cuadrillaOdooId: 4, cuadrilla: "Cuadrilla 4", contratistaId: "quintana", cantidad: 1, obras: [{ otId: 3, nombre: "Gurruchaga 1650", fraccion: 1 }] },
    { fecha: "2026-10-13", cuadrillaOdooId: 5, cuadrilla: "Cuadrilla 5", contratistaId: "quintana", cantidad: 3, obras: [{ otId: 4, nombre: "Av. San Juan 2840", fraccion: 1 }] },
    { fecha: "2026-10-14", cuadrillaOdooId: 2, cuadrilla: "Cuadrilla 2", contratistaId: "quintana", cantidad: 2, obras: obrasC2 },
    { fecha: "2026-10-15", cuadrillaOdooId: 2, cuadrilla: "Cuadrilla 2", contratistaId: "quintana", cantidad: 0, obras: obrasC2 },
    { fecha: "2026-10-14", cuadrillaOdooId: 3, cuadrilla: "Cuadrilla 3", contratistaId: "benegas", cantidad: 2, obras: [] },
  ]);
  const q = r[0];
  assert.equal(q.nombre, "Quintana");
  assert.equal(q.jornadas, 6);
  assert.equal(q.dias, 2);
  assert.equal(q.total, 180000);
  assert.equal(q.sinCantidad, 1);
  assert.deepEqual(q.porObra, [
    { otId: 4, nombre: "Av. San Juan 2840", jornadas: 3 },
    { otId: 3, nombre: "Gurruchaga 1650", jornadas: 1 },
    { otId: 1, nombre: "Juramento 2145", jornadas: 1 },
    { otId: 2, nombre: "Cuba 1980", jornadas: 1 },
  ]);
  assert.equal(q.detalle[0].dia, "martes 13/10");
  const b = r[1];
  assert.equal(b.total, null);
  assert.deepEqual(b.porObra, [{ otId: null, nombre: "Sin obra en el tablero", jornadas: 2 }]);
  assert.equal(r.find((x) => x.id === "viejo"), undefined);
  assert.equal(pesos(180000), "$ 180.000");
  assert.equal(mesTexto("2026-10"), "octubre 2026");
  assert.deepEqual(rangoMes("2026-02"), { desde: "2026-02-01", hasta: "2026-02-28" });
});

test("el valor por jornada se escribe como se escribe en pesos", () => {
  assert.equal(leerPesos("25.000"), 25000);
  assert.equal(leerPesos("$ 25.000,50"), 25000.5);
  assert.equal(leerPesos("30000"), 30000);
  assert.equal(leerPesos("12.5"), 12.5);
  assert.equal(leerPesos(""), null);
  assert.ok(Number.isNaN(leerPesos("mucho")));
});
