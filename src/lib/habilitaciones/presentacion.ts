// Lo que dicen la fila de la bandeja y la tarjeta de estado de la ficha, en castellano.
//
// Lógica pura, sin React: sale de la espera (esperaDe) y de los datos de la obra, y se
// prueba sin levantar nada. Las pantallas sólo eligen dónde va cada línea.
//
// LA FILA DICE TRES COSAS (rediseño del 09/10, docs/habilitaciones-rediseno.md §4.2): el
// próximo paso, hace cuánto espera y cuándo se arma. Y el botón de ese paso, en la misma
// fila, para el 75% de las obras que tienen un solo papel.

import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { diasEntre, fechaDeArmado, hoyISO, vueltaPorPermiso } from "./derivacion.ts";
import type { ClaveGrupo, Espera, FilaBandeja } from "./tipos";

const corta = (f: string) => format(parseISO(f), "EEE d MMM", { locale: es });
const mayuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** "hoy", "ayer", "hace 5 d". */
export function haceDias(dias: number | null): string | null {
  if (dias === null) return null;
  return dias === 0 ? "hoy" : dias === 1 ? "ayer" : `hace ${dias} d`;
}

export type Accion =
  /** Aplica / No aplica, en la misma fila. */
  | { tipo: "triar" }
  /** Marcar enviados los pendientes. */
  | { tipo: "enviar"; ids: string[] }
  /** Aprobar los enviados; `reclamar` cuando ya pasó la semana. */
  | { tipo: "aprobar"; ids: string[]; reclamar: boolean }
  | { tipo: "habilitar" }
  /** Lo que se resuelve mirando la ficha: corregir, cargar, esperar al cliente. */
  | { tipo: "abrir"; reclamar?: boolean }
  | { tipo: "ninguna" };

export type Paso = {
  /** El próximo paso, en una frase. */
  titulo: string;
  /** Hace cuánto, y el detalle. */
  detalle: string;
  /** Pasó el umbral: el "hace N d" va en rojo. */
  rojo: boolean;
  /** Para el color de la frase. */
  tono: "nuestra" | "cliente" | "listo" | "corregir" | "permiso" | "neutro";
  accion: Accion;
};

/** El papel en singular: "Mandar la Nómina ART" y no "Mandar Nómina ART". */
function conArticulo(nombre: string): string {
  return /^(nómina|cláusula|póliza|constancia|documentación|nota)/i.test(nombre) ? `la ${nombre}` : nombre;
}

/**
 * El próximo paso de una obra en trámite. `grupo` sólo cambia el caso del permiso: las que
 * esperan el permiso dicen el estado del trámite, no lo que falta de papeles.
 */
export function pasoDe(
  fila: Pick<FilaBandeja, "espera" | "reqs" | "reclamos" | "tramite" | "expedienteNro" | "primeraJornada" | "fechaProgramada" | "vencimiento" | "habilitadaEl">,
  grupo: ClaveGrupo,
  hoy: string = hoyISO(),
): Paso {
  if (grupo === "permiso") {
    const vuelve = vueltaPorPermiso(fila);
    return {
      titulo: fila.tramite === "presentado" ? "Permiso presentado" : "Permiso sin presentar",
      detalle: [fila.expedienteNro?.replace(/- -GCABA-SSGOU$/, ""), vuelve ? `vuelve el ${corta(vuelve)}` : "vuelve cuando salga"]
        .filter(Boolean).join(" · "),
      rojo: false,
      tono: "permiso",
      accion: { tipo: "ninguna" },
    };
  }

  if (grupo === "por_vencer" && fila.vencimiento) {
    const d = diasEntre(hoy, fila.vencimiento);
    return {
      titulo: d < 0 ? "La documentación venció" : `La documentación vence el ${corta(fila.vencimiento)}`,
      detalle: d < 0 ? `hace ${-d} d` : d === 0 ? "hoy" : `en ${d} d`,
      rojo: d <= 7,
      tono: d < 0 ? "corregir" : "neutro",
      accion: { tipo: "abrir" },
    };
  }

  const e: Espera | null = fila.espera;
  if (!e) return { titulo: "Habilitada", detalle: "", rojo: false, tono: "listo", accion: { tipo: "ninguna" } };

  const pendientes = fila.reqs.filter((r) => r.estado === "pendiente");
  const enviados = fila.reqs.filter((r) => r.estado === "enviado");
  const total = fila.reqs.length;
  const hace = haceDias(e.dias);
  const reclamos = fila.reclamos > 0 ? `${fila.reclamos} ${fila.reclamos === 1 ? "reclamo" : "reclamos"}` : null;

  switch (e.clave) {
    case "triar":
      return {
        titulo: "¿Pide papeles?",
        detalle: hace ? `entró ${hace}` : "",
        rojo: e.rojo, tono: "nuestra", accion: { tipo: "triar" },
      };
    case "cargar":
      return {
        titulo: "Cargar los papeles que pide",
        detalle: hace ?? "",
        rojo: e.rojo, tono: "nuestra", accion: { tipo: "abrir" },
      };
    case "corregir":
      return {
        titulo: mayuscula(e.texto),
        detalle: hace ? `observado ${hace}` : "",
        rojo: e.rojo, tono: "corregir", accion: { tipo: "abrir" },
      };
    case "habilitar":
      return {
        titulo: "Lista para habilitar",
        detalle: [`todo aprobado`, hace].filter(Boolean).join(" "),
        rojo: e.rojo, tono: "listo", accion: { tipo: "habilitar" },
      };
    case "mandar":
      return {
        titulo: pendientes.length === 1
          ? `Mandar ${conArticulo(pendientes[0].nombre)}`
          : `Mandar ${pendientes.length} de ${total} papeles`,
        detalle: hace ?? "",
        rojo: e.rojo, tono: "nuestra",
        accion: { tipo: "enviar", ids: pendientes.map((r) => r.id) },
      };
    case "cliente_pide":
      return {
        titulo: "El cliente tiene que decir qué pide",
        detalle: [hace ? `consultado ${hace}` : null, reclamos].filter(Boolean).join(" · "),
        rojo: e.rojo, tono: "cliente", accion: { tipo: "abrir", reclamar: e.rojo },
      };
    case "cliente_revisa":
      return {
        titulo: enviados.length === 1
          ? `Falta que apruebe ${conArticulo(enviados[0].nombre)}`
          : `Falta que apruebe ${enviados.length} de ${total}`,
        detalle: [hace ? `${enviados.length === 1 ? "mandado" : "mandados"} ${hace}` : null, reclamos]
          .filter(Boolean).join(" · "),
        rojo: e.rojo, tono: "cliente",
        accion: { tipo: "aprobar", ids: enviados.map((r) => r.id), reclamar: e.rojo },
      };
  }
}

/** La columna "Se arma": la fecha y de dónde sale. */
export function seArma(
  o: { primeraJornada: string | null; fechaProgramada: string | null; habilitada: boolean },
  hoy: string = hoyISO(),
): { fecha: string; detalle: string; rojo: boolean } {
  const f = fechaDeArmado(o);
  if (!f) return { fecha: "Sin fecha", detalle: "sin planificar", rojo: false };
  const d = diasEntre(hoy, f);
  const origen = o.primeraJornada ? "planificada" : "programada";
  const cuando = d === 0 ? "hoy" : d === 1 ? "mañana" : d > 0 ? `en ${d} d` : `pasó hace ${-d} d`;
  return { fecha: corta(f), detalle: `${cuando} · ${origen}`, rojo: !o.habilitada && d <= 3 };
}
