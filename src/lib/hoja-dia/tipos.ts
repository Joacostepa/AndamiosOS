// Tipos de la Hoja del día, compartidos entre el servidor (servicio.ts, las rutas) y el
// navegador (hooks y componentes). Sin imports de servidor: este archivo lo importa la
// lógica pura (estado.ts) y los tests de `node --test`.
//
// LA FORMA DEL DÍA. Todo lo que la pantalla necesita viaja en UN objeto, `DiaHoja`, que
// arma GET /api/hoja-dia. Las cuentas (problemas, bandeja, horas de los camiones, avisos,
// diferencias con lo enviado) NO viajan hechas: las hace estado.ts con ese objeto y la hora,
// en el servidor (para los mensajes) y en el navegador (para la pantalla), con el mismo
// código. Así lo que dice la tarjeta y lo que dice el mensaje de Telegram no pueden divergir.
//
// LAS HORAS SON MINUTOS. Todo instante (cuándo se mandó, cuándo marcó Hecho, desde cuándo
// espera) viaja como minutos desde las 0:00 DEL DÍA DE LA HOJA, en Buenos Aires. Puede ser
// negativo (la tarde anterior: −300 son las 19:00 del día de antes) o pasar de 1440. Es la
// misma cuenta que la maqueta aprobada, y hace que "pasó la hora de alarma" sea una resta.
// `minutosDesde()` (estado.ts) convierte una fecha y hora real a esta escala.

/** "2026-10-13" */
export type Fecha = string;
/** "7:00" o "07:00" (las dos se aceptan; estado.ts devuelve "7:00"). */
export type Hora = string;
/** Minutos desde las 0:00 del día de la hoja (ver arriba). */
export type Minutos = number;

// ─── Catálogos ───────────────────────────────────────────────────────────────

export type ModoChofer = "sin" | "lleva_trae" | "todo_el_dia";
export const MODOS_CHOFER: Record<ModoChofer, string> = {
  sin: "Sin chofer",
  lleva_trae: "Lleva y trae",
  todo_el_dia: "Todo el día",
};

export type LugarEncuentro = "deposito" | "obra" | "otro";

export type TipoViaje =
  | "lleva" | "busca" | "mueve"
  | "lleva_material" | "trae_material" | "compra" | "entre_depositos" | "taller" | "otro";

/** Los de una cuadrilla: nacen de la hoja (§4). */
export const TIPOS_DE_CUADRILLA: readonly TipoViaje[] = ["lleva", "busca", "mueve"];

export const TIPOS_VIAJE: Record<TipoViaje, { nombre: string; corto: string }> = {
  lleva: { nombre: "Lleva cuadrilla", corto: "Lleva" },
  busca: { nombre: "Busca cuadrilla", corto: "Busca" },
  mueve: { nombre: "Mueve cuadrilla", corto: "Mueve" },
  lleva_material: { nombre: "Lleva material", corto: "Lleva" },
  trae_material: { nombre: "Trae material", corto: "Trae" },
  compra: { nombre: "Busca compra", corto: "Compra" },
  entre_depositos: { nombre: "Entre depósitos", corto: "Depósito" },
  taller: { nombre: "Taller / VTV / trámite", corto: "Taller" },
  otro: { nombre: "Otro", corto: "Otro" },
};

export type EstadoViaje = "planeado" | "hecho" | "no_pudo" | "anulado";

export type TipoPedido = "lleva_material" | "trae_material" | "compra" | "entre_depositos" | "taller" | "otro";

export type Urgencia = "frena" | "hora" | "cliente" | "hoy" | "cuando_se_pueda";
export const URGENCIAS: Record<Urgencia, string> = {
  frena: "Frena la obra",
  hora: "Antes de las",
  cliente: "Le prometimos al cliente",
  hoy: "Hoy",
  cuando_se_pueda: "Cuando se pueda",
};

