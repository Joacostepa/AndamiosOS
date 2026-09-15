// Tipos y reglas de presentación de Permisos vía pública — compartidos por servidor y cliente.
//
// Ver docs/modulo-gestoria-permisos.md. Lo importante para leer este archivo: el estado es
// EL DE TAD, tal cual lo lee el robot. Acá no se decide nada sobre el trámite; sólo cómo se
// agrupa y cómo se nombra lo que dice el Gobierno.

import type { Supervision } from "./supervision";

export type Solapa = "en_curso" | "finalizado";

export type Expediente = {
  id: string;
  expediente: string;
  numero: string;
  nombre: string | null;
  titular: string | null;
  estado_tad: string;
  solapa: Solapa;
  creado_tad: string | null;
  estado_desde: string;
  tarea_pendiente: boolean;
  motivo_subsanacion: string | null;
  motivo_leido_at: string | null;
  permiso_notificacion: string | null;
  permiso_path: string | null;
  odoo_venta_id: number | null;
  odoo_venta_nombre: string | null;
  direccion: string | null;
  cliente: string | null;
  /** De la carátula del expediente (la lee el robot una sola vez). */
  barrio: string | null;
  comuna: string | null;
  seccion: string | null;
  manzana: string | null;
  parcela: string | null;
  pedido_desde: string | null;
  pedido_hasta: string | null;
  seguro_compania: string | null;
  seguro_vence: string | null;
  contacto_mail: string | null;
  caratula_path: string | null;
  caratula_leida_at: string | null;
  caratula_error: string | null;
  /** Del PDF del permiso: día de la firma y vigencia otorgada (puede ser menor a la pedida). */
  permiso_emitido_el: string | null;
  permiso_vence: string | null;
  /** Cómo se llegó a la venta. "direccion" es una propuesta hasta que alguien la confirma. */
  odoo_vinculo_por: "numero" | "direccion" | "persona" | null;
  odoo_vinculo_confirmado_at: string | null;
  odoo_vinculo_confirmado_por: string | null;
  odoo_ventas_descartadas: number[];
  /** Lo último que el robot dejó escrito en la venta. */
  odoo_escrito: Record<string, string> | null;
  odoo_escrito_at: string | null;
  /** Por qué el robot NO escribió en la venta (conflicto con lo cargado a mano). */
  odoo_error: string | null;
  visto_primero_at: string;
  visto_ultimo_at: string;
  /**
   * Finalizado anterior al robot, guardado como historial (15/09): sólo la fila de la lista de
   * TAD. El robot no lo relee, no abre su detalle ni baja su permiso.
   */
  historico: boolean;
};

export type TipoEvento =
  | "alta" | "cambio_estado" | "tarea_subsanacion" | "tarea_resuelta"
  | "motivo" | "permiso_descargado" | "vinculado_odoo" | "error_robot" | "caratula_leida"
  | "vinculo_confirmado" | "vinculo_descartado" | "odoo_escrito" | "odoo_conflicto"
  | "tramite_abierto" | "documento_pedido" | "documento_subido" | "documento_revisado" | "aviso_productor"
  | "link_cliente" | "titular_cargado" | "encomienda_cpau" | "presentacion_tad";

export type TipoDueno = "consorcio" | "empresa" | "persona";

export const ETIQUETA_DUENO: Record<TipoDueno, string> = {
  consorcio: "Un consorcio",
  empresa: "Una empresa",
  persona: "Una persona",
};

type ItemLegajo = { clave: string; nombre: string };

/**
 * Lo que el cliente tiene que subir según quién es el dueño del lote. Sale de los
 * instructivos de Tamara (docs/modulo-gestoria-permisos.md § 1).
 */
