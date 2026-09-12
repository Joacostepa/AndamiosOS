// Movimientos del tablero: qué se hizo, quién y cuándo.
//
// Una fila por GESTO. Mover una obra de tres días toca tres asignaciones pero es una sola
// cosa que pasó, y el historial tiene que decirlo así. Ver la migración 20260912000003.
//
// Los tipos y el armado de la frase van acá y no en el servicio para que el bundle del
// browser no tenga que tocar el módulo server-only, igual que tipos.ts.

import { format, isToday, isYesterday, parseISO } from "date-fns";
import { es } from "date-fns/locale";

export const ACCIONES = [
  "crear", "mover", "fraccion", "cuadrilla", "quitar", "fijar", "soltar", "correr",
] as const;
export type AccionMovimiento = (typeof ACCIONES)[number];

/**
 * El bloque, como estaba de un lado y del otro del gesto.
 *
 * El nombre de la cuadrilla viaja junto al id porque esto es auditoría: tiene que poder
 * decir "Cuadrilla 3" aunque esa cuadrilla se haya archivado en Odoo el mes pasado.
 */
export type EstadoBloque = {
  /** Los días que ocupaba el bloque, en yyyy-MM-dd. */
  fechas: string[];
  cuadrillaId: number | null;
  cuadrillaNombre: string | null;
  /** Fracción de jornada (1 = completa). Sólo cuando el gesto la toca o la crea. */
  fraccion?: number;
  /**
   * Por qué el bloque no se desplazaba. Viaja en el registro —y no se resuelve contra
   * Odoo al leerlo— porque el motivo se borra al soltar la obra: si no queda acá, el
   * historial no puede decir por qué había estado fija.
   */
  motivoFija?: string | null;
};

export type Movimiento = {
  id: string;
  otId: number;
  otTitulo: string | null;
  accion: AccionMovimiento;
  asignacionIds: number[];
  /** null en `crear`: no había nada antes. */
  antes: EstadoBloque | null;
  /** null en `quitar`: no quedó nada después. */
  despues: EstadoBloque | null;
  /** Este movimiento deshizo aquél. */
  deshaceA: string | null;
  /**
   * Gesto masivo al que pertenece: correr un día toca doce obras y escribe doce filas.
   * null en los gestos de a una, que son casi todos.
   */
  loteId: string | null;
  /** Por qué se hizo. Sólo lo pide el corrimiento; un arrastre no se justifica. */
  motivo: string | null;
  /**
   * El lote entero, ya sumado. Sólo viene en el panel de actividad, que colapsa las filas
   * de un lote en una línea; en la ficha de una obra NO viene, porque ahí cada obra tiene
   * que ver lo suyo y no el total de un gesto que tocó a otras once.
   */
  lote?: { jornadas: number; obras: number };
  /** Alguien ya deshizo éste. Lo resuelve el servicio, no está en la fila. */
  deshecho: boolean;
  autorNombre: string | null;
  createdAt: string;
};

/**
 * Una confirmación ya agrupada por gesto, como la muestra el panel de actividad.
 *
 * Vive en otra tabla (plan_confirmaciones, una fila por jornada) porque existía antes y
 * tiene su propia pantalla. Se junta con los movimientos recién en la ruta: son conjuntos
 * disjuntos, así que nada se ve dos veces.
 */
export type ConfirmacionAgrupada = {
  id: string;
  otId: number;
  otTitulo: string | null;
  estado: "confirmada" | "tentativa";
  fechas: string[];
  autorNombre: string | null;
  createdAt: string;
};

/** Una línea del panel de actividad, venga de donde venga. */
export type EntradaActividad =
  | { tipo: "movimiento"; movimiento: Movimiento }
  | { tipo: "confirmacion"; confirmacion: ConfirmacionAgrupada };

/** La frase de una confirmación, con el mismo criterio que fraseMovimiento. */
export function fraseConfirmacion(c: ConfirmacionAgrupada): string {
  const verbo = c.estado === "confirmada" ? "Confirmó" : "Volvió a tentativa";
  const n = c.fechas.length;
  if (n === 0) return verbo;
  return `${verbo} ${rango(c.fechas)}${n > 1 ? ` · ${n} jornadas` : ""}`;
}

/**
 * Una fila del historial de un corrimiento: qué le pasó a UNA obra en UNA cuadrilla.
 *
 * Lleva los `asignacionIds` adentro —a diferencia de RegistroMovimiento, donde los pone la
 * ruta— porque un corrimiento escribe muchas filas de una vez y cada una tiene los suyos.
 * Van ordenados por fecha de origen, igual que `antes.fechas`: es lo que permite devolver
 * cada jornada a su día al deshacer.
 */
export type RegistroCorrida = {
  otId: number;
  otTitulo: string | null;
  asignacionIds: number[];
  antes: EstadoBloque;
  despues: EstadoBloque;
};

/** Lo que la ruta recibe del tablero para poder registrar el gesto. */
export type RegistroMovimiento = {
  otId: number;
  otTitulo: string | null;
  accion: AccionMovimiento;
  antes: EstadoBloque | null;
  despues: EstadoBloque | null;
  deshaceA?: string | null;
};

// ── Cómo se lee ──────────────────────────────────────────────────────────────

const FRACCIONES: Record<string, string> = {
  "0.1": "⅒", "0.25": "¼", "0.5": "½", "0.75": "¾", "1": "jornada completa",
};

function fraccionLabel(f: number | undefined): string {
  return f == null ? "—" : (FRACCIONES[String(f)] ?? String(f));
}

