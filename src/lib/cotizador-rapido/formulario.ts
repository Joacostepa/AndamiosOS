// El cotizador rápido: la pantalla con campos y botones sobre el MISMO borrador del asistente.
//
// docs/asistente-comercial/cotizador-rapido.md. El vendedor elige el tipo, carga valores y toca
// botones; el motor (src/lib/cotizador) hace las cuentas como siempre y el borrador es el de la
// conversación, así que el chat ve y cambia lo mismo que la pantalla.
//
// DOS FUNCIONES PURAS, IDA Y VUELTA:
//   · formularioDesdeBorrador: lo que muestra la pantalla, sacado del borrador (también de uno
//     que armó el chat);
//   · aplicarFormulario: el borrador con lo que cargó la pantalla. Toca SÓLO lo que la pantalla
//     maneja y sólo si cambió: lo que el chat agregó y la pantalla no muestra (un flete, un plan
//     de pagos, un SyH con otras jornadas) queda como estaba.
// Las usan el navegador (para mostrar el precio al instante) y el servidor (que es el que guarda),
// así que dan lo mismo en los dos lados. Sin base ni red: se prueban con node --test.

import {
  aplicarCambios, type DatosBorrador, type DatosCotizador, type Faltante,
} from "../asistente/borrador.ts";
import type { CategoriaFachada, EntradaFachada } from "../cotizador/fachada.ts";
import type { EntradaBandeja } from "../cotizador/bandeja.ts";
import type { EntradaComplementario } from "../cotizador/complementarios.ts";
import { nuevaLinea, pesos, type Linea, type Rango, type Tarifas } from "../cotizador/tipos.ts";

export type TipoCotizacion = DatosCotizador["tipo"];
/** Cómo va un ítem: suma a la oferta, va aparte en el PDF o no va. */
export type Estado3 = "base" | "opcional" | "no";

export type FilaDesglose = {
  id: string;
  concepto: string;
  cantidad: number;
  /** Precio unitario sin IVA. null = todavía no tiene monto (no entra en la oferta). */
  precio: number | null;
  /** Se cobra de nuevo en cada período (el alquiler); si no, es de única vez. */
  porPeriodo: boolean;
  seccion: "base" | "opcional";
  /** Clave de la tabla de productos de Odoo. */
  producto: string;
  /** Copiada de una orden con un producto fuera de la tabla: vuelve con ese producto. */
  productoOdoo?: { id: number; alquiler: boolean };
};

export type Formulario = {
  tipo: TipoCotizacion;
  cliente: {
    partnerId: number | null;
    razonSocial: string;
    contacto: string;
    celular: string;
    email: string;
    cuit: string;
    domicilio: string;
    domicilioObra: boolean;
  };
  obra: { direccion: string; enCaba: boolean | null; esquina: string | null };
  bandeja: {
    metros: number | null;
    altura: number;
    /** null = la tarifa de esa altura. */
    precioMl: number | null;
    motivoPrecio: string;
    concertina: Estado3;
    gestoria: Estado3;
  };
  fachada: {
    frentes: number[];
    altura: number | null;
    categoria: CategoriaFachada | null;
    precioM2: number | null;
    motivoPrecio: string;
    /** sin_preguntar: no aplica o no se decidió (con 15 m o más el motor lo pide). */
    escalonado: "sin_preguntar" | "no" | "A" | "B";
    alturaCorte: number | null;
    gestoria: Estado3;
    bandejaA3: boolean;
    filasTablones: "1" | "2" | "todas";
    mediaSombra: boolean;
  };
  desglose: { trabajo: string; filas: FilaDesglose[] };
  /** Técnico de Seguridad e Higiene y memoria de cálculo (en bandeja y fachada). */
  syh: Estado3;
  memoria: Estado3;
  jornadas: { armado: number | null; desarme: number | null };
  render: { eleccion: "biblioteca" | "propio" | "ninguno" | null; renderId: string | null; path: string | null };
  plazoDias: number;
  formaPago: string | null;
  textos: { aMano: boolean; referencia: string; seccion1: string; seccion2: { titulo: string; contenido: string }[] };
  ia: DatosCotizador["ia"];
};

export const FORMAS_PAGO = {
  "5050": "50 % de anticipo y 50 % al finalizar el montaje.",
  "100": "100 % anticipado.",
} as const;

