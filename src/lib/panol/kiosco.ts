// La cuenta del kiosco: el carrito del vale, qué hacer con lo que se escanea y qué le pasa
// a una herramienta cuando alguien la acerca a la cámara. Lógica pura (sin red, sin React):
// la usan las pantallas de src/components/panol/kiosco y los tests (kiosco.test.ts).
//
// LA REGLA DE FONDO: el kiosco PROPONE y la base DECIDE. Todo lo que se calcula acá (si la
// herramienta está disponible, si el estante tiene uno o varios artículos, qué obra
// proponer) es para no hacerle perder tiempo al operario con una pantalla que no
// corresponde; la que garantiza que no se preste algo que ya está afuera es
// pan_registrar_vale, y su rechazo (leerRechazo) siempre gana.

import { conTitular, enPanol, existencias, noApta } from "./estado.ts";
import type { Articulo, CodigoResuelto, EstadoVuelta, ItemVale, Saldo, TipoArticulo, TipoVale, Ubicacion, Unidad, Vale, Variante } from "./tipos.ts";

// ─── El carrito ─────────────────────────────────────────────────────────────

/** Una línea del vale tal como la ve el operario. `clave` la identifica para sumar y quitar. */
export type LineaVale = {
  clave: string;
  /** Falta sólo en "Me llevo algo que no está". */
  articuloId?: string;
  varianteId: string | null;
  unidadId: string | null;
  cantidad: number;
  /** Para mostrar: "Precintos 300mm · talle 9", "Amoladora #H-014". */
  nombre: string;
  unidad: string;
  /** De qué cajón salió (o a cuál vuelve). Sin esto la base usa el del artículo. */
  ubicacionId?: string | null;
  vuelveHoy?: boolean;
  estadoVuelta?: EstadoVuelta;
  motivo?: string;
  fotoPath?: string;
  venceEl?: string | null;
  odooOtId?: number | null;
  sinAlta?: { descripcion: string; fotoPath?: string };
  /** Devolución a granel: de quién vuelve ("p:…", "c:…"). */
  desde?: string;
};

export function claveDe(l: Pick<LineaVale, "articuloId" | "varianteId" | "unidadId" | "sinAlta">): string {
  if (l.sinAlta) return `s:${l.sinAlta.descripcion.trim().toLowerCase()}`;
  if (l.unidadId) return `u:${l.unidadId}`;
  return `a:${l.articuloId}:${l.varianteId ?? ""}`;
}

const redondear = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Suma una línea al vale. Reescanear el mismo cajón SUMA (dos manos de precintos son una
 * línea, no dos); reescanear la misma herramienta con número no hace nada y lo avisa: es
 * el "se escaneó dos veces" de docs §3, y tiene que ser inofensivo.
 */
export function sumarLinea(lineas: readonly LineaVale[], nueva: Omit<LineaVale, "clave">): { lineas: LineaVale[]; repetida: boolean } {
  const clave = claveDe(nueva);
  const i = lineas.findIndex((l) => l.clave === clave);
  if (i < 0) {
    const cantidad = nueva.unidadId ? 1 : redondear(Math.max(nueva.cantidad, 0));
    return { lineas: [...lineas, { ...nueva, clave, cantidad }], repetida: false };
  }
  if (nueva.unidadId) return { lineas: [...lineas], repetida: true };
  const copia = [...lineas];
  copia[i] = { ...copia[i], cantidad: redondear(copia[i].cantidad + nueva.cantidad) };
  return { lineas: copia, repetida: false };
}

/** Cambia la cantidad de una línea; nunca baja de 1 (para sacarla está "quitar"). */
export function cambiarCantidad(lineas: readonly LineaVale[], clave: string, cantidad: number): LineaVale[] {
  return lineas.map((l) => (l.clave === clave && !l.unidadId ? { ...l, cantidad: redondear(Math.max(1, cantidad)) } : l));
}

export function quitarLinea(lineas: readonly LineaVale[], clave: string): LineaVale[] {
  return lineas.filter((l) => l.clave !== clave);
}

export function actualizarLinea(lineas: readonly LineaVale[], clave: string, cambios: Partial<Omit<LineaVale, "clave">>): LineaVale[] {
  return lineas.map((l) => (l.clave === clave ? { ...l, ...cambios } : l));
}

