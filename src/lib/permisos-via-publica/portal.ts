import type { SupabaseClient } from "@supabase/supabase-js";
import { read, searchRead } from "@/lib/odoo/client";
import { crearAlertas } from "@/lib/alertas/servicio";
import { enviarMail } from "@/lib/mail";
import { BUCKET, pedirEndoso, registrarEvento, urlBase } from "./endosos";
import { revisarDocumentoCliente, tipoDeArchivo } from "./revision-legajo";
import { NOMBRE_DOCUMENTO, legajoDe, type Tramite, type TipoDueno, type VentaParaIniciar } from "./tipos";

// El portal del cliente: abrir el trámite cuando se confirma la venta, mandarle el link y
// recibir quién es el dueño del lote y su legajo. Todo con service role, detrás del secret
// del webhook de Odoo, del token del cliente o del proxy.
//
// DECIDIDO CON JS (2026-09-15):
//   - Abre el trámite `sale.order.x_lleva_permiso = 'si'` en una venta confirmada, no la
//     línea del servicio de gestión.
//   - El link sale al confirmar, sin esperar el pago.
//   - Sólo ventas nuevas: las confirmadas desde CORTE_VENTAS. Las en curso siguen por
//     Google Forms.
//   - El titular lo carga el CLIENTE: con eso sale solo el pedido de endoso a Segucom.

export const CORTE_VENTAS = "2026-09-15 00:00:00";

/** Lo que se pide en TAD: seis meses desde hoy (decidido 2026-09-14). */
function seisMesesDesdeHoy(): string {
  const d = new Date();
  d.setMonth(d.getMonth() + 6);
  return d.toISOString().slice(0, 10);
}

type VentaPermiso = {
  id: number;
  name: string;
  state: string;
  date_order: string | false;
  x_lleva_permiso: string | false;
  x_direccion_obra: string | false;
  partner_id: [number, string] | false;
};

export function linkCliente(token: string | null, origen?: string | null): string | null {
  const base = urlBase(origen);
  return token && base ? `${base}/permiso/${token}` : null;
}

// "yahooo" con tres o: con "yahooo?" el mail bien escrito @yahoo.com caía como error.
const DOMINIOS_MAL_ESCRITOS = /@(gmai|gmial|gamil|gmal|hotmial|hotmai|hotmal|outlok|yahooo)\.com/i;

/** null si el mail sirve; si no, por qué no se manda. */
export function problemaDeMail(email: string | null): string | null {
  if (!email?.trim()) return "El cliente no tiene mail en Odoo.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) return `El mail del cliente no es válido (${email}).`;
  if (DOMINIOS_MAL_ESCRITOS.test(email)) return `El mail del cliente parece mal escrito (${email}).`;
  return null;
}

export type ResultadoApertura = {
  resultado: "abierto" | "ya_abierto" | "no_existe" | "no_confirmada" | "no_lleva_permiso" | "anterior_al_corte";
  tramiteId: string | null;
  linkEnviado?: boolean;
};

/**
 * Abre el trámite de una venta y le manda el link al cliente: de ahí en adelante el proceso
 * sigue solo (titular → endoso a Segucom → legajo).
 *
 * HOY SE LLAMA A MANO, con el botón "Iniciar trámite" de la bandeja (decidido con JS,
 * 2026-09-15: "por las dudas, después vemos si lo automatizamos"). El webhook de Odoo que
 * también la llama está desactivado; si se reactiva, respeta CORTE_VENTAS.
 *
 * Idempotente: una venta con trámite abierto devuelve el que ya tiene.
 */
