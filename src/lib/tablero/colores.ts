// Tokens visuales del tablero.
//
// ACÁ YA NO HAY COLORES: hay nombres. Cada valor es un `var(--tb-*)` que se resuelve en
// src/app/globals.css, que es el único lugar donde se decide qué significa cada tono en
// cada tema. El módulo se diseñó sobre fondo blanco y los hex estaban clavados en el TS,
// así que en modo oscuro no cambiaba nada: las tarjetas confirmadas quedaban como parches
// blancos y las tentativas —fondo `var(--card)` con texto navy— directamente no se leían.
//
// La paleta CLARA es la misma de antes, hex por hex (spec ABA). Lo único que cambió de
// aspecto en claro es `ok.solido`, y por una razón de contraste que está anotada abajo.
//
// Regla para agregar un color nuevo: si el valor no es `var(--tb-…)`, está mal. Y el par
// (fondo, texto) que estrene tiene que entrar en scripts/contraste-tablero.mjs, que es lo
// que impide que esto se vuelva a romper en silencio.

// El coral es MARCA: el mismo hex en los dos temas, igual que --primary. No se aclara
// para oscuro porque no es un color de estado, es la identidad.
import { CORAL } from "@/lib/planificacion/colores";

export { CORAL };

/**
 * Fondo del destino de arrastre (celda o panel bajo el cursor).
 *
 * Ya no es el `ACENTO_BG` de planificación —un durazno claro sobre blanco— porque en
 * oscuro ese destello era lo más brillante de la pantalla justo mientras se arrastra, que
 * es el peor momento para encandilar. Ahora es el tinte coral sobre la superficie del
 * tema; el que dice "acá" sigue siendo el contorno punteado, no el relleno.
 */
export const ACENTO_BG = "var(--tb-acento-bg)";

export type ColorCuadrilla = { bg: string; borde: string; text: string };

// El color de cuadrilla identifica la FILA, no la tarjeta (v3 invierte el criterio de
// spec §2). Las filas ya son las cuadrillas: una tarjeta que está en la fila de
// Cuadrilla 3 no puede ser de otra, así que el fondo —el canal más fuerte que hay—
// estaba gastado en repetir lo que la posición ya decía. Ahora codifica el tipo de OT,
// que es lo que el jefe de obra necesita leer rápido. Ver TIPO_OT más abajo.
//
// La paleta cicla: alcanza para las ~8 filas del diseño y tolera las 15 cuadrillas
// activas que hoy tiene Odoo.
const PALETA: ColorCuadrilla[] = [
  { bg: "var(--tb-azul-bg)", borde: "var(--tb-azul-borde)", text: "var(--tb-azul-text)" },
  { bg: "var(--tb-ambar-bg)", borde: "var(--tb-ambar-borde)", text: "var(--tb-ambar-text)" },
  { bg: "var(--tb-verde-bg)", borde: "var(--tb-verde-borde)", text: "var(--tb-verde-text)" },
  { bg: "var(--tb-rosa-bg)", borde: "var(--tb-rosa-borde)", text: "var(--tb-rosa-text)" },
  { bg: "var(--tb-violeta-bg)", borde: "var(--tb-violeta-borde)", text: "var(--tb-violeta-text)" },
  { bg: "var(--tb-teal-bg)", borde: "var(--tb-teal-borde)", text: "var(--tb-teal-text)" },
  { bg: "var(--tb-coral-bg)", borde: "var(--tb-coral-borde)", text: "var(--tb-coral-text)" },
  { bg: "var(--tb-gris-bg)", borde: "var(--tb-gris-borde)", text: "var(--tb-gris-text)" },
];

export function colorCuadrilla(indice: number): ColorCuadrilla {
  return PALETA[((indice % PALETA.length) + PALETA.length) % PALETA.length];
}

