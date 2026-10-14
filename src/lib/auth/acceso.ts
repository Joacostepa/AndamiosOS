// Quién puede qué. Una sola fuente para el menú, el buscador, el proxy y las APIs.
//
// LOS PERMISOS SON DE CADA PERSONA (user_profiles.permisos: módulo → "ver" | "editar"),
// no de su rol. Con gente que no encaja en ningún casillero —el de depósito que también
// mira la planificación, el técnico de afuera— un rol por persona terminaba siendo un rol
// por persona con otro nombre.
//
// EL ROL SIGUE EXISTIENDO y no es decoración: `admin` abre todo y administra usuarios; los
// demás los usan las políticas de RLS viejas (get_user_role) y el ruteo de alertas. En la
// pantalla se llama "perfil" y funciona como plantilla: elegirlo carga sus módulos, que
// después se ajustan uno por uno.
//
// Esto NO es sólo el menú: el proxy usa estas mismas funciones para bloquear páginas y
// APIs. Un menú filtrado y una URL abierta es una cortina, no un permiso.

export const ROLES = ["admin", "operativo", "deposito", "campo", "comercial"] as const;
export type Rol = (typeof ROLES)[number];
export type Nivel = "ver" | "editar";

type DefModulo = {
  id: string;
  titulo: string;
  grupo: string;
  rutas: readonly string[];
  /** Módulos que no escriben nada: sólo admiten "ver". */
  soloLectura?: boolean;
  /**
   * Otro módulo que también abre este, con el mismo nivel. El kiosco del pañol es un
   * módulo aparte para que el usuario del dispositivo compartido tenga SÓLO eso; pero
   * quien tiene Pañol en "editar" (un encargado) también tiene que poder abrir el kiosco.
   */
  incluidoEn?: string;
};

// El orden es el del menú, y es el que usa la pantalla de usuarios para agrupar.
const DEFINICION = [
  { id: "clientes", titulo: "Clientes", grupo: "Comercial", rutas: ["/clientes"] },
  { id: "asistente-comercial", titulo: "Asistente comercial", grupo: "Comercial", rutas: ["/comercial/asistente"] },
  { id: "parametros-cotizacion", titulo: "Parámetros de cotización", grupo: "Comercial", rutas: ["/comercial/parametros"] },
  { id: "obras", titulo: "Obras", grupo: "Operaciones", rutas: ["/obras"] },
  { id: "ordenes-trabajo", titulo: "Órdenes de trabajo", grupo: "Operaciones", rutas: ["/ordenes-trabajo"] },
  { id: "habilitaciones", titulo: "Habilitaciones", grupo: "Operaciones", rutas: ["/habilitaciones"] },
  { id: "permisos-via-publica", titulo: "Permisos de andamio", grupo: "Gestorías", rutas: ["/permisos-via-publica"] },
  { id: "informes-obra", titulo: "Informes de obra", grupo: "Operaciones", rutas: ["/informes-obra"] },
  { id: "mapa-obras", titulo: "Mapa de obras", grupo: "Operaciones", rutas: ["/mapa-obras"], soloLectura: true },
  { id: "planificacion", titulo: "Planificación", grupo: "Operaciones", rutas: ["/planificacion"] },
  // La Hoja del día (docs/equipos-del-dia/modulo.md): quiénes van, con qué chofer y qué hace
  // cada camión. Vive ADENTRO de Planificación (/planificacion/hoja y /hoja/camiones) pero es
  // un módulo aparte: se puede ver la hoja sin poder mover el tablero, y al revés. Gana la
  // ruta más larga (ver moduloDeRuta), así /planificacion/hoja no la abre Planificación.
  { id: "hoja-dia", titulo: "Hoja del día", grupo: "Operaciones", rutas: ["/planificacion/hoja"] },
  { id: "computos", titulo: "Cómputos", grupo: "Oficina técnica", rutas: ["/oficina-tecnica/computos"] },
  { id: "stock", titulo: "Stock", grupo: "Depósito y logística", rutas: ["/deposito/stock"] },
  { id: "catalogo", titulo: "Catálogo de piezas", grupo: "Depósito y logística", rutas: ["/deposito/catalogo"] },
  { id: "movimientos", titulo: "Movimientos", grupo: "Depósito y logística", rutas: ["/deposito/movimientos"] },
  { id: "remitos", titulo: "Remitos", grupo: "Depósito y logística", rutas: ["/logistica/remitos"] },
  // `/p/<código>` es a donde lleva un QR escaneado con la cámara del celular.
  { id: "panol", titulo: "Pañol", grupo: "Depósito y logística", rutas: ["/deposito/panol", "/p"] },
  // El dispositivo compartido del pañol (ver docs/panol/modulo.md §5): sólo registra
  // movimientos, a nombre de quien se identifica. No es encargado ni ve la oficina.
  { id: "panol-kiosco", titulo: "Kiosco del pañol", grupo: "Depósito y logística", rutas: ["/kiosco"], incluidoEn: "panol" },
  { id: "partes", titulo: "Partes de obra", grupo: "Campo", rutas: ["/partes"] },
  { id: "solicitudes-extra", titulo: "Solicitudes extra", grupo: "Campo", rutas: ["/solicitudes-extra"] },
  { id: "incidentes", titulo: "Incidentes", grupo: "Campo", rutas: ["/incidentes"] },
  { id: "inspecciones", titulo: "Inspecciones", grupo: "Campo", rutas: ["/inspecciones"] },
  { id: "personal", titulo: "Legajos", grupo: "Personal y flota", rutas: ["/personal"] },
  { id: "fichadas", titulo: "Fichadas", grupo: "Personal y flota", rutas: ["/fichadas"] },
  { id: "vehiculos", titulo: "Vehículos", grupo: "Personal y flota", rutas: ["/vehiculos"] },
  { id: "configuracion", titulo: "Configuración", grupo: "Sistema", rutas: ["/configuracion"] },
] as const satisfies readonly DefModulo[];

