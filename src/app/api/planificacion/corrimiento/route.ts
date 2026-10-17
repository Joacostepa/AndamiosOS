import { NextRequest, NextResponse, after } from "next/server";
import { z } from "zod";
import {
  apoyosNoBorrables,
  borrarAsignaciones,
  correrAsignaciones,
  crearAsignaciones,
  asignacionesNoMovibles,
  otsDeAsignaciones,
  sincronizarFechaProgramada,
} from "@/lib/odoo/asignaciones";
import { OdooError } from "@/lib/odoo/client";
import { createClient } from "@/lib/supabase/server";
import { registrarCorrimiento } from "@/lib/planificacion/movimientos";
import { levantarLote, marcarSuspension } from "@/lib/planificacion/suspensiones";
import { VALORES_FRACCION } from "@/lib/tablero/fracciones";

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

//
// LOS APOYOS (apoyo.md, etapa 3). Los que se corren con su principal viajan en
// `movimientos` como cualquier jornada. Los que se QUITAN —su cuadrilla no sale y la
// principal sí— viajan en `quitar`, y el deshacer los vuelve a crear con `crear`. Las dos
// listas aceptan sólo apoyos: este gesto no puede borrar ni crear una principal.

export const dynamic = "force-dynamic";

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha YYYY-MM-DD");

const estadoBloqueSchema = z.object({
  fechas: z.array(fecha),
  cuadrillaId: z.number().int().positive().nullable(),
  cuadrillaNombre: z.string().nullable(),
  fraccion: z.number().positive().optional(),
  motivoFija: z.string().nullable().optional(),
  apoyo: z.boolean().optional(),
});

