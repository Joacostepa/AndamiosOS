// Ciudad Armada: la lógica de los paneles (leyenda, lista, Para decidir, contadores,
// línea de tiempo). Funciones puras, sin React ni fechas implícitas: `hoy` entra como
// parámetro para que los tests no dependan del reloj.
//
// Portado de la maqueta aprobada (docs/mapa-obras/maqueta/ciudad-armada.html: catCalle,
// presentAt, decisiones, lineCalle, renderKpis). Los textos son los de la maqueta: el
// dueño ya los vio.
//
// Imports relativos con extensión: los tests corren con el runner de node, sin alias `@/`.

import type { CategoriaMapa, ObraMapa, PuntoCurva, TipoTrabajo } from "./tipos.ts";
import { COLOR_CATEGORIA } from "./colores.ts";
import { normalizar } from "../tablero/titulo.ts";

export { COLOR_CATEGORIA };

export type Vista = "calle" | "historico";

/** La fecha de la importación: un armado "el 24/03/2026" no es la fecha real. */
export const FECHA_IMPORTACION = "2026-03-24";

/** Leyenda de cada vista, en el orden de la maqueta. */
export const LEYENDA: Record<Vista, { categoria: CategoriaMapa; etiqueta: string }[]> = {
  calle: [
    { categoria: "reciente", etiqueta: "≤ 30 días" },
    { categoria: "media", etiqueta: "31–90 días" },
    { categoria: "larga", etiqueta: "Más de 90 días" },
    { categoria: "importacion", etiqueta: "Desde la importación (24/03)" },
    { categoria: "sinFecha", etiqueta: "Sin fecha" },
    { categoria: "pendiente", etiqueta: "Pendiente de desarme" },
  ],
  historico: [
    { categoria: "sigue", etiqueta: "Hoy sigue en la calle" },
    { categoria: "desarmada", etiqueta: "Ya se desarmó" },
  ],
};

export const TIPO_TEXTO: Record<TipoTrabajo, string> = {
  pantalla_proteccion: "Pantalla de protección",
  estructura_pantalla: "Estructura + pantalla",
  estructura_sin_pantalla: "Estructura sin pantalla",
  torre: "Torre",
  plataforma: "Plataforma",
  sercha: "Sercha",
  apuntalamiento_vertical: "Apuntalamiento",
};

// ─── Fechas y números ────────────────────────────────────────────────────────

/** YYYY-MM-DD en Buenos Aires. */
export function fechaBA(ahora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(ahora);
}

export function diasEntre(desde: string, hasta: string): number {
  const a = Date.parse(desde.slice(0, 10) + "T00:00:00Z");
  const b = Date.parse(hasta.slice(0, 10) + "T00:00:00Z");
  return Math.round((b - a) / 86_400_000);
}

/** "12/10/2026"; "—" si no hay fecha. */
export function fmtFecha(f: string | null | undefined): string {
  return f ? `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}` : "—";
}

/** "12/10" */
export function fmtDiaMes(f: string | null | undefined): string {
  return f ? `${f.slice(8, 10)}/${f.slice(5, 7)}` : "—";
}

/** Metros con hasta dos decimales y coma: "1,25". */
export function fmtMetros(n: number): string {
  return (Math.round(n * 100) / 100).toLocaleString("es-AR");
}

export function fmtEntero(n: number): string {
  return Math.round(n).toLocaleString("es-AR");
}

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];
const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** "octubre 2026" */
export function mesLargo(f: string): string {
  return `${MESES[Number(f.slice(5, 7)) - 1]} ${f.slice(0, 4)}`;
}

export function mesCorto(f: string): string {
  return MESES_CORTOS[Number(f.slice(5, 7)) - 1];
}

// ─── Categoría, ubicación y presencia ────────────────────────────────────────

/** Se puede dibujar: tiene coordenadas y no cayó lejos del AMBA. */
export function tieneUbicacion(o: ObraMapa): boolean {
  return o.lat != null && o.lng != null && o.ubicacion !== "lejos" && o.ubicacion !== "sin_ubicacion";
}

/** Categoría de "En la calle": la antigüedad, salvo pendientes, sin fecha e importación. */
export function categoriaCalle(o: ObraMapa): CategoriaMapa {
  if (o.estado === "pendiente_desarme") return "pendiente";
  if (!o.fechaArmado || o.diasArmado == null) return "sinFecha";
  if (o.fechaDeImportacion) return "importacion";
  if (o.diasArmado <= 30) return "reciente";
  if (o.diasArmado <= 90) return "media";
  return "larga";
}

