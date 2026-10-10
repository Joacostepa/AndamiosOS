// El PDF de las etiquetas. Se importa con import() recién al apretar "Descargar PDF":
// @react-pdf/renderer pesa y la pantalla no lo necesita para la vista previa.
//
// MISMAS CUENTAS QUE LA VISTA PREVIA: la grilla, la posición de cada celda y el path del QR
// salen de src/lib/panol/etiquetas.ts. Acá sólo se pasa de milímetros a puntos y se dibuja.
// El QR va como vector (un <Path>), no como imagen: a 25 mm una imagen se pixela.
//
// Los colores son de la hoja impresa (negro sobre blanco, guía de corte gris), no de la
// pantalla: por eso van fijos y no por tokens.

import { Document, Page, Path, Rect, Svg, Text, View, pdf } from "@react-pdf/renderer";
import { mmAPt, posicion, type Grilla, type Tamano } from "@/lib/panol/etiquetas";

export type EtiquetaPdf = { codigo: string; nombre: string; path: string; lado: number };

type Opciones = { grilla: Grilla; tamano: Tamano; separacion: number; guias: boolean; titulo: string };

const LETRA: Record<Tamano, { codigo: number; nombre: number }> = {
  25: { codigo: 9, nombre: 5.5 },
  50: { codigo: 15, nombre: 8 },
};

function Hoja({ etiquetas, o }: { etiquetas: (EtiquetaPdf | null)[]; o: Opciones }) {
  const g = o.grilla;
  const letra = LETRA[o.tamano];
  return (
    <Page size="A4" style={{ position: "relative", backgroundColor: "#FFFFFF" }}>
      {etiquetas.map((e, i) => {
        if (!e) return null;
        const p = posicion(g, i, o.separacion);
        return (
          <View
            key={`${e.codigo}-${i}`}
            style={{
              position: "absolute",
              left: mmAPt(p.x),
              top: mmAPt(p.y),
              width: mmAPt(g.celdaAncho),
              height: mmAPt(g.celdaAlto),
              paddingTop: mmAPt(g.relleno),
              alignItems: "center",
              ...(o.guias ? { borderWidth: 0.4, borderStyle: "dashed", borderColor: "#BDBDBD" } : {}),
            }}
          >
            <Svg width={mmAPt(o.tamano)} height={mmAPt(o.tamano)} viewBox={`0 0 ${e.lado} ${e.lado}`}>
              <Rect x={0} y={0} width={e.lado} height={e.lado} fill="#FFFFFF" />
              <Path d={e.path} fill="#000000" />
            </Svg>
            <Text style={{ fontFamily: "Courier-Bold", fontSize: letra.codigo, letterSpacing: 0.6, color: "#000000", marginTop: 1 }}>
              {e.codigo}
            </Text>
            <Text style={{ fontFamily: "Helvetica", fontSize: letra.nombre, color: "#333333", maxWidth: mmAPt(g.celdaAncho - 1), textAlign: "center" }}>
              {e.nombre}
            </Text>
          </View>
        );
      })}
    </Page>
  );
}

export async function generarPdf(hojas: (EtiquetaPdf | null)[][], o: Opciones): Promise<Blob> {
  const doc = (
    <Document title={o.titulo} author="AndamiosOS · Pañol">
      {hojas.map((h, i) => <Hoja key={i} etiquetas={h} o={o} />)}
    </Document>
  );
  return pdf(doc).toBlob();
}
