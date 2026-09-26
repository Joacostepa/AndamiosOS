// Token firmado de una sesión de voz: quién habla y en qué conversación.
//
// En la voz en vivo, el que llama a nuestro endpoint es ElevenLabs, no el navegador: no hay
// cookie de sesión. El navegador arranca la sesión de voz pasando este token (customLlmExtraBody)
// y ElevenLabs nos lo devuelve en cada pedido (elevenlabs_extra_body). Así el endpoint sabe de
// quién es la charla sin creerle a nada que venga de afuera sin firma.
//
// La clave se deriva de la service role (que ya es secreta y sólo vive en el servidor) para no
// sumar otra variable de entorno.

import { createHmac, timingSafeEqual } from "node:crypto";

type Carga = { c: string; u: string; exp: number };

function clave(): Buffer {
  const base = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base) throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY");
  return createHmac("sha256", base).update("asistente-voz:v1").digest();
}

const b64 = (b: Buffer | string) => Buffer.from(b).toString("base64url");

export function firmarSesionVoz(conversacionId: string, usuarioId: string, horas = 2): string {
  const carga: Carga = { c: conversacionId, u: usuarioId, exp: Date.now() + horas * 3_600_000 };
  const cuerpo = b64(JSON.stringify(carga));
  const firma = b64(createHmac("sha256", clave()).update(cuerpo).digest());
  return `${cuerpo}.${firma}`;
}

export function verificarSesionVoz(token: unknown): { conversacionId: string; usuarioId: string } | null {
  if (typeof token !== "string" || !token.includes(".")) return null;
  const [cuerpo, firma] = token.split(".");
  const esperada = createHmac("sha256", clave()).update(cuerpo).digest();
  const recibida = Buffer.from(firma, "base64url");
  if (recibida.length !== esperada.length || !timingSafeEqual(recibida, esperada)) return null;
  try {
    const c = JSON.parse(Buffer.from(cuerpo, "base64url").toString("utf8")) as Carga;
    if (!c.c || !c.u || c.exp < Date.now()) return null;
    return { conversacionId: c.c, usuarioId: c.u };
  } catch {
    return null;
  }
}
