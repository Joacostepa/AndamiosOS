import { NextRequest, NextResponse } from "next/server";
import { geocodificarObras } from "@/lib/odoo/geocodificar";
import { OdooError } from "@/lib/odoo/client";

// GET/POST /api/operaciones/geocodificar — el cron que mantiene el Mapa de Obras al día.
//
// POR QUÉ EXISTE. Una obra entra al mapa cuando tiene coordenadas, y las coordenadas no
// vienen con la dirección: hay que pedírselas a Google. Sin esto, cada obra nueva quedaría
// fuera del mapa hasta que alguien se acordara de correr el script a mano — o sea, nunca.
//
// POR QUÉ NO ES UN CRON DE ODOO, que es donde uno lo buscaría: el sandbox de Odoo Online no
// deja hacer llamadas HTTP salientes desde una acción de servidor. Un cron ahí no podría
// llamar a Google. Éste es el lado que sí puede salir a internet.
//
// ES IDEMPOTENTE: `x_obra_geo_dir` recuerda contra qué texto se geocodificó cada obra, así
// que correr de más no cuesta nada. Puede dispararse dos veces, o volver a correr después de
// un deploy caído en el medio, sin gastar consultas ni pisar nada.
//
// GET además de POST porque Vercel Cron dispara con GET.

export const dynamic = "force-dynamic";
// Cada obra es una consulta a Google de ~300 ms más un write a Odoo. En régimen son unas
// pocas por día; el margen es para la primera corrida después de un alta grande.
export const maxDuration = 300;

function autorizado(req: NextRequest): boolean {
  const esperado = process.env.CRON_SECRET;
  // Fallar cerrado: sin secreto configurado no corre nadie. Este endpoint escribe en Odoo
  // y gasta consultas pagas de Google.
  if (!esperado) return false;
  return (
    req.headers.get("authorization") === `Bearer ${esperado}` ||
    req.headers.get("x-cron-secret") === esperado
  );
}

async function correr(req: NextRequest) {
  if (!autorizado(req)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  try {
    const r = await geocodificarObras();
    // Los fallos se devuelven, no se tragan: una obra que Google no resuelve queda fuera
    // del mapa para siempre y en silencio si nadie la nombra en algún lado.
    return NextResponse.json(r);
  } catch (e) {
    const msg = e instanceof OdooError ? e.message : e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

export const GET = correr;
export const POST = correr;
