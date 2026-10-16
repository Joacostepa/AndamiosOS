// El saludo de Sofía y los textos fijos que manda el servidor (no el modelo). Puro, con tests
// (saludo.test.ts).
//
// Decisión de JS (15/10): el saludo lo arma el CÓDIGO, una sola vez, en el primer mensaje de
// cada charla nueva:
//   «¡Buen día Carlos! Acá Sofía, asistente digital de Andamios Buenos Aires. Contame en qué te
//   puedo ayudar.» (buen día, buenas tardes o buenas noches según la hora: pedido de JS, 16/10)
// El nombre sale del perfil de WhatsApp: sólo el primer nombre, con mayúscula inicial, sin lo
// que está entre paréntesis. Si el perfil parece una empresa, un apodo, o tiene emojis,
// números o una sola letra, saluda sin nombre. Ante la duda, sin nombre: un «Hola Mamá» o un
// «Hola Constructora» a un cliente es peor que un «Hola» a secas.
//
// Los textos fijos (seguridad en obra, error técnico, paso a una persona) tampoco los escribe el
// modelo: §6 de crm-propuesta.md. No pasan por el filtro de salida porque los arma el código.

import { normalizar } from "./texto.ts";

export const NOMBRE_ASISTENTE = "Sofía";

const CUERPO = "Acá Sofía de Andamios Buenos Aires. Contame en qué te puedo ayudar.";

/** Se comparan normalizadas como texto.ts (sin tildes ni letras dobles): se escriben como se escriben. */
const lista = (xs: string[]) => new Set(xs.map((x) => normalizar(x)));

/** Palabras que dicen que el perfil es de una empresa, un comercio o una obra. */
const EMPRESA = lista([
  "sa", "srl", "sas", "sh", "sci", "saic", "sacif", "ltda", "inc", "llc", "corp", "cia", "compania", "company", "hnos", "hermanos",
  "constructora", "construcciones", "construccion", "consorcio", "consorcios", "administracion", "administraciones", "administradora",
  "andamio", "andamios", "inmobiliaria", "propiedades", "desarrollo", "desarrollos", "estudio", "arquitectura", "arquitectos",
  "ingenieria", "obra", "obras", "empresa", "grupo", "servicios", "servicio", "ferreteria", "pintureria", "pinturerias", "taller", "edificio",
  "edificios", "mantenimiento", "reformas", "remodelaciones", "fachadas", "techos", "sociedad", "asociados", "comercial", "industrial",
  "distribuidora", "logistica", "seguridad", "productora", "producciones", "municipalidad", "ministerio", "gobierno", "escuela", "colegio",
  "club", "iglesia", "hotel", "restaurant", "restaurante", "bar", "local", "tienda", "negocio", "oficina", "ventas", "admin", "info",
  "whatsapp", "business", "cliente", "usuario", "contacto", "personal", "celular", "trabajo", "casa",
]);

/** Apodos y vínculos: no son un nombre para saludar a un cliente. */
const APODO = lista([
  "mama", "mami", "mamita", "papa", "papi", "papito", "jefe", "jefa", "jefazo", "abuela", "abuelo", "abu", "tia", "tio", "amor", "mi amor", "gordo",
  "gorda", "gordi", "flaco", "flaca", "negro", "negra", "nene", "nena", "bebe", "beba", "hermano", "hermana", "hno", "hna", "primo", "prima",
  "vecino", "vecina", "amigo", "amiga", "bro", "capo", "genio", "maestro", "maestra", "rey", "reina", "yo", "tu", "vos", "el", "ella",
  "suegra", "suegro", "cuñado", "cuñada", "pa", "ma", "chiquito", "chiquita", "chino", "rubio", "rubia", "pelado", "loco", "loca", "nn",
  "sin nombre", "anonimo", "anonima", "desconocido",
]);

/** Títulos que van antes del nombre: se saltean («Ing. Pablo Ferreyra» → «Pablo»). */
const TITULO = lista(["ing", "arq", "dr", "dra", "lic", "prof", "sr", "sra", "srta", "don", "doña", "cr", "cdor", "cdora", "esc", "mg", "tec"]);

/** Una letra o un nombre propio (con tildes, ñ, apóstrofo o guion en el medio). */
const PALABRA_NOMBRE = /^[\p{L}][\p{L}'’-]*$/u;
const EMOJI = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{FE0F}\u{200D}]/u;

