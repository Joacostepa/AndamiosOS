// El frente del lote (Joaquín, 26/09: "siempre que lo verifiques"; criterio, Geometría 3 y 4):
// en CABA sin verificar no se guarda; los metros que no cierran y la esquina se avisan.

import { test } from "node:test";
import assert from "node:assert/strict";
import { TARIFAS_AGO26 as T } from "../cotizador/prueba-tarifas.ts";
import type { Lote } from "../catastro/caba.ts";
import { borradorVacio, chequeoLote, normalizarBorrador, recalcular, type DatosBorrador } from "./borrador.ts";

const ctx = { tarifas: T, lista: null, hoy: "2026-09-26" };
const DIRECCION = "Riobamba 653";

function lote(cambios: Partial<Lote> = {}): Lote {
  return {
    fuente: "catastro", direccionConsultada: DIRECCION, smp: "009-081-018", direccionOficial: "RIOBAMBA 653",
    frenteCatastro: 7.84, caras: [7.84], tramosCortos: [], esquina: false, calles: ["RIOBAMBA"],
    fondo: 51.53, superficie: 404, pisos: 11, nota: null, consultado: "2026-09-26T21:00:00Z", ...cambios,
  };
}

function conBandeja(metros: number, cambios: Partial<DatosBorrador> = {}, obra: Partial<DatosBorrador["obra"]> = {}): DatosBorrador {
  const d = borradorVacio();
  return {
    ...d,
    ...cambios,
    obra: { direccion: DIRECCION, enCaba: true, lote: null, ...obra },
    calculos: { bandeja: { metros, altura: 3, concertina: "opcional", gestoria: "no", enCaba: true } },
  };
}
const codigos = (d: DatosBorrador) => chequeoLote(d).avisos.map((a) => `${a.nivel}:${a.codigo}`);

test("en CABA, una bandeja sin el frente verificado no se puede guardar", () => {
  const r = recalcular(conBandeja(8), ctx);
  assert.ok(r.faltantes.some((f) => f.codigo === "frente_lote" && /verificar_frente_lote/.test(f.texto)));
});

test("fuera de CABA no bloquea (el frente lo da el cliente) y sin bandeja ni fachada no aplica", () => {
  assert.equal(chequeoLote(conBandeja(8, {}, { enCaba: false })).faltante, null);
  const sinEstructura = { ...conBandeja(8), calculos: {} };
  assert.equal(chequeoLote(sinEstructura).faltante, null);
});

test("verificado y con los metros que cierran: sin faltante ni advertencias, con el frente a la vista", () => {
  const d = conBandeja(8, {}, { lote: lote() });
  const r = recalcular(d, ctx);
  assert.ok(!r.faltantes.some((f) => f.codigo === "frente_lote"));
  assert.deepEqual(codigos(d), ["info:frente_lote"]);
  assert.match(chequeoLote(d).avisos[0].texto, /7,84 m \(catastro, parcela 009-081-018\)/);
});

test("más metros que el frente (Arengreen 655: 24 m.l. contra 8 m) o muchos menos: advertencia, no bloqueo", () => {
  const mayor = conBandeja(24, {}, { lote: lote({ caras: [8], frenteCatastro: 8 }) });
  assert.ok(codigos(mayor).includes("advertencia:frente_mayor"));
  assert.equal(chequeoLote(mayor).faltante, null);
  const menor = conBandeja(3, {}, { lote: lote({ caras: [8.66], frenteCatastro: 8.66 }) });
  assert.ok(codigos(menor).includes("advertencia:frente_menor"));
});

test("esquina: se pregunta si van los dos frentes; decidido, queda como dato", () => {
  const esquina = lote({ caras: [25.93, 35.82], frenteCatastro: 25.96, esquina: true, calles: ["ESMERALDA", "TUCUMAN"] });
  const unaCara = conBandeja(25.93, {}, { lote: esquina });
  assert.ok(codigos(unaCara).includes("advertencia:esquina"));
  assert.ok(!codigos(unaCara).some((c) => c.includes("frente_m")), "una sola cara no es 'menos que el frente'");
  const decidida = conBandeja(61.75, { decisiones: { esquina: "los dos frentes" } }, { lote: esquina });
  assert.ok(codigos(decidida).includes("info:esquina"));
  assert.ok(!codigos(decidida).some((c) => c.startsWith("advertencia")));
});

test("si cambia la dirección, hay que volver a verificar", () => {
  const d = conBandeja(8, {}, { direccion: "Riobamba 659", lote: lote() });
  assert.match(chequeoLote(d).faltante?.texto ?? "", /Cambió la dirección/);
});

test("el catastro tiene la parcela pero no la medida: se pide al vendedor; declarada, se acepta", () => {
  const sinMedida = conBandeja(10, {}, { lote: lote({ frenteCatastro: null, caras: [] }) });
  assert.match(chequeoLote(sinMedida).faltante?.texto ?? "", /frenteConfirmado/);
  const declarada = conBandeja(10, {}, { lote: lote({ fuente: "vendedor", frenteCatastro: null, caras: [10.25], nota: "medido en obra" }) });
  assert.equal(chequeoLote(declarada).faltante, null);
  assert.match(chequeoLote(declarada).avisos[0].texto, /según el vendedor: medido en obra/);
});

test("un borrador guardado antes de esto se lee sin lote", () => {
  const viejo = normalizarBorrador({ obra: { direccion: DIRECCION, enCaba: true } });
  assert.equal(viejo.obra.lote, null);
  assert.equal(viejo.obra.direccion, DIRECCION);
});
