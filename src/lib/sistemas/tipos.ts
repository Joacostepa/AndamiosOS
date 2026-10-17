/**
 * Sistemas: lo que comparten la API, el panel de reporte, la captura, las pantallas y el
 * recorrido. Contrato completo en docs/sistemas/contrato.md; textos copiados de la maqueta
 * aprobada (docs/sistemas/maqueta.html).
 *
 * SÓLO TIPOS, CONSTANTES Y FUNCIONES PURAS: lo importan el servidor, el navegador y los tests
 * de node:test. Nada de React, de Next ni de Supabase acá.
 *
 * LOS TEXTOS DICEN «SISTEMAS», NUNCA UN NOMBRE PROPIO (decisión 1 de JS, propuesta.md §5):
 * quien reporta no sabe ni necesita saber quién lo mira, y los mensajes de los revisores se
 * firman «Sistemas».
 */

// ─────────────────────────────────────────────────────────────────────────────
// Catálogos
// ─────────────────────────────────────────────────────────────────────────────

/** Cómo se firma el equipo que revisa, en todos los textos. */
export const REVISOR = "Sistemas";

export const TIPOS_REPORTE = ["error", "correccion", "mejora"] as const;
export type TipoReporte = (typeof TIPOS_REPORTE)[number];

export const ESTADOS_REPORTE = ["nuevo", "visto", "en_curso", "resuelto", "descartado"] as const;
export type EstadoReporte = (typeof ESTADOS_REPORTE)[number];

/** Los cuatro motivos que guarda la base. «duplicado» sale de «Marcar duplicado», no del modal de descarte. */
export const MOTIVOS_DESCARTE = ["no_es_del_sistema", "no_se_va_a_hacer", "ya_existe", "duplicado"] as const;
export type MotivoDescarte = (typeof MOTIVOS_DESCARTE)[number];
/** Los que se eligen en «Descartar», en este orden. */
export const MOTIVOS_ELEGIBLES = ["no_es_del_sistema", "no_se_va_a_hacer", "ya_existe"] as const satisfies readonly MotivoDescarte[];

export const PRIORIDADES_REPORTE = ["alta", "media", "baja"] as const;
export type PrioridadReporte = (typeof PRIORIDADES_REPORTE)[number];

export type LadoEvento = "usuario" | "sistemas";
export type TipoEvento = "creado" | "comentario" | "estado" | "prioridad" | "duplicado";
/** Los que ve quien reportó (la RLS de sis_reporte_eventos filtra el resto). */
export const EVENTOS_PUBLICOS = ["creado", "comentario", "estado"] as const satisfies readonly TipoEvento[];
export type TipoEventoPublico = (typeof EVENTOS_PUBLICOS)[number];

/**
 * Las tres tarjetas del panel. `icono` es el nombre del export de lucide-react (el componente
 * lo mapea: tipos.ts no importa React).
 */
export const TIPOS: Record<TipoReporte, { etiqueta: string; icono: "Bug" | "PencilLine" | "Lightbulb"; texto: string; placeholder: string }> = {
  error: {
    etiqueta: "Error",
    icono: "Bug",
    texto: "Algo no anda: no carga, no guarda o sale un cartel rojo.",
    placeholder: "¿Qué estabas haciendo y qué pasó? Ej.: Quise guardar el parte de Av. Rivadavia 4200 y me salió un cartel rojo.",
  },
  correccion: {
    etiqueta: "Corrección",
    icono: "PencilLine",
    texto: "Anda, pero algo está mal: un número, un cálculo, un nombre.",
    placeholder: "¿Qué está mal y cómo debería ser? Ej.: El remito 4521 dice 40 tubos y salieron 44.",
  },
  mejora: {
    etiqueta: "Mejora",
    icono: "Lightbulb",
    texto: "Anda bien, pero se podría hacer más fácil, o falta algo.",
    placeholder: "¿Qué te gustaría poder hacer y para qué te serviría? Ej.: Ver el teléfono del encargado en la Hoja del día.",
  },
};

/** `etiqueta` = la de la bandeja (pestañas, chips). `usuario` = la que ve quien reportó. */
export const ESTADOS: Record<EstadoReporte, { etiqueta: string; usuario: string }> = {
  nuevo: { etiqueta: "Nuevo", usuario: "Enviado" },
  visto: { etiqueta: "Visto", usuario: `${REVISOR} ya lo vio` },
  en_curso: { etiqueta: "En curso", usuario: "Lo están arreglando" },
  resuelto: { etiqueta: "Resuelto", usuario: "¡Listo!" },
  descartado: { etiqueta: "Descartado", usuario: "No se va a hacer" },
};