// ── Tipo de OT ───────────────────────────────────────────────────────────────
//
// El tipo se distingue por DIRECCIÓN antes que por color: armado sube, desarme baja.
// Una franja de 3px de color no alcanza —se pierde a la escala de la tarjeta y no
// funciona para daltónicos— así que la señal primaria es la forma y el color acompaña.
// En oscuro eso vale doble: los tintes son mucho más parecidos entre sí que los pasteles.

export type ColorTipo = { bg: string; text: string; icono: "arriba" | "abajo" | "otro" };

// Medido contra Odoo (1003 OTs): desarme 444 (44,3%), armado 315 (31,4%), otro 244 (24,3%).
// mantenimiento / ampliacion / desmonte_parcial existen en el modelo pero no se usan:
// caen en el gris neutro hasta que aparezcan.
export const TIPO_OT: Record<string, ColorTipo> = {
  armado: { bg: "var(--tb-azul-bg)", text: "var(--tb-azul-text)", icono: "arriba" },
  desarme: { bg: "var(--tb-ambar-bg)", text: "var(--tb-ambar-text)", icono: "abajo" },
};

export const TIPO_OT_NEUTRO: ColorTipo = {
  bg: "var(--tb-neutro-bg)",
  text: "var(--tb-neutro-text)",
  icono: "otro",
};

// ── Tarjeta de operaciones ───────────────────────────────────────────────────
//
// Trabajo interno de una cuadrilla (depósito, traslado, mantenimiento). No es una obra:
// no tiene cliente, ni habilitación, ni parte.
//
// VA EN EL FONDO, que es el canal que ya significa "qué clase de trabajo es esto" —azul
// armado, ámbar desarme—. Una tarea es otra clase de trabajo, así que le corresponde ese
// canal y no otro. Los demás están ocupados y usarlos diría algo falso: el borde
// punteado ya significa "tentativa", y la franja izquierda es el semáforo.
//
// El violeta es el tono que quedaba libre entre las tarjetas. Lo comparte con la columna
// de feriado (FERIADO_COLUMNA), que es mucho más pálida y va detrás: una tarea sobre un
// feriado se distingue igual por el borde y por el texto.
//
// Y se distingue sobre todo por AUSENCIA: sin flecha de dirección, sin punto de
// semáforo, sin cliente, sin urgencia. Al lado de una obra se ve visiblemente más vacía,
// que es una señal que sobrevive al blanco y negro y al daltonismo.
export const TAREA: ColorTipo = {
  bg: "var(--tb-violeta-bg)",
  text: "var(--tb-violeta-text)",
  icono: "otro",
};

/** La franja izquierda de una tarea: no hay semáforo que mostrar, así que la toma el tipo. */
export const TAREA_FRANJA = "var(--tb-violeta-borde)";

export function colorTipo(tipo: string | null | undefined): ColorTipo {
  return TIPO_OT[tipo ?? ""] ?? TIPO_OT_NEUTRO;
}

// ── Feriado nacional ─────────────────────────────────────────────────────────
//
// Violeta apagado, y no por gusto: es el único tono que no está hablando de otra cosa en
// el tablero. El beige ya es la canaleta del domingo, el coral es hoy y la acción, el
// rojo es error y sobreasignación, el ámbar es "obra empezada", y el azul y el ámbar
// suaves son el relleno de las tarjetas de armado y desarme. Un feriado pintado con
// cualquiera de esos se leería como un estado de las obras y no del día.
//
// La columna va apenas teñida y el encabezado más marcado: lo que tiene que saltar es el
// DÍA, y las tarjetas que caigan encima tienen que seguir legibles.
export const FERIADO_COLUMNA = "var(--tb-feriado-columna)";
export const FERIADO_ENCABEZADO = "var(--tb-feriado-encabezado)";
export const FERIADO_TEXTO = "var(--tb-feriado-texto)";

/**
 * Canaleta del domingo sin trabajo y del día ya pasado.
 *
 * Los dos son "esto está fuera de juego" y los dos se definen por RELACIÓN con la celda,
 * no por un tono: la canaleta se hunde y el pasado se vela. En oscuro hundirse es ir a
 * más oscuro, que es justo lo contrario del beige que tenían clavado.
 */
