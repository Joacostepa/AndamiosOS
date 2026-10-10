// "¿Qué hay afuera?": lo que no está en el pañol, agrupado por quién lo tiene.
//
// Sale de dos fuentes que ya mantiene el trigger y nada más: las herramientas numeradas
// (`pan_unidades.lugar`) y los saldos a granel (`pan_saldos` en un lugar con titular). Los
// saldos de las herramientas numeradas NO se usan: el trigger también los suma, y contarlos
// dos veces mostraría cada amoladora repetida.
//
// LAS REGLAS QUE NO SON OBVIAS:
//   - "Vencida": un préstamo a una persona pasado su fecha, o lo que salió con una cuadrilla
//     marcado "vuelve hoy" (la base le pone vence_el = ese día) y no volvió. Lo demás de una
//     cuadrilla no tiene fecha: se queda con ella de obra en obra (docs §1). Misma regla que
//     la bandeja.
//   - Un faltante sigue apareciendo con quien lo tenía (`faltante_de`): es el capataz quien
//     responde. Los faltantes a granel pierden el titular en el saldo (el lugar es sólo
//     "faltante"), así que van a un grupo propio, igual que lo que faltó en un conteo.
//   - "No usar" = inspección de seguridad vencida mientras está afuera (noApta).
// Lógica pura (afuera.test.ts).

import type { Articulo, Saldo, Unidad, Variante } from "./tipos.ts";
import { conTitular, diasEntre, leerLugar, noApta, prestamoVencido } from "./estado.ts";

// Lo mínimo de personas y cuadrillas (el hook trae más; acá no hace falta).
export type PersonaRef = {
  tipo: "persona" | "externa";
  id: string;
  nombre: string;
  apellido: string;
  telefono: string | null;
};
export type CuadrillaRef = { id: string; nombre: string; responsableId: string | null };

export type ClaseGrupo = "cuadrilla" | "persona" | "obra" | "faltante";

export type ItemAfuera = {
  /** Estable para React y para recordar qué se tildó: "u:<unidad>" o "s:<artículo>:<talle>:<lugar>". */
  clave: string;
  clase: "maquina" | "granel";
  articuloId: string;
  varianteId: string | null;
  unidadId: string | null;
  numero: string | null;
  nombre: string;
  familia: string;
  seguridadCritica: boolean;
  cantidad: number;
  unidad: string;
  /** Dónde figura hoy: el titular, o "faltante". Es el `desde` de un "Pasar a…". */
  lugar: string;
  desdeAt: string | null;
  odooOtId: number | null;
  /** Préstamos a personas, y lo de cuadrilla que salió con "vuelve hoy". */
  venceEl: string | null;
  /** Cuadrilla con "vuelve hoy": la señal dice "No volvió hoy" y el aviso va al capataz. */
  vueltaDelDia: boolean;
  vencida: boolean;
  diasVencida: number;
  noUsar: boolean;
  /** Seguridad crítica: la próxima inspección (para el aviso de "No usar"). */
  proximaInspeccion: string | null;
  faltante: boolean;
  diasFaltante: number;
};

export type GrupoAfuera = {
  /** El titular ("c:<id>", "p:<id>", "x:<id>", "o:<ot>") o "faltante". */
  lugar: string;
  clase: ClaseGrupo;
  titulo: string;
  /** Cuadrillas: quién responde. */
  capataz: { id: string; nombre: string; telefono: string | null } | null;
  /** Personas: a quién avisarle. */
  telefono: string | null;
  maquinas: ItemAfuera[];
  granel: ItemAfuera[];
  /** Las OT en las que está lo de este grupo (sin repetir). */
  obras: number[];
  vencidas: number;
  faltantes: number;
  noUsar: number;
};

export type FiltroAfuera = "todo" | "cuadrillas" | "personas" | "obras" | "vencidas" | "faltantes";

const nombrePersona = (p: { nombre: string; apellido: string }) => `${p.nombre} ${p.apellido}`.trim();

/** "Diego Acosta", "Cuadrilla 3", "OT 4812", "Faltante"… para cualquier lugar. */
export function nombreDeLugar(
  lugar: string,
  personas: readonly PersonaRef[],
  cuadrillas: readonly CuadrillaRef[],
  ubicaciones: readonly { id: string; nombre: string }[] = [],
): string {
  const l = leerLugar(lugar);
  if (!l) return lugar;
  switch (l.clase) {
    case "persona":
    case "externa": {
      const p = personas.find((x) => x.id === l.id && x.tipo === l.clase);
      return p ? nombrePersona(p) : "una persona que ya no figura";
    }
    case "cuadrilla":
      return cuadrillas.find((c) => c.id === l.id)?.nombre ?? "una cuadrilla que ya no figura";
    case "obra":
      return `OT ${l.ot}`;
    case "ubicacion":
      return ubicaciones.find((u) => u.id === l.id)?.nombre ?? "el pañol";
    case "taller":
      return "Taller externo";
    case "faltante":
      return "Faltante";
    case "perdida":
      return "Perdida";
    case "baja":
      return "De baja";
    case "fuente":
      return l.nombre;
  }
}

