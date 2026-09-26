// Lector mínimo de .xlsx: la primera hoja como filas de texto.
//
// POR QUÉ A MANO Y NO UNA LIBRERÍA: el único .xlsx que entra acá es la lista de precios de
// alquiler (≈110 filas, una hoja, código-descripción-precio). La versión de SheetJS que está
// en npm quedó vieja y con vulnerabilidades conocidas, y exceljs pesa varios megas para leer
// tres columnas. Un .xlsx es un zip con XML adentro: Node ya trae el inflate.
//
// Sólo servidor (usa node:zlib). Soporta lo que produce Excel: entradas guardadas o con
// deflate, strings compartidos, strings en línea y números. No evalúa fórmulas: toma el
// último valor calculado que Excel dejó guardado en la celda.

import { inflateRawSync } from "node:zlib";

const FIRMA_FIN_DIRECTORIO = 0x06054b50;
const FIRMA_DIRECTORIO = 0x02014b50;
const FIRMA_LOCAL = 0x04034b50;

/** Todas las entradas del zip, por nombre. */
function leerZip(buf: Buffer): Map<string, Buffer> {
  // El fin del directorio central está en los últimos 22 bytes + el comentario (≤ 64 KB).
  let fin = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--) {
    if (buf.readUInt32LE(i) === FIRMA_FIN_DIRECTORIO) { fin = i; break; }
  }
  if (fin < 0) throw new Error("El archivo no es un .xlsx válido (no se encontró el índice del zip)");

  const entradas = buf.readUInt16LE(fin + 10);
  let p = buf.readUInt32LE(fin + 16);
  const salida = new Map<string, Buffer>();

  for (let n = 0; n < entradas; n++) {
    if (buf.readUInt32LE(p) !== FIRMA_DIRECTORIO) throw new Error("El .xlsx está dañado (directorio del zip)");
    const metodo = buf.readUInt16LE(p + 10);
    const comprimido = buf.readUInt32LE(p + 20);
    const largoNombre = buf.readUInt16LE(p + 28);
    const largoExtra = buf.readUInt16LE(p + 30);
    const largoComentario = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const nombre = buf.toString("utf8", p + 46, p + 46 + largoNombre);
    p += 46 + largoNombre + largoExtra + largoComentario;

    if (buf.readUInt32LE(local) !== FIRMA_LOCAL) throw new Error("El .xlsx está dañado (entrada del zip)");
    const inicio = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const datos = buf.subarray(inicio, inicio + comprimido);
    if (metodo === 0) salida.set(nombre, datos);
    else if (metodo === 8) salida.set(nombre, inflateRawSync(datos));
    // Otros métodos no los genera Excel: se ignoran.
  }
  return salida;
}

const ENTIDADES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function decodificar(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) => {
    if (e[0] === "#") return String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return ENTIDADES[e.toLowerCase()] ?? _;
  });
}

/** Texto de todos los <t> de un fragmento (un <si> con formato puede traer varios). */
function textos(fragmento: string): string {
  let out = "";
  for (const m of fragmento.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)) out += m[1];
  return decodificar(out);
}

/** "B12" → 1 (columna base 0). */
function columna(ref: string): number {
  const letras = /^[A-Z]+/.exec(ref)?.[0] ?? "A";
  let n = 0;
  for (const ch of letras) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** La primera hoja del libro como matriz de strings (celdas vacías = ""). */
export function leerPrimeraHoja(archivo: Buffer): { hoja: string; filas: string[][] } {
  const zip = leerZip(archivo);
  const libro = zip.get("xl/workbook.xml")?.toString("utf8");
  if (!libro) throw new Error("El archivo no es un libro de Excel (.xlsx)");

  const primera = /<sheet\b[^>]*\bname="([^"]*)"[^>]*\br:id="([^"]*)"/.exec(libro)
    ?? /<sheet\b[^>]*\br:id="([^"]*)"[^>]*\bname="([^"]*)"/.exec(libro);
  if (!primera) throw new Error("El libro no tiene hojas");
  const [nombreHoja, rid] = primera[0].indexOf("name=") < primera[0].indexOf("r:id=")
    ? [primera[1], primera[2]] : [primera[2], primera[1]];

  const rels = zip.get("xl/_rels/workbook.xml.rels")?.toString("utf8") ?? "";
  const rel = new RegExp(`<Relationship\\b[^>]*Id="${rid}"[^>]*Target="([^"]*)"`).exec(rels)
    ?? new RegExp(`<Relationship\\b[^>]*Target="([^"]*)"[^>]*Id="${rid}"`).exec(rels);
  const destino = rel ? rel[1].replace(/^\/?(xl\/)?/, "xl/") : "xl/worksheets/sheet1.xml";
  const xmlHoja = zip.get(destino)?.toString("utf8");
  if (!xmlHoja) throw new Error("No se pudo leer la primera hoja del libro");

  const compartidos: string[] = [];
  const xmlCompartidos = zip.get("xl/sharedStrings.xml")?.toString("utf8");
  if (xmlCompartidos) for (const m of xmlCompartidos.matchAll(/<si>([\s\S]*?)<\/si>/g)) compartidos.push(textos(m[1]));

  const filas: string[][] = [];
  for (const f of xmlHoja.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const fila: string[] = [];
    for (const c of f[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const atributos = c[1];
      const cuerpo = c[2] ?? "";
      const ref = /\br="([A-Z]+\d+)"/.exec(atributos)?.[1];
      const tipo = /\bt="([^"]+)"/.exec(atributos)?.[1];
      const v = /<v>([\s\S]*?)<\/v>/.exec(cuerpo)?.[1];
      let valor = "";
      if (tipo === "s" && v !== undefined) valor = compartidos[Number(v)] ?? "";
      else if (tipo === "inlineStr") valor = textos(cuerpo);
      else if (v !== undefined) valor = decodificar(v);
      const col = ref ? columna(ref) : fila.length;
      while (fila.length < col) fila.push("");
      fila[col] = valor.trim();
    }
    filas.push(fila);
  }
  return { hoja: nombreHoja, filas };
}
