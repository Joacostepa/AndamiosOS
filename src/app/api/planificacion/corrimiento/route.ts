import { NextRequest, NextResponse, after } from "next/server";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  apoyosNoBorrables,
  borrarAsignaciones,
  celdasDeAsignaciones,
  correrAsignaciones,
  crearAsignaciones,
  asignacionesNoMovibles,
  otsDeAsignaciones,
  sincronizarFechaProgramada,
  type CeldaAsignacion,
} from "@/lib/odoo/asignaciones";
import { OdooError } from "@/lib/odoo/client";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { exigirPermisoDeApi } from "@/lib/auth/servidor";
import { frenoDeGuardias, frenoParaMover } from "@/lib/planificacion/candado-guardias";
import {
  activasEnCeldas,
  avisarA,
  consumirPorLluvia,
  destinatariosPlanificacion,
  reactivarDeLote,
  siglasDe,
} from "@/lib/planificacion/guardias";
import { registrarCorrimiento } from "@/lib/planificacion/movimientos";
import { levantarLote, marcarSuspension } from "@/lib/planificacion/suspensiones";
import { VALORES_FRACCION } from "@/lib/tablero/fracciones";
import { siguienteDiaLaboral } from "@/lib/tablero/bloques";
import { hoyBA } from "@/lib/tablero/dias-habiles";
import { claveCelda, diaCorto } from "@/lib/tablero/guardias";

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
//
// LAS GUARDIAS (guardias-contrato.md §1.4). Lo que el corrimiento hace caer sobre una guardia
// activa la CONSUME: pasa a "usada (lluvia)" con el lote del corrimiento, y el deshacer
// (levantaLote) la vuelve a "activa". El tablero manda lo que vio (`consumirGuardias`,
// `reactivarGuardias`), pero EL SERVIDOR ES LA AUTORIDAD: lee de Odoo la cuadrilla de cada
// jornada que se corre, busca las guardias activas de las celdas destino y consume ésas,
// aunque el tablero no las haya mandado (un tablero viejo no puede dejar una guardia activa
// debajo de una obra). La respuesta suma `guardiasConsumidas`.
//
// QUÉ PUEDE MOVER ESTE GESTO (revisión de seguridad del 18/10). El plan lo arma el tablero,
// pero esta ruta es la única que mueve jornadas sobre una guardia sin pasar por el candado (la
// lluvia la consume), así que el servidor comprueba que el pedido SEA un corrimiento:
//   · sin `levantaLote` (correr): tiene que venir `suspension`, cada jornada tiene que estar
//     HOY en Odoo en el día suspendido o después, en una cuadrilla suspendida (o ser un apoyo,
//     que va con su principal), e ir al día laboral siguiente, que es lo único que hace
//     planearCorrimiento. Los apoyos que se quitan, del día suspendido. `crear` no se acepta;
//   · con `levantaLote` (deshacer): el lote tiene que existir, cada jornada vuelve al día que
//     ese lote anotó y cada apoyo recreado es uno que ese lote quitó. Y lo que vuelve pasa por
//     el candado común (frenoParaMover, frenoDeGuardias): un deshacer no apila nada sobre una
//     guardia que se puso mientras tanto. Las que el lote consumió no frenan: están "usadas".
// Sin esto, un `levantaLote` inventado movía cualquier obra encima de una guardia activa, y
// un "corrimiento" de una sola jornada de cualquier día consumía la guardia como lluvia.

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
  /** Las guardias que el tablero vio consumidas (planearCorrimiento). Orientativo: ver arriba. */
  consumirGuardias: z.array(z.number().int().positive()).max(100).optional(),
  /** Deshacer: las guardias que el corrimiento consumió (invertirCorrimiento). */
  reactivarGuardias: z.array(z.number().int().positive()).max(100).optional(),
}).refine(
  (c) => c.movimientos.length > 0 || (c.quitar?.length ?? 0) > 0 || (c.crear?.length ?? 0) > 0,
  { message: "No hay nada para correr" },
);

