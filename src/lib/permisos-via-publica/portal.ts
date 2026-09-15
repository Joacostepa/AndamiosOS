import type { SupabaseClient } from "@supabase/supabase-js";
import { read } from "@/lib/odoo/client";
import { crearAlertas } from "@/lib/alertas/servicio";
import { enviarMail } from "@/lib/mail";
import { pedirEndoso, registrarEvento, urlBase } from "./endosos";
import { legajoDe, type TipoDueno } from "./tipos";

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

/**
 * Lo que dispara el webhook de Odoo. Idempotente: el webhook llega en cada write que toca
 * `state` o `x_lleva_permiso`, y sólo la primera vez que la venta califica abre algo.
 * Devuelve qué pasó, para el log.
 */
export async function abrirTramiteDeVenta(db: SupabaseClient, ventaId: number, origen?: string | null): Promise<string> {
  const [v] = await read<VentaPermiso>("sale.order", [ventaId], [
    "name", "state", "date_order", "x_lleva_permiso", "x_direccion_obra", "partner_id",
  ]);
  if (!v) return "no_existe";
  if (v.state !== "sale" && v.state !== "done") return "no_confirmada";
  if (v.x_lleva_permiso !== "si") return "no_lleva_permiso";
  if (!v.date_order || v.date_order < CORTE_VENTAS) return "anterior_al_corte";

  const { data: previo } = await db.from("pvp_tramites").select("id")
    .eq("odoo_venta_id", ventaId).is("expediente_id", null).maybeSingle();
  if (previo) return "ya_abierto";

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
  }).select("id").single();
  // Dos webhooks casi juntos: el índice único deja pasar a uno solo.
  if (error?.code === "23505") return "ya_abierto";
  if (error || !nuevo) throw new Error(error?.message ?? "No se pudo abrir el trámite");

  await registrarEvento(db, nuevo.id, "tramite_abierto", `Venta ${v.name} confirmada con permiso de implantación.`, { odoo_venta_id: v.id }, "sistema");
  await mandarLinkCliente(db, nuevo.id, origen);
  return "abierto";
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
