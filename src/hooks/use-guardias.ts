"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAcceso } from "@/components/providers/acceso-provider";
import { useUser } from "@/hooks/use-user";
import { accesoDeFila, nivelEn } from "@/lib/auth/acceso";
import { esApoyo } from "@/lib/tablero/apoyo";
import { avisarCambio } from "@/lib/tablero/avisos";
import {
  CLAVE_GUARDIAS,
  CLAVE_SOLICITUDES_GUARDIA,
  CLAVE_TABLERO,
  ErrorApi,
  aplicarOptimista,
  avisarRechazoGuardia,
  nuevoIdTemporal,
  pedir,
  refrescarPronto,
  restarProgreso,
  revertir,
  sumarProgreso,
  type Contexto,
} from "@/hooks/use-tablero";
import type {
  DeshacerUsoGuardia,
  Guardia,
  GuardiasPayload,
  MoverGuardia,
  NuevaSolicitud,
  PedidoUsoGuardia,
  RespuestaSolicitud,
  RespuestaUsoGuardia,
  ResultadoAutorizacion,
  SacarGuardia,
  SolicitudGuardia,
} from "@/lib/tablero/guardias-tipos";
import type { AsignacionTablero, TableroPayload } from "@/lib/tablero/tipos";

// Guardias y pedidos a JS, del lado del navegador (guardias-contrato.md, plan técnico §8).
//
// DOS CLAVES PROPIAS Y NINGUNA BAJO ["tablero"]. La guardia ACTIVA ya viaja en el payload
// del tablero como una tarea tipo 'guardia' —ocupa la celda, el riel y el "N de 6 j" sin que
// nadie tenga que enterarse—, así que lo que se pinta en la grilla se toca optimista ahí,
// con el mismo andamiaje que cualquier otra escritura. Lo que NO es la grilla —la historia,
// las usadas y sacadas, los pedidos a JS— va en ["guardias-tablero", …] y
// ["guardias-solicitudes", …]. Colgarlo de ["tablero"] lo dejaría a merced de
// aplicarOptimista, que reescribe todo lo de esa clave como si fuera el payload de
// asignaciones (la regla del módulo, handoff.md).
//
// TODO LO QUE ESCRIBE EN ODOO VA EN UN LOTE Y SE DESHACE ENTERO: usar una guardia crea o
// mueve las jornadas de la obra Y saca la guardia en una sola llamada (/guardias/usar), y el
// deshacer vuelve las dos cosas en otra (/guardias/deshacer). Nunca "la obra quedó y la
// guardia también".

export { CLAVE_GUARDIAS, CLAVE_SOLICITUDES_GUARDIA };

/** Después de cualquier escritura de guardias cambian la historia, el indicador y la bandeja de JS. */
function invalidarGuardias(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: CLAVE_GUARDIAS });
  void qc.invalidateQueries({ queryKey: CLAVE_SOLICITUDES_GUARDIA });
}

/**
 * Las guardias del rango en TODOS sus estados, su historia y sus pedidos.
 *
 * Mismo rango que el tablero, y por lo mismo: una guardia de la semana que se ve tiene que
 * estar. Conserva los datos previos al ampliar el rango (el scroll), igual que useTablero:
 * sin eso el chip "de guardia" parpadearía cada vez que se carga otra semana.
 */
export function useGuardias(desde: string, hasta: string) {
  return useQuery({
    queryKey: [...CLAVE_GUARDIAS, desde, hasta],
    queryFn: () => pedir<GuardiasPayload>(`/api/planificacion/guardias?desde=${desde}&hasta=${hasta}`),
    enabled: !!desde && !!hasta,
    placeholderData: keepPreviousData,
    // La misma vigencia que el tablero: lo propio invalida al escribir, lo ajeno llega por
    // los avisos en vivo (use-avisos-tablero) y el foco de la pestaña es la red de seguridad.
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    retry: 1,
  });
}

