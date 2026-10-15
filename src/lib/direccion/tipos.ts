// Tipos compartidos de Dirección. Es el CONTRATO entre calculadores (servidor), APIs y
// componentes (cliente): ver docs/direccion/implementacion.md.
//
// REGLAS QUE ESTOS TIPOS HACEN CUMPLIR
//  · Todo es JSON serializable (viaja por la caché de Next, el snapshot y la red): sin Date,
//    Map, undefined en arrays ni funciones. Las fechas son ISO 'AAAA-MM-DD' (día argentino)
//    o ISO completo para instantes (tomadoAt).
//  · Nunca 0 por error: un dato que falta es { tipo: "sin_dato", motivo }.
//  · Los montos llevan los pesos y, si es un PERÍODO, los dólares de cada documento. Un
//    SALDO va sin `usd`: el cliente lo pasa al dólar de hoy (§3 de diseno.md).
//
// Sin imports a propósito: lo leen los tests de node (strip-types) y los componentes.

export type PantallaId = "semana" | "caja" | "ventas" | "cobranzas" | "calle" | "socios" | "datos";
export const PANTALLAS_IDS: readonly PantallaId[] = ["semana", "caja", "ventas", "cobranzas", "calle", "socios", "datos"];

export type Moneda = "USD" | "ARS";

/** ✓ confiable · ⚠ a verificar · ◐ incompleto. */
export type Confianza = "ok" | "ver" | "inc";
/** Nivel de un aviso de calidad: los de confianza más ● informativo. */
export type NivelAviso = "ver" | "inc" | "inf";

/** ↑ más es mejor · ↓ menos es mejor · null sin polaridad (no se colorea). */
export type Polaridad = "↑" | "↓" | null;

/**
 * La regla que va debajo de cada cifra (§3.7). Ver `unidad()` en formato.ts.
 * periodo: sin IVA, USD al dólar de cada factura · saldo: con IVA, dólar de hoy ·
 * caja: saldo de caja · foto: sin IVA, foto de hoy · socios: dólar de cada movimiento ·
 * resultado: sin IVA, dólar promedio del mes.
 */
export type Regla = "periodo" | "saldo" | "caja" | "foto" | "socios" | "resultado";

/** Un monto. `usd` presente = período (cada documento a su dólar). Ausente = saldo. */
export type Monto = { ars: number; usd?: number | null };

/** El valor de una cifra. Un dato que falta es `sin_dato` con el motivo, NUNCA 0. */
export type Valor =
  | { tipo: "monto"; monto: Monto }
  | { tipo: "cantidad"; n: number; unidad?: string } // "26 contratos"
  | { tipo: "pct"; n: number; decimales?: number }
  | { tipo: "dias"; n: number }
  | { tipo: "fecha"; iso: string; prefijo?: string } // "hasta el 25/11"
  | { tipo: "texto"; texto: string }
  | { tipo: "sin_dato"; motivo: string };

export type MarcaConfianza = { nivel: Confianza; motivo?: string; desde?: string | null };

/** Una comparación (chip). delta null = sin dato, con `motivo`. */
export type Comparacion = {
  delta: number | null;
  /** "a igual día sep", "vs lun 05/10". */
  base: string;
  polaridad: Polaridad;
  /** "%" (por defecto) o "pp" (puntos). */
  unidad?: "%" | "pp";
  motivo?: string;
};

/**
 * Una cifra calculada. `kpi` es un id del diccionario (diccionario.ts); `id` permite tener
 * dos cifras del mismo indicador (p. ej. facturado del mes y facturado sin Ministerio).
 */
export type Cifra = {
  kpi: string;
  id?: string;
  valor: Valor;
  regla?: Regla;
  confianza: MarcaConfianza;
  comparaciones?: Comparacion[];
  /** Línea de contexto ("⚠ Borelli USD 279 k fuera del total"). */
  contexto?: Frase;
  /** Valor numérico contra el que se mide la meta (si la hay). */
  valorMeta?: number | null;
  /** El nodo que abre la tarjeta. Por defecto, el del indicador. */
  nodo?: NodoRef;
  /** Sólo socios: se quita de la respuesta a quien no tiene direccion-socios. */
  reservado?: boolean;
  /**
   * Versiones de algo que cambia con lo reservado (ver reservado.ts → variantes()): la de
   * los socios (`soloConSocios`) y la del resto (`soloSinSocios`). Cada usuario recibe una.
   */
  soloConSocios?: boolean;
  soloSinSocios?: boolean;
};

/**
 * Texto con cifras tocables, armado en el servidor y formateado en el cliente (así el
 * toggle de moneda no pide nada al servidor). Cada cifra puede abrir un desglose.
 */
export type FraseCifra = { valor: Valor; kpi?: string; nodo?: NodoRef };
export type Frase = (string | FraseCifra)[];