/** La barra de Mis reportes: Enviado → Sistemas ya lo vio → Lo están arreglando → ¡Listo! */
export const PASOS_USUARIO = ["nuevo", "visto", "en_curso", "resuelto"] as const satisfies readonly EstadoReporte[];

export const ESTADOS_CERRADOS = ["resuelto", "descartado"] as const satisfies readonly EstadoReporte[];
export const ESTADOS_ABIERTOS = ["nuevo", "visto", "en_curso"] as const satisfies readonly EstadoReporte[];

/** `etiqueta` = la del modal de descarte y la bandeja. `usuario` = lo que sigue a «No se va a hacer: ». */
export const MOTIVOS: Record<MotivoDescarte, { etiqueta: string; usuario: string }> = {
  no_es_del_sistema: { etiqueta: "No es del sistema", usuario: "no es algo del sistema" },
  no_se_va_a_hacer: { etiqueta: "No se va a hacer", usuario: "por ahora no se va a hacer" },
  ya_existe: { etiqueta: "Ya existe", usuario: "eso ya se puede hacer" },
  duplicado: { etiqueta: "Duplicado", usuario: "otra persona ya lo había avisado" },
};

export const PRIORIDADES: readonly { valor: PrioridadReporte | null; etiqueta: string }[] = [
  { valor: null, etiqueta: "Sin definir" },
  { valor: "alta", etiqueta: "Alta" },
  { valor: "media", etiqueta: "Media" },
  { valor: "baja", etiqueta: "Baja" },
];