export type Necesita = "cualquiera" | "camion" | "hidrogrua";

export type CanalPedido = "telefono" | "whatsapp" | "telegram" | "link" | "cajon" | "sugerido" | "deposito" | "oficina";

export type EstadoPedidoGuardado = "sin_camion" | "esperando" | "en_camion" | "hecho" | "anulado";

export type ReglaSugerido = "arranca" | "termina";

export type TipoAusencia = "enfermedad" | "art" | "personal" | "vacaciones" | "tramite" | "suspendido" | "sin_aviso";
/** En el orden de los botones de "No viene…" (§5). */
export const TIPOS_AUSENCIA: [TipoAusencia, string][] = [
  ["enfermedad", "Enfermedad"],
  ["personal", "Personal"],
  ["vacaciones", "Vacaciones"],
  ["art", "ART"],
  ["tramite", "Trámite"],
  ["suspendido", "Suspendido"],
  ["sin_aviso", "Sin aviso"],
];
export const TIPO_AUSENCIA_TXT: Record<TipoAusencia, string> = {
  enfermedad: "enfermedad",
  personal: "personal",
  vacaciones: "vacaciones",
  art: "ART",
  tramite: "trámite",
  suspendido: "suspendido",
  sin_aviso: "sin aviso",
};

export type TipoLugar = "deposito" | "proveedor" | "taller" | "vtv" | "otro";

export type RolLink = "a_cargo" | "chofer";

export type TipoVehiculo = "camion" | "camioneta" | "hidrogrua" | "utilitario" | "otro";
export type EstadoVehiculo = "disponible" | "en_ruta" | "en_taller" | "fuera_servicio";

// ─── Lo que viene de afuera (Legajos, flota, tablero) ────────────────────────

export type Persona = {
  id: string;
  /** De una cuadrilla tercerizada (pan_personas_externas), no de Legajos. */
  externa: boolean;
  /**
   * Cómo se nombra en pantalla y en los mensajes: el apellido con nombrePropio()
   * ("Ortega"). Si hay dos con el mismo apellido, con la inicial ("Miño H.").
   */
  nombre: string;
  nombreCompleto: string;
  puesto: string | null;
  celular: string | null;
  puedeEstarACargo: boolean;
  /** Puesto chofer en Legajos (o tarea chofer en Odoo). */
  esChofer: boolean;
  /** Tiene el chat de Telegram vinculado: la hoja le llega sola. */
  telegram: boolean;
  odooEmployeeId: number | null;
  activo: boolean;
};

export type Vehiculo = {
  id: string;
  patente: string;
  marca: string | null;
  modelo: string | null;
  tipo: TipoVehiculo;
  estado: EstadoVehiculo;
  choferHabitualId: string | null;
  /** Documentos de la flota con fecha de vencimiento (VTV, seguro, CNRT). */
  vencimientos: { tipo: "vtv" | "seguro_vehiculo" | "cnrt"; vence: Fecha }[];
};

/** El chofer de un vehículo ese día (con el habitual ya resuelto). */
export type CamionDia = { vehiculoId: string; choferId: string | null; nota: string | null };

export type Lugar = {
  id: string;
  nombre: string;
  corto: string | null;
  tipo: TipoLugar;
  direccion: string | null;
  lat: number | null;
  lng: number | null;
  telefono: string | null;
  horario: string | null;
  /** "Atiende hasta". */
  cierra: Hora | null;
  nota: string | null;
  activo: boolean;
};

export type Cuadrilla = {
  /** x_aba_cuadrilla.id: la clave de todo el módulo. */
  odooId: number;
  /** "Cuadrilla 3" (con nombrePropio). */
  nombre: string;
  /** 3, para "la 3" y "C3". null si el nombre no tiene número (tercerizadas). */
  numero: number | null;
  tercerizada: boolean;
  /** El plantel base de Configuración de cuadrillas, si está vinculada. */
  plantel: { responsableId: string | null; personaIds: string[] } | null;
};

