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
};

export type PdfVista = { id: string; nombre: string; tipo: "preview" | "final"; url: string; version: number };

export type Evento =
  | { t: "inicio"; turnoId: string }
  | { t: "transcripcion"; texto: string }
  | { t: "texto"; d: string }
  | { t: "pensando"; on: boolean }
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
