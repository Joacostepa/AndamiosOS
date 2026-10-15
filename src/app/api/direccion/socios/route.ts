import { NextResponse, type NextRequest } from "next/server";
import { exigirSociosApi } from "@/lib/direccion/permisos-servidor";
import { registrarAuditoria } from "@/lib/direccion/auditoria";
import { respuestaPantalla } from "../_comun";

// GET /api/direccion/socios — la pantalla Socios (RespuestaPantalla).
// SÓLO con direccion-socios (proxy + exigirSociosApi). Registra la apertura (§10.4).

export async function GET(req: NextRequest) {
  const s = await exigirSociosApi();
  if (s instanceof NextResponse) return s;
  await registrarAuditoria(s.userId, "abrir_socios", { via: "api" });
  return respuestaPantalla("socios", req);
}