export async function abrirTramiteDeVenta(
  db: SupabaseClient,
  ventaId: number,
  opts: { origen?: string | null; userId?: string | null; manual?: boolean } = {},
): Promise<ResultadoApertura> {
  const [v] = await read<VentaPermiso>("sale.order", [ventaId], [
    "name", "state", "date_order", "x_lleva_permiso", "x_direccion_obra", "partner_id",
  ]);
  const nada = (resultado: ResultadoApertura["resultado"]): ResultadoApertura => ({ resultado, tramiteId: null });
  if (!v) return nada("no_existe");
  if (v.state !== "sale" && v.state !== "done") return nada("no_confirmada");
  if (v.x_lleva_permiso !== "si") return nada("no_lleva_permiso");
  if (!opts.manual && (!v.date_order || v.date_order < CORTE_VENTAS)) return nada("anterior_al_corte");

  const buscarPrevio = () => db.from("pvp_tramites").select("id")
    .eq("odoo_venta_id", ventaId).is("expediente_id", null).maybeSingle();
  const { data: previo } = await buscarPrevio();
  if (previo) return { resultado: "ya_abierto", tramiteId: previo.id };

  const [cliente] = v.partner_id
    ? await read<{ id: number; name: string; email: string | false }>("res.partner", [v.partner_id[0]], ["name", "email"])
    : [];

  const { data: nuevo, error } = await db.from("pvp_tramites").insert({
    odoo_venta_id: v.id,
    odoo_venta_nombre: v.name,
    direccion: v.x_direccion_obra || v.name,
    cliente_nombre: cliente?.name ?? null,
    cliente_email: cliente?.email || null,
    permiso_hasta: seisMesesDesdeHoy(),
    creado_por: opts.userId ?? null,
  }).select("id").single();
  // Dos clics (o dos webhooks) casi juntos: el índice único deja pasar a uno solo.
  if (error?.code === "23505") return { resultado: "ya_abierto", tramiteId: (await buscarPrevio()).data?.id ?? null };
  if (error || !nuevo) throw new Error(error?.message ?? "No se pudo abrir el trámite");

  await registrarEvento(
    db, nuevo.id, "tramite_abierto",
    opts.manual ? `Iniciado a mano desde la venta ${v.name}.` : `Venta ${v.name} confirmada con permiso de implantación.`,
    { odoo_venta_id: v.id, por: opts.userId ?? null },
    opts.manual ? "persona" : "sistema",
  );
  const linkEnviado = await mandarLinkCliente(db, nuevo.id, opts.origen);
  return { resultado: "abierto", tramiteId: nuevo.id, linkEnviado };
}

/** Desde cuándo se ofrecen ventas para iniciar: incluye las que "todavía no arrancaron". */
export const DESDE_VENTAS_A_INICIAR = "2026-08-01 00:00:00";

/**
 * Las ventas que piden permiso y todavía no arrancaron: confirmadas desde
 * DESDE_VENTAS_A_INICIAR con "Lleva permiso = Sí", sin trámite presentado ni emitido en
 * Odoo, y sin trámite en la app ni expediente de TAD vinculado. Es una lista para que una
 * persona decida: si aparece una que no corresponde, no se inicia y listo.
 */
