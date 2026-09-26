import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { leerCriterio, leerListas, leerParametros, leerProductos } from "@/lib/parametros-cotizacion/servidor";
import { db, errorResponse, invalido } from "../_comun";

// GET   /api/comercial/parametros — tarifas, productos de Odoo y qué lista y criterio rigen.
// PATCH /api/comercial/parametros — cambiar un parámetro (con motivo, queda en el historial).

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const cliente = await db();
    const [parametros, productos, listas, criterio] = await Promise.all([
      leerParametros(cliente),
      leerProductos(cliente),
      leerListas(cliente),
      leerCriterio(cliente),
    ]);
    const vigente = listas.find((l) => l.vigente) ?? null;
    return NextResponse.json({
      parametros,
      productos,
      listaVigente: vigente ? { id: vigente.id, nombre: vigente.nombre, vigente_desde: vigente.vigente_desde, piezas: vigente.piezas } : null,
      criterioVigente: criterio ? { version: criterio.version, created_at: criterio.created_at } : null,
    });
  } catch (e) {
    return errorResponse(e);
  }
}

const numero = z.number().finite().nullable().optional();

const schema = z.object({
  clave: z.string().min(1).max(80),
  valor: numero,
  valor_min: numero,
  valor_max: numero,
  texto: z.string().max(500).nullable().optional(),
  vigente_desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida").nullable().optional(),
  motivo: z.string().trim().min(3, "Contá por qué cambia (queda en el historial)").max(500),
});

export async function PATCH(req: NextRequest) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalido(parsed.error);
  const b = parsed.data;
  if (b.valor_min != null && b.valor_max != null && b.valor_min > b.valor_max) {
    return invalido("El mínimo del rango no puede ser mayor que el máximo");
  }
  try {
    const cliente = await db();
    const { data, error } = await cliente.rpc("cotizacion_parametro_actualizar", {
      p_clave: b.clave,
      p_valor: b.valor ?? null,
      p_valor_min: b.valor_min ?? null,
      p_valor_max: b.valor_max ?? null,
      p_texto: b.texto ?? null,
      p_vigente_desde: b.vigente_desde ?? null,
      p_motivo: b.motivo,
    });
    if (error) throw error;
    return NextResponse.json({ parametro: data });
  } catch (e) {
    return errorResponse(e);
  }
}
