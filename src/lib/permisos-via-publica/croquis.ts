import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import type { Manzana } from "./catastro";
import type { TipoAndamio } from "./informe-tecnico";

// Croquis de implantación: las láminas apaisadas del Canva "Croquis Implantación del Andamio"
// completas para una obra (JS, 2026-09-15; Hougassian al tanto).
//
//   portada · plancheta de la manzana · sector a ocupar (render con medidas) · vista frontal
//
// LA PLANCHETA SE DIBUJA con la geometría oficial de EPOK (manzana, lotes numerados, calles,
// el lote de la obra en naranja), como ya se presentó en Gorriti 6009: las planchetas
// escaneadas no están publicadas.
//
// Las cotas se dibujan encima del render en posiciones relativas medidas sobre el croquis de
// Av. Belgrano 2352 (renders sin cotas del Canva).
//
// Sin imports de alias: lo corre también un script de prueba fuera de Next.

export type PlantillasCroquis = {
  foto: Uint8Array;
  logoPortada: Uint8Array;
  logo: Uint8Array;
  firma: Uint8Array;
  renderPantalla: Uint8Array;
  frentePantalla: Uint8Array;
  renderEstructura: Uint8Array;
  renderTorre: Uint8Array;
};

export type DatosCroquis = { direccion: string; tipo: TipoAndamio; base: number; alto: number; manzana: Manzana | null };

const W = 960;
const H = 540;
const FOTO = 290;
const X0 = FOTO + 40;
const X1 = W - 30;
const TINTA = rgb(0.1, 0.1, 0.1);
const NARANJA = rgb(0.9, 0.49, 0.18);
const ALTO_PANTALLA = 3;
const ANCHO = 1.3;
const m = (n: number) => n.toFixed(2);
const limpio = (t: string) => t.replace(/[^\x00-\xFF–—‘’“”•…]/g, "");

type Img = Record<keyof PlantillasCroquis, PDFImage>;
type Fuentes = { normal: PDFFont; negrita: PDFFont };

function lamina(doc: PDFDocument, img: Img, f: Fuentes, o: { portada?: boolean } = {}): PDFPage {
  const p = doc.addPage([W, H]);
  const fw = (img.foto.width / img.foto.height) * H;
  p.drawImage(img.foto, { x: FOTO - fw, y: 0, width: fw, height: H });
  if (o.portada) return p;
  const lw = 100;
  p.drawImage(img.logo, { x: X1 - lw, y: H - 24 - (lw / img.logo.width) * img.logo.height, width: lw, height: (lw / img.logo.width) * img.logo.height });
  const sw = 92;
  const sh = (sw / img.firma.width) * img.firma.height;
  p.drawImage(img.firma, { x: X1 - sw - 8, y: 42, width: sw, height: sh });
  ["EDUARDO HOUGASSIAN", "ARQUITECTO", "MAT N 12658"].forEach((l, i) => {
    const w = f.normal.widthOfTextAtSize(l, 6.5);
    p.drawText(l, { x: X1 - 8 - sw / 2 - w / 2, y: 33 - i * 8.5, size: 6.5, font: f.normal, color: TINTA });
  });
  return p;
}

function titulo(p: PDFPage, f: Fuentes, texto: string, direccion: string) {
  p.drawText(limpio(texto), { x: X0, y: H - 78, size: 26, font: f.negrita, color: TINTA });
  p.drawText(limpio(`Dirección de obra: ${direccion}`), { x: X0 + 2, y: H - 106, size: 10.5, font: f.negrita, color: TINTA });
}

/** Encaja una imagen en una caja sin deformarla. Devuelve dónde quedó (y = borde superior). */
function encajar(p: PDFPage, img: PDFImage, caja: { x: number; y: number; w: number; h: number }) {
  const s = Math.min(caja.w / img.width, caja.h / img.height);
  const w = img.width * s;
  const h = img.height * s;
  const x = caja.x + (caja.w - w) / 2;
  const yAbajo = caja.y + (caja.h - h) / 2;
  p.drawImage(img, { x, y: yAbajo, width: w, height: h });
  return { x, arriba: yAbajo + h, w, h };
}

