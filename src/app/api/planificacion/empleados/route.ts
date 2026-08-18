import { NextResponse } from "next/server";
import { fetchEmpleados } from "@/lib/odoo/partes";
import { OdooError } from "@/lib/odoo/client";

// GET /api/planificacion/empleados — candidatos a puntero para el parte.
// Cambian muy poco, así que del lado del cliente se cachean por un rato largo.

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ empleados: await fetchEmpleados() });
  } catch (e) {
    const msg = e instanceof OdooError ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
