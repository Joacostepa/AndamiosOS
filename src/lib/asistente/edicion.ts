// Editar un presupuesto que ya está en Odoo, con el mismo número (Joaquín, 06/10).
//
// Hasta acá el asistente sólo actualizaba las órdenes que guardaba él en la misma charla. Para
// cualquier otra, re-emitía: número nuevo y la vieja cancelada. Editar es abrir la orden, cambiar
// lo que se pida y volver a escribirla.
//
// AL GUARDAR SE REESCRIBEN TODAS LAS LÍNEAS ([5, 0, 0] en valoresOrden). Por eso, al abrir, lo que
// hay en Odoo y no está en el borrador (un flete o un opcional aceptado, cargados a mano) se copia
// tal cual, y antes de confirmar se muestra qué cambia contra lo que hay hoy en la orden.
//
// Puro (sin base ni red): lo usan las herramientas y los tests.

import { alPeso, pesos, type Linea } from "../cotizador/tipos.ts";
import type { LineaVenta } from "../odoo/comercial.ts";
import type { ProductoOdoo } from "../parametros-cotizacion/tipos.ts";

export type LineaComparable = { productId: number | null; descripcion: string; cantidad: number; precioUnitario: number; descuentoPct: number };

export type Comparacion = {
  iguales: number;
  cambiadas: { antes: LineaComparable; despues: LineaComparable }[];
  /** Están en la orden y no en lo nuevo: se van. */
  salen: LineaComparable[];
  /** Están en lo nuevo y no en la orden. */
  entran: LineaComparable[];
};

const importe = (l: LineaComparable) => alPeso(l.cantidad * l.precioUnitario * (1 - l.descuentoPct / 100));
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
const igual = (a: LineaComparable, b: LineaComparable) =>
  Math.abs(a.cantidad - b.cantidad) < 0.005 && Math.abs(a.precioUnitario - b.precioUnitario) < 0.5 && Math.abs(a.descuentoPct - b.descuentoPct) < 0.005;

/** Empareja por producto, primero con la misma descripción. */
export function compararLineas(antes: LineaComparable[], despues: LineaComparable[]): Comparacion {
  const libres = antes.map((l, i) => ({ l, i }));
  const pares: { antes: LineaComparable; despues: LineaComparable }[] = [];
  const sinPar: LineaComparable[] = [];
  const tomar = (pred: (a: LineaComparable) => boolean) => {
    const k = libres.findIndex((x) => pred(x.l));
    return k === -1 ? null : libres.splice(k, 1)[0].l;
  };
  // Dos pasadas: así una línea con su misma descripción no la gana otra del mismo producto.
  const pendientes: LineaComparable[] = [];
  for (const d of despues) {
    const a = tomar((x) => x.productId === d.productId && norm(x.descripcion) === norm(d.descripcion));
    if (a) pares.push({ antes: a, despues: d });
    else pendientes.push(d);
  }
  for (const d of pendientes) {
    const a = tomar((x) => x.productId === d.productId);
    if (a) pares.push({ antes: a, despues: d });
    else sinPar.push(d);
  }
  return {
    iguales: pares.filter((p) => igual(p.antes, p.despues) && norm(p.antes.descripcion) === norm(p.despues.descripcion)).length,
    cambiadas: pares.filter((p) => !igual(p.antes, p.despues) || norm(p.antes.descripcion) !== norm(p.despues.descripcion)),
    salen: libres.map((x) => x.l),
    entran: sinPar,
  };
}

const corta = (s: string) => s.split(" — ")[0].trim();
const detalle = (l: LineaComparable) =>
  `${l.cantidad.toLocaleString("es-AR")} × ${pesos(l.precioUnitario)}${l.descuentoPct ? ` −${l.descuentoPct.toLocaleString("es-AR")} %` : ""} = ${pesos(importe(l))}`;

/** Los cambios en castellano, uno por renglón, para el resumen que se confirma. */
export function textoCambios(c: Comparacion): string[] {
  const out: string[] = [];
  for (const { antes, despues } of c.cambiadas) {
    const nombre = norm(corta(antes.descripcion)) === norm(corta(despues.descripcion)) ? corta(despues.descripcion) : `${corta(antes.descripcion)} → ${corta(despues.descripcion)}`;
    out.push(`Cambia: ${nombre}: ${detalle(antes)} → ${detalle(despues)}`);
  }
  for (const l of c.salen) out.push(`Sale: ${corta(l.descripcion)} (${pesos(importe(l))})`);
  for (const l of c.entran) out.push(`Entra: ${corta(l.descripcion)} (${pesos(importe(l))})`);
  return out;
}

