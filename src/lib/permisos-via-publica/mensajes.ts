// Los textos que se le mandan al cliente para recordarle lo que falta: por mail (portal.ts) y el
// que se copia para WhatsApp (ficha). Puro: lo usan el servidor y la pantalla.

export type PendienteCliente = { nombre: string; motivo?: string | null };

export function textoRecordatorio(d: {
  cliente: string | null;
  direccion: string;
  sinDueno: boolean;
  faltan: PendienteCliente[];
  aCorregir: PendienteCliente[];
  link: string | null;
}): string {
  const hola = `Hola${d.cliente ? ` ${d.cliente}` : ""}!`;
  if (d.sinDueno) {
    return [
      `${hola} Para tramitar el permiso del andamio de ${d.direccion} necesitamos los datos y documentos del dueño del lote.`,
      `Cargalos en este link, no hace falta crear una cuenta: ${d.link ?? "[link del portal]"}`,
    ].join(" ");
  }
  const partes: string[] = [];
  if (d.aCorregir.length) partes.push(`Hay que corregir: ${d.aCorregir.map((x) => `${x.nombre}${x.motivo ? ` (${x.motivo.replace(/\.$/, "")})` : ""}`).join("; ")}.`);
  if (d.faltan.length) partes.push(`Falta subir: ${d.faltan.map((x) => x.nombre).join(", ")}.`);
  return [
    `${hola} Para presentar el permiso del andamio de ${d.direccion} nos falta poco.`,
    ...partes,
    `Lo podés hacer en el mismo link: ${d.link ?? "[link del portal]"}`,
  ].join(" ");
}
