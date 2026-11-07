import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { soltarTurno, tomarTurno } from "@/lib/asistente/datos";
import { vistaBorrador } from "@/lib/asistente/herramientas";
import { conversacionPropia, contextoHerramientas, correrHerramienta, HERRAMIENTAS_PANTALLA } from "@/lib/cotizador-rapido/servidor";
import { errorResponse, exigirModulo, invalido } from "../../../../_comun";

// POST /api/comercial/asistente/cotizador/:conversacion/accion { nombre, input } — una
// herramienta del asistente llamada desde la pantalla, sin el modelo: el catastro y el conflicto
// de canal al salir de la dirección, buscar clientes, abrir un S0, la vista previa del PDF y
// proponer el guardado (que se confirma con /cotizador/acciones/:id).
//
// Toma el mismo candado que un turno del chat: si el chat está respondiendo, espera (409).

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const schema = z.object({ nombre: z.string().max(60), input: z.record(z.string(), z.unknown()).default({}) });
/** Las que sólo leen no necesitan el candado. */
const SIN_CANDADO = new Set(["buscar_clientes", "ver_cliente", "validar_cuit"]);

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) return invalido("Id inválido");
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalido(parsed.error);
  if (!HERRAMIENTAS_PANTALLA.has(parsed.data.nombre)) return invalido("Esa acción no se puede hacer desde la pantalla.");
  const quien = await exigirModulo("asistente-comercial", "editar");
  if (quien instanceof NextResponse) return quien;

  const db = createAdminClient();
  const conv = await conversacionPropia(db, id, quien.userId);
  if (!conv) return NextResponse.json({ error: "No existe ese presupuesto." }, { status: 404 });
  const candado = !SIN_CANDADO.has(parsed.data.nombre);
  if (candado && !(await tomarTurno(db, conv.id))) {
    return NextResponse.json({ error: "El asistente está trabajando en este presupuesto: esperá que termine." }, { status: 409 });
  }
  try {
    const { ctx: c, eventos } = await contextoHerramientas(db, conv, quien.userId);
    const r = await correrHerramienta(c, parsed.data.nombre, parsed.data.input);
    return NextResponse.json({ ...r, borrador: vistaBorrador(c.borrador), eventos });
  } catch (e) {
    return errorResponse(e);
  } finally {
    if (candado) await soltarTurno(db, conv.id);
  }
}
