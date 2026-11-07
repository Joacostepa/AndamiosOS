// El lado del servidor del cotizador rápido: el contexto de las herramientas del asistente
// para usarlas desde la pantalla, sin pasar por el modelo.
//
// La pantalla llama a las MISMAS herramientas que el chat (catastro, conflicto de canal, buscar
// clientes, abrir un S0, PDF, proponer el guardado): las reglas viven en un solo lugar
// (src/lib/asistente/herramientas.ts) y el borrador queda igual que si lo hubiera tocado el chat.
// Lo que la pantalla escribe directo (campos, botones) va por aplicarFormulario.

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { leerListaVigente, leerParametros, leerProductos } from "@/lib/parametros-cotizacion/servidor";
import { tarifasDesdeParametros } from "@/lib/cotizador/tarifas";
import type { Tarifas } from "@/lib/cotizador/tipos";
import { recalcular } from "@/lib/asistente/borrador";
import { leerBorrador, leerConversacion, vendedorDe, type Borrador, type Conversacion } from "@/lib/asistente/datos";
import { ejecutarHerramienta, type ContextoHerramientas } from "@/lib/asistente/herramientas";
import type { Evento } from "@/lib/asistente/eventos";

/** Las herramientas que la pantalla puede llamar. Las demás son sólo del chat. */
export const HERRAMIENTAS_PANTALLA = new Set([
  "verificar_frente_lote", "verificar_conflicto_canal", "buscar_clientes", "ver_cliente",
  "editar_presupuesto", "nuevo_borrador", "generar_pdf", "guardar_presupuesto_odoo", "validar_cuit",
]);

export const hoyBA = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Argentina/Buenos_Aires" });

export async function leerTarifas(db: SupabaseClient): Promise<Tarifas> {
  return tarifasDesdeParametros(await leerParametros(db));
}

/** La conversación del cotizador, si es de quien llama (o es admin, para mirar). */
export async function conversacionPropia(db: SupabaseClient, id: string, usuarioId: string): Promise<Conversacion | null> {
  const conv = await leerConversacion(db, id);
  return conv && conv.usuario_id === usuarioId ? conv : null;
}

/** Un turno del chat corriendo: mientras tanto la pantalla no escribe (lo pisaría). */
export function chatTrabajando(conv: Conversacion): boolean {
  return !!conv.turno_en_curso && Date.now() - Date.parse(conv.turno_en_curso) < 330_000;
}

/** El borrador con su resultado al día (los que nunca se calcularon se calculan). */
export async function borradorDe(db: SupabaseClient, conv: Conversacion, tarifas: Tarifas): Promise<Borrador | null> {
  if (!conv.borrador_id) return null;
  const b = await leerBorrador(db, conv.borrador_id);
  if (!b || b.resultado) return b;
  const resultado = recalcular(b.datos, { tarifas, lista: null, hoy: hoyBA() });
  await db.from("cotizacion_borradores").update({ resultado }).eq("id", b.id);
  return { ...b, resultado };
}

/** El contexto completo de las herramientas, como el de un turno del chat. */
export async function contextoHerramientas(db: SupabaseClient, conv: Conversacion, usuarioId: string): Promise<{ ctx: ContextoHerramientas; eventos: Evento[] }> {
  const [parametros, productos, lista, vendedor] = await Promise.all([leerParametros(db), leerProductos(db), leerListaVigente(db), vendedorDe(db, usuarioId)]);
  const tarifas = tarifasDesdeParametros(parametros);
  const valor = (clave: string, def: number) => parametros.find((x) => x.clave === clave)?.valor ?? def;
  const listaCalculo = lista ? { id: lista.lista.id, piezas: lista.piezas } : null;
  const borrador = await borradorDe(db, conv, tarifas);
  if (!borrador) throw new Error("La conversación no tiene presupuesto.");
  const eventos: Evento[] = [];
  const ctx: ContextoHerramientas = {
    db, conversacion: conv, usuarioId, vendedor, borrador, tarifas, lista: listaCalculo, productos,
    odoo: { impuestoIvaId: valor("odoo_impuesto_iva_id", 88), terminoPagoId: valor("odoo_termino_pago_id", 11), plantillaMailId: valor("odoo_plantilla_mail_id", 65) },
    // La pantalla no tiene turnos del modelo: cada llamada es su propio "turno" (las acciones
    // que propone se confirman con el botón, que no mira el turno).
    turnoId: randomUUID(), turnoAnteriorId: null, textoVendedor: null, canal: "web", hoy: hoyBA(),
    emitir: (e) => eventos.push(e),
  };
  return { ctx, eventos };
}

export async function correrHerramienta(ctx: ContextoHerramientas, nombre: string, input: unknown) {
  const r = await ejecutarHerramienta(nombre, input, ctx, `pantalla-${randomUUID()}`);
  let contenido: unknown = r.contenido;
  if (typeof r.contenido === "string") {
    try {
      contenido = JSON.parse(r.contenido);
    } catch {
      contenido = r.contenido;
    }
  }
  return { contenido, esError: !!r.esError };
}
