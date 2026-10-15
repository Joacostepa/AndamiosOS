// Diccionario de indicadores (diseno.md §9.1): UNA fuente para los popovers "¿De dónde sale
// este número?", la pantalla Datos y definiciones, la narrativa y el recorte de lo reservado.
// Un nombre = una fórmula.
//
// Portado del DICC de la maqueta aprobada (docs/direccion/maqueta.html). Diferencia: la
// maqueta tenía cifras del snapshot del 15/10 metidas en algunos textos ("ARS 49,2 M",
// "87 obras", el HHI). Acá los textos son FIJOS y sin datos: las cifras y el motivo de
// confianza de hoy los pone el calculador (Cifra.confianza), en vivo. `conf`/`motivo` son
// sólo el valor por defecto cuando el calculador no dice nada.
//
// Sin imports de Next/React: lo usan servidor, cliente y tests.

import type { Confianza, PantallaId, Polaridad } from "./tipos.ts";

export type DefIndicador = {
  id: string;
  nombre: string;
  pregunta: string;
  pantalla: PantallaId;
  /** Qué es, en castellano. */
  para: string;
  /** Cómo se calcula. */
  calc: string;
  /** Fuente en Odoo (modelo y filtro): va detrás de "Detalle técnico". */
  fuente: string;
  /** La regla en texto ("período · sin IVA"). */
  regla: string;
  /** "↑ bien", "↓ bien" o "—". */
  pol: string;
  conf: Confianza;
  motivo: string;
  ojo: string;
  usos: string[];
  /** Sólo socios (direccion-socios). */
  reservado?: boolean;
};

