// Cómo se nombran los vehículos (pedido del dueño, 11/10): "por la marca, que es como los
// identificamos". Hay cuatro Iveco, así que va la marca y la patente ("Iveco AB 799 CA");
// donde hay lugar, la hidrogrúa lo dice ("Agrale hidrogrúa AB 831 LC"). Sin marca, la patente.

import { test } from "node:test";
import assert from "node:assert/strict";
import { coincideVehiculo, elVeh, articuloVeh, nombreVehiculo, vehiculoNombre, vehTxt, camionesSinUsar } from "./estado.ts";
import { martesArmado, VEHICULOS } from "./escenario.test-fixture.ts";
import { resumenVehiculos, opcionesVehiculo } from "./vista-cuadrillas.ts";
import { choferesEnPalabras } from "./mensajes.ts";

const V = (id: string) => VEHICULOS.find((v) => v.id === id)!;

test("el formato: marca + patente; largo suma la hidrogrúa; sin marca, la patente sola", () => {
  assert.equal(nombreVehiculo(V("ab799")), "Iveco AB 799 CA");
  assert.equal(nombreVehiculo(V("ab831")), "Agrale AB 831 LC");
  assert.equal(nombreVehiculo(V("ab831"), true), "Agrale hidrogrúa AB 831 LC");
  assert.equal(nombreVehiculo(V("ab799"), true), "Iveco AB 799 CA", "largo sólo cambia la hidrogrúa");
  assert.equal(nombreVehiculo(V("s10")), "Chevrolet LNE 368");
  assert.equal(nombreVehiculo(V("clark")), "Clark CYS47");
  assert.equal(nombreVehiculo(V("sinmat")), "SIN MATRICULA 10");
  assert.equal(nombreVehiculo({ marca: "  ", patente: "AB 831 LC", tipo: "hidrogrua" }, true), "hidrogrúa AB 831 LC", "sin marca, la hidrogrúa igual se dice");
  const d = martesArmado();
  assert.equal(vehTxt(d, "af669"), "Iveco AF 669 ZL");
  assert.equal(vehiculoNombre(d, "ab831"), "Agrale hidrogrúa AB 831 LC");
  assert.equal(vehTxt(d, "no-existe"), "");
  assert.equal(vehTxt(d, null), "");
});

test("el artículo: el Iveco, la Chevrolet (camioneta), la Moto; y las contracciones", () => {
  const d = martesArmado();
  assert.equal(elVeh(d, "ab799"), "el Iveco AB 799 CA");
  assert.equal(elVeh(d, "ab799", "del"), "del Iveco AB 799 CA");
  assert.equal(elVeh(d, "ab799", "al"), "al Iveco AB 799 CA");
  assert.equal(elVeh(d, "ab831", "con el", true), "con el Agrale hidrogrúa AB 831 LC");
  assert.equal(elVeh(d, "s10"), "la Chevrolet LNE 368");
  assert.equal(elVeh(d, "s10", "del"), "de la Chevrolet LNE 368");
  assert.equal(elVeh(d, "s10", "en el"), "en la Chevrolet LNE 368");
  assert.equal(elVeh(d, "moto", "al"), "a la Moto A091SWF");
  assert.equal(elVeh(d, "clark"), "el Clark CYS47");
  assert.equal(elVeh(d, null), "el vehículo");
  assert.equal(articuloVeh(d, "s10", "en el"), "en la");
});

test("los textos se leen bien: tarjeta (marca normal, patente mono), mensaje, selector y sin usar", () => {
  const d = martesArmado();
  // La tarjeta: la marca va en texto normal y la patente en monoespaciada.
  const r = resumenVehiculos(d, 3).filas[0];
  const mono = r.resto.filter((x) => x.mono).map((x) => x.t);
  assert.deepEqual(mono, ["AF 669 ZL"]);
  assert.match(r.resto.map((x) => x.t).join(""), /· Kiska · Iveco AF 669 ZL · /);
  // Todo el día lleva la hidrogrúa (no hay horas: hay lugar).
  assert.equal(resumenVehiculos(d, 1).filas[0].resto.map((x) => x.t).join(""), " · Borda · Agrale hidrogrúa AB 831 LC");
  // Telegram / celular: "va Borda todo el día con el Agrale hidrogrúa AB 831 LC".
  assert.match(choferesEnPalabras(d, 1, null), /va Borda todo el día con el Agrale hidrogrúa AB 831 LC/);
  // El selector de vehículo arranca por la marca (y el tecleo del <select> encuentra "Iveco").
  assert.ok(opcionesVehiculo(d, 3).every((o) => /^(Iveco|Agrale|Chevrolet|Moto|Clark|SIN MATRICULA)/.test(o.label)), opcionesVehiculo(d, 3).map((o) => o.label).join("\n"));
  assert.ok(camionesSinUsar(d).some((x) => x.txt.startsWith("Iveco AH 410 LD")));
});

test("el buscador encuentra por marca, tipo, modelo o patente (con o sin espacios)", () => {
  assert.ok(coincideVehiculo(V("ab799"), "iveco"));
  assert.ok(coincideVehiculo(V("ab799"), "IVECO 799"));
  assert.ok(coincideVehiculo(V("ab799"), "ab799ca"));
  assert.ok(coincideVehiculo(V("ab799"), "ab 799"));
  assert.ok(coincideVehiculo(V("ab831"), "agrale"));
  assert.ok(coincideVehiculo(V("ab831"), "hidrogrua"), "sin tilde");
  assert.ok(coincideVehiculo(V("s10"), "s10"), "por el modelo");
  assert.ok(coincideVehiculo(V("clark"), "autoelev"));
  assert.ok(!coincideVehiculo(V("ab799"), "agrale"));
  assert.equal(VEHICULOS.filter((v) => coincideVehiculo(v, "iveco")).length, 4, "los cuatro Iveco");
});