export type ModuloId = (typeof DEFINICION)[number]["id"];
export type Modulo = DefModulo & { id: ModuloId };
export const MODULOS: readonly Modulo[] = DEFINICION;

export type Permisos = Partial<Record<ModuloId, Nivel>>;

export type Acceso = {
  rol: Rol | null;
  activo: boolean;
  permisos: Permisos;
  debeCambiarClave: boolean;
};

/** Páginas que no son de ningún módulo y abre cualquiera con sesión activa. */
const RUTAS_DE_TODOS = [
  // La campanita la ve TODO EL MUNDO y lleva acá: esconder el destino y mostrar el aviso
  // sería un badge que rebota. Es seguro: la RLS de `alertas` filtra por destinatario.
  "/alertas",
];
const RUTAS_DE_ADMIN = ["/configuracion/usuarios"];

/**
 * Qué módulos habilitan cada API.
 *
 * LAS APIs SE COMPARTEN ENTRE PANTALLAS: el parte diario lee jornadas de
 * /api/planificacion, la ficha de la OT usa los comentarios del tablero, Cuadrillas
 * pregunta por jornadas futuras. Por eso cada prefijo lleva la LISTA de módulos que lo
 * usan, y alcanza con tener uno. Gana el prefijo más largo.
 *
 * El nivel sale del método: GET pide "ver", cualquier otro pide "editar".
 *
 * UNA API QUE NO ESTÉ ACÁ QUEDA SÓLO PARA ADMIN. Es a propósito: un endpoint nuevo que se
 * olvida de sumarse falla a la vista del primero que lo prueba (con un mensaje que dice
 * por qué), en vez de quedar abierto para todos sin que nadie lo note.
 */
const APIS: Record<string, readonly ModuloId[]> = {
  "/api/planificacion": ["planificacion"],
  "/api/planificacion/partes": ["planificacion", "partes"],
  "/api/planificacion/empleados": ["planificacion", "partes"],
  "/api/planificacion/jornadas": ["planificacion", "partes"],
  "/api/planificacion/notas": ["planificacion", "partes"],
  "/api/planificacion/confirmaciones": ["planificacion", "partes"],
  "/api/planificacion/ot": ["planificacion", "ordenes-trabajo", "partes"],
  "/api/planificacion/comentarios": ["planificacion", "ordenes-trabajo"],
  "/api/planificacion/documentos": ["planificacion", "ordenes-trabajo"],
  "/api/planificacion/cuadrillas-futuras": ["planificacion", "configuracion"],
  "/api/ordenes-trabajo": ["ordenes-trabajo", "planificacion"],
  "/api/odoo/push/ordenes-trabajo": ["ordenes-trabajo"],
  "/api/habilitaciones": ["habilitaciones"],
  "/api/permisos-via-publica": ["permisos-via-publica"],
  "/api/operaciones": ["mapa-obras"],
  "/api/informes-obra": ["informes-obra"],
  "/api/fichadas": ["fichadas"],
  "/api/comercial/asistente": ["asistente-comercial"],
  "/api/comercial/parametros": ["parametros-cotizacion"],
  "/api/ai/computo": ["computos"],
  "/api/panol": ["panol"],
  "/api/panol/kiosco": ["panol-kiosco", "panol"],
  // Hoja del día (§14 "Acceso"). Los pedidos también los crean quien planifica (desde el
  // cajón) y el depósito, sin poder ponerlos en un camión (eso es /viajes, sólo hoja-dia);
  // las ausencias, RRHH desde Personal. "Cerrar jornada" lee la precarga del parte.
  "/api/hoja-dia": ["hoja-dia"],
  "/api/hoja-dia/pedidos": ["hoja-dia", "planificacion", "panol"],
  "/api/hoja-dia/ausencias": ["hoja-dia", "personal"],
  "/api/hoja-dia/cierre": ["hoja-dia", "planificacion", "partes"],
};
const PREFIJOS_API = Object.keys(APIS).sort((a, b) => b.length - a.length);