const cuerpo = z.object({
  /** Por qué se suspendió el día. Queda en las filas del historial. */
  motivo: z.string().trim().min(1, "Falta el motivo").max(120),
  movimientos: z
    .array(z.object({ id: z.number().int().positive(), fecha }))
    // Un corrimiento grande son decenas de jornadas; mil es un tablero entero y no puede
    // salir de este gesto. El tope existe para que un bug del cliente no dispare una
    // escritura masiva contra Odoo, no porque el número signifique algo.
    // Puede venir vacío si lo único que pasa es que se quitan apoyos (se suspendió una
    // cuadrilla que ese día sólo iba de apoyo): ver el refine de abajo.
    .max(1000),
  /** Apoyos que se borran porque su cuadrilla no sale y su principal sí. */
  quitar: z.array(z.number().int().positive()).max(200).optional(),
  /** Deshacer: los apoyos quitados, vueltos a crear. Sólo apoyos. */
  crear: z
    .array(
      z.object({
        otId: z.number().int().positive(),
        fecha,
        cuadrillaId: z.number().int().positive(),
        fraccion: z.enum(VALORES_FRACCION),
        estado: z.enum(["tentativa", "confirmada"]),
        ordenDia: z.number().int(),
        notas: z.string().nullable().optional(),
        apoyo: z.literal(true),
      }),
    )
    .max(200)
    .optional(),
  /** Las filas del historial de esos apoyos ("quitar" o "crear"), emparejadas con `crear`. */
  registrosApoyo: z
    .array(
      z.object({
        otId: z.number().int().positive(),
        otTitulo: z.string().nullable(),
        accion: z.enum(["quitar", "crear"]),
        asignacionIds: z.array(z.number().int().positive()),
        antes: estadoBloqueSchema.nullable(),
        despues: estadoBloqueSchema.nullable(),
      }),
    )
    .max(200)
    .optional(),
  registros: z
    .array(
      z.object({
        otId: z.number().int().positive(),
        otTitulo: z.string().nullable(),
        asignacionIds: z.array(z.number().int().positive()),
        antes: estadoBloqueSchema,
        despues: estadoBloqueSchema,
      }),
    ),
  /**
   * Deshacer: a qué fila del lote original corresponde cada obra. Llega como objeto
   * porque JSON no tiene Map; las claves son ids de OT.
   */
  deshaceA: z.record(z.string(), z.string().uuid()).optional(),
  /** Qué día y qué cuadrillas quedan marcadas como suspendidas en el tablero. */
  suspension: z
    .object({ dia: fecha, cuadrillaIds: z.array(z.number().int().positive()).max(100) })
    .optional(),
  /** Deshacer: el lote del corrimiento original, para levantar sus marcas. */
  levantaLote: z.string().uuid().optional(),
}).refine(
  (c) => c.movimientos.length > 0 || (c.quitar?.length ?? 0) > 0 || (c.crear?.length ?? 0) > 0,
  { message: "No hay nada para correr" },
);

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = cuerpo.safeParse(body);
  if (!parsed.success) {
    const detalle = parsed.error.issues.map((i) =>
      i.path.length > 0 ? `${i.path.join(".")}: ${i.message}` : i.message,
    );
    return NextResponse.json({ error: detalle.join(" · ") }, { status: 400 });
  }

  const { movimientos, registros, deshaceA, motivo, suspension, levantaLote } = parsed.data;
  const quitar = parsed.data.quitar ?? [];
  const crear = parsed.data.crear ?? [];
  const registrosApoyo = parsed.data.registrosApoyo ?? [];

  try {
    // SE COMPRUEBA ANTES DE ESCRIBIR NADA y se rechaza el corrimiento ENTERO, no las
    // jornadas trabadas. Aplicar la mitad dejaría el tablero en un estado que nadie
    // eligió, y encima el que corrió el día creería que salió bien. Mejor que vuelva a
    // mirar con el tablero fresco.
    const [trabadas, noBorrables] = await Promise.all([
      asignacionesNoMovibles(movimientos.map((m) => m.id)),
      apoyosNoBorrables(quitar),
    ]);
    if (noBorrables.length > 0) {
      return NextResponse.json(
        {
          error:
            `${noBorrables.length} apoyo${noBorrables.length === 1 ? "" : "s"} no se puede${noBorrables.length === 1 ? "" : "n"} ` +
            `quitar (${noBorrables[0].motivo}). Refrescá el tablero y volvé a correr el día.`,
          trabadas: noBorrables,
        },
        { status: 409 },
      );
    }
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

    // Primero se corre (al deshacer, eso devuelve la principal a su día) y después se
    // quitan o se recrean los apoyos: un apoyo recreado antes que su principal vuelva
    // quedaría un instante sin obra ese día.
    const escrituras = movimientos.length > 0 ? await correrAsignaciones(movimientos) : 0;
    if (quitar.length > 0) await borrarAsignaciones(quitar);
    const creados = await crearAsignaciones(crear);
    // A cada fila "crear" del historial, el id que Odoo le dio a su apoyo (van emparejadas
    // por orden con `crear`).
    let iCreado = 0;
    const filasApoyo = registrosApoyo.map((r) =>
      r.accion === "crear" ? { ...r, asignacionIds: creados[iCreado] ? [creados[iCreado++]] : [] } : r,
    );

    // La fecha programada de cada obra afectada, para que Comercial pueda contestar
    // "¿cuándo vienen?" desde Odoo. Va después de responder: son varias llamadas más y el
    // tablero ya está actualizado de forma optimista.
    after(async () => {
      try {
        // Los apoyos quitados no cambian la fecha de la obra (no cuentan días).
        await sincronizarFechaProgramada(await otsDeAsignaciones(movimientos.map((m) => m.id)));
      } catch (e) {
        console.error("[corrimiento] no se pudo sincronizar la fecha de las OTs", e);
      }
    });

    const db = await createClient();
    const lote = await registrarCorrimiento(db, registros, {
      motivo,
      apoyos: filasApoyo,
      deshaceA: deshaceA
        ? new Map(Object.entries(deshaceA).map(([ot, id]) => [Number(ot), id]))
        : undefined,
    });

    // La marca del día suspendido. Si falla, las jornadas ya se corrieron: se anota y
    // no se rechaza el gesto, igual que el registro del historial.
    try {
      if (suspension) {
        const { data } = await db.auth.getUser();
        await marcarSuspension(
          db,
          { fecha: suspension.dia, cuadrillaIds: suspension.cuadrillaIds, motivo, loteId: lote?.loteId ?? null },
          data.user?.id ?? null,
        );
      }
      if (levantaLote) await levantarLote(db, levantaLote);
    } catch (e) {
      console.error("[corrimiento] no se pudo marcar o levantar el día suspendido", e);
    }

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
