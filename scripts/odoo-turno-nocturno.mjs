// El turno que cruza la medianoche, en el cómputo de horas de la línea de mano de obra.
//
// Correr con: node --env-file=.env.local scripts/odoo-turno-nocturno.mjs
//             node --env-file=.env.local scripts/odoo-turno-nocturno.mjs --revertir
//
// EL PROBLEMA: la cuadrilla a veces entra a las 22 y sale a las 2 del día siguiente. El
// cómputo hacía `t = hasta - desde` y aplastaba el negativo a cero, así que un turno
// nocturno quedaba en CERO horas: cero horas-hombre y cero costo, con el parte igual
// guardado. La obra figuraba trabajada gratis.
//
// La app ya no lo bloquea (ver lib/tablero/horas.ts), así que sin este cambio el parte
// entraría y se costearía mal en silencio, que es peor que el bloqueo que había antes.
//
// El almuerzo se acomoda solo: la ventana 12-13 no cae dentro de 22→26, así que la resta
// da negativa y no se aplica. Por eso alcanza con correr el fin y no hace falta una rama
// aparte para la noche.
//
// NO recalcula lo ya cargado. Odoo sólo re-evalúa un calculado almacenado cuando cambian
// sus dependencias, y ninguna línea existente cruza la medianoche (verificado: 0 de 1374),
// así que no hay nada viejo que corregir.

import { searchRead, executeKw } from "./odoo-rpc.mjs";

const REVERTIR = process.argv.includes("--revertir");

const ANTES = `for rec in self:
    d = rec['x_hora_desde'] or 0.0
    h = rec['x_hora_hasta'] or 0.0
    t = h - d
    if t < 0:
        t = 0.0
    solape = min(h, 13.0) - max(d, 12.0)
    if solape > 0:
        t = t - solape
    rec['x_horas'] = t
`;

const DESPUES = `for rec in self:
    d = rec['x_hora_desde'] or 0.0
    h = rec['x_hora_hasta'] or 0.0
    t = h - d
    if t < 0:
        t = t + 24.0
    solape = min(d + t, 13.0) - max(d, 12.0)
    if solape > 0:
        t = t - solape
    rec['x_horas'] = t
`;

const [campo] = await searchRead(
  "ir.model.fields",
  [["model", "=", "x_aba_mano_obra"], ["name", "=", "x_horas"]],
  ["name", "compute", "depends", "store"],
);
if (!campo) throw new Error("No existe x_aba_mano_obra.x_horas");

const objetivo = REVERTIR ? ANTES : DESPUES;
const otro = REVERTIR ? DESPUES : ANTES;

// El cómputo se compara con lo que se espera encontrar. Si alguien lo editó a mano desde
// Odoo, pisarlo con esta versión le borraría el cambio sin que nadie se entere.
const actual = String(campo.compute ?? "").trim();
if (actual === objetivo.trim()) {
  console.log("Ya estaba así. No se toca nada.");
  process.exit(0);
}
if (actual !== otro.trim()) {
  console.error("El cómputo de x_horas NO es el que esperaba. Alguien lo editó a mano.");
  console.error("\n── lo que hay ahora ──\n" + actual);
  console.error("\n── lo que esperaba ──\n" + otro.trim());
  console.error("\nNo se toca nada: revisalo y decidí a mano.");
  process.exit(1);
}

await executeKw("ir.model.fields", "write", [[campo.id], { compute: objetivo }]);
console.log(REVERTIR ? "↩️  Vuelto al cómputo anterior." : "✅ El turno nocturno ya computa horas.");

const [chk] = await searchRead(
  "ir.model.fields", [["id", "=", campo.id]], ["compute"],
);
console.log("\n── como quedó ──\n" + String(chk.compute).trim());