function cota(p: PDFPage, a: [number, number], b: [number, number]) {
  p.drawLine({ start: { x: a[0], y: a[1] }, end: { x: b[0], y: b[1] }, thickness: 1.6, color: TINTA });
  const ang = Math.atan2(b[1] - a[1], b[0] - a[0]) + Math.PI / 2;
  for (const q of [a, b]) {
    p.drawLine({ start: { x: q[0] - Math.cos(ang) * 5, y: q[1] - Math.sin(ang) * 5 }, end: { x: q[0] + Math.cos(ang) * 5, y: q[1] + Math.sin(ang) * 5 }, thickness: 1.6, color: TINTA });
  }
}

function portada(doc: PDFDocument, img: Img, f: Fuentes) {
  const p = lamina(doc, img, f, { portada: true });
  const lw = 250;
  const lh = (lw / img.logoPortada.width) * img.logoPortada.height;
  p.drawImage(img.logoPortada, { x: X0 + (X1 - X0 - lw) / 2, y: H - 90 - lh, width: lw, height: lh });
  const t = "Croquis de implantación";
  const w = f.negrita.widthOfTextAtSize(limpio(t), 24);
  const x = X0 + (X1 - X0 - w) / 2;
  p.drawText(limpio(t), { x, y: 250, size: 24, font: f.negrita, color: TINTA });
  p.drawLine({ start: { x, y: 246 }, end: { x: x + w, y: 246 }, thickness: 1.2, color: TINTA });
}

