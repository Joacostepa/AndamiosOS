// Cómo se ve la hoja mientras un toque viaja: lo tocado ya se muestra hecho (el chofer en
// doble fila no espera a la red). Cuando el servidor contesta, la vista nueva lo reemplaza.
// Los que esperan señal (`cola`) NO se aplican acá: se muestran aparte, "se manda cuando
// vuelva la señal" (maqueta: S.ui.pend).

import { hm, minutosDesde } from "@/lib/hoja-dia/estado";
import type { VistaPublica } from "@/lib/hoja-dia/vista";
import type { Pendiente } from "./tipos";

export const horaDe = (fecha: string, at: string | number) => hm(minutosDesde(fecha, at));

export function aplicarPendientes(vista: VistaPublica, pendientes: Pendiente[]): VistaPublica {
  if (vista.situacion !== "ok" || !pendientes.length) return vista;
  let v = vista;
  for (const p of pendientes) {
    if (p.estado !== "enviando") continue;
    const hora = horaDe(v.fecha, p.at);
    const t = p.toque;
    if (t.accion === "recibido" || t.accion === "entendido") {
      const entendido = t.accion === "entendido" || !!v.cambio;
      v = v.rol === "a_cargo"
        ? { ...v, cambio: null, recibido: { hora, entendido }, gente: v.gente.map((g) => ({ ...g, nuevo: false })) }
        : { ...v, cambio: null, recibido: { hora, entendido }, viajes: v.viajes.map((x) => ({ ...x, nuevo: false })) };
    } else if (v.rol === "chofer" && "viajeId" in t) {
      const viajeId = t.viajeId;
      v = {
        ...v,
        viajes: v.viajes.map((x) => {
          if (x.id !== viajeId) return x;
          if (t.accion === "hecho") return { ...x, estado: "hecho" as const, hechoHora: hora };
          if (t.accion === "no_pude") return { ...x, estado: "no_pudo" as const, hechoHora: hora, motivo: t.motivo };
          return { ...x, estado: "planeado" as const, hechoHora: null, motivo: null };
        }),
      };
    }
  }
  if (v.rol === "chofer" && v !== vista) v = { ...v, ahoraId: v.viajes.find((x) => x.estado === "planeado")?.id ?? null };
  return v;
}

/** `tel:` sin espacios ni guiones. */
export const telHref = (t: string) => `tel:${t.replace(/[^\d+]/g, "")}`;

/** "El martes 13 la Cuadrilla 3 la tiene Hepper. Si es un error, llamá a Juan Agustín." → título y bajada. */
export function partirTexto(texto: string): { titulo: string; bajada: string | null } {
  const frases = texto.split(/(?<=\.)\s+/);
  if (frases.length < 2) return { titulo: texto, bajada: null };
  return { titulo: frases.slice(0, -1).join(" "), bajada: frases.at(-1)! };
}
