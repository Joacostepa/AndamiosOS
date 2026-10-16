// La tarjeta de aprobación y «Revisar charlas», del lado de la pantalla: lo que devuelven las
// rutas. Sólo tipos y constantes (sin base ni red): lo importan las rutas y los componentes.

import type { EstadoAprobacion, TipoAprobacion, TipoCorreccion } from "./aprobacion";
import type { Motivo } from "./facil";

export type RenglonVista = { id: string; descripcion: string; importe: number; seccion: "base" | "adicional" | "opcional"; unidad?: string };

export type ParejaVista = { tecnico: string | null; asistente: string | null };

export type TarjetaPrecio = {
  /** El mensaje exacto que le llega al cliente (con la pareja y los números del motor de hoy). */
  mensaje: string;
  renglones: RenglonVista[];
  neto: number;
  iva: number;
  total: number;
  renovacion: { pct: number; monto: number } | null;
  metros: number | null;
  /** El $/m.l. que usa el motor (la tarifa o el corregido). */
  precioMl: number | null;
  tarifaMl: number;
  /** Lo que armó Sofía; si el motor de hoy da otro, `cambioDesdeSofia`. */
  montoPropuesto: number | null;
  cambioDesdeSofia: boolean;
  /** «Por qué es fácil», con tildes y cruces (los del cliente: historial, deuda…). */
  motivos: Motivo[];
  facil: boolean;
  /** Lo que avisó el armado (render sin elegir, tope…) y lo que bloquea mandarlo. */
  problemas: string[];
  bloqueos: string[];
  pareja: (ParejaVista & { motivo: string; regla: string }) | null;
  tarifaVigenteDesde: string | null;
  /** Más de 45 días: «revisá si sigue». */
  tarifaVieja: boolean;
  /** Sin CUIT: se guarda igual en Odoo, con el aviso (regla del asistente comercial). */
  sinCuit: boolean;
};

export type TarjetaTecnico = {
  resumen: string;
  motivo: string | null;
  disponibilidad: string | null;
  /** Bandeja con los datos completos que no salió fácil: los renglones en contra de esFacil.
   *  Sólo para el equipo (Sofía recibe un motivo genérico). */
  porQueNoFacil: string[] | null;
  propuesta: (ParejaVista & { motivo: string; regla: string; requiereConfirmacion: boolean; tambienTrabajoCon: string[] }) | null;
  /** Las parejas que se pueden elegir con «Elegir otra». */
  opciones: (ParejaVista & { siguienteEnTurno: boolean; textoCliente: string | null })[];
  /** El texto fijo que le llega al cliente al confirmar (con la pareja propuesta). */
  textoCliente: string | null;
  avisarPorDefecto: boolean;
};

export type TarjetaBloqueado = {
  texto: string;
  motivo: string | null;
  hallazgos: { codigo: string; motivo: string; fragmento: string }[];
};

export type TarjetaSimple = {
  resumen: string;
  piezas: { descripcion: string; cantidad: number }[];
  dias: number | null;
  entrega: string | null;
  barrio: string | null;
  notas: string | null;
  alertas: string[];
};

export type TarjetaAprobacion = {
  id: string;
  numero: number;
  tipo: TipoAprobacion;
  carril: "facil" | "simple" | "tecnico" | null;
  estado: EstadoAprobacion;
  resumen: string | null;
  creada: string;
  decididoPor: string | null;
  decididoAt: string | null;
  error: string | null;
  correccionTipo: TipoCorreccion | null;
  motivoCorreccion: string | null;
  odooVenta: { nombre: string; url: string } | null;
  /** Quién sigue la charla después, si nadie elige otra cosa. */
  despuesPorDefecto: "sofia" | "persona";
  /** Quedó «ejecutando» más de 6 minutos (la función se cortó): se puede reintentar. */
  colgada: boolean;
  precio?: TarjetaPrecio;
  tecnico?: TarjetaTecnico;
  bloqueado?: TarjetaBloqueado;
  simple?: TarjetaSimple;
};

export type TarjetasCharla = {
  tarjetas: TarjetaAprobacion[];
  racha: { actual: number; meta: number; completa: boolean };
  /** Sofía prendida: se puede elegir que siga ella. */
  iaActiva: boolean;
};

export type CorreccionPedida = {
  tipo: TipoCorreccion;
  motivo: string;
  metros?: number;
  precioMl?: number;
  concertina?: "opcional" | "base" | "no";
  gestoria?: "opcional" | "base" | "no";
  texto?: string;
};

/** Lo que devuelve «Recalcular» al corregir: el nuevo, antes de mandar. */
export type VistaCorreccion = {
  mensaje: string;
  renglones: RenglonVista[];
  neto: number;
  total: number;
  netoAntes: number;
  bloqueos: string[];
  cortaRacha: boolean;
};

export type ResultadoDecision =
  | { ok: true; estado: EstadoAprobacion; avisos: string[]; venta?: string | null }
  | { ok: false; error: string; codigo?: "ya_decidida" | "cambio_monto" | "ventana_por_vencer" | "ventana_cerrada" | "bloqueo" | "error"; antes?: number; despues?: number };

// ── Revisar charlas ─────────────────────────────────────────────────────────────────────

export type DecisionAuditada = {
  id: string;
  numero: number;
  conversacionId: string;
  cliente: string;
  tipo: TipoAprobacion;
  carril: string | null;
  estado: EstadoAprobacion;
  resumen: string | null;
  propuesto: number | null;
  enviado: number | null;
  correccionTipo: TipoCorreccion | null;
  motivoCorreccion: string | null;
  decididoPor: string | null;
  decididoAt: string | null;
  venta: string | null;
};

export type CharlaIntervenida = {
  conversacionId: string;
  cliente: string;
  estado: string;
  personas: string[];
  intervenciones: number;
  ultima: string;
  ultimoTexto: string | null;
};

export type Auditoria = {
  racha: { actual: number; meta: number; completa: boolean; sinTocar: number; ultimoCorte: string | null };
  decisiones: DecisionAuditada[];
  intervenidas: CharlaIntervenida[];
};
