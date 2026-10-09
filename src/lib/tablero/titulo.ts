// El x_name de la OT viene armado desde Odoo con un formato estable:
//
//   "Armado · S02246 · Pablo Riedel — Av. Directorio 2461"
//   "Desarme · S00719 · Av. Callao 1810 (FACHADA CALLAO)"   ← sin cliente
//   "Armado · S01933 · Granz SRL"                            ← sin dirección
//
// Partirlo permite darle a la dirección la línea que merece: es lo que Operaciones
// usa para identificar la obra. Si el formato no coincide, se devuelve el título
// entero como principal y no se pierde información.

export type PartesTitulo = {
  tipo: string | null;
  numero: string | null;
  cliente: string | null;
  /** Lo que identifica la obra en pantalla: la dirección si la hay, si no el cliente. */
  principal: string;
};

const SEPARADOR_CAMPOS = " · ";
const SEPARADOR_CLIENTE = " — ";

export function partesTitulo(titulo: string): PartesTitulo {
  const campos = titulo.split(SEPARADOR_CAMPOS).map((c) => c.trim());

  if (campos.length < 3) {
    return { tipo: null, numero: null, cliente: null, principal: titulo.trim() };
  }

  const [tipo, numero, ...resto] = campos;
  const cola = resto.join(SEPARADOR_CAMPOS);
  const corte = cola.indexOf(SEPARADOR_CLIENTE);

  if (corte === -1) {
    return { tipo, numero, cliente: null, principal: cola };
  }
  return {
    tipo,
    numero,
    cliente: cola.slice(0, corte).trim(),
    principal: cola.slice(corte + SEPARADOR_CLIENTE.length).trim(),
  };
}

/**
 * La dirección de la obra, con la del campo propio adelante y el título como red.
 *
 * `x_direccion_obra` (Odoo) es el dato bueno: lo carga Comercial con el autocompletado de
 * Google, viaja venta → OT por un `related` y NO pasa por el truncado a 72 de `x_name`.
 * Partir el título queda sólo para lo viejo: las OTs anteriores al backfill y las ventas
 * donde no había dirección en ningún lado.
 *
 * Es la ÚNICA función que decide qué dirección se muestra. Si mañana el campo gana o pierde
 * prioridad, se cambia acá y no en las siete pantallas que la usan.
 */
export function direccionDeObra(ot: { direccionObra?: string | null; titulo?: string | null }): string {
  const propia = ot.direccionObra?.trim();
  if (propia) return propia;
  return partesTitulo(ot.titulo ?? "").principal;
}

/** Normaliza para buscar sin depender de tildes ni mayúsculas. */
export function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

// Siglas que quedan en mayúsculas al pasar un nombre a formato normal.
const SIGLAS = new Set(["SA", "SRL", "SAS", "SAU", "SH", "SC", "UTE", "CABA", "AMBA", "YPF", "AFIP", "AYSA", "ABA"]);
const MINUSCULAS = new Set(["de", "del", "la", "las", "los", "y", "e", "en"]);

/**
 * Un nombre de Odoo escrito como lo escribe una persona: "JUAN CARLOS RODRIGUEZ" → "Juan
 * Carlos Rodriguez", "RIVEROS, Jorge" → "Jorge Riveros", "CUADRILLA 3" → "Cuadrilla 3".
 *
 * Es SÓLO PARA MOSTRAR: en Odoo no se toca nada. Existe porque los nombres llegan como cada
 * uno los cargó, y en una misma ficha convivían mayúsculas sostenidas con texto normal, que
 * se leen como gritos o como títulos.
 *
 * NO CAMBIA LO QUE YA ESTÁ BIEN ESCRITO: si el texto no viene mayormente en mayúsculas, se
 * devuelve igual (salvo el "APELLIDO, Nombre", que se da vuelta). Las siglas conocidas y las
 * palabras con puntos ("S.A.", "C.A.B.A.") quedan como están.
 */
export function nombrePropio(texto: string | null | undefined): string {
  const t = (texto ?? "").trim();
  if (!t) return "";
  // "RIVEROS, Jorge": apellido EN MAYÚSCULAS, coma y nombre, sin números ni puntos. Así una
  // dirección con coma ("Av. Antártida Argentina, esq. …") no se da vuelta.
  const partes = t.split(",");
  const apellidoNombre =
    partes.length === 2 &&
    /^[A-ZÁÉÍÓÚÜÑ' -]+$/.test(partes[0].trim()) &&
    /^[^\d.]+$/.test(partes[1]) &&
    partes[1].trim().split(/\s+/).length <= 3;
  const base = apellidoNombre ? `${partes[1].trim()} ${partes[0].trim()}` : t;
  const letras = base.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g, "");
  const mayus = base.replace(/[^A-ZÁÉÍÓÚÜÑ]/g, "").length;
  if (letras.length === 0 || mayus / letras.length < 0.6) return base;
  return base
    .split(/(\s+)/)
    .map((palabra, i) => {
      if (/^\s+$/.test(palabra) || palabra.includes(".")) return palabra;
      const limpia = palabra.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g, "");
      if (SIGLAS.has(limpia.toUpperCase())) return palabra.toUpperCase();
      const baja = palabra.toLocaleLowerCase("es");
      if (i > 0 && MINUSCULAS.has(baja)) return baja;
      // Dos letras o menos que no son una preposición: iniciales o siglas ("GS", "H°").
      if (limpia.length > 0 && limpia.length <= 2 && !MINUSCULAS.has(baja)) return palabra;
      return baja.replace(/^(\P{L}*)(\p{L})/u, (_, pre: string, l: string) => pre + l.toLocaleUpperCase("es"));
    })
    .join("");
}

/**
 * La dirección como entra en una tarjeta de la grilla, que tiene unos 20 caracteres: en
 * formato normal ("AV. CALLAO 1777" → "Av. Callao 1777"), "Avenida" abreviado y sin la
 * ciudad al final ("CABA", "Buenos Aires"). NO ES ESTÉTICA: el número es lo que distingue
 * una obra de otra, y "Avenida Raúl Scala…" dos veces en la misma celda no se distinguía.
 * Sólo para mostrar; la búsqueda y la ficha usan la dirección entera.
 */
export function direccionCorta(direccion: string): string {
  return nombrePropio(direccion)
    .replace(/^(avenida|av)\b\.?/i, "Av.")
    .replace(/[\s,–-]+(C\.?A\.?B\.?A\.?|Ciudad Autónoma de Buenos Aires|Capital Federal|(Provincia de )?Buenos Aires)\s*$/i, "")
    .trim();
}
