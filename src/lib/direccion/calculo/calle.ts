// Calculador de En la calle (/direccion/calle).
//
// Qué calcula: contratos en la calle DEDUPLICADOS por obra (x_obra_id: una obra con órdenes
// reemplazadas cuenta una vez, caso Ministerio), abono mensual, m² y metros lineales,
// devolución vencida (con "sin facturar +40 d"), fin de obra estimado vencido, sin renovación
// en 35 días, la agenda de órdenes de trabajo (esta semana y la próxima), backlog y vencidas.
// Fuente: Odoo-Claude/direccion/datos/alquiler_definiciones.md y la maqueta (renderCalle).
// Las reglas puras están en ./calle-reglas.ts (con test); acá sólo se lee.
//
// ÓRDENES DE TRABAJO: se leen de x_aba_orden_trabajo, la misma fuente que usan hoy
// Planificación y /ordenes-trabajo (src/lib/odoo/ordenes.ts explica por qué se dejó la tabla
// `ordenes_trabajo` de Supabase: no tenía todas). La habilitación se recalcula para hoy con
// la derivación de la app (lib/habilitaciones/derivacion.ts): el semáforo guardado en Odoo
// no se actualiza al pasar el día.
//
// Para La semana: `resumenCalle()` (definida en calle-reglas.ts, re-exportada acá).

import { definirCalculador, type CtxCalculo } from "./contrato.ts";
import { read, readGroup, searchCount, searchReadTodo } from "../odoo-lectura.ts";
import { historiaCifra } from "../snapshot.ts";
import { lunesDe, sumarDias } from "../formato.ts";
import {
  avisosCalle, calcularCalle, cifrasCalle, decisionesCalle, estaEnLaCalle, oracionesCalle,
  CAMPOS_FACTURA, CAMPOS_LINEA, CAMPOS_ORDEN, CAMPOS_OT, OT_ACTIVAS,
  type DetalleCalle, type EntradaCalle, type HistoriaCalle, type LineaFacturaOdoo, type LineaVentaOdoo, type OrdenOdoo, type OtOdoo,
} from "./calle-reglas.ts";

export { resumenCalle, type ResumenCalle, type DetalleCalle, type FilaContrato, type FilaOt } from "./calle-reglas.ts";

/** Ubicaciones de stock (§13): 17 = Partners/Customers/Alquiler (en obra); 8 y 19 = depósitos. */
const UBIC_OBRA = 17;
const UBIC_DEPOSITOS = [8, 19];

const idM2O = (v: [number, string] | false): number | null => (Array.isArray(v) ? v[0] : null);

/** Lee de Odoo (sólo lectura) todo lo que necesita la pantalla. */
export async function leerEntradaCalle(hoy: string): Promise<EntradaCalle> {
  const ordenes = await searchReadTodo<OrdenOdoo>("sale.order", [["is_rental_order", "=", true], ["state", "=", "sale"]], CAMPOS_ORDEN);

  // Órdenes cuyas líneas y facturas hacen falta: las de la calle y las de sus mismas obras.
  const obras = new Set(ordenes.filter(estaEnLaCalle).map((o) => idM2O(o.x_obra_id)).filter((x): x is number => x != null));
  const ids = ordenes.filter((o) => estaEnLaCalle(o) || obras.has(idM2O(o.x_obra_id) ?? -1)).map((o) => o.id);

  const lunes = lunesDe(hoy);
  const [lineas, facturas, clientes, ots, otCompletadasSemana, flota] = await Promise.all([
    ids.length ? searchReadTodo<LineaVentaOdoo>("sale.order.line", [["order_id", "in", ids]], CAMPOS_LINEA) : Promise.resolve([]),
    ids.length
      ? searchReadTodo<LineaFacturaOdoo>("account.move.line", [
          ["sale_line_ids.order_id", "in", ids], ["parent_state", "=", "posted"], ["display_type", "=", "product"],
          ["move_id.move_type", "in", ["out_invoice", "out_refund"]],
        ], CAMPOS_FACTURA)
      : Promise.resolve([]),
    leerClientes(ordenes),
    searchReadTodo<OtOdoo>("x_aba_orden_trabajo", [["x_estado", "in", OT_ACTIVAS]], CAMPOS_OT).catch((e: unknown) => {
      console.warn("[direccion] calle: órdenes de trabajo:", e instanceof Error ? e.message : e);
      return null;
    }),
    searchCount("x_aba_orden_trabajo", [["x_estado", "=", "completada"], ["x_fecha_ejecucion", ">=", lunes], ["x_fecha_ejecucion", "<=", hoy]]).catch(() => null),
    leerFlota().catch(() => null),
  ]);

  const productos = [...new Set(lineas.map((l) => idM2O(l.product_id)).filter((x): x is number => x != null))];
  const conRent = productos.length ? await read<{ id: number; rent_ok: boolean }>("product.product", productos, ["rent_ok"]) : [];

  return { hoy, ordenes, clientes, lineas, productosAlquiler: conRent.filter((p) => p.rent_ok).map((p) => p.id), facturas, ots, otCompletadasSemana, flota };
}

