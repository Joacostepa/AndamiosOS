// Nodos de desglose de Socios (reservado: el registro marca reservado todo nodo de la
// pantalla "socios", y la API exige direccion-socios).
//
//  retiros       (nivel 1, tarjeta "Retirado en 2026") meses del año, o por socio (?g=socio,
//                ?s=jorge|gabriel). Sale del resultado cacheado de la pantalla.
//  retirosMes    (nivel 2) los movimientos de un mes (?mes=AAAA-MM&s=…), en vivo, paginados.
//  retirosGasto  (nivel 2) la cuenta 4.2.1.04.19 de los últimos 12 meses: qué es retiro y qué no.

import { fcorta, mesNombre, nf } from "../formato.ts";
import type { FilaDesglose, Monto, NodoDesglose, NodoRef } from "../tipos.ts";
import { leerLineasSocios, type DetalleSocios } from "../calculo/socios.ts";
import {
  clasificarLinea, CUENTA_DIVIDENDOS, CUENTA_RETIRO_GASTO, moverMes, SOCIOS, sumarMontos, usdDeLinea, type LineaSocios, type SocioClave,
} from "../calculo/socios-reglas.ts";
import { definirNodo, paginar, type DefNodo } from "./contrato.ts";

const esSocio = (s: string | undefined): s is SocioClave => s === "jorge" || s === "gabriel";
const nombreSocio = (s: SocioClave) => SOCIOS.find((x) => x.clave === s)!.corto;
const valor = (m: Monto) => ({ tipo: "monto" as const, monto: m });

const retiros = definirNodo({
  tipo: "retiros",
  pantalla: "socios",
  reservado: true,
  async resolver(ref, ctx) {
    const r = await ctx.pantalla<DetalleSocios>("socios");
    const d = r.detalle;
    const delAnio = d.meses.filter((m) => m.mes.startsWith(d.anio));
    const s = esSocio(ref.s) ? ref.s : null;
    const g = ref.g === "socio" && !s ? "socio" : "mes";
    const resMes = new Map(d.resultado.map((x) => [x.mes, x.gestion]));
    const agrupar = { param: "g", activo: g, opciones: [{ valor: "mes", etiqueta: "Mes" }, { valor: "socio", etiqueta: "Socio" }] };

    if (g === "socio") {
      const filas: FilaDesglose[] = d.socios.map((x) => ({
        id: x.clave,
        titulo: x.nombre,
        sub: "retiros netos + dividendos",
        valor: valor(x.anio.total),
        barra: Math.abs(d.totalAnio.ars) > 0 ? Math.max(0, x.anio.total.ars) / Math.abs(d.totalAnio.ars) : undefined,
        hijo: { tipo: "retiros", s: x.clave },
      }));
      return {
        titulo: `Retiros de socios ${d.anio}`,
        cifra: valor(d.totalAnio),
        sub: "Por socio · incluye dividendos",
        agrupar,
        secciones: [{ filas, cierre: { suma: sumarMontos(d.socios.map((x) => x.anio.total)), cifra: d.totalAnio, texto: `lo retirado en ${d.anio}` } }],
      };
    }

    const totalDe = (m: (typeof delAnio)[number]) => (s ? m.socios[s].total : m.total);
    const filas: FilaDesglose[] = delAnio.map((m) => {
      const res = resMes.get(m.mes);
      const t = totalDe(m);
      const p = !m.parcial && res?.usd && t.usd != null && res.usd > 0 ? (t.usd / res.usd) * 100 : null;
      return {
        id: m.mes,
        titulo: `${m.etiqueta}${(s ? m.socios[s].sinDolarizar && m.socios[s].conMovimientos : m.sinDolarizar) ? " · sin pasar a dólares en Odoo" : ""}`,
        sub: m.parcial ? "mes en curso" : p != null ? `${nf(p)} % del resultado` : "sin resultado del mes",
        valor: valor(t),
        etiqueta: !m.parcial && p != null && p > 100 ? { texto: "más que el resultado", tono: "aten" as const } : undefined,
        hijo: (s ? { tipo: "retirosMes", mes: m.mes, s } : { tipo: "retirosMes", mes: m.mes }) as NodoRef,
      };
    });
    const cifra = s ? d.socios.find((x) => x.clave === s)!.anio.total : d.totalAnio;
    return {
      titulo: s ? `Retiros de ${nombreSocio(s)} ${d.anio}` : `Retiros de socios ${d.anio}`,
      cifra: valor(cifra),
      sub: "Por mes · retiros netos + dividendos · USD al dólar de cada movimiento",
      agrupar: s ? undefined : agrupar,
      avisos: d.mesesSinDolarizar.length ? [{ texto: "Los meses sin pasar a dólares en Odoo se calculan igual, desde las cuentas en pesos.", tono: "gris" }] : undefined,
      secciones: [{ filas, cierre: { suma: sumarMontos(filas.map((f) => (f.valor as { monto: Monto }).monto)), cifra, texto: `lo retirado en ${d.anio}` } }],
    };
  },
});