export async function ventasParaIniciar(db: SupabaseClient): Promise<VentaParaIniciar[]> {
  const ventas = await searchRead<VentaPermiso & { x_permiso_modalidad: string | false }>(
    "sale.order",
    [
      ["state", "in", ["sale", "done"]],
      ["x_lleva_permiso", "=", "si"],
      ["date_order", ">=", DESDE_VENTAS_A_INICIAR],
      // La modalidad NO filtra: "se arma sin expediente ni permiso" dice cuándo se puede
      // armar, no que no haya gestión. Esas obras también tramitan el permiso (JS, 15/09).
      "|", ["x_tramite_estado", "=", false], ["x_tramite_estado", "=", "no_presentado"],
    ],
    ["name", "state", "date_order", "x_lleva_permiso", "x_direccion_obra", "partner_id", "x_permiso_modalidad"],
    { order: "date_order desc", limit: 100 },
  );
  if (ventas.length === 0) return [];

  const ids = ventas.map((v) => v.id);
  const [tramites, expedientes] = await Promise.all([
    db.from("pvp_tramites").select("odoo_venta_id").in("odoo_venta_id", ids),
    db.from("pvp_expedientes").select("odoo_venta_id").in("odoo_venta_id", ids),
  ]);
  const usadas = new Set([...(tramites.data ?? []), ...(expedientes.data ?? [])].map((r) => Number(r.odoo_venta_id)));
  const pendientes = ventas.filter((v) => !usadas.has(v.id));

  const partnerIds = [...new Set(pendientes.map((v) => (v.partner_id ? v.partner_id[0] : 0)).filter(Boolean))];
  const partners = partnerIds.length ? await read<{ id: number; name: string; email: string | false }>("res.partner", partnerIds, ["name", "email"]) : [];
  const porId = new Map(partners.map((p) => [p.id, p]));

  return pendientes.map((v) => {
    const p = v.partner_id ? porId.get(v.partner_id[0]) : undefined;
    const email = p?.email || null;
    return {
      ventaId: v.id,
      venta: v.name,
      fecha: v.date_order ? v.date_order.slice(0, 10) : null,
      direccion: v.x_direccion_obra || null,
      cliente: p?.name ?? null,
      email,
      problemaMail: problemaDeMail(email),
      modalidad: v.x_permiso_modalidad || null,
    };
  });
}

/** Manda (o reenvía) el link del portal al mail del cliente. Devuelve si salió. */
export async function mandarLinkCliente(db: SupabaseClient, tramiteId: string, origen?: string | null): Promise<boolean> {
  const { data: t } = await db.from("pvp_tramites")
    .select("id, direccion, odoo_venta_nombre, cliente_nombre, cliente_email, token_cliente, es_prueba")
    .eq("id", tramiteId).single();
  if (!t) throw new Error("El trámite no existe");

  // En prueba el "cliente" es la casilla de la app: nunca le escribe a nadie de afuera.
  const para = t.es_prueba ? process.env.PERMISOS_MAIL ?? null : t.cliente_email;
  const url = linkCliente(t.token_cliente, origen);
  const problema = url ? problemaDeMail(para) : "No se sabe la URL de la app para armar el link (NEXT_PUBLIC_APP_URL).";

  if (!problema) {
    try {
      await enviarMail({
        para: para!.trim(),
        asunto: `${t.es_prueba ? "[PRUEBA] " : ""}Permiso de andamio para ${t.direccion} — datos y documentación`,
        texto: [
          ...(t.es_prueba ? ["[PRUEBA] Este mail es lo que le llegaría al cliente.", ""] : []),
          `Hola${t.cliente_nombre ? ` ${t.cliente_nombre}` : ""}, ¿cómo estás?`,
          "",
          `Para tramitar el permiso de uso del espacio público del andamio de ${t.direccion} necesitamos algunos datos y documentos del dueño del lote.`,
          "",
          "Cargalos en este link (no hace falta crear una cuenta):",
          url!,
          "",
          "Lo primero que te pide es quién es el dueño del lote y su CUIT: con eso ya pedimos el seguro. Después te pide los documentos según el tipo de dueño, y podés subirlos de a poco.",
          "",
          "Cualquier duda, respondé este mail.",
          "",
          "Saludos,",
          "Andamios Buenos Aires",
        ].join("\n"),
      });
      await db.from("pvp_tramites").update({ link_enviado_at: new Date().toISOString(), link_error: null }).eq("id", tramiteId);
      await registrarEvento(db, tramiteId, "link_cliente", `Se le mandó el link a ${para}.`, {}, "sistema");
      return true;
    } catch (e) {
      return anotarProblema(e instanceof Error ? e.message : String(e));
    }
  }
  return anotarProblema(problema);

  async function anotarProblema(msg: string): Promise<false> {
    await db.from("pvp_tramites").update({ link_error: msg.slice(0, 300) }).eq("id", tramiteId);
    await registrarEvento(db, tramiteId, "link_cliente", `No se mandó el link: ${msg}`, {}, "sistema");
    if (t!.es_prueba) return false;
    await crearAlertas(db, [{
      tipo: "permiso_novedad",
      clave: `permiso_novedad:tramite:${tramiteId}:link`,
      titulo: `No se pudo mandar el link del permiso — ${t!.direccion}`,
      descripcion: `${msg} Copiá el link de la ficha y mandalo por WhatsApp, o corregí el mail en Odoo y reenviá.`,
      prioridad: "alta",
      enlace: `/permisos-via-publica/tramites/${tramiteId}`,
    }]);
    return false;
  }
}

