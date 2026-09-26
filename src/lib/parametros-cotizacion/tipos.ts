// Tipos y catálogos de Parámetros de cotización. Compartidos por servidor y pantalla.

export type TipoParametro = "monto" | "porcentaje" | "rango" | "factor" | "numero" | "texto";

export type Parametro = {
  clave: string;
  grupo: string;
  etiqueta: string;
  descripcion: string | null;
  tipo: TipoParametro;
  unidad: string | null;
  valor: number | null;
  valor_min: number | null;
  valor_max: number | null;
  texto: string | null;
  vigente_desde: string | null;
  orden: number;
  updated_at: string;
};

/** El orden y el nombre de los grupos, como se muestran. Un grupo nuevo en la base sin
 *  entrada acá se muestra igual, al final, con su clave como título. */
export const GRUPOS: readonly { id: string; titulo: string; descripcion: string }[] = [
  { id: "generales", titulo: "Reglas generales", descripcion: "IVA, validez, mínimos y renovaciones." },
  { id: "bandejas", titulo: "Bandejas y pantallas", descripcion: "Por metro lineal, primer mes todo incluido." },
  { id: "fachadas", titulo: "Fachadas", descripcion: "Por m² (desarrollo × altura), primer mes todo incluido." },
  { id: "alquiler", titulo: "Alquiler sin montaje", descripcion: "Sobre la lista de alquiler vigente." },
  { id: "venta", titulo: "Venta de material", descripcion: "Opciones de amortización: siempre se pregunta." },
  { id: "complementarios", titulo: "Ítems complementarios", descripcion: "Gestoría, ingeniería, S&H, fletes, media sombra." },
  { id: "mano_obra", titulo: "Mano de obra", descripcion: "Jornada-cuadrilla, recargos y productividad por altura." },
  { id: "viaticos", titulo: "Fuera de radio", descripcion: "Viajes, alojamiento y comida." },
  { id: "asistente", titulo: "Asistente", descripcion: "Modelo, esfuerzo y tope de uso." },
  { id: "odoo", titulo: "Odoo (técnico)", descripcion: "Ids fijos con los que se arma la orden. Sólo cambian si cambian en Odoo." },
];

export type ProductoOdoo = {
  clave: string;
  product_id: number;
  nombre: string;
  unidad: string | null;
  is_rental: boolean;
  unica_vez: boolean;
  uso: string | null;
  activo: boolean;
  verificado_at: string | null;
  verificado_ok: boolean | null;
  verificado_nombre: string | null;
};

export type CambioParametro = {
  id: number;
  clave: string;
  antes: Record<string, unknown> | null;
  despues: Record<string, unknown> | null;
  motivo: string;
  created_at: string;
  autor: string | null;
};

export type VersionCriterio = {
  version: number;
  notas: string | null;
  vigente: boolean;
  created_at: string;
  autor: string | null;
};

export type ListaAlquiler = {
  id: string;
  nombre: string;
  vigente_desde: string | null;
  vigente: boolean;
  origen: string | null;
  notas: string | null;
  created_at: string;
};

export type PiezaAlquiler = { codigo: string; descripcion: string; precio: number };

/** Tipos de sistema para la biblioteca de renders (los que ofrece el asistente). */
export const TIPOS_RENDER = {
  fachada: "Estructura de fachada",
  bandeja: "Bandeja / pantalla de protección",
  torre: "Torre multidireccional",
  apuntalamiento: "Apuntalamiento",
  plataforma: "Plataforma",
  evento: "Evento (tribuna, escenario)",
  otro: "Otro",
} as const;
export type TipoRender = keyof typeof TIPOS_RENDER;

export type Render = {
  id: string;
  tipo: TipoRender | string;
  nombre: string;
  path: string;
  por_defecto: boolean;
  url: string | null;
};

/** "$ 140.000", "35 %", "175.000 – 210.000 $/m.l.", "1,15 x" — para leer, no para calcular. */
export function mostrarValor(p: Pick<Parametro, "tipo" | "valor" | "valor_min" | "valor_max" | "texto" | "unidad">): string {
  const n = (v: number | null, dec = 0) =>
    v === null ? "—" : v.toLocaleString("es-AR", { minimumFractionDigits: dec, maximumFractionDigits: Math.max(dec, 2) });
  switch (p.tipo) {
    case "texto":
      return p.texto?.trim() || "—";
    case "rango":
      return `${n(p.valor_min)} – ${n(p.valor_max)}${p.unidad ? ` ${p.unidad}` : ""}`;
    case "porcentaje":
      return `${n(p.valor)} ${p.unidad && p.unidad !== "%" ? p.unidad : "%"}`;
    case "factor":
      return `${n(p.valor, 2)} x`;
    case "monto":
      return p.unidad && p.unidad !== "$" ? `$ ${n(p.valor)} ${p.unidad.replace(/^\$/, "")}`.trim() : `$ ${n(p.valor)}`;
    default:
      return `${n(p.valor)}${p.unidad ? ` ${p.unidad}` : ""}`;
  }
}
