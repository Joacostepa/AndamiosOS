// Prueba del cotizador rápido contra la base, el catastro y Odoo reales, SIN escribir en Odoo:
// arma un presupuesto como la pantalla (formulario → borrador), verifica el frente y el conflicto
// de canal con las herramientas, lee un alta pegada con la IA (~US$ 0,05) y propone el guardado.
// La acción propuesta se rechaza y al final se borra todo lo que se creó.
//
//   npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/test-cotizador-rapido.mts

import { createClient } from "@supabase/supabase-js";
import { leerBorrador, guardarBorrador } from "@/lib/asistente/datos";
import { abrirConversacion } from "@/lib/asistente/nueva-conversacion";
import { recalcular } from "@/lib/asistente/borrador";
import { rechazarAccion } from "@/lib/asistente/acciones";
import { aplicarFormulario, formularioDesdeBorrador } from "@/lib/cotizador-rapido/formulario";
import { aplicarPropuesta } from "@/lib/cotizador-rapido/propuesta";
import { interpretarPegado } from "@/lib/cotizador-rapido/interpretar";
import { contextoHerramientas, correrHerramienta, hoyBA, leerTarifas } from "@/lib/cotizador-rapido/servidor";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const fallas: string[] = [];
const ok = (cond: unknown, que: string) => {
  console.log(`${cond ? "✓" : "✗"} ${que}`);
  if (!cond) fallas.push(que);
};

const { data: yo } = await db.from("user_profiles").select("id").eq("email", "js@andamiosbuenosaires.com.ar").single();
const conv = await abrirConversacion(db, yo!.id);
await db.from("asistente_conversaciones").update({ titulo: "[PRUEBA COTIZADOR]" }).eq("id", conv.id);
const tarifas = await leerTarifas(db);