export const DICC: readonly DefIndicador[] = [
  { id: "caja_disponible", nombre: "Caja disponible", pregunta: "¿Cuánta plata hay?", pantalla: "caja",
    para: "La plata que hay hoy y se puede usar: bancos, efectivo en pesos y en dólares, y el fondo FIMA.",
    calc: "Saldo a hoy de las cuentas de caja confiables. Las cuentas en dólares se toman en dólares (amount_currency) y se pasan a pesos con el dólar de hoy: el saldo contable está sin revaluar.",
    fuente: "account.move.line · read_group · account_type = asset_cash · parent_state = posted · date <= hoy · cuentas 1.1.1.02.01, 1.1.1.02.04, 1.1.1.01.004, 1.1.1.01.002, 1.1.2.01.05",
    regla: "saldo · dólar de hoy", pol: "↑ bien", conf: "ver", motivo: "Caja en dólares sin arqueo registrado",
    ojo: "No entran las cuentas quietas a verificar (como Borelli), Valores a depositar, la tarjeta corporativa ni \"Facturas ARCA a regularizar\", aunque Odoo las tipifica como caja.",
    usos: ["La semana", "Caja", "Narrativa"] },
  { id: "cheques_cartera", nombre: "Cheques en cartera", pregunta: "¿Cuánto hay en cheques de clientes?", pantalla: "caja",
    para: "Cheques de clientes que tenemos para depositar, separados por fecha de cobro.",
    calc: "Registro de cheques de terceros del diario Cheques de Terceros, contra la cuenta contable Valores a depositar.",
    fuente: "l10n_latam.check · current_journal_id = 21  vs  account.account 1.1.1.01.06", regla: "saldo · con IVA", pol: "↑ bien", conf: "ver",
    motivo: "El registro y la contabilidad no coinciden",
    ojo: "Ningún cheque tiene operaciones registradas: depósitos y rechazos se cargan con asientos manuales, así que el registro no baja. Hasta regularizar, ninguno de los dos números es confiable.",
    usos: ["Caja"] },
  { id: "por_pagar", nombre: "Por pagar a proveedores", pregunta: "¿Cuánto debemos?", pantalla: "caja",
    para: "Lo que debemos a proveedores por facturas cargadas.", calc: "Saldo con IVA de facturas y NC de proveedor publicadas.",
    fuente: "account.move · move_type in (in_invoice, in_refund) · state = posted · amount_residual != 0 · −amount_residual_signed", regla: "saldo · con IVA · dólar de hoy", pol: "↓ bien", conf: "ok",
    motivo: "", ojo: "Casi ninguna factura tiene plazo: casi todo figura vencido. No incluye sueldos, impuestos ni los cheques propios ya entregados.",
    usos: ["Caja"] },
  { id: "cheques_propios", nombre: "Cheques propios a debitar", pregunta: "¿Qué ya pagamos con cheque y todavía no salió?", pantalla: "caja",
    para: "Cheques que ya dimos a proveedores y se van a debitar del Galicia en la fecha del cheque.", calc: "Cheques propios entregados, agrupados por fecha de pago.",
    fuente: "l10n_latam.check · payment_method_code = own_checks · issue_state = handed", regla: "saldo", pol: "↓ bien", conf: "ok", motivo: "",
    ojo: "La factura ya figura pagada en Odoo, pero la plata todavía no salió: no está en \"por pagar\" y sí en el flujo.",
    usos: ["Caja", "Para decidir"] },
  { id: "cobertura", nombre: "Cobertura", pregunta: "¿Llegamos?", pantalla: "caja",
    para: "Cuántas semanas la plata en pesos se mantiene sobre el mínimo, según el flujo de las próximas 8 semanas.",
    calc: "Semanas móviles de 7 días desde hoy. Saldo inicial = caja disponible. Proyectado = cheques a fecha + cobranza promedio de las últimas 12 semanas − proveedores, sueldos, cargas, impuestos, gastos y retiros promedio. Comprometido = sólo lo que ya está en Odoo con fecha.",
    fuente: "account.move.line, l10n_latam.check, account.move (flujo de 8 semanas)", regla: "semanas", pol: "↑ bien", conf: "inc",
    motivo: "Usa el registro de cheques y facturas sin plazo",
    ojo: "Es una proyección de ritmo, no un presupuesto. No incluye cheques que todavía no recibimos. Se mide sobre los pesos: el dólar billete es reserva.",
    usos: ["La semana", "Caja", "Narrativa"] },
  { id: "facturado_neto", nombre: "Facturado neto", pregunta: "¿Facturamos?", pantalla: "ventas",
    para: "Lo que le facturamos a los clientes, sin IVA y descontadas las notas de crédito. Es la venta.",
    calc: "Facturas menos notas de crédito publicadas, por fecha de factura. En USD, cada comprobante al dólar de su fecha.",
    fuente: "account.move · move_type in (out_invoice, out_refund) · state = posted · amount_untaxed_signed · invoice_date", regla: "período · sin IVA", pol: "↑ bien", conf: "ok", motivo: "",
    ojo: "El mes en curso se compara a igual día. No hay año anterior hasta noviembre 2026. Incluye los tres circuitos de facturación (gestión total).",
    usos: ["La semana", "Ventas", "Narrativa"] },
  { id: "pct_nc", nombre: "Notas de crédito", pregunta: "¿Cuánto se anuló?", pantalla: "ventas",
    para: "Qué parte de lo facturado se anuló con nota de crédito. Si se anuló para corregir y refacturar, no se perdió plata.",
    calc: "NC del período ÷ facturas del período, sin IVA. \"Reales\" = las que no se refacturaron (mismo cliente, ±15 % del monto, dentro de 10 días).",
    fuente: "account.move · out_refund vs out_invoice · posted", regla: "período · sin IVA", pol: "↓ bien", conf: "ok", motivo: "",
    ojo: "El emparejamiento de refacturación es heurístico: se muestra como \"probable\".", usos: ["La semana", "Ventas"] },
  { id: "abono_vigente", nombre: "Abono mensual en la calle", pregunta: "¿Cuánto factura por mes lo que está armado?", pantalla: "calle",
    para: "Cuánto factura por mes la flota que está en obra si todos renuevan. Es la base previsible de ingresos.",
    calc: "Por contrato en la calle: última renovación cargada; si no hay, la cuota que se viene facturando; si es nuevo, el alquiler inicial × la relación renovación / inicial de su tipo.",
    fuente: "sale.order.line (productos RENOVACIÓN) + account.move.line por orden", regla: "sin IVA · foto de hoy", pol: "↑ bien", conf: "ok", motivo: "",
    ojo: "Una parte del total es estimada: los contratos que todavía no renovaron se calculan con la relación renovación / inicial de su tipo.",
    usos: ["Ventas", "En la calle"] },
  { id: "nueva_vs_renov", nombre: "Nuevo vs renovación", pregunta: "¿Crece lo que importa?", pantalla: "ventas",
    para: "Cuánto viene de obras nuevas y cuánto de obras que siguen armadas y renuevan todos los meses.",
    calc: "Renglones de factura clasificados: renovación (producto RENOVACIÓN), alquiler sin montaje, servicios, anticipos y saldos, y el resto es alquiler nuevo con montaje.",
    fuente: "account.move.line · display_type = product · −balance", regla: "período · sin IVA", pol: "—", conf: "inc", motivo: "Los anticipos no se pueden separar entre nuevo y renovación",
    ojo: "Los productos no tienen categoría en Odoo: la clasificación es por nombre.", usos: ["Ventas"] },
  { id: "vendido_ordenes", nombre: "Vendido (órdenes)", pregunta: "¿Por qué Odoo dice otra cosa?", pantalla: "ventas",
    para: "Lo que hoy muestra el tablero Comercial de Odoo. No es venta: incluye contratos cancelados y reconfirmados.",
    calc: "Órdenes confirmadas con date_order en el período, con IVA.", fuente: "sale.order · state = sale · date_order · amount_total", regla: "período · con IVA", pol: "—", conf: "ver",
    motivo: "Inflado por reconfirmaciones", ojo: "Al cancelar y reconfirmar una orden, Odoo reescribe date_order y la vuelve a contar entera.", usos: ["Ventas"] },
  { id: "resultado", nombre: "Resultado de gestión", pregunta: "¿Ganamos?", pantalla: "ventas",
    para: "Cuánto facturamos menos lo que gastamos en el mes, sin IVA.",
    calc: "Ingresos − costo directo (personal operativo, insumos, subalquiler) − estructura + financieros. Se excluyen cuadres y retiros cargados como gasto.",
    fuente: "account.move.line · read_group · income/expense por cuenta y mes · −balance", regla: "período · sin IVA", pol: "↑ bien", conf: "inc",
    motivo: "Sin amortización de andamios",
    ojo: "Los andamios todavía no se amortizan: como referencia se muestra la amortización a 10 años de vida útil. El mes en curso no tiene sueldos devengados. Un mes cerrado sin Ingresos Brutos devengados queda sobreestimado. La cuenta de cuadre 888888 podría tener gastos reales.",
    usos: ["La semana", "Ventas", "Socios"] },
  { id: "por_cobrar", nombre: "Por cobrar", pregunta: "¿Quién nos debe?", pantalla: "cobranzas",
    para: "Lo que nos deben hoy los clientes, con IVA: lo que va a entrar a la caja.",
    calc: "Partidas abiertas de Deudores locales: facturas + cheques rechazados + débitos manuales − cobros sin imputar.",
    fuente: "account.move.line · account_id = 287 (1.1.3.01.010) · parent_state = posted · reconciled = False · amount_residual", regla: "saldo · con IVA · dólar de hoy", pol: "↓ bien", conf: "inc",
    motivo: "Cobros sin imputar y rechazos por asiento manual",
    ojo: "Difiere del \"saldo de facturas\" de Odoo por los rechazos y los cobros sin imputar. El saldo real es el contable.", usos: ["Cobranzas"] },
  { id: "vencido_30", nombre: "Por cobrar vencido +30 días", pregunta: "¿Quién nos debe hace rato?", pantalla: "cobranzas",
    para: "Lo que nos deben en partidas vencidas hace más de 30 días. Con IVA, porque el cliente paga con IVA.",
    calc: "Aging neto: vencimiento = plazo cargado o, si no hay, emisión + 30 días. Los cobros sin imputar de cada cliente se aplican a sus partidas más viejas.",
    fuente: "account.move.line · account_id = 287 · reconciled = False · vencimiento efectivo < hoy − 30", regla: "saldo · con IVA · dólar de hoy", pol: "↓ bien", conf: "inc",
    motivo: "Muchas facturas sin plazo de pago",
    ojo: "Sin el criterio de emisión + 30, como lo ve hoy Odoo, las facturas sin plazo \"nacen vencidas\" y el tramo 1–30 se infla.", usos: ["La semana", "Cobranzas", "Narrativa"] },
  { id: "dso", nombre: "Días que tardan en pagar (DSO)", pregunta: "¿Cuántos días tardan en pagar?", pantalla: "cobranzas",
    para: "Cuántos días de facturación están pendientes de cobro. Si sube, se cobra más lento.",
    calc: "Saldo por cobrar ÷ facturado con IVA de los últimos 90 días × 90.", fuente: "account.move.line (cuenta 287) / account.move amount_total_signed", regla: "días", pol: "↓ bien", conf: "ok", motivo: "",
    ojo: "El promedio esconde a los clientes que pagan muy tarde (como el Estado). Mirarlo siempre junto a la concentración.", usos: ["Cobranzas"] },
  { id: "concentracion", nombre: "Concentración", pregunta: "¿Dependemos de uno?", pantalla: "cobranzas",
    para: "Qué parte de lo que nos deben es de un solo cliente.",
    calc: "Mayor deudor ÷ por cobrar. Índice de concentración (HHI) = Σ participaciones²: desde 2.500 se considera muy concentrado.",
    fuente: "read_group de la cuenta 287 por partner_id", regla: "%", pol: "↓ bien", conf: "ok", motivo: "", ojo: "", usos: ["La semana", "Cobranzas", "Narrativa"] },
  { id: "rechazados", nombre: "Cheques rechazados", pregunta: "¿Qué rebotó y no se recuperó?", pantalla: "cobranzas",
    para: "Cheques que los clientes dieron, rebotaron y todavía no se recuperaron.",
    calc: "Asientos de rechazo abiertos en Deudores locales (por texto del asiento). \"En riesgo\" = los que no tienen cobros posteriores del mismo cliente que los compensen.",
    fuente: "account.move.line · cuenta 287 · move_type = entry · amount_residual > 0 · name ~ rechaz", regla: "saldo", pol: "↓ bien", conf: "inc", motivo: "Cargados a mano, se detectan por texto",
    ojo: "Algunos rechazos están compensados con cobros posteriores sin imputar del mismo cliente: no son riesgo real.", usos: ["Cobranzas", "Para decidir"] },
  { id: "sin_imputar", nombre: "Cobros sin imputar", pregunta: "¿Quién ya pagó y figura como deudor?", pantalla: "cobranzas",
    para: "Pagos que ya entraron pero no se aplicaron a su factura: el cliente figura como deudor y no lo es.",
    calc: "Partidas acreedoras abiertas en Deudores locales que no son facturas. Se separan las que van contra facturas abiertas de las que compensan cheques rechazados o débitos.",
    fuente: "account.move.line · cuenta 287 · amount_residual < 0 · no factura", regla: "saldo", pol: "↓ bien", conf: "ok", motivo: "", ojo: "Es el error más caro de la cobranza: llamar a quien ya pagó.", usos: ["Cobranzas"] },
  { id: "cobrado", nombre: "Cobrado", pregunta: "¿Cuánta plata entró de clientes?", pantalla: "cobranzas",
    para: "Cuánta plata entró de clientes en el período (dinero + retenciones).", calc: "Créditos a Deudores locales que no son facturas ni NC, prorrateados por la cuenta de contrapartida.",
    fuente: "account.move.line · cuenta 287 · balance < 0 · contrapartidas 1.1.1.* y 1.1.4.*", regla: "período · con IVA", pol: "↑ bien", conf: "ok", motivo: "", ojo: "Un cheque cuenta como cobrado cuando se recibe, no cuando se acredita.", usos: ["Cobranzas"] },
  { id: "dev_vencida", nombre: "Devolución vencida", pregunta: "¿Qué está afuera y vencido?", pantalla: "calle",
    para: "Contratos cuyo plazo pactado terminó y el material sigue en obra.", calc: "Contratos en la calle con fecha de devolución pactada anterior a hoy. \"Sin facturar\" = sin factura en los últimos 40 días.",
    fuente: "sale.order · is_rental_order · state = sale · rental_status / x_studio_estado_de_obra · rental_return_date < hoy", regla: "foto · sin IVA", pol: "↓ bien", conf: "ver",
    motivo: "La fecha pactada no se corre al renovar",
    ojo: "Muchos vencidos de 0–30 días son contratos que se renovaron sin correr la fecha: la columna \"sin facturar 40 d\" separa el problema real.", usos: ["La semana", "En la calle", "Narrativa"] },
  { id: "fin_vencido", nombre: "Fin de obra estimado vencido", pregunta: "¿Qué obras ya deberían haber terminado?", pantalla: "calle",
    para: "Obras que, según el cliente, ya deberían haber terminado y siguen armadas. Hay que llamar: ¿renueva o se desarma?",
    calc: "Órdenes en estado de obra Armado con fin de obra estimado anterior a hoy.", fuente: "sale.order · x_studio_estado_de_obra = Armado · x_fecha_fin_obra_estimada < hoy", regla: "foto", pol: "↓ bien", conf: "inc",
    motivo: "Obras armadas sin fin estimado cargado", ojo: "", usos: ["La semana", "En la calle"] },
  { id: "en_la_calle", nombre: "Contratos en la calle", pregunta: "¿Qué material está afuera?", pantalla: "calle",
    para: "Cuántos contratos tienen material armado o entregado hoy.", calc: "Alquileres retirados que no están desarmados, más los armados a los que no se les registró el retiro.",
    fuente: "sale.order · rental_status in (return, pickup) × x_studio_estado_de_obra", regla: "foto", pol: "—", conf: "inc", motivo: "Órdenes \"Armado\" que figuran devueltas",
    ojo: "No usar el estado de obra solo: infla con órdenes ya devueltas. Una obra con órdenes reemplazadas cuenta una vez (se agrupa por obra).", usos: ["En la calle"] },
  { id: "m2", nombre: "m² armados", pregunta: "¿Cuánta superficie hay armada?", pantalla: "calle",
    para: "Superficie de permiso de los contratos en la calle.", calc: "Suma de m² y metros lineales de permiso de los contratos en la calle.", fuente: "sale.order · x_permiso_m2 · x_permiso_metros_lineales", regla: "foto", pol: "—", conf: "inc",
    motivo: "Contratos de Obra sin m² cargados", ojo: "El total queda subestimado.", usos: ["En la calle"] },
  { id: "ot_vencidas", nombre: "Órdenes de trabajo vencidas", pregunta: "¿Qué trabajo quedó atrasado?", pantalla: "calle",
    para: "Órdenes de trabajo pendientes o en proceso con fecha programada pasada.", calc: "Órdenes de trabajo activas con fecha programada anterior a hoy.",
    fuente: "x_aba_orden_trabajo (la misma fuente que Planificación) · x_estado in (pendiente, en_proceso) · x_fecha_programada < hoy", regla: "foto", pol: "↓ bien", conf: "ok", motivo: "", ojo: "", usos: ["En la calle", "Narrativa"] },
  { id: "dias_cierre", nombre: "Días de aprobación (Obra)", pregunta: "¿Cuánto tarda el cliente en aprobar?", pantalla: "ventas",
    para: "Días entre que mandamos el presupuesto y el cliente lo aprueba, en contratos de Obra.", calc: "Primera confirmación (tracking del estado) − creación de la cotización. Mediana.",
    fuente: "mail.tracking.value (campo state de sale.order) · sale.order.create_date", regla: "días", pol: "↓ bien", conf: "ok", motivo: "", ojo: "No usar date_order: se reescribe al reconfirmar.", usos: ["Ventas"] },
  { id: "cotizado_vivo", nombre: "Cotizado vivo", pregunta: "¿Cuánto podemos ganar?", pantalla: "ventas",
    para: "Presupuestos esperando respuesta que todavía se pueden ganar.",
    calc: "Cotizaciones en borrador de los últimos 90 días, sin oportunidad perdida ni ganada, sin contratos en edición ni duplicados. Esperado = vivo × conversión histórica en monto.",
    fuente: "sale.order · state = draft · amount_untaxed", regla: "sin IVA · dólar de hoy", pol: "↑ bien", conf: "ver", motivo: "Muchas son cotizaciones sin cerrar",
    ojo: "No sumarlo a lo facturado ni llamarlo pipeline sin el esperado al lado.", usos: ["Ventas"] },
  // Reservado: este archivo también lo baja el navegador, así que acá va sólo lo mínimo. La
  // definición completa (cuentas, método) está en diccionario-socios.ts, que lee sólo el
  // servidor y la manda únicamente a quien tiene direccion-socios (layout → DireccionProvider).
  { id: "retiros", nombre: "Retiros de socios", pregunta: "¿Cuánto retiramos?", pantalla: "socios", reservado: true,
    para: "Reservado a socios.", calc: "Reservado a socios.", fuente: "—", regla: "USD", pol: "—", conf: "inc",
    motivo: "", ojo: "", usos: ["La semana", "Socios"] },
];

export const DEF: Readonly<Record<string, DefIndicador>> = Object.fromEntries(DICC.map((d) => [d.id, d]));

/** Las metas que puede ver quien mira: sin las de indicadores reservados si no es socio. */
export function metasVisibles<T>(metas: Readonly<Record<string, T>>, conSocios: boolean): Record<string, T> {
  return conSocios ? { ...metas } : Object.fromEntries(Object.entries(metas).filter(([k]) => !DEF[k]?.reservado));
}

/** La polaridad del indicador para los chips ("↑ bien" → "↑"). */
export function polaridadDe(kpi: string): Polaridad {
  const p = DEF[kpi]?.pol ?? "—";
  return p.startsWith("↑") ? "↑" : p.startsWith("↓") ? "↓" : null;
}

/** ¿El valor cumple la meta? null si no hay meta o no tiene polaridad (sin semáforo inventado). */
export function cumpleMeta(kpi: string, valor: number | null | undefined, meta: number | null | undefined): boolean | null {
  const pol = polaridadDe(kpi);
  if (meta == null || valor == null || !Number.isFinite(valor) || !pol) return null;
  return pol === "↓" ? valor <= meta : valor >= meta;
}
