import { NextResponse } from "next/server";
import { odooVersion, authenticate, searchCount, OdooError } from "@/lib/odoo/client";

// GET /api/odoo/health — diagnóstico de la conexión con Odoo.
//
// DECISIÓN: Hace 3 chequeos incrementales para que el error sea autoexplicativo:
//   1) version()      → ¿llegamos al servidor? (problema de ODOO_URL / red)
//   2) authenticate() → ¿las credenciales son válidas? (ODOO_DB/USERNAME/API_KEY)
//   3) searchCount    → ¿el usuario tiene permiso de lectura? (cuenta res.partner)
//
// NOTA: Endpoint temporal de setup. Antes de producción conviene protegerlo o quitarlo.
export async function GET() {
  try {
    const version = await odooVersion();

    let uid: number;
    try {
      uid = await authenticate();
    } catch (e) {
      const msg = e instanceof OdooError ? e.message : String(e);
      return NextResponse.json(
        {
          ok: false,
          paso: "autenticacion",
          conexion: { ok: true, server_version: version.server_version },
          error: msg,
        },
        { status: 502 },
      );
    }

    const partners = await searchCount("res.partner");

    return NextResponse.json({
      ok: true,
      conexion: { ok: true, server_version: version.server_version },
      autenticacion: { ok: true, uid },
      acceso: { ok: true, res_partner_count: partners },
    });
  } catch (e) {
    const msg = e instanceof OdooError ? e.message : String(e);
    return NextResponse.json(
      { ok: false, paso: "conexion", error: msg },
      { status: 502 },
    );
  }
}
