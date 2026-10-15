// Nodos de desglose de En la calle.
//
// Nivel 1 (los abre cada tarjeta, tipo = id del diccionario): en_la_calle, abono_vigente, m2,
// dev_vencida (?f=sin: sólo los que no se facturan hace +40 días), fin_vencido, ot_vencidas,
// y sin_renovacion (lo abre la decisión "sin_renov").
// Nivel 2: contratosCalle (?t=tipo | c=cliente | fuente=…, paginado, con CSV) y
// contratoCalle (?v=S00735: la ficha del contrato, con sus facturas leídas en vivo).
// Todo sale del resultado cacheado de la pantalla (ctx.pantalla("calle")), salvo las facturas
// de un contrato. Nada es reservado.

import { definirNodo, paginar, type DefNodo } from "./contrato.ts";
import { searchRead, searchReadTodo } from "../odoo-lectura.ts";
import { fcorta, flarga, nf, nombreLindo, sinDato } from "../formato.ts";
import type { CierreDesglose, FilaDesglose, NodoDesglose, Valor } from "../tipos.ts";
import type { DetalleCalle, FilaContrato, FilaOt, FuenteAbono, Reemplazada } from "../calculo/calle-reglas.ts";

async function detalle(ctx: Parameters<DefNodo["resolver"]>[1]): Promise<DetalleCalle> {
  const r = await ctx.pantalla<DetalleCalle | null>("calle");
  if (!r.detalle) throw new Error("En la calle todavía no tiene datos.");
  return r.detalle;
}

const ars = (n: number | null | undefined, motivo = "Sin abono calculado"): Valor => (n == null ? sinDato(motivo) : { tipo: "monto", monto: { ars: n } });
const cant = (n: number, unidad?: string): Valor => ({ tipo: "cantidad", n, ...(unidad ? { unidad } : {}) });
const sumaAbono = (fs: FilaContrato[]) => fs.reduce((a, f) => a + (f.abonoArs ?? 0), 0);
const cierreAbono = (fs: FilaContrato[], cifra: number, texto: string): CierreDesglose => ({ suma: { ars: sumaAbono(fs) }, cifra: { ars: cifra }, texto });

const NOMBRE_FUENTE: Record<FuenteAbono, string> = {
  ultima_renovacion: "Última renovación cargada",
  cuota_facturada: "Cuota que se viene facturando",
  estimado_sin_renovacion: "Estimado: todavía no renovó",
  sin_dato: "Sin dato",
};

/** Una fila de contrato: abre su ficha (nivel 2). */
function filaContrato(f: FilaContrato, opts: { sub: string; valor?: "abono" | "contrato" }): FilaDesglose {
  const usaContrato = opts.valor === "contrato" || (opts.valor !== "abono" && f.abonoArs == null);
  return {
    id: f.orden,
    titulo: `${f.orden} · ${nombreLindo(f.cliente)}`,
    sub: opts.sub,
    valor: usaContrato ? ars(f.contratoArs) : ars(f.abonoArs, "Sin abono: no tiene renovaciones, cuotas ni alquiler inicial"),
    valorSub: usaContrato ? "contrato" : "por mes",
    etiqueta: !f.sigueFacturando && f.enLaCalle ? { texto: f.diasSinFacturar != null ? `sin facturar ${f.diasSinFacturar} d` : "sin facturas", tono: "mal" } : undefined,
    hijo: { tipo: "contratoCalle", v: f.orden },
  };
}

const via = (f: FilaContrato) => (f.facturadoVia ? ` · factura vía ${f.facturadoVia}` : "");

function notaReemplazadas(rs: Reemplazada[]): string | undefined {
  if (!rs.length) return undefined;
  const porRep = new Map<string, string[]>();
  for (const r of rs) porRep.set(r.por, [...(porRep.get(r.por) ?? []), r.orden]);
  return `Una obra con órdenes reemplazadas se cuenta una vez: ${[...porRep].map(([por, os]) => `${os.join(" y ")} → ${por}`).join(", ")}.`;
}