/**
 * Categoría de color de una obra en una vista. En el histórico el color no depende de la
 * fecha elegida sino de cómo está HOY: la que sigue en la calle o la que ya se desarmó.
 * `fechaHistorico` queda en la firma para cuando haga falta distinguir algo por fecha.
 */
export function categoriaDe(o: ObraMapa, vista: Vista, fechaHistorico?: string | null): CategoriaMapa {
  void fechaHistorico;
  if (vista === "historico") return o.estado === "desarmada" ? "desarmada" : "sigue";
  return categoriaCalle(o);
}

/** Estaba armada ese día: se armó antes y (si se desarmó) se desarmó después. */
export function presenteEn(o: ObraMapa, fecha: string): boolean {
  if (!o.fechaArmado || o.fechaArmado > fecha) return false;
  if (o.estado === "desarmada") return !!o.fechaDesarme && o.fechaDesarme > fecha;
  return true;
}

/** Segunda línea de la etiqueta del mapa: "28 días armada · pantalla". */
export function subtituloDe(o: ObraMapa): string {
  let s: string;
  if (o.estado === "desarmada") s = `desarmada ${fmtFecha(o.fechaDesarme)}`;
  else if (o.estado === "pendiente_desarme") s = "pendiente de desarme";
  else if (o.diasArmado != null)
    s = `${o.diasArmado} días armada${o.fechaDeImportacion ? " (desde la importación)" : ""}`;
  else s = "sin fecha";
  if (o.tipo === "pantalla_proteccion") s += " · pantalla";
  if (o.ubicacion === "sin_altura") s += " · sin altura";
  return s;
}

/** Línea de la lista en "En la calle" (sin las etiquetas, que las dibuja el componente). */
export function lineaCalle(o: ObraMapa): string {
  const partes: string[] = [];
  if (o.estado === "pendiente_desarme") partes.push("pendiente de desarme");
  else if (o.diasArmado != null) partes.push(`${o.diasArmado} días${o.fechaDeImportacion ? " (importación)" : ""}`);
  partes.push(
    o.tipo === "pantalla_proteccion" ? `pantalla ${fmtMetros(o.medidas.largo)} m` : `${fmtMetros(o.medidas.largo)} m`,
  );
  return partes.join(" · ");
}

/** Línea de la lista en el histórico: "24/03 → 10/09 · 170 días". */
export function lineaHistorico(o: ObraMapa): string {
  if (o.fechaArmado && o.fechaDesarme)
    return `${fmtDiaMes(o.fechaArmado)} → ${fmtDiaMes(o.fechaDesarme)} · ${diasEntre(o.fechaArmado, o.fechaDesarme)} días`;
  if (o.fechaDesarme) return `desarmada ${fmtFecha(o.fechaDesarme)}`;
  return "sin fechas";
}

// ─── Búsqueda ────────────────────────────────────────────────────────────────

/** Texto donde busca el buscador: dirección, la corta, la referencia, la calle del mapa y la venta. */
export function textoBusqueda(o: ObraMapa): string {
  return normalizar(
    [o.direccion, o.direccionCorta, o.referencia, o.fachada?.calle, o.venta].filter(Boolean).join(" "),
  );
}

export function coincide(o: ObraMapa, consulta: string): boolean {
  const q = normalizar(consulta.trim());
  return !q || textoBusqueda(o).includes(q);
}

// ─── Para decidir ────────────────────────────────────────────────────────────

export type TipoDecision = "desarme" | "direccion" | "fin" | "armado";

export type Decision = {
  obra: ObraMapa;
  tipo: TipoDecision;
  /** Por qué está acá: "Pasó el fin estimado hace 12 días". */
  motivo: string;
  /** Qué hacer: "Confirmar con el cliente". */
  accion: string;
  /** Para ordenar dentro del tipo: más alto, más urgente. */
  urgencia: number;
};

/**
 * Lo que pide una decisión, máximo 6, repartido por tipo de motivo (de a uno por tipo,
 * en ronda) para que diez fines vencidos no tapen la única pendiente sin fecha.
 */
