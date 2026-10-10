// En qué está un permiso, quién lo tiene que mover, desde cuándo y qué le toca a la oficina.
//
// UNA SOLA CUENTA PARA TODO EL MÓDULO (rediseño 09/10, docs/permisos/rediseno.md): la fila de la
// lista y la tarjeta de estado de la ficha salen de acá. Antes la bandeja, Seguimiento y la
// ficha contaban historias distintas del mismo trámite (de 7 que pedían algo, 5 cambiaban de
// grupo o de color según la pantalla).
//
// REGLAS QUE CAMBIARON CON EL REDISEÑO:
//   - Lo que espera al cliente es del cliente. A la oficina le toca "perseguirlo" recién cuando
//     pasa el umbral: 2 días sin cargar el dueño, 3 con algo que falta o hay que corregir.
//   - El endoso sale solo al cargar el dueño (decisión de JS, 09/10). Si el nombre del dueño
//     viene roto, se frena y le toca a la oficina corregirlo y mandarlo.
//   - Reabrir un borrador de TAD no viene funcionando (0 de 8 desde el 15/09): con un borrador
//     que no abre o con adjuntos sueltos, lo que se ofrece es empezar de cero.
//   - El tiempo en el Gobierno se cuenta desde la presentación (creado_tad), no desde que el
//     robot vio el expediente por primera vez.
//   - Permiso emitido es TRAMITACIÓN o una resolución RS-. Archivado sin resolución es otro estado.
//
// Puro y sin red: lo usan el servidor (lista y ficha) y los tests.

import {
  NOMBRE_DOCUMENTO,
  archivadoSinPermiso,
  estadoVinculo,
  nombreSospechoso,
  normalizarEstado,
  tienePermiso,
  type Expediente,
} from "./tipos.ts";

export const ETAPAS = [
  { clave: "inicio", nombre: "Inicio", largo: "Trámite iniciado" },
  { clave: "papeles", nombre: "Papeles", largo: "Papeles del cliente" },
  { clave: "poliza", nombre: "Póliza", largo: "Póliza (endoso de Segucom)" },
  { clave: "encomienda", nombre: "Encomienda", largo: "Encomienda del CPAU" },
  { clave: "presentacion", nombre: "Presentación", largo: "Presentación en TAD" },
  { clave: "gobierno", nombre: "Gobierno", largo: "Revisión del Gobierno" },
  { clave: "permiso", nombre: "Permiso", largo: "Permiso emitido" },
] as const;

export type ClaveEtapa = (typeof ETAPAS)[number]["clave"];
export const NOMBRE_ETAPA = Object.fromEntries(ETAPAS.map((e) => [e.clave, e.nombre])) as Record<ClaveEtapa, string>;

/** listo ✓ · en marcha (lo tiene otro) · frenado ! · te toca (la oficina) · todavía no. */
export type EstadoEtapa = "listo" | "marcha" | "frenado" | "te_toca" | "todavia";

/** Quién lo tiene que mover. "Oficina" se resuelve a una persona con `para` en cada acción. */
export type Quien = "Cliente" | "Segucom" | "CPAU" | "Robot" | "Gobierno" | "Oficina";

export type Etapa = {
  clave: ClaveEtapa;
  estado: EstadoEtapa;
  /** Cuándo quedó lista. */
  fecha?: string | null;
  /** Desde cuándo está en marcha, frenada o esperando a la oficina. */
  desde?: string | null;
  quien?: Quien;
  /** Corto: para la fila y debajo del punto de la línea. */
  detalle: string;
  /** Una frase: el título de la tarjeta cuando esta es la etapa actual. */
  titulo?: string;
  bajada?: string | null;
  /** Lo que dijo alguien de afuera (el Gobierno, la revisión, el robot), literal. */
  motivo?: string | null;
};

export type ClaveAccion =
  | "copiar_link"
  | "perseguir_cliente"
  | "revisar_dueno"
  | "pedir_endoso"
  | "volver_a_pedir_endoso"
  | "generar_documentos"
  | "armar_encomienda"
  | "volver_a_armar"
  | "reanudar_cierre"
  | "revisar_cpau"
  | "ver_encomienda"
  | "presentar"
  | "volver_a_presentar"
  | "empezar_de_cero"
  | "seguir_borrador"
  | "revisar_confirmar"
  | "confirmar_venta"
  | "subsanar"
  | "ver_archivado"
  | "decidir_expediente";

/** A quién de la oficina le toca: el que gestiona, la vendedora (habla con el cliente) o cualquiera. */
export type Para = "gestor" | "vendedora" | "oficina";

export type Accion = { clave: ClaveAccion; titulo: string; detalle?: string | null; para: Para; desde: string | null };

export type Grupo = "te_toca" | "esperando" | "gobierno" | "emitido" | "archivado" | "prueba";
export type Tono = "bloqueo" | "aviso" | "marcha" | "listo" | "neutro";
export type Demora = "" | "tarde" | "muy";

export type EstadoPermiso = {
  etapas: Etapa[];
  actual: ClaveEtapa;
  grupo: Grupo;
  tono: Tono;
  titulo: string;
  bajada: string | null;
  motivo: string | null;
  loTiene: Quien | null;
  desde: string | null;
  demora: Demora;
  /** Lo que le toca a la oficina, lo más urgente primero. La primera es la acción principal. */
  acciones: Accion[];
  /** "Permiso aprox. jue 22/10", "Frenado: depende del cliente". */
  estimado: string | null;
};

