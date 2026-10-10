// Tipos y reglas de presentación de Permisos vía pública — compartidos por servidor y cliente.
//
// Ver docs/permisos/modulo.md. Lo importante para leer este archivo: el estado es
// EL DE TAD, tal cual lo lee el robot. Acá no se decide nada sobre el trámite; sólo cómo se
// agrupa y cómo se nombra lo que dice el Gobierno.


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
 * instructivos de Tamara (docs/permisos/modulo.md § 1).
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
 * La empresa prueba el lote con el título si es la dueña o con el contrato si lo alquila, y
 * en ese caso no hace falta nota del dueño: la firma la empresa inquilina (JS, 02/10, con
 * Av. Corrientes 985, S02711, la primera empresa inquilina).
 */
const LEGAJO_EMPRESA_DUENA: ItemLegajo[] = [{ clave: "titulo_propiedad", nombre: "Título de propiedad" }];
const LEGAJO_EMPRESA_INQUILINA: ItemLegajo[] = [{ clave: "contrato_alquiler", nombre: "Contrato de alquiler" }];

/**
 * Los documentos que el cliente puede COMPLETAR Y FIRMAR en el portal en vez de imprimir,
 * firmar y escanear: el acta de compromiso del GCBA y la nota de ABA. La nota es la misma
 * plantilla ("solicitamos el permiso… autorizamos a Emprendimientos y Estructuras") y en el
 * legajo se llama "de solicitud" para consorcios y empresas y "de autorización" para personas.
 */
export const clavesFirmables = (tipo: TipoDueno) => ["acta_compromiso", tipo === "persona" ? "nota_autorizacion" : "nota_solicitud"];

/**
 * Cuánto del recuadro de firma tiene que estar dibujado para que sea una firma. Nace de
 * SANTA FE AV. 3085 (S02599, 24/09): el cliente mandó el recuadro VACÍO —la imagen quedó
 * transparente entera— y el acta y la nota se presentaron en TAD sin firma; el Gobierno las
 * observó ("AMBAS SIN FIRMA DE PUÑO Y LETRA DEL SR ADM SCAMPINI JORGE"). Un clic sin arrastrar
 * no dibuja nada y hasta entonces alcanzaba para dar por firmado.
 *
 * 0,2 % de los píxeles del recuadro. Las once firmas reales que hubo hasta hoy ocupan entre
 * 1,1 % y 2,8 %, así que hay cinco veces de margen: sólo frena lo que está prácticamente en
 * blanco. Es proporción, no píxeles: no cambia con la densidad de la pantalla.
 */
export const MINIMO_TINTA_FIRMA = 0.002;

/** Desde qué opacidad un píxel del recuadro cuenta como trazo (0 a 255). */
export const MINIMO_ALFA_FIRMA = 32;

export const CARACTER_POR_DEFECTO: Record<TipoDueno, string> = {
  consorcio: "Administrador",
  empresa: "Apoderado",
  persona: "Propietario",
};

export function legajoDe(tipo: TipoDueno, esInquilino: boolean): ItemLegajo[] {
  if (tipo === "empresa") return [...LEGAJO.empresa, ...(esInquilino ? LEGAJO_EMPRESA_INQUILINA : LEGAJO_EMPRESA_DUENA)];
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
  /** En consorcios, la persona del administrador: va también como coasegurado en el endoso (JS, 15/09). */
  administrador_nombre: string | null;
  administrador_cuit: string | null;
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
  updated_at: string | null;
};

export const NOMBRE_DOCUMENTO: Record<string, string> = {
  ...Object.fromEntries([...Object.values(LEGAJO).flat(), ...LEGAJO_INQUILINO].map((d) => [d.clave, d.nombre])),
  poliza_rc: "Póliza de RC (endoso)",
  encomienda_cpau: "Encomienda del CPAU",
  croquis: "Croquis",
  informe_tecnico: "Informe técnico",
};