/** Una fila por movimiento (o por parte, si una línea se reparte entre los dos socios). */
function filasDeLinea(l: LineaSocios, dolar: Parameters<typeof usdDeLinea>[1], s: SocioClave | null): (FilaDesglose & { m: Monto; socio: SocioClave })[] {
  const t = clasificarLinea(l);
  const usd = usdDeLinea(l, dolar);
  const partes: { socio: SocioClave; factor: number; que: string }[] =
    t.tipo === "particular" ? [{ socio: t.socio, factor: 1, que: l.balance >= 0 ? "retiro" : "devolución o compensación" }]
    : t.tipo === "gasto" ? t.partes.map((p) => ({ ...p, que: p.factor < 1 ? "dólares cargados como gasto (50 %)" : "dólares cargados como gasto" }))
    : t.tipo === "dividendo" ? [{ socio: t.socio, factor: 1, que: "dividendo pagado" }]
    : [];
  return partes
    .filter((p) => !s || p.socio === s)
    .map((p) => {
      const m: Monto = { ars: l.balance * p.factor, usd: usd == null ? null : usd * p.factor };
      return {
        id: `${l.id}-${p.socio}`,
        titulo: l.nombre || l.asiento,
        sub: `${nombreSocio(p.socio)} · ${fcorta(l.fecha)} · ${p.que}`,
        valor: valor(m),
        odoo: l.asientoId ? { modelo: "account.move", id: l.asientoId } : undefined,
        m,
        socio: p.socio,
      };
    });
}

/** La fila sin los campos internos (m, socio). */
function aFila(f: FilaDesglose & { m: Monto; socio: SocioClave }): FilaDesglose {
  const { id, titulo, sub, valor: v, odoo } = f;
  return { id, titulo, sub, valor: v, odoo };
}

const retirosMes = definirNodo({
  tipo: "retirosMes",
  pantalla: "socios",
  reservado: true,
  async resolver(ref, ctx) {
    const mes = /^\d{4}-\d{2}$/.test(ref.mes ?? "") ? ref.mes : ctx.hoy.slice(0, 7);
    const s = esSocio(ref.s) ? ref.s : null;
    const desde = `${mes}-01`;
    const hasta = `${moverMes(mes, 1)}-01`;
    const cuentas = [...SOCIOS.filter((x) => !s || x.clave === s).map((x) => x.cuentaArs), CUENTA_RETIRO_GASTO, CUENTA_DIVIDENDOS];
    const lineas = await leerLineasSocios([["date", ">=", desde], ["date", "<", hasta]], cuentas);
    const todas = lineas.flatMap((l) => filasDeLinea(l, ctx.dolar, s)).sort((a, b) => Math.abs(b.m.ars) - Math.abs(a.m.ars));
    const total = sumarMontos(todas.map((f) => f.m));
    // La cifra de arriba es la del mes en la pantalla (cacheada): el cierre las compara.
    const r = await ctx.pantalla<DetalleSocios>("socios");
    const m = r.detalle.meses.find((x) => x.mes === mes);
    const cifra = m ? (s ? m.socios[s].total : m.total) : total;
    const { filas, pagina } = paginar(todas, ctx.pagina);
    const nombre = mesNombre(mes);
    return {
      titulo: `${s ? `${nombreSocio(s)} · ` : ""}${nombre[0].toUpperCase()}${nombre.slice(1)} ${mes.slice(0, 4)}`,
      cifra: valor(cifra),
      sub: `${todas.length} movimientos · pesos de cada mes · USD al dólar de cada movimiento`,
      agrupar: { param: "s", activo: s ?? "", opciones: [{ valor: "", etiqueta: "Los dos" }, ...SOCIOS.map((x) => ({ valor: x.clave, etiqueta: x.corto }))] },
      csv: true,
      pagina,
      secciones: [{
        filas: filas.map(aFila),
        cierre: { suma: total, cifra, texto: "lo retirado en el mes", explica: "la pantalla se calculó antes de un movimiento nuevo; tocá Actualizar" },
        nota: "No incluye los asientos de dolarización ni de reclasificación (mueven el mismo retiro entre cuentas).",
      }],
    } satisfies NodoDesglose;
  },
});

const retirosGasto = definirNodo({
  tipo: "retirosGasto",
  pantalla: "socios",
  reservado: true,
  async resolver(_ref, ctx) {
    const desde = `${moverMes(ctx.hoy.slice(0, 7), -11)}-01`;
    const lineas = await leerLineasSocios([["date", ">=", desde], ["date", "<=", ctx.hoy]], [CUENTA_RETIRO_GASTO]);
    const retiro = lineas.flatMap((l) => filasDeLinea(l, ctx.dolar, null));
    const otros = lineas.filter((l) => clasificarLinea(l).tipo === "no_retiro");
    const total = sumarMontos(retiro.map((f) => f.m));
    return {
      titulo: "Retiros cargados como gasto",
      cifra: valor(total),
      sub: `Cuenta ${CUENTA_RETIRO_GASTO} · últimos 12 meses`,
      csv: true,
      secciones: [
        {
          titulo: "Retiros (cuentan como retiro, no como gasto)",
          filas: retiro.map(aFila),
          cierre: { suma: total, cifra: total, texto: "los retiros de la cuenta" },
        },
        ...(otros.length
          ? [{
              titulo: "No es retiro (hay que reimputarlo)",
              filas: otros.map((l) => ({
                id: String(l.id),
                titulo: l.nombre || l.asiento,
                sub: `${fcorta(l.fecha)} · ${l.asiento.split(" (")[0]}`,
                valor: valor({ ars: l.balance }),
                etiqueta: { texto: "sin socio", tono: "aten" as const },
                odoo: l.asientoId ? { modelo: "account.move", id: l.asientoId } : undefined,
              })),
              nota: "No cuenta ni como retiro ni como gasto del resultado.",
            }]
          : []),
      ],
    } satisfies NodoDesglose;
  },
});

export const nodos: DefNodo[] = [retiros, retirosMes, retirosGasto];