/** Servicios auxiliares sin datos de nadie, y la cuenta propia. */
const APIS_DE_TODOS = ["/api/clima", "/api/feriados", "/api/afip", "/api/odoo/health", "/api/cuenta"];
const APIS_DE_ADMIN = ["/api/usuarios"];

const IDS = new Set<string>(MODULOS.map((m) => m.id));
const TITULO = Object.fromEntries(MODULOS.map((m) => [m.id, m.titulo])) as Record<ModuloId, string>;

/**
 * Perfiles: el rol de cada uno y los módulos con los que arranca al elegirlo.
 * Depósito y Campo todavía no tienen circuito propio: arrancan con el operativo básico.
 */
const CIRCUITO: Permisos = { planificacion: "editar", "ordenes-trabajo": "editar", partes: "editar" };
export const PERFILES: readonly { rol: Rol; titulo: string; descripcion: string; permisos: Permisos }[] = [
  { rol: "admin", titulo: "Administrador", descripcion: "Ve y edita todo, y administra los usuarios.", permisos: {} },
  {
    rol: "operativo",
    titulo: "Oficina",
    descripcion: "Planificación, órdenes de trabajo, partes y habilitaciones.",
    permisos: { ...CIRCUITO, habilitaciones: "editar", "permisos-via-publica": "editar", "mapa-obras": "ver" },
  },
  { rol: "deposito", titulo: "Depósito", descripcion: "Planificación, órdenes de trabajo y partes.", permisos: CIRCUITO },
  { rol: "campo", titulo: "Campo", descripcion: "Planificación, órdenes de trabajo y partes.", permisos: CIRCUITO },
  // Asistentes comerciales: miran la planificación para contestarle al cliente, pero no la
  // mueven; trabajan la gestoría de permisos. OJO: las alertas sin destinatario van al rol
  // operativo, así que este rol no las ve en la campanita (tampoco las de la gestoría).
  {
    rol: "comercial",
    titulo: "Comercial",
    descripcion: "Planificación en sólo lectura, mapa de obras y permisos de andamio.",
    permisos: { planificacion: "ver", "mapa-obras": "ver", "permisos-via-publica": "editar" },
  },
];

export function etiquetaRol(rol: Rol | null | undefined): string {
  return PERFILES.find((p) => p.rol === rol)?.titulo ?? "Sin perfil";
}

/** Deja sólo módulos que existen y niveles válidos. Lo que viene de la base o de un body. */
export function normalizarPermisos(crudo: unknown): Permisos {
  const salida: Permisos = {};
  if (!crudo || typeof crudo !== "object" || Array.isArray(crudo)) return salida;
  for (const [id, nivel] of Object.entries(crudo)) {
    if (!IDS.has(id) || (nivel !== "ver" && nivel !== "editar")) continue;
    const modulo = MODULOS.find((m) => m.id === id)!;
    salida[modulo.id] = modulo.soloLectura ? "ver" : nivel;
  }
  return salida;
}

/** Una fila de mi_acceso() (o de user_profiles) → Acceso. Sin fila, null. */
export function accesoDeFila(fila: unknown): Acceso | null {
  if (!fila || typeof fila !== "object") return null;
  const f = fila as Record<string, unknown>;
  return {
    rol: ROLES.includes(f.rol as Rol) ? (f.rol as Rol) : null,
    activo: f.activo === true,
    permisos: normalizarPermisos(f.permisos),
    debeCambiarClave: f.debe_cambiar_clave === true,
  };
}