/**
 * Superficie del cajón de planificación.
 *
 * Es un PLANO y no un color: neutro, apenas hundido respecto de la grilla. Tiene que
 * leerse como otra clase de cosa, y eso en este tablero no se puede hacer con hue —cada
 * tono ya significa un estado de las obras— así que se hace con superficie.
 */
export const CAJON = "var(--tb-cajon)";

export const CANALETA = "var(--tb-canaleta)";
export const PASADO = "var(--tb-pasado)";

/**
 * Relleno de la tarjeta tentativa: "lo mismo que hay detrás", no una superficie.
 *
 * Estaba escrito como `var(--card)`, que en claro es blanco y por eso parecía no tener
 * relleno. En oscuro sí lo tenía, y la tentativa terminaba leyéndose igual que una
 * confirmada — el canal del ESTADO se apagaba justo donde el del TIPO ya venía flojo.
 */
export const TENTATIVA = "var(--tb-tentativa)";

// ── Nota de la jornada ───────────────────────────────────────────────────────
//
// Ámbar de post-it, y es el único tono que quedaba libre EN EL ENCABEZADO: ahí el coral
// es "hoy", el violeta es el feriado, el rojo es el aviso de que todas las cuadrillas
// están sobreasignadas y el beige es la canaleta del domingo. El ámbar existe en las
// tarjetas —desarme, urgencia media— pero nunca en la fila de días, así que no se pisa.
//
// Y es la convención: una nota escrita es amarilla en todos lados. La marca NO dice
// "atención, hay un problema" —para eso está el rojo, y confundirlos haría que un día con
// un aviso se lea como un día roto— dice "acá alguien anotó algo".
//
// El texto va marrón oscuro y no blanco: sobre el ámbar pleno el blanco queda en 2:1 y a
// 9px de contador no se lee. Es el mismo marrón del rótulo de desarme.
//
// Es el único par que NO cambia entre temas: un chip saturado con su texto encima ya trae
// su propio contraste y no depende de lo que tenga detrás.
export const NOTA = {
  fondo: "var(--tb-nota-bg)",
  texto: "var(--tb-nota-text)",
  /** Franja bajo el encabezado del día. Es lo que se ve barriendo la grilla entera. */
  franja: "var(--tb-nota-bg)",
} as const;

// ── Semánticos ───────────────────────────────────────────────────────────────
//
// Verde, ámbar y rojo son los únicos colores que NO se tiñen con el tema: rojo tiene que
// seguir siendo rojo. Entre temas les cambia la luminancia, nada más.

/** Tilde de ejecutado, confirmaciones. */
export const OK = "var(--tb-ok)";
/**
 * Verde de RELLENO, con texto blanco encima. Es más oscuro que OK a propósito: blanco
 * sobre el verde de marca da 3,3:1 y no pasa AA al tamaño de los botones del cierre.
 */
export const OK_SOLIDO = "var(--tb-ok-solido)";
/** Ámbar de aviso: obra empezada, franja de nota, urgencia media. */
export const ALERTA = "var(--tb-alerta)";
/** Rojo de trazo: bordes, franjas, íconos, sobreasignación. */
export const PELIGRO = "var(--tb-peligro)";
/** Rojo de RELLENO, con texto blanco encima. Ver OK_SOLIDO. */
export const PELIGRO_SOLIDO = "var(--tb-peligro-solido)";
/** Fondo de la jornada no ejecutada y del badge de urgencia alta. */
export const PELIGRO_SUAVE = "var(--tb-peligro-suave)";
/** Texto sobre PELIGRO_SUAVE, y rojo de texto en general. */
export const PELIGRO_TEXTO = "var(--tb-peligro-text)";
/** Candado: el cliente pidió esperar el permiso. Advierte, no bloquea. */
export const CANDADO = "var(--tb-candado)";
/** Gris de "todavía no": historial sin confirmar. */
export const INACTIVO = "var(--tb-inactivo)";