function seccionPorTipo(d: DetalleCalle): NodoDesglose["secciones"][number] {
  const tipos = d.porTipo.filter((t) => t.contratos > 0);
  return {
    titulo: "Por tipo",
    filas: tipos.map((t) => ({
      id: t.tipo, titulo: t.tipo, sub: `${t.contratos} contratos`,
      valor: ars(t.abonoArs), valorSub: "por mes",
      barra: d.abono.totalArs ? t.abonoArs / d.abono.totalArs : undefined,
      hijo: { tipo: "contratosCalle", t: t.tipo },
    })),
    cierre: d.abono.totalArs != null ? { suma: { ars: tipos.reduce((a, t) => a + t.abonoArs, 0) }, cifra: { ars: d.abono.totalArs }, texto: "el abono en la calle" } : undefined,
  };
}

// ─── Nivel 1 ────────────────────────────────────────────────────────────────────────────

const enLaCalle = definirNodo({
  tipo: "en_la_calle",
  pantalla: "calle",
  async resolver(_ref, ctx) {
    const d = await detalle(ctx);
    const max = d.topClientes[0]?.abonoArs ?? 0;
    const secciones: NodoDesglose["secciones"] = [
      seccionPorTipo(d),
      {
        titulo: "Principales clientes",
        filas: d.topClientes.map((c) => ({
          id: c.cliente, titulo: nombreLindo(c.cliente), sub: `${c.contratos} ${c.contratos === 1 ? "contrato" : "contratos"} · ${nf(c.pct, 1)} % del abono`,
          valor: ars(c.abonoArs), valorSub: "por mes", barra: max ? c.abonoArs / max : undefined, hijo: { tipo: "contratosCalle", c: c.cliente },
        })),
      },
    ];
    if (d.reemplazadas.length) {
      secciones.push({
        titulo: "Órdenes que no se cuentan",
        filas: d.reemplazadas.map((r) => ({
          id: r.orden, titulo: `${r.orden} · ${nombreLindo(r.cliente)}`, sub: `${r.obra} · se factura en ${r.por}${r.ultimaFactura ? ` · última factura propia ${fcorta(r.ultimaFactura)}` : ""}`,
          atenuada: true, odoo: { modelo: "sale.order", id: r.id },
        })),
        nota: notaReemplazadas(d.reemplazadas),
      });
    }
    return {
      titulo: "Contratos en la calle",
      cifra: cant(d.contratos.length),
      sub: "foto de hoy · abono mensual sin IVA",
      avisos: d.armadoDevuelto.total ? [{ texto: `${d.armadoDevuelto.total} órdenes "Armado" figuran devueltas en Alquiler: no se cuentan.`, tono: "gris" }] : undefined,
      secciones,
    };
  },
});

const abonoVigente = definirNodo({
  tipo: "abono_vigente",
  pantalla: "calle",
  async resolver(_ref, ctx) {
    const d = await detalle(ctx);
    const a = d.abono;
    const ratios = Object.entries(a.ratios).map(([t, v]) => `${t} ${nf(v!, 2)}`).join(" · ");
    const filas: FilaDesglose[] = [
      { id: "ren", titulo: NOMBRE_FUENTE.ultima_renovacion, sub: `${a.renov} contratos`, valor: ars(a.renovArs), valorSub: "por mes", hijo: { tipo: "contratosCalle", fuente: "ultima_renovacion" } },
      { id: "cuota", titulo: NOMBRE_FUENTE.cuota_facturada, sub: `${a.cuotas} contratos · mediana de lo facturado por mes en los últimos 4 meses`, valor: ars(a.cuotaArs), valorSub: "por mes", hijo: { tipo: "contratosCalle", fuente: "cuota_facturada" } },
      { id: "est", titulo: NOMBRE_FUENTE.estimado_sin_renovacion, sub: `${a.estimados} contratos · alquiler inicial × renovación / inicial de su tipo${ratios ? ` (${ratios})` : ""}`, valor: ars(a.estimadoArs), valorSub: "por mes", hijo: { tipo: "contratosCalle", fuente: "estimado_sin_renovacion" } },
    ];
    if (a.sinDato) filas.push({ id: "sd", titulo: NOMBRE_FUENTE.sin_dato, sub: `${a.sinDato} contratos sin renovaciones, cuotas ni alquiler inicial: no suman`, valor: sinDato("No hay de dónde sacar el abono"), hijo: { tipo: "contratosCalle", fuente: "sin_dato" } });
    return {
      titulo: "Abono mensual en la calle",
      cifra: ars(a.totalArs, "Ningún contrato tiene abono calculable"),
      sub: `${d.contratos.length} contratos · sin IVA · foto de hoy`,
      secciones: [
        { titulo: "De dónde sale", filas, cierre: a.totalArs != null ? { suma: { ars: a.renovArs + a.cuotaArs + a.estimadoArs }, cifra: { ars: a.totalArs }, texto: "el abono en la calle" } : undefined },
        seccionPorTipo(d),
      ],
    };
  },
});