try {
  // 1. La IA lee un alta pegada.
  const pegado = "ALTA DE CLIENTE – Andamios Buenos Aires\nRazón social: ZZ PRUEBA COTIZADOR\nCUIT: 20-28456789-8\nContacto: Martín Prueba\nCelular: 11 5555-0123\nCorreo: prueba@ejemplo.com\nDirección de la obra: Florida 375, CABA\nNecesidad: bandeja estándar";
  const t0 = Date.now();
  const { propuesta, usoUsd } = await interpretarPegado({ db, texto: pegado, adjuntos: [], actual: null });
  console.log(`   IA: ${((Date.now() - t0) / 1000).toFixed(1)} s, US$ ${usoUsd.toFixed(3)}`, JSON.stringify(propuesta.campos.map((c) => `${c.campo}=${c.valor}${c.deducido ? "*" : ""}`)));
  ok(propuesta.tipo === "bandeja", "la IA reconoce la bandeja");
  let b = (await leerBorrador(db, conv.borrador_id!))!;
  const { formulario, completados } = aplicarPropuesta(formularioDesdeBorrador(b.datos), propuesta, "t");
  ok(formulario.cliente.razonSocial === "ZZ PRUEBA COTIZADOR" && formulario.obra.direccion.startsWith("Florida 375"), `completa cliente y obra (${completados} datos)`);
  ok(formulario.ia.alturaBandeja?.deducido === true, "marca la altura como deducida");

  // 2. Lo que guarda la pantalla.
  const guardar = async (f: typeof formulario) => {
    const datos = aplicarFormulario(b.datos, f, { tarifas });
    b = await guardarBorrador(db, b, { datos, resultado: recalcular(datos, { tarifas, lista: null, hoy: hoyBA() }), origen: "panel", patch: { prueba: true }, autorId: yo!.id });
  };
  await guardar(formulario);

  // 3. Catastro y canal, con las herramientas del asistente.
  let { ctx } = await contextoHerramientas(db, conv, yo!.id);
  let r = await correrHerramienta(ctx, "verificar_frente_lote", { direccion: "Florida 375" });
  const c = r.contenido as { estado?: string; vecinas?: { smp: string; direccion: string; frenteCatastro: number | null }[]; ok?: boolean };
  console.log(`   catastro: ${c.estado ?? (c.ok ? "encontrado" : r.contenido)}`);
  if (c.estado === "puerta_no_oficial" && c.vecinas?.length) {
    r = await correrHerramienta(ctx, "verificar_frente_lote", { smp: c.vecinas[0].smp });
    console.log(`   elegida la vecina ${c.vecinas[0].direccion}`);
  }
  b = ctx.borrador;
  ok(!!b.datos.obra.lote, "queda el lote del catastro en el borrador");
  r = await correrHerramienta(ctx, "verificar_conflicto_canal", { direccion: b.datos.obra.direccion });
  b = ctx.borrador;
  ok(b.datos.conflictoCanal.revisado, `conflicto de canal revisado: ${b.datos.conflictoCanal.resultado}`);

  // 4. Lo que completa el vendedor con botones.
  const lote = b.datos.obra.lote!;
  const frente = lote.caras.length ? lote.caras.reduce((a, x) => a + x, 0) : lote.frenteCatastro ?? 20;
  const f2 = formularioDesdeBorrador(b.datos);
  f2.bandeja.metros = frente;
  f2.ia = { ...f2.ia, alturaBandeja: { ...f2.ia.alturaBandeja!, deducido: false } };
  f2.jornadas = { armado: 1, desarme: 1 };
  f2.render = { eleccion: "ninguno", renderId: null, path: null };
  f2.cliente.domicilioObra = true;
  await guardar(f2);
  ok(b.resultado!.faltantes.length === 0, `sin faltantes${b.resultado!.faltantes.length ? `: ${b.resultado!.faltantes.map((x) => x.texto).join(" | ")}` : ""}`);
  ok(b.resultado!.totales.subtotal === Math.round(Math.max(frente, 10) * tarifas.bandeja.m3), `subtotal ${b.resultado!.totales.subtotal} = ${frente} m.l. × ${tarifas.bandeja.m3}`);
  ok(/bandeja de protección peatonal de 3 m/.test(b.datos.seccion1 ?? ""), "los textos de la propuesta salen solos");

  // 5. Proponer el guardado (no escribe) y rechazarlo.
  ({ ctx } = await contextoHerramientas(db, conv, yo!.id));
  const eventos: { t: string; accion?: { id: string; resumen: string } }[] = [];
  ctx.emitir = (e) => eventos.push(e as never);
  r = await correrHerramienta(ctx, "guardar_presupuesto_odoo", {});
  const accion = eventos.find((e) => e.t === "accion")?.accion;
  ok(!r.esError && !!accion, `propone el guardado${r.esError ? `: ${JSON.stringify(r.contenido)}` : ""}`);
  if (accion) {
    console.log(accion.resumen.split("\n").map((l) => `     ${l}`).join("\n"));
    await rechazarAccion(db, accion.id, conv.id);
  }
} finally {
  // Limpieza: la conversación arrastra borradores, acciones y cambios.
  const { data: borradores } = await db.from("cotizacion_borradores").select("id").eq("conversacion_id", conv.id);
  await db.from("asistente_conversaciones").update({ borrador_id: null }).eq("id", conv.id);
  for (const x of borradores ?? []) {
    await db.from("cotizacion_borrador_cambios").delete().eq("borrador_id", x.id);
    await db.from("cotizacion_pdfs").delete().eq("borrador_id", x.id);
  }
  await db.from("asistente_acciones").delete().eq("conversacion_id", conv.id);
  for (const x of borradores ?? []) await db.from("cotizacion_borradores").delete().eq("id", x.id);
  await db.from("asistente_conversaciones").delete().eq("id", conv.id);
  console.log("\nLimpio.");
}

console.log(fallas.length ? `\n${fallas.length} FALLAS` : "\nTodo bien.");
process.exit(fallas.length ? 1 : 0);
