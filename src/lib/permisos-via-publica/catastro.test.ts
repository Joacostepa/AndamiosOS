// De dónde sale el frente de la encomienda cuando el catastro falla (Av. Olleros 1641, 03/11).

import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { buscarFrente, type Puerta } from "./catastro.ts";

const OLLEROS = 16022;
const PUERTAS: Puerta[] = [
  { calle: "OLLEROS AV.", altura: 1637, codigo_calle: OLLEROS },
  { calle: "OLLEROS AV.", altura: 1641, codigo_calle: OLLEROS },
];
const ESQUINA: Puerta[] = [...PUERTAS, { calle: "AMENABAR", altura: 1641, codigo_calle: 999 }];
const FRENTE = { calle: "OLLEROS AV.", desde: 1637, hasta: 1641 };
const DIRECCION = "Avenida Olleros 1641";

const USIG_OK = { direccionesNormalizadas: [{ tipo: "calle_altura", cod_calle: OLLEROS, altura: 1641, nombre_calle: "OLLEROS AV.", cod_partido: "caba" }] };
const json = (cuerpo: unknown) => new Response(JSON.stringify(cuerpo));
const caida = () => { throw new TypeError("fetch failed", { cause: { code: "ECONNRESET" } }); };

const fetchOriginal = globalThis.fetch;
afterEach(() => { globalThis.fetch = fetchOriginal; });

function simular({ usig, epok }: { usig: () => Response; epok: () => Response }) {
  globalThis.fetch = (async (url: string | URL) => (String(url).includes("usig") ? usig() : epok())) as typeof fetch;
}

test("con el catastro andando, el frente sale de ahí y no se mira el informe", async () => {
  simular({ usig: () => json(USIG_OK), epok: () => json({ smp: "023-123-024", puertas: PUERTAS }) });
  assert.deepEqual(await buscarFrente(DIRECCION, []), { frente: FRENTE, origen: "catastro", fallo: null });
});

test("si EPOK se cae, usa las puertas del informe y conserva el error real", async () => {
  simular({ usig: () => json(USIG_OK), epok: caida });
  const r = await buscarFrente(DIRECCION, PUERTAS);
  assert.deepEqual(r.frente, FRENTE);
  assert.equal(r.origen, "informe");
  assert.equal(r.fallo, "fetch failed: ECONNRESET");
});

test("si USIG se cae, saca la calle de la puerta con la altura de la dirección", async () => {
  simular({ usig: caida, epok: caida });
  const r = await buscarFrente(DIRECCION, PUERTAS);
  assert.deepEqual(r.frente, FRENTE);
  assert.equal(r.origen, "informe");
});

test("sin USIG, si dos calles tienen esa altura no adivina", async () => {
  simular({ usig: caida, epok: caida });
  const r = await buscarFrente(DIRECCION, ESQUINA);
  assert.equal(r.frente, null);
  assert.ok(r.fallo);
});

test("con USIG andando, una esquina toma sólo las puertas de la calle de la obra", async () => {
  simular({ usig: () => json(USIG_OK), epok: caida });
  assert.deepEqual((await buscarFrente(DIRECCION, ESQUINA)).frente, FRENTE);
});

test("catastro caído e informe sin puertas: sin frente y con la falla a la vista", async () => {
  simular({ usig: () => json(USIG_OK), epok: caida });
  const r = await buscarFrente(DIRECCION, []);
  assert.equal(r.frente, null);
  assert.equal(r.origen, null);
  assert.ok(r.fallo);
});

test("el catastro contesta que no hay puertas: no es una falla", async () => {
  simular({ usig: () => json(USIG_OK), epok: () => json({}) });
  assert.deepEqual(await buscarFrente(DIRECCION, []), { frente: null, origen: null, fallo: null });
});
