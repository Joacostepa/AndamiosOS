// Espejo de materiales: lectura de product.product (bienes) desde Odoo y mapeo a
// la tabla `catalogo_piezas`.
//
// REGLA DE NEGOCIO: Odoo es la fuente de verdad. La clave estable es `odoo_product_id`.
// Hoy los productos de Odoo vienen "planos" (sin código, sin categoría, sin peso),
// así que: codigo se genera (ODOO-<id>) si no hay default_code, y la categoría se
// INFIERE del nombre (best-effort) hasta que Odoo tenga categorías reales.

import { searchRead } from "./client";

export type OdooProduct = {
  id: number;
  default_code: string | false;
  name: string | false;
  categ_id: [number, string] | false;
  uom_id: [number, string] | false;
  weight: number | false;
  active: boolean;
};

const PRODUCT_FIELDS = ["id", "default_code", "name", "categ_id", "uom_id", "weight", "active"];

/** Trae los productos de tipo bien (consu). Los servicios quedan afuera (son comerciales). */
export function fetchOdooGoods(): Promise<OdooProduct[]> {
  return searchRead<OdooProduct>(
    "product.product",
    [["type", "=", "consu"]],
    PRODUCT_FIELDS,
    { limit: 10000, order: "name" },
  );
}

/** Trae un producto puntual por id (para el webhook). Null si no existe. */
export async function fetchProductById(id: number): Promise<OdooProduct | null> {
  const rows = await searchRead<OdooProduct>("product.product", [["id", "=", id]], PRODUCT_FIELDS, { limit: 1 });
  return rows[0] ?? null;
}

// Inferencia de categoría por keyword en el nombre. Best-effort hasta que Odoo
// tenga `categ_id` cargado. El orden importa: lo más específico primero.
const CATEGORIA_KEYWORDS: Array<[RegExp, string]> = [
  [/bastidor|marco/i, "marco"],
  [/m[oó]dulo/i, "modulo"],
  [/tabl[oó]n|tablero|escotilla/i, "tablon"],
  [/diagonal|cruceta/i, "diagonal"],
  [/plataforma/i, "plataforma"],
  [/rodapie|z[oó]calo/i, "rodapie"],
  [/escalera|peldañ/i, "escalera"],
  [/baranda|barandilla|guardacuerpo/i, "barandilla"],
  [/conector|grampa|grapa|abrazadera|acople|uni[oó]n|nudo/i, "conector"],
  [/anclaje|\bancla\b|tensor|amarre/i, "anclaje"],
  [/rueda|garrucha|roldana/i, "rueda"],
  [/tornillo|bul[oó]n|tuerca|perno|esp[aá]rrago|arandela/i, "tornillo"],
  [/\bviga\b/i, "viga"],
  [/puntal/i, "puntal"],
  [/valla/i, "valla"],
  [/tribuna/i, "tribuna"],
  [/cañ[oó]|\btubo\b|tuber[ií]a/i, "caño"],
  [/vertical|parante/i, "vertical"],
  [/horizontal|larguero|travesañ|barral/i, "horizontal"],
  [/husillo|placa base|\bpata\b/i, "base"],
  [/arn[eé]s|casco|guante|cinto|eslinga|l[ií]nea de vida|mosquet[oó]n|epp|seguridad/i, "epp"],
  [/buzo|camisa|pantal[oó]n|remera|indumentaria|calzado|bot[ií]n/i, "indumentaria"],
  [/aparejo|llave|martillo|taladro|amoladora|herramienta|nivel|plomada/i, "herramienta"],
  [/adhesivo|alambre|pintura|manguera|electrodo|soldadura|silicona|cinta|disco|lija|consumible/i, "consumible"],
  [/accesorio/i, "accesorio"],
];

export function inferCategoria(name: string): string {
  for (const [re, cat] of CATEGORIA_KEYWORDS) if (re.test(name)) return cat;
  return "otro";
}

function normUom(uom: [number, string] | false): string {
  const n = Array.isArray(uom) ? uom[1] : "";
  if (!n) return "unidad";
  if (/unit|unidad/i.test(n)) return "unidad";
  return n.toLowerCase();
}

export function mapProductToPieza(p: OdooProduct) {
  const nombre = (typeof p.name === "string" ? p.name.trim() : "") || `Odoo #${p.id}`;
  const codigo =
    typeof p.default_code === "string" && p.default_code.trim()
      ? p.default_code.trim()
      : `ODOO-${p.id}`;
  return {
    codigo,
    descripcion: nombre,
    // Si Odoo tiene categoría real la usaríamos; hoy viene vacía → inferimos del nombre.
    categoria: inferCategoria(nombre),
    sistema_andamio: "otro" as const,
    peso_kg: typeof p.weight === "number" && p.weight > 0 ? p.weight : null,
    unidad_medida: normUom(p.uom_id),
    activo: p.active,
    odoo_product_id: p.id,
  };
}

// ── Plan de sync ────────────────────────────────────────────────────────────────

export type PiezaRow = { id: string; odoo_product_id?: number | null };
export type PiezaValues = ReturnType<typeof mapProductToPieza>;

export type ProductSyncReport = {
  odoo_goods: number;
  app_piezas: number;
  to_insert: number;
  to_update: number;
  categoria_dist: Record<string, number>;
};

export type ProductSyncPlan = {
  toInsert: PiezaValues[];
  toUpdate: Array<{ id: string; values: PiezaValues }>;
};

export function buildReport(odoo: OdooProduct[], app: PiezaRow[]): ProductSyncReport {
  const linked = new Set(app.filter((a) => a.odoo_product_id).map((a) => a.odoo_product_id));
  const dist: Record<string, number> = {};
  let toInsert = 0, toUpdate = 0;
  for (const p of odoo) {
    const values = mapProductToPieza(p);
    dist[values.categoria] = (dist[values.categoria] ?? 0) + 1;
    if (linked.has(p.id)) toUpdate++; else toInsert++;
  }
  const categoria_dist = Object.fromEntries(
    Object.entries(dist).sort((a, b) => b[1] - a[1]),
  );
  return { odoo_goods: odoo.length, app_piezas: app.length, to_insert: toInsert, to_update: toUpdate, categoria_dist };
}

export function planSync(odoo: OdooProduct[], app: PiezaRow[]): ProductSyncPlan {
  const byOdoo = new Map<number, PiezaRow>();
  for (const a of app) if (a.odoo_product_id) byOdoo.set(a.odoo_product_id, a);

  const plan: ProductSyncPlan = { toInsert: [], toUpdate: [] };
  for (const p of odoo) {
    const values = mapProductToPieza(p);
    const linked = byOdoo.get(p.id);
    if (linked) plan.toUpdate.push({ id: linked.id, values });
    else plan.toInsert.push(values);
  }
  return plan;
}