function capitalizar(p: string): string {
  return p
    .toLocaleLowerCase("es-AR")
    .replace(/(^|[-'’])(\p{L})/gu, (_, sep: string, letra: string) => sep + letra.toLocaleUpperCase("es-AR"));
}

/**
 * El primer nombre para el saludo, o null si conviene saludar sin nombre.
 *   «Carlos Gómez» → «Carlos» · «JUAN» → «Juan» · «Joaquin (Andamios Buenos Aires)» → «Joaquin»
 *   · «Ing. Pablo Ferreyra» → «Pablo» · «Constructora Delta SRL», «Mamá», «Juan 🔨», «J.», «Juan2» → null
 */
export function nombreParaSaludo(perfil: string | null | undefined): string | null {
  if (!perfil) return null;
  // Lo que está entre paréntesis, corchetes o después de un separador no es el nombre.
  let t = perfil.replace(/\([^)]*\)?/g, " ").replace(/\[[^\]]*\]?/g, " ").split(/[|/·•@,;:]| - | – | — /)[0];
  t = t.replace(/\s+/g, " ").trim();
  if (!t) return null;
  if (EMOJI.test(t)) return null;
  if (/\d/.test(t)) return null;

  const n = normalizar(t);
  const palabrasNorm = n.replace(/[^a-z ]/g, " ").split(" ").filter(Boolean);
  if (!palabrasNorm.length) return null;
  // Empresa: cualquier palabra («Pinturas Gómez SRL», «Consorcio Las Lilas»), o «S.A.» suelto.
  if (palabrasNorm.some((p) => EMPRESA.has(p))) return null;
  if (/\bs\.?\s?a\.?$|\bs\.?\s?r\.?\s?l\.?$/i.test(t)) return null;
  // Apodo: el perfil entero («Mi amor») o la primera palabra («Mamá Juana» se saluda sin nombre).
  if (APODO.has(palabrasNorm.join(" ")) || APODO.has(palabrasNorm[0])) return null;

  // Los títulos se saltean («Ing. Pablo», «Dra Marta»).
  const crudas = t.split(" ").filter(Boolean);
  let i = 0;
  while (i < crudas.length - 1 && TITULO.has(normalizar(crudas[i]).replace(/[^a-z]/g, ""))) i++;
  const primera = crudas[i].replace(/[.]+$/, "");
  if (!PALABRA_NOMBRE.test(primera)) return null;
  // Una sola letra («J», «J.») o dos («JM»): no es un nombre.
  if ([...primera.replace(/['’-]/g, "")].length < 3) return null;
  if (primera.length > 20) return null;
  const norm = normalizar(primera).replace(/[^a-z]/g, "");
  if (APODO.has(norm) || EMPRESA.has(norm) || TITULO.has(norm)) return null;
  // Todo consonantes («Xkdj», «Brr»): no es un nombre.
  if (!/[aeiouy]/.test(norm)) return null;
  return capitalizar(primera);
}

/** «Buen día» hasta las 12:59, «Buenas tardes» hasta las 19:59 y «Buenas noches» el resto,
 *  en hora de Buenos Aires (pedido de JS, 16/10). */
export function saludoDelMomento(ahora: Date = new Date()): string {
  const h = Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", timeZone: "America/Argentina/Buenos_Aires" }).format(ahora));
  if (h >= 5 && h < 13) return "Buen día";
  if (h >= 13 && h < 20) return "Buenas tardes";
  return "Buenas noches";
}

/** El saludo de la charla nueva. Lo manda el servidor, una sola vez:
 *  «¡Buen día Carlos! Acá Sofía, asistente digital de Andamios Buenos Aires. Contame…». */
export function saludoInicial(perfil: string | null | undefined, ahora: Date = new Date()): string {
  const nombre = nombreParaSaludo(perfil);
  const momento = saludoDelMomento(ahora);
  return nombre ? `¡${momento} ${nombre}! ${CUERPO}` : `¡${momento}! ${CUERPO}`;
}

/**
 * ¿El mensaje es sólo un saludo («hola», «buenas tardes», «buen día!!»)? Entonces el saludo de
 * Sofía alcanza («Contame en qué te puedo ayudar») y no se le pregunta nada al modelo.
 */
export function esSoloSaludo(texto: string | null | undefined): boolean {
  const n = normalizar(texto ?? "").replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
  if (!n) return false;
  const SALUDOS = /^(?:(?:hola|holis|ola|buenas|buen dia|buenos dias|buenas tardes|buenas noches|que tal|como va|como estas|como esta|hey|alo|saludos|buenas buenas)\s*)+(?:como (?:va|estas|esta|andas|anda))?$/;
  return SALUDOS.test(n);
}

/** Seguridad en una obra armada (§6, decisión 21): lo manda el servidor, no la IA. */
export function textoSeguridad(telefonoGuardia: string | null | undefined): string {
  const tel = telefonoGuardia?.trim();
  return tel
    ? `Gracias por avisar. Ya le pasé el aviso al equipo de obra. Si hay riesgo para alguien ahora, llamá al ${tel}.`
    : "Gracias por avisar. Ya le pasé el aviso al equipo de obra. Si hay riesgo para alguien ahora, alejate de la estructura y llamá al 911.";
}

/** Error técnico (§6): nunca se reintenta en silencio delante del cliente. */
export const TEXTO_ERROR = "Perdón, se me complicó responderte. En un rato te escribe una persona del equipo por acá.";

/** Pasa a una persona sin decir por qué (tope de gasto, texto bloqueado, la IA se negó). */
export const TEXTO_PASO_A_PERSONA = "Gracias. En un rato te sigue una persona del equipo por acá.";