const m2 = definirNodo({
  tipo: "m2",
  pantalla: "calle",
  async resolver(_ref, ctx) {
    const d = await detalle(ctx);
    const sinMedidas = d.contratos.filter((f) => d.m2.sinMedidas.includes(f.orden));
    return {
      titulo: "m² armados",
      cifra: d.m2.m2 > 0 ? cant(d.m2.m2, "m²") : sinDato("Ningún contrato en la calle tiene m² cargados"),
      sub: `${nf(d.m2.ml)} m lineales de pantalla · m² y metros del permiso`,
      secciones: [
        {
          titulo: "Por tipo",
          filas: d.porTipo.filter((t) => t.contratos > 0).map((t) => ({ id: t.tipo, titulo: t.tipo, sub: `${t.contratos} contratos · ${nf(t.ml)} m lineales`, valor: cant(Math.round(t.m2), "m²"), hijo: { tipo: "contratosCalle", t: t.tipo } })),
        },
        ...(sinMedidas.length ? [{ titulo: "Contratos de Obra sin m² ni metros cargados", filas: sinMedidas.map((f) => filaContrato(f, { sub: f.obra, valor: "contrato" })), nota: "El total queda subestimado." }] : []),
      ],
    };
  },
});

const devVencida = definirNodo({
  tipo: "dev_vencida",
  pantalla: "calle",
  async resolver(ref, ctx) {
    const d = await detalle(ctx);
    const soloSin = ref.f === "sin";
    const filas = soloSin ? d.devolucion.filas.filter((f) => !f.sigueFacturando) : d.devolucion.filas;
    const cifraAbono = soloSin ? d.devolucion.abonoSinFacturarArs : d.devolucion.abonoArs;
    const { filas: pag, pagina } = paginar(filas, ctx.pagina);
    return {
      titulo: soloSin ? "Devolución vencida sin facturar +40 días" : "Devolución vencida",
      cifra: cant(filas.length, "contratos"),
      sub: `abono por mes sin IVA · foto de hoy · ${d.devolucion.sinFacturar} sin facturar hace más de 40 días`,
      agrupar: { param: "f", activo: soloSin ? "sin" : "todos", opciones: [{ valor: "todos", etiqueta: "Todos" }, { valor: "sin", etiqueta: "Sin facturar +40 d" }] },
      avisos: [{ texto: "La fecha pactada no se corre al renovar: muchos vencidos de 0–30 días se renovaron. \"Sin facturar\" separa el problema real.", tono: "aten" }],
      secciones: [{
        filas: pag.map((f) => filaContrato(f, { sub: `${f.obra} · devolución ${fcorta(f.devolucion)} · ${f.diasVencido} d vencido${via(f)} · ${f.accion}`, valor: "abono" })),
        cierre: cierreAbono(filas, cifraAbono, "el abono de la tarjeta"),
        nota: notaReemplazadas(d.reemplazadas),
      }],
      pagina,
      csv: true,
    };
  },
});

