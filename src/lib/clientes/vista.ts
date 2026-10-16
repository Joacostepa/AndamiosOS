// La bandeja de clientes, del lado de la pantalla: lo que devuelven las rutas y cómo se
// nombra cada estado. Puro (sin base ni red): lo importan las rutas y la página.

export type EstadoCharla = "bot" | "espera_ok" | "humano" | "derivada" | "cerrada";

export type CharlaListada = {
  id: string;
  telefono: string;
  /** El nombre del perfil de WhatsApp (puede faltar). */
  nombre: string | null;
  estado: EstadoCharla;
  motivo: string | null;
  /** Quién la tiene (estado humano). */
  asistente: { id: string; nombre: string } | null;
  ultimoMensajeAt: string | null;
  ultimoEntranteAt: string | null;
  ultimoResumen: string | null;
  sinLeer: number;
  optOut: boolean;
  createdAt: string;
  /** «gama_alta» si escribió una de PALABRAS_GAMA_ALTA (de la ficha; lo marca el código). */
  segmento: "gama_alta" | null;
  /** Qué trabajo va a hacer el cliente, como lo anotó Sofía (de la ficha). */
  tarea: string | null;
};

export type AdjuntoVista =
  | {
      tipo: "archivo";
      mime: string | null;
      nombre: string;
      /** /api/comercial/clientes/medios/<id del hilo>: redirige a una URL firmada. null mientras se baja. */
      url: string | null;
      pendiente: boolean;
      error: string | null;
    }
  | { tipo: "ubicacion"; lat: number; lng: number; nombre: string | null; direccion: string | null };

export type ItemHilo = {
  id: string;
  direccion: "entrante" | "saliente" | "evento";
  /** ia: lo que escribió Sofía · sistema: un texto fijo del servidor · persona: alguien del equipo. */
  autor: "cliente" | "persona" | "sistema" | "ia" | "plantilla";
  /** El nombre de quien escribió (persona). */
  autorNombre: string | null;
  tipo: string;
  texto: string | null;
  adjunto: AdjuntoVista | null;
  transcripcion: string | null;
  estado: "recibido" | "enviando" | "enviado" | "entregado" | "leido" | "error";
  errorCodigo: number | null;
  errorDetalle: string | null;
  momento: string;
};

export type ListaCharlas = {
  yo: string;
  puedeEditar: boolean;
  /** Sofía prendida (clientes_ia_activa = 1). */
  iaActiva?: boolean;
  /** Ve «Revisar charlas» (el auditor, §7). */
  esAdmin?: boolean;
  /** Si falta WHATSAPP_CLIENTES_PHONE_NUMBER_ID, no se puede mandar nada. */
  numeroConfigurado: boolean;
  charlas: CharlaListada[];
};

export type DetalleCharla = {
  yo: string;
  puedeEditar: boolean;
  /** Sofía prendida: se puede «Devolver a Sofía». */
  iaActiva?: boolean;
  numeroConfigurado: boolean;
  /** Admin: puede borrar la charla entera (para pruebas). */
  esAdmin?: boolean;
  charla: CharlaListada;
  items: ItemHilo[];
};

export type Tono = "gris" | "ambar" | "coral" | "rojo";

/** La pastilla de cada estado (crm-propuesta.md §7). «derivada» es «Sin tomar», con el motivo si lo hay. */
export function pastilla(c: Pick<CharlaListada, "estado" | "motivo" | "asistente">, yo: string): { texto: string; tono: Tono } {
  switch (c.estado) {
    case "bot":
      return { texto: "Atiende Sofía (IA)", tono: "gris" };
    case "espera_ok":
      return { texto: c.motivo ? `Espera tu OK · ${c.motivo}` : "Espera tu OK", tono: "ambar" };
    case "humano":
      if (!c.asistente) return { texto: "Tomada", tono: "coral" };
      return { texto: c.asistente.id === yo ? "La tenés vos" : `La tiene ${c.asistente.nombre}`, tono: "coral" };
    case "derivada":
      return { texto: c.motivo ? `Sin tomar · ${c.motivo}` : "Sin tomar", tono: "rojo" };
    case "cerrada":
      return { texto: "Cerrada", tono: "gris" };
  }
}

export type Filtro = "vos" | "todas" | "cerradas";

/** Gama alta y esperando a una persona (sin tomar o esperando un OK): va arriba de la lista. */
export function gamaAltaEsperando(c: Pick<CharlaListada, "estado" | "segmento">): boolean {
  return c.segmento === "gama_alta" && (c.estado === "derivada" || c.estado === "espera_ok");
}

/** Los motivos de derivación que van arriba (MOTIVOS_DERIVACION: «Urgente · …», «Quiere avanzar»). */
const MOTIVOS_PRIORITARIOS = /Urgente|Quiere avanzar/;

/**
 * Espera a una persona y no puede esperar: gama alta, un desprendimiento o un cliente que quiere
 * avanzar (análisis de chats, D3: la demora es la causa de pérdida que más se podría evitar).
 */
export function esPrioritaria(c: Pick<CharlaListada, "estado" | "segmento" | "motivo">): boolean {
  if (gamaAltaEsperando(c)) return true;
  return (c.estado === "derivada" || c.estado === "espera_ok") && MOTIVOS_PRIORITARIOS.test(c.motivo ?? "");
}

/**
 * «Para vos»: las mías y las que nadie tomó. Todos ven todas (es una familia: sólo filtros).
 * En «Para vos» y «Todas», las prioritarias que esperan a una persona van primero; el resto
 * queda en el orden en que llegó (el último mensaje arriba).
 */
export function filtrar(charlas: CharlaListada[], filtro: Filtro, yo: string): CharlaListada[] {
  if (filtro === "cerradas") return charlas.filter((c) => c.estado === "cerrada");
  const abiertas = charlas.filter((c) => c.estado !== "cerrada");
  const elegidas = filtro === "todas"
    ? abiertas
    : abiertas.filter((c) => c.estado === "derivada" || c.estado === "espera_ok" || (c.estado === "humano" && c.asistente?.id === yo));
  return [...elegidas.filter(esPrioritaria), ...elegidas.filter((c) => !esPrioritaria(c))];
}

/** El teléfono como se lee en Argentina: +54 9 11 5555-1234. Lo demás, con un + adelante. */
export function telefonoLegible(tel: string): string {
  const d = tel.replace(/\D/g, "");
  const m = /^549(11|\d{3,4})(\d{3,4})(\d{4})$/.exec(d);
  if (m && (m[1].length + m[2].length + m[3].length === 10)) return `+54 9 ${m[1]} ${m[2]}-${m[3]}`;
  return d ? `+${d}` : tel;
}
