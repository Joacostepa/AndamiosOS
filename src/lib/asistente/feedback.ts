// «Esto estuvo mal»: los motivos que el vendedor marca debajo de una respuesta. Los usan la
// pantalla (los chips), la ruta (lo que acepta) y la pestaña Uso (la cuenta). La base tiene el
// mismo CHECK (migración 20261012000004): si se agrega uno, va en los dos lados.

export const MOTIVOS_FEEDBACK = ["calculo", "invento", "lento", "no_entendio", "otro"] as const;
export type MotivoFeedback = (typeof MOTIVOS_FEEDBACK)[number];

export const ETIQUETA_MOTIVO: Record<MotivoFeedback, string> = {
  calculo: "Cuentas o importes",
  invento: "Inventó o supuso algo",
  lento: "Tardó mucho",
  no_entendio: "No entendió",
  otro: "Otra cosa",
};
