// Los opcionales estándar de toda bandeja y fachada (Joaquín, 26/09): concertina al 10 % del
// metro de bandeja, técnico de SyH por jornada y memoria de cálculo; y la regla de la memoria
// obligatoria pasados los 6 m (Decreto 911/96, criterio §6.1).

import { test } from "node:test";
import assert from "node:assert/strict";
import { TARIFAS_AGO26 as T } from "../cotizador/prueba-tarifas.ts";
import { cotizarComplementario } from "../cotizador/complementarios.ts";
import { borradorVacio, recalcular, type DatosBorrador, type ResultadoBorrador } from "./borrador.ts";

const ctx = { tarifas: T, lista: null, hoy: "2026-09-26" };

/** Una bandeja de 12 m.l. con 1 jornada de armado y 1 de desarme, salvo lo que se cambie. */
function conBandeja(altura: number, cambios: Partial<DatosBorrador> = {}): DatosBorrador {
  const d = borradorVacio();
  return {
    ...d,
    jornadas: { armado: 1, desarme: 1, personas: 3 },
    ...cambios,
    calculos: {
      bandeja: { metros: 12, altura, concertina: "opcional", gestoria: "no", enCaba: true, ...(altura === 6 ? { precioMl: 190_000 } : {}) },
      ...cambios.calculos,
    },
  };
}
const linea = (r: ResultadoBorrador, id: string) => r.lineas.find((l) => l.id === id);

test("toda bandeja trae concertina, técnico de SyH y memoria de cálculo como opcionales", () => {
  const r = recalcular(conBandeja(3), ctx);
  const concertina = linea(r, "bandeja:concertina");
  assert.equal(concertina?.seccion, "opcional");
  assert.equal(concertina?.importe, 12 * 14_000, "10 % de $140.000 por cada m.l.");
  const syh = linea(r, "syh");
  assert.equal(syh?.seccion, "opcional");
  assert.equal(syh?.cantidad, 2);
  assert.equal(syh?.importe, 500_000, "2 jornadas × $250.000");
  assert.match(syh!.descripcion, /2 jornadas \(armado y desarme\)/);
  const memoria = linea(r, "ingenieria");
  assert.equal(memoria?.seccion, "opcional");
  assert.equal(memoria?.importe, 1_250_000);
  assert.equal(memoria?.unicaVez, true);
  // Los opcionales no suman al subtotal ni a la renovación.
  assert.equal(r.totales.subtotal, 12 * 140_000);
});

test("el técnico de SyH: una jornada corta cuenta entera, y sin jornadas todavía no sale", () => {
  const corta = recalcular(conBandeja(3, { jornadas: { armado: 0.5, desarme: 0.25, personas: 3 } }), ctx);
  assert.equal(linea(corta, "syh")?.cantidad, 2);
  const larga = recalcular(conBandeja(3, { jornadas: { armado: 2, desarme: 1.5, personas: 3 } }), ctx);
  assert.equal(linea(larga, "syh")?.importe, 4 * 250_000);
  const sinJornadas = recalcular(conBandeja(3, { jornadas: { armado: null, desarme: null, personas: null } }), ctx);
  assert.equal(linea(sinJornadas, "syh"), undefined);
  assert.equal(linea(sinJornadas, "ingenieria")?.seccion, "opcional");
});

test("pasados los 6 m la memoria de cálculo va en la base; 6 m justos, no", () => {
  const r8 = recalcular(conBandeja(8), ctx);
  assert.equal(linea(r8, "ingenieria")?.seccion, "base");
  assert.equal(r8.totales.subtotal, 12 * 235_000 + 1_250_000);
  assert.ok(r8.avisos.some((a) => a.codigo === "memoria_obligatoria" && a.nivel === "info"));
  assert.equal(linea(r8, "bandeja:concertina")?.importe, 12 * 23_500);

  const r6 = recalcular(conBandeja(6), ctx);
  assert.equal(linea(r6, "ingenieria")?.seccion, "opcional");
  assert.ok(!r6.avisos.some((a) => a.codigo === "memoria_obligatoria"));

  // Si igual se saca en una estructura alta, queda la advertencia.
  const sacada = recalcular(conBandeja(8, { opcionalesDescartados: ["ingenieria"] }), ctx);
  assert.equal(linea(sacada, "ingenieria"), undefined);
  assert.ok(sacada.avisos.some((a) => a.codigo === "memoria_obligatoria" && a.nivel === "advertencia"));
});

test("lo que el vendedor saca no vuelve, y lo que se carga a mano manda", () => {
  const sin = recalcular(conBandeja(3, { opcionalesDescartados: ["syh", "ingenieria"] }), ctx);
  assert.equal(linea(sin, "syh"), undefined);
  assert.equal(linea(sin, "ingenieria"), undefined);

  // El cliente pidió el técnico de SyH: va en la base, con las jornadas del borrador.
  const pedido = recalcular(conBandeja(3, { calculos: { complementarios: [{ tipo: "syh", seccion: "base" }] } }), ctx);
  assert.equal(linea(pedido, "syh")?.seccion, "base");
  assert.equal(pedido.totales.subtotal, 12 * 140_000 + 500_000);
  assert.equal(pedido.lineas.filter((l) => l.id === "syh").length, 1, "no se duplica con el estándar");

  // Ingeniería de obra compleja, con monto propio.
  const compleja = recalcular(conBandeja(3, { calculos: { complementarios: [{ tipo: "ingenieria", seccion: "opcional", monto: 2_800_000 }] } }), ctx);
  assert.equal(linea(compleja, "ingenieria")?.importe, 2_800_000);
});

test("también en fachadas (sin concertina) y nunca en un alquiler sin montaje", () => {
  const d = borradorVacio();
  const fachada = recalcular(
    { ...d, jornadas: { armado: 3, desarme: 2, personas: 5 }, calculos: { fachada: { frentes: [10], altura: 5, encuadre: "B", escalonado: null, gestoria: "no", enCaba: true } } },
    ctx,
  );
  assert.equal(linea(fachada, "syh")?.importe, 5 * 250_000);
  assert.equal(linea(fachada, "ingenieria")?.seccion, "opcional");
  assert.equal(linea(fachada, "bandeja:concertina"), undefined);

  const alquiler = recalcular({ ...d, calculos: { alquiler: { piezas: [] } as unknown as NonNullable<DatosBorrador["calculos"]["alquiler"]> } }, ctx);
  assert.equal(linea(alquiler, "syh"), undefined);
  assert.equal(linea(alquiler, "ingenieria"), undefined);
});

test("complementario suelto: SyH sin jornadas pregunta, con otro precio pide motivo; ingeniería sin monto es la memoria", () => {
  assert.deepEqual(cotizarComplementario({ tipo: "syh", seccion: "opcional" }, T).pendientes.map((p) => p.codigo), ["jornadas_syh"]);
  const caro = cotizarComplementario({ tipo: "syh", seccion: "opcional", jornadas: 3, monto: 300_000 }, T);
  assert.deepEqual(caro.avisos.filter((a) => a.nivel === "bloqueo").map((a) => a.codigo), ["motivo_precio"]);
  const conMotivo = cotizarComplementario({ tipo: "syh", seccion: "opcional", jornadas: 3, monto: 300_000, motivo: "planta industrial, turno extendido" }, T);
  assert.equal(conMotivo.lineas[0].importe, 900_000);
  assert.equal(cotizarComplementario({ tipo: "ingenieria", seccion: "opcional" }, T).lineas[0].importe, 1_250_000);
});