/**
 * Tope de lo que se puede subir al legajo. La API de Claude acepta 32 MB por pedido y el archivo
 * viaja en base64 (pesa un tercio más), así que arriba de 20 MB la revisión ni se intenta; TAD
 * tampoco toma adjuntos de más de 20 MB. El 17/09 un cliente subió el libro de actas entero
 * (32,8 MB, 92 páginas) de Av. Córdoba 950 y el documento quedó sin revisar sin que él se enterara.
 */
export const MAX_ARCHIVO_LEGAJO = 20 * 1024 * 1024;

const ACTAS = ["acta_asamblea", "acta_directorio"];
const LARGOS = ["reglamento", "estatuto", "poder", "titulo_propiedad", "contrato_alquiler"];

/** Qué decirle a quien sube un archivo demasiado grande, según el documento. */
export function motivoArchivoGrande(clave: string, bytes: number): string {
  const pesa = `El archivo pesa ${(bytes / 1048576).toLocaleString("es-AR", { maximumFractionDigits: 1 })} MB y no se puede revisar (el máximo son ${MAX_ARCHIVO_LEGAJO / 1048576} MB).`;
  if (ACTAS.includes(clave)) {
    return `${pesa} No hace falta el libro de actas completo: subí sólo las hojas del acta de la asamblea que designó o renovó al administrador.`;
  }
  if (LARGOS.includes(clave)) {
    return `${pesa} Volvé a escanearlo en menor calidad (por ejemplo en blanco y negro o en modo "texto"), así pesa menos.`;
  }
  return `${pesa} Sacale una foto más liviana o escanealo en menor calidad.`;
}

/** Sin género: van al lado de «Reglamento», «DNI» o «Acta» (rediseño 09/10). */
export const ETIQUETA_ESTADO_DOCUMENTO: Record<EstadoDocumento, string> = {
  falta: "Falta",
  pedido: "Pedido",
  cargado: "Subido",
  revisando: "En revisión",
  ok: "OK",
  observado: "A corregir",
};

/** Para la ficha: "Consorcio" al lado del nombre. El portal usa ETIQUETA_DUENO ("Un consorcio"). */
export const TIPO_DUENO_CORTO: Record<TipoDueno, string> = {
  consorcio: "Consorcio",
  empresa: "Empresa",
  persona: "Persona",
};

/**
 * Por qué un nombre del dueño del lote no puede salir así a Segucom ni al CPAU, o null si está
 * bien. Nace de Echeverría 2931 (S02672, 26/09): el cliente pegó el nombre del padrón y quedó
 * `"CONSORCIO DE COPROPIETARIOS EDIFICIO CALLE ECHEVERRIA nú3 meros 2931/33/35, CAPITAL FEDERAL"`,
 * con comillas y la codificación rota. Con esto el endoso automático se frena y espera a una
 * persona.
 */
