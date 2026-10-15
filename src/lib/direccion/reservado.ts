// Lo reservado a socios NO viaja a quien no tiene `direccion-socios` (diseno.md §10.2).
//
// La caché de una pantalla es la misma para todos los usuarios, así que el recorte se hace
// DESPUÉS de leerla, por usuario, en el servidor. Sin el permiso se quita:
//  · cifras marcadas `reservado` o cuyo indicador es reservado en el diccionario (retiros);
//  · avisos, decisiones y oraciones marcados `reservado`;
//  · `detalle.reservado` (la convención para meter algo de socios en el detalle de otra
//    pantalla: todo lo que cuelgue de esa clave se borra).
// Algo que CAMBIA con lo reservado (p. ej. la cobertura de caja con y sin los retiros) va en
// dos versiones: `soloConSocios` (se quita sin el permiso) y `soloSinSocios` (se quita con el
// permiso). Ver `variantes()`. No se usa `reservado` para eso porque `reservado` además
// significa "tema de socios" en la UI (pie de la narrativa, 🔒, notas reservadas).
// La pantalla Socios entera no se calcula ni se lee sin el permiso (servidor.ts).

import { DEF } from "./diccionario.ts";
import type { ResultadoCalculador } from "./tipos.ts";

type Marcable = { reservado?: boolean; soloConSocios?: boolean; soloSinSocios?: boolean };

export function filtrarReservado<R extends ResultadoCalculador<unknown>>(r: R, conSocios: boolean): R {
  if (conSocios) {
    const va = (x: Marcable) => !x.soloSinSocios;
    return {
      ...r,
      cifras: r.cifras.filter(va),
      avisos: r.avisos.filter(va),
      decisiones: r.decisiones?.filter(va),
      oraciones: r.oraciones?.filter(va),
    };
  }
  const detalle =
    r.detalle && typeof r.detalle === "object" && !Array.isArray(r.detalle) && "reservado" in (r.detalle as object)
      ? Object.fromEntries(Object.entries(r.detalle as Record<string, unknown>).filter(([k]) => k !== "reservado"))
      : r.detalle;
  const va = (x: Marcable) => !esDeSocios(x);
  return ocultarCircuitos({
    ...r,
    cifras: r.cifras.filter((c) => va(c) && !DEF[c.kpi]?.reservado),
    avisos: r.avisos.filter(va),
    decisiones: r.decisiones?.filter(va),
    oraciones: r.oraciones?.filter(va),
    detalle,
  });
}

/**
 * Circuitos de facturación (diseno.md §10.2: sólo socios). Ventas, Cobranzas y Caja suman los
 * comprobantes de todos los diarios y el desglose muestra el número de cada uno. Los diarios
 * sin documentos fiscales numeran "<código>/<año>/<número>" ("1/2026/00314") en vez de
 * "FA-A 00007-00001184": con ese número a la vista, cualquiera reconoce el otro circuito
 * comprobante por comprobante. Sin direccion-socios, ese número se cambia por "Comprobante"
 * (el monto, el cliente y la fecha quedan: los totales siguen cerrando).
 *
 * Códigos de diario en Odoo (account.journal, l10n_latam_use_documents = false):
 *   "1"     Facturación No ARCA (ventas) — sus NC llevan "R" adelante ("R1/2026/…").
 *   "BILL1" Compras No ARCA ("BILL1/2026/09/0003": con el mes).
 * Los bancos y cajas (BNK1, CSH1…) también numeran así, pero no son un circuito: no se tocan.
 */
export const DIARIOS_CIRCUITO_RESERVADO = ["1", "BILL1"] as const;
export const PATRON_COMPROBANTE_INTERNO = new RegExp(`(?<![A-Za-z0-9])R?(?:${DIARIOS_CIRCUITO_RESERVADO.join("|")})\\/\\d{4}(?:\\/\\d{2})?\\/\\d{3,6}\\b`, "g");
export const TEXTO_COMPROBANTE_INTERNO = "Comprobante";

export function ocultarCircuitos<T>(x: T): T {
  if (typeof x === "string") return (x.includes("/") ? x.replace(PATRON_COMPROBANTE_INTERNO, TEXTO_COMPROBANTE_INTERNO) : x) as T;
  if (Array.isArray(x)) return x.map(ocultarCircuitos) as T;
  if (x && typeof x === "object") return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, ocultarCircuitos(v)])) as T;
  return x;
}

/**
 * Junta la versión para socios y la versión pública de una lista (oraciones, decisiones,
 * cifras, avisos) calculadas aparte. Si son iguales, una sola. Si no, la de socios entera
 * (marcada `soloConSocios`) y después la pública (marcada `soloSinSocios`, sin lo que ya era
 * reservado): después de filtrarReservado cada usuario ve exactamente su lista, en su orden.
 */
export function variantes<T extends Marcable>(socios: readonly T[], publico: readonly T[]): T[] {
  if (JSON.stringify(socios) === JSON.stringify(publico)) return [...socios];
  return [
    ...socios.map((x) => (x.reservado ? x : { ...x, soloConSocios: true })),
    ...publico.filter((x) => !x.reservado).map((x) => ({ ...x, soloSinSocios: true })),
  ];
}

/** ¿Lo puede leer sólo un socio? (reservado, o la versión de socios de una variante). */
export function esDeSocios(x: Marcable): boolean {
  return !!x.reservado || !!x.soloConSocios;
}
