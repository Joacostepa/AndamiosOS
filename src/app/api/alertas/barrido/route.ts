import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { fetchBandeja } from "@/lib/habilitaciones/servicio";
import { fetchOtsUrgentes } from "@/lib/odoo/ordenes";
import { claveDe, crearAlertas } from "@/lib/alertas/servicio";
import { OdooError } from "@/lib/odoo/client";

// GET/POST /api/alertas/barrido — el cron que hace que los avisos lleguen solos.
//
// POR QUÉ EXISTE. Los tres avisos hablan de OTs, y las OTs viven en Odoo: no hay fila de
// Supabase que insertar, así que no hay trigger que los dispare. Sin este barrido, "OT
// nueva" sólo aparecería cuando alguien abriera la bandeja de habilitaciones —o sea, el
// aviso llegaría después de la pantalla que venía a reemplazar— y "urgente" sólo
// avisaría lo que se marcó desde la app, ignorando lo que se marque directo en Odoo.
//
// ES IDEMPOTENTE Y ESA ES TODA LA GRACIA: `alertas.clave` tiene un índice único, así que
// el barrido no lleva registro de qué ya avisó. Puede correr diez veces por día, dos
// veces en paralelo, o volver a correr después de un deploy caído en el medio, y no
// duplica nada. La alternativa —un puntero de "hasta acá avisé"— se desincroniza en
// silencio y nadie se entera hasta que falta un aviso.
//
// GET además de POST porque Vercel Cron dispara con GET.

export const dynamic = "force-dynamic";
// fetchBandeja lee las OTs activas y sus permisos de Odoo (~4 RPCs de 800 ms) y siembra
// las cabeceras que falten. Con 64 OTs activas sobra, pero el margen es barato.
export const maxDuration = 120;

/** Service role: el cron no trae cookies, y sin sesión no hay política de insert que pase. */
function servicio() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

function autorizado(req: NextRequest): boolean {
  const esperado = process.env.CRON_SECRET;
  // Fallar cerrado: sin secreto configurado no corre nadie. Este endpoint escribe.
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

  const db = servicio();

  try {
    // 1. OTs nuevas. No se cuentan acá: fetchBandeja siembra las cabeceras que falten y
    //    crea el aviso en el mismo paso, porque es el único lugar que tiene los títulos.
    //    Llamarla desde el cron es lo que hace que la OT que entró un domingo avise el
    //    lunes a las nueve, y no cuando alguien se acuerde de abrir la bandeja.
    const bandeja = await fetchBandeja(db);

    // 2. OTs urgentes marcadas directamente en Odoo. Las que se marcan desde la app ya
    //    avisaron en el momento; esto cubre a quien entra por el otro lado.
    const urgentes = await fetchOtsUrgentes();
    const creadasUrgentes = await crearAlertas(
      db,
      urgentes.map((o) => ({
        tipo: "ot_urgente" as const,
        clave: claveDe("ot_urgente", o.id),
        titulo: `Urgente — ${o.titulo}`,
        descripcion: o.motivo,
        prioridad: "critica" as const,
        enlace: `/ordenes-trabajo/${o.id}`,
      })),
    );

    return NextResponse.json({
      otsActivas: bandeja.total,
      urgentesEnOdoo: urgentes.length,
      avisosDeUrgenciaCreados: creadasUrgentes,
    });
  } catch (e) {
    const msg = e instanceof OdooError ? e.message : e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

export const GET = correr;
export const POST = correr;
