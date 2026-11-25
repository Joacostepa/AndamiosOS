// A nombre de quién va el presupuesto en Odoo. PURO.
//
// Desde el 19/11 Tomás pregunta el nombre una sola vez y, si el cliente no lo da, el presupuesto
// sale igual; pero Odoo no da de alta un cliente sin nombre y la aprobación fallaba después del OK
// (JS, 25/11: un alquiler no salió en cuatro días). Sin nombre, va el teléfono como nombre
// provisorio y la tarjeta lo avisa antes de aprobar.

export type NombreCliente = { nombre: string; provisorio: boolean };

export function nombreDelCliente(c: {
  ficha: { nombre?: string | null; contacto?: string | null };
  nombre_perfil: string | null;
  telefono: string;
}): NombreCliente {
  // El contacto (19/11) antes que el perfil: «Cerrajería» no es el nombre del cliente.
  const n = c.ficha.nombre?.trim() || c.ficha.contacto?.trim() || c.nombre_perfil?.trim();
  return n ? { nombre: n, provisorio: false } : { nombre: `Cliente WhatsApp +${c.telefono.replace(/\D/g, "")}`, provisorio: true };
}

export const AVISO_NOMBRE_PROVISORIO = "el cliente no dio su nombre: se dio de alta en Odoo con el teléfono como nombre; cambialo cuando lo sepas";