export const LEGAJO: Record<TipoDueno, ItemLegajo[]> = {
  consorcio: [
    { clave: "aviso_obra", nombre: "Aviso o permiso de obra" },
    { clave: "acta_asamblea", nombre: "Acta de asamblea con la designación del administrador (legalizada y vigente)" },
    { clave: "reglamento", nombre: "Reglamento de copropiedad" },
    { clave: "dni_administrador", nombre: "DNI del administrador (frente y dorso)" },
    { clave: "constancia_cuit", nombre: "Constancia de CUIT del consorcio" },
    { clave: "nota_solicitud", nombre: "Nota de solicitud firmada" },
    { clave: "acta_compromiso", nombre: "Acta de compromiso firmada" },
  ],
  empresa: [
    { clave: "aviso_obra", nombre: "Aviso o permiso de obra" },
    { clave: "poder", nombre: "Poder certificado por escribano" },
    { clave: "estatuto", nombre: "Estatuto certificado" },
    { clave: "acta_directorio", nombre: "Acta de directorio con la designación de autoridades" },
    { clave: "dni_apoderado", nombre: "DNI del apoderado (frente y dorso)" },
    { clave: "constancia_cuit", nombre: "Constancia de CUIT" },
    { clave: "nota_solicitud", nombre: "Nota de solicitud firmada" },
    { clave: "acta_compromiso", nombre: "Acta de compromiso firmada" },
  ],
  persona: [
    { clave: "aviso_obra", nombre: "Aviso de obra" },
    { clave: "dni", nombre: "DNI (frente y dorso)" },
    { clave: "constancia_cuit", nombre: "Constancia de CUIT" },
    { clave: "nota_autorizacion", nombre: "Nota de autorización firmada" },
    { clave: "acta_compromiso", nombre: "Acta de compromiso firmada" },
    { clave: "titulo_propiedad", nombre: "Título de propiedad" },
  ],
};

/** Si quien contrata alquila: lo del dueño más esto. */
export const LEGAJO_INQUILINO: ItemLegajo[] = [
  { clave: "contrato_alquiler", nombre: "Contrato de alquiler" },
  { clave: "nota_dueno", nombre: "Nota del dueño autorizando el andamio" },
];

/**
 * Los documentos que el cliente puede COMPLETAR Y FIRMAR en el portal en vez de imprimir,
 * firmar y escanear: el acta de compromiso del GCBA y la nota de ABA. La nota es la misma
 * plantilla ("solicitamos el permiso… autorizamos a Emprendimientos y Estructuras") y en el
 * legajo se llama "de solicitud" para consorcios y empresas y "de autorización" para personas.
 */
export const clavesFirmables = (tipo: TipoDueno) => ["acta_compromiso", tipo === "persona" ? "nota_autorizacion" : "nota_solicitud"];

export const CARACTER_POR_DEFECTO: Record<TipoDueno, string> = {
  consorcio: "Administrador",
  empresa: "Apoderado",
  persona: "Propietario",
};

export function legajoDe(tipo: TipoDueno, esInquilino: boolean): ItemLegajo[] {
  return [...LEGAJO[tipo], ...(esInquilino ? LEGAJO_INQUILINO : [])];
}

/**
 * El trámite: la unidad de trabajo para presentar (o subsanar) un permiso, con o sin
 * expediente. El titular del lote es el coasegurado de la póliza y NO es el cliente de
 * Odoo, que muchas veces es la constructora.
 */
export type Tramite = {
  id: string;
  expediente_id: string | null;
  odoo_venta_id: number | null;
  odoo_venta_nombre: string | null;
  direccion: string;
  titular_nombre: string | null;
  titular_cuit: string | null;
  permiso_hasta: string | null;
  estado: string;
  created_at: string;
  /** Del portal del cliente (trámites abiertos desde una venta). */
  cliente_nombre: string | null;
  cliente_email: string | null;
  token_cliente: string | null;
  tipo_dueno: TipoDueno | null;
  es_inquilino: boolean;
  titular_cargado_at: string | null;
  link_enviado_at: string | null;
  link_error: string | null;
  /** A quién salió el link: el cliente o, en modo supervisado, el vendedor. */
  link_enviado_a: string | null;
  /** Vendedor de la orden en Odoo: va en copia de todo y le llegan las respuestas. */
  vendedor_nombre: string | null;
  vendedor_email: string | null;
  /** Trámite de prueba: los mails van a la casilla de la app y no crea alertas. */
  es_prueba: boolean;
};

export type EstadoDocumento = "falta" | "pedido" | "cargado" | "revisando" | "ok" | "observado";

/** `bloquea: false` = se muestra pero no frena (lo pide la ficha y nunca lo observaron). */
export type ChequeoPoliza = { clave: string; ok: boolean; bloquea: boolean; detalle: string };

/** Lo que queda guardado de cualquier revisión: qué leyó el modelo y las reglas que se aplicaron. */
export type RevisionDocumento = {
  modelo: string | null;
  leido: unknown;
  chequeos: ChequeoPoliza[];
};

