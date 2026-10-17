// El teléfono de WhatsApp como lo guarda Odoo en phone_sanitized. Puro, con tests (telefono.test.ts).
//
// WhatsApp manda «5491155551234». Odoo normaliza con el prefijo «+» y casi siempre sin el 9 de
// los celulares: en octubre de 2026, 349 de 400 partners recientes estaban como «+5411…» y 27
// como «+54911…» (crm.lead, igual). Se buscan las dos formas.

/** Las formas en que puede estar en phone_sanitized. Vacío si no parece un teléfono. */
export function variantesTelefonoOdoo(telefono: string | null | undefined): string[] {
  const d = (telefono ?? "").replace(/\D/g, "");
  if (d.length < 8) return [];
  if (d.startsWith("549")) return [`+${d}`, `+54${d.slice(3)}`];
  if (d.startsWith("54")) return [`+${d}`, `+549${d.slice(2)}`];
  return [`+${d}`];
}