/** partner_id → nombre de la empresa (commercial_partner_id). */
async function leerClientes(ordenes: OrdenOdoo[]): Promise<Record<number, string>> {
  const pids = [...new Set(ordenes.map((o) => idM2O(o.partner_id)).filter((x): x is number => x != null))];
  const out: Record<number, string> = {};
  for (let i = 0; i < pids.length; i += 500) {
    const filas = await read<{ id: number; name: string; commercial_partner_id: [number, string] | false }>("res.partner", pids.slice(i, i + 500), ["name", "commercial_partner_id"]);
    for (const p of filas) out[p.id] = Array.isArray(p.commercial_partner_id) ? p.commercial_partner_id[1] : p.name;
  }
  return out;
}

/** Piezas en obra y en depósito según stock (§13: sólo referencia, no es confiable). */
async function leerFlota(): Promise<{ enObra: number; deposito: number } | null> {
  const g = await readGroup<{ location_id: [number, string] | false; quantity: number }>(
    "stock.quant", [["location_id", "in", [UBIC_OBRA, ...UBIC_DEPOSITOS]]], ["quantity:sum"], ["location_id"],
  );
  if (!g.length) return null;
  let enObra = 0;
  let deposito = 0;
  for (const f of g) {
    if (idM2O(f.location_id) === UBIC_OBRA) enObra += f.quantity ?? 0;
    else deposito += f.quantity ?? 0;
  }
  return { enObra: Math.round(enObra), deposito: Math.round(deposito) };
}

/** "vs semana anterior": la foto que guardó el cron hace 7 días (si la tabla ya existe). */
async function leerHistoria(ctx: CtxCalculo): Promise<HistoriaCalle> {
  const hasta = `${sumarDias(ctx.hoy, -7)}T23:59:59-03:00`;
  const out: HistoriaCalle = {};
  try {
    const db = ctx.supabase();
    await Promise.all((["en_la_calle", "dev_vencida", "ot_vencidas"] as const).map(async (k) => {
      const h = await historiaCifra(db, k, { hasta, limite: 1 });
      const c = h[0]?.cifra;
      out[k] = c && c.valor.tipo === "cantidad" ? { valor: c.valor.n, fecha: h[0].tomadoAt.slice(0, 10) } : null;
    }));
  } catch {
    // Sin Supabase (un script) o sin la tabla: la comparación queda "sin historia".
  }
  return out;
}

export const calculador = definirCalculador<DetalleCalle>({
  pantalla: "calle",
  async calcular(ctx) {
    const [entrada, historia] = await Promise.all([leerEntradaCalle(ctx.hoy), leerHistoria(ctx)]);
    const detalle = calcularCalle(entrada);
    return {
      cifras: cifrasCalle(detalle, historia),
      detalle,
      avisos: avisosCalle(detalle),
      decisiones: decisionesCalle(detalle),
      oraciones: oracionesCalle(detalle),
    };
  },
});