// ── Entradas ─────────────────────────────────────────────────────────────────

export type TramiteParaEstado = {
  id: string;
  created_at: string;
  estado: string;
  es_prueba: boolean;
  titular_nombre: string | null;
  titular_cargado_at: string | null;
  link_enviado_at: string | null;
  link_enviado_a: string | null;
  link_error: string | null;
  vendedor_email: string | null;
};

export type DocParaEstado = {
  clave: string;
  origen: string;
  estado: string;
  observacion: string | null;
  updated_at: string | null;
  revisado_at: string | null;
  pedido_at: string | null;
  subido_at?: string | null;
};

export type TareaParaEstado = {
  tipo: string;
  estado: string;
  error: string | null;
  created_at: string;
  terminada_at: string | null;
  reintentar_desde?: string | null;
  payload?: Record<string, unknown> | null;
  resultado: Record<string, unknown> | null;
};

export type ExpParaEstado = Pick<
  Expediente,
  | "id" | "numero" | "estado_tad" | "solapa" | "tarea_pendiente" | "creado_tad" | "estado_desde" | "motivo_subsanacion"
  | "permiso_emitido_el" | "permiso_vence" | "permiso_notificacion" | "odoo_venta_id" | "odoo_vinculo_por" | "odoo_vinculo_confirmado_at"
>;

export type Contexto = {
  ahora: number;
  supervision: { linkAlCliente: boolean; endosoAutomatico: boolean; encomiendaAutomatica: boolean; presentacionAutomatica: boolean };
  /** Medianas en días: de abierto a presentado y de presentado a permiso. */
  tipico?: { aPresentar: number | null; gcba: number | null };
  /** El último recordatorio al cliente (mail, WhatsApp anotado o pedido de corrección). */
  ultimoContactoCliente?: string | null;
  /** Nombres cortos para las frases ("el link se le mandó a Agustina"). */
  nombres?: { vendedora?: string | null; gestor?: string | null };
  /** Un expediente viejo que la oficina decidió dejar de seguir. */
  descartado?: boolean;
};

// ── Constantes y ayudas ──────────────────────────────────────────────────────

const DIA = 86_400_000;
const TZ = "America/Argentina/Buenos_Aires";

/** Días en una etapa a partir de los cuales es tarde y muy tarde. */
export const LIMITE: Partial<Record<ClaveEtapa, [number, number]>> = {
  papeles: [2, 5], poliza: [2, 4], encomienda: [1, 3], presentacion: [1, 2], gobierno: [14, 21],
};
/** Sin novedades del cliente: a partir de cuándo le toca a la oficina perseguirlo. */
export const UMBRAL_SIN_DUENO = 2;
export const UMBRAL_PAPELES = 3;
/** Un expediente en el Gobierno sin novedades: a partir de cuándo hay que decidir qué pasa. */
export const UMBRAL_EXPEDIENTE_VIEJO = 45;

const PRIORIDAD: ClaveAccion[] = [
  "subsanar", "revisar_confirmar", "empezar_de_cero", "seguir_borrador", "volver_a_presentar", "revisar_cpau",
  "reanudar_cierre", "volver_a_armar", "ver_encomienda", "revisar_dueno", "ver_archivado", "confirmar_venta",
  "copiar_link", "presentar", "armar_encomienda", "generar_documentos", "pedir_endoso", "volver_a_pedir_endoso",
  "perseguir_cliente", "decidir_expediente",
];

