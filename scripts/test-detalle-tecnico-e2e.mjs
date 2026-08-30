// Test end-to-end del circuito "qué hay que ejecutar" contra la instancia REAL.
//
// Cubre las tres piezas y, sobre todo, cómo se encadenan:
//
//   1. La OT nace sabiendo qué hay que armar (del alcance, de la propuesta o de las líneas).
//   2. No se puede confirmar una orden tipo "Obra " sin la programación de los trabajos,
//      y la OT hereda duración y dotación según su tipo.
//   3. Al cerrar el armado, Operaciones sella lo que quedó armado, y la OT de desarme
//      —la que ya existía y la que se emita después— pasa a describir ESO y no lo vendido.
//
// Crea sus propios registros de prueba y los borra al final, pase o falle. No toca datos
// reales: la venta de prueba se crea desde cero y se destruye.
//
// Correr: node --env-file=.env.local scripts/test-detalle-tecnico-e2e.mjs
import { version, authenticate, searchRead, read, create, write, executeKw } from "./odoo-rpc.mjs";

const OT = "x_aba_orden_trabajo";
const VENTA = "sale.order";

let fallas = 0;
const ok = (titulo, cumple, detalle = "") => {
  console.log(`  ${cumple ? "✓" : "✗"} ${titulo}${detalle ? ` — ${detalle}` : ""}`);
  if (!cumple) fallas++;
};

const creadas = { ots: [], ventas: [] };

const nuevaOt = async (valores) => {
  const id = await create(OT, { x_estado: "pendiente", x_jornadas_estimadas: 1, ...valores });
  creadas.ots.push(id);
  return id;
};
const leerOt = async (id, campos) => (await read(OT, [id], campos))[0];

