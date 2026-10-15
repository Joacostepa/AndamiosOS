// WhatsApp: a qué bandeja va cada aviso de Meta. Puro, con tests (ruteo.test.ts).
//
// Hay DOS números en la misma app de Meta (docs/clientes/crm-propuesta.md §13):
//   · el del asistente comercial (WHATSAPP_PHONE_NUMBER_ID): le escriben los vendedores;
//   · el de clientes (WHATSAPP_CLIENTES_PHONE_NUMBER_ID): va a la bandeja de la app.
// Se rutea SIEMPRE por el `phone_number_id` del aviso, nunca por «el teléfono es de un
// vendedor»: un vendedor que le escribe al número de clientes es un cliente más.

export type Destino = "vendedores" | "clientes" | "ignorar";

export type Numeros = { vendedores?: string | null; clientes?: string | null };

export function numerosDelEntorno(env: Record<string, string | undefined> = process.env): Numeros {
  return { vendedores: env.WHATSAPP_PHONE_NUMBER_ID || null, clientes: env.WHATSAPP_CLIENTES_PHONE_NUMBER_ID || null };
}

/**
 * - El número de clientes, si está configurado, va a la bandeja.
 * - El de vendedores, como siempre. Un aviso sin `phone_number_id` también (es lo que hacía el
 *   webhook antes de que hubiera dos números).
 * - Cualquier otro número de la cuenta se ignora.
 * - Si por error las dos variables tienen el mismo id, gana vendedores: no se rompe lo que ya
 *   anda.
 */
export function destinoDeNumero(phoneNumberId: string | null | undefined, numeros: Numeros): Destino {
  const id = phoneNumberId?.trim() || null;
  if (!id) return "vendedores";
  if (numeros.vendedores && id === numeros.vendedores) return "vendedores";
  if (numeros.clientes && id === numeros.clientes) return "clientes";
  return "ignorar";
}