export function nombreSospechoso(nombre: string | null | undefined): string | null {
  const n = (nombre ?? "").trim();
  if (!n) return null;
  if (/[\u0000-\u001f\u007f�]/.test(n) || /Ã[\u0080-¿]|Â[\u0080-¿]/.test(n)) return "tiene caracteres mal codificados";
  if (/["“”«»]/.test(n)) return "tiene comillas";
  // Una letra pegada a un número ("nú3 meros"): en un nombre no pasa. "2931/33/35" y "PJE 1681" sí.
  if (/\p{L}\d/u.test(n)) return "tiene un número pegado a una letra";
  return null;
}

/**
 * Salió el permiso: TRAMITACIÓN (en este trámite es "permiso emitido") o una resolución RS-
 * guardada. Guarda temporal sin resolución NO es permiso: el 09/10 S02128 y S02563 se archivaron
 * así y el robot guardó como permiso nuestra nota de solicitud.
 */
export function tienePermiso(e: Pick<Expediente, "estado_tad" | "permiso_notificacion">): boolean {
  return normalizarEstado(e.estado_tad) === "TRAMITACION" || /^RS-/i.test(e.permiso_notificacion ?? "");
}

/** El Gobierno lo archivó (Guarda temporal) sin que haya salido el permiso. */
export function archivadoSinPermiso(e: Pick<Expediente, "estado_tad" | "solapa" | "permiso_notificacion">): boolean {
  return e.solapa === "finalizado" && !tienePermiso(e);
}

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

export const MODALIDAD: Record<string, string> = {
  sin_permiso: "Se arma sin expediente ni permiso",
  con_expediente: "Se arma con el expediente",
  esperar_permiso: "Se arma con el permiso emitido",
};

export const TRAMITE_ODOO: Record<string, string> = { no_presentado: "No presentado", presentado: "Presentado", emitido: "Emitido" };

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
    /** El CPAU no respondió antes de Finalizar: el robot la vuelve a armar sola (hasta 3 veces). */
    reintentos_armado?: number;
    ultimo_error?: string;
    /** Cierre sin personas (16/09): robot/cpau-encomienda.mjs lo avanza etapa por etapa. */
    cierre?: {
      etapa: "finalizada" | "firmada" | "pagada" | "cargada" | "certificado";
      finalizada_at?: string;
      firmada_at?: string;
      pago?: { operacion?: string; intentado_at?: string | null; aprobado_at?: string; rechazado_at?: string };
      plataforma?: { intentado_at?: string; enviada_at?: string };
      ultima_busqueda_at?: string;
      certificado?: { nombre: string; recibido_at: string };
      reintentos?: number;
      ultimo_error?: string;
    };
  } | null;
  error: string | null;
  /** En la cola con hora: esperando el mail con el certificado o un reintento del cierre. */
  reintentar_desde: string | null;
  created_at: string;
  terminada_at: string | null;
  capturas: { nombre: string; url: string | null }[];
};

/**
 * La presentación en TAD del trámite: qué falta para poder presentar (casillero por casillero)
 * y la última tarea `tad_presentar` del robot.
 */