function plancheta(doc: PDFDocument, img: Img, f: Fuentes, d: DatosCroquis) {
  const p = lamina(doc, img, f);
  titulo(p, f, "Croquis de implantación", d.direccion);
  const caja = { x: X0, y: 40, w: X1 - X0 - 120, h: H - 170 };
  const lotes = d.manzana?.lotes ?? [];
  if (lotes.length === 0) {
    p.drawText("No se pudo obtener la plancheta de la manzana: hay que agregarla a mano.", { x: caja.x + 10, y: caja.y + caja.h / 2, size: 11, font: f.normal, color: rgb(0.7, 0.2, 0.1) });
    return;
  }

  // Proyección local en metros (equirectangular): a escala de manzana el error no se ve.
  const todos = lotes.flatMap((l) => l.anillo);
  const lat0 = todos.reduce((s, q) => s + q[1], 0) / todos.length;
  const lng0 = todos.reduce((s, q) => s + q[0], 0) / todos.length;
  const proy = ([lng, lat]: [number, number]): [number, number] => [(lng - lng0) * Math.cos((lat0 * Math.PI) / 180) * 111_320, (lat - lat0) * 110_540];
  const pts = todos.map(proy);
  const [minX, maxX] = [Math.min(...pts.map((q) => q[0])), Math.max(...pts.map((q) => q[0]))];
  const [minY, maxY] = [Math.min(...pts.map((q) => q[1])), Math.max(...pts.map((q) => q[1]))];
  const margen = 40;
  const s = Math.min((caja.w - margen * 2) / (maxX - minX), (caja.h - margen * 2) / (maxY - minY));
  const ox = caja.x + (caja.w - (maxX - minX) * s) / 2;
  const oy = caja.y + (caja.h - (maxY - minY) * s) / 2;
  const aPdf = (q: [number, number]): [number, number] => { const [x, y] = proy(q); return [ox + (x - minX) * s, oy + (y - minY) * s]; };

  const centros: { calles: string[]; c: [number, number] }[] = [];
  for (const lote of lotes) {
    const anillo = lote.anillo.map(aPdf);
    // drawSvgPath: origen arriba a la izquierda y la y crece hacia abajo.
    const path = anillo.map(([x, y], i) => `${i ? "L" : "M"} ${(x - caja.x).toFixed(2)} ${(caja.y + caja.h - y).toFixed(2)}`).join(" ") + " Z";
    p.drawSvgPath(path, { x: caja.x, y: caja.y + caja.h, borderColor: TINTA, borderWidth: 0.6, ...(lote.esObra ? { color: NARANJA } : {}) });
    const c: [number, number] = [anillo.reduce((a, q) => a + q[0], 0) / anillo.length, anillo.reduce((a, q) => a + q[1], 0) / anillo.length];
    const ancho = Math.max(...anillo.map((q) => q[0])) - Math.min(...anillo.map((q) => q[0]));
    const alto = Math.max(...anillo.map((q) => q[1])) - Math.min(...anillo.map((q) => q[1]));
    if (Math.min(ancho, alto) > 9) {
      const w = f.normal.widthOfTextAtSize(lote.numero, 7);
      p.drawText(lote.numero, { x: c[0] - w / 2, y: c[1] - 2.5, size: 7, font: f.normal, color: TINTA });
    }
    centros.push({ calles: lote.calles, c });
  }

  // Nombre de cada calle afuera de la manzana, del lado donde están sus puertas y alineado
  // con ese lado.
  const cm: [number, number] = [centros.reduce((a, q) => a + q.c[0], 0) / centros.length, centros.reduce((a, q) => a + q.c[1], 0) / centros.length];
  const contorno = todos.map(aPdf);
  const porCalle = new Map<string, [number, number][]>();
  for (const { calles, c } of centros) for (const calle of calles) porCalle.set(calle, [...(porCalle.get(calle) ?? []), c]);
  for (const [calle, cs] of porCalle) {
    const c: [number, number] = [cs.reduce((a, q) => a + q[0], 0) / cs.length, cs.reduce((a, q) => a + q[1], 0) / cs.length];
    let dir: [number, number] = [c[0] - cm[0], c[1] - cm[1]];
    const largo = Math.hypot(...dir) || 1;
    dir = [dir[0] / largo, dir[1] / largo];
    const alcance = Math.max(...contorno.map((q) => (q[0] - cm[0]) * dir[0] + (q[1] - cm[1]) * dir[1]));
    const pos: [number, number] = [cm[0] + dir[0] * (alcance + 16), cm[1] + dir[1] * (alcance + 16)];
    let ang = 0;
    if (cs.length >= 2) {
      const sxx = cs.reduce((a, q) => a + (q[0] - c[0]) ** 2, 0);
      const syy = cs.reduce((a, q) => a + (q[1] - c[1]) ** 2, 0);
      const sxy = cs.reduce((a, q) => a + (q[0] - c[0]) * (q[1] - c[1]), 0);
      ang = 0.5 * Math.atan2(2 * sxy, sxx - syy);
    } else {
      ang = Math.atan2(dir[1], dir[0]) + Math.PI / 2;
    }
    if (ang > Math.PI / 2) ang -= Math.PI;
    if (ang < -Math.PI / 2) ang += Math.PI;
    const nombre = limpio(calle.split(",")[0].replace(/\bAV\.?$/i, "").trim().toUpperCase());
    const w = f.negrita.widthOfTextAtSize(nombre, 9);
    p.drawText(nombre, { x: pos[0] - Math.cos(ang) * (w / 2), y: pos[1] - Math.sin(ang) * (w / 2), size: 9, font: f.negrita, color: TINTA, rotate: degrees((ang * 180) / Math.PI) });
  }
}

