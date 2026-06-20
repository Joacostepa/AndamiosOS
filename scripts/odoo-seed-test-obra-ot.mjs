// Fixtures para probar el espejo Fase 2: asigna un cliente real a la Obra de prueba
// (id=1) y crea una OT de prueba colgada de ella. Idempotente.
// Correr: node --env-file=.env.local scripts/odoo-seed-test-obra-ot.mjs
import { authenticate, searchRead, read, write, create } from "./odoo-rpc.mjs";

await authenticate();

// 1) cliente real (customer_rank>0 → está en el espejo de la app)
const [partner] = await searchRead("res.partner", [["customer_rank", ">", 0]], ["id", "name"], { limit: 1, order: "id" });
console.log(`Cliente para la prueba: #${partner.id} ${partner.name}`);

// 2) asignar a la Obra de prueba id=1
await write("x_aba_obra", [1], { x_cliente_id: partner.id });
const [obra] = await read("x_aba_obra", [1], ["x_name", "x_cliente_id", "x_estado"]);
console.log("Obra 1:", JSON.stringify(obra));

// x_order_id (→sale.order) es OBLIGATORIO en x_aba_orden_trabajo (lo dejó así el dev de Odoo).
const [venta] = await searchRead("sale.order", [], ["id", "name"], { limit: 1, order: "id" });
console.log(`Venta para la OT (x_order_id obligatorio): #${venta.id} ${venta.name}`);

// 3) OT de prueba colgada de la Obra (idempotente por x_name)
const existing = await searchRead("x_aba_orden_trabajo", [["x_name", "=", "OT-TEST-001"]], ["id"]);
let otId;
if (existing.length) {
  otId = existing[0].id;
  await write("x_aba_orden_trabajo", [otId], { x_obra_id: 1, x_tipo: "armado", x_estado: "pendiente", x_order_id: venta.id, x_jornadas_estimadas: 2, x_personal_por_jornada: 3 });
  console.log(`OT de prueba ya existe (id=${otId}), reapuntada a la Obra 1`);
} else {
  otId = await create("x_aba_orden_trabajo", {
    x_name: "OT-TEST-001", x_obra_id: 1, x_tipo: "armado", x_estado: "pendiente", x_order_id: venta.id,
    x_jornadas_estimadas: 2, x_personal_por_jornada: 3,
    x_observaciones: "OT de prueba Fase 2 (espejo). Borrable.",
  });
  console.log(`✓ OT de prueba creada id=${otId}`);
}
const [ot] = await read("x_aba_orden_trabajo", [otId], ["x_name", "x_obra_id", "x_tipo", "x_estado"]);
console.log("OT:", JSON.stringify(ot));
console.log(`\nFIXTURES OK → obra_odoo_id=1, ot_odoo_id=${otId}, partner_id=${partner.id}`);