export function comparablesDeOdoo(lineas: LineaVenta[]): LineaComparable[] {
  return lineas
    .filter((l) => l.tipo === "linea")
    .map((l) => ({ productId: l.productoId, descripcion: l.descripcion, cantidad: l.cantidad, precioUnitario: l.precioUnitario, descuentoPct: l.descuentoPct }));
}

/** El producto de Odoo de una línea del motor: el de la tabla o, si se copió de una orden, ése. */
export function productoDeLinea(l: Linea, productos: ProductoOdoo[]): { id: number; alquiler: boolean } | null {
  if (l.productoOdoo) return l.productoOdoo;
  const p = productos.find((x) => x.clave === l.producto);
  return p ? { id: p.product_id, alquiler: p.is_rental } : null;
}

export function comparablesDelMotor(lineas: Linea[], productos: ProductoOdoo[]): LineaComparable[] {
  return lineas
    .filter((l) => l.seccion === "base")
    .map((l) => ({ productId: productoDeLinea(l, productos)?.id ?? null, descripcion: l.descripcion, cantidad: l.cantidad, precioUnitario: l.precioUnitario, descuentoPct: l.descuentoPct ?? 0 }));
}

/**
 * Las líneas de una orden, copiadas como líneas a mano del borrador: mismo producto, misma
 * descripción, misma cantidad y mismo precio. Las secciones y notas de Odoo no se copian (se
 * avisan). Una línea opcional vieja (is_optional) pasa a opcional: va al PDF, no a la orden.
 */
export function lineasDesdeOdoo(lineas: LineaVenta[], productos: ProductoOdoo[], venta: string): { lineas: Linea[]; sinCopiar: string[] } {
  const out: Linea[] = [];
  const sinCopiar: string[] = [];
  for (const l of lineas) {
    if (l.tipo !== "linea" || l.productoId === null) {
      sinCopiar.push(`${l.tipo === "seccion" ? "Sección" : l.tipo === "nota" ? "Nota" : "Línea sin producto"}: «${corta(l.descripcion)}»`);
      continue;
    }
    const p = productos.find((x) => x.product_id === l.productoId && x.activo);
    const lista = alPeso(l.cantidad * l.precioUnitario);
    out.push({
      id: `odoo:${l.id}`,
      grupo: "manual",
      seccion: l.opcional ? "opcional" : "base",
      producto: p?.clave ?? `odoo:${l.productoId}`,
      descripcion: l.descripcion,
      cantidad: l.cantidad,
      precioUnitario: l.precioUnitario,
      ...(l.descuentoPct ? { descuentoPct: l.descuentoPct } : {}),
      importe: alPeso(l.cantidad * l.precioUnitario * (1 - l.descuentoPct / 100)),
      importeLista: lista,
      unicaVez: p?.unica_vez ?? false,
      calculo: `copiada de la ${venta}: ${l.cantidad.toLocaleString("es-AR")} × ${pesos(l.precioUnitario)}`,
      ...(p ? {} : { productoOdoo: { id: l.productoId, alquiler: l.alquiler } }),
    });
  }
  return { lineas: out, sinCopiar };
}

/**
 * Quién edita qué. Las confirmadas y las canceladas no se tocan (se re-emiten). Una orden de
 * otro vendedor sólo la edita un admin (Joaquín, 06/10). Es propia si el técnico o el vendedor
 * de la orden son los de quien usa el asistente.
 */
export function puedeEditar(
  v: { numero: string; estadoOdoo: string; tecnicoId: number | null; vendedorId: number | null; tecnico: string | null; vendedor: string | null },
  yo: { tecnicoEmployeeId: number | null; vendedorUserId: number | null },
  admin: boolean,
): { ok: true; ajena: boolean } | { ok: false; motivo: string } {
  if (v.estadoOdoo === "sale") return { ok: false, motivo: `La ${v.numero} está confirmada: no se edita. Si hay que cambiarla, se re-emite (nuevo_borrador con desdeVenta) o se habla con Joaquín.` };
  if (v.estadoOdoo === "cancel") return { ok: false, motivo: `La ${v.numero} está cancelada: para retomarla, re-emitila (nuevo_borrador con desdeVenta).` };
  if (v.estadoOdoo !== "draft" && v.estadoOdoo !== "sent") return { ok: false, motivo: `La ${v.numero} está en un estado que no se edita (${v.estadoOdoo}).` };
  const propia = (v.tecnicoId !== null && v.tecnicoId === yo.tecnicoEmployeeId) || (v.vendedorId !== null && v.vendedorId === yo.vendedorUserId);
  if (!propia && !admin) {
    return { ok: false, motivo: `La ${v.numero} es de ${[v.tecnico, v.vendedor].filter(Boolean).join(" / ") || "otro vendedor"}: las órdenes de otro las edita sólo Joaquín.` };
  }
  return { ok: true, ajena: !propia };
}