export function decisiones(obras: ObraMapa[], hoy: string, max = 6): Decision[] {
  const r: Decision[] = [];
  for (const o of obras) {
    if (o.estado === "desarmada") continue;
    if (o.estado === "pendiente_desarme") {
      r.push(
        o.desarmeProgramado
          ? {
              obra: o, tipo: "desarme", urgencia: 50,
              motivo: `Pendiente de desarme · programado ${fmtFecha(o.desarmeProgramado)}`,
              accion: "Ver en el tablero",
            }
          : {
              obra: o, tipo: "desarme", urgencia: 90,
              motivo: "Pendiente de desarme · sin fecha programada",
              accion: "Programar desarme",
            },
      );
    } else if (o.ubicacion === "sin_altura") {
      r.push({
        obra: o, tipo: "direccion", urgencia: 80,
        motivo: "La dirección no tiene calle y número: el punto es el centro de la localidad",
        accion: "Completar dirección",
      });
    } else if (o.ubicacion === "lejos") {
      r.push({
        obra: o, tipo: "direccion", urgencia: 85,
        motivo: "La ubicación cayó a más de 70 km de CABA",
        accion: "Corregir dirección",
      });
    } else if (o.vencida && o.finEstimado) {
      const d = diasEntre(o.finEstimado, hoy);
      r.push({
        obra: o, tipo: "fin", urgencia: 40 + d / 10,
        motivo: `Pasó el fin estimado hace ${d} días`,
        accion: "Confirmar con el cliente",
      });
    } else if (!o.queEstaArmado) {
      r.push({
        obra: o, tipo: "armado", urgencia: 20,
        motivo: "No sabemos qué hay armado",
        accion: "Pedir lo armado al capataz",
      });
    }
  }
  r.sort((a, b) => b.urgencia - a.urgencia);
  const porTipo = new Map<TipoDecision, Decision[]>();
  for (const d of r) {
    const cola = porTipo.get(d.tipo) ?? [];
    cola.push(d);
    porTipo.set(d.tipo, cola);
  }
  const colas = [...porTipo.values()];
  const res: Decision[] = [];
  while (res.length < max && colas.some((c) => c.length)) {
    for (const c of colas) {
      if (c.length && res.length < max) res.push(c.shift()!);
    }
  }
  return res;
}

// ─── Listas ──────────────────────────────────────────────────────────────────

/** "Todas en la calle": las pendientes primero, después las de más días. */
export function ordenarCalle(obras: ObraMapa[]): ObraMapa[] {
  return obras
    .filter((o) => o.estado !== "desarmada")
    .sort(
      (a, b) =>
        Number(b.estado === "pendiente_desarme") - Number(a.estado === "pendiente_desarme") ||
        (b.diasArmado ?? 0) - (a.diasArmado ?? 0),
    );
}

/** Desarmadas agrupadas por mes de desarme, el más reciente primero. */
export function desarmadasPorMes(obras: ObraMapa[]): { mes: string; obras: ObraMapa[] }[] {
  const d = obras
    .filter((o) => o.estado === "desarmada")
    .sort((a, b) => (b.fechaDesarme ?? "").localeCompare(a.fechaDesarme ?? ""));
  const grupos: { mes: string; obras: ObraMapa[] }[] = [];
  for (const o of d) {
    const mes = o.fechaDesarme ? mesLargo(o.fechaDesarme) : "Sin fecha de desarme";
    const ultimo = grupos[grupos.length - 1];
    if (ultimo?.mes === mes) ultimo.obras.push(o);
    else grupos.push({ mes, obras: [o] });
  }
  return grupos;
}

// ─── Contadores ──────────────────────────────────────────────────────────────

export type KpisCalle = {
  vista: "calle";
  armadas: number;
  pendientes: number;
  metrosLineales: number;
  vencidas: number;
  sinUbicacion: number;
};

export type KpisHistorico = {
  vista: "historico";
  desarmadas: number;
  conUbicacion: number;
  /** Días promedio armadas, sin contar las de fecha de importación. */
  diasPromedio: number;
  enLaCalle: number;
  enLaCalleEnMapa: number;
};

export function kpis(obras: ObraMapa[], vista: "calle"): KpisCalle;
export function kpis(obras: ObraMapa[], vista: "historico", fecha: string): KpisHistorico;
export function kpis(obras: ObraMapa[], vista: Vista, fecha?: string): KpisCalle | KpisHistorico;
export function kpis(obras: ObraMapa[], vista: Vista, fecha?: string): KpisCalle | KpisHistorico {
  if (vista === "calle") {
    const calle = obras.filter((o) => o.estado !== "desarmada");
    return {
      vista,
      armadas: calle.filter((o) => o.estado === "armada").length,
      pendientes: calle.filter((o) => o.estado === "pendiente_desarme").length,
      metrosLineales: calle.reduce((s, o) => s + (o.medidas?.largo ?? 0), 0),
      vencidas: calle.filter((o) => o.vencida).length,
      sinUbicacion: calle.filter((o) => !tieneUbicacion(o)).length,
    };
  }
  const des = obras.filter((o) => o.estado === "desarmada");
  const conFechas = des.filter((o) => o.fechaArmado && o.fechaDesarme && !o.fechaDeImportacion);
  const prom = conFechas.length
    ? conFechas.reduce((s, o) => s + diasEntre(o.fechaArmado!, o.fechaDesarme!), 0) / conFechas.length
    : 0;
  const en = fecha ? obras.filter((o) => presenteEn(o, fecha)) : [];
  return {
    vista,
    desarmadas: des.length,
    conUbicacion: des.filter(tieneUbicacion).length,
    diasPromedio: Math.round(prom),
    enLaCalle: en.length,
    enLaCalleEnMapa: en.filter(tieneUbicacion).length,
  };
}