/** Una obra del tablero ese día, con lo que la hoja muestra de su OT. */
export type ObraDia = {
  otId: number;
  asignacionId: number;
  cuadrillaOdooId: number;
  ordenDia: number;
  fraccion: number;
  estadoAsignacion: "tentativa" | "confirmada";
  /** La dirección entera (x_direccion_obra o el título). */
  direccion: string;
  /** direccionCorta(): "Av. Rivadavia 6150". */
  corto: string;
  titulo: string;
  tipo: string;
  personalPorJornada: number;
  lat: number | null;
  lng: number | null;
  detalleTecnico: string | null;
  observaciones: string | null;
  contactoObra: string | null;
  telObra: string | null;
  cantArchivos: number;
  ventaId: number | null;
  /** Qué jornada de la obra es (2 de 3). null si no se pudo saber. */
  dia: number | null;
  totalDias: number | null;
};

// ─── Lo del módulo (Supabase) ────────────────────────────────────────────────

export type Integrante = {
  id: string;
  personaId: string;
  aCargo: boolean;
  /** "va directo a la 2.ª obra, 13:00" */
  nota: string | null;
  orden: number;
};

export type Hoja = {
  id: string;
  fecha: Fecha;
  cuadrillaOdooId: number;
  modo: ModoChofer;
  choferId: string | null;
  vehiculoId: string | null;
  /** Cuándo se tocó el chofer o el vehículo (para decidir qué tarjeta muestra el choque). */
  choferTocadoMin: Minutos | null;
  encuentro: { lugar: LugarEncuentro; texto: string | null; hora: Hora };
  nota: string | null;
  /** Quién recibe la hoja si no hay nadie a cargo. */
  recibeId: string | null;
  origen: string;
  version: number;
  integrantes: Integrante[];
};

/** Destino u origen de un viaje o pedido: una obra, un lugar frecuente o texto. */
export type Punto = { otId: number | null; lugarId: string | null; texto: string | null };

export type Viaje = {
  id: string;
  fecha: Fecha;
  /** null + fleteExterno = flete de afuera; null sin flete = nadie lo hace. */
  vehiculoId: string | null;
  choferId: string | null;
  fleteExterno: string | null;
  tipo: TipoViaje;
  hojaId: string | null;
  cuadrillaOdooId: number | null;
  hacia: Punto;
  /** null = donde terminó el anterior. */
  desde: Punto | null;
  orden: number;
  /** Hora fija. null = estimada. */
  hora: Hora | null;
  noAntesDe: Hora | null;
  duracionMin: number | null;
  vuelta: boolean;
  vueltaCarga: string | null;
  carga: string | null;
  cargaDeposito: Hora | null;
  okTodoElDia: boolean;
  estado: EstadoViaje;
  hechoMin: Minutos | null;
  hechoPor: string | null;
  noPudoMotivo: string | null;
  anuladoMotivo: string | null;
  foto: boolean;
  creadoMin: Minutos;
  version: number;
};

export type Pedido = {
  id: string;
  fecha: Fecha;
  fechaOriginal: Fecha;
  que: string;
  tipo: TipoPedido;
  hacia: Punto;
  desde: Punto | null;
  urgencia: Urgencia;
  horaLimite: Hora | null;
  horaFija: Hora | null;
  noAntesDe: Hora | null;
  duracionMin: number | null;
  cargaDeposito: Hora | null;
  necesita: Necesita;
  pidioId: string | null;
  pidioTexto: string | null;
  canal: CanalPedido;
  estado: EstadoPedidoGuardado;
  esperandoMotivo: string | null;
  esperandoHastaMin: Minutos | null;
  viajeId: string | null;
  ordenManual: number | null;
  cajonPendienteId: string | null;
  sugeridoRegla: ReglaSugerido | null;
  sugeridoOtId: number | null;
  ultimoNoPudo: { min: Minutos; choferId: string | null; motivo: string; viajeId: string; hacia: Punto } | null;
  noPudoVisto: boolean;
  intentos: number;
  nota: string | null;
  creadoMin: Minutos;
  anuladoMotivo: string | null;
};

