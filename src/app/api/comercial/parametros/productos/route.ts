import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { leerProductos, verificarProductosEnOdoo } from "@/lib/parametros-cotizacion/servidor";
import { errorResponse, exigirModulo } from "../../_comun";

// POST /api/comercial/parametros/productos — chequear contra Odoo que los productos con los
// que el asistente arma las órdenes sigan existiendo y activos.
//
// La escritura es con service role porque no es una edición de nadie: es una foto de Odoo
// (ver verificarProductosEnOdoo). Por eso se exige el permiso acá también, no sólo en el proxy.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST() {
  const quien = await exigirModulo("parametros-cotizacion", "editar");
  if (quien instanceof NextResponse) return quien;
  try {
    const admin = createAdminClient();
    const resultado = await verificarProductosEnOdoo(admin);
    return NextResponse.json({ ...resultado, productos: await leerProductos(admin) });
  } catch (e) {
    return errorResponse(e);
  }
}
