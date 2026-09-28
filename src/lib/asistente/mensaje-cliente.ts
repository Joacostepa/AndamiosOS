// El mensaje de WhatsApp que el vendedor le manda al cliente junto con el PDF final: plantilla
// de la casa, dirigida a la persona por su nombre de pila y con la obra.
//
// El nombre lo elige el asistente y no una regla sobre la razón social: en Odoo los
// particulares están cargados de las dos maneras ("NAVALLES VERONICA", "Diego Izzo") y hay
// empresas con CUIT de persona física ("Trepark Aventura Aérea"). Verificado el 26/09.

export type DatosMensajeCliente = {
  nombre: string | null;
  obra: string | null;
  /** Re-emisión de una propuesta vieja: sale como "la propuesta actualizada". */
  actualizada: boolean;
  mailEnviado: boolean;
};

const EN_MINUSCULA = new Set(["de", "del", "la", "las", "los", "y", "e", "al"]);
const SIGLAS = new Set(["caba", "pb"]);

/**
 * Lo que viene todo en mayúsculas (así está en Odoo) se pasa a "Riobamba 651"; lo demás, tal
 * cual. También lo usa la lista de conversaciones para el cliente y la obra.
 */
export function prolijo(s: string): string {
  const t = s.trim().replace(/\s+/g, " ");
  if (t !== t.toUpperCase()) return t;
  return t
    .toLowerCase()
    .split(" ")
    .map((p, i) => {
      const letras = p.replace(/[^\p{L}]/gu, "");
      if (SIGLAS.has(letras)) return p.toUpperCase();
      if (i > 0 && EN_MINUSCULA.has(p)) return p;
      return p.replace(/\p{L}/u, (l) => l.toUpperCase());
    })
    .join(" ");
}

export function mensajeParaCliente(d: DatosMensajeCliente): string {
  const nombre = d.nombre?.trim() ? prolijo(d.nombre) : "";
  const obra = d.obra?.trim() ? ` para la obra de ${prolijo(d.obra)}` : "";
  const propuesta = `la propuesta${d.actualizada ? " actualizada" : ""}${obra}`;
  return [
    `Hola${nombre ? ` ${nombre}` : ""}, ¿cómo estás?`,
    d.mailEnviado
      ? `Te acabo de mandar por mail ${propuesta}, y te la dejo también por acá para que la tengas a mano.`
      : `Te comparto ${propuesta}.`,
    "Si tenés alguna duda o querés ajustar algo, escribime y lo vemos.",
    "¡Muchas gracias por tenernos en cuenta!",
  ].join("\n");
}

type Bloque = { type: string; [k: string]: unknown };

/**
 * El último mensaje que armó la herramienta mensaje_whatsapp, sacado de la historia guardada.
 * La tarjeta llega en vivo por el stream; sin esto, al recargar la página desaparecía. El texto
 * está en el resultado de la herramienta ({ ok, texto }); uno con error no cuenta.
 */
export function ultimoMensajeParaCliente(filas: { rol: string; tipo: string; contenido: unknown }[]): string | null {
  const pedidos = new Set<string>();
  for (const f of filas) {
    if (f.rol !== "assistant" || !Array.isArray(f.contenido)) continue;
    for (const b of f.contenido as Bloque[]) if (b.type === "tool_use" && b.name === "mensaje_whatsapp") pedidos.add(String(b.id));
  }
  for (let i = filas.length - 1; i >= 0; i--) {
    const f = filas[i];
    if (f.tipo !== "resultados" || !Array.isArray(f.contenido)) continue;
    for (const b of f.contenido as Bloque[]) {
      if (b.type !== "tool_result" || b.is_error || !pedidos.has(String(b.tool_use_id)) || typeof b.content !== "string") continue;
      try {
        const texto = (JSON.parse(b.content) as { texto?: unknown }).texto;
        if (typeof texto === "string" && texto.trim()) return texto;
      } catch {
        // un resultado que no es JSON no trae el mensaje
      }
    }
  }
  return null;
}