/**
 * Los pedidos a JS. "pendiente" es lo que espera respuesta (el contador del tablero y la
 * bandeja); "todas" trae también los resueltos, para la historia de la bandeja.
 *
 * `habilitado` en false no consulta: el contador sólo existe para quien puede autorizar, y
 * a los demás no hay por qué costarles una lectura por pantalla.
 */
export function useSolicitudesGuardia(estado: "pendiente" | "todas", opts: { habilitado?: boolean } = {}) {
  return useQuery({
    queryKey: [...CLAVE_SOLICITUDES_GUARDIA, estado],
    queryFn: async () =>
      (await pedir<{ solicitudes: SolicitudGuardia[] }>(`/api/planificacion/guardias/solicitudes?estado=${estado}`))
        .solicitudes,
    enabled: opts.habilitado !== false,
    staleTime: 30_000,
    // La bandeja de JS puede quedar abierta toda la mañana: al volver a mirarla tiene que
    // estar al día aunque el aviso en vivo se haya perdido.
    refetchOnWindowFocus: true,
  });
}

/**
 * ¿Quien mira puede autorizar? Sólo JS (módulo explícito `planificacion-autoriza`, sin atajo
 * de admin: contrato §1.3).
 *
 * Sale del PERFIL (useUser) y, mientras no carga, de lo que el layout leyó en el servidor
 * (useAcceso): son la misma fila. Es para ARMAR la pantalla —mostrar "Sacar", la bandeja—;
 * la puerta de verdad la pone el servidor en /guardias/sacar y /guardias/autorizar.
 */
export function usePuedeAutorizar(): boolean {
  const acceso = useAcceso();
  const { data: perfil } = useUser();
  const efectivo = perfil ? accesoDeFila(perfil) : acceso;
  return nivelEn(efectivo, "planificacion-autoriza") === "editar";
}

// ── Usar una guardia ─────────────────────────────────────────────────────────

/**
 * Una obra REEMPLAZA a una o más guardias, en un solo lote (contrato §1.6 y §2.3).
 *
 * OPTIMISTA SOBRE EL TABLERO, como planificar: la tarjeta de la guardia se va y entra la obra
 * —con ids temporales si se crea, en su celda nueva si se mueve— antes de que Odoo conteste.
 * Así un comodín soltado sobre una guardia se ve MOVIDO al instante, no copiado.
 *
 * Si el servidor contesta el 409 del candado (la pantalla estaba vieja y la regla no
 * cumplía), no hay toast rojo: avisarRechazoGuardia le pasa el pedido al board, que ofrece
 * pedirle autorización a JS con el pedido ya armado.
 */
