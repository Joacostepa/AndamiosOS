// Normalización de texto para los escaneos del agente de clientes. Puro, con tests (en
// facil.test.ts y filtro-salida.test.ts, que son los que la usan).
//
// La usan dos escaneos que tienen que resistir lo mismo: el de las palabras del cliente
// (facil.ts: «descuentoooo», «DESCUENTO», «d e s c u e n t o») y el filtro de salida
// (filtro-salida.ts: «140 lucas», «luuucas», «x ciento»). Se compara siempre contra el texto
// normalizado, y las listas de palabras se escriben ya normalizadas (sin tildes ni letras
// dobles: ver `normalizar`).
//
// Lo que hace, en orden:
//   1. minúsculas y sin tildes («Rebajá» → «rebaja»; la ñ queda como n);
//   2. letras que reemplazan números dentro de una palabra con letras («d3scu3nt0» →
//      «descuento»). Los números solos («1234», «12,40») no se tocan;
//   3. letras sueltas separadas por espacios, puntos o guiones se juntan («d e s c u e n t o»,
//      «l.u.c.a.s» → «descuento», «lucas»);
//   4. «x» suelta es «por» («10 x ciento» → «10 por ciento»);
//   5. cualquier letra repetida queda una sola («luuucas» → «lucas», «carro» → «caro»). Por eso
//      las listas se escriben sin letras dobles («lamar», no «llamar»);
//   6. todo lo que no es letra, número, «$», «%», «/», «,» o «.» pasa a espacio, y los espacios
//      se colapsan.

const LEET: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a" };

/** «d3scu3nt0» → «descuento», pero «1234» y «12,40» quedan como están. */
function sinLeet(palabra: string): string {
  if (!/[a-z]/.test(palabra) || !/[0-9@]/.test(palabra)) return palabra;
  // «140k», «3m», «2do»: un número con una unidad pegada no es una palabra disfrazada.
  if (/^[0-9.,]+[a-z]{1,3}$/.test(palabra)) return palabra;
  return palabra.replace(/[013457@]/g, (c) => LEET[c] ?? c);
}

export function normalizar(texto: string): string {
  let t = (texto ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  // «140lucas» → «140 lucas»: un número pegado a una palabra larga son dos cosas.
  t = t.replace(/\b(\d+(?:[.,]\d+)*)([a-z]{4,})\b/g, "$1 $2");
  t = t.replace(/[a-z0-9@]+/g, sinLeet);
  // Letras sueltas separadas: al menos 4 seguidas («l u c a s», «d.e.s.c.u.e.n.t.o»).
  t = t.replace(/\b[a-z](?:[\s.\-_*·]+[a-z]\b){3,}/g, (m) => m.replace(/[^a-z]/g, ""));
  t = t.replace(/\bx\b/g, "por");
  t = t.replace(/([a-z])\1+/g, "$1");
  t = t.replace(/[^a-z0-9$%/,.\s]/g, " ");
  return t.replace(/\s+/g, " ").trim();
}

/** Una palabra o expresión de una lista, ya normalizada, como expresión regular con límites. */
export function patronPalabra(p: string): RegExp {
  const escapada = normalizar(p).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s+");
  return new RegExp(`(?:^|[^a-z0-9])(${escapada})(?![a-z0-9])`);
}

/** El primer término de la lista que aparece en el texto (ya normalizado), o null. */
export function primeraCoincidencia(normalizado: string, terminos: readonly (string | RegExp)[]): string | null {
  for (const t of terminos) {
    const re = typeof t === "string" ? patronPalabra(t) : t;
    const m = re.exec(normalizado);
    if (m) return (m[1] ?? m[0]).trim();
  }
  return null;
}
