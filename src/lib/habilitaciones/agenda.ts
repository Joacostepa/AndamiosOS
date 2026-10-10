// La planificación vista desde Habilitaciones: qué obras van cada día y si están listas.
//
// Lógica pura, sin React ni red: junta el payload del tablero (Odoo) con la bandeja de
// habilitaciones, que la página ya tiene cargada. Así el panel no pide nada que no se esté
// pidiendo ya, y esto se puede probar con datos reales desde un script.
//
// NO ES LA GRILLA DEL TABLERO. La grilla cruza cuadrillas con días porque su pregunta es
// quién va a dónde; la de Habilitaciones es qué viene y si está habilitado, y eso se
// contesta con una lista por día.

import { direccionDeObra, partesTitulo } from "@/lib/tablero/titulo";
import type { EstadoAsignacion, TableroPayload } from "@/lib/tablero/tipos";
import type { Bandeja, FilaBandeja, UrgenciaOt } from "./tipos";

export type EstadoHabAgenda =
  | { clave: "habilitada" }
  | { clave: "pospuesta"; hasta: string }
  | { clave: "sin_habilitar" };

export type TarjetaAgenda = {
  asignacionId: number;
  otId: number;
  direccion: string;
  /**
   * Sale del título de la OT ("Armado · S02525 · Estudio De Maio Patiño"), igual que en la
   * tarjeta del tablero y en la bandeja: el payload del tablero no trae el cliente aparte.
   * Null en los títulos que no lo incluyen.
   */
  cliente: string | null;
  tipo: string;
  urgencia: UrgenciaOt;
  cuadrilla: string | null;
  /**
   * Cuántas jornadas tiene la obra ese día. Dos cuadrillas en la misma obra el mismo día son
   * UNA tarjeta ("Cuadrilla 5 + Cuadrilla 2 · 2 jornadas"): la pregunta del panel es qué
   * obras vienen, no cuántas filas tiene el tablero.
   */
  jornadas: number;
  estado: EstadoAsignacion;
  /** Ya tiene parte: la jornada se cerró. */
  cerrada: boolean;
  /** La fila de la bandeja, si la OT está ahí. Trae la clasificación (pantalla) y demás. */
  fila: FilaBandeja | null;
  hab: EstadoHabAgenda;
};

export type DiaAgenda = { fecha: string; tarjetas: TarjetaAgenda[] };

function filasPorOt(bandeja: Bandeja | undefined): Map<number, FilaBandeja> {
  const mapa = new Map<number, FilaBandeja>();
  if (!bandeja) return mapa;
  for (const f of [
    ...bandeja.grupos.flatMap((g) => g.filas),
    ...bandeja.pospuestas,
    ...bandeja.habilitadas,
    ...bandeja.noAplican,
  ]) {
    mapa.set(f.otId, f);
  }
  return mapa;
}

/**
 * El estado de la habilitación, con la bandeja como fuente y el semáforo de Odoo de red.
 *
 * "No aplica" cuenta como habilitada: no hay nada que tramitar y el tablero la ve en verde.
 * El semáforo sólo decide para las OTs que no están en la bandeja —no debería pasar con las
 * activas, pero una jornada puede apuntar a una OT ya completada—.
 */
function estadoHab(fila: FilaBandeja | null, semaforo: string | null | undefined): EstadoHabAgenda {
  if (fila) {
    if (fila.habilitadaEl || fila.triage === "no_aplica") return { clave: "habilitada" };
    if (fila.pospuestaHasta) return { clave: "pospuesta", hasta: fila.pospuestaHasta };
    return { clave: "sin_habilitar" };
  }
  return semaforo === "verde" ? { clave: "habilitada" } : { clave: "sin_habilitar" };
}

export function armarAgenda(payload: TableroPayload, bandeja: Bandeja | undefined): DiaAgenda[] {
  const cuadrillas = new Map(payload.cuadrillas.map((c) => [c.id, c.nombre]));
  const ots = new Map(payload.ots.map((o) => [o.id, o]));
  const filas = filasPorOt(bandeja);
  // El orden del día viaja al lado de la tarjeta y no adentro: sólo sirve para ordenar.
  const porDia = new Map<string, { tarjeta: TarjetaAgenda; orden: number }[]>();

  for (const a of payload.asignaciones) {
    // Las tarjetas de operaciones (depósito, mantenimiento) no tienen habilitación.
    if (a.origen === "tarea" || !a.otId) continue;
    const ot = ots.get(a.otId);
    if (!ot) continue;
    const fila = filas.get(a.otId) ?? null;

    const tarjeta: TarjetaAgenda = {
      asignacionId: a.id,
      otId: a.otId,
      direccion: direccionDeObra(ot),
      cliente: partesTitulo(ot.titulo).cliente,
      tipo: ot.tipo,
      urgencia: (ot.urgencia === "alta" || ot.urgencia === "media" ? ot.urgencia : "baja") as UrgenciaOt,
      cuadrilla: a.cuadrillaId ? (cuadrillas.get(a.cuadrillaId) ?? null) : null,
      jornadas: 1,
      estado: a.estado,
      cerrada: a.parteId !== null,
      fila,
      hab: estadoHab(fila, ot.habSemaforo),
    };
    const delDia = porDia.get(a.fecha) ?? [];
    const misma = delDia.find((x) => x.tarjeta.otId === a.otId);
    if (misma) {
      // La misma obra otra vez ese día: se suma a la tarjeta que ya estaba.
      const t = misma.tarjeta;
      t.jornadas += 1;
      if (tarjeta.cuadrilla && tarjeta.cuadrilla !== t.cuadrilla) {
        t.cuadrilla = t.cuadrilla ? `${t.cuadrilla} + ${tarjeta.cuadrilla}` : tarjeta.cuadrilla;
      }
      // Confirmada si alguna lo está; cerrada sólo si todas tienen parte.
      if (tarjeta.estado === "confirmada") t.estado = "confirmada";
      t.cerrada = t.cerrada && tarjeta.cerrada;
      continue;
    }
    porDia.set(a.fecha, [...delDia, { tarjeta, orden: a.ordenDia }]);
  }

  return [...porDia.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([fecha, tarjetas]) => ({
      fecha,
      // Por cuadrilla y en el orden del día, que es como las ve Operaciones en el tablero.
      tarjetas: tarjetas
        .sort((a, b) =>
          (a.tarjeta.cuadrilla ?? "~").localeCompare(b.tarjeta.cuadrilla ?? "~") || a.orden - b.orden,
        )
        .map((x) => x.tarjeta),
    }));
}
