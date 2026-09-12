import { NextRequest, NextResponse, after } from "next/server";
import { z } from "zod";
import {
  correrAsignaciones,
  asignacionesNoMovibles,
  otsDeAsignaciones,
  sincronizarFechaProgramada,
} from "@/lib/odoo/asignaciones";
import { OdooError } from "@/lib/odoo/client";
import { createClient } from "@/lib/supabase/server";
import { registrarCorrimiento } from "@/lib/planificacion/movimientos";

// POST /api/planificacion/corrimiento → suspender un día y correr lo que había.
//
// RUTA PROPIA Y NO EL PATCH DE ASIGNACIONES, aunque las dos muevan jornadas. Tres cosas la
// separan, y ninguna entra bien en la otra:
//
//   · la ESCRITURA se agrupa por fecha destino (ver correrAsignaciones): un corrimiento
//     manda muchas jornadas al mismo día, y de a una serían treinta y cuatro segundos;
//   · el REGISTRO es un lote de filas, una por obra, atadas por lote_id — no una sola;
//   · la GUARDA de las fijas se lee de Odoo antes de escribir, y es la única del módulo
//     que no puede confiar en lo que manda el cliente.
//
// QUÉ SE CALCULA DÓNDE: el plan entero —qué jornada va a qué día, qué se rompe— lo hace el
// tablero con planearCorrimiento y lo manda hecho. Es la misma decisión que el `antes` de
// los registros y por el mismo motivo: el cliente ya tiene el tablero en memoria y
// releerlo acá le sumaría segundos al gesto. Lo que NO se delega es la guarda de arriba
// (podría venir de un tablero con atraso) ni el autor del registro, que sale de la sesión.

export const dynamic = "force-dynamic";

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha YYYY-MM-DD");

const estadoBloqueSchema = z.object({
  fechas: z.array(fecha),
  cuadrillaId: z.number().int().positive().nullable(),
  cuadrillaNombre: z.string().nullable(),
  fraccion: z.number().positive().optional(),
  motivoFija: z.string().nullable().optional(),
});

const cuerpo = z.object({
  /** Por qué se suspendió el día. Queda en las filas del historial. */
  motivo: z.string().trim().min(1, "Falta el motivo").max(120),
  movimientos: z
    .array(z.object({ id: z.number().int().positive(), fecha }))
    .min(1)
    // Un corrimiento grande son decenas de jornadas; mil es un tablero entero y no puede
    // salir de este gesto. El tope existe para que un bug del cliente no dispare una
    // escritura masiva contra Odoo, no porque el número signifique algo.
    .max(1000),
  registros: z
    .array(
      z.object({
        otId: z.number().int().positive(),
        otTitulo: z.string().nullable(),
        asignacionIds: z.array(z.number().int().positive()),
        antes: estadoBloqueSchema,
        despues: estadoBloqueSchema,
      }),
    )
    .min(1),
  /**
   * Deshacer: a qué fila del lote original corresponde cada obra. Llega como objeto
   * porque JSON no tiene Map; las claves son ids de OT.
   */
  deshaceA: z.record(z.string(), z.string().uuid()).optional(),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = cuerpo.safeParse(body);
  if (!parsed.success) {
    const detalle = parsed.error.issues.map((i) =>
      i.path.length > 0 ? `${i.path.join(".")}: ${i.message}` : i.message,
    );
    return NextResponse.json({ error: detalle.join(" · ") }, { status: 400 });
  }

  const { movimientos, registros, deshaceA, motivo } = parsed.data;

  try {
    // SE COMPRUEBA ANTES DE ESCRIBIR NADA y se rechaza el corrimiento ENTERO, no las
    // jornadas trabadas. Aplicar la mitad dejaría el tablero en un estado que nadie
    // eligió, y encima el que corrió el día creería que salió bien. Mejor que vuelva a
    // mirar con el tablero fresco.
    const trabadas = await asignacionesNoMovibles(movimientos.map((m) => m.id));
    if (trabadas.length > 0) {
      return NextResponse.json(
        {
          error:
            `${trabadas.length} jornada${trabadas.length === 1 ? "" : "s"} no se pueden mover ` +
            `(${trabadas[0].motivo}). Refrescá el tablero: alguien las fijó o cargó el parte ` +
            `mientras mirabas.`,
          trabadas,
        },
        { status: 409 },
      );
    }

    const escrituras = await correrAsignaciones(movimientos);

    // La fecha programada de cada obra afectada, para que Comercial pueda contestar
    // "¿cuándo vienen?" desde Odoo. Va después de responder: son varias llamadas más y el
    // tablero ya está actualizado de forma optimista.
    after(async () => {
      try {
        await sincronizarFechaProgramada(await otsDeAsignaciones(movimientos.map((m) => m.id)));
      } catch (e) {
        console.error("[corrimiento] no se pudo sincronizar la fecha de las OTs", e);
      }
    });

    const db = await createClient();
    const lote = await registrarCorrimiento(db, registros, {
      motivo,
      deshaceA: deshaceA
        ? new Map(Object.entries(deshaceA).map(([ot, id]) => [Number(ot), id]))
        : undefined,
    });

    return NextResponse.json({
      ok: true,
      escrituras,
      loteId: lote?.loteId ?? null,
      // Con qué fila del historial quedó anotada cada obra: es lo que el tablero necesita
      // para que el deshacer pueda decir "esto deshace aquello".
      filas: lote ? Object.fromEntries(lote.porOt) : {},
    });
  } catch (e) {
    const msg = e instanceof OdooError ? e.message : e instanceof Error ? e.message : String(e);
    // 502 y no 500: el que falló es Odoo. El tablero NO revierte con este error —una
    // escritura agrupada puede haberse aplicado a medias— sino que vuelve a pedir el
    // tablero, que es la única fuente que sabe cómo quedó.
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