export function useUsarGuardia() {
  const qc = useQueryClient();
  return useMutation<RespuestaUsoGuardia, Error, PedidoUsoGuardia, Contexto>({
    // El cuerpo campo por campo: se ve de un vistazo qué viaja.
    mutationFn: ({ guardiaIds, otId, crear, mover, registro, solicitudId }) =>
      pedir<RespuestaUsoGuardia>("/api/planificacion/guardias/usar", {
        method: "POST",
        body: JSON.stringify({ guardiaIds, otId, crear, mover, registro, solicitudId }),
      }),
    onMutate: async ({ guardiaIds, crear, mover }) => {
      const guardias = new Set(guardiaIds);
      const temporales = (crear ?? []).map(() => nuevoIdTemporal());
      const nuevas: AsignacionTablero[] = (crear ?? []).map((a, i) => ({
        id: temporales[i],
        otId: a.otId,
        fecha: a.fecha,
        cuadrillaId: a.cuadrillaId,
        fraccion: Number(a.fraccion),
        estado: a.estado,
        ordenDia: a.ordenDia,
        notas: a.notas ?? null,
        parteId: null,
        motivoFija: null,
        apoyo: a.apoyo === true,
      }));
      const porId = new Map((mover ?? []).map((m) => [m.id, m]));
      const ctx = await aplicarOptimista(qc, (data: TableroPayload) => ({
        ...data,
        asignaciones: [
          ...data.asignaciones
            // La guardia sale: la obra la reemplaza, no se apila encima.
            .filter((a) => !(a.origen === "tarea" && guardias.has(a.id)))
            .map((a) => {
              const m = a.origen === "tarea" ? undefined : porId.get(a.id);
              if (!m) return a;
              return {
                ...a,
                fecha: m.fecha,
                ...(m.cuadrillaId !== undefined ? { cuadrillaId: m.cuadrillaId } : {}),
                ...(m.ordenDia !== undefined ? { ordenDia: m.ordenDia } : {}),
              };
            }),
          ...nuevas,
        ],
        // Un apoyo no suma días a la obra (apoyo.md); mover no cambia el avance.
        progreso: sumarProgreso(data.progreso, nuevas.filter((n) => !esApoyo(n)).map((n) => n.otId)),
      }));
      return { ...ctx, temporales };
    },
    onSuccess: ({ ids }, { registro }, ctx) => {
      avisarCambio("usó una guardia para", registro?.otTitulo);
      // Los ids reales en cuanto llegan, igual que useCrearAsignaciones: mientras la tarjeta
      // tenga ids negativos no se puede arrastrar ni deshacer.
      const temporales = ctx?.temporales ?? [];
      if (temporales.length === 0 || ids.length !== temporales.length) return;
      const real = new Map(temporales.map((t, i) => [t, ids[i]]));
      qc.setQueriesData<TableroPayload>({ queryKey: CLAVE_TABLERO }, (data) =>
        data
          ? { ...data, asignaciones: data.asignaciones.map((a) => (real.has(a.id) ? { ...a, id: real.get(a.id) as number } : a)) }
          : data,
      );
    },
    onError: (error, { guardiaIds, otId, crear, mover, registro }, ctx) =>
      revertir(
        qc,
        ctx,
        "No se pudo usar la guardia",
        error,
        avisarRechazoGuardia(error, { guardiaIds, otId, crear, mover, registro }),
      ),
    onSettled: () => {
      refrescarPronto(qc);
      invalidarGuardias(qc);
    },
  });
}

/**
 * Vuelve el lote entero: borra lo que el uso creó, devuelve lo que movió y la guardia queda
 * otra vez activa. `restaurar` NO viaja al servidor: son las tarjetas de las guardias tal
 * como estaban, para que vuelvan a la grilla al instante en vez de esperar al refresco.
 */
export function useDeshacerUsoGuardia() {
  const qc = useQueryClient();
  return useMutation<
    { ok: true },
    Error,
    DeshacerUsoGuardia & { restaurar?: AsignacionTablero[]; otTitulo?: string | null },
    Contexto
  >({
    mutationFn: ({ loteId, guardiaIds, borrar, volver }) =>
      pedir<{ ok: true }>("/api/planificacion/guardias/deshacer", {
        method: "POST",
        body: JSON.stringify({ loteId, guardiaIds, borrar, volver }),
      }),
    onMutate: ({ borrar, volver, restaurar }) => {
      const fuera = new Set(borrar ?? []);
      const porId = new Map((volver ?? []).map((m) => [m.id, m]));
      return aplicarOptimista(qc, (data) => {
        const borradas = data.asignaciones.filter((a) => a.origen !== "tarea" && fuera.has(a.id));
        const vivas = new Set(data.asignaciones.map((a) => a.id));
        return {
          ...data,
          asignaciones: [
            ...data.asignaciones
              .filter((a) => !(a.origen !== "tarea" && fuera.has(a.id)))
              .map((a) => {
                const m = a.origen === "tarea" ? undefined : porId.get(a.id);
                if (!m) return a;
                return {
                  ...a,
                  fecha: m.fecha,
                  ...(m.cuadrillaId !== undefined ? { cuadrillaId: m.cuadrillaId } : {}),
                  ...(m.ordenDia !== undefined ? { ordenDia: m.ordenDia } : {}),
                };
              }),
            // Sin duplicar: si el refresco ya la trajo de vuelta, no se agrega dos veces.
            ...(restaurar ?? []).filter((g) => !vivas.has(g.id)),
          ],
          progreso: restarProgreso(data.progreso, borradas.filter((a) => !esApoyo(a)).map((a) => a.otId)),
        };
      });
    },
    onSuccess: (_d, { otTitulo }) => avisarCambio("deshizo el uso de una guardia", otTitulo),
    onError: (error, _vars, ctx) => revertir(qc, ctx, "No se pudo deshacer", error),
    onSettled: () => {
      refrescarPronto(qc);
      invalidarGuardias(qc);
    },
  });
}