const ultima = (xs: (string | null | undefined)[]) => xs.filter((x): x is string => !!x).sort().at(-1) ?? null;
const primeraLinea = (s: string | null | undefined) => (s ?? "").split("\n")[0].trim().slice(0, 240) || null;
/** Las fechas de TAD vienen sin hora: se toman a las 12 de Buenos Aires. */
const diaTad = (d: string) => `${d.slice(0, 10)}T15:00:00Z`;
const dias = (desde: string | null | undefined, ahora: number) => (desde ? (ahora - Date.parse(desde)) / DIA : 0);
const nombreDoc = (clave: string) => {
  const n = NOMBRE_DOCUMENTO[clave] ?? clave;
  // "Acta de asamblea con la designación del administrador (legalizada y vigente)" no entra en una línea.
  return n.replace(/\s*\(.*\)$/, "").replace(/ con la designación.*$/, "").replace(/ firmad[ao]$/, "");
};
const listar = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} y ${xs.at(-1)}`);
/** "Acta de asamblea" → "acta de asamblea"; "DNI del administrador" queda igual. */
const minuscula = (s: string) => (/^\p{Lu}\p{Ll}/u.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s);
const ARCHIVADO = "Archivado sin resolución";

// Las fechas se arman a mano con las partes: toLocaleDateString da "25/9" en Node y "25/09" en
// el navegador, y la fila no puede cambiar según dónde se calculó.
const PARTES = new Intl.DateTimeFormat("en-US", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23", weekday: "short" });
const DIA_SEMANA: Record<string, string> = { Mon: "lun", Tue: "mar", Wed: "mié", Thu: "jue", Fri: "vie", Sat: "sáb", Sun: "dom" };
function partes(ms: number) {
  const p = Object.fromEntries(PARTES.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { d: p.day, m: p.month, a: p.year, h: p.hour, min: p.minute, sem: p.weekday };
}
const aMs = (iso: string) => Date.parse(iso.length === 10 ? diaTad(iso) : iso);

/** "24/09". */
export function diaCorto(iso: string | null | undefined): string {
  if (!iso) return "";
  const p = partes(aMs(iso));
  return `${p.d}/${p.m}`;
}
/** "20:25". */
export function horaCorta(iso: string | null | undefined): string {
  if (!iso) return "";
  const p = partes(aMs(iso));
  return `${p.h}:${p.min}`;
}
/** "24/09 11:46" hasta este año; "11/12/2025" si es de otro. */
export function cuandoFue(iso: string | null | undefined, ahora: number): string {
  if (!iso) return "";
  const p = partes(aMs(iso));
  const esteAnio = partes(ahora).a === p.a;
  return esteAnio ? `${p.d}/${p.m}${iso.length === 10 ? "" : ` ${p.h}:${p.min}`}` : `${p.d}/${p.m}/${p.a}`;
}
/** "jue 22/10". */
function diaConNombre(ms: number): string {
  const p = partes(ms);
  return `${DIA_SEMANA[p.sem] ?? p.sem} ${p.d}/${p.m}`;
}
/** El permiso no sale un sábado ni un domingo: se corre al lunes. */
function aDiaHabil(ms: number): number {
  const sem = partes(ms).sem;
  return ms + (sem === "Sat" ? 2 : sem === "Sun" ? 1 : 0) * DIA;
}

export function demoraDe(clave: ClaveEtapa, desde: string | null | undefined, ahora: number): Demora {
  const lim = LIMITE[clave];
  if (!desde || !lim) return "";
  const d = dias(desde, ahora);
  return d > lim[1] ? "muy" : d > lim[0] ? "tarde" : "";
}

/** "hace 3 h", "hace 13 días". */
export function haceCuanto(desde: string | null | undefined, ahora: number): string {
  if (!desde) return "";
  const h = (ahora - Date.parse(desde)) / 3_600_000;
  if (h < 1) return "hace menos de 1 h";
  if (h < 24) return `hace ${Math.round(h)} h`;
  const d = Math.floor(h / 24);
  return `hace ${d} día${d === 1 ? "" : "s"}`;
}

/** La presentación del robot que quedó trabada en un borrador que TAD no abre. */
function borradorNoAbre(tp: TareaParaEstado | undefined): boolean {
  if (!tp) return false;
  return tp.resultado?.borrador_no_abre === true || (/documentos del borrador/i.test(tp.error ?? "") && !!tp.payload?.continuar_borrador);
}

// ── Las etapas de un trámite ─────────────────────────────────────────────────

/** Gobierno y permiso: los comparten el trámite y el expediente sin trámite. */
function etapasGobierno(e: ExpParaEstado | undefined, ctx: Contexto, acciones: Accion[]): [Etapa, Etapa] {
  if (!e) {
    return [
      { clave: "gobierno", estado: "todavia", detalle: "Todavía no" },
      { clave: "permiso", estado: "todavia", detalle: "Todavía no" },
    ];
  }
  if (tienePermiso(e)) {
    const fecha = e.permiso_emitido_el ? diaTad(e.permiso_emitido_el) : e.estado_desde;
    const vence = e.permiso_vence ? `Vence el ${diaCorto(e.permiso_vence)}` : "Vencimiento sin leer";
    return [
      { clave: "gobierno", estado: "listo", fecha, detalle: "Aprobado" },
      { clave: "permiso", estado: "listo", fecha, detalle: vence, titulo: `Permiso emitido${e.permiso_emitido_el ? ` el ${diaCorto(e.permiso_emitido_el)}` : ""}`, bajada: e.permiso_vence ? `Vigente hasta el ${diaCorto(e.permiso_vence)}.` : "No se pudo leer el vencimiento del PDF del permiso." },
    ];
  }
  if (archivadoSinPermiso(e)) {
    if (!ctx.descartado) {
      acciones.push({ clave: "ver_archivado", titulo: "Mirá en TAD por qué se archivó sin resolución", para: "oficina", desde: e.estado_desde });
    }
    return [
      {
        clave: "gobierno", estado: "frenado", desde: e.estado_desde, quien: "Oficina", detalle: ARCHIVADO,
        titulo: "El Gobierno lo archivó sin resolución", bajada: `Pasó a Guarda temporal el ${diaCorto(e.estado_desde)} sin que saliera el permiso. Mirá en TAD qué pasó: no se puede armar con permiso.`,
      },
      { clave: "permiso", estado: "todavia", detalle: "No hay permiso" },
    ];
  }
  if (e.tarea_pendiente) {
    acciones.push({ clave: "subsanar", titulo: "Corregir lo que pidió el Gobierno", para: "gestor", desde: e.estado_desde });
    return [
      {
        clave: "gobierno", estado: "frenado", desde: e.estado_desde, quien: "Oficina", detalle: "Hay que corregir",
        titulo: "El Gobierno pide corregir", bajada: "Hay que corregir y volver a presentar en la tarea de subsanación de TAD.", motivo: e.motivo_subsanacion,
      },
      { clave: "permiso", estado: "todavia", detalle: "Todavía no" },
    ];
  }
  const corregido = normalizarEstado(e.estado_tad) === "SUBSANACION";
  const desde = corregido ? e.estado_desde : e.creado_tad ? diaTad(e.creado_tad) : e.estado_desde;
  if (!corregido && !ctx.descartado && dias(desde, ctx.ahora) > UMBRAL_EXPEDIENTE_VIEJO) {
    acciones.push({ clave: "decidir_expediente", titulo: `Presentado ${haceCuanto(desde, ctx.ahora)} y sin novedades: ¿sigue vivo?`, para: "oficina", desde });
  }
  return [
    {
      clave: "gobierno", estado: "marcha", desde, quien: "Gobierno",
      detalle: corregido ? "Corregido, en revisión" : "En revisión",
      titulo: corregido ? "Corregido: espera que el Gobierno lo revise" : `Presentado${e.creado_tad ? ` el ${diaCorto(e.creado_tad)}` : ""}: el Gobierno todavía no lo revisó`,
      bajada: `EX-${e.numero}.`,
    },
    { clave: "permiso", estado: "todavia", detalle: "Todavía no" },
  ];
}

function vinculoPropuesto(e: ExpParaEstado | undefined, acciones: Accion[]) {
  if (e && estadoVinculo(e) === "propuesto") {
    acciones.push({ clave: "confirmar_venta", titulo: `Confirmar que EX-${e.numero} es de esta venta`, detalle: "Sin eso el robot no escribe el trámite en Odoo.", para: "oficina", desde: e.estado_desde });
  }
}

/**
 * Las 7 etapas de un trámite y lo que le toca a la oficina. `e` es su expediente o, si se
 * presentó a mano, el de la misma venta.
 */
export function etapasDeTramite(
  t: TramiteParaEstado,
  docs: DocParaEstado[],
  tareas: TareaParaEstado[],
  e: ExpParaEstado | undefined,
  ctx: Contexto,
): { etapas: Etapa[]; acciones: Accion[] } {
  const acciones: Accion[] = [];
  const presentado = !!e?.creado_tad || t.estado === "presentado";
  const linkAVendedora = !!t.link_enviado_a && !!t.vendedor_email && t.link_enviado_a.trim().toLowerCase() === t.vendedor_email.trim().toLowerCase();
  const vendedora = ctx.nombres?.vendedora ?? "la vendedora";
  const paraCliente: Para = linkAVendedora || !ctx.supervision.linkAlCliente ? "vendedora" : "gestor";

  const etapas: Etapa[] = [{
    clave: "inicio", estado: "listo", fecha: t.created_at,
    detalle: t.link_enviado_at ? `Link enviado el ${diaCorto(t.link_enviado_at)}` : t.link_error ? "El link no salió" : "Link sin enviar",
  }];

  // ── Papeles del cliente
  const cli = docs.filter((d) => d.origen === "cliente");
  const ok = cli.filter((d) => d.estado === "ok");
  const obs = cli.filter((d) => d.estado === "observado");
  const enRevision = cli.filter((d) => d.estado === "revisando" || d.estado === "cargado");
  const faltan = cli.filter((d) => d.estado === "falta" || d.estado === "pedido");
  let ultimoAvance: string | null;
  if (!t.titular_cargado_at) {
    const sinLink = !!t.link_error && !t.link_enviado_at;
    if (sinLink) acciones.push({ clave: "copiar_link", titulo: "Mandarle el link al cliente por WhatsApp", detalle: t.link_error, para: paraCliente, desde: t.created_at });
    const aQuien = linkAVendedora ? `se le mandó a ${vendedora} el ${diaCorto(t.link_enviado_at)} para que se lo pase al cliente` : `se le mandó al cliente el ${diaCorto(t.link_enviado_at)}`;
    etapas.push({
      clave: "papeles", estado: "marcha", desde: t.link_enviado_at ?? t.created_at, quien: "Cliente",
      detalle: "Falta que cargue el dueño del lote",
      titulo: sinLink ? "El link al cliente no salió" : "Esperando que el cliente entre al portal",
      bajada: sinLink ? `${t.link_error} Copiá el link y mandalo por WhatsApp.` : `El link ${aQuien}. Todavía no cargó quién es el dueño del lote.`,
    });
    ultimoAvance = t.link_enviado_at ?? t.created_at;
  } else if (cli.length > 0 && obs.length === 0 && faltan.length === 0 && enRevision.length === 0) {
    etapas.push({ clave: "papeles", estado: "listo", fecha: ultima(cli.map((d) => d.revisado_at ?? d.updated_at)), detalle: `${ok.length} de ${cli.length} OK` });
    ultimoAvance = null;
  } else {
    const nombres = [...obs.map((d) => nombreDoc(d.clave)), ...faltan.map((d) => nombreDoc(d.clave))];
    const conteo = `${ok.length} de ${cli.length} OK`;
    const titulo = nombres.length ? `Le falta al cliente: ${listar(nombres.map(minuscula))}` : "Se están revisando los papeles del cliente";
    ultimoAvance = ultima([t.titular_cargado_at, ...cli.map((d) => d.subido_at ?? null), ...obs.map((d) => d.updated_at)]);
    etapas.push(obs.length
      ? {
          clave: "papeles", estado: "frenado", desde: ultima(obs.map((d) => d.updated_at)), quien: "Cliente",
          detalle: `${conteo} · a corregir: ${listar(obs.map((d) => nombreDoc(d.clave)))}`,
          titulo, bajada: `${conteo}. Se le pidió la corrección al cliente.`, motivo: obs[0].observacion,
        }
      : {
          clave: "papeles", estado: "marcha", desde: t.titular_cargado_at, quien: enRevision.length && !faltan.length ? "Robot" : "Cliente",
          detalle: faltan.length ? `${conteo} · faltan ${listar(faltan.map((d) => nombreDoc(d.clave)).slice(0, 3))}` : `${conteo} · en revisión`,
          titulo, bajada: `${conteo}.`,
        });
  }

  // Perseguir al cliente: pasó el umbral sin novedades desde el último avance o recordatorio.
  const papeles = etapas[1];
  if (papeles.estado !== "listo" && !presentado && !t.es_prueba && papeles.quien === "Cliente") {
    const ref = ultima([ultimoAvance, ctx.ultimoContactoCliente ?? null]);
    const umbral = t.titular_cargado_at ? UMBRAL_PAPELES : UMBRAL_SIN_DUENO;
    if (ref && dias(ref, ctx.ahora) > umbral) {
      acciones.push({
        clave: "perseguir_cliente",
        titulo: t.titular_cargado_at ? "Recordarle al cliente lo que falta" : "Recordarle al cliente que entre al portal",
        detalle: `Sin novedades ${haceCuanto(ref, ctx.ahora).replace("hace ", "desde hace ")}.`,
        para: paraCliente, desde: ref,
      });
    }
  }
  const papelesListos = papeles.estado === "listo";

  // ── Póliza
  const pol = docs.find((d) => d.clave === "poliza_rc");
  const raro = nombreSospechoso(t.titular_nombre);
  if (!pol && t.titular_cargado_at) {
    if (raro) {
      acciones.push({ clave: "revisar_dueno", titulo: "Corregir el nombre del dueño y mandar el endoso", detalle: `El nombre del dueño ${raro}: así no puede salir a Segucom.`, para: "gestor", desde: t.titular_cargado_at });
      etapas.push({ clave: "poliza", estado: "te_toca", desde: t.titular_cargado_at, quien: "Oficina", detalle: "No salió: nombre raro", titulo: "El endoso no salió solo", bajada: `El nombre del dueño ${raro}. Corregilo y mandá el endoso.` });
    } else {
      acciones.push({ clave: "pedir_endoso", titulo: "Pedir el endoso a Segucom", para: "gestor", desde: t.titular_cargado_at });
      etapas.push({
        clave: "poliza", estado: "te_toca", desde: t.titular_cargado_at, quien: "Oficina",
        detalle: ctx.supervision.endosoAutomatico ? "El endoso no salió" : "Falta pedir el endoso",
        titulo: "Falta pedir el endoso a Segucom", bajada: `El dueño del lote está cargado desde el ${diaCorto(t.titular_cargado_at)}.`,
      });
    }
  } else if (!pol) {
    etapas.push({ clave: "poliza", estado: "todavia", detalle: "Sale con el dueño cargado" });
  } else if (pol.estado === "ok") {
    etapas.push({ clave: "poliza", estado: "listo", fecha: pol.revisado_at ?? pol.updated_at, detalle: "Endoso OK" });
  } else if (pol.estado === "observado") {
    acciones.push({ clave: "volver_a_pedir_endoso", titulo: "Volver a pedir el endoso", detalle: primeraLinea(pol.observacion), para: "gestor", desde: pol.updated_at });
    etapas.push({ clave: "poliza", estado: "frenado", desde: pol.updated_at, quien: "Segucom", detalle: "La póliza volvió a corregir", titulo: "La póliza volvió con algo a corregir", motivo: pol.observacion });
  } else {
    etapas.push({
      clave: "poliza", estado: "marcha", desde: pol.pedido_at ?? pol.updated_at, quien: pol.estado === "revisando" ? "Robot" : "Segucom",
      detalle: pol.estado === "revisando" ? "En revisión" : "Pedido a Segucom",
      titulo: pol.estado === "revisando" ? "Se está revisando la póliza que subió Segucom" : "Esperando el endoso de Segucom",
      bajada: pol.pedido_at ? `Pedido el ${diaCorto(pol.pedido_at)}.` : null,
    });
  }

  // ── Encomienda del CPAU
  const enc = docs.find((d) => d.clave === "encomienda_cpau");
  const te = tareas.filter((x) => x.tipo === "cpau_encomienda").at(-1);
  const res = (te?.resultado ?? {}) as { finalizado?: boolean; registro?: string; cierre?: { etapa?: string; plataforma?: { enviada_at?: string } } };
  const cierre = res.cierre;
  if (enc?.estado === "ok") {
    etapas.push({ clave: "encomienda", estado: "listo", fecha: enc.revisado_at ?? enc.updated_at, detalle: "Certificado recibido" });
  } else if (te?.estado === "error") {
    const motivo = primeraLinea(te.error);
    if (res.finalizado && !cierre) acciones.push({ clave: "revisar_cpau", titulo: "Revisar el Histórico del CPAU antes de volver a armarla", detalle: "El robot tocó Finalizar y después falló: puede estar registrada y pagada.", para: "gestor", desde: te.terminada_at ?? te.created_at });
    else if (cierre) acciones.push({ clave: "reanudar_cierre", titulo: `Reanudar el cierre de la encomienda (quedó en «${cierre.etapa}»)`, detalle: motivo, para: "gestor", desde: te.terminada_at ?? te.created_at });
    else acciones.push({ clave: "volver_a_armar", titulo: "Volver a armar la encomienda", detalle: motivo, para: "gestor", desde: te.terminada_at ?? te.created_at });
    etapas.push({ clave: "encomienda", estado: "frenado", desde: te.terminada_at ?? te.created_at, quien: "Oficina", detalle: "El robot se frenó", titulo: "El robot no pudo armar la encomienda", motivo });
  } else if (cierre?.etapa === "cargada") {
    etapas.push({ clave: "encomienda", estado: "marcha", desde: cierre.plataforma?.enviada_at ?? te?.created_at, quien: "CPAU", detalle: "Falta el certificado", titulo: "Enviada al CPAU: falta el certificado", bajada: "Suele tardar 30–40 min en horario de oficina. El robot revisa el mail cada 15 min." });
  } else if (te && (te.estado === "pendiente" || te.estado === "tomada")) {
    const reintenta = te.estado === "pendiente" && !cierre && !!te.reintentar_desde;
    etapas.push({
      clave: "encomienda", estado: "marcha", desde: te.created_at, quien: "Robot",
      detalle: reintenta ? `Reintenta a las ${horaCorta(te.reintentar_desde)}` : cierre?.etapa ? `Va por «${cierre.etapa}»` : "El robot la está armando",
      titulo: reintenta ? `El CPAU no respondió: el robot reintenta a las ${horaCorta(te.reintentar_desde)}` : "El robot está armando la encomienda en el CPAU",
    });
  } else if (te?.estado === "esperando_aprobacion" || enc?.estado === "observado") {
    acciones.push({ clave: "ver_encomienda", titulo: enc?.estado === "observado" ? "Revisar el certificado de la encomienda" : "Revisar la encomienda que frenó en Confirmar", detalle: primeraLinea(enc?.observacion), para: "gestor", desde: te?.terminada_at ?? enc?.updated_at ?? null });
    etapas.push({ clave: "encomienda", estado: "te_toca", desde: te?.terminada_at ?? enc?.updated_at ?? null, quien: "Oficina", detalle: enc?.estado === "observado" ? "Certificado a corregir" : "Frenó en Confirmar", titulo: "La encomienda espera una revisión", motivo: enc?.observacion ?? null });
  } else if (papelesListos && !te) {
    const informe = docs.find((d) => d.clave === "informe_tecnico" && d.estado === "ok");
    if (!informe) {
      acciones.push({ clave: "generar_documentos", titulo: "Generar el informe técnico y el croquis", detalle: "No se generaron solos con los papeles completos.", para: "gestor", desde: papeles.fecha ?? null });
      etapas.push({ clave: "encomienda", estado: "te_toca", desde: papeles.fecha ?? null, quien: "Oficina", detalle: "Faltan informe y croquis", titulo: "Faltan el informe técnico y el croquis" });
    } else if (ctx.supervision.encomiendaAutomatica) {
      etapas.push({ clave: "encomienda", estado: "marcha", desde: informe.updated_at, quien: "Robot", detalle: "Se pide sola" });
    } else {
      acciones.push({ clave: "armar_encomienda", titulo: "Armar la encomienda del CPAU", detalle: "El robot hace todo: la carga, la finaliza, la firma, la paga y la envía.", para: "gestor", desde: informe.updated_at });
      etapas.push({ clave: "encomienda", estado: "te_toca", desde: informe.updated_at, quien: "Oficina", detalle: "Falta armarla", titulo: "Listo para armar la encomienda del CPAU", bajada: "Papeles completos, informe técnico y croquis generados." });
    }
  } else {
    etapas.push({ clave: "encomienda", estado: "todavia", detalle: "Con los papeles completos" });
  }

  // ── Presentación en TAD
  const tp = tareas.filter((x) => x.tipo === "tad_presentar").at(-1);
  const rp = (tp?.resultado ?? {}) as { confirmado?: boolean; tad_caido?: boolean; adjuntados?: number; borrador?: number | null; reintento?: number; reintentos_max?: number };
  const noAbre = borradorNoAbre(tp);
  if (e?.creado_tad) {
    etapas.push({ clave: "presentacion", estado: "listo", fecha: diaTad(e.creado_tad), detalle: `EX-${e.numero}` });
  } else if (t.estado === "presentado") {
    etapas.push({ clave: "presentacion", estado: "listo", fecha: tp?.terminada_at ?? null, detalle: "Número en espera", titulo: "Presentado: TAD dejó el número en espera", bajada: "El robot lo vincula solo cuando aparece en Trámites en curso." });
  } else if (tp?.estado === "error" || (tp?.estado === "pendiente" && noAbre)) {
    const motivo = primeraLinea(tp.error);
    const desde = tp.terminada_at ?? tp.created_at;
    let titulo = "La presentación se frenó";
    let bajada: string | null = null;
    if (rp.confirmado) {
      acciones.push({ clave: "revisar_confirmar", titulo: "Mirar en TAD si salió el expediente", detalle: "El robot tocó «Confirmar trámite» y después se frenó.", para: "gestor", desde });
      titulo = "Se tocó «Confirmar trámite»: mirá en TAD si salió el expediente";
    } else if (rp.tad_caido && !noAbre) {
      acciones.push({ clave: "seguir_borrador", titulo: `Seguir desde el borrador ${rp.borrador ?? ""}`.trim(), detalle: "TAD tenía caído el servicio de documentos: el borrador está sano.", para: "gestor", desde });
      titulo = "TAD tenía caído el servicio de documentos";
    } else if (noAbre || (rp.adjuntados ?? 0) > 0 || rp.borrador) {
      acciones.push({ clave: "empezar_de_cero", titulo: "Empezar la presentación de cero", detalle: noAbre ? "Reabrir un borrador no viene funcionando (0 de 8 desde el 15/09)." : null, para: "gestor", desde });
      titulo = noAbre ? `TAD no abre el borrador ${rp.borrador ?? ""}`.trim() : "La presentación se frenó a mitad de camino";
      bajada = noAbre
        ? "TAD lo abre pero no muestra los documentos. Desde el 15/09, reabrir un borrador funcionó 0 de 8 veces: reintentar no va a servir."
        : rp.adjuntados ? `Quedaron ${rp.adjuntados} documentos oficiales en el borrador ${rp.borrador}. Reabrir un borrador no viene funcionando: lo que anda es empezar de cero.` : null;
    } else {
      acciones.push({ clave: "volver_a_presentar", titulo: "Volver a presentar en TAD", para: "gestor", desde });
    }
    etapas.push({ clave: "presentacion", estado: "frenado", desde, quien: "Oficina", detalle: "Se frenó", titulo, bajada, motivo });
  } else if (tp?.estado === "pendiente" && tp.reintentar_desde) {
    etapas.push(rp.reintento
      ? { clave: "presentacion", estado: "marcha", desde: tp.created_at, quien: "Robot", detalle: `Reintenta a las ${horaCorta(tp.reintentar_desde)}`, titulo: `TAD no responde: el robot reintenta a las ${horaCorta(tp.reintentar_desde)} (${rp.reintento} de ${rp.reintentos_max ?? 16})`, bajada: "No hace falta tocar nada.", motivo: primeraLinea(tp.error) }
      : { clave: "presentacion", estado: "marcha", desde: tp.created_at, quien: "Robot", detalle: `Se presenta a las ${horaCorta(tp.reintentar_desde)}`, titulo: `Se presenta a las ${horaCorta(tp.reintentar_desde)}`, bajada: "TAD se usa de 19 a 7 porque a la tarde falla seguido." });
  } else if (tp && (tp.estado === "pendiente" || tp.estado === "tomada")) {
    etapas.push({ clave: "presentacion", estado: "marcha", desde: tp.created_at, quien: "Robot", detalle: "Presentando", titulo: "El robot está presentando en TAD", bajada: "Unos 7 minutos. La Mac de la oficina tiene que estar prendida." });
  } else if (etapas.slice(1, 4).every((x) => x.estado === "listo") && !tp) {
    const desde = ultima(etapas.slice(1, 4).map((x) => x.fecha ?? null));
    if (ctx.supervision.presentacionAutomatica) {
      etapas.push({ clave: "presentacion", estado: "marcha", desde, quien: "Robot", detalle: "Se pide sola", titulo: "Listo: la presentación se pide sola", bajada: "TAD se usa de 19 a 7." });
    } else {
      acciones.push({ clave: "presentar", titulo: "Presentar en TAD", para: "gestor", desde });
      etapas.push({ clave: "presentacion", estado: "te_toca", desde, quien: "Oficina", detalle: "Lista para presentar", titulo: "Listo para presentar en TAD", bajada: "Papeles, póliza y encomienda completos." });
    }
  } else {
    etapas.push({ clave: "presentacion", estado: "todavia", detalle: "Todavía no" });
  }

  // ── Gobierno y permiso
  etapas.push(...etapasGobierno(e, ctx, acciones));
  vinculoPropuesto(e, acciones);

  // Presentado por fuera de la app (a mano en TAD): lo que quedó sin terminar acá ya no traba nada.
  if (e?.creado_tad) {
    for (const x of etapas.slice(1, 4)) {
      if (x.estado !== "listo") Object.assign(x, { estado: "listo", fecha: null, desde: null, quien: undefined, motivo: null, titulo: undefined, bajada: null, detalle: "Se presentó a mano" });
    }
    for (let i = acciones.length - 1; i >= 0; i--) {
      if (["perseguir_cliente", "copiar_link", "revisar_dueno", "pedir_endoso", "volver_a_pedir_endoso", "generar_documentos", "armar_encomienda", "volver_a_armar", "ver_encomienda"].includes(acciones[i].clave)) acciones.splice(i, 1);
    }
  }
  return { etapas, acciones };
}

/** Las etapas de un expediente que no tiene trámite en la app (de antes, o presentado a mano). */
export function etapasDeExpediente(e: ExpParaEstado, ctx: Contexto): { etapas: Etapa[]; acciones: Accion[] } {
  const acciones: Accion[] = [];
  const presentado = e.creado_tad ? diaTad(e.creado_tad) : null;
  const previas: Etapa[] = (["inicio", "papeles", "poliza", "encomienda"] as const).map((clave) => ({ clave, estado: "listo", fecha: null, detalle: "Fuera de la app" }));
  const etapas: Etapa[] = [...previas, { clave: "presentacion", estado: "listo", fecha: presentado, detalle: `EX-${e.numero}` }, ...etapasGobierno(e, ctx, acciones)];
  vinculoPropuesto(e, acciones);
  return { etapas, acciones };
}

// ── El resumen: lo que muestra la fila y la tarjeta ──────────────────────────

function ordenar(acciones: Accion[]): Accion[] {
  const vistas = new Set<ClaveAccion>();
  return acciones
    .filter((a) => (vistas.has(a.clave) ? false : (vistas.add(a.clave), true)))
    .sort((a, b) => PRIORIDAD.indexOf(a.clave) - PRIORIDAD.indexOf(b.clave));
}

const DEPENDE: Record<Quien, string> = {
  Cliente: "depende del cliente", Segucom: "depende de Segucom", CPAU: "depende del CPAU", Robot: "lo está haciendo el robot", Gobierno: "depende del Gobierno", Oficina: "depende de la oficina",
};

export function resumir(
  etapasYAcciones: { etapas: Etapa[]; acciones: Accion[] },
  ctx: Contexto,
  opts: { esPrueba?: boolean; abierto?: string | null } = {},
): EstadoPermiso {
  const { etapas } = etapasYAcciones;
  const acciones = ordenar(etapasYAcciones.acciones);
  const frenada = etapas.find((x) => x.estado === "frenado");
  const tocaEtapa = etapas.find((x) => x.estado === "te_toca");
  const enMarcha = etapas.find((x) => x.estado === "marcha");
  const proxima = etapas.find((x) => x.estado === "todavia");
  const todas = etapas.every((x) => x.estado === "listo");
  const actualEtapa = frenada ?? tocaEtapa ?? enMarcha ?? (todas ? etapas.at(-1)! : proxima ?? etapas.at(-1)!);

  const gob = etapas.find((x) => x.clave === "gobierno")!;
  const emitido = etapas.find((x) => x.clave === "permiso")?.estado === "listo";
  const archivado = gob.estado === "frenado" && gob.detalle === ARCHIVADO;

  // Un expediente que la oficina dejó de seguir va con los archivados, aunque TAD lo muestre en curso.
  const grupo: Grupo = opts.esPrueba
    ? "prueba"
    : acciones.length > 0
      ? "te_toca"
      : emitido ? "emitido" : archivado || ctx.descartado ? "archivado" : gob.estado === "marcha" ? "gobierno" : "esperando";

  const tono: Tono = emitido ? "listo" : frenada ? "bloqueo" : acciones.length ? "aviso" : enMarcha ? "marcha" : "neutro";
  const loTiene: Quien | null = emitido ? null : actualEtapa.quien ?? (acciones.length ? "Oficina" : null);
  const desde = actualEtapa.estado === "listo" ? actualEtapa.fecha ?? null : actualEtapa.desde ?? null;

  let estimado: string | null = null;
  const pres = etapas.find((x) => x.clave === "presentacion");
  if (!emitido && !archivado) {
    const t = ctx.tipico;
    if (frenada || (tocaEtapa && !enMarcha)) estimado = `Frenado: ${DEPENDE[(frenada ?? tocaEtapa)!.quien ?? "Oficina"]}`;
    else if (pres?.estado === "listo" && pres.fecha && t?.gcba != null) {
      const est = aDiaHabil(Date.parse(pres.fecha) + t.gcba * DIA);
      estimado = est < ctx.ahora ? `Ya tendría que haber salido (lo normal: ${diaCorto(new Date(est).toISOString())})` : `Permiso aprox. ${diaConNombre(est)}`;
    } else if (pres?.estado !== "listo" && etapas[1]?.estado !== "listo") estimado = "Depende de los papeles del cliente";
    else if (pres?.estado !== "listo" && t?.aPresentar != null && opts.abierto) {
      const est = aDiaHabil(Math.max(ctx.ahora + DIA / 2, Date.parse(opts.abierto) + t.aPresentar * DIA));
      estimado = `Presentación aprox. ${diaConNombre(est)}`;
    }
  }

  return {
    etapas,
    actual: actualEtapa.clave,
    grupo,
    tono,
    titulo: actualEtapa.titulo ?? (todas ? "Permiso emitido" : actualEtapa.detalle),
    bajada: actualEtapa.bajada ?? null,
    motivo: actualEtapa.motivo ?? null,
    loTiene,
    desde,
    demora: actualEtapa.estado === "listo" ? "" : demoraDe(actualEtapa.clave, desde, ctx.ahora),
    acciones,
    estimado,
  };
}

export type Tipico = { aPresentar: number | null; gcba: number | null; nPresentados: number; nEmitidos: number };

/**
 * Medianas en días de abierto → presentado y presentado → permiso, de los trámites que ya pasaron
 * cada tramo. Las fechas son las de TAD (creado_tad y el permiso emitido): las mismas en la lista
 * y en la ficha.
 */
export function tipicoDe(filas: { abierto: string; presentado: string | null; permiso: string | null }[]): Tipico {
  const mediana = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : null);
  const aPresentar: number[] = [];
  const gcba: number[] = [];
  for (const f of filas) {
    if (!f.presentado) continue;
    const pres = Date.parse(diaTad(f.presentado));
    aPresentar.push(Math.max(0, (pres - Date.parse(f.abierto)) / DIA));
    if (f.permiso) gcba.push(Math.max(0, (Date.parse(diaTad(f.permiso)) - pres) / DIA));
  }
  return { aPresentar: mediana(aPresentar), gcba: mediana(gcba), nPresentados: aPresentar.length, nEmitidos: gcba.length };
}
