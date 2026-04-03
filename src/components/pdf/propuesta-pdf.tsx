"use client";

import {
  Document, Page, Text, View, StyleSheet, Image,
} from "@react-pdf/renderer";
import type { Cotizacion, CotizacionItem } from "@/hooks/use-cotizaciones";
import type { EmpresaData } from "./cotizacion-pdf";

const s = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: "Helvetica", color: "#1a1a1a" },
  // Header
  header: { flexDirection: "row", justifyContent: "space-between", marginBottom: 10, borderBottom: "2 solid #f59e0b", paddingBottom: 10 },
  logoImage: { height: 45, maxWidth: 170, objectFit: "contain" },
  logo: { fontSize: 22, fontWeight: "bold", fontFamily: "Helvetica-Bold" },
  logoAccent: { color: "#f59e0b" },
  empresaInfo: { textAlign: "right", fontSize: 8, color: "#666", lineHeight: 1.5 },
  // Meta
  meta: { marginBottom: 20, marginTop: 15 },
  metaTitle: { fontSize: 10, color: "#666" },
  metaCodigo: { fontSize: 14, fontFamily: "Helvetica-Bold", marginBottom: 4 },
  metaRow: { flexDirection: "row", marginBottom: 2 },
  metaLabel: { color: "#666", fontSize: 9, width: 70 },
  metaValue: { fontSize: 9 },
  // Sections
  section: { marginBottom: 18 },
  sectionTitle: { fontSize: 13, fontFamily: "Helvetica-Bold", marginBottom: 8, color: "#1a1a1a", borderBottom: "1 solid #e5e5e5", paddingBottom: 4 },
  subTitle: { fontSize: 11, fontFamily: "Helvetica-Bold", marginBottom: 4, marginTop: 8 },
  bodyText: { fontSize: 10, lineHeight: 1.6, color: "#333" },
  bullet: { flexDirection: "row", marginBottom: 3, paddingLeft: 10 },
  bulletDot: { width: 8, fontSize: 10 },
  bulletText: { flex: 1, fontSize: 10, lineHeight: 1.5, color: "#333" },
  // Oferta
  ofertaItem: { marginBottom: 10 },
  ofertaLabel: { fontSize: 10, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  ofertaDesc: { fontSize: 9, color: "#555", lineHeight: 1.4, marginBottom: 2 },
  ofertaValor: { fontSize: 12, fontFamily: "Helvetica-Bold", color: "#f59e0b" },
  // Totals
  totalBox: { marginTop: 10, padding: 10, backgroundColor: "#f9f9f9", borderRadius: 4 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 3 },
  totalLabel: { fontSize: 10, color: "#666" },
  totalValue: { fontSize: 10, fontFamily: "Helvetica-Bold" },
  grandTotalRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 6, paddingTop: 6, borderTop: "1 solid #ddd" },
  grandTotalLabel: { fontSize: 14, fontFamily: "Helvetica-Bold", color: "#f59e0b" },
  grandTotalValue: { fontSize: 14, fontFamily: "Helvetica-Bold", color: "#f59e0b" },
  // Conditions
  conditionsText: { fontSize: 8, color: "#666", lineHeight: 1.5 },
  // Image
  refImage: { width: "100%", maxHeight: 250, objectFit: "contain", marginBottom: 10, borderRadius: 4 },
  // Footer
  footer: { position: "absolute", bottom: 25, left: 40, right: 40, textAlign: "center", fontSize: 8, color: "#999", borderTop: "1 solid #eee", paddingTop: 6 },
  bold: { fontFamily: "Helvetica-Bold" },
});

function fmtNum(n: number | string): string {
  return Number(n).toLocaleString("de-DE");
}

const MATERIAL_LABELS: Record<string, string> = {
  multidireccional: "Sistema de Andamio Multidireccional certificado",
  bastidor_prearmado: "Sistema de Bastidor Pre-armado",
  mixto: "Sistema Mixto (Multidireccional + Bastidor)",
};

interface Props {
  cotizacion: Cotizacion;
  items: CotizacionItem[];
  clienteNombre?: string;
  empresa?: EmpresaData;
  imageUrls?: string[];
}

