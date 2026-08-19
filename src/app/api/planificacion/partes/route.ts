import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { cerrarJornada, editarParte, fetchParte } from "@/lib/odoo/partes";
import { OdooError } from "@/lib/odoo/client";

// Cierre de jornada desde el tablero.
//
//   GET   ?parteId=123   → el parte con sus líneas (ver / editar)
//   POST  { asignacionId, datos } → crea el parte y marca la jornada como cerrada
//   PATCH { parteId, otId, datos } → reescribe un parte ya cargado
//
// REGLA DE NEGOCIO: la app nunca manda costos ni horas-hombre; los calcula Odoo con la
// tarifa vigente a esa fecha. Odoo sigue siendo editable en paralelo: ante conflicto de
// edición simultánea, gana la última escritura.

export const dynamic = "force-dynamic";

const hora = z.number().min(0).max(24);

const lineaManoObra = z.object({
  tarea: z.enum(["armado", "desarme", "carga_descarga"]),
  personas: z.number().int().min(1),
  horaDesde: hora,
  horaHasta: hora,
});

const datosSchema = z
  .object({
    fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    cuadrillaId: z.number().int().positive().nullable(),
    punteroId: z.number().int().positive().nullable(),
    estado: z.enum(["ejecutado", "no_ejecutado"]),
    motivoNoEjec: z
      .enum(["lluvia", "cliente", "permiso", "material", "personal", "reprogramada", "otro"])
      .nullable(),
    sector: z.string().nullable(),
    clima: z.string().nullable(),
    objetivo: z.string().nullable(),
    tareas: z.string().nullable(),
    observaciones: z.string().nullable(),
    manoObra: z.array(lineaManoObra),
    flete: z
      .object({
        cantidad: z.number().int().min(0),
        tercerizado: z.boolean(),
        costoManual: z.number().min(0).optional(),
      })
      .nullable(),
    incidencias: z.array(
      z.object({
        // Los valores son los de la selección real de Odoo: uno fuera de lista se rechaza.
        tipo: z.enum(["clima", "rotura_material", "accidente", "parada_obra", "problema_cliente", "otro"]),
        descripcion: z.string(),
      }),
    ),
    fotos: z.array(
      z.object({
        nombre: z.string(),
        base64: z.string().min(1),
        momento: z.enum(["antes", "durante", "final", "incidencia", "entrega"]),
        descripcion: z.string().nullable().optional(),
      }),
    ),
  })
  // El motivo es obligatorio cuando no se ejecutó: es el dato que permite medir después
  // cuántas jornadas se pierden por lluvia o por el cliente.
  .refine((d) => d.estado === "ejecutado" || !!d.motivoNoEjec, {
    message: "Falta el motivo de no ejecución",
  })
  .refine((d) => d.manoObra.every((l) => l.horaHasta > l.horaDesde), {
    message: "La hora de fin tiene que ser posterior a la de inicio",
  });

function errorResponse(e: unknown) {
  const msg = e instanceof OdooError ? e.message : e instanceof Error ? e.message : String(e);
  return NextResponse.json({ error: msg }, { status: 502 });
}

export async function GET(req: NextRequest) {
  const parteId = Number(req.nextUrl.searchParams.get("parteId"));
  if (!Number.isInteger(parteId) || parteId <= 0) {
    return NextResponse.json({ error: "Parámetro 'parteId' inválido" }, { status: 400 });
  }
  try {
    const parte = await fetchParte(parteId);
    if (!parte) return NextResponse.json({ error: "El parte no existe" }, { status: 404 });
    return NextResponse.json({ parte });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = z
    .object({
      asignacionId: z.number().int().positive(),
      datos: datosSchema,
      // Sólo se manda cuando la persona contestó que la obra terminó. Ausente = la OT
      // no se cierra: cerrar de más esconde trabajo, cerrar de menos sólo acumula.
      finalizarOt: z.boolean().optional(),
    })
    .safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => i.message).join(" · ") },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json(
      await cerrarJornada(parsed.data.asignacionId, parsed.data.datos, parsed.data.finalizarOt),
    );
  } catch (e) {
    return errorResponse(e);
  }
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = z
    .object({
      parteId: z.number().int().positive(),
      otId: z.number().int().positive(),
      datos: datosSchema,
    })
    .safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => i.message).join(" · ") },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json(
      await editarParte(parsed.data.parteId, parsed.data.datos, parsed.data.otId),
    );
  } catch (e) {
    return errorResponse(e);
  }
}