/**
 * Un trámite de prueba para ver el circuito entero sin escribirle a nadie: el link "del
 * cliente" y el pedido de endoso llegan a la casilla de la app (PERMISOS_MAIL).
 */
export async function crearTramiteDePrueba(db: SupabaseClient, userId: string | null, origen?: string | null): Promise<{ tramiteId: string; linkEnviado: boolean }> {
  const { data, error } = await db.from("pvp_tramites").insert({
    direccion: "Obra de prueba — Av. Siempre Viva 742, CABA",
    cliente_nombre: "Cliente de prueba",
    cliente_email: process.env.PERMISOS_MAIL ?? null,
    permiso_hasta: seisMesesDesdeHoy(),
    es_prueba: true,
    creado_por: userId,
  }).select("id").single();
  if (error || !data) throw new Error(error?.message ?? "No se pudo crear la prueba");
  await registrarEvento(db, data.id, "tramite_abierto", "Trámite de prueba: los mails llegan a la casilla de la app.", { por: userId }, "persona");
  const linkEnviado = await mandarLinkCliente(db, data.id, origen);
  return { tramiteId: data.id, linkEnviado };
}

export async function tramiteDeToken(db: SupabaseClient, token: string) {
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  const { data } = await db.from("pvp_tramites").select("*").eq("token_cliente", token).maybeSingle();
  return data;
}

/**
 * El cliente dijo quién es el dueño del lote. Arma la lista de documentos que le toca y,
 * si es la primera vez o cambió el CUIT, pide el endoso a Segucom. El aviso por mail al
 * productor lo manda quien llama, después de responder.
 */
export async function cargarTitular(
  db: SupabaseClient,
  tramiteId: string,
  datos: { tipoDueno: TipoDueno; esInquilino: boolean; nombre: string; cuit: string },
): Promise<void> {
  const { data: t } = await db.from("pvp_tramites").select("titular_cuit, titular_cargado_at").eq("id", tramiteId).single();
  if (!t) throw new Error("El trámite no existe");
  const ahora = new Date().toISOString();

  const { error } = await db.from("pvp_tramites").update({
    tipo_dueno: datos.tipoDueno, es_inquilino: datos.esInquilino,
    titular_nombre: datos.nombre, titular_cuit: datos.cuit, titular_cargado_at: ahora, updated_at: ahora,
  }).eq("id", tramiteId);
  if (error) throw new Error(error.message);

  await db.from("pvp_documentos").upsert(
    legajoDe(datos.tipoDueno, datos.esInquilino).map((d) => ({ tramite_id: tramiteId, clave: d.clave, origen: "cliente", estado: "falta" })),
    { onConflict: "tramite_id,clave", ignoreDuplicates: true },
  );
  await registrarEvento(db, tramiteId, "titular_cargado", `${datos.nombre} (CUIT ${datos.cuit})`, datos, "cliente");

  if (!t.titular_cargado_at || t.titular_cuit !== datos.cuit) await pedirEndoso(db, tramiteId, null);
}

/**
 * Un documento que el cliente completó y firmó en el portal. Lo arma la app con la plantilla
 * y la firma dibujada, así que no hay nada que revisar: queda "ok" con la constancia de
 * firma (quién, DNI, cuándo, desde dónde y el hash del PDF) guardada en la revisión.
 */