function dia(iso: string): string {
  return format(parseISO(iso), "EEE d MMM", { locale: es });
}

/** "mar 16" o "mar 16 – jue 18" cuando el bloque ocupa varios días. */
function rango(fechas: string[]): string {
  if (fechas.length === 0) return "—";
  if (fechas.length === 1) return dia(fechas[0]);
  return `${dia(fechas[0])} – ${dia(fechas[fechas.length - 1])}`;
}

/**
 * La frase que describe el gesto, sin el autor ni la hora.
 *
 * SE ARMA ACÁ Y NO SE GUARDA EN LA BASE. Guardar la frase congelaría el idioma del
 * historial: cambiar "quitó del tablero" por otra cosa obligaría a reescribir filas de
 * auditoría, que es justo lo que no se puede hacer. Los datos se guardan; la frase se
 * arma cada vez.
 */
export function fraseMovimiento(m: Movimiento): string {
  const { antes, despues } = m;

  switch (m.accion) {
    case "crear": {
      const n = despues?.fechas.length ?? 0;
      return `Planificó ${rango(despues?.fechas ?? [])}${
        despues?.cuadrillaNombre ? ` en ${despues.cuadrillaNombre}` : ""
      }${n > 1 ? ` · ${n} jornadas` : ""}`;
    }

    case "mover": {
      // El cambio de cuadrilla y el de día se cuentan por separado: un arrastre puede
      // haber hecho las dos cosas, y "la movió" a secas no dice cuál.
      const cambioDia = rango(antes?.fechas ?? []) !== rango(despues?.fechas ?? []);
      const cambioCuadrilla =
        (antes?.cuadrillaId ?? null) !== (despues?.cuadrillaId ?? null);
      const partes: string[] = [];
      if (cambioDia) partes.push(`de ${rango(antes?.fechas ?? [])} a ${rango(despues?.fechas ?? [])}`);
      if (cambioCuadrilla) {
        partes.push(
          `de ${antes?.cuadrillaNombre ?? "sin cuadrilla"} a ${despues?.cuadrillaNombre ?? "sin cuadrilla"}`,
        );
      }
      // Sin cambio de día ni de cuadrilla sólo pudo moverse el orden dentro del día, que
      // es un detalle visual y no vale una frase propia.
      return partes.length ? `Movió ${partes.join(" · ")}` : "Reordenó dentro del día";
    }

    case "fraccion":
      return `Cambió la fracción de ${fraccionLabel(antes?.fraccion)} a ${fraccionLabel(despues?.fraccion)}`;

    case "cuadrilla":
      return `Pasó de ${antes?.cuadrillaNombre ?? "sin cuadrilla"} a ${despues?.cuadrillaNombre ?? "sin cuadrilla"}`;

    case "quitar": {
      const n = antes?.fechas.length ?? 0;
      return `Quitó del tablero ${rango(antes?.fechas ?? [])}${n > 1 ? ` · ${n} jornadas` : ""}`;
    }

    // EL MOTIVO VA EN LA FRASE, no escondido en un tooltip: es todo el contenido del
    // gesto. "Fijó Callao 1810" no dice nada; "Fijó Callao 1810 — grúa alquilada" es
    // justo lo que alguien necesita leer tres días después, cuando llueve y hay que
    // decidir si esa obra sale igual.
    case "fijar":
      return `Fijó ${rango(despues?.fechas ?? [])}${
        despues?.motivoFija ? ` — ${despues.motivoFija}` : ""
      }`;

    // Al soltar el motivo se borra, así que el único lugar donde queda escrito es este
    // registro. Por eso se muestra el de ANTES: es la respuesta a "¿por qué estaba fija?".
    case "soltar":
      return `Soltó ${rango(antes?.fechas ?? [])}${
        antes?.motivoFija ? ` · estaba fija: ${antes.motivoFija}` : ""
      }`;

    // DOS FRASES PARA EL MISMO HECHO, según desde dónde se mire. En el panel de actividad
    // las doce filas del lote se colapsan en una y lo que importa es el tamaño del gesto:
    // "corrió el jueves 17 · 34 jornadas de 12 obras". En la ficha de UNA obra el total no
    // significa nada —esa obra no se movió 34 jornadas— y lo que hace falta es qué le pasó
    // a ella.
    case "correr": {
      const desde = antes?.fechas[0];
      const hasta = despues?.fechas[0];
      const tramo = desde && hasta ? ` del ${dia(desde)} al ${dia(hasta)}` : "";
      // El motivo va SIEMPRE, en los dos casos: dentro de un mes la pregunta que se le
      // hace a este historial es por qué se corrió una semana entera, y "lluvia" la
      // contesta en una palabra.
      const porque = m.motivo ? ` — ${m.motivo}` : "";
      if (m.lote) {
        return `Corrió el día${tramo} · ${m.lote.jornadas} jornada${
          m.lote.jornadas === 1 ? "" : "s"
        } de ${m.lote.obras} obra${m.lote.obras === 1 ? "" : "s"}${porque}`;
      }
      const n = antes?.fechas.length ?? 0;
      return `Se corrió${tramo}${n > 1 ? ` · ${n} jornadas` : ""}${porque}`;
    }
  }
}

/** "hoy 14:32", "ayer 09:10", "3 sep 08:15". Mismo criterio que los comentarios. */
export function cuando(iso: string): string {
  const d = parseISO(iso);
  if (isToday(d)) return `hoy ${format(d, "HH:mm")}`;
  if (isYesterday(d)) return `ayer ${format(d, "HH:mm")}`;
  return format(d, "d MMM HH:mm", { locale: es });
}