export type Instruccion = {
  otId: number;
  cuadrillaOdooId: number | null;
  horaInicio: Hora | null;
  hoy: string | null;
  chips: string[];
};

export type Ausencia = {
  /** null = no está guardada: sale de la asistencia de Odoo ("según la asistencia"). */
  id: string | null;
  personaId: string;
  desde: Fecha;
  /** null = sin fecha de alta. */
  hasta: Fecha | null;
  tipo: TipoAusencia;
  /** Parciales: llega a esta hora. */
  horaDesde: Hora | null;
  /** Parciales: se retira a esta hora. */
  horaHasta: Hora | null;
  nota: string | null;
  origen: "planificador" | "asistencia";
};

/**
 * Lo que se le mandó a una persona ese día y qué hizo con eso. Una fila de hd_links.
 * Las fotos (`snap*`) son las de estado.ts (`FotoHoja` / `FotoChofer`).
 */
export type Envio = {
  id: string;
  token: string;
  fecha: Fecha;
  personaId: string;
  rol: RolLink;
  cuadrillaOdooId: number | null;
  anulado: boolean;
  enviadaMin: Minutos | null;
  enviadaCanal: "telegram" | "manual" | null;
  reenviadaMin: Minutos | null;
  abiertaMin: Minutos | null;
  ultimaVistaMin: Minutos | null;
  recibidaMin: Minutos | null;
  cambioMin: Minutos | null;
  cambioDiffs: Diferencia[] | null;
  snap: Foto | null;
  snapPrimero: Foto | null;
  snapRecibido: Foto | null;
  snapOk: Foto | null;
  okMin: Minutos | null;
  version: number;
  versionVista: number;
  versionRecibida: number;
};

// ─── Fotos de lo enviado y diferencias (estado.ts) ───────────────────────────

export type FotoHoja = {
  tipo: "hoja";
  c: number;
  suspendida: string | null;
  obras: { id: number; dir: string; hora: Hora; est: boolean }[];
  gente: string[];
  aCargo: string | null;
  modo: ModoChofer;
  chofer: string | null;
  veh: string | null;
  lleva: Hora | null;
  busca: Hora | null;
  llevaCh: string | null;
  buscaCh: string | null;
  buscaVeh: string | null;
  enc: { lugar: LugarEncuentro; hora: Hora; dir: string | null };
  encTxt: string;
  nota: string | null;
  notas: Record<string, string>;
  instr: string;
};

export type FotoViaje = {
  k: string;
  tipo: TipoViaje;
  c: number | null;
  hacia: string;
  desde: string | null;
  hora: Hora | null;
  carga: string;
  veh: string | null;
  pidio: { pid: string | null; hl: Hora | null } | null;
};

export type FotoChofer = {
  tipo: "chofer";
  viajes: FotoViaje[];
  todo: number[];
  sac: { k: string; txt: string; t: Minutos }[];
};

export type Foto = FotoHoja | FotoChofer;

export type Diferencia = {
  t: string;
  motivo?: string | null;
  chico?: boolean;
  enc?: boolean;
  nuevo?: boolean;
  sac?: boolean;
  hora?: boolean;
  orden?: boolean;
  /** El viaje del que se habla (diferencias de chofer). */
  v?: FotoViaje;
};

// ─── Parámetros ──────────────────────────────────────────────────────────────