try {
  const v = await version();
  console.log(`Odoo ${v.server_version} · uid=${await authenticate()}\n`);

  const [cliente] = await searchRead("res.partner", [["customer_rank", ">", 0]], ["name"], { limit: 1 });
  if (!cliente) throw new Error("No hay clientes en la instancia");

  // ── 1) El detalle técnico ────────────────────────────────────────────────
  console.log("1) La OT dice qué hay que armar");

  const ventaId = await create(VENTA, {
    partner_id: cliente.id,
    x_studio_tipo_de_contrato: "Obra ",
    x_alcance_tecnico: "VENDIDO: bandeja de protección peatonal, 9 m.l., altura 3,00 m.",
  });
  creadas.ventas.push(ventaId);

  const armadoId = await nuevaOt({ x_name: "E2E armado", x_tipo: "armado", x_order_id: ventaId });
  const armado = await leerOt(armadoId, ["x_detalle_tecnico"]);
  ok("la OT de armado nace con el alcance de la venta",
    String(armado.x_detalle_tecnico || "").startsWith("VENDIDO:"),
    String(armado.x_detalle_tecnico || "(vacío)").slice(0, 60));

  // ── 2) La programación ───────────────────────────────────────────────────
  console.log("\n2) Duración y dotación bajan de la orden de alquiler");

  const [defaults] = await read(VENTA, [ventaId], ["x_personal_armado", "x_personal_desarme"]);
  ok("el personal viene en 5 por defecto",
    defaults.x_personal_armado === 5 && defaults.x_personal_desarme === 5,
    `armado ${defaults.x_personal_armado} · desarme ${defaults.x_personal_desarme}`);

  let bloqueo = null;
  try {
    await write(VENTA, [ventaId], { state: "sale" });
  } catch (e) {
    bloqueo = String(e.message).split("\n")[0];
  }
  ok("no deja confirmar sin la duración de armado y desarme", bloqueo !== null, bloqueo ?? "SE CONFIRMÓ IGUAL");

  await write(VENTA, [ventaId], { x_dur_armado: "3", x_dur_desarme: "1", x_personal_desarme: 4 });
  let confirmo = true;
  try {
    await write(VENTA, [ventaId], { state: "sale" });
  } catch (e) {
    confirmo = false;
    console.log(`    (no confirmó: ${String(e.message).slice(0, 120)})`);
  }
  ok("con la programación cargada, confirma", confirmo);

  const armado2 = await nuevaOt({ x_name: "E2E armado 2", x_tipo: "armado", x_order_id: ventaId });
  const a2 = await leerOt(armado2, ["x_duracion_est", "x_personal_por_jornada"]);
  ok("la OT de armado hereda 3 jornadas y 5 personas",
    a2.x_duracion_est === "3" && a2.x_personal_por_jornada === 5,
    `${a2.x_duracion_est} jornadas · ${a2.x_personal_por_jornada} personas`);

  const desarmePrevio = await nuevaOt({ x_name: "E2E desarme previo", x_tipo: "desarme", x_order_id: ventaId });
  const d0 = await leerOt(desarmePrevio, ["x_duracion_est", "x_personal_por_jornada", "x_detalle_tecnico"]);
  ok("la OT de desarme hereda SUS propios valores, no los del armado",
    d0.x_duracion_est === "1" && d0.x_personal_por_jornada === 4,
    `${d0.x_duracion_est} jornada · ${d0.x_personal_por_jornada} personas`);
  ok("y todavía describe lo vendido, porque nadie armó nada",
    String(d0.x_detalle_tecnico || "").startsWith("VENDIDO:"));

  // ── 3) El as-built ───────────────────────────────────────────────────────
  console.log("\n3) Lo que quedó armado alimenta el desarme");

  // Exactamente lo que escribe sellarEstructura() en src/lib/odoo/partes.ts al cerrar la OT.
  const REAL = "REAL: quedaron 11,5 m.l. y la altura es 3,40 m, no 3,00.";
  await write(OT, [armadoId], { x_ejecutado_real: REAL });
  await write(VENTA, [ventaId], {
    x_estructura_actual: REAL,
    x_estructura_fecha: "2026-08-30",
    x_estructura_ot_id: armadoId,
  });

  const d1 = await leerOt(desarmePrevio, ["x_detalle_tecnico"]);
  ok("el desarme que YA existía se actualiza solo", d1.x_detalle_tecnico === REAL,
    String(d1.x_detalle_tecnico || "(vacío)").slice(0, 60));

  const desarmeNuevo = await nuevaOt({ x_name: "E2E desarme nuevo", x_tipo: "desarme", x_order_id: ventaId });
  const d2 = await leerOt(desarmeNuevo, ["x_detalle_tecnico"]);
  ok("el desarme emitido DESPUÉS nace con el as-built", d2.x_detalle_tecnico === REAL);

  const a3 = await leerOt(armadoId, ["x_detalle_tecnico", "x_ejecutado_real"]);
  ok("el armado conserva lo que decía y su propio snapshot",
    String(a3.x_detalle_tecnico || "").startsWith("VENDIDO:") && a3.x_ejecutado_real === REAL);

  const mantenimiento = await nuevaOt({ x_name: "E2E mantenimiento", x_tipo: "mantenimiento", x_order_id: ventaId });
  ok("el mantenimiento también lee el as-built",
    (await leerOt(mantenimiento, ["x_detalle_tecnico"])).x_detalle_tecnico === REAL);
} finally {
  // La limpieza corre pase o falle: nada de esto puede quedar en la instancia real.
  if (creadas.ots.length) await executeKw(OT, "unlink", [creadas.ots]);
  for (const id of creadas.ventas) {
    await write(VENTA, [id], { state: "draft" });
    await executeKw(VENTA, "unlink", [[id]]);
  }
  console.log(`\n(limpieza: ${creadas.ots.length} OTs y ${creadas.ventas.length} venta(s) de prueba borradas)`);
}

console.log(fallas === 0 ? "\n✅ El circuito completo funciona." : `\n❌ ${fallas} verificación(es) fallaron.`);
process.exit(fallas === 0 ? 0 : 1);
