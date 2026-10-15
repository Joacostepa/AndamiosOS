import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { exigirDireccionApi } from "@/lib/direccion/permisos-servidor";
import { propiosParaUsuario } from "@/lib/direccion/propios-servidor";

// GET /api/direccion/propios — notas, dueños, metas y configuración guardados en Supabase,
// con la sesión de quien pide (la RLS recorta lo reservado). Además, como las páginas, sólo
// devuelve los dueños y notas de las decisiones que esa persona ve y las metas de los
// indicadores que puede ver (sin "retiros" si no es socio). Sin la migración: disponible=false.

export async function GET() {
  const s = await exigirDireccionApi();
  if (s instanceof NextResponse) return s;
  return NextResponse.json(await propiosParaUsuario(await createClient(), s.conSocios));
}
