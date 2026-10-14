// Lo que viaja del servidor al navegador mientras el asistente responde (SSE sobre un POST).
// Compartido por la ruta (que lo emite) y el hook de la pantalla (que lo lee).

import type { DatosBorrador, ResultadoBorrador } from "./borrador";

export type BorradorVista = {
  id: string;
  version: number;
  estado: "en_curso" | "en_odoo" | "enviado" | "descartado";
  datos: DatosBorrador;
  resultado: ResultadoBorrador | null;
  odooVentaId: number | null;
  odooVentaNombre: string | null;
  odooVentaUrl: string | null;
  origenVentaId: number | null;
};

export type AccionVista = {
  id: string;
  numero: number;
  tipo: string;
  estado: string;
  nivel: "simple" | "explicita";
  resumen: string;
  resultado: Record<string, unknown> | null;
  error: string | null;
  venceAt: string;
  /**
   * La acción quedó en error o en duda y se puede volver a ejecutar tal cual: la tarjeta muestra
   * «Reintentar», que hace POST /api/comercial/asistente/acciones/:id con
   * { decision: "reintentar" } (SSE, como Confirmar). El servidor vuelve a mirar si se puede.
   */
  reintentable: boolean;
};

export type PdfVista = { id: string; nombre: string; tipo: "preview" | "final"; url: string; version: number };

export type Evento =
  | { t: "inicio"; turnoId: string }
  | { t: "transcripcion"; texto: string }
  | { t: "texto"; d: string }
  | { t: "pensando"; on: boolean }
  /**
   * Lo que el modelo anota entre herramientas («Ya tengo el frente; ahora calculo la bandeja»).
   * Una o dos oraciones, para mostrar como el paso en curso mientras espera. Sólo en los modelos
   * que lo dan (Opus 5.5 y parecidos); puede no llegar ninguno. No es parte de la respuesta: no
   * se guarda como texto ni se dice en voz.
   */
  | { t: "progreso"; texto: string }
  | { t: "herramienta"; id: string; nombre: string; etiqueta: string; estado: "inicio" | "ok" | "error"; resumen?: string }
  | { t: "borrador"; borrador: BorradorVista }
  | { t: "accion"; accion: AccionVista }
  | { t: "pdf"; pdf: PdfVista }
  | { t: "whatsapp"; texto: string }
  | { t: "aviso"; nivel: "info" | "advertencia"; texto: string }
  | { t: "continuar" }
  | { t: "fin"; stop: string; costoUsd?: number }
  | { t: "error"; codigo: "ocupado" | "cuenta_ia" | "odoo" | "rechazo" | "tope" | "interno"; mensaje: string };

/** Una línea SSE. */
export function sse(e: Evento): string {
  return `data: ${JSON.stringify(e)}\n\n`;
}
