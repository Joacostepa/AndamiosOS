// Saca el GRIS del semáforo de habilitación: una obra está habilitada o no lo está.
//
// El gris significaba `no_aplica` y se leía como "sin datos de habilitación", que es otra
// cosa. Con 27 de 60 obras vivas ahí, casi la mitad del tablero mostraba un punto que no
// decía nada. Una obra que no necesita tramitar nada no tiene nada que la frene: va verde.
//
// El dato de que no aplicaba NO se pierde: vive en hab_ots.triage, que es lo que arma la
// sección "No aplican" de la bandeja.
//
// Toca los dos computes y migra los registros que quedaron en no_aplica. Dry-run por
// defecto; --escribir para aplicar.
//
//   node --env-file=.env.local scripts/odoo-habilitacion-sin-gris.mjs [--escribir]

import { authenticate, searchRead, write, executeKw } from "./odoo-rpc.mjs";

const ESCRIBIR = process.argv.includes("--escribir");

// no_aplica entra por la misma puerta que habilitada: verde, salvo vencimiento pasado.
const SEMAFORO = `for rec in self:
    e = rec['x_hab_estado'] or 'pendiente'
    ejecutada = (rec['x_estado'] in ('completada', 'cancelada'))
    if e in ('habilitada', 'no_aplica'):
        v = rec['x_hab_vencimiento']
        if v and v < datetime.date.today() and not ejecutada:
            r = 'vencida'
        else:
            r = 'verde'
    elif e == 'en_curso':
        r = 'amarillo'
    else:
        r = 'rojo'
    rec['x_hab_semaforo'] = r
`;

// Sin etapa `f`: una obra que no aplica está habilitada, o sea etapa `d`.
const ETAPA = `for rec in self:
    if rec['x_hab_semaforo'] == 'vencida':
        r = 'e'
    elif (rec['x_hab_estado'] or '') in ('habilitada', 'no_aplica'):
        r = 'd'
    elif rec['x_hab_fecha_envio']:
        r = 'c'
    elif rec['x_hab_fecha_consulta']:
        r = 'b'
    else:
        r = 'a'
    rec['x_hab_etapa'] = r
`;

await authenticate();

const enGris = await searchRead(
  "x_aba_orden_trabajo",
  [["x_hab_estado", "=", "no_aplica"]],
  ["x_order_id", "x_hab_semaforo", "x_hab_etapa"],
);
console.log(`${ESCRIBIR ? "ESCRIBIENDO" : "DRY-RUN"}`);
console.log(`  OTs en no_aplica (hoy grises): ${enGris.length}`);
console.log(`  computes a reescribir: x_hab_semaforo, x_hab_etapa`);

if (!ESCRIBIR) {
  console.log("\nDry-run: no se escribió nada. Para aplicar: --escribir");
  process.exit(0);
}

const campos = await searchRead(
  "ir.model.fields",
  [["model", "=", "x_aba_orden_trabajo"], ["name", "in", ["x_hab_semaforo", "x_hab_etapa"]]],
  ["name"],
);
for (const c of campos) {
  await write("ir.model.fields", [c.id], { compute: c.name === "x_hab_semaforo" ? SEMAFORO : ETAPA });
  console.log(`  ✓ compute de ${c.name} actualizado`);
}

// Tocar los registros fuerza el recálculo: los computes almacenados no se recorren solos
// al cambiar la fórmula.
if (enGris.length > 0) {
  await write("x_aba_orden_trabajo", enGris.map((o) => o.id), { x_hab_estado: "no_aplica" });
  console.log(`  ✓ ${enGris.length} OTs recalculadas`);
}

const quedan = await searchRead("x_aba_orden_trabajo", [["x_hab_semaforo", "=", "gris"]], ["id"]);
console.log(`\nOTs que siguen en gris: ${quedan.length}`);

// Con el valor ya sin uso, se saca de la lista para que no se pueda volver a elegir.
if (quedan.length === 0) {
  const campo = campos.find((c) => c.name === "x_hab_semaforo");
  const opcion = await searchRead(
    "ir.model.fields.selection",
    [["field_id", "=", campo.id], ["value", "=", "gris"]],
    ["id"],
  );
  if (opcion.length) {
    try {
      await executeKw("ir.model.fields.selection", "unlink", [opcion.map((o) => o.id)]);
      console.log("✓ el valor 'gris' se quitó de la lista de x_hab_semaforo");
    } catch (e) {
      console.log(`· no se pudo quitar 'gris' de la lista (${e.message}) — queda sin uso, no molesta`);
    }
  }
}

const resumen = await searchRead("x_aba_orden_trabajo", [["x_estado", "in", ["pendiente", "en_proceso"]]], ["x_hab_semaforo", "x_hab_etapa"]);
const cuenta = (f) => resumen.reduce((m, o) => ({ ...m, [o[f]]: (m[o[f]] ?? 0) + 1 }), {});
console.log("\nsemáforo de las OTs vivas:", JSON.stringify(cuenta("x_hab_semaforo")));
console.log("etapa:", JSON.stringify(cuenta("x_hab_etapa")));
