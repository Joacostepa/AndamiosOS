import { NextRequest, NextResponse, after } from "next/server";
import { z } from "zod";
import {
  crearAsignaciones,
  actualizarAsignaciones,
  moverAsignaciones,
  borrarAsignaciones,
  otsDeAsignaciones,
  sincronizarFechaProgramada,
  validarRoles,
  cambiarRoles,
} from "@/lib/odoo/asignaciones";
import { textoConflicto, type CambiosDeRol } from "@/lib/tablero/apoyo";
import { OdooError } from "@/lib/odoo/client";
import { createClient } from "@/lib/supabase/server";
import { registrarConfirmacion } from "@/lib/planificacion/confirmaciones";
import { registrarMovimiento } from "@/lib/planificacion/movimientos";
import { ACCIONES } from "@/lib/tablero/tipos-movimiento";
import { VALORES_FRACCION } from "@/lib/tablero/fracciones";

// Escrituras del Tablero de Planificación sobre x_aba_asignacion (Odoo).
//
//   POST   → crear las jornadas de una obra (una asignación por día)
//   PATCH  → actualizar (fracción, estado, cuadrilla, orden), mover un bloque o
//            intercambiar roles principal/apoyo ("Hacer principal")
//   DELETE → sacar del tablero (la obra vuelve a la bandeja de sin asignar)
//
// REGLA DE NEGOCIO: la app es la única que escribe asignaciones; en Odoo se ven en
// solo lectura. Ante conflicto de edición simultánea gana la última escritura.
// Ruta protegida por sesión (no está en publicPaths del middleware).
//
// TODA ESCRITURA DEJA RASTRO en plan_movimientos: quién, cuándo, y cómo estaba el bloque
// antes y después. Se anota ACÁ y no desde el cliente para que no haya forma de mover una
// tarjeta sin registro, y para que el autor salga de la sesión y no del body. El "antes"
// sí lo manda el tablero, que lo tiene en memoria: leerlo de vuelta en Odoo le sumaría
// ~800 ms al gesto que más se repite del módulo. Misma decisión que el `contexto` de las
// confirmaciones, y por el mismo motivo.
//
// EL CAMBIO DE ESTADO NO PASA POR ACÁ: lo registra plan_confirmaciones, con su propia
// granularidad (una fila por jornada) y su propia pantalla. Dos tablas anotando el mismo
// hecho es cómo terminan diciendo cosas distintas.
//
// Toda escritura resincroniza además la fecha programada de la OT afectada, para que
// Comercial pueda contestar "¿cuándo vienen?" desde Odoo sin abrir el tablero (ver
// sincronizarFechaProgramada). Va en `after()`: son 2 o 3 llamadas más a Odoo y el
// tablero se edita en ráfagas, así que no pueden colgarse del camino crítico. La UI ya
// es optimista y no depende de ese dato.

// LOS ROLES DE LA OBRA SE VALIDAN ACÁ (apoyo.md, etapa 2): no puede quedar un apoyo sin
// principal ese día, ni dos principales de la misma obra el mismo día, ni el apoyo en la
// cuadrilla de la principal. Contesta 409 con la frase lista para el toast. Sólo frena lo
// que el gesto EMPEORA: un día que ya venía roto de Odoo no traba a nadie (ver
// conflictosDeApoyo en lib/tablero/apoyo.ts).

export const dynamic = "force-dynamic";

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha YYYY-MM-DD");
// Sale de la escala y no se copia: los valores tienen que coincidir con el selection de
// Odoo, así que el día que se agrega un tamaño tiene que ser un solo cambio acá adentro.
const fraccion = z.enum(VALORES_FRACCION);
const estado = z.enum(["tentativa", "confirmada"]);

/**
 * Lo que el tablero manda para que el gesto quede registrado.
 *
 * Es OPCIONAL en el esquema y no puede no serlo: si faltara, la validación rebotaría el
 * movimiento entero por no poder anotarlo, y el historial pasaría de ser una ayuda a ser
 * un requisito para poder planificar. Lo que se pierde cuando no viene es la línea del
 * historial, no la jornada.
 */
const estadoBloqueSchema = z.object({
  fechas: z.array(fecha),
  cuadrillaId: z.number().int().positive().nullable(),
  cuadrillaNombre: z.string().nullable(),
  fraccion: z.number().positive().optional(),
  motivoFija: z.string().nullable().optional(),
  // El bloque era un apoyo: la frase del historial dice "Sumó el apoyo de…" (tipos-movimiento).
  apoyo: z.boolean().optional(),
  // "Hacer principal": la frase dice "Hizo principal a…" (tipos-movimiento).
  intercambio: z.boolean().optional(),
});

