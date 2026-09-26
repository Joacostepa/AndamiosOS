// Prueba punta a punta del Asistente Comercial contra Odoo y Claude reales.
//
// Una conversación con un cliente NUEVO de prueba: el asistente cotiza una bandeja, propone
// guardar, el "vendedor" confirma por texto y se verifica en Odoo lo que quedó (orden en
// borrador, neto igual al del motor, técnico, contrato, duraciones, PDF adjunto, oportunidad,
// cliente con CUIT). Al final se borra TODO lo creado (Odoo, Supabase y Storage).
//
// No manda mails. Cuesta ~US$ 1 de API.
//
// Correr: npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/test-asistente-e2e.mts

import { createClient } from "@supabase/supabase-js";
import { crearConversacion } from "@/lib/asistente/datos";
import { construirSistema } from "@/lib/asistente/prompt";
import { ejecutarTurno } from "@/lib/asistente/turno";
import { executeKw } from "@/lib/odoo/client";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const CUIT = "30-99999999-5";
const fallas: string[] = [];
const ok = (cond: unknown, que: string) => {
  console.log(`${cond ? "✓" : "✗"} ${que}`);
  if (!cond) fallas.push(que);
};

const { data: yo } = await db.from("user_profiles").select("id").eq("email", "js@andamiosbuenosaires.com.ar").single();
const sis = await construirSistema(db);
const conv = await crearConversacion(db, {
  usuario_id: yo!.id, canal: "web", modelo: "claude-opus-5", esfuerzo: "high", system_snapshot: sis.bloques, system_hash: sis.hash,
  criterio_version: sis.criterioVersion, parametros_version: sis.parametrosVersion, titulo: "[PRUEBA E2E] asistente",
});

async function turno(texto: string) {
  console.log(`\n── VENDEDOR: ${texto}`);
  let respuesta = "";
  for await (const ev of ejecutarTurno({ db, conversacionId: conv.id, usuarioId: yo!.id, entrada: { tipo: "mensaje", texto, adjuntos: [], canal: "web" } })) {
    if (ev.t === "texto") respuesta += ev.d;
    else if (ev.t === "herramienta" && ev.estado !== "inicio") console.log(`   [${ev.estado}] ${ev.nombre}${ev.resumen ? ` — ${ev.resumen}` : ""}`);
    else if (ev.t === "accion") console.log(`   [acción ${ev.accion.numero}: ${ev.accion.estado}]`);
    else if (ev.t === "error") console.log(`   [ERROR ${ev.codigo}] ${ev.mensaje}`);
    else if (ev.t === "fin") console.log(`   [fin ${ev.stop} · US$ ${ev.costoUsd}]`);
  }
  console.log(`── ASISTENTE: ${respuesta.slice(0, 700)}${respuesta.length > 700 ? "…" : ""}`);
}

