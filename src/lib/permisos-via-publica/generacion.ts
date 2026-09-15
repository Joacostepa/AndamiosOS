import type { SupabaseClient } from "@supabase/supabase-js";
import { read } from "@/lib/odoo/client";
import { BUCKET, registrarEvento } from "./endosos";
import { manzanaDe, normalizar, parcelaPorDireccion, type Manzana, type Parcela } from "./catastro";
import { generarInformeTecnico, tipoDeObra, type TipoAndamio } from "./informe-tecnico";
import { generarCroquis } from "./croquis";

// Los documentos que hace ABA para el permiso, generados solos: informe técnico y croquis.
//
// DE DÓNDE SALE CADA DATO:
//   tipo y medidas → la venta de Odoo, solapa "Trabajo a ejecutar" (x_trabajo_obra,
//                    x_permiso_base, x_permiso_altura, x_permiso_metros_lineales)
//   dirección      → x_direccion_obra de la venta (o la del trámite)
//   plancheta      → USIG + EPOK (catastro.ts); si el catastro falla, el croquis sale igual
//                    con el aviso en la lámina y queda anotado para agregarla a mano
//   imágenes       → bucket privado permisos-via-publica/plantillas/ (incluye la firma)
//
// Un trámite sin venta (el de prueba) pasa tipo y medidas a mano.

/** Faltan datos para generar: es un 400 con un mensaje para la persona, no una falla. */
export class FaltanDatos extends Error {}

export type MedidasManuales = { tipo: TipoAndamio; base: number; alto: number };

const PLANTILLAS = {
  informe: ["informe/encabezado.png", "comun/firma-hougassian.png", "informe/p05.png", "informe/p06.png", "informe/p07.png", "informe/p08.png", "informe/p09.png"],
  laminas: Array.from({ length: 12 }, (_, i) => `informe/p${14 + i}.png`),
  croquis: ["croquis/foto-lateral.png", "croquis/logo-portada.png", "croquis/logo.png", "croquis/render-pantalla.png", "croquis/frente-pantalla.png", "croquis/render-estructura.png", "croquis/render-torre.png"],
};

// Las plantillas no cambian entre pedidos: se bajan una vez por instancia.
const cache = new Map<string, Uint8Array>();
async function plantilla(db: SupabaseClient, nombre: string): Promise<Uint8Array> {
  const previa = cache.get(nombre);
  if (previa) return previa;
  const { data, error } = await db.storage.from(BUCKET).download(`plantillas/${nombre}`);
  if (error || !data) throw new Error(`Falta la plantilla ${nombre}`);
  const bytes = new Uint8Array(await data.arrayBuffer());
  cache.set(nombre, bytes);
  return bytes;
}

async function guardarGenerado(
  db: SupabaseClient,
  tramiteId: string,
  clave: string,
  pdf: Uint8Array,
  nombre: string,
  datos: Record<string, unknown>,
  chequeos: { clave: string; ok: boolean; bloquea: boolean; detalle: string }[],
) {
  const ahora = new Date();
  const path = `tramites/${tramiteId}/${clave}-${ahora.getTime()}.pdf`;
  const { error: e1 } = await db.storage.from(BUCKET).upload(path, pdf, { contentType: "application/pdf" });
  if (e1) throw new Error(`No se pudo guardar ${nombre}: ${e1.message}`);

  const { data: previo } = await db.from("pvp_documentos").select("id, version").eq("tramite_id", tramiteId).eq("clave", clave).maybeSingle();
  const fallas = chequeos.filter((c) => !c.ok && c.bloquea);
  const valores = {
    estado: fallas.length ? "observado" : "ok",
    archivo_path: path, archivo_nombre: nombre, version: (previo?.version ?? 0) + 1,
    subido_por: "aba", subido_at: ahora.toISOString(), revisado_at: ahora.toISOString(), updated_at: ahora.toISOString(),
    observacion: fallas.length ? fallas.map((c) => c.detalle).join(" ") : null,
    revision: { modelo: null, leido: datos, chequeos },
  };
  const { error: e2 } = previo
    ? await db.from("pvp_documentos").update(valores).eq("id", previo.id)
    : await db.from("pvp_documentos").insert({ ...valores, tramite_id: tramiteId, clave, origen: "aba" });
  if (e2) throw new Error(e2.message);
}

