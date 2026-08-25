import { NextRequest, NextResponse, after } from "next/server";
import { z } from "zod";
import {
  crearAsignaciones,
  actualizarAsignaciones,
  moverAsignaciones,
  borrarAsignaciones,
  otsDeAsignaciones,
  sincronizarFechaProgramada,
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
//
// Toda escritura resincroniza además la fecha programada de la OT afectada, para que
// Comercial pueda contestar "¿cuándo vienen?" desde Odoo sin abrir el tablero (ver
// sincronizarFechaProgramada). Va en `after()`: son 2 o 3 llamadas más a Odoo y el
// tablero se edita en ráfagas, así que no pueden colgarse del camino crítico. La UI ya
// es optimista y no depende de ese dato.

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
  // Con el campo adelante: "Invalid input" a secas, que es lo que llegaba al toast, no
  // alcanza para saber qué mandó mal la pantalla.
  const detalle = issues.map((i) =>
    i.path.length > 0 ? `${i.path.join(".")}: ${i.message}` : i.message,
  );
  return NextResponse.json({ error: detalle.join(" · ") }, { status: 400 });
}

/**
 * Resincroniza la fecha de las OTs después de responder. Un fallo acá no puede tirar
 * abajo la escritura de la asignación, que es lo que el usuario pidió: se registra y la
 * próxima edición de esa obra lo corrige, porque la fecha se recalcula entera cada vez.
 */
function sincronizarLuego(otIds: number[] | Promise<number[]>) {
  after(async () => {
    try {
      await sincronizarFechaProgramada(await otIds);
    } catch (e) {
      console.error("[asignaciones] no se pudo sincronizar la fecha de la OT", e);
    }
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = crearSchema.safeParse(body);
  if (!parsed.success) return invalido(parsed.error.issues);

  try {
    const ids = await crearAsignaciones(parsed.data.asignaciones);
    sincronizarLuego(parsed.data.asignaciones.map((a) => a.otId));
    return NextResponse.json({ ids });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null);

  // Cuál de las dos formas es se decide por la CLAVE, no probando una y cayendo en la
  // otra. Probando, un payload de mover con algo inválido adentro terminaba reportando
  // los errores del OTRO esquema —"falta ids", "falta cambio"—, que es lo que llegaba al
  // toast: un mensaje que no dice nada de lo que realmente estaba mal.
  const esMover = !!body && typeof body === "object" && "movimientos" in body;

  if (esMover) {
    const mover = moverSchema.safeParse(body);
    if (!mover.success) return invalido(mover.error.issues);
    try {
      await moverAsignaciones(mover.data.movimientos);
      // La OT no cambia al mover, así que se resuelve después de responder junto con la
      // sincronización, sin sumar una lectura al camino crítico.
      sincronizarLuego(otsDeAsignaciones(mover.data.movimientos.map((m) => m.id)));
      return NextResponse.json({ ok: true });
    } catch (e) {
      return errorResponse(e);
    }
  }

  const parsed = actualizarSchema.safeParse(body);
  if (!parsed.success) return invalido(parsed.error.issues);

  try {
    await actualizarAsignaciones(parsed.data.ids, parsed.data.cambio);
    sincronizarLuego(otsDeAsignaciones(parsed.data.ids));
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
    // Acá SÍ hay que leer antes: una vez borradas no hay forma de saber de qué OT eran,
    // y es justo el caso en que la fecha de la OT tiene que limpiarse.
    const otIds = await otsDeAsignaciones(parsed.data.ids);
    await borrarAsignaciones(parsed.data.ids);
    sincronizarLuego(otIds);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