const vacio = (s: string | null | undefined) => (s ?? "").trim();
const oNull = (s: string | null | undefined) => (vacio(s) ? vacio(s) : null);
const r2 = (n: number) => Math.round(n * 100) / 100;
const m = (n: number) => n.toLocaleString("es-AR", { maximumFractionDigits: 2 });

// ── Del borrador a la pantalla ───────────────────────────────────────────────────────────

export function tipoDelBorrador(d: DatosBorrador): TipoCotizacion {
  if (d.cotizador?.tipo) return d.cotizador.tipo;
  if (d.calculos.fachada) return "fachada";
  if (d.calculos.bandeja) return "bandeja";
  if (d.lineasManuales.length || d.modelo === "D" || d.calculos.alquiler || d.calculos.manoObra) return "desglosado";
  return "bandeja";
}

function estadoComplementario(d: DatosBorrador, tipo: "syh" | "ingenieria"): Estado3 {
  const c = d.calculos.complementarios?.find((x) => x.tipo === tipo);
  if (c) return c.seccion === "base" ? "base" : "opcional";
  if (d.opcionalesDescartados.includes(tipo)) return "no";
  return "opcional";
}

const PRODUCTO_POR_DEFECTO = "estructura_tubular";

export function formularioDesdeBorrador(d: DatosBorrador): Formulario {
  const cz = d.cotizador;
  const b = d.calculos.bandeja;
  const f = d.calculos.fachada;
  const enCaba = d.obra.enCaba;
  const filasConMonto: FilaDesglose[] = d.lineasManuales.map((l) => ({
    id: l.id, concepto: l.descripcion, cantidad: l.cantidad, precio: l.precioUnitario, porPeriodo: !l.unicaVez,
    seccion: l.seccion === "base" ? "base" : "opcional", producto: l.producto, ...(l.productoOdoo ? { productoOdoo: l.productoOdoo } : {}),
  }));
  const sinMonto: FilaDesglose[] = (cz?.filasSinMonto ?? []).map((x) => ({ ...x, cantidad: 1, precio: null, producto: productoParaConcepto(x.concepto, x.porPeriodo) }));
  const esc = f?.escalonado;
  return {
    tipo: tipoDelBorrador(d),
    cliente: {
      partnerId: d.cliente.partnerId,
      razonSocial: vacio(d.cliente.razonSocial),
      contacto: vacio(d.cliente.contacto),
      celular: vacio(d.cliente.celular),
      email: vacio(d.cliente.email),
      cuit: vacio(d.cliente.cuit),
      domicilio: vacio(d.cliente.domicilio),
      domicilioObra: cz?.domicilioObra ?? false,
    },
    obra: { direccion: vacio(d.obra.direccion), enCaba, esquina: d.decisiones.esquina ?? null },
    bandeja: {
      metros: b?.metros ?? null,
      altura: b?.altura ?? 3,
      precioMl: b?.precioMl ?? null,
      motivoPrecio: vacio(b?.motivoPrecio),
      concertina: (b?.concertina === "adicional" ? "opcional" : b?.concertina) ?? "opcional",
      gestoria: (b?.gestoria === "adicional" ? "opcional" : b?.gestoria) ?? (enCaba === false ? "no" : "opcional"),
    },
    fachada: {
      frentes: f?.frentes ?? [],
      altura: f?.altura ?? null,
      categoria: f?.categoria ?? null,
      precioM2: f?.precioM2 ?? null,
      motivoPrecio: vacio(f?.motivoPrecio),
      escalonado: esc === undefined ? "sin_preguntar" : esc === null ? "no" : esc.salto === "B" ? "B" : "A",
      alturaCorte: esc ? esc.alturaCorte : null,
      gestoria: (f?.gestoria === "adicional" ? "opcional" : f?.gestoria) ?? (enCaba === false ? "no" : "opcional"),
      bandejaA3: cz?.fachada.bandejaA3 ?? true,
      filasTablones: cz?.fachada.filasTablones ?? "1",
      mediaSombra: cz?.fachada.mediaSombra ?? false,
    },
    desglose: { trabajo: vacio(cz?.trabajo), filas: [...filasConMonto, ...sinMonto] },
    syh: estadoComplementario(d, "syh"),
    memoria: estadoComplementario(d, "ingenieria"),
    jornadas: { armado: d.jornadas.armado, desarme: d.jornadas.desarme },
    render: { ...d.render },
    plazoDias: d.condiciones.periodoDias,
    formaPago: d.condiciones.formaPago,
    textos: {
      aMano: cz?.textosAMano ?? (!!d.seccion1 && !cz),
      referencia: vacio(d.referencia),
      seccion1: vacio(d.seccion1),
      seccion2: d.seccion2,
    },
    ia: cz?.ia ?? {},
  };
}

