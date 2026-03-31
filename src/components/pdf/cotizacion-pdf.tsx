"use client";

import {
  Document, Page, Text, View, StyleSheet, Image,
} from "@react-pdf/renderer";
import type { Cotizacion, CotizacionItem } from "@/hooks/use-cotizaciones";

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: "Helvetica", color: "#1a1a1a" },
  header: { flexDirection: "row", justifyContent: "space-between", marginBottom: 30 },
  logo: { fontSize: 20, fontWeight: "bold", fontFamily: "Helvetica-Bold" },
  logoAccent: { color: "#f59e0b" },
  logoImage: { height: 40, maxWidth: 160, objectFit: "contain" },
  empresaInfo: { marginTop: 4, color: "#666", fontSize: 8, lineHeight: 1.4 },
  headerRight: { textAlign: "right" },
  codigo: { fontSize: 14, fontWeight: "bold", fontFamily: "Helvetica-Bold" },
  label: { color: "#666", fontSize: 8, marginBottom: 2 },
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 12, fontWeight: "bold", fontFamily: "Helvetica-Bold", marginBottom: 8, color: "#333", borderBottom: "1 solid #e5e5e5", paddingBottom: 4 },
  row: { flexDirection: "row", justifyContent: "space-between", marginBottom: 3 },
  table: { marginTop: 8 },
  tableHeader: { flexDirection: "row", backgroundColor: "#f5f5f5", padding: 6, borderBottom: "1 solid #ddd" },
  tableRow: { flexDirection: "row", padding: 6, borderBottom: "1 solid #eee" },
  colTipo: { width: "15%" },
  colConcepto: { width: "35%" },
  colCant: { width: "10%", textAlign: "right" },
  colUnit: { width: "10%" },
  colPrecio: { width: "15%", textAlign: "right" },
  colSubtotal: { width: "15%", textAlign: "right" },
  bold: { fontFamily: "Helvetica-Bold" },
  totals: { marginTop: 12, alignItems: "flex-end" },
  totalRow: { flexDirection: "row", justifyContent: "space-between", width: 200, marginBottom: 3 },
  totalLabel: { color: "#666" },
  totalValue: { fontFamily: "Helvetica-Bold" },
  grandTotal: { fontSize: 14, color: "#f59e0b", fontFamily: "Helvetica-Bold" },
  conditions: { fontSize: 8, color: "#666", lineHeight: 1.5 },
  footer: { position: "absolute", bottom: 30, left: 40, right: 40, textAlign: "center", fontSize: 8, color: "#999", borderTop: "1 solid #eee", paddingTop: 8 },
});

const TIPO_LABELS: Record<string, string> = {
  alquiler_mensual: "Alquiler", alquiler_fraccion: "Alquiler fracción",
  montaje: "Montaje", desarme: "Desarme",
  transporte: "Transporte", flete: "Flete", permiso: "Permiso", ingenieria: "Ingenieria",
  extra: "Extra", descuento: "Descuento",
};

export type EmpresaData = {
  nombre?: string;
  cuit?: string;
  direccion?: string;
  telefono?: string;
  email?: string;
  web?: string;
  logo_url?: string;
};

interface Props {
  cotizacion: Cotizacion;
  items: CotizacionItem[];
  clienteNombre?: string;
  empresa?: EmpresaData;
}

