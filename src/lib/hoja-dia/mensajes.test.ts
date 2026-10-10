// Los textos que salen (mensajes.ts), los botones de Telegram (telegram.ts) y los tokens
// del link (tokens.ts), con el escenario de la maqueta.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mensajeCambioChofer, mensajeCambioHoja, mensajeDe, mensajeDeposito, mensajeHoja, mensajeOperario, mensajeTarde, mensajeViajes, filaEnvio, TELEGRAM,
} from "./mensajes.ts";
import { calcVeh, diferencias, fotoDe } from "./estado.ts";
import { codificar, decodificar, leerStart, tecladoHoja, tecladoMotivos, tecladoViaje } from "./telegram.ts";
import { codigoValido, expiraDe, nuevoCodigoTelegram, nuevoToken, situacionLink, tokenValido, urlHoja } from "./tokens.ts";
import type { DiaHoja } from "./tipos.ts";
import { OT, enviarATodos, martesArmado, pedido, viaje } from "./escenario.test-fixture.ts";

const LINK = "https://andamios-os.vercel.app/h/7KQ2MX9P";
const W = { canal: "whatsapp" as const, link: LINK, ahora: -300 };
const T = { canal: "telegram" as const, link: LINK, ahora: -300 };

test("la hoja del capataz, por WhatsApp y por Telegram", () => {
  const d = martesArmado();
  assert.equal(
    mensajeHoja(d, "ortega", 3, W),
    `Hola Ortega, tu hoja del martes 13/10: Cuadrilla 3, a cargo vos. Encuentro 7:45 en el depósito, te lleva Kiska. Obra: Av. Rivadavia 6150. Mirá todo acá: ${LINK} Cuando la veas tocá "Recibido".`,
  );
  // Por Telegram el link va en el botón, no en el texto.
  assert.equal(
    mensajeHoja(d, "conte", 2, T),
    "Hola Conte, tu hoja del martes 13/10: Cuadrilla 2, a cargo vos. Encuentro 7:00 en el depósito, te lleva Kiska. Obras: Juramento 2145, Cuba 1980 y Av. Cabildo 3260. Cuando la veas tocá \"Recibido\".",
  );
});

test("los viajes del chofer: los tres primeros y cuántos más", () => {
  const d = martesArmado();
  assert.equal(
    mensajeViajes(d, "kiska", T),
    "Hola Kiska, tus viajes del martes 13/10: 7:00 lleva a la Cuadrilla 2 a Juramento 2145; 7:45 lleva a la Cuadrilla 3 a Av. Rivadavia 6150; ~10:00 busca la compra en Galvanizados Sanz: 100 tablones; y 3 más. Cuando los veas tocá \"Recibido\".",
  );
  assert.match(mensajeViajes(d, "borda", T), /^Hola Borda, el martes 13\/10 vas todo el día con la Cuadrilla 1 \(Sack\) con el Agrale hidrogrúa AB 831 LC\. Encuentro 7:00 en el depósito\./);
});

test("el cambio de las 6:43, en palabras", () => {
  const d = martesArmado();
  const ds = [{ t: "no va Ávila", motivo: "enfermedad" }, { t: "va Ramírez" }];
  assert.equal(mensajeCambioHoja(d, "ortega", 3, ds, { ...T, ahora: 403 }), "Ortega, cambió tu hoja de hoy (6:43): no va Ávila, va Ramírez.");
  assert.equal(
    mensajeCambioHoja(d, "ortega", 3, ds, { ...W, ahora: 403 }),
    `Ortega, cambió tu hoja de hoy (6:43): no va Ávila, va Ramírez. Mirá: ${LINK}`,
  );
});

test("viaje nuevo a Gómez: dónde cae en su recorrido y quién lo pidió", () => {
  const base = enviarATodos(martesArmado(), -318, ["gomez"]);
  const v = viaje("v-cab", { tipo: "lleva_material", vehiculoId: "ab497", choferId: "gomez", hacia: { otId: OT.cab, lugarId: null, texto: null }, desde: { otId: OT.jur, lugarId: null, texto: null }, carga: "6 tablones y 2 bases", orden: 620, noAntesDe: "10:30" });
  const d: DiaHoja = { ...base, viajes: [...base.viajes, v], pedidos: [...base.pedidos, pedido("pc", { viajeId: "v-cab", pidioId: "conte", horaLimite: "13:00", hacia: v.hacia, que: v.carga! })] };
  const ds = diferencias(d, d.envios[0].snap, fotoDe(d, "gomez"));
  assert.equal(
    mensajeCambioChofer(d, "gomez", ds, { ...T, ahora: 623 }),
    "Gómez, viaje nuevo (10:23): después de cargar en Juramento 2145, llevá 6 tablones y 2 bases a Av. Cabildo 3260 (Conte, antes de las 13).",
  );
  // mensajeDe elige el de cambio porque ya se le había mandado.
  assert.match(mensajeDe(d, { pid: "gomez", rol: "chofer" }, { ...T, ahora: 623 })!, /^Gómez, viaje nuevo/);
});