/** Cuántas hay de cada categoría (para los chips de la leyenda). */
export function conteoCategorias(obras: ObraMapa[], vista: Vista, fecha: string | null): Map<CategoriaMapa, number> {
  const base =
    vista === "calle"
      ? obras.filter((o) => o.estado !== "desarmada")
      : obras.filter((o) => fecha != null && presenteEn(o, fecha));
  const m = new Map<CategoriaMapa, number>();
  for (const o of base) {
    const c = categoriaDe(o, vista, fecha);
    m.set(c, (m.get(c) ?? 0) + 1);
  }
  return m;
}

// ─── Línea de tiempo ─────────────────────────────────────────────────────────

/** Semanas desde `desde` hasta `hasta` (incluido como último punto). */
export function semanas(desde: string, hasta: string): string[] {
  const res: string[] = [];
  let t = Date.parse(desde + "T00:00:00Z");
  const fin = Date.parse(hasta + "T00:00:00Z");
  while (t <= fin) {
    res.push(new Date(t).toISOString().slice(0, 10));
    t += 7 * 86_400_000;
  }
  if (res[res.length - 1] !== hasta) res.push(hasta);
  return res;
}

/**
 * La curva para la línea de tiempo: la del servidor si vino; si no, se calcula con las
 * obras (semanal desde la importación hasta hoy).
 */
export function curvaDe(obras: ObraMapa[], curvaServidor: PuntoCurva[] | undefined, hoy: string): PuntoCurva[] {
  if (curvaServidor && curvaServidor.length > 1) return curvaServidor;
  return semanas(FECHA_IMPORTACION, hoy).map((fecha) => ({
    fecha,
    enLaCalle: obras.filter((o) => presenteEn(o, fecha)).length,
  }));
}

/** Para el selector: si se elige una desarmada fuera de la fecha, a qué semana ir (la del medio). */
export function semanaParaVer(o: ObraMapa, fechas: string[]): number | null {
  if (!o.fechaArmado || !o.fechaDesarme || !fechas.length) return null;
  const medio = new Date((Date.parse(o.fechaArmado) + Date.parse(o.fechaDesarme)) / 2).toISOString().slice(0, 10);
  const i = fechas.findIndex((f) => f >= medio);
  return i < 0 ? fechas.length - 1 : i;
}

// ─── Modo TV ─────────────────────────────────────────────────────────────────

export type ItemTv = { obra: ObraMapa; motivo: string };

/** Lo que recorre la TV: "Para decidir" con ubicación más las tres más viejas, hasta 7. */
export function itemsTv(obras: ObraMapa[], dec: Decision[]): ItemTv[] {
  const d = dec.filter((x) => tieneUbicacion(x.obra)).map((x) => ({ obra: x.obra, motivo: x.motivo }));
  const ya = new Set(d.map((x) => x.obra.ventaId));
  const viejas = obras
    .filter((o) => o.estado === "armada" && tieneUbicacion(o) && !o.fechaDeImportacion && o.diasArmado != null && !ya.has(o.ventaId))
    .sort((a, b) => (b.diasArmado ?? 0) - (a.diasArmado ?? 0))
    .slice(0, 3)
    .map((o) => ({ obra: o, motivo: `${o.diasArmado} días armada` }));
  return [...d, ...viejas].slice(0, 7);
}

// ─── Fotos ───────────────────────────────────────────────────────────────────

/** Resumen de un grupo de fotos: cuántas, de cuántos partes (días distintos) y la última. */
export function resumenFotos(fotos: ObraMapa["fotos"]): { n: number; partes: number; ultima: string | null } {
  const fechas = fotos.map((f) => f.fecha).filter((f): f is string => !!f);
  return {
    n: fotos.length,
    partes: new Set(fechas).size,
    ultima: fechas.length ? fechas.reduce((a, b) => (b > a ? b : a)) : null,
  };
}
