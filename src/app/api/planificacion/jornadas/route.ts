import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  fetchListadoJornadas,
  contarPendientes,
  crearJornadaNoPlanificada,
  reprogramarJornada,
} from "@/lib/odoo/jornadas";
import { OdooError } from "@/lib/odoo/client";
import { celdasDeAsignaciones } from "@/lib/odoo/asignaciones";
import { exigirPermisoDeApi } from "@/lib/auth/servidor";
import { frenoDeGuardias } from "@/lib/planificacion/candado-guardias";
import { VALORES_FRACCION } from "@/lib/tablero/fracciones";
import { hoyBA } from "@/lib/tablero/dias-habiles";

// Listado de partes diarios.
//
//   GET  ?fecha=YYYY-MM-DD   → las jornadas de ese día + las tentativas vencidas
//   GET  ?pendientes=1       → sólo el contador para el badge del sidebar
//   POST { otId, fecha, ... }→ jornada no planificada (trabajo de urgencia)
//   POST { asignacionId, reprogramarA } → crea la jornada nueva de una reprogramación (y, con
//        apoyoIds, vuelve a crear esos apoyos en la fecha nueva)
//
// El parte en sí se guarda por /api/planificacion/partes: es el mismo cierre de siempre.
//
// LAS DOS ESCRITURAS PASAN POR EL CANDADO DE LAS GUARDIAS (guardias-contrato.md §1.3): una
// reprogramación o una jornada no planificada que cae en la celda de una guardia activa
// contesta 409 RechazoCandado, como el resto de las rutas que escriben asignaciones. El POST
// arranca con exigirPermisoDeApi (segunda llave, la misma regla que el proxy).

export const dynamic = "force-dynamic";
// El listado son varias consultas a Odoo Online, que a ~800 ms cada una rozan el default
// de la plataforma en un día cargado.
export const maxDuration = 300;

const fechaSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha YYYY-MM-DD");

function errorResponse(e: unknown) {
  const msg = e instanceof OdooError ? e.message : e instanceof Error ? e.message : String(e);
  return NextResponse.json({ error: msg }, { status: 502 });
}

/**
 * Hoy del lado del servidor, EN BUENOS AIRES. El listado depende de qué día es para decidir
 * qué mostrar, y el servidor corre en UTC: con la fecha UTC, de 21 a 24 h de acá el listado
 * ya creía que era mañana (y las tentativas de hoy aparecían como vencidas).
 */
function hoyISO(): string {
  return hoyBA();
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
  fraccion: z.enum(VALORES_FRACCION),
});

const reprogramarSchema = z.object({
  asignacionId: z.number().int().positive(),
  reprogramarA: fechaSchema,
  /** Las jornadas de apoyo del día perdido que se recrean en la fecha nueva (apoyo.md). */
  apoyoIds: z.array(z.number().int().positive()).max(20).optional(),
});

export async function POST(req: NextRequest) {
  const quien = await exigirPermisoDeApi(req);
  if (quien instanceof NextResponse) return quien;
  const body = await req.json().catch(() => null);

  const repro = reprogramarSchema.safeParse(body);
  if (repro.success) {
    // La jornada nueva va a la cuadrilla de la original (y cada apoyo a la suya), en la fecha
    // nueva: ésas son las celdas que el candado tiene que mirar.
    let celdas;
    try {
      celdas = await celdasDeAsignaciones([repro.data.asignacionId, ...(repro.data.apoyoIds ?? [])]);
    } catch (e) {
      console.error("[jornadas] no se pudo leer la jornada para el candado", e);
      return NextResponse.json({ error: "No pude comprobar las guardias: probá de nuevo." }, { status: 503 });
    }
    const original = celdas.find((c) => c.id === repro.data.asignacionId);
    const candado = await frenoDeGuardias(
      celdas.map((c) => ({ cuadrillaId: c.cuadrillaId, fecha: repro.data.reprogramarA })),
      { otId: original?.otId ?? undefined },
    );
    if (candado) return candado;
    try {
      const r = await reprogramarJornada(repro.data.asignacionId, repro.data.reprogramarA, repro.data.apoyoIds);
      return NextResponse.json({ asignacionId: r.id, apoyos: r.apoyos });
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
  const candado = await frenoDeGuardias([{ cuadrillaId: parsed.data.cuadrillaId, fecha: parsed.data.fecha }], { otId: parsed.data.otId });
  if (candado) return candado;
  try {
    return NextResponse.json({ asignacionId: await crearJornadaNoPlanificada(parsed.data) });
  } catch (e) {
    return errorResponse(e);
  }
}