function claseDeLugar(lugar: string): ClaseGrupo | null {
  const l = leerLugar(lugar);
  if (!l) return null;
  if (l.clase === "persona" || l.clase === "externa") return "persona";
  if (l.clase === "cuadrilla") return "cuadrilla";
  if (l.clase === "obra") return "obra";
  return null;
}

export type FuentesAfuera = {
  articulos: readonly Articulo[];
  variantes: readonly Variante[];
  unidades: readonly Unidad[];
  saldos: readonly Saldo[];
  personas: readonly PersonaRef[];
  cuadrillas: readonly CuadrillaRef[];
};

export function agruparAfuera(f: FuentesAfuera, hoy: string): GrupoAfuera[] {
  const art = new Map(f.articulos.map((a) => [a.id, a]));
  const talle = new Map(f.variantes.map((v) => [v.id, v.nombre]));
  const grupos = new Map<string, GrupoAfuera>();

  const grupo = (lugar: string): GrupoAfuera => {
    let g = grupos.get(lugar);
    if (g) return g;
    const clase = claseDeLugar(lugar) ?? "faltante";
    let capataz: GrupoAfuera["capataz"] = null;
    let telefono: string | null = null;
    let titulo = clase === "faltante" ? "Faltantes sin titular" : nombreDeLugar(lugar, f.personas, f.cuadrillas);
    if (clase === "cuadrilla") {
      const c = f.cuadrillas.find((x) => `c:${x.id}` === lugar);
      const p = c?.responsableId ? f.personas.find((x) => x.tipo === "persona" && x.id === c.responsableId) : undefined;
      if (p) capataz = { id: p.id, nombre: nombrePersona(p), telefono: p.telefono };
      if (c) titulo = c.nombre;
    } else if (clase === "persona") {
      const l = leerLugar(lugar);
      const p = l && "id" in l ? f.personas.find((x) => x.id === l.id && x.tipo === l.clase) : undefined;
      telefono = p?.telefono ?? null;
    }
    g = { lugar, clase, titulo, capataz, telefono, maquinas: [], granel: [], obras: [], vencidas: 0, faltantes: 0, noUsar: 0 };
    grupos.set(lugar, g);
    return g;
  };

  for (const u of f.unidades) {
    if (!u.activo) continue;
    const a = art.get(u.articulo_id);
    if (!a) continue;
    const faltante = u.lugar === "faltante";
    // Un faltante va con quien lo tenía; si faltó del pañol (conteo), al grupo sin titular.
    const titular = faltante ? (u.faltante_de && conTitular(u.faltante_de) ? u.faltante_de : "faltante") : u.lugar;
    if (!faltante && !conTitular(u.lugar)) continue;
    const clase = claseDeLugar(titular);
    const venceEl = (clase === "persona" || clase === "cuadrilla") && !faltante ? u.vence_el : null;
    const vencida = prestamoVencido(venceEl, hoy);
    const item: ItemAfuera = {
      clave: `u:${u.id}`,
      clase: "maquina",
      articuloId: a.id,
      varianteId: null,
      unidadId: u.id,
      numero: u.numero,
      nombre: a.nombre,
      familia: a.seguridad_critica ? "Seguridad crítica" : "Herramienta con número",
      seguridadCritica: a.seguridad_critica,
      cantidad: 1,
      unidad: a.unidad,
      lugar: u.lugar,
      desdeAt: u.desde_at,
      odooOtId: u.odoo_ot_id,
      venceEl,
      vueltaDelDia: clase === "cuadrilla" && venceEl !== null,
      vencida,
      diasVencida: vencida && venceEl ? diasEntre(venceEl, hoy) : 0,
      noUsar: noApta(a.seguridad_critica, u.proxima_inspeccion, hoy),
      proximaInspeccion: u.proxima_inspeccion,
      faltante,
      diasFaltante: faltante ? Math.max(0, diasEntre(u.desde_at, hoy)) : 0,
    };
    grupo(titular).maquinas.push(item);
  }

  for (const s of f.saldos) {
    const cantidad = Number(s.cantidad);
    if (!(cantidad > 0)) continue;
    const a = art.get(s.articulo_id);
    if (!a || a.tipo === "herramienta") continue;
    const faltante = s.lugar === "faltante";
    if (!faltante && !conTitular(s.lugar)) continue;
    const t = s.variante_id ? talle.get(s.variante_id) : undefined;
    grupo(s.lugar).granel.push({
      clave: `s:${a.id}:${s.variante_id ?? ""}:${s.lugar}`,
      clase: "granel",
      articuloId: a.id,
      varianteId: s.variante_id,
      unidadId: null,
      numero: null,
      nombre: t ? `${a.nombre} · talle ${t}` : a.nombre,
      familia: a.tipo === "granel" ? "A granel" : "Insumo",
      seguridadCritica: a.seguridad_critica,
      cantidad,
      unidad: a.unidad,
      lugar: s.lugar,
      desdeAt: null,
      odooOtId: null,
      venceEl: null,
      vueltaDelDia: false,
      vencida: false,
      diasVencida: 0,
      noUsar: false,
      proximaInspeccion: null,
      faltante,
      diasFaltante: 0,
    });
  }

  const pesoItem = (i: ItemAfuera) => (i.noUsar ? 0 : i.faltante ? 1 : i.vencida ? 2 : 3);
  const ordenItems = (x: ItemAfuera, y: ItemAfuera) =>
    pesoItem(x) - pesoItem(y) || x.nombre.localeCompare(y.nombre, "es") || (x.numero ?? "").localeCompare(y.numero ?? "", "es", { numeric: true });

  const salida = [...grupos.values()];
  for (const g of salida) {
    g.maquinas.sort(ordenItems);
    g.granel.sort(ordenItems);
    const todos = [...g.maquinas, ...g.granel];
    g.vencidas = todos.filter((i) => i.vencida).length;
    g.faltantes = todos.filter((i) => i.faltante).length;
    g.noUsar = todos.filter((i) => i.noUsar).length;
    g.obras = [...new Set(todos.map((i) => i.odooOtId).filter((n): n is number => n !== null))].sort((a, b) => a - b);
  }

  // Cuadrillas, personas, obras y al final lo que no tiene titular. Dentro de cada clase,
  // primero los grupos con algo para resolver: la pantalla contesta "¿qué hago ahora?".
  const pesoClase: Record<ClaseGrupo, number> = { cuadrilla: 0, persona: 1, obra: 2, faltante: 3 };
  const problemas = (g: GrupoAfuera) => g.vencidas + g.faltantes + g.noUsar;
  return salida.sort(
    (a, b) =>
      pesoClase[a.clase] - pesoClase[b.clase] ||
      Number(problemas(b) > 0) - Number(problemas(a) > 0) ||
      a.titulo.localeCompare(b.titulo, "es", { numeric: true }),
  );
}

