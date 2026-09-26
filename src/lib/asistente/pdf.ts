// El PDF de la propuesta a partir del borrador. SOLO server-side.
//
// Vista previa (sin número, marca BORRADOR) mientras la orden no está en Odoo; final (con el
// número que asignó Odoo) después de guardarla. Cada PDF queda en el bucket `comercial` y en
// cotizacion_pdfs, con la versión del borrador de la que salió.

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generarPdfPropuesta, nombreArchivoPropuesta, type DatosPropuesta, type ItemPdf } from "@/lib/cotizador/pdf/documento";
import type { Tarifas } from "@/lib/cotizador/tipos";
import type { Borrador } from "./datos";
import type { PdfVista } from "./eventos";

const BUCKET = "comercial";

/** Ancho y alto de un PNG o JPEG leyendo el encabezado. null si no es ninguno de los dos. */
export function dimensionesImagen(b: Buffer): { ancho: number; alto: number; tipo: "png" | "jpg" } | null {
  if (b.length > 24 && b.readUInt32BE(0) === 0x89504e47) return { ancho: b.readUInt32BE(16), alto: b.readUInt32BE(20), tipo: "png" };
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const marca = b[i + 1];
      const largo = b.readUInt16BE(i + 2);
      // SOF0..SOF15 salvo DHT (C4), JPG (C8) y DAC (CC): ahí están las dimensiones.
      if (marca >= 0xc0 && marca <= 0xcf && marca !== 0xc4 && marca !== 0xc8 && marca !== 0xcc) {
        return { alto: b.readUInt16BE(i + 5), ancho: b.readUInt16BE(i + 7), tipo: "jpg" };
      }
      i += 2 + largo;
    }
  }
  return null;
}

async function imagenDelRender(db: SupabaseClient, b: Borrador): Promise<DatosPropuesta["imagenes"]> {
  const r = b.datos.render;
  let path: string | null = null;
  if (r.eleccion === "biblioteca" && r.renderId) {
    const { data } = await db.from("cotizacion_renders").select("path").eq("id", r.renderId).maybeSingle();
    path = data?.path ?? null;
  } else if (r.eleccion === "propio") {
    path = r.path;
  }
  if (!path) return [];
  const { data, error } = await db.storage.from(BUCKET).download(path);
  if (error || !data) return [];
  const buf = Buffer.from(await data.arrayBuffer());
  const dim = dimensionesImagen(buf);
  return dim ? [{ src: buf, ancho: dim.ancho, alto: dim.alto }] : [];
}

function item(l: { descripcion: string; importe: number; importeLista: number; descuentoPct?: number; unidad?: string }): ItemPdf {
  return l.descuentoPct
    ? { desc: l.descripcion, monto: l.importe, montoLista: l.importeLista, descuentoPct: l.descuentoPct, unidad: l.unidad }
    : { desc: l.descripcion, monto: l.importe, unidad: l.unidad };
}

export async function generarPdfDelBorrador(
  db: SupabaseClient,
  b: Borrador,
  p: { tarifas: Tarifas; vendedorEnPropuesta: string; usuarioId: string },
): Promise<{ vista: PdfVista; pdf: Buffer; nombre: string }> {
  const r = b.resultado;
  if (!r) throw new Error("El borrador todavía no tiene números: cotizá algo primero.");
  const d = b.datos;
  const final = !!b.odoo_venta_nombre;
  const hoy = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Argentina/Buenos_Aires" });

  const datos: DatosPropuesta = {
    numero: b.odoo_venta_nombre,
    fechaEmision: hoy,
    validezDias: p.tarifas.validezDias,
    vendedor: p.vendedorEnPropuesta,
    cliente: { razonSocial: d.cliente.razonSocial ?? "—", contacto: d.cliente.contacto, obra: d.obra.direccion ?? "—" },
    seccion1: d.seccion1 ?? "",
    seccion2: d.seccion2,
    imagenes: await imagenDelRender(db, b),
    epigrafe: d.epigrafe,
    base: r.lineas.filter((l) => l.seccion === "base").map(item),
    adicionales: r.lineas.filter((l) => l.seccion === "adicional").map(item),
    opcionales: r.lineas.filter((l) => l.seccion === "opcional").map(item),
    totales: { subtotal: r.totales.subtotal, iva: r.totales.iva, total: r.totales.total, ivaPct: p.tarifas.ivaPct },
    renovacion: r.totales.renovacion ? { pct: r.totales.renovacion.pct, monto: r.totales.renovacion.monto } : null,
    periodoDias: d.condiciones.periodoDias,
    mostrarTotalConIva: d.condiciones.mostrarTotalConIva,
    actualizacionCac: d.condiciones.actualizacionCac,
    formaPago: d.condiciones.formaPago,
    plazoInicioDiasHabiles: p.tarifas.plazoInicioDiasHabiles,
    aclaraciones: d.aclaraciones,
    borrador: !final,
  };

  const pdf = await generarPdfPropuesta(datos);
  const nombre = nombreArchivoPropuesta(b.odoo_venta_nombre, d.cliente.razonSocial ?? "Cliente", d.obra.direccion ?? "Obra", d.referencia ?? "Propuesta");
  const tipo = final ? "final" : "preview";
  const path = `propuestas/${b.id}/v${b.version}-${tipo}-${Date.now()}.pdf`;
  const { error } = await db.storage.from(BUCKET).upload(path, pdf, { contentType: "application/pdf", upsert: false });
  if (error) throw new Error(`No se pudo guardar el PDF: ${error.message}`);

  const { data: fila, error: e2 } = await db
    .from("cotizacion_pdfs")
    .insert({
      borrador_id: b.id, borrador_version: b.version, tipo, odoo_venta_id: b.odoo_venta_id, nombre, storage_path: path,
      sha256: createHash("sha256").update(pdf).digest("hex"), bytes: pdf.length, creado_por: p.usuarioId,
    })
    .select("id")
    .single();
  if (e2) throw new Error(`No se pudo registrar el PDF: ${e2.message}`);

  const { data: firmada } = await db.storage.from(BUCKET).createSignedUrl(path, 3600, { download: nombre });
  return { vista: { id: fila.id, nombre, tipo, url: firmada?.signedUrl ?? "", version: b.version }, pdf, nombre };
}

/** URL firmada de un PDF ya generado (para descargar o compartir). */
export async function urlDePdf(db: SupabaseClient, pdfId: string): Promise<{ url: string; nombre: string } | null> {
  const { data } = await db.from("cotizacion_pdfs").select("storage_path, nombre").eq("id", pdfId).maybeSingle();
  if (!data) return null;
  const { data: f } = await db.storage.from(BUCKET).createSignedUrl(data.storage_path, 3600, { download: data.nombre });
  return f?.signedUrl ? { url: f.signedUrl, nombre: data.nombre } : null;
}
