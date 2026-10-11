// Los tramos que se le piden a Google (rutas.ts) y los links a Maps (maps.ts), con el
// escenario de la maqueta: martes 13/10.

import { test } from "node:test";
import assert from "node:assert/strict";
import { comoLlegarViaje, depositoSinUbicar, paresDelDia, puntoDeKey, recorridoCamion, recorridoChofer } from "./rutas.ts";
import { MAX_WAYPOINTS, puntoMaps, urlComoLlegar, urlRecorrido } from "./maps.ts";
import { armarVista } from "./vista.ts";
import { calcVeh } from "./estado.ts";
import type { DiaHoja } from "./tipos.ts";
import { OT, martesArmado } from "./escenario.test-fixture.ts";

const sinDeposito = (d: DiaHoja): DiaHoja => ({ ...d, lugares: d.lugares.map((l) => (l.tipo === "deposito" ? { ...l, direccion: null, lat: null, lng: null } : l)) });
const params = (url: string) => new URL(url).searchParams;

test("paresDelDia: los tramos de los camiones y de las cuadrillas, sin repetir", () => {
  const ps = paresDelDia(martesArmado());
  const ks = ps.map((p) => `${p.desde}>${p.hacia}`);
  assert.equal(new Set(ks).size, ks.length, "sin repetidos");
  // Paradas seguidas de Kiska y la vuelta del "trae" de Juramento.
  assert.ok(ks.includes(`l:dep>o:${OT.jur}`));
  assert.ok(ks.includes(`o:${OT.jur}>o:${OT.riv}`));
  assert.ok(ks.includes(`o:${OT.jur}>l:dep`), "vuelta al depósito");
  // Cuadrillas: de una obra a la siguiente (la 2: Juramento → Cuba → Cabildo) y la última al depósito.
  assert.ok(ks.includes(`o:${OT.jur}>o:${OT.cuba}`));
  assert.ok(ks.includes(`o:${OT.cuba}>o:${OT.cab}`));
  assert.ok(ks.includes(`o:${OT.cab}>l:dep`));
  // La VTV a las 14 es hora de llegada: el tránsito se mira media hora antes.
  assert.equal(ps.find((p) => p.desde === "l:dep" && p.hacia === "l:vtv")?.salida, 14 * 60 - 30);
  // Cada uno con sus coordenadas.
  const dep = ps.find((p) => p.desde === "l:dep")!;
  assert.deepEqual(dep.o, { lat: -34.6005, lng: -58.5125 });
});

test("paresDelDia: sin coordenadas del depósito, nada que salga o vuelva ahí (y se avisa)", () => {
  const d = sinDeposito(martesArmado());
  assert.equal(depositoSinUbicar(d), true);
  assert.equal(depositoSinUbicar(martesArmado()), false);
  const ps = paresDelDia(d);
  assert.ok(ps.length > 0);
  assert.ok(ps.every((p) => p.desde !== "l:dep" && p.hacia !== "l:dep"));
  assert.ok(ps.some((p) => p.desde === `o:${OT.jur}` && p.hacia === `o:${OT.riv}`));
});

test("paresDelDia: lo hecho no se pide (salvo su vuelta)", () => {
  const d0 = martesArmado();
  const d: DiaHoja = { ...d0, viajes: d0.viajes.map((v) => (v.id === "c2-lleva" ? { ...v, estado: "hecho", hechoMin: 455 } : v)) };
  const ks = paresDelDia(d).map((p) => `${p.desde}>${p.hacia}`);
  // El lleva de la 2 está hecho; el depósito → Juramento igual aparece por la cuadrilla (ir a la primera obra).
  assert.equal(ks.filter((k) => k === `l:dep>o:${OT.jur}`).length, 1);
});

test("puntoMaps / urlComoLlegar: coordenadas si hay, si no la dirección con Buenos Aires", () => {
  assert.equal(puntoMaps({ lat: -34.6, lng: -58.5, dir: "X 1" }), "-34.600000,-58.500000");
  assert.equal(puntoMaps({ lat: null, lng: null, dir: "Av. Rivadavia 6150" }), "Av. Rivadavia 6150, Buenos Aires");
  assert.equal(puntoMaps({ lat: null, lng: null, dir: "Cuba 1980, CABA" }), "Cuba 1980, CABA");
  assert.equal(puntoMaps({ lat: null, lng: null, dir: "  " }), null);
  const u = urlComoLlegar({ lat: null, lng: null, dir: "Av. Rivadavia 6150" })!;
  assert.ok(u.startsWith("https://www.google.com/maps/dir/?api=1&destination="));
  assert.equal(params(u).get("destination"), "Av. Rivadavia 6150, Buenos Aires");
  assert.equal(params(u).get("origin"), null, "sin origen: desde donde está el teléfono");
  assert.equal(params(u).get("travelmode"), "driving");
  const u2 = urlComoLlegar({ lat: -34.6, lng: -58.5, dir: null }, { lat: -34.61, lng: -58.52, dir: null })!;
  assert.equal(params(u2).get("origin"), "-34.610000,-58.520000");
  assert.equal(urlComoLlegar(null), null);
});