const registroSchema = z.object({
  otId: z.number().int().positive(),
  otTitulo: z.string().nullable(),
  accion: z.enum(ACCIONES),
  antes: estadoBloqueSchema.nullable(),
  despues: estadoBloqueSchema.nullable(),
  deshaceA: z.string().uuid().nullable().optional(),
});


const crearSchema = z.object({
  registro: registroSchema.optional(),
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
        // Cuadrilla de apoyo a la principal de esa obra y ese día (apoyo.md). Ausente = principal.
        apoyo: z.boolean().optional(),
      }),
    )
    .min(1),
});

// Dos formas de PATCH: mismos valores para varios ids, o una fecha distinta por id
// (mover un bloque multi-jornada mueve todos sus días juntos).
const actualizarSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1),
  registro: registroSchema.optional(),
  cambio: z
    .object({
      fecha: fecha.optional(),
      cuadrillaId: z.number().int().positive().nullable().optional(),
      fraccion: fraccion.optional(),
      estado: estado.optional(),
      ordenDia: z.number().int().min(0).optional(),
      notas: z.string().nullable().optional(),
      // El tope es el mismo que el `size` del campo en Odoo: si acá entrara más, Odoo lo
      // cortaría en silencio y el motivo que se guarda no sería el que se escribió.
      motivoFija: z.string().max(300).nullable().optional(),
      // "Hacer principal" / pasar a apoyo.
      apoyo: z.boolean().optional(),
    })
    .refine((c) => Object.keys(c).length > 0, "Nada para actualizar"),
  /**
   * Sólo para el cambio de ESTADO: de qué obra y de qué días son estos ids, para poder
   * anotar quién confirmó sin pagar una lectura más a Odoo. El tablero los tiene a mano
   * —son el bloque que se está tocando— y una consulta de vuelta le sumaría ~800 ms al
   * gesto que más se repite después del arrastre.
   */
  contexto: z
    .object({
      otId: z.number().int().positive(),
      fechas: z.array(fecha),
    })
    .optional(),
});

const moverSchema = z.object({
  registro: registroSchema.optional(),
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

/**
 * "Hacer principal": un rol distinto por id, en UNA request. No entra en `actualizar`
 * (mismos valores para todos) y no puede ir en dos PATCH: el estado del medio —dos
 * principales o un apoyo solo— es justo lo que la validación de roles no deja escribir.
 */
const rolesSchema = z.object({
  registro: registroSchema.optional(),
  roles: z
    .array(z.object({ id: z.number().int().positive(), apoyo: z.boolean() }))
    .min(1),
});

const borrarSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1),
  registro: registroSchema.optional(),
});

/**
 * Anota el gesto y devuelve su id, que el tablero necesita para poder encadenar un
 * "deshacer". Nunca tira: registrarMovimiento se traga su propio error.
 */
async function anotar(
  registro: z.infer<typeof registroSchema> | undefined,
  asignacionIds: number[],
): Promise<string | null> {
  if (!registro) return null;
  const db = await createClient();
  return registrarMovimiento(db, registro, asignacionIds);
}

function errorResponse(e: unknown) {
  const msg = e instanceof OdooError ? e.message : e instanceof Error ? e.message : String(e);
  return NextResponse.json({ error: msg }, { status: 502 });
}

/**
 * 409 si la escritura deja mal los roles de alguna obra; null si se puede seguir.
 *
 * Si la lectura de validación falla, NO se frena la escritura: la validación protege
 * contra un tablero desactualizado, y que Odoo tarde en contestar una lectura no es razón
 * para no dejar planificar. La escritura que sigue va a fallar igual si Odoo está caído.
 */