/** Recuadro de aviso ámbar (panel de OT, diálogo del candado). */
export const AVISO = {
  fondo: "var(--tb-aviso-bg)",
  borde: "var(--tb-aviso-borde)",
  texto: "var(--tb-aviso-text)",
  icono: "var(--tb-aviso-icono)",
} as const;

// Semáforo de habilitación (x_hab_semaforo). Se ve como un punto en la esquina de la
// tarjeta: advierte, no bloquea — las obras sin habilitar entran igual al tablero.
export const SEMAFORO: Record<string, { color: string; label: string }> = {
  verde: { color: OK, label: "Habilitación al día" },
  amarillo: { color: ALERTA, label: "Habilitación próxima a vencer" },
  rojo: { color: PELIGRO, label: "Habilitación crítica" },
  // Un paso más profundo que `rojo`, no otro color. En oscuro además se separa en hue:
  // dos rojos oscuros que sólo se diferenciaban por luminancia dejaban de distinguirse.
  vencida: { color: "var(--tb-vencida)", label: "Habilitación vencida" },
};

// Sin valor no hay gris: una obra de la que no sabemos nada NO está habilitada, y eso es
// rojo. El gris decía "sin datos" y se confundía con "no hace falta", que ahora va verde.
export function semaforo(valor: string | null | undefined) {
  return SEMAFORO[valor ?? "rojo"] ?? SEMAFORO.rojo;
}

// La barra es UNA sola señal: cuánto de la capacidad diaria está ocupado, y si se pasó.
// Antes el parcial iba en ámbar, que competía con el ámbar de desarme dentro de la misma
// celda y además marcaba como alerta algo que no lo es: una celda al 50% está bien.
// Parcial y completa comparten color; lo que cambia es el ancho del relleno.
export function colorOcupacion(nivel: "libre" | "parcial" | "completa" | "sobre"): string {
  if (nivel === "sobre") return PELIGRO;
  if (nivel === "libre") return "transparent";
  return "var(--tb-riel-relleno)";
}

/**
 * Riel de la barra de ocupación: se dibuja siempre, a ancho completo de la celda.
 *
 * En claro el relleno es más OSCURO que el riel; en oscuro, más CLARO. La relación que se
 * conserva es "el lleno resalta contra el vacío": mantener el par tal cual venía hacía
 * que sobre fondo negro la barra se leyera al revés, con el riel brillando más que el
 * relleno.
 */
export const RIEL_OCUPACION = "var(--tb-riel)";

export const URGENCIA_ALTA_BORDE = PELIGRO;

// Urgencia de la OT (x_urgencia). La decide una persona en Odoo; el tablero sólo la lee.
//
// ALTA usa el rojo fuerte, el mismo de la sobreasignación y del error: es el único tono
// que ya significa "esto no puede pasar de largo" en el resto del tablero. MEDIA va en
// ámbar apagado y SIN franja ni borde — es una advertencia de segundo orden, y darle los
// mismos canales que a alta las igualaría, que es justo lo contrario de lo que se pide.
//
// `fuerte` es para TRAZO (borde, franja) y `solido` para RELLENO con texto blanco: en
// oscuro el rojo de trazo se aclara para no hundirse, y blanco sobre ese rojo aclarado
// baja a 3,4:1. Son dos usos distintos y por eso son dos tokens.
export const URGENCIA = {
  alta: {
    fuerte: PELIGRO,
    solido: PELIGRO_SOLIDO,
    suave: PELIGRO_SUAVE,
    texto: PELIGRO_TEXTO,
    label: "URGENTE",
  },
  media: {
    fuerte: ALERTA,
    suave: "var(--tb-ambar-bg)",
    texto: "var(--tb-ambar-text)",
    label: "MEDIA",
  },
} as const;