export type PresentacionFicha = {
  /** Borrador de TAD que dejó alguna presentación anterior: la próxima sigue desde ahí. */
  borradorPendiente: number | null;
  /** Alguna presentación anterior tocó "Confirmar trámite": no se ofrece presentar de nuevo. */
  confirmadoAntes: boolean;
  estado: {
    listo: boolean;
    faltan: string[];
    casilleros: { casillero: string; documentos: { clave: string; nombre: string; ok: boolean }[]; ok: boolean }[];
  };
  tarea: {
    id: number;
    estado: "pendiente" | "tomada" | "esperando_aprobacion" | "ok" | "error";
    payload: { es_prueba: boolean; obra: { calle: string; altura: number; smp: string }; adjuntos: { casillero: string }[]; continuar_borrador?: number | null };
    resultado: {
      /** presentado_sin_numero: TAD tomó la presentación y dejó el número de expediente "en espera". */
      etapa?: "prueba" | "presentado" | "presentado_sin_numero";
      expediente?: string;
      presentado_at?: string;
      borrador?: number | null;
      borrador_borrado?: boolean;
      adjuntados?: number;
      confirmado?: boolean;
      /** Al frenarse, TAD mostraba "No se pudo establecer comunicación con el servicio". */
      tad_caido?: boolean;
      /** Reintento automático por TAD caído: cuál fue el último y cuántos se hacen como mucho. */
      reintento?: number;
      reintentos_max?: number;
      obra?: { calle: string; barrio: string; comuna: string; smp: string };
    } | null;
    error: string | null;
    /** Con estado "pendiente": TAD no respondía y el robot vuelve a intentar desde esta hora. */
    reintentar_desde: string | null;
    created_at: string;
    terminada_at: string | null;
    capturas: { nombre: string; url: string | null }[];
  } | null;
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
type EstadoParaNombrar = Pick<Expediente, "estado_tad" | "solapa" | "tarea_pendiente" | "permiso_notificacion">;

export function explicacionEstado(e: EstadoParaNombrar): string {
  const n = normalizarEstado(e.estado_tad);
  if (e.tarea_pendiente) return "El Gobierno pidió cambios y hay que corregirlos.";
  // TAD deja el expediente en SUBSANACIÓN también DESPUÉS de que se subsanó, hasta que lo
  // vuelven a revisar. Lo que distingue "hay que corregir" de "ya se corrigió" es la tarea
  // pendiente, no el estado (medido 2026-09-14: 8 en subsanación, sólo 2 con tarea).
  if (n === "SUBSANACION") return "Ya se corrigió. El Gobierno todavía no lo volvió a revisar.";
  if (n === "INICIACION") return "Presentado. El Gobierno todavía no lo revisó.";
  if (tienePermiso(e)) return "El permiso salió.";
  if (e.solapa === "finalizado") return "El Gobierno lo archivó sin resolución: no hay permiso.";
  return "Estado informado por TAD.";
}

/** El nombre del estado para quien no conoce TAD. El de TAD va aparte, como dato. */
export function nombreEstado(e: EstadoParaNombrar): string {
  const n = normalizarEstado(e.estado_tad);
  if (e.tarea_pendiente) return "Hay que corregir";
  if (n === "SUBSANACION") return "Corregido, en revisión";
  if (n === "INICIACION") return "Presentado";
  if (tienePermiso(e)) return "Permiso emitido";
  if (e.solapa === "finalizado") return "Archivado sin permiso";
  return etiquetaEstado(e.estado_tad);
}

/** Bloqueo (rojo), en marcha (azul), listo (verde) o neutro (gris): un color, un significado. */
export type TonoEstado = "bloqueo" | "marcha" | "listo" | "neutro";

export function tonoEstado(e: EstadoParaNombrar): TonoEstado {
  const n = normalizarEstado(e.estado_tad);
  if (e.tarea_pendiente) return "bloqueo";
  if (n === "SUBSANACION" || n === "INICIACION") return "marcha";
  if (tienePermiso(e)) return "listo";
  return "neutro";
}

/** Búsqueda sin mayúsculas ni tildes sobre varios campos: basta con que uno contenga lo buscado. */
export function coincideTexto(valores: (string | null | undefined)[], busqueda: string): boolean {
  const q = normalizarEstado(busqueda);
  if (!q) return true;
  return valores.some((v) => v && normalizarEstado(v).includes(q));
}

export function coincide(e: Expediente, busqueda: string): boolean {
  const q = normalizarEstado(busqueda);
  if (!q) return true;
  return [e.expediente, `EX-${e.numero}`, e.titular, e.odoo_venta_nombre, e.direccion, e.barrio, e.cliente, e.motivo_subsanacion]
    .some((v) => v && normalizarEstado(v).includes(q));
}

/** "Av. La Plata 2552, CABA." → "Av. La Plata 2552": la ciudad sobra, todo es CABA. */
export function direccionCorta(direccion: string | null | undefined): string {
  return String(direccion ?? "").trim().replace(/[.\s]+$/, "").replace(/[,\s]+(CABA|C\.A\.B\.A|Capital Federal)$/i, "").trim();
}

/**
 * Si dos textos dicen lo mismo sin mirar mayúsculas, tildes, puntuación ni ", CABA". En Odoo
 * muchas veces el cliente se llama como la obra ("Av. La Plata 2552, CABA.") y se leía dos veces.
 */
export function mismoTexto(a: string | null | undefined, b: string | null | undefined): boolean {
  const n = (s: string | null | undefined) => normalizarEstado(direccionCorta(s)).replace(/[^A-Z0-9]/g, "");
  return !!a && !!b && n(a) === n(b);
}
