import type { NextRequest } from "next/server";
import { respuestaPantalla } from "../_comun";

// GET /api/direccion/calle — la pantalla calculada (RespuestaPantalla), con lo reservado ya
// recortado según quien pide.

export async function GET(req: NextRequest) {
  return respuestaPantalla("calle", req);
}