export async function guardarDocumentoFirmado(
  db: SupabaseClient,
  tramiteId: string,
  clave: string,
  archivo: { path: string; nombre: string },
  constancia: Record<string, unknown> & { firmante: string; dni: string },
): Promise<void> {
  const { data: previo } = await db.from("pvp_documentos").select("id, version").eq("tramite_id", tramiteId).eq("clave", clave).maybeSingle();
  const ahora = new Date().toISOString();
  const valores = {
    estado: "ok", archivo_path: archivo.path, archivo_nombre: archivo.nombre, version: (previo?.version ?? 0) + 1,
    subido_por: "cliente", subido_at: ahora, observacion: null, revisado_at: ahora, updated_at: ahora,
    revision: {
      modelo: null,
      leido: constancia,
      chequeos: [{ clave: "firma_electronica", ok: true, bloquea: true, detalle: `Completada y firmada en el portal por ${constancia.firmante} (DNI ${constancia.dni}).` }],
    },
  };
  const { error } = previo
    ? await db.from("pvp_documentos").update(valores).eq("id", previo.id)
    : await db.from("pvp_documentos").insert({ ...valores, tramite_id: tramiteId, clave, origen: "cliente" });
  if (error) throw new Error(error.message);
  await registrarEvento(db, tramiteId, "documento_subido", `${NOMBRE_DOCUMENTO[clave] ?? clave}: firmada en el portal por ${constancia.firmante} (DNI ${constancia.dni}).`, { clave, path: archivo.path }, "cliente");
}

/**
 * Cuando TODO el legajo del cliente queda correcto, genera solos el informe técnico y el
 * croquis (decidido con JS, 2026-09-15: se arman con lo que cargó y validó el cliente, no
 * antes). Una sola vez: si ya hay informe generado, no hace nada. Nunca tira.
 *
 * En el mismo momento se pide la encomienda del CPAU (JS, 2026-09-15): el robot la completa
 * y frena en Confirmar hasta que alguien aprueba en la ficha. También en las pruebas, que
 * nunca se finalizan.
 */
export async function siLegajoCompletoGenerar(db: SupabaseClient, tramiteId: string): Promise<void> {
  const { data: docs } = await db.from("pvp_documentos").select("clave, origen, estado").eq("tramite_id", tramiteId);
  const legajo = (docs ?? []).filter((d) => d.origen === "cliente");
  if (legajo.length === 0 || legajo.some((d) => d.estado !== "ok")) return;
  if ((docs ?? []).some((d) => d.clave === "informe_tecnico" && d.estado === "ok")) return;

  const { data: t } = await db.from("pvp_tramites").select("direccion, es_prueba").eq("id", tramiteId).single();
  try {
    const { generarDocumentosAba } = await import("./generacion");
    const r = await generarDocumentosAba(db, tramiteId);
    await registrarEvento(db, tramiteId, "documento_revisado", `Legajo completo: se generaron solos el informe técnico y el croquis${r.plancheta ? "" : " (sin plancheta)"}.`, r, "sistema");
  } catch (e) {
    return avisarFalla("No se pudo generar el informe técnico", "no se pudieron generar el informe técnico y el croquis", "generar", e);
  }

  try {
    const { pedirEncomienda } = await import("./encomienda");
    await pedirEncomienda(db, tramiteId);
  } catch (e) {
    await avisarFalla("No se pudo pedir la encomienda del CPAU", "no se pudo pedir la encomienda del CPAU", "encomienda", e);
  }

  async function avisarFalla(titulo: string, frase: string, clave: string, e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    await registrarEvento(db, tramiteId, clave === "encomienda" ? "encomienda_cpau" : "documento_revisado", `Legajo completo, pero ${frase}: ${msg}`, { error: msg }, "sistema");
    if (t?.es_prueba) return;
    await crearAlertas(db, [{
      tipo: "permiso_novedad",
      clave: `permiso_novedad:tramite:${tramiteId}:${clave}:${msg.slice(0, 40)}`,
      titulo: `${titulo} — ${t?.direccion ?? "trámite"}`,
      descripcion: `${msg} Corregilo y hacelo desde la ficha.`,
      prioridad: "alta",
      enlace: `/permisos-via-publica/tramites/${tramiteId}`,
    }]);
  }
}

