import type { NextRequest } from "next/server";
import { respuestaPantalla } from "../_comun";

// GET /api/direccion/ventas — la pantalla calculada (RespuestaPantalla), con lo reservado ya
// recortado según quien pide.

export async function GET(req: NextRequest) {
  return respuestaPantalla("ventas", req);
}

// Calcula en vivo contra Odoo: La semana y Ventas pueden pasar los 10–15 s del límite por defecto de Vercel.
export const maxDuration = 300;