export function CotizacionPDF({ cotizacion, items, clienteNombre, empresa }: Props) {
  const empresaNombre = empresa?.nombre || "Andamios Buenos Aires";

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            {empresa?.logo_url ? (
              <Image src={empresa.logo_url} style={styles.logoImage} />
            ) : (
              <Text style={styles.logo}>
                Andamios<Text style={styles.logoAccent}>OS</Text>
              </Text>
            )}
            <View style={styles.empresaInfo}>
              <Text>{empresaNombre}</Text>
              {empresa?.cuit && <Text>CUIT: {empresa.cuit}</Text>}
              {empresa?.direccion && <Text>{empresa.direccion}</Text>}
              {empresa?.telefono && <Text>Tel: {empresa.telefono}</Text>}
              {empresa?.email && <Text>{empresa.email}</Text>}
              {empresa?.web && <Text>{empresa.web}</Text>}
            </View>
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.codigo}>{cotizacion.codigo}</Text>
            <Text style={styles.label}>Cotizacion</Text>
            <Text style={{ marginTop: 6 }}>Fecha: {cotizacion.fecha_emision}</Text>
            <Text>Validez: {cotizacion.validez_dias} dias</Text>
            {cotizacion.fecha_vencimiento && (
              <Text>Vence: {cotizacion.fecha_vencimiento}</Text>
            )}
          </View>
        </View>

        {/* Cliente */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Cliente</Text>
          <Text style={styles.bold}>{clienteNombre || "—"}</Text>
        </View>

        {/* Servicio */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{cotizacion.titulo}</Text>
          {cotizacion.descripcion_servicio && (
            <Text style={{ lineHeight: 1.5 }}>{cotizacion.descripcion_servicio}</Text>
          )}
          {cotizacion.plazo_alquiler_meses && (
            <View style={[styles.row, { marginTop: 8 }]}>
              <Text style={styles.label}>Plazo de alquiler:</Text>
              <Text>{cotizacion.plazo_alquiler_meses} meses</Text>
            </View>
          )}
        </View>

        {/* Items */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Detalle</Text>
          <View style={styles.table}>
            <View style={styles.tableHeader}>
              <Text style={[styles.colTipo, styles.bold]}>Tipo</Text>
              <Text style={[styles.colConcepto, styles.bold]}>Concepto</Text>
              <Text style={[styles.colCant, styles.bold]}>Cant.</Text>
              <Text style={[styles.colUnit, styles.bold]}>Unidad</Text>
              <Text style={[styles.colPrecio, styles.bold]}>P. Unit.</Text>
              <Text style={[styles.colSubtotal, styles.bold]}>Subtotal</Text>
            </View>
            {items.map((item, i) => (
              <View style={styles.tableRow} key={i}>
                <Text style={styles.colTipo}>{TIPO_LABELS[item.tipo] || item.tipo}</Text>
                <Text style={styles.colConcepto}>{item.concepto}</Text>
                <Text style={styles.colCant}>{item.cantidad}</Text>
                <Text style={styles.colUnit}>{item.unidad}</Text>
                <Text style={styles.colPrecio}>${Number(item.precio_unitario).toLocaleString()}</Text>
                <Text style={styles.colSubtotal}>${Number(item.subtotal).toLocaleString()}</Text>
              </View>
            ))}
          </View>

          {/* Totals */}
          <View style={styles.totals}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Subtotal:</Text>
              <Text style={styles.totalValue}>${Number(cotizacion.subtotal).toLocaleString()}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>IVA ({cotizacion.iva_porcentaje}%):</Text>
              <Text style={styles.totalValue}>${Number(cotizacion.iva_monto).toLocaleString()}</Text>
            </View>
            <View style={[styles.totalRow, { marginTop: 4, borderTop: "1 solid #ddd", paddingTop: 4 }]}>
              <Text style={styles.grandTotal}>TOTAL:</Text>
              <Text style={styles.grandTotal}>${Number(cotizacion.total).toLocaleString()}</Text>
            </View>
          </View>
        </View>

        {/* Condiciones */}
        {cotizacion.condiciones && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Condiciones</Text>
            <Text style={styles.conditions}>{cotizacion.condiciones}</Text>
          </View>
        )}

        {cotizacion.condicion_pago && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Condicion de pago</Text>
            <Text>{cotizacion.condicion_pago}</Text>
          </View>
        )}

        {/* Footer */}
        <View style={styles.footer}>
          <Text>{empresaNombre} — {cotizacion.codigo} — Generado por AndamiosOS</Text>
        </View>
      </Page>
    </Document>
  );
}