export function PropuestaPDF({ cotizacion, items, clienteNombre, empresa, imageUrls }: Props) {
  const empresaNombre = empresa?.nombre || "Andamios Buenos Aires";
  const meta = (cotizacion.metadata || {}) as Record<string, any>;
  const incluyeIva = meta.incluye_iva;
  const validezDias = meta.validez_oferta_dias || cotizacion.validez_dias || 15;

  // Classify items
  const alquilerItem = items.find((i) => i.tipo === "alquiler_mensual");
  const montajeItem = items.find((i) => i.tipo === "montaje");
  const desarmeItem = items.find((i) => i.tipo === "desarme");
  const ingenieriaItem = items.find((i) => i.tipo === "ingenieria");
  const transporteItem = items.find((i) => i.tipo === "transporte");
  const permisoItem = items.find((i) => i.tipo === "permiso");
  const extraItems = items.filter((i) => i.tipo === "extra");

  const subtotal = items.reduce((sum, i) => sum + Number(i.subtotal), 0);
  const ivaPct = incluyeIva ? 0 : (cotizacion.iva_porcentaje || 21);
  const ivaMonto = subtotal * (ivaPct / 100);
  const total = subtotal + ivaMonto;

  return (
    <Document>
      {/* PAGE 1: Header + Cliente + Alcances + Anexo Técnico */}
      <Page size="A4" style={s.page}>
        {/* Header */}
        <View style={s.header}>
          <View>
            {empresa?.logo_url ? (
              <Image src={empresa.logo_url} style={s.logoImage} />
            ) : (
              <Text style={s.logo}>Andamios<Text style={s.logoAccent}>OS</Text></Text>
            )}
          </View>
          <View style={s.empresaInfo}>
            <Text>{empresaNombre}</Text>
            {empresa?.direccion && <Text>{empresa.direccion}</Text>}
            {empresa?.telefono && <Text>Tel: {empresa.telefono}</Text>}
            {empresa?.email && <Text>{empresa.email}</Text>}
            {empresa?.web && <Text>{empresa.web}</Text>}
            {empresa?.cuit && <Text style={s.bold}>CUIT: {empresa.cuit}</Text>}
          </View>
        </View>

        {/* Meta */}
        <View style={s.meta}>
          <Text style={s.metaTitle}>Propuesta Técnica-Económica</Text>
          <Text style={s.metaCodigo}>{cotizacion.codigo}</Text>
          <View style={s.metaRow}><Text style={s.metaLabel}>Fecha:</Text><Text style={s.metaValue}>{cotizacion.fecha_emision}</Text></View>
          <View style={s.metaRow}><Text style={s.metaLabel}>Cliente:</Text><Text style={[s.metaValue, s.bold]}>{clienteNombre || "—"}</Text></View>
          {meta.ubicacion ? (
            <View style={s.metaRow}><Text style={s.metaLabel}>Obra:</Text><Text style={s.metaValue}>{meta.ubicacion as string}</Text></View>
          ) : null}
        </View>

        {/* Sección 1: Alcances */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Sección 1: Detalle breve de los alcances del trabajo</Text>
          {cotizacion.descripcion_servicio ? (
            <Text style={s.bodyText}>{cotizacion.descripcion_servicio}</Text>
          ) : (
            <Text style={s.bodyText}>Servicio de alquiler, montaje y desmontaje de estructura de andamio.</Text>
          )}
        </View>

        {/* Sección 2: Anexo Técnico */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Sección 2: Anexo Técnico</Text>

          {meta.descripcion_tecnica ? (
            <Text style={s.bodyText}>{meta.descripcion_tecnica}</Text>
          ) : (
            <>
              <Text style={s.subTitle}>1. Descripción de la Estructura</Text>
              <Text style={s.bodyText}>
                La estructura se diseñará y montará utilizando {MATERIAL_LABELS[meta.tipo_material] || "Sistema de Andamio certificado"}.
              </Text>

              {meta.tipo_producto_fachada === "andamio_completo" && meta.fachada_base && meta.fachada_altura && (
                <View style={{ marginTop: 6 }}>
                  <View style={s.bullet}><Text style={s.bulletDot}>•</Text><Text style={s.bulletText}>Dimensiones: {meta.fachada_base}m de frente x {meta.fachada_altura}m de altura ({Number(meta.fachada_base) * Number(meta.fachada_altura)} m²)</Text></View>
                  {meta.fachada_profundidad && <View style={s.bullet}><Text style={s.bulletDot}>•</Text><Text style={s.bulletText}>Profundidad: {meta.fachada_profundidad}m</Text></View>}
                  {meta.niveles_trabajo && <View style={s.bullet}><Text style={s.bulletDot}>•</Text><Text style={s.bulletText}>Niveles de trabajo: {meta.niveles_trabajo}</Text></View>}
                  {meta.tipo_escalera && <View style={s.bullet}><Text style={s.bulletDot}>•</Text><Text style={s.bulletText}>Escalera: {meta.tipo_escalera === "escotilla" ? "Escalera escotilla" : "Escalera interna"}</Text></View>}
                  {meta.barandas_seguridad && <View style={s.bullet}><Text style={s.bulletDot}>•</Text><Text style={s.bulletText}>Barandas de seguridad perimetrales</Text></View>}
                  {meta.rodapies && <View style={s.bullet}><Text style={s.bulletDot}>•</Text><Text style={s.bulletText}>Rodapiés en todos los niveles</Text></View>}
                  {meta.alambre_concertina && <View style={s.bullet}><Text style={s.bulletDot}>•</Text><Text style={s.bulletText}>Alambre concertina perimetral de seguridad</Text></View>}
                </View>
              )}

              {meta.tipo_producto_fachada === "bandeja_peatonal" && meta.metros_lineales && (
                <View style={{ marginTop: 6 }}>
                  <View style={s.bullet}><Text style={s.bulletDot}>•</Text><Text style={s.bulletText}>Desarrollo lineal: {meta.metros_lineales} metros</Text></View>
                  {meta.altura_bandeja && <View style={s.bullet}><Text style={s.bulletDot}>•</Text><Text style={s.bulletText}>Altura de bandeja: {meta.altura_bandeja}m</Text></View>}
                  {meta.bandeja_profundidad && <View style={s.bullet}><Text style={s.bulletDot}>•</Text><Text style={s.bulletText}>Profundidad: {meta.bandeja_profundidad}m</Text></View>}
                  {meta.niveles_contencion && <View style={s.bullet}><Text style={s.bulletDot}>•</Text><Text style={s.bulletText}>Niveles de contención: {meta.niveles_contencion}</Text></View>}
                </View>
              )}
            </>
          )}

          {/* Plazos de ejecución */}
          {(cotizacion.plazo_alquiler_meses || meta.tiempo_armado || meta.tiempo_desarme) && (
            <View style={{ marginTop: 10 }}>
              <Text style={s.subTitle}>Plazos de Ejecución</Text>
              {meta.tiempo_armado && (
                <View style={s.bullet}><Text style={s.bulletDot}>•</Text><Text style={s.bulletText}>Tiempo de Armado: Se estima {meta.tiempo_armado} jornada{Number(meta.tiempo_armado) !== 1 ? "s" : ""} de trabajo.</Text></View>
              )}
              {meta.tiempo_desarme && (
                <View style={s.bullet}><Text style={s.bulletDot}>•</Text><Text style={s.bulletText}>Tiempo de Desarme: Se estima {meta.tiempo_desarme} jornada{Number(meta.tiempo_desarme) !== 1 ? "s" : ""} de trabajo.</Text></View>
              )}
              {cotizacion.plazo_alquiler_meses && (
                <View style={s.bullet}><Text style={s.bulletDot}>•</Text><Text style={s.bulletText}>Período de alquiler: {cotizacion.plazo_alquiler_meses} días (fracción mínima 30 días)</Text></View>
              )}
            </View>
          )}
        </View>

        {/* Imágenes de referencia */}
        {imageUrls && imageUrls.length > 0 && (
          <View style={s.section} break>
            <Text style={s.sectionTitle}>Representación gráfica del proyecto</Text>
            {imageUrls.map((url, i) => (
              <Image
                key={i}
                src={{ uri: url, method: "GET", headers: { "Cache-Control": "no-cache" } }}
                style={s.refImage}
              />
            ))}
          </View>
        )}

        <View style={s.footer}>
          <Text>{empresaNombre} — {cotizacion.codigo}</Text>
        </View>
      </Page>

      {/* PAGE 2: Oferta Económica + Condiciones */}
      <Page size="A4" style={s.page}>
        {/* Header repetido */}
        <View style={[s.header, { marginBottom: 20 }]}>
          <View>
            {empresa?.logo_url ? (
              <Image src={empresa.logo_url} style={s.logoImage} />
            ) : (
              <Text style={s.logo}>Andamios<Text style={s.logoAccent}>OS</Text></Text>
            )}
          </View>
          <View style={s.empresaInfo}>
            <Text>{empresaNombre}</Text>
            {empresa?.cuit && <Text style={s.bold}>CUIT: {empresa.cuit}</Text>}
          </View>
        </View>

        {/* Sección 3: Oferta Económica */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Sección 3: Oferta Económica</Text>

          {alquilerItem && (
            <View style={s.ofertaItem}>
              <Text style={s.ofertaLabel}>Valor del Alquiler del Material (Canon Locativo)</Text>
              <Text style={s.ofertaDesc}>{alquilerItem.concepto}</Text>
              <Text style={s.ofertaValor}>Valor: ${fmtNum(alquilerItem.subtotal)}</Text>
            </View>
          )}

          {montajeItem && Number(montajeItem.precio_unitario) > 0 && (
            <View style={s.ofertaItem}>
              <Text style={s.ofertaLabel}>Servicio de Mano de Obra (Armado y Desarme)</Text>
              <Text style={s.ofertaDesc}>
                Comprende las tareas de montaje{desarmeItem ? " y posterior desmontaje" : ""}, incluyendo traslados de personal, carga, descarga y costos operativos.
              </Text>
              <Text style={s.ofertaValor}>
                Valor: ${fmtNum(Number(montajeItem.subtotal) + (desarmeItem ? Number(desarmeItem.subtotal) : 0))}
              </Text>
            </View>
          )}

          {ingenieriaItem && (
            <View style={s.ofertaItem}>
              <Text style={s.ofertaLabel}>Servicio de Ingeniería</Text>
              <Text style={s.ofertaDesc}>Incluye memoria de cálculo, proyecto, planos y firma de profesional matriculado.</Text>
              <Text style={s.ofertaValor}>Valor: ${fmtNum(ingenieriaItem.subtotal)}{!incluyeIva ? " + IVA" : ""}</Text>
            </View>
          )}

          {permisoItem && (
            <View style={s.ofertaItem}>
              <Text style={s.ofertaLabel}>Gestoría de Permiso Municipal</Text>
              <Text style={s.ofertaDesc}>Gestión y tramitación del permiso de ocupación de vía pública.</Text>
              <Text style={s.ofertaValor}>Valor: ${fmtNum(permisoItem.subtotal)}</Text>
            </View>
          )}

          {transporteItem && Number(transporteItem.precio_unitario) > 0 && (
            <View style={s.ofertaItem}>
              <Text style={s.ofertaLabel}>Transporte</Text>
              <Text style={s.ofertaDesc}>Flete de entrega y retiro de materiales.</Text>
              <Text style={s.ofertaValor}>Valor: ${fmtNum(transporteItem.subtotal)}</Text>
            </View>
          )}

          {extraItems.map((item, i) => (
            <View style={s.ofertaItem} key={i}>
              <Text style={s.ofertaLabel}>{item.concepto}</Text>
              {item.detalle && <Text style={s.ofertaDesc}>{item.detalle}</Text>}
              <Text style={s.ofertaValor}>Valor: ${fmtNum(item.subtotal)}</Text>
            </View>
          ))}

          {/* Totals */}
          <View style={s.totalBox}>
            <View style={s.totalRow}>
              <Text style={s.totalLabel}>Subtotal:</Text>
              <Text style={s.totalValue}>${fmtNum(subtotal)}</Text>
            </View>
            {!incluyeIva && (
              <View style={s.totalRow}>
                <Text style={s.totalLabel}>IVA ({ivaPct}%):</Text>
                <Text style={s.totalValue}>${fmtNum(ivaMonto)}</Text>
              </View>
            )}
            <View style={s.grandTotalRow}>
              <Text style={s.grandTotalLabel}>TOTAL:</Text>
              <Text style={s.grandTotalValue}>${fmtNum(total)}</Text>
            </View>
          </View>

          <Text style={{ fontSize: 8, color: "#888", marginTop: 6 }}>
            {incluyeIva ? "Todos los valores incluyen IVA." : "Todos los valores expresados NO incluyen IVA."}
          </Text>
        </View>

        {/* Condiciones Económicas */}
        {cotizacion.condicion_pago && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Condiciones Económicas</Text>
            <View style={s.bullet}><Text style={s.bulletDot}>•</Text><Text style={s.bulletText}>Forma de Pago: {cotizacion.condicion_pago}</Text></View>
            <View style={s.bullet}><Text style={s.bulletDot}>•</Text><Text style={s.bulletText}>Validez de la Oferta: {validezDias} días corridos desde la fecha de emisión.</Text></View>
          </View>
        )}

        {/* Condiciones Generales */}
        {cotizacion.condiciones && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Condiciones Generales</Text>
            <Text style={s.conditionsText}>{cotizacion.condiciones}</Text>
          </View>
        )}

        {/* Firma */}
        <View style={{ marginTop: 20 }}>
          <Text style={{ fontSize: 9, color: "#666" }}>Aguardamos su confirmación para proceder con la coordinación de los trabajos.</Text>
          <Text style={{ fontSize: 9, color: "#666", marginTop: 4 }}>Sin otro particular, le saluda atentamente.</Text>
          <Text style={{ fontSize: 10, fontFamily: "Helvetica-Bold", marginTop: 15 }}>{empresaNombre}</Text>
        </View>

        <View style={s.footer}>
          <Text>{empresaNombre} — {cotizacion.codigo} — Propuesta Técnica-Económica</Text>
        </View>
      </Page>
    </Document>
  );
}
