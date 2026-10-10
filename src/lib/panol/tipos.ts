// Tipos del Pañol. Espejo de supabase/migrations/20261010000001_panol.sql; el diseño, en
// docs/panol/modulo.md.
//
// LO QUE HAY QUE TENER EN LA CABEZA: todo lo que se mueve es un movimiento de un LUGAR a
// otro, y el lugar dice a la vez dónde está y quién lo tiene ("p:<id>" es "lo tiene esa
// persona"). Las pantallas no calculan stock: leen `pan_saldos`, que mantiene el trigger.
// Este archivo no importa nada de servidor: lo usan el kiosco, la oficina y los tests.

export type TipoArticulo = "insumo" | "herramienta" | "granel";

export const TIPO_ARTICULO: Record<TipoArticulo, { titulo: string; ayuda: string }> = {
  insumo: { titulo: "Insumo", ayuda: "Se consume y no vuelve: precintos, tornillos, discos, guantes." },
  herramienta: { titulo: "Herramienta con número", ayuda: "Cada una con su QR: amoladoras, alargues, arneses, roldanas." },
  granel: { titulo: "Herramienta a granel", ayuda: "Vuelve, pero se cuenta por cantidad: llaves, martillos." },
};

export type TipoUbicacion = "panol" | "deposito" | "estanteria" | "estante" | "cajon";

export type EstadoUnidad =
  | "disponible" | "afuera" | "en_revision" | "en_mantenimiento"
  | "fuera_de_servicio" | "faltante" | "perdida" | "baja";

export type EstadoVuelta = "bien" | "con_falla" | "incompleta";

export type TipoVale = "retiro" | "sobrante" | "devolucion" | "transferencia" | "ingreso" | "gestion";

export type TipoMovimiento =
  | "retiro" | "sobrante" | "prestamo" | "devolucion" | "transferencia"
  | "ingreso" | "alta" | "ajuste" | "taller_envio" | "taller_vuelta"
  | "faltante" | "perdida" | "recuperada" | "baja" | "revision" | "anulacion";

/** Las gestiones que sólo hace un encargado (vale tipo "gestion"). */
export type MovGestion = "faltante" | "perdida" | "recuperada" | "baja" | "taller_envio" | "taller_vuelta" | "revision";

export type PersonaTipo = "persona" | "externa";

// ─── Filas ──────────────────────────────────────────────────────────────────

export type Ubicacion = {
  id: string;
  padre_id: string | null;
  nombre: string;
  tipo: TipoUbicacion;
  orden: number;
  activo: boolean;
};

export type Articulo = {
  id: string;
  nombre: string;
  tipo: TipoArticulo;
  seguridad_critica: boolean;
  tiene_talles: boolean;
  unidad: string;
  unidad_compra: string | null;
  factor_compra: number;
  minimo: number | null;
  reponer_hasta: number | null;
  ubicacion_id: string | null;
  proveedor: string | null;
  codigo_barras: string | null;
  foto_path: string | null;
  ultimo_costo: number | null;
  notas: string | null;
  activo: boolean;
};

export type Variante = { id: string; articulo_id: string; nombre: string; orden: number; activo: boolean };

export type Unidad = {
  id: string;
  articulo_id: string;
  numero: string;
  serie: string | null;
  marca_modelo: string | null;
  fecha_compra: string | null;
  costo: number | null;
  ubicacion_id: string | null;
  lugar: string;
  estado: EstadoUnidad;
  desde_at: string;
  odoo_ot_id: number | null;
  capataz_id: string | null;
  vence_el: string | null;
  faltante_de: string | null;
  proxima_inspeccion: string | null;
  notas: string | null;
  activo: boolean;
};

export type Saldo = { articulo_id: string; variante_id: string | null; lugar: string; cantidad: number };

export type Movimiento = {
  id: string;
  vale_id: string | null;
  tipo: TipoMovimiento;
  articulo_id: string;
  variante_id: string | null;
  unidad_id: string | null;
  cantidad: number;
  desde: string;
  hacia: string;
  odoo_ot_id: number | null;
  cuadrilla_id: string | null;
  capataz_id: string | null;
  quien_tipo: PersonaTipo | null;
  quien_id: string | null;
  estado_vuelta: EstadoVuelta | null;
  nuevo_estado: string | null;
  estado_anterior: string | null;
  motivo: string | null;
  foto_path: string | null;
  vence_el: string | null;
  costo_unitario: number | null;
  denuncia: string | null;
  anula_a: string | null;
  registrado_por: string | null;
  created_at: string;
};

export type PersonaExterna = {
  id: string;
  nombre: string;
  apellido: string;
  dni: string | null;
  empresa: string;
  cuadrilla_id: string | null;
  telefono: string | null;
  activo: boolean;
};

export type Parametro = { clave: ClaveParametro; valor: number; descripcion: string; updated_at: string };

export type ClaveParametro =
  | "aviso_inspeccion_dias" | "vencida_aviso_horas" | "faltante_perdida_dias"
  | "conteo_umbral_pct" | "kiosco_inactividad_seg" | "deshacer_seg";

// ─── Llamadas a las RPC ─────────────────────────────────────────────────────

/** Lo que devuelve pan_identificar. */
export type Identidad = {
  token: string;
  personaTipo: PersonaTipo;
  personaId: string;
  nombre: string;
  /** Habilita lo de encargado. Sólo entrando con PIN: el código de la credencial está impreso. */
  esEncargado: boolean;
  /** Es encargado pero entró con la credencial: ofrecerle "Entrá con tu PIN". */
  encargadoSinPin: boolean;
  cuadrillaId: string | null;
};

export type ItemVale = {
  articuloId?: string;
  varianteId?: string | null;
  unidadId?: string | null;
  cantidad?: number;
  estadoVuelta?: EstadoVuelta;
  motivo?: string;
  fotoPath?: string;
  venceEl?: string;
  vuelveHoy?: boolean;
  costoUnitario?: number;
  desde?: string;
  hacia?: string;
  ubicacionId?: string;
  odooOtId?: number | null;
  movTipo?: MovGestion;
  nuevoEstado?: "disponible" | "en_revision" | "fuera_de_servicio";
  denuncia?: string;
  /** "Me llevo algo que no está": se registra sin movimiento. */
  sinAlta?: { descripcion: string; cantidad?: number; fotoPath?: string };
};

export type Vale = {
  clientUuid: string;
  tipo: TipoVale;
  /** Del kiosco: el token de "¿Quién sos?". */
  token?: string;
  /** Desde la app, un encargado a nombre de otro. */
  quien?: { tipo: PersonaTipo; id: string };
  cuadrillaId?: string | null;
  odooOtId?: number | null;
  dispositivo?: string;
  nota?: string;
  proveedor?: string;
  comprobante?: string;
  items: ItemVale[];
};

export type ResultadoVale = { valeId: string; movimientos?: number; repetido: boolean };

/** Lo que devuelve pan_resolver_codigo. */
export type CodigoResuelto =
  | { tipo: "ubicacion" | "unidad" | "persona" | "externa"; id: string; codigo: string }
  | { tipo: "articulo"; id: string }
  | { tipo: "anulado" | "desconocido"; codigo: string };