/** Aplica el filtro de la pantalla. Los filtros de problemas dejan sólo esas filas. */
export function filtrarAfuera(grupos: readonly GrupoAfuera[], filtro: FiltroAfuera, titular?: string | null): GrupoAfuera[] {
  const deItem = (i: ItemAfuera) =>
    filtro === "vencidas" ? i.vencida : filtro === "faltantes" ? i.faltante : true;
  return grupos
    .filter((g) => !titular || g.lugar === titular)
    .filter((g) =>
      filtro === "cuadrillas" ? g.clase === "cuadrilla"
        : filtro === "personas" ? g.clase === "persona"
          : filtro === "obras" ? g.clase === "obra"
            : true)
    .map((g) => ({ ...g, maquinas: g.maquinas.filter(deItem), granel: g.granel.filter(deItem) }))
    .filter((g) => g.maquinas.length + g.granel.length > 0);
}

export function contarAfuera(grupos: readonly GrupoAfuera[]) {
  let items = 0, vencidas = 0, faltantes = 0, noUsar = 0;
  for (const g of grupos) {
    items += g.maquinas.length + g.granel.length;
    vencidas += g.vencidas;
    faltantes += g.faltantes;
    noUsar += g.noUsar;
  }
  return { items, vencidas, faltantes, noUsar };
}

/**
 * La señal de una fila (una sola, docs: una señal por idea). Lo normal no lleva marca: lo de
 * una cuadrilla dice "Con la cuadrilla", lo de una persona cuándo vence.
 */
export function senalItem(i: ItemAfuera, hoy: string, perdidaDias: number):
  { tono: "bloqueo" | "aviso" | "neutro"; texto: string } {
  if (i.noUsar) return { tono: "bloqueo", texto: "No usar · inspección vencida" };
  if (i.faltante) {
    const resta = perdidaDias - i.diasFaltante;
    return {
      tono: "aviso",
      texto: i.diasFaltante === 0 ? "Faltante · hoy"
        : resta <= 0 ? `Faltante · ${i.diasFaltante} días, pasa a pérdida`
          : `Faltante · ${i.diasFaltante} ${i.diasFaltante === 1 ? "día" : "días"}`,
    };
  }
  if (i.vencida && i.vueltaDelDia) {
    return { tono: "aviso", texto: i.diasVencida <= 1 ? "No volvió hoy" : `No volvió hoy · hace ${i.diasVencida} días` };
  }
  if (i.vencida) return { tono: "aviso", texto: i.diasVencida === 1 ? "Venció ayer" : `Venció hace ${i.diasVencida} días` };
  if (i.vueltaDelDia) return { tono: "neutro", texto: "Vuelve hoy" };
  if (i.venceEl) {
    const d = diasEntre(hoy, i.venceEl);
    return { tono: "neutro", texto: d === 0 ? "Vence hoy" : d === 1 ? "Vence mañana" : `Vence el ${i.venceEl.slice(8, 10)}/${i.venceEl.slice(5, 7)}` };
  }
  return { tono: "neutro", texto: "" };
}