/** El producto de Odoo para un renglón a mano, por lo que dice. */
export function productoParaConcepto(concepto: string, porPeriodo: boolean): string {
  const c = concepto.toLowerCase();
  if (/memoria|ingenier|c[aá]lculo|planos/.test(c)) return "ingenieria";
  if (/traslado|flete|acarreo|env[ií]o|retiro|vi[aá]tico/.test(c)) return "traslado";
  if (/seguridad|higiene|\bsyh\b|s&h|t[eé]cnico/.test(c)) return "seguridad_higiene";
  if (/gestor|permiso/.test(c)) return "gestoria_permiso";
  if (/plataforma/.test(c)) return "plataforma_m2";
  if (/apuntal/.test(c)) return "apuntalamiento";
  if (/tribuna/.test(c)) return "tribuna";
  if (/escenario/.test(c)) return "escenario";
  if (/sin montaje/.test(c)) return "alquiler_sin_montaje";
  void porPeriodo;
  return PRODUCTO_POR_DEFECTO;
}

// ── De la pantalla al borrador ──────────────────────────────────────────────────────────

export type ContextoFormulario = { tarifas: Tarifas };

/** Lo que tiene que dar el borrador para un estado del SyH o la memoria (sólo si cambió). */
function aplicarComplementario(d: DatosBorrador, tipo: "syh" | "ingenieria", estado: Estado3): DatosBorrador {
  if (estadoComplementario(d, tipo) === estado) return d;
  const otros = (d.calculos.complementarios ?? []).filter((c) => c.tipo !== tipo);
  const descartados = d.opcionalesDescartados.filter((x) => x !== tipo);
  const nuevos: EntradaComplementario[] = estado === "base" ? [...otros, { tipo, seccion: "base" }] : otros;
  return {
    ...d,
    calculos: { ...d.calculos, complementarios: nuevos },
    opcionalesDescartados: estado === "no" ? [...descartados, tipo] : descartados,
  };
}

