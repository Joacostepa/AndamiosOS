// Qué ve cada rol. Una sola fuente para el menú, el buscador y el middleware.
//
// EL ROL VIVE EN user_profiles.rol (Supabase), que es donde ya estaba: inventar un
// segundo lugar —app_metadata, una tabla nueva— habría dado dos verdades para la misma
// pregunta, y esas divergen. Desde la migración 20260826000001 esa columna sólo la
// escribe la service role: el usuario puede editar su nombre y su teléfono, no su rol.
//
// DECISIÓN (arranque): el sistema es nuevo y la mayoría de los módulos todavía no están
// trabajados. En vez de mostrar veinte pantallas a medio hacer, los perfiles no-admin ven
// SÓLO el circuito que ya funciona de punta a punta: planificar, la orden de trabajo y el
// parte diario. A medida que un módulo se termine, se agrega acá y aparece para todos.
//
// Esto NO es sólo el menú: el middleware usa la misma lista para bloquear la ruta. Un
// menú filtrado y una URL abierta es una cortina, no un permiso.

export type Rol = "admin" | "operativo" | "deposito" | "campo";

/** El circuito operativo terminado. Todo lo demás queda fuera hasta que se trabaje. */
const MODULOS_ARRANQUE = ["/planificacion", "/ordenes-trabajo", "/partes"];

/** null = ve todo. */
const RUTAS_POR_ROL: Record<Rol, string[] | null> = {
  admin: null,
  operativo: MODULOS_ARRANQUE,
  // Todavía no se trabajaron como perfiles propios. Arrancan con lo mismo que operativo:
  // ante la duda, de menos. Cuando depósito y campo tengan su circuito, se abre acá.
  deposito: MODULOS_ARRANQUE,
  campo: MODULOS_ARRANQUE,
};

/**
 * Las rutas de un rol. Sin rol —perfil no creado todavía— manda la lista más chica:
 * falla cerrado, que es lo que corresponde cuando no se sabe quién es alguien.
 */
export function rutasDe(rol: Rol | null | undefined): string[] | null {
  if (rol === "admin") return null;
  return RUTAS_POR_ROL[rol as Rol] ?? MODULOS_ARRANQUE;
}

/**
 * ¿Este rol puede abrir esta ruta?
 *
 * Las rutas de API quedan fuera de esta puerta a propósito: siguen protegidas por sesión,
 * pero mapear a mano qué endpoint necesita cada pantalla es la clase de lista que se
 * desactualiza en silencio y deja una pantalla rota sin que nadie sepa por qué. Acá se
 * decide lo que se NAVEGA.
 */
export function puedeVer(rol: Rol | null | undefined, pathname: string): boolean {
  if (pathname.startsWith("/api/")) return true;
  const permitidas = rutasDe(rol);
  if (permitidas === null) return true;
  if (pathname === "/") return false;
  return permitidas.some((r) => pathname === r || pathname.startsWith(`${r}/`));
}

/**
 * A dónde va este rol cuando entra, o cuando pide algo que no le toca.
 *
 * El admin al tablero de inicio; el resto a Planificación, que es la pantalla con la que
 * arranca el día. Sin esto, un operativo que inicia sesión cae en "/" —que no puede ver—
 * y quedaría rebotando.
 */
export function inicioDe(rol: Rol | null | undefined): string {
  return rutasDe(rol) === null ? "/" : "/planificacion";
}
