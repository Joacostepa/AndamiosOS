import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  fetchListadoJornadas,
  contarPendientes,
  crearJornadaNoPlanificada,
  reprogramarJornada,
} from "@/lib/odoo/jornadas";
import { OdooError } from "@/lib/odoo/client";

// Listado de partes diarios.
//
//   GET  ?fecha=YYYY-MM-DD   → las jornadas de ese día + las tentativas vencidas
//   GET  ?pendientes=1       → sólo el contador para el badge del sidebar
//   POST { otId, fecha, ... }→ jornada no planificada (trabajo de urgencia)
//   POST { asignacionId, reprogramarA } → crea la jornada nueva de una reprogramación
//
// El parte en sí se guarda por /api/planificacion/partes: es el mismo cierre de siempre.

export const dynamic = "force-dynamic";
// El listado son varias consultas a Odoo Online, que a ~800 ms cada una rozan el default
// de la plataforma en un día cargado.
export const maxDuration = 300;

const fechaSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha YYYY-MM-DD");

function errorResponse(e: unknown) {
  const msg = e instanceof OdooError ? e.message : e instanceof Error ? e.message : String(e);
  return NextResponse.json({ error: msg }, { status: 502 });
}

/** Hoy del lado del servidor. El listado depende de qué día es para decidir qué mostrar. */
function hoyISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  const hoy = hoyISO();

  if (req.nextUrl.searchParams.get("pendientes")) {
    try {
      return NextResponse.json({ pendientes: await contarPendientes(hoy) });
    } catch (e) {
      return errorResponse(e);
    }
  }

  const fecha = req.nextUrl.searchParams.get("fecha") ?? "";
  if (!fechaSchema.safeParse(fecha).success) {
    return NextResponse.json({ error: "Parámetro 'fecha' inválido" }, { status: 400 });
  }
  try {
    return NextResponse.json(await fetchListadoJornadas(fecha, hoy));
  } catch (e) {
    return errorResponse(e);
  }
}

const noPlanificadaSchema = z.object({
  otId: z.number().int().positive(),
  fecha: fechaSchema,
  cuadrillaId: z.number().int().positive().nullable(),
  fraccion: z.enum(["0.10", "0.25", "0.50", "0.75", "1"]),
});

const reprogramarSchema = z.object({
  asignacionId: z.number().int().positive(),
  reprogramarA: fechaSchema,
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);

  const repro = reprogramarSchema.safeParse(body);
  if (repro.success) {
    try {
      const id = await reprogramarJornada(repro.data.asignacionId, repro.data.reprogramarA);
      return NextResponse.json({ asignacionId: id });
    } catch (e) {
      return errorResponse(e);
    }
  }

  const parsed = noPlanificadaSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => i.message).join(" · ") },
      { status: 400 },
    );
  }
  try {
    return NextResponse.json({ asignacionId: await crearJornadaNoPlanificada(parsed.data) });
  } catch (e) {
    return errorResponse(e);
  }
}