export function aplicarFormulario(datos: DatosBorrador, f: Formulario, ctx: ContextoFormulario): DatosBorrador {
  let d = structuredClone(datos);
  const tipoAntes = tipoDelBorrador(datos);
  const direccion = oNull(f.obra.direccion);
  const enCaba = f.obra.enCaba;

  // Cliente: uno de Odoo se respeta tal cual; uno nuevo se da de alta al guardar.
  const c = f.cliente;
  d.cliente = c.partnerId
    ? { ...d.cliente, partnerId: c.partnerId, razonSocial: oNull(c.razonSocial), contacto: oNull(c.contacto), celular: oNull(c.celular), email: oNull(c.email), cuit: oNull(c.cuit), domicilio: oNull(c.domicilio), esNuevo: false }
    : {
        partnerId: null, razonSocial: oNull(c.razonSocial), contacto: oNull(c.contacto), celular: oNull(c.celular), email: oNull(c.email), cuit: oNull(c.cuit),
        domicilio: c.domicilioObra ? direccion : oNull(c.domicilio), esNuevo: !!oNull(c.razonSocial),
      };
  d.obra = { ...d.obra, direccion, enCaba };
  const decisiones = { ...d.decisiones };
  if (f.obra.esquina) decisiones.esquina = f.obra.esquina;
  else delete decisiones.esquina;
  d.decisiones = decisiones;

  // Cambiar de tipo saca el cálculo del tipo anterior (no los agregados del chat).
  if (f.tipo !== tipoAntes) {
    const calc = { ...d.calculos };
    if (f.tipo !== "bandeja") delete calc.bandeja;
    if (f.tipo !== "fachada") delete calc.fachada;
    d.calculos = calc;
    if (tipoAntes === "desglosado") d.lineasManuales = [];
    d.modelo = null;
  }

  const sinGestoria = (e: Estado3): Estado3 => (enCaba === false ? "no" : e);
  if (f.tipo === "bandeja") {
    const b = f.bandeja;
    const entrada: EntradaBandeja | undefined = b.metros && b.metros > 0
      ? {
          metros: r2(b.metros), altura: b.altura,
          ...(b.precioMl ? { precioMl: Math.round(b.precioMl) } : {}),
          ...(vacio(b.motivoPrecio) ? { motivoPrecio: vacio(b.motivoPrecio) } : {}),
          ...(d.calculos.bandeja?.bonificacionPct ? { bonificacionPct: d.calculos.bandeja.bonificacionPct } : {}),
          concertina: b.concertina, gestoria: sinGestoria(b.gestoria), enCaba: enCaba ?? true,
        }
      : undefined;
    const calc = { ...d.calculos };
    if (entrada) calc.bandeja = entrada;
    else delete calc.bandeja;
    d.calculos = calc;
    d.modelo = "A";
    d.contrato = "Obra ";
    d.trabajo = {
      ...d.trabajo, ambito: "obra", tipoObra: "pantalla_proteccion",
      concertina: b.concertina === "base" ? "si" : b.concertina === "no" ? "no" : d.trabajo.concertina,
      llevaPermiso: sinGestoria(b.gestoria) === "base" ? "si" : d.trabajo.llevaPermiso,
    };
  } else if (f.tipo === "fachada") {
    const x = f.fachada;
    const frentes = x.frentes.filter((n) => n > 0).map(r2);
    const entrada: EntradaFachada | undefined = frentes.length && x.altura && x.altura > 0
      ? {
          frentes, altura: x.altura, encuadre: "A",
          ...(x.categoria ? { categoria: x.categoria } : {}),
          ...(x.precioM2 ? { precioM2: Math.round(x.precioM2) } : {}),
          ...(vacio(x.motivoPrecio) ? { motivoPrecio: vacio(x.motivoPrecio) } : {}),
          ...(x.escalonado === "no" ? { escalonado: null } : x.escalonado === "A" || x.escalonado === "B"
            ? { escalonado: { alturaCorte: x.alturaCorte && x.alturaCorte > 0 && x.alturaCorte < x.altura ? x.alturaCorte : 15, salto: x.escalonado } }
            : {}),
          gestoria: sinGestoria(x.gestoria), enCaba: enCaba ?? true,
        }
      : undefined;
    const calc = { ...d.calculos };
    if (entrada) calc.fachada = entrada;
    else delete calc.fachada;
    d.calculos = calc;
    d.modelo = "B";
    d.contrato = "Obra ";
    d.trabajo = {
      ...d.trabajo, ambito: "obra", tipoObra: x.bandejaA3 ? "estructura_pantalla" : "estructura_sin_pantalla",
      llevaPermiso: sinGestoria(x.gestoria) === "base" ? "si" : d.trabajo.llevaPermiso,
    };
  } else {
    // Desglosado: cada renglón con monto es una línea a mano; el monto lo pone el vendedor.
    const conMonto = f.desglose.filas.filter((r) => r.precio !== null && r.precio >= 0 && vacio(r.concepto));
    d.lineasManuales = conMonto.map((r) => {
      const anterior = datos.lineasManuales.find((l) => l.id === r.id);
      const cantidad = r.cantidad > 0 ? r.cantidad : 1;
      return nuevaLinea({
        id: r.id, grupo: "manual", seccion: r.seccion, producto: r.producto || productoParaConcepto(r.concepto, r.porPeriodo),
        descripcion: vacio(r.concepto), cantidad, precioUnitario: Math.round(r.precio!), unicaVez: !r.porPeriodo,
        ...(r.porPeriodo ? { unidad: undefined } : {}),
        calculo: `precio a mano: ${m(cantidad)} × ${pesos(r.precio!)}`,
        desvio: anterior?.desvio ?? { tarifa: "línea a medida", motivo: "precio del vendedor (cotizador)" },
        ...(r.productoOdoo ? { productoOdoo: r.productoOdoo } : anterior?.productoOdoo ? { productoOdoo: anterior.productoOdoo } : {}),
      }) as Linea;
    });
    d.modelo = "D";
    d.contrato = d.contrato ?? "Obra ";
    const t = f.desglose.trabajo.toLowerCase();
    const tipoObra = /torre/.test(t) ? "torre" : /plataforma/.test(t) ? "plataforma" : /apuntal/.test(t) ? "apuntalamiento_vertical" : d.trabajo.tipoObra;
    d.trabajo = { ...d.trabajo, ambito: d.trabajo.ambito ?? "obra", tipoObra };
  }

  if (f.tipo !== "desglosado") {
    d = aplicarComplementario(d, "syh", f.syh);
    d = aplicarComplementario(d, "ingenieria", f.memoria);
  }

  d.jornadas = { ...d.jornadas, armado: f.jornadas.armado, desarme: f.jornadas.desarme };
  d.render = f.render.eleccion === "biblioteca"
    ? { eleccion: "biblioteca", renderId: f.render.renderId, path: null }
    : f.render.eleccion === "propio"
      ? { eleccion: "propio", renderId: null, path: f.render.path }
      : { eleccion: f.render.eleccion, renderId: null, path: null };
  d.condiciones = { ...d.condiciones, periodoDias: f.plazoDias > 0 ? Math.round(f.plazoDias) : 30, formaPago: oNull(f.formaPago) };

  const cotizador: DatosCotizador = {
    tipo: f.tipo,
    domicilioObra: !c.partnerId && c.domicilioObra,
    textosAMano: f.textos.aMano,
    fachada: { bandejaA3: f.fachada.bandejaA3, filasTablones: f.fachada.filasTablones, mediaSombra: f.fachada.mediaSombra },
    trabajo: oNull(f.desglose.trabajo),
    filasSinMonto: f.tipo === "desglosado"
      ? f.desglose.filas.filter((r) => r.precio === null).map((r) => ({ id: r.id, concepto: r.concepto, porPeriodo: r.porPeriodo, seccion: r.seccion }))
      : [],
    ia: f.ia,
  };
  d.cotizador = cotizador;

  const textos = f.textos.aMano
    ? { referencia: oNull(f.textos.referencia), seccion1: oNull(f.textos.seccion1), seccion2: f.textos.seccion2.filter((s) => vacio(s.titulo) || vacio(s.contenido)) }
    : textosAutomaticos(d, ctx.tarifas);
  d.referencia = textos.referencia;
  d.seccion1 = textos.seccion1;
  d.seccion2 = textos.seccion2;
  return d;
}