// ── Correr y sacar ───────────────────────────────────────────────────────────

/** Correrla dentro de la misma semana (contrato §1.3, punto 5). Optimista: la tarjeta salta ya. */
export function useMoverGuardia() {
  const qc = useQueryClient();
  return useMutation<{ ok: true; guardia: Guardia }, Error, MoverGuardia, Contexto>({
    mutationFn: ({ guardiaId, fecha, cuadrillaId }) =>
      pedir<{ ok: true; guardia: Guardia }>("/api/planificacion/guardias/mover", {
        method: "POST",
        body: JSON.stringify({ guardiaId, fecha, cuadrillaId }),
      }),
    onMutate: ({ guardiaId, fecha, cuadrillaId }) =>
      aplicarOptimista(qc, (data) => ({
        ...data,
        asignaciones: data.asignaciones.map((a) =>
          a.origen === "tarea" && a.id === guardiaId ? { ...a, fecha, cuadrillaId } : a,
        ),
      })),
    onSuccess: () => avisarCambio("corrió una guardia"),
    onError: (error, _vars, ctx) => revertir(qc, ctx, "No se pudo correr la guardia", error),
    onSettled: () => {
      refrescarPronto(qc);
      invalidarGuardias(qc);
    },
  });
}

/** Sólo JS. Sacada no se repone esa semana (contrato §1.2). */
export function useSacarGuardia() {
  const qc = useQueryClient();
  return useMutation<{ ok: true }, Error, SacarGuardia, Contexto>({
    mutationFn: ({ guardiaId, motivo }) =>
      pedir<{ ok: true }>("/api/planificacion/guardias/sacar", {
        method: "POST",
        body: JSON.stringify({ guardiaId, motivo }),
      }),
    onMutate: ({ guardiaId }) =>
      aplicarOptimista(qc, (data) => ({
        ...data,
        asignaciones: data.asignaciones.filter((a) => !(a.origen === "tarea" && a.id === guardiaId)),
      })),
    onSuccess: () => avisarCambio("sacó una guardia"),
    onError: (error, _vars, ctx) => revertir(qc, ctx, "No se pudo sacar la guardia", error),
    onSettled: () => {
      refrescarPronto(qc);
      invalidarGuardias(qc);
    },
  });
}

// ── Pedidos a JS ─────────────────────────────────────────────────────────────

/**
 * "Pedir autorización". NO toca el tablero: hasta que JS responda, la guardia sigue puesta
 * (contrato §1.3). Si ya había un pedido pendiente igual, el servidor contesta 409 con el
 * existente; eso no es un error para quien pidió —lo que quería ya está pedido— y vuelve
 * como `yaEstaba`.
 */