export async function POST(req: NextRequest) {
  const quien = await exigirPermisoDeApi(req);
  if (quien instanceof NextResponse) return quien;
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

    const adm = createAdminClient();
    const celdas = new Map((await celdasDeAsignaciones([...movimientos.map((m) => m.id), ...quitar])).map((c) => [c.id, c]));
    const fuera = levantaLote
      ? await fueraDelDeshacer(adm, levantaLote, movimientos, crear, quitar)
      : fueraDelCorrimiento(celdas, movimientos, quitar, crear, suspension);
    if (fuera) return fuera;

    // Las guardias que esto consume, según la base y no según el tablero: dónde está cada
    // jornada (cuadrilla) se lee de Odoo ANTES de correrla, y se buscan las guardias activas
    // de las celdas a las que va. Al deshacer no se consume nada (se reactivan, abajo). Si no
    // se puede leer, NO se corre: correr igual dejaría una guardia activa debajo de una obra.
    const porGuardia = new Map<number, number[]>();
    if (!levantaLote && movimientos.length > 0) {
      const destinos = movimientos
        .map((m) => ({ id: m.id, cuadrillaId: celdas.get(m.id)?.cuadrillaId ?? null, fecha: m.fecha }))
        .filter((d): d is { id: number; cuadrillaId: number; fecha: string } => d.cuadrillaId != null);
      const activas = await activasEnCeldas(adm, destinos, hoyBA());
      for (const g of activas) {
        porGuardia.set(
          g.id,
          destinos.filter((d) => claveCelda(d.cuadrillaId, d.fecha) === claveCelda(g.cuadrillaId, g.fecha)).map((d) => d.id),
        );
      }
      const vistas = new Set(parsed.data.consumirGuardias ?? []);
      const distintas = [...porGuardia.keys()].filter((id) => !vistas.has(id)).length + [...vistas].filter((id) => !porGuardia.has(id)).length;
      if (distintas > 0) console.warn(`[corrimiento] el tablero vio otras guardias que la base (${distintas} de diferencia): manda la base`);
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
    // EL LOTE LO GENERA LA RUTA y no el registro del historial: si ese registro falla, la
    // marca del día y las guardias consumidas igual quedan con el lote, y el deshacer
    // (levantaLote) las encuentra. Antes una falla del historial dejaba la guardia "usada
    // (lluvia)" sin lote y el deshacer no la devolvía nunca.
    const loteId = crypto.randomUUID();
    const lote = await registrarCorrimiento(db, registros, {
      motivo,
      apoyos: filasApoyo,
      loteId,
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
          { fecha: suspension.dia, cuadrillaIds: suspension.cuadrillaIds, motivo, loteId },
          data.user?.id ?? null,
        );
      }
      if (levantaLote) await levantarLote(db, levantaLote);
    } catch (e) {
      console.error("[corrimiento] no se pudo marcar o levantar el día suspendido", e);
    }

    // Las guardias: consumir (con el lote, para que el deshacer las encuentre) o, al
    // deshacer, reactivar las de ese lote. Las jornadas ya se corrieron: no se rechaza el
    // gesto. Consumir se REINTENTA una vez y, si tampoco sale, se le avisa a Planificación:
    // una guardia que queda activa debajo de una obra no se ve en ningún lado, y el log solo
    // no lo lee nadie.
    let guardiasConsumidas: number[] = [];
    if (porGuardia.size > 0) {
      const consumir = () => consumirPorLluvia(adm, [...porGuardia.keys()], loteId, quien.userId, porGuardia);
      try {
        guardiasConsumidas = await consumir();
      } catch (e) {
        console.error("[corrimiento] no se pudieron consumir las guardias; se reintenta", e);
        try {
          guardiasConsumidas = await consumir();
        } catch (e2) {
          console.error("[corrimiento] tampoco al reintentar: se avisa a Planificación", e2);
          await avisarGuardiasSinConsumir(adm, [...porGuardia.keys()], loteId);
        }
      }
    }
    if (levantaLote) {
      try {
        await reactivarDeLote(adm, levantaLote, parsed.data.reactivarGuardias ?? null, quien.userId);
      } catch (e) {
        console.error("[corrimiento] no se pudieron reactivar las guardias", e);
      }
    }

    return NextResponse.json({
      ok: true,
      escrituras,
      loteId,
      // Con qué fila del historial quedó anotada cada obra: es lo que el tablero necesita
      // para que el deshacer pueda decir "esto deshace aquello".
      filas: lote ? Object.fromEntries(lote.porOt) : {},
      // Las guardias que este corrimiento usó (según la base). El deshacer las manda de
      // vuelta en `reactivarGuardias`, aunque lo que manda es el lote.
      guardiasConsumidas,
    });
  } catch (e) {
    const msg = e instanceof OdooError ? e.message : e instanceof Error ? e.message : String(e);
    // 502 y no 500: el que falló es Odoo. El tablero NO revierte con este error —una
    // escritura agrupada puede haberse aplicado a medias— sino que vuelve a pedir el
    // tablero, que es la única fuente que sabe cómo quedó.
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

/**
 * ¿Es esto un corrimiento de verdad? (ver "QUÉ PUEDE MOVER ESTE GESTO" arriba). null si sí;
 * si no, el 400/409 con el porqué. `celdas`: dónde está HOY en Odoo cada jornada tocada.
 */
function fueraDelCorrimiento(
  celdas: ReadonlyMap<number, CeldaAsignacion>,
  movimientos: readonly { id: number; fecha: string }[],
  quitar: readonly number[],
  crear: readonly unknown[],
  suspension: { dia: string; cuadrillaIds: number[] } | undefined,
): NextResponse | null {
  if (!suspension) return NextResponse.json({ error: "Falta el día que se suspende." }, { status: 400 });
  if (crear.length > 0) {
    return NextResponse.json({ error: "Correr el día no crea jornadas: eso sólo pasa al deshacerlo." }, { status: 400 });
  }
  const suspendidas = new Set(suspension.cuadrillaIds);
  const refrescar = (texto: string) =>
    NextResponse.json({ error: `${texto} Refrescá el tablero y volvé a correr el día.` }, { status: 409 });
  for (const m of movimientos) {
    const a = celdas.get(m.id);
    if (!a || !a.fecha) return refrescar("Una de las jornadas ya no existe.");
    if (a.fecha < suspension.dia) return refrescar("Una de las jornadas es de antes del día suspendido.");
    if (!a.apoyo && (a.cuadrillaId == null || !suspendidas.has(a.cuadrillaId))) {
      return refrescar("Una de las jornadas es de una cuadrilla que no se suspendió.");
    }
    if (m.fecha !== siguienteDiaLaboral(a.fecha)) return refrescar("Una de las jornadas no va al día siguiente.");
  }
  for (const id of quitar) {
    const a = celdas.get(id);
    if (!a || a.fecha !== suspension.dia || a.cuadrillaId == null || !suspendidas.has(a.cuadrillaId)) {
      return refrescar("Uno de los apoyos a quitar no es del día suspendido.");
    }
  }
  return null;
}

type FilaLote = { accion: string; odoo_ot_id: number; asignacion_ids: number[] | null; antes: { fechas?: string[]; cuadrillaId?: number | null } | null };

/**
 * ¿Es esto el deshacer de ESE lote? null si sí. El lote tiene que existir (en el historial, en
 * la marca del día o en las guardias que consumió); si su historial está, cada jornada vuelve
 * al día que anotó y cada apoyo recreado es uno que quitó. Y todo pasa por el candado común:
 * un deshacer no pone nada encima de una guardia activa.
 */
async function fueraDelDeshacer(
  adm: SupabaseClient,
  loteId: string,
  movimientos: { id: number; fecha: string }[],
  crear: { otId: number; fecha: string; cuadrillaId: number }[],
  quitar: readonly number[],
): Promise<NextResponse | null> {
  if (quitar.length > 0) return NextResponse.json({ error: "Deshacer un corrimiento no quita apoyos." }, { status: 400 });
  const [mov, sus, gua] = await Promise.all([
    adm.from("plan_movimientos").select("accion, odoo_ot_id, asignacion_ids, antes").eq("lote_id", loteId).is("deshace_a", null),
    adm.from("plan_suspensiones").select("id").eq("lote_id", loteId).limit(1),
    adm.from("tablero_tareas").select("id").eq("tipo", "guardia").eq("guardia_lote_id", loteId).limit(1),
  ]);
  if (mov.error || sus.error || gua.error) {
    console.error("[corrimiento] no se pudo leer el lote a deshacer", mov.error ?? sus.error ?? gua.error);
    return NextResponse.json({ error: "No pude comprobar el corrimiento a deshacer: probá de nuevo." }, { status: 503 });
  }
  const filas = (mov.data ?? []) as FilaLote[];
  if (filas.length === 0 && (sus.data ?? []).length === 0 && (gua.data ?? []).length === 0) {
    return NextResponse.json({ error: "No encontré ese corrimiento: refrescá el tablero." }, { status: 409 });
  }
  if (filas.length > 0) {
    const vuelveA = new Map<number, string>();
    for (const f of filas) {
      if (f.accion !== "correr") continue;
      (f.asignacion_ids ?? []).forEach((id, i) => {
        const fecha = f.antes?.fechas?.[i];
        if (fecha) vuelveA.set(Number(id), fecha);
      });
    }
    if (movimientos.some((m) => vuelveA.get(m.id) !== m.fecha)) {
      return NextResponse.json({ error: "Ese deshacer no coincide con lo que corrió el día: refrescá el tablero." }, { status: 409 });
    }
    const quitados = filas.filter((f) => f.accion === "quitar");
    const esQuitado = (c: { otId: number; fecha: string; cuadrillaId: number }) =>
      quitados.some((f) => Number(f.odoo_ot_id) === c.otId && f.antes?.cuadrillaId === c.cuadrillaId && (f.antes?.fechas ?? []).includes(c.fecha));
    if (crear.some((c) => !esQuitado(c))) {
      return NextResponse.json({ error: "Ese deshacer crea un apoyo que el corrimiento no había quitado: refrescá el tablero." }, { status: 409 });
    }
  }
  const freno = movimientos.length > 0 ? await frenoParaMover(movimientos) : null;
  if (freno) return freno;
  for (const c of crear) {
    const f = await frenoDeGuardias([{ cuadrillaId: c.cuadrillaId, fecha: c.fecha }], { otId: c.otId, esApoyo: true });
    if (f) return f;
  }
  return null;
}

/** El último recurso si la guardia no se pudo marcar como usada: que Planificación lo sepa. */
async function avisarGuardiasSinConsumir(adm: SupabaseClient, guardiaIds: number[], loteId: string): Promise<void> {
  try {
    const { data } = await adm.from("tablero_tareas").select("id, fecha, cuadrilla_odoo_id").in("id", guardiaIds);
    const filas = (data ?? []) as { id: number; fecha: string; cuadrilla_odoo_id: number }[];
    const sigla = await siglasDe(filas.map((f) => Number(f.cuadrilla_odoo_id)));
    const donde = filas.map((f) => `${diaCorto(f.fecha)} ${sigla(Number(f.cuadrilla_odoo_id))}`).join(", ") || "una guardia";
    await avisarA(adm, "guardia_problema", await destinatariosPlanificacion(adm), {
      claveBase: `guardia_problema:${loteId}`,
      titulo: `El corrimiento cayó sobre una guardia y no la pude marcar como usada (${donde})`,
      descripcion: "La obra ya se corrió. La guardia sigue figurando libre debajo: abrila en el tablero y revisala.",
      enlace: filas[0] ? `/planificacion?fecha=${filas[0].fecha}` : "/planificacion",
      prioridad: "alta",
    });
  } catch (e) {
    console.error("[corrimiento] tampoco se pudo avisar", e);
  }
}