/** Arranca el borrador del cotizador para un tipo (pantalla vacía, sin IA). */
export function formularioVacio(tipo: TipoCotizacion, base: Formulario): Formulario {
  return { ...base, tipo };
}

// ── Textos de la propuesta ──────────────────────────────────────────────────────────────

type Textos = { referencia: string | null; seccion1: string | null; seccion2: { titulo: string; contenido: string }[] };

function textoJornadas(d: DatosBorrador): string {
  const j = (n: number) => `${m(n)} jornada${n === 1 ? "" : "s"}`;
  const { armado, desarme } = d.jornadas;
  if (armado === null || desarme === null) return "* Las jornadas de armado y desarme las confirma el técnico.";
  return `* Armado: ${j(armado)}.\n* Desarme: ${j(desarme)}.\n* Las fechas se coordinan al confirmar el presupuesto.`;
}

/** Los opcionales que van en el PDF, en castellano, para el alcance. */
function opcionalesEnTexto(d: DatosBorrador): string[] {
  const out: string[] = [];
  const b = d.calculos.bandeja;
  const f = d.calculos.fachada;
  const gest = b?.gestoria ?? f?.gestoria;
  if (gest === "opcional") out.push("gestión del permiso de vía pública");
  if (b?.concertina === "opcional") out.push("alambre tipo concertina");
  if (estadoComplementario(d, "syh") === "opcional" && d.jornadas.armado !== null && d.jornadas.desarme !== null) out.push("técnico de Seguridad e Higiene");
  if (estadoComplementario(d, "ingenieria") === "opcional" && Math.max(b?.altura ?? 0, f?.altura ?? 0) <= 6) out.push("memoria de cálculo");
  return out;
}

function incluye(d: DatosBorrador, extra: string[]): string {
  const b = d.calculos.bandeja;
  const f = d.calculos.fachada;
  const partes = ["provisión del material", "flete", "armado y desarme", `el alquiler de los primeros ${m(d.condiciones.periodoDias)} días`, ...extra];
  if ((b?.gestoria ?? f?.gestoria) === "base") partes.push("la gestión del permiso de vía pública");
  if (b?.concertina === "base") partes.push("el alambre tipo concertina");
  return partes.join(", ");
}