const finVencido = definirNodo({
  tipo: "fin_vencido",
  pantalla: "calle",
  async resolver(_ref, ctx) {
    const d = await detalle(ctx);
    const { filas, pagina } = paginar(d.finObra.filas, ctx.pagina);
    return {
      titulo: "Fin de obra estimado vencido",
      cifra: cant(d.finObra.obras, "obras"),
      sub: `estado de obra Armado · ${d.finObra.activasEnAlquiler} siguen en la calle según Alquiler · foto de hoy`,
      avisos: d.finObra.sinFecha ? [{ texto: `${d.finObra.sinFecha} obras armadas no tienen fin estimado cargado: la lista es parcial.`, tono: "gris" }] : undefined,
      secciones: [{
        filas: filas.map((f) => ({
          ...filaContrato(f, { sub: `${f.obra} · fin ${fcorta(f.finObra)} · ${f.diasVencido} d vencido${f.enLaCalle ? "" : " · Alquiler la da por devuelta"}`, valor: "contrato" }),
          atenuada: !f.enLaCalle,
        })),
        cierre: { nota: "Hay que llamar: ¿renueva o se desarma?" },
      }],
      pagina,
      csv: true,
    };
  },
});

const sinRenovacion = definirNodo({
  tipo: "sin_renovacion",
  pantalla: "calle",
  async resolver(_ref, ctx) {
    const d = await detalle(ctx);
    const s = d.sinRenovacion;
    const { filas, pagina } = paginar(s.filas, ctx.pagina);
    return {
      titulo: "Sin renovación en 35 días",
      cifra: cant(s.filas.length, "contratos"),
      sub: `armados hace más de 35 días, sin renovación cargada ni factura en 35 días · renovaron ${s.renovaron} de ${s.debian}`,
      avisos: [{ texto: "35 días es una tolerancia: algunos pueden estar facturados a otra orden o al cliente sin vincular. Verificar antes de reclamar.", tono: "aten" }],
      secciones: [{
        filas: filas.map((f) => filaContrato(f, { sub: `${f.obra} · última factura ${f.ultimaFactura ? fcorta(f.ultimaFactura) : "ninguna"} · ${f.accion}`, valor: "abono" })),
        cierre: cierreAbono(s.filas, s.abonoArs, "el abono sin renovar"),
        nota: notaReemplazadas(d.reemplazadas),
      }],
      pagina,
      csv: true,
    };
  },
});

const TIPO_OT: Record<string, string> = { armado: "Armado", desarme: "Desarme", ampliacion: "Ampliación", desmonte_parcial: "Desmonte parcial", mantenimiento: "Mantenimiento", otro: "Otro" };
export const nombreTipoOt = (t: string): string => TIPO_OT[t] ?? t;

function filaOt(o: FilaOt): FilaDesglose {
  return {
    id: String(o.id),
    titulo: `${nombreTipoOt(o.tipo)} · ${o.orden ?? "sin orden"}${o.cliente ? ` · ${nombreLindo(o.cliente)}` : ""}`,
    sub: `${o.obra || "sin dirección"} · programada ${flarga(o.fecha)}`,
    valor: o.diasVencida != null ? { tipo: "dias", n: o.diasVencida } : undefined,
    valorSub: o.cuadrilla ?? "sin cuadrilla",
    odoo: { modelo: "x_aba_orden_trabajo", id: o.id },
  };
}

const otVencidas = definirNodo({
  tipo: "ot_vencidas",
  pantalla: "calle",
  async resolver(_ref, ctx) {
    const d = await detalle(ctx);
    if (!d.ot) return { titulo: "Órdenes de trabajo vencidas", cifra: sinDato("No se pudieron leer las órdenes de trabajo"), secciones: [] };
    const { filas, pagina } = paginar(d.ot.vencidas, ctx.pagina);
    return {
      titulo: "Órdenes de trabajo vencidas",
      cifra: cant(d.ot.vencidas.length),
      sub: `pendientes o en proceso con fecha programada pasada · ${d.ot.sinFecha} sin fecha`,
      secciones: [{ filas: filas.map(filaOt), cierre: { nota: "Dirección no mueve órdenes: se reprograman en Planificación." } }],
      pagina,
      csv: true,
    };
  },
});

