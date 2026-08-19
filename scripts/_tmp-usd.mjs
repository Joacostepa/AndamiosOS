import { authenticate, fieldsGet, searchRead } from "./odoo-rpc.mjs";
await authenticate();
for (const modelo of ["sale.order","x_aba_orden_trabajo","x_aba_parte_diario"]) {
  const c = await fieldsGet(modelo, ["type","string"]);
  const usd = Object.keys(c).filter(k => /usd|ccl|dolar|cambio|tipo_de_cambio/i.test(k) || /USD|CCL|d[oó]lar/i.test(c[k].string||""));
  console.log(`\n── ${modelo} ──`);
  for (const k of usd.sort()) console.log(`  ${k.padEnd(30)} ${c[k].type.padEnd(10)} ${c[k].string}`);
}
const meta = await searchRead("ir.model.fields",
  [["model","=","sale.order"],["name","like","usd"]], ["name","compute","depends","store"]);
console.log("\n── computes USD en sale.order ──");
for (const f of meta) {
  console.log(`  ${f.name} (store=${f.store}) depends: ${f.depends || "—"}`);
  if (f.compute) console.log(`     ${String(f.compute).replace(/\s+/g," ").slice(0,260)}`);
}