/** Las líneas → los ítems que espera pan_registrar_vale (sin campos vacíos). */
export function itemsDeVale(lineas: readonly LineaVale[]): ItemVale[] {
  return lineas.map((l) => {
    if (l.sinAlta) {
      return { sinAlta: { descripcion: l.sinAlta.descripcion.trim(), cantidad: l.cantidad, ...(l.sinAlta.fotoPath ? { fotoPath: l.sinAlta.fotoPath } : {}) } };
    }
    const item: ItemVale = { articuloId: l.articuloId };
    if (l.varianteId) item.varianteId = l.varianteId;
    if (l.unidadId) item.unidadId = l.unidadId;
    else item.cantidad = l.cantidad;
    if (l.ubicacionId) item.ubicacionId = l.ubicacionId;
    if (l.vuelveHoy) item.vuelveHoy = true;
    if (l.estadoVuelta) item.estadoVuelta = l.estadoVuelta;
    if (l.motivo?.trim()) item.motivo = l.motivo.trim();
    if (l.fotoPath) item.fotoPath = l.fotoPath;
    if (l.venceEl) item.venceEl = l.venceEl;
    if (l.odooOtId !== undefined && l.odooOtId !== null) item.odooOtId = l.odooOtId;
    if (l.desde) item.desde = l.desde;
    return item;
  });
}

/** El payload completo de pan_registrar_vale. `odooOtId: null` es "Sin obra · Taller/Depósito". */
export function armarVale(args: {
  tipo: TipoVale;
  clientUuid: string;
  token: string;
  dispositivo: string;
  lineas: readonly LineaVale[];
  odooOtId?: number | null;
  cuadrillaId?: string | null;
  nota?: string;
}): Vale {
  const vale: Vale = {
    clientUuid: args.clientUuid,
    tipo: args.tipo,
    token: args.token,
    dispositivo: args.dispositivo,
    odooOtId: args.odooOtId ?? null,
    items: itemsDeVale(args.lineas),
  };
  if (args.cuadrillaId) vale.cuadrillaId = args.cuadrillaId;
  if (args.nota?.trim()) vale.nota = args.nota.trim();
  return vale;
}

/** "1 artículo", "3 artículos". */
export const contar = (n: number, uno: string, varios: string) => `${n.toLocaleString("es-AR")} ${n === 1 ? uno : varios}`;

/** Una cantidad legible: 1850 → "1.850", 2.5 → "2,5". */
export const numero = (n: number) => n.toLocaleString("es-AR", { maximumFractionDigits: 3 });

// ─── Lo que se escanea ──────────────────────────────────────────────────────

/**
 * Lo que trae el QR → el código pelado. Las etiquetas llevan una URL
 * (https://<dominio>/p/E7K2QX) para que la cámara del celular abra la ficha; el escáner
 * de la app usa sólo el código. Es la misma limpieza que hace pan_resolver_codigo.
 */