export type RevisionPoliza = RevisionDocumento & {
  leido: {
    es_poliza: boolean;
    compania: string | null;
    numero_poliza: string | null;
    vigencia_hasta: string | null;
    suma_asegurada: number | null;
    titular_como_coasegurado: boolean;
    titular_en_no_repeticion: boolean;
    como_figura_titular: string | null;
    gcba_en_no_repeticion: boolean;
    gcba_asegurado_adicional: boolean;
    indemnidad_gcba: boolean;
  } | null;
};

export type Documento = {
  id: string;
  tramite_id: string;
  clave: string;
  origen: "cliente" | "aba" | "productor";
  estado: EstadoDocumento;
  archivo_path: string | null;
  archivo_nombre: string | null;
  version: number;
  subido_por: string | null;
  subido_at: string | null;
  revision: RevisionDocumento | null;
  revisado_at: string | null;
  observacion: string | null;
  pedido_at: string | null;
  aviso_enviado_at: string | null;
  aviso_error: string | null;
  recordatorio_at: string | null;
};

export const NOMBRE_DOCUMENTO: Record<string, string> = {
  ...Object.fromEntries([...Object.values(LEGAJO).flat(), ...LEGAJO_INQUILINO].map((d) => [d.clave, d.nombre])),
  poliza_rc: "Póliza de RC (endoso)",
  encomienda_cpau: "Encomienda del CPAU",
  croquis: "Croquis",
  informe_tecnico: "Informe técnico",
};

export const ETIQUETA_ESTADO_DOCUMENTO: Record<EstadoDocumento, string> = {
  falta: "Falta",
  pedido: "Pedido",
  cargado: "Cargado",
  revisando: "Revisando",
  ok: "Lista",
  observado: "Observada",
};

export const formatoCuit = (c: string) => (c.length === 11 ? `${c.slice(0, 2)}-${c.slice(2, 10)}-${c.slice(10)}` : c);

/** Dígito verificador de CUIT/CUIL (módulo 11). */
export function cuitValido(cuit: string): boolean {
  const d = cuit.replace(/\D/g, "");
  if (d.length !== 11) return false;
  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const suma = pesos.reduce((s, p, i) => s + p * Number(d[i]), 0);
  const resto = 11 - (suma % 11);
  const verificador = resto === 11 ? 0 : resto === 10 ? 9 : resto;
  return verificador === Number(d[10]);
}

/** El motivo de la subsanación habla de la póliza: hay que pedir un endoso. */
export const motivoDePoliza = (motivo: string | null) => !!motivo && /P[OÓ]LIZA|SEGURO|NO REPETICI|COASEGURAD/i.test(motivo);

export type EstadoVinculo = "sin_vincular" | "propuesto" | "confirmado";

/**
 * Un vínculo por dirección es una PROPUESTA: la misma dirección tiene varias ventas y uno
 * equivocado le abriría el candado del tablero a la obra de otro. El robot no escribe en
 * Odoo hasta que una persona lo confirma. Por número de expediente es exacto.
 */
export function estadoVinculo(
  e: Pick<Expediente, "odoo_venta_id" | "odoo_vinculo_por" | "odoo_vinculo_confirmado_at">,
): EstadoVinculo {
  if (!e.odoo_venta_id) return "sin_vincular";
  return e.odoo_vinculo_por === "numero" || e.odoo_vinculo_confirmado_at ? "confirmado" : "propuesto";
}

/**
 * La carátula no trae altura cuando en TAD se escribió la calle sin elegirla del buscador
 * (pasa también que la guarda como "APELLIDO, NOMBRE"). Sin altura no se puede proponer
 * una venta: hay que vincularla a mano.
 */
export const sinAltura = (direccion: string | null) => !!direccion && !/\d/.test(direccion);

/** La venta vinculada tal como está hoy en Odoo, para comparar antes de confirmar. */
export type VentaOdoo = {
  id: number;
  nombre: string;
  direccion: string | null;
  cliente: string | null;
  fecha: string | null;
  modalidad: string | null;
  tramite: string | null;
  expedienteNro: string | null;
  permisoFecha: string | null;
  url: string | null;
};

export type Evento = {
  id: number;
  expediente_id: string | null;
  tipo: TipoEvento;
  detalle: string | null;
  datos: Record<string, unknown>;
  actor: "robot" | "gcba" | "persona" | "productor" | "ia" | "sistema" | "cliente";
  created_at: string;
};

export type EstadoRobot = {
  ultima_revision_at: string | null;
  ultimo_ok_at: string | null;
  proxima_revision_at: string | null;
  ultimo_error: string | null;
  ultimo_error_at: string | null;
  equipo: string | null;
};

export type ClaveGrupo = "accion" | "gobierno" | "emitidos";