export type Parametros = {
  horaLimiteEnvio: Hora;
  horaAlarmaNoAbierta: Hora;
  minutosEntreViajes: number;
  duracionViaje: Record<TipoViaje, number>;
  minutosVueltaDeposito: number;
  minutosSinNoticias: number;
  minutosSinAvisar: number;
  minutosNoVisto: number;
  kmCerca: number;
  horaCorteManana: Hora;
  encuentroDeposito: Hora;
  encuentroObra: Hora;
  inicioObra: Hora;
  finJornada: Hora;
  chipsInstrucciones: string[];
  motivosNoPude: string[];
  motivosEsperar: string[];
  coordinador: { nombre: string; telefono: string | null };
  deposito: { nombre: string; telefono: string | null; telegramChatId: number | null };
  diasAsistencia: number;
};

export const PARAMETROS_POR_DEFECTO: Parametros = {
  horaLimiteEnvio: "19:00",
  horaAlarmaNoAbierta: "6:30",
  minutosEntreViajes: 45,
  duracionViaje: {
    lleva: 45, busca: 30, mueve: 30, lleva_material: 60, trae_material: 30,
    compra: 60, entre_depositos: 60, taller: 90, otro: 60,
  },
  minutosVueltaDeposito: 60,
  minutosSinNoticias: 60,
  minutosSinAvisar: 2,
  minutosNoVisto: 10,
  kmCerca: 3,
  horaCorteManana: "15:00",
  encuentroDeposito: "7:00",
  encuentroObra: "8:00",
  inicioObra: "8:00",
  finJornada: "17:00",
  chipsInstrucciones: [
    "Llevar arnés y cabo de vida", "Pasar por el depósito antes", "Llamar al encargado al llegar",
    "Tiene que estar el encargado", "Llevar la documentación (ART y seguro)", "Hidrogrúa en obra",
    "Terminar sí o sí hoy",
  ],
  motivosNoPude: [
    "No estaba listo", "Estaba cerrado", "No había nadie para recibir", "No entra en el camión",
    "Problema con el camión", "Otro (te llamo)",
  ],
  motivosEsperar: ["No está listo", "Falta en el depósito", "Espera al cliente", "Otro"],
  coordinador: { nombre: "Juan Agustín", telefono: null },
  deposito: { nombre: "Encargado del depósito", telefono: null, telegramChatId: null },
  diasAsistencia: 3,
};

// ─── El día entero (GET /api/hoja-dia) ───────────────────────────────────────

/** Lo del día anterior con hojas que usan la precarga y la sugerencia de a cargo. */
export type DiaAnterior = {
  fecha: Fecha;
  obras: ObraDia[];
  hojas: Hoja[];
  viajes: Viaje[];
  camiones: CamionDia[];
};

export type DiaHoja = {
  fecha: Fecha;
  /** ISO del momento en que se armó (para "lo que ves es de las 20:16"). */
  generadoAt: string;
  cuadrillas: Cuadrilla[];
  /** El tablero de ese día, en el orden del día. */
  obras: ObraDia[];
  /** Cuadrillas suspendidas ese día (plan_suspensiones): odooId → motivo. */
  suspendidas: Record<number, string>;
  hojas: Hoja[];
  personas: Persona[];
  vehiculos: Vehiculo[];
  camiones: CamionDia[];
  lugares: Lugar[];
  viajes: Viaje[];
  pedidos: Pedido[];
  instrucciones: Instruccion[];
  /** Vigentes ese día o después, más las calculadas de la asistencia. */
  ausencias: Ausencia[];
  envios: Envio[];
  /** Operarios a los que ya se les avisó (o se decidió no avisar) que entraron a una hoja. */
  operariosAvisados: string[];
  parametros: Parametros;
  /** El último día hábil con hojas antes de este ("Empezar como hoy"). */
  anterior: DiaAnterior | null;
  /** La última hoja de cada cuadrilla antes de este día (la 5 no trabajó el lunes). */
  ultimasHojas: { fecha: Fecha; hoja: Hoja }[];
  /** Pendientes del cajón del tablero que todavía no pasaron a pedido. */
  cajon: { id: string; texto: string }[];
  telegram: { configurado: boolean; bot: string | null };
};