export function textosAutomaticos(d: DatosBorrador, t: Tarifas): Textos {
  const dir = d.obra.direccion?.trim() || "la obra";
  const plazo = m(d.condiciones.periodoDias);
  const opc = opcionalesEnTexto(d);
  const lineaOpc = opc.length ? `\n* Opcionales: ${opc.join(", ")}.` : "";
  const renov = `\n* Si la obra sigue después de los ${plazo} días, cada período adicional se cobra aparte (ver renovación).`;
  const tipo = d.cotizador?.tipo ?? tipoDelBorrador(d);

  if (tipo === "bandeja") {
    const b = d.calculos.bandeja;
    if (!b) return { referencia: null, seccion1: null, seccion2: [] };
    const minimo = b.metros < t.bandeja.minimoMl;
    const lote = d.obra.lote;
    const frente = lote ? (lote.caras.length ? lote.caras.reduce((a, x) => a + x, 0) : lote.frenteCatastro) : null;
    const todo = frente !== null && Math.abs(frente - b.metros) <= Math.max(1, frente * 0.05);
    return {
      referencia: `Bandeja de protección ${m(b.metros)} m.l.`,
      seccion1:
        `Provisión, armado y desarme de **bandeja de protección peatonal de ${m(b.altura)} m** sobre la vereda de **${dir}**, ` +
        `en **${m(b.metros)} m.l.**${todo ? " (todo el frente)" : ""}, por un período de **${plazo} días**.` +
        (minimo ? ` El tramo mide ${m(b.metros)} m: se factura el mínimo de ${m(t.bandeja.minimoMl)} m.l.` : ""),
      seccion2: [
        { titulo: "Sistema constructivo", contenido: `* Bandeja de protección peatonal de ${m(b.altura)} m de altura, con estructura tubular y plataforma de protección.\n* Cumple con el Decreto 911/96.` },
        {
          titulo: "Descripción de la estructura",
          contenido: `* ${m(b.metros)} m.l. sobre la vereda${todo ? ", a lo largo de todo el frente (medido en el catastro de la Ciudad)" : ""}.` + (minimo ? `\n* Mínimo facturable: ${m(t.bandeja.minimoMl)} m.l.` : ""),
        },
        { titulo: "Plazos de armado y desarme", contenido: textoJornadas(d) },
        { titulo: "Alcance del servicio", contenido: `* Incluye: ${incluye(d, [])}.${lineaOpc}${renov}` },
      ],
    };
  }

  if (tipo === "fachada") {
    const f = d.calculos.fachada;
    if (!f) return { referencia: null, seccion1: null, seccion2: [] };
    const cz = d.cotizador?.fachada;
    const desarrollo = r2(f.frentes.reduce((a, x) => a + x, 0));
    const sup = r2(desarrollo * f.altura);
    const caras = f.frentes.length > 1 ? ` en ${f.frentes.length} caras (${f.frentes.map(m).join(" + ")} m)` : "";
    const filas = cz?.filasTablones === "todas" ? "plataformas de trabajo en todos los niveles" : `${cz?.filasTablones === "2" ? "dos filas completas" : "una fila completa"} de tablones`;
    const extra = [cz?.bandejaA3 !== false ? "bandeja de protección peatonal a 3 m" : "", cz?.mediaSombra ? "media sombra" : ""].filter(Boolean);
    return {
      referencia: `Estructura en fachada ${m(sup)} m²`,
      seccion1:
        `Provisión, armado y desarme de **estructura multidireccional en fachada** de **${m(f.altura)} m** de altura sobre **${dir}**, ` +
        `en **${m(desarrollo)} m.l.**${caras} (**${m(sup)} m²**)${extra.length ? `, con ${extra.join(" y ")}` : ""}, por un período de **${plazo} días**.`,
      seccion2: [
        {
          titulo: "Sistema constructivo",
          contenido: `* Andamio multidireccional con ${filas}, barandas y rodapiés.` + (cz?.bandejaA3 !== false ? "\n* Bandeja de protección peatonal a 3 m de altura." : "") +
            (cz?.mediaSombra ? "\n* Media sombra en toda la superficie." : "") + "\n* Cumple con el Decreto 911/96.",
        },
        { titulo: "Descripción de la estructura", contenido: `* ${m(desarrollo)} m.l.${caras} × ${m(f.altura)} m de altura = ${m(sup)} m².` },
        { titulo: "Plazos de armado y desarme", contenido: textoJornadas(d) },
        { titulo: "Alcance del servicio", contenido: `* Incluye: ${incluye(d, [])}.${lineaOpc}${renov}` },
      ],
    };
  }

  // Desglosado: el alcance son los renglones.
  const trabajo = d.cotizador?.trabajo?.trim() || null;
  const renglones = d.lineasManuales.filter((l) => l.seccion === "base");
  if (!renglones.length && !trabajo) return { referencia: null, seccion1: null, seccion2: [] };
  const alquiler = renglones.find((l) => !l.unicaVez);
  const periodo = alquiler && /(\d+)\s*d[ií]as/i.test(alquiler.descripcion) ? alquiler.descripcion.match(/(\d+)\s*d[ií]as[^,.;]*/i)![0] : `${plazo} días`;
  return {
    referencia: trabajo ? (trabajo.length > 70 ? `${trabajo.slice(0, 67).trimEnd()}…` : trabajo.charAt(0).toUpperCase() + trabajo.slice(1)) : "Estructura según detalle",
    seccion1: `Provisión, armado y desarme de **${trabajo ?? "la estructura detallada"}** en **${dir}**, por un período de **${periodo}**.`,
    seccion2: [
      { titulo: "Alcance del servicio", contenido: renglones.map((l) => `* ${l.descripcion}.`).join("\n") || "* Según los renglones de la oferta." },
      { titulo: "Plazos de armado y desarme", contenido: textoJornadas(d) },
      ...(alquiler ? [{ titulo: "Renovación", contenido: `* Si la obra sigue, cada período adicional se cobra según el renglón «${alquiler.descripcion}».` }] : []),
    ],
  };
}

