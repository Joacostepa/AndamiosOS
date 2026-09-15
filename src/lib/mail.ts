import nodemailer from "nodemailer";

// Correo saliente de la app.
//
// SALE DE UNA CASILLA DE GOOGLE WORKSPACE POR SMTP con contraseña de aplicación: hoy
// js@andamiosbuenosaires.com.ar (decidido 2026-09-14). La casilla es configuración, no
// código: mudarla a una propia es cambiar PERMISOS_MAIL y PERMISOS_MAIL_CLAVE en Vercel.
//
// Sólo manda. La app no lee casillas: lo que antes volvía por mail (la póliza de Segucom)
// ahora se sube en un portal.

export function mailConfigurado(): boolean {
  return !!(process.env.PERMISOS_MAIL && process.env.PERMISOS_MAIL_CLAVE);
}

/**
 * `responderA`: a quién van las respuestas (Reply-To). En los permisos es SIEMPRE el vendedor de
 * la orden (JS, 2026-09-15): la casilla que manda sólo manda.
 */
export async function enviarMail(m: { para: string; cc?: string[]; responderA?: string[]; asunto: string; texto: string }): Promise<void> {
  const user = process.env.PERMISOS_MAIL;
  const pass = process.env.PERMISOS_MAIL_CLAVE;
  if (!user || !pass) throw new Error("Falta configurar PERMISOS_MAIL y PERMISOS_MAIL_CLAVE");

  const transporte = nodemailer.createTransport({ host: "smtp.gmail.com", port: 465, secure: true, auth: { user, pass } });
  await transporte.sendMail({
    from: user,
    to: m.para,
    cc: m.cc?.length ? m.cc : undefined,
    replyTo: m.responderA?.length ? m.responderA : undefined,
    subject: m.asunto,
    text: m.texto,
  });
}
