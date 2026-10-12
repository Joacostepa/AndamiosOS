// Lo que vuelve al modelo después de cambiar el borrador.
//
// ANTES devolvía el borrador entero en cada llamada (actualizar_borrador ×132 en 15 días, hasta
// 4,3 k caracteres) y eso queda para siempre en la historia, que se relee en cada pedido
// (auditoría 12/10, 2.6). Ahora: qué cambió (renglones que entran, salen o cambian, y los datos
// del encabezado que cambiaron), los totales, lo que falta para guardar y los avisos. El borrador
// entero sigue estando en ver_borrador; los ids de los renglones nuevos vienen acá, que es lo que
// el modelo usa después para quitar u ordenar.

import type { Linea } from "@/lib/cotizador/tipos";
import type { DatosBorrador, ResultadoBorrador } from "./borrador";

/** Lo que hace falta del borrador (sin depender de datos.ts, que habla con la base). */
export type BorradorParaResumen = {
  version: number;
  estado: string;
  odoo_venta_nombre: string | null;
  datos: DatosBorrador;
  resultado: ResultadoBorrador | null;
};

export const lineaParaModelo = (l: Linea) => ({
  id: l.id, seccion: l.seccion, descripcion: l.descripcion, cantidad: l.cantidad, precioUnitario: l.precioUnitario,
  ...(l.descuentoPct ? { descuentoPct: l.descuentoPct } : {}), importe: l.importe, unicaVez: l.unicaVez, calculo: l.calculo,
});

const igual = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function encabezado(b: BorradorParaResumen) {
  const c = b.datos.cliente;
  return {
    modelo: b.datos.modelo,
    contrato: b.datos.contrato,
    cliente: c.razonSocial ? `${c.razonSocial}${c.partnerId ? ` (Odoo #${c.partnerId})` : c.esNuevo ? " (nuevo)" : ""}` : null,
    obra: b.datos.obra.direccion,
  };
}

/** Totales, faltantes y avisos: lo que el modelo necesita siempre para decir «quedó en $ X». */
export function estadoParaModelo(b: BorradorParaResumen) {
  const r = b.resultado;
  return {
    version: b.version,
    subtotal: r?.totales.subtotal ?? 0,
    iva: r?.totales.iva ?? 0,
    total: r?.totales.total ?? 0,
    renovacion: r?.totales.renovacion ?? null,
    pesoManoDeObraPct: r?.totales.pesoManoDeObraPct ?? null,
    lineas: r?.lineas.length ?? 0,
    pendientes: r?.pendientes ?? [],
    avisos: r?.avisos.filter((a) => a.nivel !== "info").map((a) => a.texto) ?? [],
    faltantesParaGuardar: r?.faltantes.map((f) => f.texto) ?? [],
  };
}

/** Qué cambió entre dos versiones del borrador, más el estado actual. */
export function cambiosParaModelo(antes: BorradorParaResumen, despues: BorradorParaResumen) {
  const a = new Map((antes.resultado?.lineas ?? []).map((l) => [l.id, l]));
  const d = new Map((despues.resultado?.lineas ?? []).map((l) => [l.id, l]));
  const entran = [...d.values()].filter((l) => !a.has(l.id)).map(lineaParaModelo);
  const salen = [...a.values()].filter((l) => !d.has(l.id)).map((l) => ({ id: l.id, descripcion: l.descripcion }));
  const cambian = [...d.values()]
    .filter((l) => a.has(l.id) && !igual(lineaParaModelo(a.get(l.id)!), lineaParaModelo(l)))
    .map(lineaParaModelo);
  const ordenAntes = (antes.resultado?.lineas ?? []).map((l) => l.id).filter((id) => d.has(id));
  const ordenDespues = (despues.resultado?.lineas ?? []).map((l) => l.id).filter((id) => a.has(id));
  const ea = encabezado(antes);
  const ed = encabezado(despues);
  const datos = Object.fromEntries(Object.entries(ed).filter(([k, v]) => !igual(v, ea[k as keyof typeof ea])));
  const plan = despues.resultado?.planPagos ?? null;
  return {
    ...estadoParaModelo(despues),
    ...(Object.keys(datos).length ? { datos } : {}),
    ...(entran.length ? { entran } : {}),
    ...(salen.length ? { salen } : {}),
    ...(cambian.length ? { cambian } : {}),
    ...(!igual(ordenAntes, ordenDespues) ? { orden: (despues.resultado?.lineas ?? []).map((l) => l.id) } : {}),
    ...(!igual(antes.resultado?.planPagos ?? null, plan) ? { planPagos: plan } : {}),
    ...(!entran.length && !salen.length && !cambian.length ? { renglones: "sin cambios en los renglones" } : {}),
  };
}