function sectorPantalla(doc: PDFDocument, img: Img, f: Fuentes, d: DatosCroquis) {
  const p = lamina(doc, img, f);
  titulo(p, f, "Sector a ocupar:", d.direccion);
  const r = encajar(p, img.renderPantalla, { x: X0 + 10, y: 60, w: X1 - X0 - 60, h: H - 190 });
  const en = (u: number, v: number): [number, number] => [r.x + u * r.w, r.arriba - v * r.h];
  const b1 = en(0.137, 0.52);
  const b2 = en(0.621, 0.96);
  cota(p, b1, b2);
  cota(p, en(0.86, 0.27), en(0.86, 0.78));
  cota(p, en(0.692, 0.96), en(0.789, 0.845));
  const ang = Math.atan2(b2[1] - b1[1], b2[0] - b1[0]);
  const base = `${m(d.base)} ml`;
  const bw = f.negrita.widthOfTextAtSize(base, 15);
  const [bx, by] = en(0.33, 0.83);
  p.drawText(base, { x: bx - Math.cos(ang) * (bw / 2), y: by - Math.sin(ang) * (bw / 2), size: 15, font: f.negrita, color: TINTA, rotate: degrees((ang * 180) / Math.PI) });
  const [ax, ay] = en(0.89, 0.54);
  p.drawText(`${m(ALTO_PANTALLA)} m`, { x: ax, y: ay, size: 15, font: f.negrita, color: TINTA });
  // El ancho va a la derecha de su cota, dentro del render: debajo chocaba con la firma.
  const [cx, cy] = en(0.8, 0.9);
  p.drawText(`${m(ANCHO)} m`, { x: cx, y: cy, size: 15, font: f.negrita, color: TINTA });
}

function frentePantalla(doc: PDFDocument, img: Img, f: Fuentes, d: DatosCroquis) {
  const p = lamina(doc, img, f);
  titulo(p, f, "Sector a ocupar:", d.direccion);
  const r = encajar(p, img.frentePantalla, { x: X0 + 10, y: 150, w: X1 - X0 - 90, h: H - 300 });
  const yb = r.arriba - r.h - 24;
  cota(p, [r.x, yb], [r.x + r.w, yb]);
  const base = `${m(d.base)} ml`;
  const bw = f.negrita.widthOfTextAtSize(base, 15);
  p.drawText(base, { x: r.x + r.w / 2 - bw / 2, y: yb - 30, size: 15, font: f.negrita, color: TINTA });
  const xa = r.x + r.w + 18;
  cota(p, [xa, r.arriba - r.h * 0.26], [xa, r.arriba - r.h - 6]);
  p.drawText(`${m(ALTO_PANTALLA)} m`, { x: xa + 10, y: r.arriba - r.h * 0.62, size: 13, font: f.negrita, color: TINTA });
}

function sectorConMedidas(doc: PDFDocument, img: Img, f: Fuentes, d: DatosCroquis, render: PDFImage) {
  const p = lamina(doc, img, f);
  titulo(p, f, "Sector a ocupar:", d.direccion);
  encajar(p, render, { x: X0, y: 50, w: 330, h: H - 180 });
  const lineas = [`Largo: ${m(d.base)} m`, `Ancho: ${m(ANCHO)} m`, `Alto: ${m(d.alto)} m`];
  lineas.forEach((l, i) => p.drawText(l, { x: X0 + 360, y: H / 2 + 40 - i * 36, size: 22, font: f.negrita, color: TINTA }));
}

export async function generarCroquis(d: DatosCroquis, plantillas: PlantillasCroquis): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle("Croquis de implantación");
  doc.setProducer("AndamiosOS");
  const f = { normal: await doc.embedFont(StandardFonts.Helvetica), negrita: await doc.embedFont(StandardFonts.HelveticaBold) };
  const img = Object.fromEntries(
    await Promise.all(Object.entries(plantillas).map(async ([k, v]) => [k, await doc.embedPng(v)] as const)),
  ) as Img;

  portada(doc, img, f);
  plancheta(doc, img, f, d);
  if (d.tipo === "pantalla") {
    sectorPantalla(doc, img, f, d);
    frentePantalla(doc, img, f, d);
  } else if (d.tipo === "torre") {
    sectorConMedidas(doc, img, f, d, img.renderTorre);
  } else {
    sectorConMedidas(doc, img, f, d, img.renderEstructura);
  }
  return doc.save();
}