/** Un documento del legajo que subió el cliente. Queda "revisando"; la revisión va aparte. */
export async function registrarDocumentoCliente(db: SupabaseClient, documentoId: string, archivo: { path: string; nombre: string }): Promise<void> {
  const { data: doc } = await db.from("pvp_documentos").select("tramite_id, clave, version").eq("id", documentoId).single();
  if (!doc) throw new Error("El documento no existe");
  const ahora = new Date().toISOString();
  const version = doc.version + 1;
  const { error } = await db.from("pvp_documentos").update({
    estado: "revisando", archivo_path: archivo.path, archivo_nombre: archivo.nombre, version,
    subido_por: "cliente", subido_at: ahora, observacion: null, revision: null, revisado_at: null, updated_at: ahora,
  }).eq("id", documentoId);
  if (error) throw new Error(error.message);
  await registrarEvento(db, doc.tramite_id, "documento_subido", `${archivo.nombre} (versión ${version})`, { clave: doc.clave, path: archivo.path }, "cliente");
}

/**
 * Revisa con IA un documento del legajo y deja ok u observado con el motivo para el cliente.
 * Nunca tira: si la revisión falla queda "cargado" con una nota para que lo mire una persona.
 */
export async function revisarDocumentoDelCliente(db: SupabaseClient, documentoId: string): Promise<void> {
  const { data: doc } = await db.from("pvp_documentos")
    .select("id, tramite_id, clave, version, archivo_path, pvp_tramites!inner(direccion, titular_nombre, titular_cuit, tipo_dueno)")
    .eq("id", documentoId).single();
  if (!doc?.archivo_path) return;
  const tramite = doc.pvp_tramites as unknown as Pick<Tramite, "direccion" | "titular_nombre" | "titular_cuit" | "tipo_dueno">;
  const ahora = () => new Date().toISOString();

  try {
    const tipo = tipoDeArchivo(doc.archivo_path);
    if (!tipo) throw new Error("formato de archivo que no se puede revisar");
    const { data: archivo, error } = await db.storage.from(BUCKET).download(doc.archivo_path);
    if (error || !archivo) throw new Error("no se encontró el archivo subido");

    const revision = await revisarDocumentoCliente(Buffer.from(await archivo.arrayBuffer()), tipo, doc.clave, tramite);
    const fallas = revision.chequeos.filter((c) => !c.ok && c.bloquea);
    const estado = fallas.length === 0 ? "ok" : "observado";
    const observacion = fallas.length === 0 ? null : fallas.map((c) => c.detalle).join(" ");
    await db.from("pvp_documentos").update({ estado, revision, revisado_at: ahora(), observacion, updated_at: ahora() }).eq("id", documentoId);
    await registrarEvento(db, doc.tramite_id, "documento_revisado", `${NOMBRE_DOCUMENTO[doc.clave] ?? doc.clave}: ${estado === "ok" ? "correcto" : observacion}`, { clave: doc.clave, estado, version: doc.version }, "ia");
    if (estado === "ok") await siLegajoCompletoGenerar(db, doc.tramite_id);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.from("pvp_documentos").update({
      estado: "cargado",
      observacion: `No se pudo revisar automáticamente (${msg}). Lo revisa una persona de ABA.`,
      updated_at: ahora(),
    }).eq("id", documentoId);
    await registrarEvento(db, doc.tramite_id, "documento_revisado", `No se pudo revisar ${doc.clave}: ${msg}`, { error: msg }, "ia");
  }
}
