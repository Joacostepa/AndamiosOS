import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  crearAsignaciones,
  actualizarAsignaciones,
  moverAsignaciones,
  borrarAsignaciones,
} from "@/lib/odoo/asignaciones";
import { OdooError } from "@/lib/odoo/client";

// Escrituras del Tablero de Planificación sobre x_aba_asignacion (Odoo).
//
//   POST   → crear las jornadas de una obra (una asignación por día)
//   PATCH  → actualizar (fracción, estado, cuadrilla, orden) o mover un bloque
//   DELETE → sacar del tablero (la obra vuelve a la bandeja de sin asignar)
//
// REGLA DE NEGOCIO: la app es la única que escribe asignaciones; en Odoo se ven en
// solo lectura. Ante conflicto de edición simultánea gana la última escritura.
// Ruta protegida por sesión (no está en publicPaths del middleware).

export const dynamic = "force-dynamic";

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha YYYY-MM-DD");
const fraccion = z.enum(["0.10", "0.25", "0.50", "0.75", "1"]);
const estado = z.enum(["tentativa", "confirmada"]);

const crearSchema = z.object({
  asignaciones: z
    .array(
      z.object({
        otId: z.number().int().positive(),
        fecha,
        cuadrillaId: z.number().int().positive().nullable(),
        fraccion,
        estado,
        ordenDia: z.number().int().min(0),
        notas: z.string().nullable().optional(),
      }),
    )
    .min(1),
});

// Dos formas de PATCH: mismos valores para varios ids, o una fecha distinta por id
// (mover un bloque multi-jornada mueve todos sus días juntos).
const actualizarSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1),
  cambio: z
    .object({
      fecha: fecha.optional(),
      cuadrillaId: z.number().int().positive().nullable().optional(),
      fraccion: fraccion.optional(),
      estado: estado.optional(),
      ordenDia: z.number().int().min(0).optional(),
      notas: z.string().nullable().optional(),
    })
    .refine((c) => Object.keys(c).length > 0, "Nada para actualizar"),
});

const moverSchema = z.object({
  movimientos: z
    .array(
      z.object({
        id: z.number().int().positive(),
        fecha,
        cuadrillaId: z.number().int().positive().nullable().optional(),
        ordenDia: z.number().int().min(0).optional(),
      }),
    )
    .min(1),
});

const borrarSchema = z.object({ ids: z.array(z.number().int().positive()).min(1) });

function errorResponse(e: unknown) {
  const msg = e instanceof OdooError ? e.message : e instanceof Error ? e.message : String(e);
  return NextResponse.json({ error: msg }, { status: 502 });
}

function invalido(issues: z.ZodIssue[]) {
  return NextResponse.json({ error: issues.map((i) => i.message).join(" · ") }, { status: 400 });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = crearSchema.safeParse(body);
  if (!parsed.success) return invalido(parsed.error.issues);

  try {
    const ids = await crearAsignaciones(parsed.data.asignaciones);
    return NextResponse.json({ ids });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null);

  const mover = moverSchema.safeParse(body);
  if (mover.success) {
    try {
      await moverAsignaciones(mover.data.movimientos);
      return NextResponse.json({ ok: true });
    } catch (e) {
      return errorResponse(e);
    }
  }

  const parsed = actualizarSchema.safeParse(body);
  if (!parsed.success) return invalido(parsed.error.issues);

  try {
    await actualizarAsignaciones(parsed.data.ids, parsed.data.cambio);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = borrarSchema.safeParse(body);
  if (!parsed.success) return invalido(parsed.error.issues);

  try {
    await borrarAsignaciones(parsed.data.ids);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
