// PDF de la Propuesta Técnico-Económica — port de generar_propuesta.py (skill andamios-propuesta).
//
// MISMO DOCUMENTO, MISMAS MEDIDAS: A4, Poppins, rojo #AF2C19, arco peach arriba y gris abajo,
// logo y bloque fiscal a la derecha, pie centrado con "Página X / Y". Las medidas en puntos
// salen del script de Python (LM 45, RM 40, membrete 112, piso del marco 98) para que un PDF
// de acá y uno de la skill se vean iguales puestos lado a lado.
//
// SIN JSX A PROPÓSITO (createElement): así el mismo archivo lo renderiza la ruta de Next y un
// script de Node (scripts/pdf-paridad.mjs) sin compilar nada.
//
// EL PDF NO HACE CUENTAS. Importes, subtotal, IVA, renovación y letras vienen del motor
// (src/lib/cotizador/totales.ts). Acá sólo se dibujan.

import path from "node:path";
import { createElement as h, type ReactElement, type ReactNode } from "react";
import { Circle, Document, Font, Image, Page, Svg, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { enLetras } from "../letras.ts";

// ── Branding (medido sobre el membrete original, ver generar_propuesta.py) ──────────────
const RED = "#AF2C19";
const PEACH = "#F7EBEB";
const GREYBG = "#E8E8E8";
const INK = "#1a1a1a";
const GREY = "#555555";
const LINK = "#1155cc";
const LINE = "#cfcfcf";
const FOOTLINE = "#9a9a9a";

const W = 595.28;
const H = 841.89;
const LM = 45;
const RM = 40;
const HEADER_H = 112;
const FOOTER_H = 64;
const FRAME_BOT = 98;
const ANCHO = W - LM - RM;

const RECURSOS = path.join(process.cwd(), "src/lib/cotizador/pdf/recursos");
const LOGO = path.join(RECURSOS, "aba_logo.png");
const LOGO_W = 92;
const LOGO_H = (LOGO_W * 350) / 830;

let fuentesListas = false;
function registrarFuentes() {
  if (fuentesListas) return;
  Font.register({
    family: "Poppins",
    fonts: [
      { src: path.join(RECURSOS, "Poppins-Light.ttf"), fontWeight: 300 },
      { src: path.join(RECURSOS, "Poppins-Regular.ttf"), fontWeight: 400 },
      { src: path.join(RECURSOS, "Poppins-Medium.ttf"), fontWeight: 500 },
      { src: path.join(RECURSOS, "Poppins-Bold.ttf"), fontWeight: 700 },
      { src: path.join(RECURSOS, "Poppins-Italic.ttf"), fontWeight: 400, fontStyle: "italic" },
      // Poppins no trae "bold italic" en el paquete: la negrita dentro de una itálica cae en Bold.
      { src: path.join(RECURSOS, "Poppins-Bold.ttf"), fontWeight: 700, fontStyle: "italic" },
    ],
  });
  // Sin cortar palabras con guión: en castellano react-pdf corta mal ("mul-tidireccional").
  Font.registerHyphenationCallback((palabra) => [palabra]);
  fuentesListas = true;
}

// ── Datos de entrada ───────────────────────────────────────────────────────────────────

export type ItemPdf = { desc: string; monto: number; unidad?: string; montoLista?: number; descuentoPct?: number };

export type DatosPropuesta = {
  /** Número de Odoo (S0XXXX). null en la vista previa: se imprime "BORRADOR". */
  numero: string | null;
  /** YYYY-MM-DD. */
  fechaEmision: string;
  validezDias: number;
  vendedor: string;
  cliente: { razonSocial: string; contacto?: string | null; obra: string };
  seccion1: string;
  seccion2: { titulo: string; contenido: string }[];
  imagenes: { src: string | Buffer; ancho: number; alto: number }[];
  epigrafe?: string | null;
  base: ItemPdf[];
  adicionales: ItemPdf[];
  opcionales: ItemPdf[];
  totales: { subtotal: number; iva: number; total: number; ivaPct: number };
  renovacion: { pct: number; monto: number; incluyePrimerMes?: string } | null;
  periodoDias: number;
  mostrarTotalConIva: boolean;
  /** En obras en cuotas el ajuste va por cuota dentro de la forma de pago (criterio §4.7). */
  actualizacionCac: boolean;
  formaPago?: string | null;
  plazoInicioDiasHabiles: number;
  aclaraciones?: string | null;
  borrador: boolean;
};

// ── Formato ─────────────────────────────────────────────────────────────────────────────

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

export function fechaLarga(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${d} de ${MESES[m - 1]} de ${a}`;
}

export function sumarDias(iso: string, dias: number): string {
  const f = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  f.setUTCDate(f.getUTCDate() + dias);
  return f.toISOString().slice(0, 10);
}

const money = (n: number) => `$${Math.round(n).toLocaleString("es-AR")}`;
const capitalizar = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const letras = (n: number) => capitalizar(`son pesos ${enLetras(n)}`);

/** "**negrita**" → segmentos. Mismo criterio que rich() de la skill. */
function rich(texto: string): ReactNode[] {
  const partes = texto.split(/\*\*(.+?)\*\*/g);
  return partes.map((p, i) => (i % 2 === 1 ? h(Text, { key: i, style: { fontWeight: 700 } }, p) : p));
}

// ── Estilos (los de styles() en el script) ───────────────────────────────────────────────
const S = {
  client: { fontFamily: "Poppins", fontSize: 9.5, lineHeight: 13.5 / 9.5, color: INK },
  clientobra: { fontFamily: "Poppins", fontSize: 10, lineHeight: 1.4, color: INK },
  title: { fontFamily: "Poppins", fontWeight: 300, fontSize: 23, lineHeight: 25 / 23, color: RED, textAlign: "right" as const },
  subtitle: { fontFamily: "Poppins", fontWeight: 500, fontSize: 12, lineHeight: 14 / 12, color: RED, textAlign: "right" as const },
  boxlbl: { fontFamily: "Poppins", fontWeight: 700, fontSize: 8.5, lineHeight: 11 / 8.5, color: INK },
  boxval: { fontFamily: "Poppins", fontSize: 9.5, lineHeight: 12 / 9.5, color: INK },
  sec: { fontFamily: "Poppins", fontWeight: 700, fontSize: 12, lineHeight: 15 / 12, color: RED, marginTop: 14, marginBottom: 6 },
  secblack: { fontFamily: "Poppins", fontWeight: 700, fontSize: 12, lineHeight: 15 / 12, color: INK, marginTop: 14, marginBottom: 6 },
  subsec: { fontFamily: "Poppins", fontWeight: 700, fontSize: 10, lineHeight: 1.4, color: INK, marginTop: 8, marginBottom: 3 },
  body: { fontFamily: "Poppins", fontSize: 9.6, lineHeight: 14 / 9.6, color: INK, textAlign: "justify" as const },
  bul: { fontFamily: "Poppins", fontSize: 9.6, lineHeight: 13.5 / 9.6, color: INK },
  cap: { fontFamily: "Poppins", fontStyle: "italic" as const, fontSize: 7.8, lineHeight: 10.5 / 7.8, color: GREY, textAlign: "center" as const },
  capdisc: { fontFamily: "Poppins", fontStyle: "italic" as const, fontSize: 7.2, lineHeight: 9.8 / 7.2, color: GREY, textAlign: "center" as const, marginTop: 1 },
  tdesc: { fontFamily: "Poppins", fontSize: 9.3, lineHeight: 12.5 / 9.3, color: INK },
  tdescw: { fontFamily: "Poppins", fontStyle: "italic" as const, fontSize: 7.6, lineHeight: 9.8 / 7.6, color: GREY },
  th: { fontFamily: "Poppins", fontWeight: 700, fontSize: 9, lineHeight: 11 / 9, color: "#ffffff" },
  imp: { fontFamily: "Poppins", fontWeight: 500, fontSize: 9.5, lineHeight: 12 / 9.5, color: INK, textAlign: "right" as const },
  impHi: { fontFamily: "Poppins", fontWeight: 700, fontSize: 11.5, lineHeight: 14 / 11.5, color: RED, textAlign: "right" as const },
  impDim: { fontFamily: "Poppins", fontSize: 9, lineHeight: 12 / 9, color: GREY, textAlign: "right" as const },
  totlblHi: { fontFamily: "Poppins", fontWeight: 700, fontSize: 9.5, lineHeight: 13 / 9.5, color: INK },
  totlbl: { fontFamily: "Poppins", fontSize: 8.8, lineHeight: 12 / 8.8, color: GREY },
  subletras: { fontFamily: "Poppins", fontStyle: "italic" as const, fontSize: 8, lineHeight: 11 / 8, color: GREY, textAlign: "right" as const },
  firm: { fontFamily: "Poppins", fontWeight: 700, fontSize: 10, lineHeight: 13 / 10, color: INK },
  firmsub: { fontFamily: "Poppins", fontSize: 9.3, lineHeight: 12.5 / 9.3, color: INK },
};

const DISCLAIMER_ESQUEMA =
  "Esquema orientativo y de carácter ilustrativo. La configuración definitiva (cantidad de cuerpos, alturas, niveles y " +
  "disposición) podrá variar según el relevamiento en obra, las dimensiones reales y las condiciones de montaje.";

const ACLARACIONES_DEFAULT =
  "La presente oferta contempla únicamente lo detallado en el anexo técnico. No incluye habilitaciones municipales, " +
  "seguros adicionales por riesgos específicos, ni provisión de punto de luz o fuerza motriz. El cliente deberá asegurar " +
  "que la zona de trabajo esté despejada, nivelada y sea segura para el personal de montaje.";

// ── Piezas del documento ────────────────────────────────────────────────────────────────

function Membrete(): ReactElement {
  const fiscal: [string, number, number][] = [
    ["EMPRENDIMIENTOS Y ESTRUCTURAS SA", 700, 8.8],
    ["C.U.I.T.: 30-71111650-4", 400, 8.4],
    ["Ing. Brutos: 1203117–08", 400, 8.4],
    ["Fecha de inicio: 01-09-2009", 400, 8.4],
  ];
  // El script ubica la línea base del primer renglón a 18 + alto del logo + 7 desde arriba.
  const primeraBase = 18 + LOGO_H + 7;
  return h(
    View,
    { fixed: true, style: { position: "absolute", top: 0, left: 0, width: W, height: H } },
    h(
      Svg,
      { width: W, height: H, style: { position: "absolute", top: 0, left: 0 } },
      h(Circle, { cx: W * 0.886, cy: H - H * 1.243, r: W * 0.583, fill: PEACH }),
      h(Circle, { cx: -W * 0.1, cy: H + H * 0.05, r: W * 0.46, fill: GREYBG }),
    ),
    h(Image, { src: LOGO, style: { position: "absolute", top: 16, left: W - RM - LOGO_W, width: LOGO_W, height: LOGO_H } }),
    ...fiscal.map(([t, peso, tam], i) =>
      h(
        Text,
        {
          key: t,
          style: {
            position: "absolute",
            right: RM,
            // Text posiciona por la caja, no por la línea base: se sube ~0,8 del tamaño.
            top: primeraBase + i * 11.4 - tam * 0.95,
            fontFamily: "Poppins",
            fontWeight: peso,
            fontSize: tam,
            color: INK,
          },
        },
        t,
      ),
    ),
    // Línea fina del pie y texto centrado.
    h(View, { style: { position: "absolute", left: LM, width: ANCHO, top: H - (FOOTER_H + 14), borderTopWidth: 0.8, borderTopColor: FOOTLINE } }),
    ...[
      ["Maturín 2570 (1416) C.A.B.A", INK],
      ["Tel: 0810-362-1555", INK],
      ["info@andamiosbuenosaires.com.ar", LINK],
      ["www.andamiosbuenosaires.com.ar", LINK],
    ].map(([t, color], i) =>
      h(
        Text,
        {
          key: t,
          style: { position: "absolute", left: 0, width: W, textAlign: "center", top: H - (FOOTER_H + 2 - i * 9.6) - 7.8 * 0.95, fontFamily: "Poppins", fontSize: 7.8, color },
        },
        t,
      ),
    ),
    h(Text, {
      style: { position: "absolute", left: 0, width: W, textAlign: "center", top: H - (FOOTER_H + 2 - 4 * 9.6 - 1) - 8 * 0.95, fontFamily: "Poppins", fontWeight: 300, fontSize: 8, color: GREY },
      render: ({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) => `Página ${pageNumber} / ${totalPages}`,
    }),
  );
}

function MarcaBorrador(): ReactElement {
  return h(
    Text,
    {
      fixed: true,
      style: {
        position: "absolute",
        top: H / 2 - 40,
        left: 0,
        width: W,
        textAlign: "center",
        fontFamily: "Poppins",
        fontWeight: 700,
        fontSize: 80,
        color: "#AF2C19",
        opacity: 0.07,
        transform: "rotate(-35deg)",
      },
    },
    "BORRADOR",
  );
}

/** Líneas con "* ", "- " o "• " → viñetas; el resto, párrafos. Como parse_bloque(). */
function bloque(texto: string, clave: string): ReactElement[] {
  return texto
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l, i) => {
      if (/^[*\-•] /.test(l)) {
        return h(
          View,
          { key: `${clave}-${i}`, style: { flexDirection: "row", paddingLeft: 2 } },
          h(Text, { style: { ...S.bul, width: 12 } }, "•"),
          h(Text, { style: { ...S.bul, flex: 1 } }, ...rich(l.slice(2).trim())),
        );
      }
      return h(Text, { key: `${clave}-${i}`, style: S.body }, ...rich(l));
    });
}

function tablaItems(items: ItemPdf[], clave: string): ReactElement {
  const celda = { paddingHorizontal: 8, paddingVertical: 6, justifyContent: "center" as const };
  return h(
    View,
    { key: clave, style: { borderWidth: 0.4, borderColor: LINE } },
    h(
      View,
      { style: { flexDirection: "row", backgroundColor: RED } },
      h(View, { style: { ...celda, width: "74%" } }, h(Text, { style: S.th }, "DESCRIPCIÓN")),
      h(View, { style: { ...celda, width: "26%" } }, h(Text, { style: S.th }, "IMPORTE (neto)")),
    ),
    ...items.flatMap((it, i) => {
      const monto = it.montoLista ?? it.monto;
      const filas = [
        h(
          View,
          { key: `${clave}-${i}`, style: { flexDirection: "row", borderTopWidth: 0.4, borderTopColor: LINE } },
          h(
            View,
            { style: { ...celda, width: "74%" } },
            h(Text, { style: S.tdesc }, it.desc),
            h(Text, { style: { ...S.tdescw, marginTop: 1 } }, letras(monto)),
          ),
          h(View, { style: { ...celda, width: "26%" } }, h(Text, { style: S.imp }, money(monto))),
        ),
      ];
      // Bonificación declarada (encuadre B): se ve la lista y el descuento (criterio §4.6).
      if (it.descuentoPct && it.montoLista !== undefined) {
        const desc = it.montoLista - it.monto;
        filas.push(
          h(
            View,
            { key: `${clave}-${i}-bon`, style: { flexDirection: "row", borderTopWidth: 0.4, borderTopColor: LINE } },
            h(
              View,
              { style: { ...celda, width: "74%" } },
              h(Text, { style: S.tdesc }, `Bonificación ${it.descuentoPct.toLocaleString("es-AR")} % sobre valor de lista`),
              h(Text, { style: { ...S.tdescw, marginTop: 1 } }, capitalizar(`menos pesos ${enLetras(desc)}`)),
            ),
            h(View, { style: { ...celda, width: "26%" } }, h(Text, { style: S.imp }, `−${money(desc)}`)),
          ),
        );
      }
      return filas;
    }),
  );
}

// ── Documento ───────────────────────────────────────────────────────────────────────────

export function Propuesta(d: DatosPropuesta): ReactElement {
  registrarFuentes();
  const venc = sumarDias(d.fechaEmision, d.validezDias);
  const numero = d.numero ?? "BORRADOR";

  const cabecera = h(
    View,
    { style: { flexDirection: "row" } },
    h(
      View,
      { style: { width: ANCHO * 0.54 } },
      h(
        Text,
        { style: S.client },
        h(Text, { style: { fontWeight: 700 } }, "Cliente: "),
        d.cliente.razonSocial,
        ...(d.cliente.contacto ? ["\n", h(Text, { key: "c", style: { fontWeight: 700 } }, "Contacto: "), d.cliente.contacto] : []),
      ),
      h(
        Text,
        { style: { ...S.clientobra, marginTop: 5 } },
        h(Text, { style: { fontWeight: 700 } }, "Domicilio de obra:\n"),
        h(Text, { style: { fontWeight: 700, textDecoration: "underline" } }, d.cliente.obra),
      ),
    ),
    h(
      View,
      { style: { width: ANCHO * 0.46 } },
      h(Text, { style: S.title }, "Propuesta\nTécnico-Económica"),
      h(Text, { style: { ...S.subtitle, marginTop: 4 } }, `N° ${numero}`),
    ),
  );

  const caja = (lbl: string, val: string, ultima = false) =>
    h(
      View,
      { style: { width: "33.333%", paddingHorizontal: 9, paddingVertical: 8, borderRightWidth: ultima ? 0 : 0.5, borderRightColor: LINE } },
      h(Text, { style: S.boxlbl }, lbl),
      h(Text, { style: S.boxval }, val),
    );

  const info = h(
    View,
    { style: { flexDirection: "row", borderWidth: 0.7, borderColor: LINE, marginTop: 8 } },
    caja("Fecha de emisión", fechaLarga(d.fechaEmision)),
    caja("Válida hasta", fechaLarga(venc)),
    caja("Vendedor asignado", d.vendedor || "—", true),
  );

  const seccion2 = d.seccion2.flatMap((b, i) => [
    h(Text, { key: `t${i}`, style: S.subsec }, `${i + 1}. ${b.titulo}`),
    ...bloque(b.contenido, `b${i}`),
  ]);

  const graficos: ReactElement[] = [];
  if (d.imagenes.length) {
    const capW = d.imagenes.length === 1 ? 360 : 300;
    const capH = d.imagenes.length === 1 ? 300 : 235;
    graficos.push(
      h(
        View,
        { wrap: false, key: "graf" },
        h(Text, { style: S.secblack }, "Representación Gráfica del Proyecto"),
        h(View, { style: { height: 12 } }),
        ...d.imagenes.map((img, i) => {
          let w = Math.min(ANCHO, capW);
          let hh = (w * img.alto) / img.ancho;
          if (hh > capH) {
            hh = capH;
            w = (hh * img.ancho) / img.alto;
          }
          return h(Image, { key: `img${i}`, src: img.src, style: { width: w, height: hh, alignSelf: "center", marginBottom: 6 } });
        }),
        ...(d.epigrafe?.trim() ? [h(Text, { key: "epi", style: { ...S.cap, marginTop: 2 } }, ...rich(d.epigrafe.trim()))] : []),
        h(Text, { style: { ...S.capdisc, marginTop: 3 } }, DISCLAIMER_ESQUEMA),
      ),
    );
  }

  const filasTotales = [
    h(
      View,
      { key: "st", style: { flexDirection: "row", backgroundColor: PEACH } },
      h(View, { style: { width: "62.5%", paddingHorizontal: 8, paddingVertical: 5 } }, h(Text, { style: S.totlblHi }, "Subtotal (neto)")),
      h(View, { style: { width: "37.5%", paddingHorizontal: 8, paddingVertical: 5, borderLeftWidth: 0.4, borderLeftColor: LINE } }, h(Text, { style: S.impHi }, money(d.totales.subtotal))),
    ),
  ];
  if (d.mostrarTotalConIva) {
    for (const [lbl, val] of [[`IVA ${d.totales.ivaPct.toLocaleString("es-AR")}%`, d.totales.iva], ["Total c/IVA", d.totales.total]] as const) {
      filasTotales.push(
        h(
          View,
          { key: lbl, style: { flexDirection: "row", borderTopWidth: 0.4, borderTopColor: LINE } },
          h(View, { style: { width: "62.5%", paddingHorizontal: 8, paddingVertical: 5 } }, h(Text, { style: S.totlbl }, lbl)),
          h(View, { style: { width: "37.5%", paddingHorizontal: 8, paddingVertical: 5, borderLeftWidth: 0.4, borderLeftColor: LINE } }, h(Text, { style: S.impDim }, money(val))),
        ),
      );
    }
  }

  const oferta = h(
    View,
    { wrap: false, break: true, key: "oferta" },
    // ReportLab descarta el margen superior del primer elemento de una hoja nueva; react-pdf
    // no. Sin esto la oferta arranca 14 pt más abajo que en la skill.
    h(Text, { style: { ...S.sec, marginTop: 0 } }, "Sección 3: Oferta"),
    tablaItems(d.base, "base"),
    h(
      View,
      { style: { flexDirection: "row", marginTop: 4 } },
      h(View, { style: { width: ANCHO * 0.52 } }),
      h(View, { style: { width: ANCHO * 0.48, borderWidth: 0.4, borderColor: LINE } }, ...filasTotales),
    ),
    h(Text, { style: { ...S.subletras, marginTop: 2 } }, `Subtotal: ${letras(d.totales.subtotal)}.`),
    ...(d.renovacion
      ? [
          h(
            Text,
            { key: "renov", style: { ...S.subletras, fontStyle: "normal", color: INK, marginTop: 3 } },
            `Renovación mensual a partir del segundo mes: ${money(d.renovacion.monto)} + IVA`,
          ),
        ]
      : []),
  );

  const adicionales = d.adicionales.length
    ? [h(View, { wrap: false, key: "adic" }, h(Text, { style: S.subsec }, "Servicios Adicionales (opcionales, no incluidos en el subtotal)"), tablaItems(d.adicionales, "adic"))]
    : [];

  const opcionales = d.opcionales.length
    ? [
        h(Text, { key: "opc-t", style: S.subsec }, "Servicios Opcionales"),
        ...d.opcionales.map((it, i) =>
          h(
            View,
            { key: `opc${i}`, style: { flexDirection: "row", paddingLeft: 2 } },
            h(Text, { style: { ...S.bul, width: 12 } }, "•"),
            h(Text, { style: { ...S.bul, flex: 1 } }, `${it.desc} — `, h(Text, { style: { fontWeight: 700 } }, money(it.monto)), `${it.unidad ? ` ${it.unidad}` : ""}.`),
          ),
        ),
      ]
    : [];

  const canonBullet = d.renovacion
    ? [
        h(Text, { key: "b", style: { fontWeight: 700 } }, "Canon locativo:"),
        ` el valor cotizado corresponde al `,
        h(Text, { key: "pm", style: { fontWeight: 700 } }, "primer mes"),
        ` de servicio e incluye ${d.renovacion.incluyePrimerMes ?? "el armado, el desarme, los traslados y los costos operativos"}. Las `,
        h(Text, { key: "rn", style: { fontWeight: 700 } }, "renovaciones de alquiler"),
        ` de los meses subsiguientes se facturan al ${d.renovacion.pct.toLocaleString("es-AR")}% del valor del primer mes, es decir `,
        h(Text, { key: "mt", style: { fontWeight: 700 } }, `${money(d.renovacion.monto)} + IVA`),
        " por mes.",
      ]
    : [
        h(Text, { key: "b", style: { fontWeight: 700 } }, "Canon locativo:"),
        ` el precio base del alquiler es de ${money(d.totales.subtotal)} + IVA por un período de ${d.periodoDias} (${enLetras(d.periodoDias)}) días corridos o fracción menor.`,
      ];

  const condiciones: ReactNode[][] = [
    canonBullet,
    ...(d.actualizacionCac
      ? [[
          h(Text, { key: "b", style: { fontWeight: 700 } }, "Actualización:"),
          " el canon se ajusta de forma automática y mensual aplicando la variación del Índice del Costo de la Construcción de la Cámara Argentina de la Construcción (CAC), tomando como base el último índice publicado a la fecha de aceptación de la oferta.",
        ]]
      : []),
    [
      h(Text, { key: "b", style: { fontWeight: 700 } }, "Forma de pago:"),
      ` ${d.formaPago?.trim() || "50% de anticipo a la aceptación de la propuesta para iniciar la gestión y 50% restante a la finalización de las tareas de montaje, previo al inicio del uso de las estructuras."}`,
    ],
    [h(Text, { key: "b", style: { fontWeight: 700 } }, "Impuestos:"), " todos los valores expresados en esta oferta NO incluyen el IVA."],
    [
      h(Text, { key: "b", style: { fontWeight: 700 } }, "Validez de la oferta:"),
      ` ${d.validezDias} (${enLetras(d.validezDias)}) días corridos desde su emisión (válida hasta el ${fechaLarga(venc)}); transcurrido dicho plazo, las condiciones podrán ser revisadas.`,
    ],
    [
      h(Text, { key: "b", style: { fontWeight: 700 } }, "Plazo de montaje:"),
      ` el inicio de las tareas se estima en ${d.plazoInicioDiasHabiles} (${enLetras(d.plazoInicioDiasHabiles)}) días hábiles a partir de la acreditación del anticipo y de la habilitación del personal de ABA por parte del cliente.`,
    ],
  ];

  return h(
    Document,
    { title: `Propuesta ${numero}`, author: "Andamios Buenos Aires", creator: "AndamiosOS" },
    h(
      Page,
      { size: "A4", style: { paddingTop: HEADER_H + 14, paddingBottom: FRAME_BOT, paddingLeft: LM, paddingRight: RM, fontFamily: "Poppins" } },
      h(Membrete),
      ...(d.borrador ? [h(MarcaBorrador, { key: "marca" })] : []),
      cabecera,
      h(View, { style: { marginTop: 8, borderBottomWidth: 0.7, borderBottomColor: LINE } }),
      info,
      h(View, { style: { height: 6 } }),
      h(Text, { style: S.sec }, "Sección 1: Alcance de la propuesta"),
      h(Text, { style: S.body }, ...rich(d.seccion1.trim())),
      h(Text, { style: S.sec }, "Sección 2: Anexo Técnico"),
      ...seccion2,
      ...graficos,
      oferta,
      ...adicionales,
      ...opcionales,
      h(Text, { style: S.sec }, "Condiciones Económicas"),
      ...condiciones.map((partes, i) =>
        h(
          View,
          { key: `cond${i}`, style: { flexDirection: "row", paddingLeft: 2 } },
          h(Text, { style: { ...S.bul, width: 12 } }, "•"),
          h(Text, { style: { ...S.bul, flex: 1 } }, ...partes),
        ),
      ),
      h(Text, { style: S.sec }, "Aclaraciones Importantes"),
      h(Text, { style: S.body }, d.aclaraciones?.trim() || ACLARACIONES_DEFAULT),
      // El cierre y la firma viajan juntos: una firma sola en la última hoja parece un error.
      h(
        View,
        { wrap: false },
        h(View, { style: { height: 12 } }),
        h(Text, { style: S.body }, "Aguardamos su confirmación para proceder con la coordinación de los trabajos. Sin otro particular, le saluda atentamente."),
        h(View, { style: { height: 16 } }),
        h(Text, { style: S.firm }, "Oficina Técnico-Comercial"),
        h(Text, { style: S.firmsub }, "Andamios Buenos Aires"),
      ),
    ),
  );
}

export async function generarPdfPropuesta(datos: DatosPropuesta): Promise<Buffer> {
  return renderToBuffer(Propuesta(datos) as Parameters<typeof renderToBuffer>[0]);
}

/** "Propuesta Técnico-Económica N° S02612 - CLIENTE - DIRECCIÓN - REFERENCIA.pdf" (convención de la skill). */
export function nombreArchivoPropuesta(numero: string | null, cliente: string, obra: string, referencia: string): string {
  const limpio = (s: string) => s.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim();
  return `${limpio(`Propuesta Técnico-Económica N° ${numero ?? "BORRADOR"} - ${cliente} - ${obra} - ${referencia}`)}.pdf`;
}
