// Lo que el link del celular y los botones de Telegram pueden confirmar o marcar. Pura (la
// usan publico.ts y los tests).

/**
 * I2: un "Recibido" / "Entendido" vale para la versión que la persona tenía delante (la
 * del mensaje de Telegram que tocó, o la de la vista del celular). Si después se le avisó
 * un cambio, tocar el botón del mensaje viejo NO confirma el cambio que no vio. Sin
 * versión (un celular con la página vieja), vale para la actual, como antes.
 */
export function recibidoVigente(versionTocada: number | null | undefined, versionLink: number): boolean {
  return versionTocada == null || versionTocada >= versionLink;
}

export type ViajeParaMarcar = { fecha: string; estado: string; chofer_id: string | null; vehiculo_id: string | null };
export type LinkParaMarcar = { fecha: string; rol: string; personaId: string };

/**
 * I3: si el chofer puede marcar "Hecho" / "No pude" / "Deshacer" en ese viaje. Devuelve
 * null si puede, o el porqué en palabras. Sólo SUS viajes (el chofer del viaje, o el del
 * camión ese día si el viaje no lo tiene) de ESE día, y nunca uno anulado: un botón viejo
 * de Telegram no puede revivir un viaje que la oficina sacó.
 */
export function porQueNoPuedeMarcar(v: ViajeParaMarcar | null, l: LinkParaMarcar, choferDelCamion: string | null): string | null {
  if (!v || l.rol !== "chofer" || v.fecha !== l.fecha) return "Ese viaje no es tuyo.";
  const de = v.chofer_id ?? choferDelCamion;
  if (de !== l.personaId) return "Ese viaje no es tuyo.";
  if (v.estado === "anulado") return "Ese viaje lo sacó la oficina. Si tenés dudas, llamala.";
  return null;
}