async function frenoDeRoles(cambios: CambiosDeRol): Promise<NextResponse | null> {
  let conflictos;
  try {
    conflictos = await validarRoles(cambios);
  } catch (e) {
    console.error("[asignaciones] no se pudieron validar los roles de apoyo", e);
    return null;
  }
  if (conflictos.length === 0) return null;
  const frases = [...new Set(conflictos.map((c) => textoConflicto(c)))];
  return NextResponse.json({ error: frases.join(" "), conflictos }, { status: 409 });
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
    const freno = await frenoDeRoles({ crear: parsed.data.asignaciones });
    if (freno) return freno;
    const ids = await crearAsignaciones(parsed.data.asignaciones);
    sincronizarLuego(parsed.data.asignaciones.map((a) => a.otId));
    // Los ids recién existen después de crear, así que el registro va acá y no antes.
    const movimientoId = await anotar(parsed.data.registro, ids);
    return NextResponse.json({ ids, movimientoId });
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
  const esRoles = !!body && typeof body === "object" && "roles" in body;

  if (esRoles) {
    const roles = rolesSchema.safeParse(body);
    if (!roles.success) return invalido(roles.error.issues);
    try {
      const freno = await frenoDeRoles({ roles: roles.data.roles });
      if (freno) return freno;
      const ids = roles.data.roles.map((r) => r.id);
      await cambiarRoles(roles.data.roles);
      // La fecha programada de la OT no cambia (los días son los mismos) y el avance
      // tampoco: cambia quién lleva la obra ese día, no cuántos días tiene.
      const movimientoId = await anotar(roles.data.registro, ids);
      return NextResponse.json({ ok: true, movimientoId });
    } catch (e) {
      return errorResponse(e);
    }
  }

  if (esMover) {
    const mover = moverSchema.safeParse(body);
    if (!mover.success) return invalido(mover.error.issues);
    try {
      const ids = mover.data.movimientos.map((m) => m.id);
      const freno = await frenoDeRoles({ mover: mover.data.movimientos });
      if (freno) return freno;
      await moverAsignaciones(mover.data.movimientos);
      // La OT no cambia al mover, así que se resuelve después de responder junto con la
      // sincronización, sin sumar una lectura al camino crítico.
      sincronizarLuego(otsDeAsignaciones(ids));
      const movimientoId = await anotar(mover.data.registro, ids);
      return NextResponse.json({ ok: true, movimientoId });
    } catch (e) {
      return errorResponse(e);
    }
  }

  const parsed = actualizarSchema.safeParse(body);
  if (!parsed.success) return invalido(parsed.error.issues);

  try {
    const { ids, cambio, contexto, registro } = parsed.data;
    // Sólo lo que puede cambiar roles: día, cuadrilla o el propio rol. Estado, fracción,
    // notas y fijación no leen nada de más (son la mayoría de los PATCH).
    if (cambio.fecha !== undefined || cambio.cuadrillaId !== undefined || cambio.apoyo !== undefined) {
      const freno = await frenoDeRoles({ actualizar: { ids, cambio } });
      if (freno) return freno;
    }
    await actualizarAsignaciones(ids, cambio);
    sincronizarLuego(otsDeAsignaciones(ids));
    const movimientoId = await anotar(registro, ids);

    // El registro de quién confirmó se escribe ACÁ, en la misma request que cambia el
    // estado, y no desde el cliente con una llamada aparte: así no hay forma de cambiar
    // el estado sin dejar rastro, y el autor sale de la sesión y no del body.
    //
    // No va en after() como la sincronización con Odoo: eso es un dato derivado que se
    // puede recalcular, esto es auditoría y si se pierde no se recupera.
    if (cambio.estado && contexto) {
      try {
        const db = await createClient();
        const { data } = await db.auth.getUser();
        await registrarConfirmacion(db, {
          asignacionIds: ids,
          otId: contexto.otId,
          fechas: contexto.fechas,
          estado: cambio.estado,
          autorId: data.user?.id ?? null,
        });
      } catch (e) {
        // El estado YA cambió en Odoo, que es la acción que el usuario pidió: no se la
        // tira abajo porque falló el registro. Pero tampoco se miente — `registrado:
        // false` viaja de vuelta y el tablero avisa que quedó sin firmar.
        console.error("[planificacion] no se pudo registrar la confirmación", e);
        return NextResponse.json({ ok: true, registrado: false, movimientoId });
      }
    }
    return NextResponse.json({ ok: true, movimientoId });
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
    // Sacar una principal sin sus apoyos los dejaría huérfanos: el tablero los manda
    // juntos (volverABandeja, el editor de jornadas) y esto ataja al que no.
    const freno = await frenoDeRoles({ borrar: parsed.data.ids });
    if (freno) return freno;
    await borrarAsignaciones(parsed.data.ids);
    sincronizarLuego(otIds);
    // Se anota DESPUÉS de borrar, con los ids que ya no existen: son justamente lo que
    // hace falta para saber qué se fue del tablero.
    const movimientoId = await anotar(parsed.data.registro, parsed.data.ids);
    return NextResponse.json({ ok: true, movimientoId });
  } catch (e) {
    return errorResponse(e);
  }
}
