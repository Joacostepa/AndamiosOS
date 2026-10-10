// Avisos del pañol por WhatsApp, a mano.
//
// A la persona que tiene un préstamo vencido y al capataz de una cuadrilla no se les escribe
// por Slack (no lo usan) ni por la API de WhatsApp (no hay cuenta de empresa conectada): el
// encargado abre un link wa.me con el mensaje ya escrito y aprieta "Enviar". Es el mismo
// mecanismo que usa Permisos para el cliente, y deja la última palabra en una persona.
//
// Lógica pura, sin red: la usan la bandeja (servidor) y los tests.

/**
 * Un teléfono de Legajos → el número que entiende wa.me (549 + característica + número).
 *
 * En `personal.telefono` hay de todo: "11 5555-1234", "011 15 5555-1234", "+54 9 11…",
 * "0221 15 456-7890". Para un celular argentino WhatsApp quiere 54, un 9, y los 10 dígitos
 * del número nacional sin el 0 de la característica ni el 15. Lo que no llega a 10 dígitos
 * después de limpiar no se adivina: devuelve null y el botón no aparece.
 */
export function telefonoWhatsapp(crudo: string | null | undefined): string | null {
  let d = (crudo ?? "").replace(/\D/g, "");
  if (!d) return null;
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("54")) d = d.slice(2);
  if (d.startsWith("9") && d.length === 11) d = d.slice(1);
  if (d.startsWith("0")) d = d.slice(1);
  if (d.length === 12) d = sinQuince(d) ?? d;
  return d.length === 10 ? `549${d}` : null;
}

/**
 * Saca el 15 de "característica + 15 + número". La característica tiene 2 a 4 dígitos
 * (11, 221, 2944) y se prueba de la más corta: en Buenos Aires casi todos son 11.
 */
function sinQuince(d: string): string | null {
  for (const largo of [2, 3, 4]) {
    if (d.slice(largo, largo + 2) === "15") return d.slice(0, largo) + d.slice(largo + 2);
  }
  return null;
}

export function linkWhatsapp(telefono: string | null | undefined, texto: string): string | null {
  const numero = telefonoWhatsapp(telefono);
  return numero ? `https://wa.me/${numero}?text=${encodeURIComponent(texto)}` : null;
}

/** "2026-10-06" → "06/10". */
export function fechaCorta(iso: string): string {
  const [, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}`;
}

const primerNombre = (nombre: string) => nombre.trim().split(/\s+/)[0] ?? nombre;

export function mensajePrestamoVencido(p: { nombre: string; herramienta: string; numero: string; venceEl: string; obra?: string | null }): string {
  return (
    `Hola ${primerNombre(p.nombre)}, te escribimos del pañol de Andamios Buenos Aires. ` +
    `Figura a tu nombre ${p.herramienta} ${p.numero}${p.obra ? ` (${p.obra})` : ""}, que tenía que volver el ${fechaCorta(p.venceEl)}. ` +
    `¿La podés traer o avisarnos cuándo vuelve? Gracias.`
  );
}

/** Lo que salió con una cuadrilla marcado "vuelve hoy" y no volvió: al capataz. */
export function mensajeNoVolvio(p: { nombre: string; cuadrilla: string; herramienta: string; numero: string; dia: string; obra?: string | null }): string {
  return (
    `Hola ${primerNombre(p.nombre)}, te escribimos del pañol de Andamios Buenos Aires. ` +
    `${p.herramienta} ${p.numero} salió el ${fechaCorta(p.dia)} con la ${p.cuadrilla}${p.obra ? ` (${p.obra})` : ""} para volver en el día, y no volvió. ` +
    `¿La pueden traer o avisarnos dónde está? Gracias.`
  );
}

export function mensajeFaltante(p: { nombre: string; cuadrilla?: string | null; cosas: string[] }): string {
  const lista = p.cosas.length === 1 ? p.cosas[0] : p.cosas.map((c) => `\n• ${c}`).join("");
  return (
    `Hola ${primerNombre(p.nombre)}, te escribimos del pañol de Andamios Buenos Aires. ` +
    `En el control${p.cuadrilla ? ` de la ${p.cuadrilla}` : ""} no apareció: ${lista}` +
    `${p.cosas.length === 1 ? ". " : "\n"}¿Lo tienen ustedes? Si aparece, traelo al pañol. Gracias.`
  );
}

export function mensajeInspeccion(p: { nombre: string; herramienta: string; numero: string; proxima: string; vencida: boolean }): string {
  const cuando = p.vencida
    ? `tiene la inspección de seguridad vencida desde el ${fechaCorta(p.proxima)}: NO LA USEN`
    : `tiene la inspección de seguridad hasta el ${fechaCorta(p.proxima)}`;
  return (
    `Hola ${primerNombre(p.nombre)}, te escribimos del pañol de Andamios Buenos Aires. ` +
    `${p.herramienta} ${p.numero}, que está con ustedes, ${cuando}. ` +
    `Traela al pañol${p.vencida ? "" : " antes de esa fecha"} para inspeccionarla y te damos otra al día. Gracias.`
  );
}