test("al depósito, al operario que entra y la fila de envío", () => {
  const d = martesArmado();
  const v = calcVeh(d, "ab497").find((x) => x.id === "v-gur")!;
  assert.equal(mensajeDeposito(d, v), "Depósito: a las 7:30 carga Gómez (AB 497 YY): material del armado de Gurruchaga 1650 (según cómputo) para Gurruchaga 1650.");
  assert.equal(mensajeOperario(d, "paz", 400), "Paz, hoy vas con la Cuadrilla 4 (a cargo Hepper). Encuentro 8:00 en la obra, van por su cuenta.");
  assert.equal(filaEnvio(d, { pid: "mino", rol: "cargo", c: 5 }), "Miño · Cuadrilla 5 · Av. San Juan 2840 · sin celular cargado");
  assert.equal(filaEnvio(d, { pid: "kiska", rol: "chofer" }), "Kiska · chofer · 6 viajes");
  assert.equal(TELEGRAM.vinculado("Ortega"), "Listo, Ortega. Acá te van a llegar tus hojas del día.");
});

test("Telegram: los botones van y vuelven", () => {
  const id = "0b9f9c1e-2f7a-4c55-9d3e-7a1b2c3d4e5f";
  for (const c of [
    { a: "recibido" as const, link: id, version: 3 },
    { a: "entendido" as const, link: id, version: 12 },
    { a: "hecho" as const, viaje: id },
    { a: "no_pude" as const, viaje: id },
    { a: "motivo" as const, viaje: id, i: 4 },
    { a: "volver" as const, viaje: id },
  ]) {
    const s = codificar(c);
    assert.ok(Buffer.byteLength(s) <= 64, s);
    assert.deepEqual(decodificar(s), c);
  }
  assert.equal(decodificar("r:no-es-un-uuid:1"), null);
  assert.equal(decodificar(""), null);
});

test("Telegram: teclados y /start", () => {
  const id = "0b9f9c1e-2f7a-4c55-9d3e-7a1b2c3d4e5f";
  assert.deepEqual(tecladoHoja("https://x.com/h/abc", id, 1).map((f) => f.map((b) => b.text)), [["Ver la hoja"], ["Recibido"]]);
  // Sin https (en local) no hay botón de URL: Telegram lo rechazaría.
  assert.deepEqual(tecladoHoja("http://localhost:3000/h/abc", id, 1).map((f) => f.map((b) => b.text)), [["Recibido"]]);
  assert.deepEqual(tecladoViaje(null, id)[0].map((b) => b.text), ["Hecho", "No pude"]);
  assert.equal(tecladoMotivos(id, ["No estaba listo", "Estaba cerrado"]).length, 3);
  assert.equal(leerStart("/start abc123XYZ"), "abc123XYZ");
  assert.equal(leerStart("/start"), "");
  assert.equal(leerStart("hola"), null);
});

test("tokens: 32 caracteres sin ambiguos, vencen a las 23:59 del día siguiente", () => {
  const t = nuevoToken();
  assert.equal(t.length, 32);
  assert.ok(tokenValido(t));
  assert.ok(!/[01OIl]/.test(t));
  assert.ok(!tokenValido("../../etc"));
  assert.ok(codigoValido(nuevoCodigoTelegram()));
  assert.equal(expiraDe("2026-10-13"), "2026-10-15T02:59:59.000Z");
  assert.equal(situacionLink({ fecha: "2026-10-13", expira_at: expiraDe("2026-10-13"), anulado_at: null }, new Date("2026-10-14T20:00:00-03:00")), "ok");
  assert.equal(situacionLink({ fecha: "2026-10-13", expira_at: expiraDe("2026-10-13"), anulado_at: null }, new Date("2026-10-15T00:01:00-03:00")), "vencido");
  assert.equal(situacionLink({ fecha: "2026-10-13", expira_at: expiraDe("2026-10-13"), anulado_at: "2026-10-13T10:00:00Z" }), "anulado");
  assert.equal(urlHoja("https://a.b/", t), `https://a.b/h/${t}`);
});

test("Avisar tarde: un mensaje al capataz con la hora a la que llega el chofer", () => {
  const d = martesArmado();
  const bu = d.viajes.find((v) => v.id === "c3-busca") ?? d.viajes.find((v) => v.tipo === "busca" && v.cuadrillaOdooId === 3)!;
  const v = { ...calcVeh(d, bu.vehiculoId!).find((x) => x.id === bu.id)!, conflicto: { llega: 16 * 60 + 50, prevId: null } };
  const m = mensajeTarde(d, v)!;
  assert.equal(m.pid, "ortega");
  assert.match(m.texto, /^Ortega, .+ llega ~16:50 a buscarlos \(no a las 16:30\)\./);
  assert.equal(mensajeTarde(d, { ...v, conflicto: null }), null);
});