/** Aviso de calidad de datos (§9.2). Los automáticos los arma calidad.ts; los manuales vienen de Supabase. */
export type Aviso = {
  id: string;
  nivel: NivelAviso;
  aviso: Frase;
  desde?: string | null;
  /** ids del diccionario a los que afecta. */
  afecta: string[];
  quien: string;
  que: string;
  detalle?: Frase;
  reservado?: boolean;
  soloConSocios?: boolean;
  soloSinSocios?: boolean;
  origen: "auto" | "manual";
};

export type Severidad = "rojo" | "ambar" | "gris";

/** "Para decidir" (§4.6). Las notas y el dueño vigente vienen de Supabase. */
export type Decision = {
  id: string;
  sev: Severidad;
  pantalla: PantallaId;
  /** Dueño por defecto de la regla; el vigente sale de direccion_duenos. */
  duenoSugerido: string | null;
  /** 'AAAA-MM-DD' o null. */
  vence: string | null;
  corto: Frase;
  que: Frase;
  pregunta: string;
  ver?: NodoRef;
  reservado?: boolean;
  soloConSocios?: boolean;
  soloSinSocios?: boolean;
};

/** Oración de la narrativa. `prioridad` sólo ordena las candidatas. */
export type Oracion = { id: string; frase: Frase; prioridad?: number; reservado?: boolean; soloConSocios?: boolean; soloSinSocios?: boolean };

// ─── Desglose (drill-down) ────────────────────────────────────────────────────────────

/**
 * Referencia a un nodo de desglose. `tipo` es la clave del registro (desglose/index.ts);
 * el resto son parámetros en texto (viajan en la query: ?nodo=cliente&v=Ministerio…).
 * Claves reservadas: `nodo`, `pagina`.
 */
export type NodoRef = { tipo: string; [param: string]: string };

export type TonoEtiqueta = "neutro" | "bien" | "mal" | "aten";

export type FilaDesglose = {
  id: string;
  titulo: string;
  sub?: string;
  /** Cifra de la derecha: un monto (se formatea en el cliente) o un texto. */
  valor?: Valor;
  valorSub?: string;
  /** 0..1: barra proporcional debajo del título (rankings). */
  barra?: number;
  etiqueta?: { texto: string; tono: TonoEtiqueta };
  /** Abre otro nodo (nivel siguiente). */
  hijo?: NodoRef;
  /** Registro en Odoo. La URL la arma la API (urlOdoo), no el resolvedor. */
  odoo?: { modelo: string; id: number; url?: string };
  atenuada?: boolean;
};

export type SeccionDesglose = { titulo?: string; filas: FilaDesglose[]; cierre?: CierreDesglose; nota?: string };

/** Control "Total = la cifra ✓". suma y cifra en la misma moneda de origen. */
export type CierreDesglose = { suma: Monto; cifra: Monto; texto?: string; explica?: string } | { nota: string };

export type NodoDesglose = {
  titulo: string;
  cifra: Valor;
  sub?: string;
  avisos?: { texto: string; tono: "aten" | "gris" }[];
  secciones: SeccionDesglose[];
  /** Agrupar por… (segmentos). `param` es la clave que cambia en el NodoRef. */
  agrupar?: { param: string; activo: string; opciones: { valor: string; etiqueta: string }[] };
  pagina?: { actual: number; total: number; filas: number };
  /** Ofrece "Exportar CSV" de lo que se ve (nivel 2). */
  csv?: boolean;
};

// ─── Resultado de un calculador ─────────────────────────────────────────────────────────

/** Dólar usado: valor (ARS por USD) y fecha de la cotización de Odoo. */
export type TcDia = { valor: number; fecha: string };

/**
 * Lo que devuelve un calculador de pantalla (src/lib/direccion/calculo/<pantalla>.ts).
 * `detalle` es lo propio de cada pantalla (tablas, series, gráficos): lo tipa su dueño.
 */
export type ResultadoCalculador<D = unknown> = {
  pantalla: PantallaId;
  cifras: Cifra[];
  detalle: D;
  avisos: Aviso[];
  decisiones?: Decision[];
  oraciones?: Oracion[];
  /** Dólar de hoy usado para los saldos (el del día del cálculo). */
  tc: TcDia | null;
};

/** Cómo se obtuvo lo que se muestra. */
export type Lectura = {
  /** Instante ISO de la lectura correcta de Odoo ("Datos de Odoo al…"). */
  tomadoAt: string;
  fuente: "vivo" | "snapshot";
  /** Odoo no respondió y se muestra el último snapshot. */
  odooCaido?: { hora: string; mensaje: string };
};

export type ResultadoPantalla<D = unknown> = ResultadoCalculador<D> & { lectura: Lectura };

/** La respuesta de una pantalla: datos, o el estado vacío con el motivo. */
export type RespuestaPantalla<D = unknown> =
  | ({ ok: true } & ResultadoPantalla<D>)
  | { ok: false; pantalla: PantallaId; motivo: string; hora: string };