function coincide(ruta: string, pathname: string): boolean {
  if (ruta === "/") return pathname === "/";
  return pathname === ruta || pathname.startsWith(`${ruta}/`);
}

export function esAdmin(acceso: Acceso | null | undefined): boolean {
  return !!acceso?.activo && acceso.rol === "admin";
}

/** Nivel en un módulo. null = sin acceso. */
export function nivelEn(acceso: Acceso | null | undefined, modulo: ModuloId): Nivel | null {
  if (!acceso?.activo) return null;
  if (acceso.rol === "admin") return "editar";
  const propio = acceso.permisos[modulo] ?? null;
  const padre = (MODULOS.find((m) => m.id === modulo)?.incluidoEn ?? null) as ModuloId | null;
  if (propio === "editar" || !padre) return propio;
  return acceso.permisos[padre] === "editar" ? "editar" : propio;
}

function alcanza(tiene: Nivel | null, pide: Nivel): boolean {
  return tiene === "editar" || (tiene === "ver" && pide === "ver");
}

/** ¿Puede abrir esta página? Una ruta que no es de ningún módulo queda para admin. */
export function puedeAbrir(acceso: Acceso | null | undefined, pathname: string): boolean {
  if (!acceso?.activo) return false;
  if (RUTAS_DE_ADMIN.some((r) => coincide(r, pathname))) return acceso.rol === "admin";
  if (RUTAS_DE_TODOS.some((r) => coincide(r, pathname))) return true;
  if (acceso.rol === "admin") return true;
  const modulo = moduloDeRuta(pathname);
  return !!modulo && nivelEn(acceso, modulo.id) !== null;
}

/**
 * El módulo de una página: el de la ruta MÁS LARGA que coincide. /planificacion/hoja es de
 * la Hoja del día aunque también empiece con /planificacion.
 */
export function moduloDeRuta(pathname: string): Modulo | null {
  let mejor: Modulo | null = null;
  let largo = -1;
  for (const m of MODULOS) {
    for (const r of m.rutas) {
      if (coincide(r, pathname) && r.length > largo) { mejor = m; largo = r.length; }
    }
  }
  return mejor;
}

/**
 * ¿Puede hacer esta llamada a la API? Devuelve null si puede, o el motivo —en palabras
 * de quien lo va a leer en un toast— si no.
 */
export function motivoDeRechazoApi(
  acceso: Acceso | null | undefined,
  pathname: string,
  metodo: string,
): string | null {
  if (!acceso?.activo) return "Tu usuario no tiene acceso a la aplicación.";
  if (APIS_DE_ADMIN.some((r) => coincide(r, pathname))) {
    return acceso.rol === "admin" ? null : "Sólo un administrador puede hacer esto.";
  }
  if (APIS_DE_TODOS.some((r) => coincide(r, pathname))) return null;
  if (acceso.rol === "admin") return null;

  const prefijo = PREFIJOS_API.find((p) => coincide(p, pathname));
  if (!prefijo) return "Esta función todavía está habilitada sólo para administradores.";

  const modulos = APIS[prefijo];
  const pide: Nivel = metodo === "GET" || metodo === "HEAD" ? "ver" : "editar";
  if (modulos.some((m) => alcanza(nivelEn(acceso, m), pide))) return null;

  // Nombrar sólo lo que aplica: "Tenés Planificación en sólo lectura" a quien ni siquiera
  // tiene Planificación confunde más de lo que explica.
  const enLectura = modulos.filter((m) => nivelEn(acceso, m) === "ver");
  if (pide === "editar" && enLectura.length > 0) {
    return `Tenés ${enLectura.map((m) => TITULO[m]).join(" y ")} en sólo lectura: no podés hacer cambios.`;
  }
  return `No tenés acceso a ${modulos.map((m) => TITULO[m]).join(" ni a ")}.`;
}

/**
 * A dónde va cuando entra, cuando abre "/" o cuando pide algo que no le toca.
 *
 * Planificación, que es la pantalla con la que arranca el día; si no la tiene, su primer
 * módulo; y si no tiene ninguno, Alertas, que abre cualquiera. "/" no tiene pantalla
 * propia: el dashboard que había se sacó (2026-09-26) porque nadie lo usaba.
 */
export function inicioDe(acceso: Acceso | null | undefined): string {
  if (puedeAbrir(acceso, "/planificacion")) return "/planificacion";
  return MODULOS.find((m) => puedeAbrir(acceso, m.rutas[0]))?.rutas[0] ?? "/alertas";
}