export function usePedirAutorizacion() {
  const qc = useQueryClient();
  return useMutation<
    { solicitud: SolicitudGuardia; yaEstaba: boolean; autorizacion: ResultadoAutorizacion | null },
    Error,
    NuevaSolicitud
  >({
    mutationFn: async ({ guardiaId, tipo, motivo, pedido, autoaprobar }) => {
      try {
        const r = await pedir<{ solicitud: SolicitudGuardia; autorizacion: ResultadoAutorizacion | null }>(
          "/api/planificacion/guardias/solicitudes",
          { method: "POST", body: JSON.stringify({ guardiaId, tipo, motivo, pedido, autoaprobar }) },
        );
        return { solicitud: r.solicitud, yaEstaba: false, autorizacion: r.autorizacion ?? null };
      } catch (e) {
        const existente = e instanceof ErrorApi && e.status === 409
          ? (e.cuerpo as { solicitud?: SolicitudGuardia } | null)?.solicitud
          : undefined;
        if (existente) return { solicitud: existente, yaEstaba: true, autorizacion: null };
        throw e;
      }
    },
    onSuccess: (r) => {
      // JS autorizándose: el tablero cambió (la obra entró), como al aprobar desde la bandeja.
      if (r.autorizacion?.ejecutada) {
        avisarCambio("autorizó una guardia", r.solicitud.otTitulo);
        refrescarPronto(qc);
      } else {
        avisarCambio("le pidió autorización a JS por una guardia");
      }
    },
    onSettled: () => invalidarGuardias(qc),
  });
}

/** Quien pidió, mientras siga pendiente, se puede arrepentir. */
export function useCancelarSolicitud() {
  const qc = useQueryClient();
  return useMutation<{ ok: true }, Error, { solicitudId: string }>({
    mutationFn: ({ solicitudId }) =>
      pedir<{ ok: true }>("/api/planificacion/guardias/solicitudes", {
        method: "DELETE",
        body: JSON.stringify({ solicitudId }),
      }),
    onSettled: () => invalidarGuardias(qc),
  });
}

/**
 * JS aprueba o rechaza. Al aprobar, el servidor EJECUTA lo pedido (saca la guardia, o pone
 * la obra en su lugar): el tablero cambia, así que además de los pedidos se refresca la
 * grilla. Si no se pudo ejecutar solo (la grilla cambió), queda aprobada y habilitada para
 * quien pidió: lo dice `ejecutada: false` y `solicitud.errorEjecucion`.
 */
export function useResponderSolicitud() {
  const qc = useQueryClient();
  return useMutation<ResultadoAutorizacion, Error, RespuestaSolicitud>({
    mutationFn: ({ solicitudId, aprobar, respuesta }) =>
      pedir<ResultadoAutorizacion>("/api/planificacion/guardias/autorizar", {
        method: "POST",
        body: JSON.stringify({ solicitudId, aprobar, respuesta: respuesta?.trim() || null }),
      }),
    onSuccess: (r, { aprobar }) => {
      if (aprobar && r.ejecutada) {
        avisarCambio("autorizó una guardia", r.solicitud.otTitulo);
        refrescarPronto(qc);
      }
    },
    onSettled: () => invalidarGuardias(qc),
  });
}

/**
 * El "Deshacer" de lo que se acaba de aprobar, en el mismo toast (contrato §1.6: el uso es un
 * lote que se deshace entero, también si lo aprobó JS). Qué se borra y adónde vuelve lo sabe
 * el servidor: acá viaja sólo el lote.
 */
export function useOfrecerDeshacerAprobado() {
  const deshacer = useDeshacerUsoGuardia();
  return (r: ResultadoAutorizacion, titulo: string) => {
    const uso = r.uso;
    toast.success(titulo, {
      description: uso ? "La obra ya usa la guardia en el tablero." : "La guardia se sacó.",
      duration: uso ? 10_000 : undefined,
      action: uso
        ? {
            label: "Deshacer",
            onClick: () =>
              deshacer.mutate(
                { loteId: uso.loteId, guardiaIds: uso.guardiaIds, otTitulo: r.solicitud.otTitulo },
                {
                  onSuccess: () => toast.success("Deshecho: la guardia volvió a estar libre"),
                },
              ),
          }
        : undefined,
    });
  };
}
