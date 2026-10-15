// Los avisos de estado de Meta (statuses): enviado, entregado, leído o error. Puro, con
// tests (estados.test.ts).
//
// Cada mensaje que sale de ABA vuelve como uno o más avisos con su wamid. Pueden llegar
// desordenados (un «leído» antes que el «entregado») y repetidos (Meta reintenta), así que el
// estado sólo avanza: enviando → enviado → entregado → leído. Un error pisa a enviando y a
// enviado, pero no a algo que ya se entregó o se leyó.
//
// El que más importa es el 131047: el mensaje salió fuera de la ventana de 24 h y no llegó.
// La app no deja mandar fuera de la ventana (ventana.ts), pero el reloj de Meta manda: si
// igual pasa, la burbuja lo dice.

export type EstadoHilo = "recibido" | "enviando" | "enviado" | "entregado" | "leido" | "error";

/** Un aviso tal cual llega en `value.statuses[]`. */
export type StatusMeta = {
  id?: string;
  status?: string;
  timestamp?: string;
  recipient_id?: string;
  errors?: { code?: number; title?: string; message?: string; error_data?: { details?: string } }[];
};

export type StatusLeido = {
  wamid: string;
  estado: Exclude<EstadoHilo, "recibido" | "enviando">;
  at: string;
  error: { codigo: number | null; detalle: string } | null;
};

const DE_META: Record<string, StatusLeido["estado"]> = {
  sent: "enviado",
  delivered: "entregado",
  read: "leido",
  failed: "error",
};

const ORDEN: Record<EstadoHilo, number> = { recibido: -1, enviando: 0, enviado: 1, entregado: 2, leido: 3, error: 1.5 };

/** Errores de Meta que se pueden explicar en castellano. El resto va con el texto de Meta. */
const EXPLICADOS: Record<number, string> = {
  131047: "No llegó: pasaron más de 24 h desde el último mensaje del cliente. Fuera de esa ventana WhatsApp sólo deja mandar plantillas aprobadas.",
  131026: "No llegó: el número no tiene WhatsApp o no puede recibir este mensaje (puede tener una versión vieja).",
  131049: "No llegó: WhatsApp lo frenó para no saturar al cliente con mensajes de empresas. Probá más tarde.",
  131050: "No llegó: el cliente pidió no recibir mensajes de marketing de ABA.",
  131051: "No llegó: WhatsApp no acepta ese tipo de mensaje.",
  131052: "No se pudo bajar el archivo que mandó el cliente.",
  131053: "No se pudo subir el archivo: revisá el formato y el tamaño.",
  130429: "WhatsApp está limitando los envíos: probá de nuevo en un rato.",
  131056: "Se mandaron demasiados mensajes seguidos a este cliente: esperá un poco.",
  368: "Meta bloqueó el número de ABA por una infracción de sus reglas. Hay que revisarlo en Meta Business.",
};

export function explicarError(codigo: number | null | undefined, detalleMeta?: string | null): string {
  if (codigo != null && EXPLICADOS[codigo]) return EXPLICADOS[codigo];
  const d = detalleMeta?.trim();
  return d ? `WhatsApp no lo entregó${codigo != null ? ` (${codigo})` : ""}: ${d}` : `WhatsApp no lo entregó${codigo != null ? ` (error ${codigo})` : ""}.`;
}

/** Un aviso de Meta → lo que se anota. null si no sirve (sin wamid o con un estado que no conocemos). */
export function leerStatus(s: StatusMeta): StatusLeido | null {
  const wamid = s.id?.trim();
  const estado = s.status ? DE_META[s.status] : undefined;
  if (!wamid || !estado) return null;
  const seg = Number(s.timestamp);
  const at = Number.isFinite(seg) && seg > 0 ? new Date(seg * 1000).toISOString() : new Date().toISOString();
  let error: StatusLeido["error"] = null;
  if (estado === "error") {
    const e = s.errors?.[0];
    const codigo = typeof e?.code === "number" ? e.code : null;
    error = { codigo, detalle: explicarError(codigo, e?.error_data?.details ?? e?.message ?? e?.title) };
  }
  return { wamid, estado, at, error };
}

/** ¿El aviso nuevo cambia lo que ya está anotado? Sólo avanza; el error no pisa lo entregado. */
export function avanza(actual: EstadoHilo, nuevo: EstadoHilo): boolean {
  if (actual === nuevo) return false;
  if (actual === "recibido") return false; // lo que entra no tiene estado de entrega
  if (nuevo === "error") return actual === "enviando" || actual === "enviado";
  if (actual === "error") return false;
  return ORDEN[nuevo] > ORDEN[actual];
}