export type GrupoExpedientes = { clave: ClaveGrupo; titulo: string; descripcion: string; filas: Expediente[] };

/** Una venta con permiso que todavía no arrancó: lo que ofrece el botón "Iniciar trámite". */
export type VentaParaIniciar = {
  ventaId: number;
  venta: string;
  fecha: string | null;
  direccion: string | null;
  cliente: string | null;
  email: string | null;
  /** Por qué el mail no va a salir (vacío, inválido, mal escrito). null = sale. */
  problemaMail: string | null;
  modalidad: string | null;
  /** Vendedor de la orden (nombre). */
  vendedor: string | null;
};

/** Un trámite abierto desde una venta que todavía no se presentó en TAD. */
export type TramiteNuevo = Pick<
  Tramite,
  "id" | "direccion" | "odoo_venta_nombre" | "cliente_nombre" | "vendedor_nombre" | "titular_nombre" | "titular_cargado_at" | "link_enviado_at" | "link_enviado_a" | "link_error" | "created_at" | "es_prueba"
> & { pvp_documentos: Pick<Documento, "estado" | "origen" | "clave">[] };

/**
 * La última encomienda del CPAU del trámite (tarea `cpau_encomienda` del robot).
 * `esperando_aprobacion` = el robot completó todo y frenó en Confirmar.
 */
export type EncomiendaFicha = {
  id: number;
  estado: "pendiente" | "tomada" | "esperando_aprobacion" | "ok" | "error";
  payload: {
    es_prueba: boolean;
    finalizar: boolean;
    direccion: string;
    propietario: { nombre: string; cuit: string };
    frente: { calle: string; desde: number; hasta: number };
    superficie: string;
    descripcion: string;
  };
  resultado: {
    etapa?: "confirmar" | "finalizada";
    resumen?: string;
    calle_cpau?: string | null;
    texto_final?: string;
    registro?: string | null;
    finalizado?: boolean;
  } | null;
  error: string | null;
  created_at: string;
  terminada_at: string | null;
  capturas: { nombre: string; url: string | null }[];
};

/**
 * La presentación en TAD del trámite: qué falta para poder presentar (casillero por casillero)
 * y la última tarea `tad_presentar` del robot.
 */
export type PresentacionFicha = {
  estado: {
    listo: boolean;
    faltan: string[];
    casilleros: { casillero: string; documentos: { clave: string; nombre: string; ok: boolean }[]; ok: boolean }[];
  };
  tarea: {
    id: number;
    estado: "pendiente" | "tomada" | "esperando_aprobacion" | "ok" | "error";
    payload: { es_prueba: boolean; obra: { calle: string; altura: number; smp: string }; adjuntos: { casillero: string }[] };
    resultado: {
      etapa?: "prueba" | "presentado";
      expediente?: string;
      borrador?: number | null;
      borrador_borrado?: boolean;
      adjuntados?: number;
      confirmado?: boolean;
      obra?: { calle: string; barrio: string; comuna: string; smp: string };
    } | null;
    error: string | null;
    created_at: string;
    terminada_at: string | null;
    capturas: { nombre: string; url: string | null }[];
  } | null;
};

export type FichaTramite = {
  tramite: Tramite;
  documentos: (Documento & { url: string | null })[];
  encomienda: EncomiendaFicha | null;
  presentacion: PresentacionFicha;
  eventos: Evento[];
  /** El link del portal, para copiarlo y mandarlo por WhatsApp. */
  linkCliente: string | null;
  /** Sólo en pruebas: la página "de Segucom" de prueba, para subir una póliza. */
  linkProductorPrueba: string | null;
};

export type Bandeja = {
  tramitesNuevos: TramiteNuevo[];
  grupos: GrupoExpedientes[];
  /** Expedientes que se siguen (sin el historial). */
  total: number;
  /** Finalizados anteriores al robot, del más nuevo al más viejo. */
  historial: Expediente[];
  /** Interruptores del modo supervisado. */
  supervision: Supervision;
  robot: EstadoRobot | null;
  /** Hay una revisión pedida o corriendo. */
  revisando: boolean;
};

export type FichaExpediente = {
  expediente: Expediente;
  eventos: Evento[];
  /** URL firmada del permiso emitido, válida 10 minutos. */
  permisoUrl: string | null;
  /** null si no hay venta vinculada o si Odoo no respondió (ver ventaError). */
  venta: VentaOdoo | null;
  ventaError: string | null;
  tramite: Tramite | null;
  /** Con URL firmada de 10 minutos para ver el PDF, si hay uno subido. */
  documentos: (Documento & { url: string | null })[];
};

