import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { leerListaVigente } from "@/lib/parametros-cotizacion/servidor";
import { recalcular } from "@/lib/asistente/borrador";
import { guardarBorrador } from "@/lib/asistente/datos";
import { vistaBorrador } from "@/lib/asistente/herramientas";
import { aplicarFormulario } from "@/lib/cotizador-rapido/formulario";
import { esquemaFormulario } from "@/lib/cotizador-rapido/esquema";
import { borradorDe, chatTrabajando, conversacionPropia, hoyBA, leerTarifas } from "@/lib/cotizador-rapido/servidor";
import { errorResponse, exigirModulo, invalido } from "../../../_comun";

// PUT /api/comercial/asistente/cotizador/:conversacion { version, formulario } — guarda lo que
// cargó la pantalla en el borrador de la conversación (versión nueva, origen «panel»), con el
// motor corrido acá. Si el borrador cambió mientras tanto (el chat, otra pestaña), 409 con el
// actual: la pantalla lo vuelve a leer.

export const dynamic = "force-dynamic";

const schema = z.object({ version: z.number().int().nonnegative(), formulario: esquemaFormulario });

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) return invalido("Id inválido");
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalido(parsed.error);
  const quien = await exigirModulo("asistente-comercial", "editar");
  if (quien instanceof NextResponse) return quien;
  try {
    const db = createAdminClient();
    const conv = await conversacionPropia(db, id, quien.userId);
    if (!conv) return NextResponse.json({ error: "No existe ese presupuesto." }, { status: 404 });
    const tarifas = await leerTarifas(db);
    const b = await borradorDe(db, conv, tarifas);
    if (!b) return NextResponse.json({ error: "La conversación no tiene presupuesto." }, { status: 404 });
    if (chatTrabajando(conv)) {
      return NextResponse.json({ error: "El asistente está trabajando en este presupuesto: esperá que termine.", borrador: vistaBorrador(b) }, { status: 409 });
    }
    if (b.version !== parsed.data.version) {
      return NextResponse.json({ error: "El presupuesto cambió (el chat u otra pestaña): te muestro el actual.", borrador: vistaBorrador(b) }, { status: 409 });
    }
    if (b.estado === "descartado") {
      return NextResponse.json({ error: "Este presupuesto se siguió editando en otra conversación.", borrador: vistaBorrador(b) }, { status: 409 });
    }
    const f = parsed.data.formulario;
    // Un render propio sólo puede ser una imagen subida a ESTA conversación.
    if (f.render.eleccion === "propio" && f.render.path && f.render.path !== b.datos.render.path && !f.render.path.startsWith(`adjuntos/${conv.id}/`)) {
      return invalido("Esa imagen no es de este presupuesto.");
    }
    const datos = aplicarFormulario(b.datos, f, { tarifas });
    // El alquiler por piezas (lo arma el chat) necesita la lista vigente.
    const vigente = datos.calculos.alquiler ? await leerListaVigente(db) : null;
    const lista = vigente ? { id: vigente.lista.id, piezas: vigente.piezas } : null;
    const resultado = recalcular(datos, { tarifas, lista, hoy: hoyBA() });
    const nuevo = await guardarBorrador(db, b, { datos, resultado, origen: "panel", patch: { cotizador: f }, autorId: quien.userId });
    return NextResponse.json({ borrador: vistaBorrador(nuevo) });
  } catch (e) {
    if (e instanceof Error && /cambió mientras se guardaba/.test(e.message)) return NextResponse.json({ error: e.message }, { status: 409 });
    return errorResponse(e);
  }
}