// ─── Nivel 2 ────────────────────────────────────────────────────────────────────────────

const contratosCalle = definirNodo({
  tipo: "contratosCalle",
  pantalla: "calle",
  async resolver(ref, ctx) {
    const d = await detalle(ctx);
    let lista = d.contratos;
    let titulo = "Contratos en la calle";
    if (ref.t) { lista = lista.filter((f) => f.tipo === ref.t); titulo = `Contratos en la calle · ${ref.t}`; }
    if (ref.c) { lista = lista.filter((f) => f.cliente === ref.c); titulo = nombreLindo(ref.c); }
    if (ref.fuente) { lista = lista.filter((f) => f.abonoFuente === ref.fuente); titulo = NOMBRE_FUENTE[ref.fuente as FuenteAbono] ?? titulo; }
    const total = sumaAbono(lista);
    const { filas, pagina } = paginar(lista, ctx.pagina);
    return {
      titulo,
      cifra: lista.some((f) => f.abonoArs != null) ? ars(total) : cant(lista.length, "contratos"),
      sub: `${lista.length} contratos · abono por mes sin IVA · foto de hoy`,
      secciones: [{
        filas: filas.map((f) => filaContrato(f, { sub: `${f.obra} · ${f.estadoObra} · ${NOMBRE_FUENTE[f.abonoFuente ?? "sin_dato"].toLowerCase()}${via(f)}`, valor: "abono" })),
        cierre: { suma: { ars: total }, cifra: { ars: total }, texto: "la suma de la lista" },
      }],
      pagina,
      csv: true,
    };
  },
});

type LineaFactura = { id: number; date: string; balance: number; move_id: [number, string] | false; move_type: string };