export function normalizarCodigo(texto: string): string {
  return texto.trim().replace(/^.*\/p\//i, "").replace(/[?#].*$/, "").trim().toUpperCase();
}

export type CodigoLocal = { codigo: string; tipo: "ubicacion" | "unidad" | "persona" | "externa"; entidad_id: string; activo: boolean };

/**
 * Resuelve un código sin ir a la red, con la tabla de códigos que el kiosco ya tiene en
 * memoria. Es lo que hace que un escaneo responda al instante (la regla de los 10
 * segundos) y que siga andando con la señal cortada. Devuelve null si no lo conoce: ahí
 * se le pregunta a la base (pan_resolver_codigo), que puede saber de un alta de recién.
 */
export function resolverLocal(texto: string, codigos: readonly CodigoLocal[], articulos: readonly Pick<Articulo, "id" | "codigo_barras" | "activo">[]): CodigoResuelto | null {
  const codigo = normalizarCodigo(texto);
  const c = codigos.find((x) => x.codigo === codigo);
  if (c) return c.activo ? { tipo: c.tipo, id: c.entidad_id, codigo } : { tipo: "anulado", codigo };
  const crudo = texto.trim();
  const a = articulos.find((x) => x.activo && x.codigo_barras && x.codigo_barras === crudo);
  if (a) return { tipo: "articulo", id: a.id };
  return null;
}

/** Los ids de una ubicación y todo lo que cuelga de ella (estantería → estantes → cajones). */
export function subarbol(ubicaciones: readonly Pick<Ubicacion, "id" | "padre_id">[], raiz: string): Set<string> {
  const hijos = new Map<string, string[]>();
  for (const u of ubicaciones) {
    if (!u.padre_id) continue;
    const l = hijos.get(u.padre_id) ?? [];
    l.push(u.id);
    hijos.set(u.padre_id, l);
  }
  const out = new Set<string>([raiz]);
  const pila = [raiz];
  while (pila.length) {
    const id = pila.pop()!;
    for (const h of hijos.get(id) ?? []) {
      if (!out.has(h)) {
        out.add(h);
        pila.push(h);
      }
    }
  }
  return out;
}

/** "Pañol › Estantería E3 › Estante 2 › Cajón C-12", sin la raíz si se pide corta. */
export function rutaDeUbicacion(ubicaciones: readonly Pick<Ubicacion, "id" | "padre_id" | "nombre">[], id: string | null, corta = true): string {
  if (!id) return "";
  const porId = new Map(ubicaciones.map((u) => [u.id, u]));
  const partes: string[] = [];
  let actual = porId.get(id);
  let vueltas = 0;
  while (actual && vueltas++ < 20) {
    partes.unshift(actual.nombre);
    actual = actual.padre_id ? porId.get(actual.padre_id) : undefined;
  }
  if (corta && partes.length > 2) partes.shift();
  return partes.reverse().join(" · ");
}

export type CatalogoKiosco = {
  ubicaciones: Ubicacion[];
  articulos: Articulo[];
  variantes: Variante[];
  unidades: Unidad[];
  saldos: Saldo[];
};

/**
 * Qué hay en un estante o cajón: lo que vive ahí (`ubicacion_id`) más lo que tiene saldo
 * ahí aunque su lugar sea otro (alguien lo guardó donde había espacio). Filtrado por los
 * tipos que tienen sentido en el flujo.
 */
export function articulosDeUbicacion(cat: CatalogoKiosco, ubicacionId: string, tipos: readonly TipoArticulo[]): Articulo[] {
  const ids = subarbol(cat.ubicaciones, ubicacionId);
  const conSaldo = new Set(cat.saldos.filter((s) => s.cantidad > 0 && s.lugar.startsWith("u:") && ids.has(s.lugar.slice(2))).map((s) => s.articulo_id));
  return cat.articulos
    .filter((a) => a.activo && tipos.includes(a.tipo) && ((a.ubicacion_id && ids.has(a.ubicacion_id)) || conSaldo.has(a.id)))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

/** En qué flujo está el escaneo: decide qué tipos de artículo se aceptan. */
export type ModoEscaneo = "retiro" | "sobrante" | "salida" | "vuelta";

const TIPOS_DEL_MODO: Record<ModoEscaneo, TipoArticulo[]> = {
  retiro: ["insumo", "granel"],
  sobrante: ["insumo"],
  salida: ["insumo", "granel"],
  vuelta: ["granel"],
};

export type DecisionEscaneo =
  | { ir: "cantidad"; articuloId: string; ubicacionId: string | null }
  | { ir: "lista"; ubicacionId: string; articuloIds: string[] }
  | { ir: "unidad"; unidadId: string }
  | { ir: "persona"; codigo: string }
  | { ir: "aviso"; texto: string };

/**
 * Lo escaneado → la pantalla que sigue. Un cajón con un solo artículo va directo a la
 * cantidad (es el caso del 90% de los retiros); un estante con varios abre la lista.
 */
export function decidirEscaneo(r: CodigoResuelto, cat: CatalogoKiosco, modo: ModoEscaneo): DecisionEscaneo {
  const tipos = TIPOS_DEL_MODO[modo];
  switch (r.tipo) {
    case "persona":
    case "externa":
      return { ir: "persona", codigo: r.codigo };
    case "unidad":
      return { ir: "unidad", unidadId: r.id };
    case "anulado":
      return { ir: "aviso", texto: "Esa etiqueta fue reemplazada por una nueva. Avisá a un encargado para que saque la vieja." };
    case "desconocido":
      return { ir: "aviso", texto: "No conozco ese código. Probá de nuevo o usá «No tiene código»." };
    case "articulo": {
      const a = cat.articulos.find((x) => x.id === r.id);
      if (!a) return { ir: "aviso", texto: "No conozco ese código." };
      if (a.tipo === "herramienta") return { ir: "aviso", texto: `${a.nombre}: escaneá el QR de la herramienta, cada una tiene su número.` };
      if (!tipos.includes(a.tipo)) return { ir: "aviso", texto: avisoDeTipo(a, modo) };
      return { ir: "cantidad", articuloId: a.id, ubicacionId: null };
    }
    case "ubicacion": {
      const arts = articulosDeUbicacion(cat, r.id, tipos);
      if (arts.length === 1) return { ir: "cantidad", articuloId: arts[0].id, ubicacionId: ubicacionDeArticulo(cat, arts[0].id, r.id) };
      if (arts.length === 0) {
        const hayHerramientas = articulosDeUbicacion(cat, r.id, ["herramienta"]).length > 0;
        return {
          ir: "aviso",
          texto: hayHerramientas
            ? "Ahí hay herramientas con número: escaneá la herramienta, no el estante."
            : "En ese lugar no figura nada para esto. Usá «No tiene código».",
        };
      }
      return { ir: "lista", ubicacionId: r.id, articuloIds: arts.map((a) => a.id) };
    }
  }
}

function avisoDeTipo(a: Articulo, modo: ModoEscaneo): string {
  if (modo === "sobrante") return `${a.nombre} no es un insumo: devolvelo como herramienta.`;
  if (modo === "vuelta") return `${a.nombre} es un insumo: lo que sobra va por «Devolver sobrante».`;
  return `${a.nombre} no se retira desde acá.`;
}

/**
 * De qué cajón sale (o a cuál vuelve) un artículo elegido después de escanear un estante o
 * una estantería. Mandar el estante tal cual descontaría de un lugar donde no hay saldo y
 * dejaría el cajón real sin tocar. Por eso: el cajón propio del artículo si está adentro
 * de lo escaneado; si no, el lugar de adentro con más saldo; si no, nada (la base usa el
 * del artículo).
 */
export function ubicacionDeArticulo(cat: Pick<CatalogoKiosco, "ubicaciones" | "articulos" | "saldos">, articuloId: string, escaneada: string | null): string | null {
  if (!escaneada) return null;
  const ids = subarbol(cat.ubicaciones, escaneada);
  const propia = cat.articulos.find((a) => a.id === articuloId)?.ubicacion_id;
  if (propia && ids.has(propia)) return propia;
  const porLugar = new Map<string, number>();
  for (const s of cat.saldos) {
    if (s.articulo_id !== articuloId || !s.lugar.startsWith("u:") || !ids.has(s.lugar.slice(2))) continue;
    porLugar.set(s.lugar.slice(2), (porLugar.get(s.lugar.slice(2)) ?? 0) + Number(s.cantidad));
  }
  let mejor: string | null = null;
  let max = 0;
  for (const [id, n] of porLugar) if (n > max) [mejor, max] = [id, n];
  return mejor;
}

/**
 * Lo a granel (martillos, llaves) que tiene alguien: la persona o su cuadrilla. Sin esto
 * un martillo prestado no tiene por dónde volver. Filtra por artículos si se pasan.
 */
export function granelQueTiene(cat: Pick<CatalogoKiosco, "saldos" | "articulos">, lugares: readonly string[], articuloIds?: readonly string[]): { articuloId: string; varianteId: string | null; lugar: string; cantidad: number }[] {
  const granel = new Set(cat.articulos.filter((a) => a.tipo === "granel").map((a) => a.id));
  return cat.saldos
    .filter((s) => granel.has(s.articulo_id) && lugares.includes(s.lugar) && Number(s.cantidad) > 0 && (!articuloIds || articuloIds.includes(s.articulo_id)))
    .map((s) => ({ articuloId: s.articulo_id, varianteId: s.variante_id, lugar: s.lugar, cantidad: Number(s.cantidad) }));
}

// ─── Stock ──────────────────────────────────────────────────────────────────

/** Lo que figura en el pañol de un artículo; con talles, del talle (o de todos si no se eligió). */
export function stockEnPanol(saldos: readonly Saldo[], articuloId: string, varianteId?: string | null): number {
  return existencias(saldos, articuloId, varianteId ?? undefined).enPanol;
}

/**
 * Se avisa, no se bloquea (docs §3): un insumo que se lleva aunque el sistema diga que no
 * hay es un error de conteo, no un retiro que haya que frenar en la puerta.
 */
export const quedariaNegativo = (stock: number, cantidad: number) => cantidad > stock;

/** "Bolsa (100)": el botón que suma una unidad de compra entera. Null si no tiene. */
export function botonCaja(a: Pick<Articulo, "unidad_compra" | "factor_compra">): { texto: string; factor: number } | null {
  const f = Number(a.factor_compra);
  if (!a.unidad_compra || !(f > 1)) return null;
  const nombre = a.unidad_compra.charAt(0).toUpperCase() + a.unidad_compra.slice(1);
  return { texto: `${nombre} (${numero(f)})`, factor: f };
}

/** El botón "caja" desde 1 salta a la caja justa (1 → 100), no a 101. */
export const sumarCaja = (actual: number, factor: number) => (actual === 1 ? factor : actual + factor);

// ─── Herramientas ───────────────────────────────────────────────────────────

export type SituacionUnidad =
  | { caso: "prestar" }
  | { caso: "bloqueada" }
  | { caso: "devolver" }
  | { caso: "la_tiene"; lugar: string }
  | { caso: "no_disponible"; estado: string };

/**
 * Qué pasa con una herramienta que alguien acerca a la cámara, según dónde figura:
 *   - en el pañol y disponible → préstamo (salvo inspección de seguridad vencida);
 *   - a nombre de quien escanea → devolución;
 *   - a nombre de otro (persona, cuadrilla u obra) → "¿te la pasó o la devolvés por él?";
 *   - en revisión, en taller, faltante… → no se mueve desde el kiosco.
 */
export function situacionUnidad(u: Pick<Unidad, "lugar" | "estado" | "proxima_inspeccion">, a: Pick<Articulo, "seguridad_critica">, quien: string, hoy: string): SituacionUnidad {
  if (enPanol(u.lugar)) {
    if (u.estado !== "disponible") return { caso: "no_disponible", estado: u.estado };
    if (noApta(a.seguridad_critica, u.proxima_inspeccion, hoy)) return { caso: "bloqueada" };
    return { caso: "prestar" };
  }
  if (u.lugar === quien) return { caso: "devolver" };
  if (conTitular(u.lugar)) return { caso: "la_tiene", lugar: u.lugar };
  return { caso: "no_disponible", estado: u.estado };
}

/** Otras unidades del mismo artículo que sí pueden salir: en el pañol, disponibles y al día. */
export function alternativasAlDia(unidades: readonly Unidad[], a: Pick<Articulo, "id" | "seguridad_critica">, excluirId: string, hoy: string): Unidad[] {
  return unidades.filter(
    (u) => u.id !== excluirId && u.activo && u.articulo_id === a.id && enPanol(u.lugar) && u.estado === "disponible" && !noApta(a.seguridad_critica, u.proxima_inspeccion, hoy),
  );
}

/**
 * Lo que se le controla a una herramienta al salir con una cuadrilla. El esquema no
 * marca "máquina": se toma como tal toda herramienta con número que NO es de seguridad
 * crítica (atornilladoras, alargues). El equipo de seguridad (sogas, roldanas, cabos) se
 * controla con su inspección, no con "Bien / Incompleta".
 */
export const esMaquina = (a: Pick<Articulo, "tipo" | "seguridad_critica">) => a.tipo === "herramienta" && !a.seguridad_critica;

export function sumarDias(iso: string, dias: number): string {
  const d = new Date(iso.slice(0, 10) + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

export type OpcionVuelta = "hoy" | "manana" | "fin" | "fecha";

/** ¿Cuándo vuelve? → la fecha prevista. "Fin de obra" no tiene fecha: no vence sola. */
export function fechaDeVuelta(op: OpcionVuelta, hoy: string, elegida?: string): string | null {
  if (op === "hoy") return hoy;
  if (op === "manana") return sumarDias(hoy, 1);
  if (op === "fecha") return elegida && elegida >= hoy ? elegida : null;
  return null;
}

/** "Mañana" el viernes es el lunes: un préstamo que vence el sábado se marca vencido el domingo. */
export function proximoHabil(hoy: string): string {
  let d = sumarDias(hoy, 1);
  while ([0, 6].includes(new Date(d + "T12:00:00Z").getUTCDay())) d = sumarDias(d, 1);
  return d;
}

/** 2026-10-06 → "06/10"; con día de la semana, "lun 06/10". */
export function fechaCorta(iso: string | null | undefined, conDia = false): string {
  if (!iso) return "";
  const [, m, d] = iso.slice(0, 10).split("-");
  if (!conDia) return `${d}/${m}`;
  const dia = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"][new Date(iso.slice(0, 10) + "T12:00:00Z").getUTCDay()];
  return `${dia} ${d}/${m}`;
}

/** Los motivos rápidos + la nota, en una sola línea para el movimiento. */
export function motivoTexto(chips: readonly string[], nota: string): string {
  return [...chips, nota.trim()].filter(Boolean).join(" · ");
}

// ─── Obras ──────────────────────────────────────────────────────────────────

export type ObraPropuesta = { otId: number; motivo: "hoy" | "ultima" | "retiro" };

/**
 * Qué obra proponer, en orden: la que Planificación le da HOY a su cuadrilla, y la última
 * que usó esa persona en este kiosco. Sin repetir. El resto se elige de la lista.
 */
export function obrasPropuestas(otHoy: number | null | undefined, ultima: number | null | undefined): ObraPropuesta[] {
  const out: ObraPropuesta[] = [];
  if (otHoy) out.push({ otId: otHoy, motivo: "hoy" });
  if (ultima && ultima !== otHoy) out.push({ otId: ultima, motivo: "ultima" });
  return out;
}

/**
 * Devolver un sobrante: las obras de los últimos retiros de ESE artículo por ESA persona,
 * la más reciente primero. Así el consumo no le queda inflado a la obra (docs §3).
 */
export function obrasDeRetiros(movs: readonly { odoo_ot_id: number | null; created_at: string }[]): number[] {
  const out: number[] = [];
  for (const m of [...movs].sort((a, b) => b.created_at.localeCompare(a.created_at))) {
    if (m.odoo_ot_id && !out.includes(Number(m.odoo_ot_id))) out.push(Number(m.odoo_ot_id));
  }
  return out;
}

// ─── Cuadrillas ─────────────────────────────────────────────────────────────

export type AfueraCuadrilla = {
  unidades: Unidad[];
  granel: { articuloId: string; varianteId: string | null; cantidad: number }[];
};

/** Lo que figura a nombre de una cuadrilla: las herramientas con número y lo a granel. */
export function afueraDeCuadrilla(cat: Pick<CatalogoKiosco, "unidades" | "saldos" | "articulos">, cuadrillaId: string): AfueraCuadrilla {
  const lugar = `c:${cuadrillaId}`;
  const granelIds = new Set(cat.articulos.filter((a) => a.tipo === "granel").map((a) => a.id));
  return {
    unidades: cat.unidades.filter((u) => u.lugar === lugar && u.activo).sort((a, b) => a.numero.localeCompare(b.numero, "es")),
    granel: cat.saldos
      .filter((s) => s.lugar === lugar && s.cantidad > 0 && granelIds.has(s.articulo_id))
      .map((s) => ({ articuloId: s.articulo_id, varianteId: s.variante_id, cantidad: s.cantidad })),
  };
}

/**
 * Las cuadrillas de Odoo y las de AndamiosOS no comparten id: se cruzan POR NOMBRE
 * ("Cuadrilla 3" ↔ "CUADRILLA 3"), con la misma normalización que use-cuadrillas.ts. Si
 * alguien renombra de un solo lado deja de proponerse la obra del día, y nada más.
 */
export const normalizarNombre = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/\s+/g, " ").trim();

export function cruzarCuadrillas<T extends { nombre: string }>(odoo: readonly T[], locales: readonly { id: string; nombre: string }[]): (T & { cuadrillaId: string | null })[] {
  const porNombre = new Map(locales.map((c) => [normalizarNombre(c.nombre), c.id]));
  return odoo.map((c) => ({ ...c, cuadrillaId: porNombre.get(normalizarNombre(c.nombre)) ?? null }));
}

// ─── Red ────────────────────────────────────────────────────────────────────

/**
 * ¿Falló la red o la base dijo que no? Sólo lo primero se guarda para reintentar: un
 * rechazo (LA_TIENE, SESION_VENCIDA…) reintentado va a volver a rechazarse.
 */
export function esErrorDeRed(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /failed to fetch|load failed|networkerror|network request failed|fetch failed|err_internet_disconnected|timeout/i.test(msg);
}