// ── Para la pantalla ────────────────────────────────────────────────────────────────────

/** Dónde se arregla cada faltante (el id de la sección del formulario). */
export function seccionDeFaltante(f: Faltante): "cliente" | "obra" | "tipo" | "jornadas" | "render" | "textos" | "condiciones" {
  const c = f.codigo;
  if (c === "cliente" || c === "cliente_nuevo" || c === "cuit") return "cliente";
  if (c === "obra" || c === "frente_lote" || c === "conflicto_canal") return "obra";
  if (c === "jornadas") return "jornadas";
  if (c === "render" || c === "render_imagen") return "render";
  if (c === "seccion1" || c === "seccion2") return "textos";
  if (c === "plan_pagos") return "condiciones";
  return "tipo";
}

/** La categoría de fachada cuyo rango contiene el precio (el vendedor dicta el $/m²). */
export function categoriaParaPrecio(precio: number, t: Tarifas): CategoriaFachada | null {
  const f = t.fachada;
  const en = (r: Rango | number) => (typeof r === "number" ? r === precio : precio >= r.min && precio <= r.max);
  const orden: [CategoriaFachada, Rango | number][] = [
    ["licitacion", f.licitacion], ["estandar", f.estandar], ["escaleras", f.escaleras], ["completa", f.completa], ["compleja", f.compleja], ["especial", f.especial],
  ];
  return orden.find(([, r]) => en(r))?.[0] ?? null;
}

export function rangoCategoria(c: CategoriaFachada, t: Tarifas): Rango | number {
  const f = t.fachada;
  return { licitacion: f.licitacion, estandar: f.estandar, escaleras: f.escaleras, completa: f.completa, compleja: f.compleja, especial: f.especial }[c];
}

/** La tarifa de la bandeja para una altura: un número, un rango o null (sin tarifa). */
export function tarifaBandeja(altura: number, t: Tarifas): number | Rango | null {
  if (altura === 3) return t.bandeja.m3;
  if (altura === 6) return t.bandeja.m6;
  if (altura === 8) return t.bandeja.m8;
  return null;
}

/** Aplica un cambio parcial al formulario (los objetos se mezclan, las listas se reemplazan). */
export function cambiarFormulario(f: Formulario, cambios: Partial<Record<keyof Formulario, unknown>>): Formulario {
  return aplicarCambios(f as unknown as Record<string, unknown>, cambios as Record<string, unknown>) as unknown as Formulario;
}

/** Un id nuevo para un renglón del desglosado (estable: lo usa la línea de la oferta). */
export function idFila(semilla: string): string {
  return `manual:cr-${semilla}`;
}
