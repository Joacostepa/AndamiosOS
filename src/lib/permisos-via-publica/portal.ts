import type { SupabaseClient } from "@supabase/supabase-js";
import { read, searchRead } from "@/lib/odoo/client";
import { crearAlertas } from "@/lib/alertas/servicio";
import { enviarMail } from "@/lib/mail";
import { pedirEndoso, registrarEvento, urlBase } from "./endosos";
import { legajoDe, type TipoDueno, type VentaParaIniciar } from "./tipos";

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
    .select("id, direccion, odoo_venta_nombre, cliente_nombre, cliente_email, token_cliente")
    .eq("id", tramiteId).single();
  if (!t) throw new Error("El trámite no existe");

  const url = linkCliente(t.token_cliente, origen);
  const problema = url ? problemaDeMail(t.cliente_email) : "No se sabe la URL de la app para armar el link (NEXT_PUBLIC_APP_URL).";

  if (!problema) {
    try {
      await enviarMail({
        para: t.cliente_email!.trim(),
        asunto: `Permiso de andamio para ${t.direccion} — datos y documentación`,
        texto: [
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
      await registrarEvento(db, tramiteId, "link_cliente", `Se le mandó el link a ${t.cliente_email}.`, {}, "sistema");
      return true;
    } catch (e) {
      return anotarProblema(e instanceof Error ? e.message : String(e));
    }
  }
  return anotarProblema(problema);

  async function anotarProblema(msg: string): Promise<false> {
    await db.from("pvp_tramites").update({ link_error: msg.slice(0, 300) }).eq("id", tramiteId);
    await registrarEvento(db, tramiteId, "link_cliente", `No se mandó el link: ${msg}`, {}, "sistema");
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

/** Un documento del legajo que subió el cliente. Queda "cargado" hasta que exista la revisión. */
export async function registrarDocumentoCliente(db: SupabaseClient, documentoId: string, archivo: { path: string; nombre: string }): Promise<void> {
  const { data: doc } = await db.from("pvp_documentos").select("tramite_id, clave, version").eq("id", documentoId).single();
  if (!doc) throw new Error("El documento no existe");
  const ahora = new Date().toISOString();
  const version = doc.version + 1;
  const { error } = await db.from("pvp_documentos").update({
    estado: "cargado", archivo_path: archivo.path, archivo_nombre: archivo.nombre, version,
    subido_por: "cliente", subido_at: ahora, observacion: null, updated_at: ahora,
  }).eq("id", documentoId);
  if (error) throw new Error(error.message);
  await registrarEvento(db, doc.tramite_id, "documento_subido", `${archivo.nombre} (versión ${version})`, { clave: doc.clave, path: archivo.path }, "cliente");
}