export const RESPUESTAS_RAPIDAS = [
  "¿Me mandás una foto de cómo debería verse?",
  "¿Te sigue pasando?",
  "Ya lo arreglé, ¿lo probás?",
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Límites (los mismos que la migración 20261022000001/2)
// ─────────────────────────────────────────────────────────────────────────────

export const LIMITES = {
  descripcionMin: 3,
  descripcionMax: 5000,
  comentarioMax: 5000,
  confirmarTextoMax: 2000,
  imagenes: 6,
  bytesImagen: 5 * 1024 * 1024,
  /** Lado largo máximo de cada imagen subida. */
  ladoMax: 1920,
  calidadWebp: 0.85,
  reportesPorDia: 20,
  /** El contexto saneado tiene que pesar menos que esto (JSON.stringify en UTF-16 ≈ bytes). */
  contextoBytes: 50_000,
  errores: 30,
  pedidos: 30,
  rutas: 10,
  /** Si snapdom tarda más, el panel se abre sin captura. */
  capturaMs: 8000,
  /** Vida de las URLs firmadas de lectura (segundos). */
  urlFirmadaSeg: 600,
  urlFirmadaPromptSeg: 3600,
} as const;

export const MIMES_IMAGEN = ["image/webp", "image/png", "image/jpeg"] as const;
export type MimeImagen = (typeof MIMES_IMAGEN)[number];
export const EXTENSION_MIME: Record<MimeImagen, "webp" | "png" | "jpg"> = { "image/webp": "webp", "image/png": "png", "image/jpeg": "jpg" };

/** Bucket privado de Storage (20261022000002). Ruta: <uid>/<uuid>.<ext>. */
export const BUCKET = "sistemas";

/** Lo que contesta la API mientras las migraciones no estén aplicadas (503). */
export const MENSAJE_SIN_INSTALAR = "Todavía no se puede reportar: falta terminar la instalación de Sistemas. Avisale a Sistemas por otro medio.";

// ─────────────────────────────────────────────────────────────────────────────
// Canales entre el header, el panel y el recorrido (window CustomEvent)
// ─────────────────────────────────────────────────────────────────────────────

export const EVENTOS = {
  /** Flujo normal: PRIMERO captura la pantalla y DESPUÉS abre el panel. Sin detail. */
  reportar: "sistemas:reportar",
  /** Lo dispara el recorrido: abre el panel SIN capturar, sin trampa de foco y sin poder cerrarlo. */
  abrirReporte: "sistemas:abrir-reporte",
  /** Lo dispara el recorrido antes del paso 5: cierra el panel (en cualquier modo). */
  cerrarReporte: "sistemas:cerrar-reporte",
} as const;
export type DetalleAbrirReporte = { modo: "recorrido" };

/** Atributo en <html> mientras corre un recorrido obligatorio: «Reportar» no hace nada. */
export const ATRIBUTO_RECORRIDO_ACTIVO = "data-recorrido-activo";
/** Lo que snapdom deja afuera de la captura: el botón, el panel, el editor, los toasts. */
export const EXCLUIR_CAPTURA = { atributo: "data-capture", valor: "exclude" } as const;

/** Anclas del recorrido. `campanita` la pone el botón de src/components/layout/campanita.tsx. */
export const DATA_TOUR = {
  reportar: "sistemas-reportar",
  captura: "sistemas-captura",
  tipos: "sistemas-tipos",
  mandar: "sistemas-mandar",
  campanita: "campanita",
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Recorrido obligatorio (propuesta §5, decisión 3)
// ─────────────────────────────────────────────────────────────────────────────

export const RECORRIDO = { clave: "sistemas-reportar", version: 1, pasos: 5 } as const;

export const BIENVENIDA = {
  eyebrow: "Nuevo en AndamiosOS",
  titulo: `Avisale a ${REVISOR} cuando algo no anda`,
  texto:
    "Ahora podés avisar errores, cosas que están mal o ideas para mejorar el sistema, desde cualquier pantalla y con una foto. Te mostramos cómo en un minuto, así la próxima vez sabés dónde está.",
  duracion: "1 minuto · 5 pasos",
  boton: "Empezar",
} as const;

/**
 * Los 5 pasos, SÓLO con «Siguiente» (el último, «Entendido»). `texto` admite <b> (driver.js
 * lo pinta como HTML). `antes`: lo que el recorrido hace ANTES de mostrar el paso.
 */
export const PASOS_RECORRIDO: readonly {
  ancla: (typeof DATA_TOUR)[keyof typeof DATA_TOUR];
  titulo: string;
  texto: string;
  boton: "Siguiente" | "Entendido";
  antes?: "abrir-panel" | "cerrar-panel";
}[] = [
  {
    ancla: DATA_TOUR.reportar,
    titulo: "Está siempre acá",
    texto: "En todas las pantallas, arriba a la derecha. Tocalo cuando algo no anda, está mal o se podría hacer mejor.",
    boton: "Siguiente",
  },
  {
    ancla: DATA_TOUR.captura,
    titulo: "Sale con foto",
    texto: `Al tocar Reportar, el sistema saca una foto de lo que estabas viendo. Con <b>Marcar</b> señalás el problema o tapás lo que no quieras mandar. La foto le ahorra a ${REVISOR} diez preguntas.`,
    boton: "Siguiente",
    antes: "abrir-panel",
  },
  {
    ancla: DATA_TOUR.tipos,
    titulo: "Elegí qué es y contalo",
    texto:
      "<b>Error</b> si algo no anda, <b>Corrección</b> si algo está mal, <b>Mejora</b> si se podría hacer mejor. Si dudás, cualquiera sirve. Después contá qué pasó, como se lo dirías a un compañero.",
    boton: "Siguiente",
  },
  {
    ancla: DATA_TOUR.mandar,
    titulo: "Mandalo",
    texto:
      "Tocás <b>Mandar</b> y listo. Junto con tu texto y la foto van solos la pantalla, tu navegador y los últimos errores, para encontrar el problema más rápido.",
    boton: "Siguiente",
  },
  {
    ancla: DATA_TOUR.campanita,
    titulo: "La respuesta te llega acá",
    texto: `Cuando ${REVISOR} lo mire, te pregunte algo o lo arregle, te avisa la campanita. Todo lo que mandaste está en <b>Mis reportes</b>, en el menú de tu nombre.`,
    boton: "Entendido",
    antes: "cerrar-panel",
  },
];

export const TOAST_RECORRIDO = { titulo: "Listo, ya sabés reportar.", detalle: "La próxima vez que algo no ande, tocá Reportar." } as const;

// ─────────────────────────────────────────────────────────────────────────────
// Textos de las pantallas (copiados de la maqueta)
// ─────────────────────────────────────────────────────────────────────────────

export const TEXTOS = {
  boton: {
    reportar: "Reportar",
    titulo: `Avisale a ${REVISOR} si algo no anda, está mal o se puede mejorar`,
    menu: "Reportar algo del sistema",
    misReportes: "Mis reportes",
  },
  panel: {
    titulo: "¿Qué querés avisar?",
    subtitulo: `Lo revisan en ${REVISOR}. Nadie más ve lo que mandás.`,
    fotoDe: "Foto de la pantalla",
    capturaFallo: "No pudimos sacar la foto de esta pantalla. Si podés, sacala vos y sumala acá.",
    capturaQuitada: "Quitaste la foto. Podés sumar otra imagen.",
    capturaRecorrido: "Acá aparece la foto de lo que estabas viendo.",
    pegarHint: "También podés pegar una imagen con Ctrl+V o arrastrarla acá.",
    marcar: "Marcar",
    sumarImagen: "Sumar imagen",
    quitar: "Quitar",
    queEs: "¿Qué es?",
    noSabes: `¿No sabés cuál elegir? Elegí cualquiera, ${REVISOR} lo acomoda.`,
    contalo: "Contalo como se lo dirías a un compañero",
    placeholderSinTipo: "Primero elegí qué es. Después contá qué pasó.",
    frena: "¿Te frena el trabajo?",
    frenaSi: "Sí, no puedo seguir",
    frenaNo: "Molesta, pero sigo",
    contexto: `También mandamos la pantalla, tu navegador y los últimos errores, para que ${REVISOR} lo encuentre más rápido.`,
    contextoHint: "No se manda lo que escribiste en otros formularios ni tus contraseñas.",
    contextoFilas: ["Pantalla", "Usuario", "Dispositivo", "Versión", "Errores recientes", "Pantallas anteriores"],
    cancelar: "Cancelar",
    mandar: `Mandar a ${REVISOR}`,
    mandando: "Mandando…",
    imagenesMax: "Podés mandar hasta 6 imágenes.",
    imagenIlegible: "No pudimos leer esa imagen. Probá con otra.",
  },
  editor: {
    titulo: "Marcá dónde está el problema",
    lapiz: "Lápiz",
    recuadro: "Recuadro",
    tapar: "Tapar",
    deshacer: "Deshacer",
    cancelar: "Cancelar",
    listo: "Listo",
    hint: "Con Tapar escondé nombres, teléfonos o montos que no hagan falta.",
  },
  toast: {
    verMisReportes: "Ver mis reportes",
    detalle: "Cuando lo miren te avisamos por la campanita.",
    detalleFrena: "Como te frena el trabajo, les avisamos al toque. Te contestan por la campanita.",
  },
  mis: {
    titulo: "Mis reportes",
    subtitulo: `Lo que le avisaste a ${REVISOR} y en qué quedó`,
    reportar: "Reportar algo",
    vacio: "Todavía no reportaste nada. Cuando algo no ande, tocá Reportar, arriba a la derecha.",
    quedoBien: "¿Quedó bien?",
    yaEsta: "Ya está, gracias",
    siguePasando: "Sigue pasando",
    responder: `Sumale algo a ${REVISOR}…`,
    enviar: "Enviar",
    vos: "Vos",
    graciasConfirmar: "¡Gracias por confirmar!",
    reabierto: `Lo reabrimos y le avisamos a ${REVISOR}.`,
    enviado: "Enviado.",
    enviadoDetalle: `${REVISOR} lo ve en la bandeja.`,
    duplicadoResuelto: "Ya está arreglado: otra persona había avisado lo mismo.",
  },
  revision: {
    titulo: REVISOR,
    subtitulo: "Lo que avisa el equipo",
    buscar: "Buscar por texto, persona o #",
    todos: "Todos",
    frenaFiltro: "Frena el trabajo",
    vacio: "No hay reportes acá.",
    elegi: "Elegí un reporte de la lista.",
    copiarClaude: "Copiar para Claude Code",
    avisadoSlack: "Avisado en Slack #sistemas",
    estado: "Estado",
    prioridad: "Prioridad",
    conversacionCon: "Conversación con",
    sinMensajes: "Todavía no hay mensajes.",
    escribile: "Escribile a",
    contextoTecnico: "Contexto técnico",
    contextoTecnicoDetalle: "ruta, dispositivo, versión y errores",
    ruta: "Ruta",
    abrirPantalla: "Abrir esta pantalla",
    dispositivo: "Dispositivo",
    version: "Versión",
    laActualEs: "la actual es",
    antesEstuvo: "Antes estuvo en",
    errores: "Errores",
    pedidosFallidos: "Pedidos fallidos",
    ninguno: "Ninguno",
    marcarDuplicado: "Marcar duplicado",
    descartar: "Descartar",
    resolver: "Resolver y avisar",
    esperandoRespuesta: "Esperando respuesta",
    sinPermiso: "Necesitás Sistemas · Revisión en «editar» para ver esta bandeja.",
  },
  modales: {
    claudeHint: "Pegalo en Claude Code. Trae lo que dijo la persona, dónde pasó, los errores y el enlace a la captura. El punto 4 te deja listo el mensaje para avisarle al resolver.",
    copiarTexto: "Copiar texto",
    copiado: "Copiado.",
    copiadoDetalle: "Pegalo en Claude Code.",
    resolverHint: "Le llega por la campanita y lo ve en Mis reportes.",
    descartarPorQue: "¿Por qué?",
    descartarPlaceholder: "Un «no, porque…» explicado vale casi lo mismo que un arreglo.",
    descartarBoton: "Descartar y avisar",
    duplicadoHint: "Primero salen los de la misma pantalla. Pasa al original y se entera cuando se resuelva.",
  },
} as const;

/** El texto que deja sis_revisar_reporte en cada duplicado al resolver el original (mismo literal que la migración). */
export const TEXTO_DUPLICADO_RESUELTO = "Ya está arreglado. ¡Gracias por avisar!";

// ─────────────────────────────────────────────────────────────────────────────
// Contexto automático (lo junta el navegador; lo sanea el servidor)
// ─────────────────────────────────────────────────────────────────────────────

export type ErrorCliente = {
  tipo: "error" | "rechazo" | "console.error" | "console.warn";
  mensaje: string;
  stack?: string;
  /** archivo:línea:columna de window.onerror, si vino. */
  fuente?: string;
  /** ISO 8601. */
  at: string;
};

export type PedidoFallido = {
  metodo: string;
  /** Sin query string (la quita el navegador; el servidor vuelve a sanear). */
  url: string;
  /** 0 = error de red (no hubo respuesta). */
  status: number;
  duracionMs: number;
  vercelId?: string;
  at: string;
};

export type RutaVisitada = { ruta: string; at: string };

/** Los buffers circulares que instala src/instrumentation-client.ts en window[CLAVE_BUFFERS]. */
export type BuffersSistemas = { errores: ErrorCliente[]; pedidos: PedidoFallido[]; rutas: RutaVisitada[] };
export const CLAVE_BUFFERS = "__aosSistemas";

export type ContextoCliente = {
  version: 1;
  /** location.pathname + location.search en el momento de reportar (el servidor la sanea). */
  ruta: string;
  tituloPantalla: string;
  /** NEXT_PUBLIC_SHA del bundle que tenía abierto. */
  sha: string;
  navegador: {
    userAgent: string;
    idioma: string;
    tactil: boolean;
    online: boolean;
    zonaHoraria: string;
  };
  pantalla: { ancho: number; alto: number; dpr: number; tema: "claro" | "oscuro" };
  /** «iPhone · Safari 18 · 390×844» (describirDispositivo). */
  dispositivo: string;
  errores: ErrorCliente[];
  pedidos: PedidoFallido[];
  /** Las últimas pantallas, la más vieja primero. */
  rutas: RutaVisitada[];
};

// ─────────────────────────────────────────────────────────────────────────────
// Imágenes, captura y marcas (navegador)
// ─────────────────────────────────────────────────────────────────────────────

/** Una imagen lista para mostrar y subir. `url` es un object URL: quien la descarta la revoca. */
export type ImagenLista = { blob: Blob; mime: MimeImagen; ancho: number; alto: number; url: string };

export type MotivoFalloCaptura = "error" | "tiempo" | "uniforme" | "sin-soporte";
export type ResultadoCaptura = { ok: true; imagen: ImagenLista } | { ok: false; motivo: MotivoFalloCaptura };

/** Coordenadas en píxeles de la imagen original (no de la pantalla). */
export type Marca =
  | { tipo: "lapiz"; puntos: [number, number][] }
  | { tipo: "recuadro" | "tapar"; x: number; y: number; ancho: number; alto: number };

// ─────────────────────────────────────────────────────────────────────────────
// API (docs/sistemas/contrato.md §3). Todas las respuestas de error: { error: string }.
// ─────────────────────────────────────────────────────────────────────────────

export type RespuestaError = { error: string };

/** POST /api/sistemas/reportes/subidas */
export type PedidoSubidas = { archivos: { mime: MimeImagen; bytes: number }[] };
export type RespuestaSubidas = { subidas: { path: string; token: string }[] };

/** Una imagen ya subida, como va en el alta. */
export type CapturaSubida = { path: string; mime: MimeImagen; bytes: number; ancho: number; alto: number };

/** POST /api/sistemas/reportes */
export type CrearReporteBody = {
  tipo: TipoReporte;
  descripcion: string;
  frena: boolean;
  ruta: string;
  tituloPantalla: string;
  shaCliente: string;
  contexto: ContextoCliente;
  capturas: CapturaSubida[];
};
export type CrearReporteRespuesta = { id: string; numero: number; frena: boolean };

/** Una imagen con URL firmada de lectura. */
export type CapturaFirmada = { id: string; url: string; ancho: number | null; alto: number | null; orden: number };

/** Lo que ve quien reportó de la línea de tiempo. Sin autor: los revisores son «Sistemas». */
export type EventoPublico = {
  id: number;
  tipo: TipoEventoPublico;
  lado: LadoEvento;
  de: string | null;
  a: string | null;
  texto: string | null;
  createdAt: string;
};

/** Lo que ve un revisor (incluye prioridad, duplicado y quién lo hizo, para el registro interno). */
export type EventoRevision = Omit<EventoPublico, "tipo"> & { tipo: TipoEvento; autorNombre: string | null };

/** GET /api/sistemas/reportes → uno de «Mis reportes». */
export type ReporteUsuario = {
  id: string;
  numero: number;
  tipo: TipoReporte;
  descripcion: string;
  frena: boolean;
  estado: EstadoReporte;
  motivoDescarte: MotivoDescarte | null;
  /** Sólo si es duplicado: el estado del original (no se muestra nada más del ajeno). */
  estadoOriginal: EstadoReporte | null;
  pantalla: string;
  ruta: string | null;
  createdAt: string;
  ultimaActividadAt: string;
  cerradoAt: string | null;
  confirmadoOk: boolean | null;
  capturas: CapturaFirmada[];
  eventos: EventoPublico[];
};
export type MisReportesRespuesta = { reportes: ReporteUsuario[] };

/** POST /api/sistemas/reportes/[id]/comentarios y /api/sistemas/revision/[id]/comentarios */
export type ComentarBody = { texto: string };
export type ComentarRespuesta = { evento: EventoPublico };

/** POST /api/sistemas/reportes/[id]/confirmar */
export type ConfirmarBody = { ok: boolean; texto?: string };
export type ConfirmarRespuesta = { estado: EstadoReporte; reabierto: boolean };

export type Creador = { id: string; nombre: string; apellido: string; rol: string | null };

/** Una fila de la bandeja. */
export type ReporteFila = {
  id: string;
  numero: number;
  tipo: TipoReporte;
  estado: EstadoReporte;
  frena: boolean;
  prioridad: PrioridadReporte | null;
  /** Recortada a 300 letras en la lista; entera en el detalle. */
  descripcion: string;
  pantalla: string;
  ruta: string | null;
  creador: Creador;
  createdAt: string;
  ultimaActividadAt: string;
  cantCapturas: number;
  /** El último mensaje es de Sistemas y termina en «?». */
  esperandoRespuesta: boolean;
  /** Hay un mensaje de quien reportó posterior al último de Sistemas. */
  respuestaSinLeer: boolean;
};

export type Metricas = {
  /** Reportes de los últimos 7 días y cuántas personas distintas. */
  semana: { reportes: number; personas: number };
  /** Promedio de días hasta el primer mensaje o cambio de Sistemas (últimos 30 días). */
  primeraRespuestaDias: number | null;
  /** Promedio de días de alta a resuelto (resueltos en los últimos 30 días). */
  resolverDias: number | null;
  /** % de los reportes de 30 días en los que Sistemas tuvo que preguntar algo. */
  preguntamosPct: number | null;
  /** Cuántos usuarios activos (sin la cuenta técnica) hicieron el recorrido. null sin la tabla. */
  recorrido: { hicieron: number; total: number } | null;
};

/** GET /api/sistemas/revision?estado=&tipo=&frena=1&q= */
export type RevisionLista = {
  reportes: ReporteFila[];
  contadores: Record<EstadoReporte, number>;
  /** Abiertos que frenan el trabajo (para el subtítulo). */
  frenanAbiertos: number;
  metricas: Metricas;
  /** El deploy actual del servidor (para el aviso «la actual es…»). */
  shaActual: string;
};

export type ReporteDetalle = ReporteFila & {
  motivoDescarte: MotivoDescarte | null;
  duplicadoDe: { id: string; numero: number } | null;
  duplicados: { id: string; numero: number }[];
  tituloPantalla: string | null;
  modulo: string | null;
  shaCliente: string | null;
  shaServidor: string | null;
  contexto: ContextoCliente | null;
  dispositivo: string;
  capturas: CapturaFirmada[];
  eventos: EventoRevision[];
  confirmadoOk: boolean | null;
  cerradoAt: string | null;
  /** frena y SLACK_WEBHOOK_SISTEMAS cargado: muestra «Avisado en Slack #sistemas». */
  avisadoEnSlack: boolean;
};
export type RevisionDetalleRespuesta = { reporte: ReporteDetalle; shaActual: string };

/** PATCH /api/sistemas/revision/[id]. `prioridad: null` = «Sin definir»; ausente = no se toca. */
export type RevisarBody = {
  estado?: EstadoReporte;
  prioridad?: PrioridadReporte | null;
  motivoDescarte?: MotivoDescarte;
  duplicadoDe?: string;
  mensaje?: string;
};
export type RevisarRespuesta = RevisionDetalleRespuesta;

export type ComentarRevisionRespuesta = { evento: EventoRevision };

/** GET /api/sistemas/revision/[id]/candidatos */
export type CandidatosRespuesta = { candidatos: ReporteFila[] };

/** GET /api/sistemas/revision/[id]/prompt */
export type PromptRespuesta = { texto: string; capturas: { url: string; vence: string }[] };

// ─────────────────────────────────────────────────────────────────────────────
// Avisos (campanita). Títulos genéricos: cualquier admin ve todas las alertas, así que nunca
// llevan la descripción.
// ─────────────────────────────────────────────────────────────────────────────

export const TIPOS_ALERTA = {
  /** Reporte nuevo → cada revisor. Sólo campanita. */
  reporte: "sistemas_reporte",
  /** Error que frena el trabajo → cada revisor + Slack #sistemas (una sola vez). */
  bloqueante: "sistemas_bloqueante",
  /** Cambio de estado (salvo a 'visto') o mensaje de Sistemas → quien reportó. */
  novedad: "sistemas_novedad",
  /** Mensaje o «Sigue pasando» de quien reportó → cada revisor. */
  respuesta: "sistemas_respuesta",
} as const;

export function enlaceMisReportes(id: string): string {
  return `/sistemas/mis-reportes?id=${id}`;
}
export function enlaceRevision(id: string): string {
  return `/sistemas/revision?id=${id}`;
}

export function tituloAlertaNuevo(r: { numero: number; pantalla: string; tipo: TipoReporte; frena: boolean }): string {
  return r.frena
    ? `Frena el trabajo: reporte #${r.numero} en ${r.pantalla} (${TIPOS[r.tipo].etiqueta})`
    : `Nuevo reporte #${r.numero} en ${r.pantalla} (${TIPOS[r.tipo].etiqueta})`;
}

/** Al resolver un original, a cada duplicado le llega `tituloAlertaEstado(suNumero, "resuelto")`. */
export function tituloAlertaEstado(numero: number, estado: EstadoReporte, motivo?: MotivoDescarte | null): string {
  // Un descarte dice el motivo con las palabras de quien reportó («eso ya se puede hacer»,
  // «otra persona ya lo había avisado»), no un «No se va a hacer» para todo.
  if (estado === "descartado" && motivo && motivo in MOTIVOS) return `Tu reporte #${numero}: ${MOTIVOS[motivo].usuario}`;
  return `Tu reporte #${numero}: ${ESTADOS[estado].usuario}`;
}

export function tituloAlertaMensaje(numero: number): string {
  return `${REVISOR} te respondió sobre el #${numero}`;
}

export function tituloAlertaRespuesta(numero: number, siguePasando: boolean): string {
  return siguePasando ? `El reporte #${numero} sigue pasando: se reabrió` : `Respuesta en el reporte #${numero}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Funciones puras
// ─────────────────────────────────────────────────────────────────────────────

/**
 * La cuenta técnica del pañol (el dispositivo compartido): no es admin y su ÚNICO permiso es
 * el kiosco. No hace el recorrido y no cuenta en «quién falta». Tipado estructural para no
 * importar acceso.ts (lo usan el recorrido y la API).
 */
export function esCuentaTecnica(a: { rol: string | null; permisos: Record<string, unknown> } | null | undefined): boolean {
  if (!a || a.rol === "admin") return false;
  const ids = Object.keys(a.permisos ?? {});
  return ids.length === 1 && ids[0] === "panol-kiosco";
}

export function esCerrado(estado: EstadoReporte): boolean {
  return (ESTADOS_CERRADOS as readonly string[]).includes(estado);
}

/** Índice en la barra de Mis reportes (0..3), o -1 si está descartado. */
export function pasoUsuario(estado: EstadoReporte): number {
  return (PASOS_USUARIO as readonly string[]).indexOf(estado);
}

/** Lo que ve quien reportó como estado, en una línea. */
export function estadoParaUsuario(r: { estado: EstadoReporte; motivoDescarte: MotivoDescarte | null; estadoOriginal?: EstadoReporte | null }): string {
  if (r.estado !== "descartado") return ESTADOS[r.estado].usuario;
  if (r.motivoDescarte === "duplicado" && r.estadoOriginal === "resuelto") return TEXTOS.mis.duplicadoResuelto;
  return r.motivoDescarte ? `${ESTADOS.descartado.usuario}: ${MOTIVOS[r.motivoDescarte].usuario}` : ESTADOS.descartado.usuario;
}

export function primerNombre(nombre: string | null | undefined): string {
  return (nombre ?? "").trim().split(/\s+/)[0] ?? "";
}

/** El mensaje precargado de «Resolver y avisar». */
export function mensajeResolver(nombre: string): string {
  const n = primerNombre(nombre);
  return n ? `Listo, ya está arreglado. ¡Gracias por avisar, ${n}!` : "Listo, ya está arreglado. ¡Gracias por avisar!";
}

/** El toast después de mandar. */
export function toastGracias(nombre: string, numero: number, frena: boolean): { titulo: string; detalle: string } {
  const n = primerNombre(nombre);
  return {
    titulo: `${n ? `¡Gracias, ${n}!` : "¡Gracias!"} Le llegó a ${REVISOR} como reporte #${numero}.`,
    detalle: frena ? TEXTOS.toast.detalleFrena : TEXTOS.toast.detalle,
  };
}

/** ¿El mensaje de Sistemas es una pregunta? (para «Esperando respuesta» y la métrica). */
export function esPregunta(texto: string | null | undefined): boolean {
  return /\?\s*$/.test(texto ?? "");
}

/** Los primeros 7 caracteres del SHA ('local' queda igual). */
export function shaCorto(sha: string | null | undefined): string {
  if (!sha) return "—";
  return /^[0-9a-f]{8,}$/i.test(sha) ? sha.slice(0, 7) : sha;
}

/** «iPhone · Safari 18 · 390×844». Sin dependencias: alcanza para que Sistemas se ubique. */
export function describirDispositivo(userAgent: string, ancho: number, alto: number): string {
  const u = userAgent || "";
  const so = /iPhone/.test(u) ? "iPhone" : /iPad/.test(u) ? "iPad" : /Android/.test(u) ? "Android" : /Mac OS X|Macintosh/.test(u) ? "Mac"
    : /Windows/.test(u) ? "Windows" : /Linux/.test(u) ? "Linux" : "Otro";
  const pares: [RegExp, string][] = [
    [/Edg\/(\d+)/, "Edge"],
    [/OPR\/(\d+)/, "Opera"],
    [/SamsungBrowser\/(\d+)/, "Samsung Internet"],
    [/CriOS\/(\d+)/, "Chrome"],
    [/FxiOS\/(\d+)/, "Firefox"],
    [/Firefox\/(\d+)/, "Firefox"],
    [/Chrome\/(\d+)/, "Chrome"],
    [/Version\/(\d+)[.\d]* .*Safari\//, "Safari"],
  ];
  let navegador = "Navegador";
  for (const [re, nombre] of pares) {
    const m = u.match(re);
    if (m) { navegador = `${nombre} ${m[1]}`; break; }
  }
  const medidas = ancho > 0 && alto > 0 ? ` · ${Math.round(ancho)}×${Math.round(alto)}` : "";
  return `${so} · ${navegador}${medidas}`;
}
