// Qué herramientas de una misma vuelta pueden correr a la vez (auditoría 12/10, 3.5).
//
// Las que sólo leen (Odoo, la lista de alquiler, el CUIT, el borrador sin tocarlo) no dependen
// una de la otra: tres búsquedas en Odoo no tienen por qué esperarse. Las que tocan el borrador
// o las acciones van de a una y en el orden en que las pidió el modelo, porque cada una parte de
// lo que dejó la anterior. Los resultados vuelven siempre en el orden pedido.

export const SOLO_LECTURA = new Set([
  "buscar_clientes", "ver_cliente", "buscar_presupuestos", "ver_presupuesto", "leer_pdf_propuesta", "precios_recientes",
  "pendientes_comerciales", "estado_obra", "consultar_planificacion", "consultar_odoo", "buscar_piezas", "validar_cuit",
  "ver_borrador", "referencia_venta_material",
]);

/** Las herramientas de una vuelta en tandas: las de sólo lectura seguidas, juntas; las demás, solas. */
export function tandasDeHerramientas<U extends { name: string }>(usos: U[]): U[][] {
  const tandas: U[][] = [];
  for (const u of usos) {
    const ultima = tandas.at(-1);
    if (ultima && SOLO_LECTURA.has(u.name) && SOLO_LECTURA.has(ultima[0].name)) ultima.push(u);
    else tandas.push([u]);
  }
  return tandas;
}