let ordenId: number | null = null;
let partnerId: number | null = null;
try {
  await turno(
    `Es una PRUEBA del sistema. Cotizame una bandeja de protección de 12 metros lineales, 3 m de altura, en Calle Falsa 123, CABA. ` +
    `Cliente nuevo: ZZ PRUEBA ASISTENTE SA, CUIT ${CUIT}, contacto Prueba Borrar, celular 1100000000, mail prueba-asistente@example.com, ` +
    `domicilio Calle Falsa 123, CABA. Armado 1 jornada y desarme 1, cuadrilla de 3, sin render, sin concertina ni gestoría. ` +
    `No hace falta revisar nada más: dejalo listo para guardar en Odoo y proponé guardarlo.`,
  );
  const { data: acciones } = await db.from("asistente_acciones").select("numero, estado, tipo").eq("conversacion_id", conv.id);
  ok(acciones?.some((a) => a.tipo === "guardar_presupuesto" && a.estado === "presentada"), "propuso guardar y quedó presentada");

  await turno("sí, dale");

  const { data: b } = await db.from("cotizacion_borradores").select("*").eq("conversacion_id", conv.id).order("created_at", { ascending: false }).limit(1).single();
  ordenId = b?.odoo_venta_id ?? null;
  ok(ordenId, `la orden quedó en Odoo (${b?.odoo_venta_nombre})`);
  const { data: a2 } = await db.from("asistente_acciones").select("estado, confirmada_via, pasos").eq("conversacion_id", conv.id).eq("tipo", "guardar_presupuesto").single();
  ok(a2?.estado === "ok" && a2?.confirmada_via === "texto", `acción ejecutada por texto (${a2?.estado}, ${a2?.confirmada_via})`);
  partnerId = (a2?.pasos as { partnerId?: number })?.partnerId ?? null;

  if (ordenId) {
    const [o] = await executeKw<Record<string, unknown>[]>("sale.order", "read", [[ordenId]], {
      fields: ["name", "state", "amount_untaxed", "x_studio_tcnico", "user_id", "x_studio_tipo_de_contrato", "x_dur_armado", "x_dur_desarme",
        "x_personal_armado", "x_trabajo_obra", "x_asistente_ref", "opportunity_id", "is_rental_order", "partner_id", "x_direccion_obra"],
    });
    ok(o.state === "draft", `en borrador (${o.state})`);
    ok(o.amount_untaxed === 12 * 140000, `neto ${o.amount_untaxed} = 12 × 140.000`);
    ok(Array.isArray(o.x_studio_tcnico) && o.x_studio_tcnico[0] === 1, `técnico ${JSON.stringify(o.x_studio_tcnico)}`);
    ok(o.x_studio_tipo_de_contrato === "Obra ", `contrato "${o.x_studio_tipo_de_contrato}"`);
    ok(o.x_dur_armado === "1" && o.x_dur_desarme === "1", `duraciones ${o.x_dur_armado}/${o.x_dur_desarme}`);
    ok(o.x_trabajo_obra === "pantalla_proteccion", `tipo de trabajo ${o.x_trabajo_obra}`);
    ok(o.is_rental_order === true, "orden de alquiler");
    ok(!!o.x_asistente_ref, "marca x_asistente_ref");
    ok(Array.isArray(o.opportunity_id), `oportunidad ${JSON.stringify(o.opportunity_id)}`);
    const adj = await executeKw<{ name: string }[]>("ir.attachment", "search_read", [[["res_model", "=", "sale.order"], ["res_id", "=", ordenId]]], { fields: ["name"] });
    ok(adj.some((x) => x.name.startsWith(`Propuesta Técnico-Económica N° ${o.name}`)), `PDF adjunto (${adj.map((x) => x.name).join(", ")})`);
    const [p] = await executeKw<Record<string, unknown>[]>("res.partner", "read", [[(o.partner_id as [number, string])[0]]], { fields: ["name", "vat", "country_id", "l10n_latam_identification_type_id", "is_company"] });
    ok(p.vat === "30999999995" && Array.isArray(p.country_id) && p.country_id[0] === 10, `cliente ${p.name} CUIT ${p.vat} país ${JSON.stringify(p.country_id)}`);
    partnerId = (o.partner_id as [number, string])[0];
  }
} finally {
  // ── Limpieza: todo lo de prueba, en Odoo, Supabase y Storage ──────────────────────
  console.log("\n── limpieza");
  try {
    if (ordenId) {
      const [o] = await executeKw<{ opportunity_id: [number, string] | false }[]>("sale.order", "read", [[ordenId]], { fields: ["opportunity_id"] });
      const adj = await executeKw<{ id: number }[]>("ir.attachment", "search_read", [[["res_model", "=", "sale.order"], ["res_id", "=", ordenId]]], { fields: ["id"] });
      if (adj.length) await executeKw("ir.attachment", "unlink", [adj.map((x) => x.id)]);
      await executeKw("sale.order", "action_cancel", [[ordenId]], { context: { disable_cancel_warning: true } });
      await executeKw("sale.order", "unlink", [[ordenId]]);
      if (Array.isArray(o.opportunity_id)) await executeKw("crm.lead", "unlink", [[o.opportunity_id[0]]]);
      console.log("  Odoo: orden, adjuntos y oportunidad borrados");
    }
    if (partnerId) {
      const hijos = await executeKw<{ id: number }[]>("res.partner", "search_read", [[["parent_id", "=", partnerId]]], { fields: ["id"] });
      await executeKw("res.partner", "unlink", [[...hijos.map((h) => h.id), partnerId]]);
      console.log("  Odoo: cliente de prueba borrado");
    }
  } catch (e) {
    console.log("  ✗ limpieza de Odoo:", e instanceof Error ? e.message : e);
    fallas.push("limpieza de Odoo");
  }
  const { data: borradores } = await db.from("cotizacion_borradores").select("id").eq("conversacion_id", conv.id);
  for (const b of borradores ?? []) {
    const { data: files } = await db.storage.from("comercial").list(`propuestas/${b.id}`);
    if (files?.length) await db.storage.from("comercial").remove(files.map((f) => `propuestas/${b.id}/${f.name}`));
  }
  await db.from("cotizacion_borradores").delete().eq("conversacion_id", conv.id);
  await db.from("asistente_conversaciones").delete().eq("id", conv.id);
  console.log("  Supabase: conversación, borradores y PDFs borrados");
}

console.log(fallas.length ? `\n✗ ${fallas.length} fallas: ${fallas.join(" · ")}` : "\n✓ todo OK");
process.exit(fallas.length ? 1 : 0);