const contratoCalle = definirNodo({
  tipo: "contratoCalle",
  pantalla: "calle",
  async resolver(ref, ctx) {
    const d = await detalle(ctx);
    const f = [...d.contratos, ...d.finObra.filas].find((x) => x.orden === ref.v);
    if (!f) {
      // No está en la calle ni en fin vencido (p. ej. una orden reemplazada): ficha mínima desde Odoo.
      const [o] = await searchRead<{ id: number; name: string; amount_untaxed: number }>("sale.order", [["name", "=", ref.v ?? ""], ["is_rental_order", "=", true]], ["name", "amount_untaxed"], { limit: 1 });
      if (!o) return { titulo: ref.v ?? "Contrato", cifra: sinDato("No se encontró el contrato en Odoo"), secciones: [] };
      return { titulo: o.name, cifra: ars(o.amount_untaxed), sub: "contrato sin IVA · no se cuenta en la calle", secciones: [{ filas: [{ id: "odoo", titulo: "Abrir el contrato en Odoo", odoo: { modelo: "sale.order", id: o.id } }] }] };
    }
    const kv = (id: string, titulo: string, valor: Valor | string, sub?: string): FilaDesglose => ({ id, titulo, sub, valor: typeof valor === "string" ? { tipo: "texto", texto: valor } : valor });
    const datos: FilaDesglose[] = [
      kv("estado", "Estado de obra", f.estadoObra, f.enLaCalle ? undefined : "Alquiler la da por devuelta"),
      kv("dev", "Devolución pactada", f.devolucion ? flarga(f.devolucion) : "Sin dato"),
      kv("fin", "Fin de obra estimado", f.finObra ? flarga(f.finObra) : "sin cargar"),
      kv("contrato", "Contrato (sin IVA)", ars(f.contratoArs)),
      kv("facturado", "Facturado (sin IVA)", ars(f.facturadoArs, "Odoo no tiene el facturado de la orden")),
      kv("abono", "Abono mensual", ars(f.abonoArs, "Sin renovaciones, cuotas ni alquiler inicial"), f.abonoFuente ? `${NOMBRE_FUENTE[f.abonoFuente]}${f.ultimaRenovacion ? ` · ${flarga(f.ultimaRenovacion)}` : ""}${f.renovaciones ? ` · ${f.renovaciones} renovaciones` : ""}` : undefined),
      kv("ult", "Última factura", f.ultimaFactura ? `${flarga(f.ultimaFactura)} · hace ${f.diasSinFacturar} días` : "Ninguna", f.facturadoVia ? `se factura vía ${f.facturadoVia}` : undefined),
      kv("vend", "Vendedora", f.vendedor ?? "—"),
      kv("tec", "Técnico", f.tecnico ?? "—"),
      kv("accion", "Acción sugerida", f.accion),
      { id: "odoo", titulo: "Abrir el contrato en Odoo", odoo: { modelo: "sale.order", id: f.id } },
    ];
    // Facturas y NC de la orden, en vivo (las propias; "vía" otra orden se ve en esa orden).
    const lineas = await searchReadTodo<LineaFactura>("account.move.line", [
      ["sale_line_ids.order_id", "=", f.id], ["parent_state", "=", "posted"], ["display_type", "=", "product"], ["move_id.move_type", "in", ["out_invoice", "out_refund"]],
    ], ["date", "balance", "move_id", "move_type"]);
    const porMov = new Map<number, { nombre: string; fecha: string; ars: number; nc: boolean }>();
    for (const l of lineas) {
      if (!Array.isArray(l.move_id)) continue;
      const m = porMov.get(l.move_id[0]) ?? { nombre: l.move_id[1], fecha: l.date, ars: 0, nc: l.move_type === "out_refund" };
      m.ars += -l.balance;
      porMov.set(l.move_id[0], m);
    }
    const facturas = [...porMov.entries()].sort((a, b) => b[1].fecha.localeCompare(a[1].fecha));
    const totalFact = facturas.reduce((a, [, m]) => a + m.ars, 0);
    const ots = d.ot ? [...d.ot.vencidas, ...d.ot.esta, ...d.ot.prox].filter((o, i, arr) => o.orden === f.orden && arr.findIndex((x) => x.id === o.id) === i) : [];
    return {
      titulo: `${f.orden} · ${nombreLindo(f.cliente)}`,
      cifra: f.abonoArs != null ? ars(f.abonoArs) : ars(f.contratoArs),
      sub: `${f.obra} · ${f.tipo} · ${f.abonoArs != null ? "abono por mes sin IVA" : "contrato sin IVA"}`,
      secciones: [
        { filas: datos },
        ...(ots.length ? [{ titulo: "Órdenes de trabajo activas", filas: ots.map(filaOt) }] : []),
        {
          titulo: "Facturas y notas de crédito (sin IVA)",
          filas: facturas.map(([id, m]) => ({ id: String(id), titulo: m.nombre.split(" (")[0], sub: `${flarga(m.fecha)}${m.nc ? " · nota de crédito" : ""}`, valor: ars(m.ars), odoo: { modelo: "account.move", id } })),
          cierre: facturas.length
            ? { suma: { ars: totalFact }, cifra: { ars: totalFact }, texto: "lo facturado por renglones de la orden", explica: f.facturadoArs != null && Math.abs(f.facturadoArs - totalFact) > 1 ? `En la orden, Odoo dice ${nf(f.facturadoArs)}: la diferencia son anticipos o renglones sin vincular.` : undefined }
            : { nota: "La orden no tiene facturas propias." },
        },
      ],
      csv: true,
    };
  },
});

export const nodos: DefNodo[] = [enLaCalle, abonoVigente, m2, devVencida, finVencido, sinRenovacion, otVencidas, contratosCalle, contratoCalle];