/** Sin tildes y en mayúsculas: TAD escribe "SUBSANACIÓN" y "SUBSANACION" en la misma lista. */
export function normalizarEstado(estado: string): string {
  return estado.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().trim();
}

const ETIQUETAS: Record<string, string> = {
  INICIACION: "Iniciación",
  SUBSANACION: "Subsanación",
  TRAMITACION: "Tramitación",
  "GUARDA TEMPORAL": "Guarda temporal",
};

export function etiquetaEstado(estado: string): string {
  const n = normalizarEstado(estado);
  return ETIQUETAS[n] ?? n.charAt(0) + n.slice(1).toLowerCase();
}

/**
 * Qué significa cada estado, en palabras de quien no conoce TAD.
 *
 * "Tramitación" suena a "en trámite" y es lo contrario: en este trámite es el estado en el
 * que queda el expediente cuando el permiso YA salió. El instructivo lo aclara con
 * mayúsculas; acá se dice una vez y la pantalla no lo vuelve a confundir.
 */
export function explicacionEstado(e: Pick<Expediente, "estado_tad" | "solapa" | "tarea_pendiente">): string {
  const n = normalizarEstado(e.estado_tad);
  if (e.tarea_pendiente) return "El Gobierno observó algo y hay que corregirlo.";
  // TAD deja el expediente en SUBSANACIÓN también DESPUÉS de que se subsanó, hasta que lo
  // vuelven a revisar. Lo que distingue "hay que corregir" de "ya se corrigió" es la tarea
  // pendiente, no el estado (medido 2026-09-14: 8 en subsanación, sólo 2 con tarea).
  if (n === "SUBSANACION") return "Ya se subsanó. El Gobierno todavía no lo volvió a revisar.";
  if (n === "INICIACION") return "Presentado. El Gobierno todavía no lo revisó.";
  if (n === "TRAMITACION") return "El permiso salió.";
  if (e.solapa === "finalizado") return "Archivado por el Gobierno.";
  return "Estado informado por TAD.";
}

export type ColorEstado = "red" | "yellow" | "green" | "gray" | "blue";

export function colorEstado(e: Pick<Expediente, "estado_tad" | "solapa" | "tarea_pendiente">): ColorEstado {
  const n = normalizarEstado(e.estado_tad);
  if (e.tarea_pendiente) return "red";
  if (n === "SUBSANACION") return "blue";
  if (n === "INICIACION") return "yellow";
  if (n === "TRAMITACION" || e.solapa === "finalizado") return "green";
  return "gray";
}

export function grupoDe(e: Expediente): ClaveGrupo {
  const n = normalizarEstado(e.estado_tad);
  if (e.tarea_pendiente) return "accion";
  if (n === "TRAMITACION" || e.solapa === "finalizado") return "emitidos";
  return "gobierno";
}

const GRUPOS: Omit<GrupoExpedientes, "filas">[] = [
  { clave: "accion", titulo: "Necesitan acción", descripcion: "Con tarea de subsanación en TAD: hay que corregir y volver a presentar." },
  { clave: "gobierno", titulo: "Esperando al Gobierno", descripcion: "Presentados o ya subsanados, todavía sin revisar." },
  { clave: "emitidos", titulo: "Permiso emitido", descripcion: "Salió el permiso o el expediente se archivó." },
];

/**
 * Agrupa por lo que hay que hacer. Dentro de cada grupo, el que lleva más tiempo en su
 * estado primero: en "Esperando al Gobierno" eso deja arriba a los trabados, y en
 * "Necesitan acción" a la observación más vieja.
 */
export function agrupar(expedientes: Expediente[]): GrupoExpedientes[] {
  return GRUPOS.map((g) => ({
    ...g,
    filas: expedientes
      .filter((e) => grupoDe(e) === g.clave)
      .sort((a, b) =>
        g.clave === "emitidos"
          ? b.estado_desde.localeCompare(a.estado_desde)
          : a.estado_desde.localeCompare(b.estado_desde),
      ),
  }));
}

export function coincide(e: Expediente, busqueda: string): boolean {
  const q = normalizarEstado(busqueda);
  if (!q) return true;
  return [e.expediente, e.titular, e.odoo_venta_nombre, e.direccion, e.barrio, e.cliente, e.motivo_subsanacion]
    .some((v) => v && normalizarEstado(v).includes(q));
}