test("urlRecorrido: origen, waypoints en orden y destino; sin repetidos seguidos y hasta 9 waypoints", () => {
  const p = (n: number) => ({ lat: null, lng: null, dir: `Calle ${n}` });
  const u = urlRecorrido([p(1), p(2), p(2), null, p(3), p(4)])!;
  assert.equal(params(u).get("origin"), "Calle 1, Buenos Aires");
  assert.equal(params(u).get("destination"), "Calle 4, Buenos Aires");
  assert.equal(params(u).get("waypoints"), "Calle 2, Buenos Aires|Calle 3, Buenos Aires");
  assert.ok(u.includes("waypoints=Calle%202%2C%20Buenos%20Aires%7CCalle%203"), "el | va codificado");
  const largo = urlRecorrido(Array.from({ length: 15 }, (_, i) => p(i + 1)))!;
  assert.equal(params(largo).get("waypoints")!.split("|").length, MAX_WAYPOINTS);
  assert.equal(params(largo).get("destination"), "Calle 11, Buenos Aires");
  assert.equal(urlRecorrido([p(1)]), "https://www.google.com/maps/dir/?api=1&destination=Calle%201%2C%20Buenos%20Aires&travelmode=driving");
  assert.equal(urlRecorrido([null]), null);
});

test("recorridoChofer: desde el depósito, sus paradas que faltan en orden", () => {
  const d = martesArmado();
  const u = recorridoChofer(d, "kiska")!;
  assert.equal(params(u).get("origin"), "-34.600500,-58.512500", "sale del depósito");
  const wps = params(u).get("waypoints")!.split("|");
  // Juramento, Rivadavia, Sanz, VTV, Rivadavia y termina en Cabildo.
  assert.equal(wps.length, 5);
  assert.equal(params(u).get("destination"), puntoMaps(puntoDeKey(d, `o:${OT.cab}`)));
  // Con los primeros hechos, arranca desde donde sale el primero que falta.
  const d2: DiaHoja = { ...d, viajes: d.viajes.map((v) => (v.id === "c2-lleva" || v.id === "c3-lleva" ? { ...v, estado: "hecho", hechoMin: 500 } : v)) };
  assert.equal(params(recorridoChofer(d2, "kiska")!).get("origin"), puntoMaps(puntoDeKey(d, `o:${OT.riv}`)));
  // Gómez termina con un "trae" que vuelve: el destino es el depósito.
  assert.equal(params(recorridoCamion(d, "ab497")!).get("destination"), "-34.600500,-58.512500");
  assert.equal(recorridoChofer(d, "nadie"), null);
});

test("comoLlegarViaje y el celular: Cómo llegar por parada y el recorrido en la vista del chofer", () => {
  const d = martesArmado();
  const v = calcVeh(d, "af669").find((x) => x.id === "v-sanz")!;
  const u = comoLlegarViaje(d, v)!;
  assert.equal(params(u).get("destination"), "-34.587800,-58.505200");
  assert.equal(params(u).get("origin"), puntoMaps(puntoDeKey(d, `o:${OT.riv}`)));
  const vista = armarVista(d, { rol: "chofer", personaId: "kiska", cuadrillaOdooId: null, anulado: false, anuladoPorRol: false, version: 1 }, 600);
  assert.ok(vista.situacion === "ok" && vista.rol === "chofer");
  if (vista.situacion !== "ok" || vista.rol !== "chofer") return;
  assert.equal(vista.recorridoUrl, recorridoChofer(d, "kiska"));
  assert.ok(vista.viajes.every((x) => !x.mapsUrl || x.mapsUrl.startsWith("https://www.google.com/maps/dir/?api=1&destination=")));
  // La VTV no tiene dirección pero sí coordenadas: va al pin.
  assert.equal(params(vista.viajes.find((x) => x.id === "v-vtv")!.mapsUrl!).get("destination"), "-34.612200,-58.525100");
  // Sin dirección del depósito, el recorrido no arranca en "Depósito, Buenos Aires".
  const sd = recorridoChofer(sinDeposito(d), "kiska")!;
  assert.notEqual(params(sd).get("origin"), "Depósito, Buenos Aires");
});