export async function generarDocumentosAba(
  db: SupabaseClient,
  tramiteId: string,
  manual?: MedidasManuales | null,
): Promise<{ tipo: TipoAndamio; base: number; alto: number; smp: string | null; plancheta: boolean }> {
  const { data: t } = await db.from("pvp_tramites").select("id, direccion, odoo_venta_id").eq("id", tramiteId).single();
  if (!t) throw new FaltanDatos("El trámite no existe");

  let tipo: TipoAndamio | null = manual?.tipo ?? null;
  let base = manual?.base ?? 0;
  let alto = manual?.alto ?? 0;
  let direccion: string = t.direccion;

  if (t.odoo_venta_id && !manual) {
    const [v] = await read<{
      x_trabajo_obra: string | false; x_permiso_base: number; x_permiso_altura: number;
      x_permiso_metros_lineales: number; x_direccion_obra: string | false;
    }>("sale.order", [t.odoo_venta_id], ["x_trabajo_obra", "x_permiso_base", "x_permiso_altura", "x_permiso_metros_lineales", "x_direccion_obra"]);
    if (!v) throw new FaltanDatos("La venta ya no existe en Odoo.");
    tipo = tipoDeObra(v.x_trabajo_obra || null);
    if (!tipo) throw new FaltanDatos("La venta no dice qué se arma (pantalla, estructura o torre) en «Trabajo a ejecutar».");
    if (tipo === "pantalla") {
      base = v.x_permiso_metros_lineales;
      alto = 3;
      if (!base) throw new FaltanDatos("Faltan los metros lineales de pantalla en la venta («Trabajo a ejecutar»).");
    } else {
      base = v.x_permiso_base;
      alto = v.x_permiso_altura;
      if (!base || !alto) throw new FaltanDatos("Faltan Base y Altura en la venta («Trabajo a ejecutar → Qué se arma»).");
    }
    direccion = v.x_direccion_obra || t.direccion;
  }
  if (!tipo) throw new FaltanDatos("Indicá qué se arma y sus medidas.");
  if (!(base > 0) || !(alto > 0)) throw new FaltanDatos("Las medidas tienen que ser mayores a cero.");

  // Catastro: el mejor esfuerzo. Sin plancheta los documentos salen igual y se avisa.
  let parcela: Parcela | null = null;
  let manzana: Manzana | null = null;
  let errorCatastro: string | null = null;
  try {
    const n = await normalizar(direccion);
    if (!n) throw new Error("la dirección no se encontró en el normalizador de la Ciudad");
    parcela = await parcelaPorDireccion(n.codCalle, n.altura);
    if (!parcela) throw new Error("no se encontró la parcela");
    manzana = await manzanaDe(parcela);
    if (!manzana.lotes.length) throw new Error("no se pudo leer la geometría de la manzana");
  } catch (e) {
    errorCatastro = e instanceof Error ? e.message : String(e);
  }

  const [pi, laminas, pc] = await Promise.all([
    Promise.all(PLANTILLAS.informe.map((n) => plantilla(db, n))),
    Promise.all(PLANTILLAS.laminas.map((n) => plantilla(db, n))),
    Promise.all(PLANTILLAS.croquis.map((n) => plantilla(db, n))),
  ]);
  const fecha = new Date();
  const [informe, croquis] = await Promise.all([
    generarInformeTecnico(
      { direccion, fecha, tipo, base, alto },
      { encabezado: pi[0], firma: pi[1], imagenes: { p05: pi[2], p06: pi[3], p07: pi[4], p08: pi[5], p09: pi[6] }, laminas },
    ),
    generarCroquis(
      { direccion, tipo, base, alto, manzana },
      { foto: pc[0], logoPortada: pc[1], logo: pc[2], firma: pi[1], renderPantalla: pc[3], frentePantalla: pc[4], renderEstructura: pc[5], renderTorre: pc[6] },
    ),
  ]);

  const datos = { tipo, base, alto, direccion, smp: parcela?.smp ?? null, puertas: parcela?.puertas ?? [] };
  await guardarGenerado(db, tramiteId, "informe_tecnico", informe, "Informe técnico.pdf", datos, [
    { clave: "generado", ok: true, bloquea: true, detalle: `Generado con ${tipo === "pantalla" ? `${base} ml de pantalla` : `${base} m × ${alto} m`}.` },
  ]);
  await guardarGenerado(db, tramiteId, "croquis", croquis, "Croquis de implantación.pdf", datos, [
    { clave: "plancheta", ok: !errorCatastro, bloquea: true, detalle: errorCatastro ? `Falta la plancheta (${errorCatastro}): hay que agregarla a mano.` : `Plancheta dibujada con la manzana ${parcela?.seccion}-${parcela?.manzana}.` },
  ]);
  await registrarEvento(db, tramiteId, "documento_subido", `Informe técnico y croquis generados (${tipo}, ${base} × ${alto})${errorCatastro ? ` · sin plancheta: ${errorCatastro}` : ""}.`, datos, "sistema");

  return { tipo, base, alto, smp: parcela?.smp ?? null, plancheta: !errorCatastro };
}
