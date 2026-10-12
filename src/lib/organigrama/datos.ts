// Del organigrama en la base (lo que devuelve la RPC org_leer) al modelo que usan las
// pantallas, y de vuelta: qué hay que mandarle a la base cuando cambia algo en pantalla.
// Puro (sin red ni React): lo usan el proveedor y los tests.
//
// DECISIÓN (12/10/2026): la app es dueña de la ESTRUCTURA; Odoo/Legajos, de las PERSONAS.
// Acá no se copia ningún dato de una persona: se leen de `personal` (gente de obra, sincronizada
// con Odoo), de `user_profiles` (la oficina) y, para el plantel de cuadrillas tercerizadas, de
// `pan_personas_externas`. Lo único propio es el ocupante «de afuera» con nombre libre.
//
// IDENTIDAD DE UNA PERSONA EN PANTALLA: un texto con prefijo, así cabe en la URL (?persona=)
// y se sabe a qué columna de org_ocupantes va al guardar:
//   p:<uuid>    legajo (`personal`). Si el legajo está vinculado a un usuario (personal.user_id),
//               es la MISMA persona: gana el legajo y el usuario no aparece aparte.
//   u:<uuid>    usuario de la app sin legajo (`user_profiles`).
//   e:<uuid>    externo de una cuadrilla tercerizada (`pan_personas_externas`). Solo se ve en
//               las cuadrillas; no se asigna a mano.
//   x:<nombre>  ocupante de afuera con nombre libre (empresa, contratista): `nombre_libre`.
//
// SINCRONIZAR = DIFERENCIA. Las pantallas cambian un estado local (optimista, para que las
// animaciones del Lienzo no esperen a la red) y el proveedor manda la DIFERENCIA entre lo que
// ya mandó y lo nuevo (operacionesPara). Así deshacer/rehacer del Lienzo, que restaura una foto,
// se persiste solo como la operación inversa, sin que cada pantalla sepa nada de la base.

import type { Cambio, ColorArea, Cuadrilla, Modalidad, Nodo, Ocupante, Persona, Tarea, TipoNodo, Version } from "./tipos.ts";

// ── Filas de la base ─────────────────────────────────────────────────────────

export type FilaNodo = {
  clave: string;
  depende_de: string | null;
  tipo: TipoNodo;
  titulo: string;
  rol: string | null;
  color: ColorArea | null;
  mision: string | null;
  tareas: Tarea[];
  no_hace: string[];
  kpis: string[];
  nota_diseno: string | null;
  fuente_ocupantes: "manual" | "cuadrillas";
  orden: number;
};

export type FilaOcupante = {
  id: string;
  clave: string;
  personal_id: string | null;
  usuario_id: string | null;
  nombre_libre: string | null;
  /** 'compartido' se lee como titular: en pantalla, compartir es tener dos titulares. */
  modalidad: Modalidad | "compartido";
  desde: string;
  hasta: string | null;
};

export type FilaPersonal = {
  id: string;
  nombre: string;
  apellido: string;
  telefono: string | null;
  email: string | null;
  activo: boolean;
  odoo_tarea: string | null;
  user_id: string | null;
};

export type FilaUsuario = { id: string; nombre: string; apellido: string; telefono: string | null; email: string | null; activo: boolean };

export type FilaExterno = {
  id: string;
  nombre: string;
  apellido: string;
  empresa: string | null;
  telefono: string | null;
  activo: boolean;
  cuadrilla_id: string | null;
};

export type FilaCuadrilla = { id: string; nombre: string; orden: number; responsable_id: string | null; es_temporaria: boolean; plantel: string[] };

export type FilaVersion = {
  id: string;
  numero: number | null;
  estado: "borrador" | "publicada" | "archivada";
  nota: string | null;
  publicada_at: string | null;
  created_at: string;
  autor: string | null;
  cambios: Cambio[] | null;
};

/** Lo que devuelve org_leer(). */
export type LecturaOrg = {
  yo: { usuario_id: string; personal_id: string | null } | null;
  puede_editar: boolean;
  versiones: FilaVersion[];
  borrador: FilaVersion | null;
  nodos_vigentes: FilaNodo[];
  nodos_borrador: FilaNodo[] | null;
  notas: { clave: string; texto: string }[];
  ocupantes: FilaOcupante[];
  personal: FilaPersonal[];
  usuarios: FilaUsuario[];
  externos: FilaExterno[];
  cuadrillas: FilaCuadrilla[];
};

// ── Fechas ───────────────────────────────────────────────────────────────────

/** AAAA-MM-DD en Buenos Aires (un interino «desde hoy» es hoy de acá, no de UTC). */
export function hoyBA(ahora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(ahora);
}

function fechaDe(ts: string | null | undefined): string {
  return ts ? hoyBA(new Date(ts)) : "";
}

// ── Personas ─────────────────────────────────────────────────────────────────

const PREFIJOS = ["p", "u", "e", "x"] as const;
export type OrigenId = (typeof PREFIJOS)[number];

export const idLegajo = (id: string) => `p:${id}`;
export const idUsuario = (id: string) => `u:${id}`;
export const idExternoCuadrilla = (id: string) => `e:${id}`;
export const idExternoLibre = (nombre: string) => `x:${nombre.trim()}`;

export function origenDeId(id: string): { origen: OrigenId; valor: string } | null {
  const i = id.indexOf(":");
  const origen = id.slice(0, i) as OrigenId;
  if (i < 1 || !PREFIJOS.includes(origen) || !id.slice(i + 1).trim()) return null;
  return { origen, valor: id.slice(i + 1) };
}

/** A qué columna de org_ocupantes va una persona. Los de cuadrilla (e:) no se asignan a mano. */
export function referenciaDe(persona: string): Pick<FilaOcupante, "personal_id" | "usuario_id" | "nombre_libre"> {
  const o = origenDeId(persona);
  if (!o || o.origen === "e") throw new Error("A esa persona no se la puede ubicar a mano");
  return {
    personal_id: o.origen === "p" ? o.valor : null,
    usuario_id: o.origen === "u" ? o.valor : null,
    nombre_libre: o.origen === "x" ? o.valor.trim() : null,
  };
}

/**
 * Los legajos vienen en MAYÚSCULAS (importación y Odoo): «JUAN CARLOS PEREZ» → «Juan Carlos
 * Perez». Lo que ya viene con minúsculas se respeta tal cual.
 */
export function nombrePropio(texto: string | null | undefined): string {
  const t = (texto ?? "").trim().replace(/\s+/g, " ");
  if (!t || t !== t.toUpperCase()) return t;
  return t
    .toLowerCase()
    .split(" ")
    .map((w, i) => (i > 0 && ["de", "del", "la", "las", "los", "y"].includes(w) ? w : w.replace(/(^|[-'])(\p{L})/gu, (_, a, b) => a + b.toUpperCase())))
    .join(" ");
}

const TAREAS = new Set(["andamista", "chofer", "herrero"]);

function personasDe(l: Pick<LecturaOrg, "personal" | "usuarios" | "externos">): Persona[] {
  const usuarios = new Map(l.usuarios.map((u) => [u.id, u]));
  const vinculados = new Set(l.personal.map((p) => p.user_id).filter(Boolean));
  const fuera: Persona[] = [];
  for (const p of l.personal) {
    const u = p.user_id ? usuarios.get(p.user_id) : undefined;
    fuera.push({
      id: idLegajo(p.id),
      nombre: nombrePropio(p.nombre),
      apellido: nombrePropio(p.apellido),
      origen: "legajo",
      telefono: p.telefono || u?.telefono || undefined,
      email: u?.email || p.email || undefined,
      activo: p.activo,
      ...(p.odoo_tarea && TAREAS.has(p.odoo_tarea) ? { tarea: p.odoo_tarea as Persona["tarea"] } : {}),
    });
  }
  for (const u of l.usuarios) {
    if (vinculados.has(u.id)) continue;
    fuera.push({
      id: idUsuario(u.id),
      nombre: nombrePropio(u.nombre),
      apellido: nombrePropio(u.apellido),
      origen: "usuario",
      telefono: u.telefono || undefined,
      email: u.email || undefined,
      activo: u.activo,
    });
  }
  for (const e of l.externos) {
    fuera.push({
      id: idExternoCuadrilla(e.id),
      nombre: nombrePropio(e.nombre),
      apellido: nombrePropio(e.apellido),
      origen: "externo",
      telefono: e.telefono || undefined,
      activo: e.activo,
      ...(e.empresa ? { empresa: e.empresa } : {}),
    });
  }
  return fuera;
}

/** Suma a la lista los ocupantes de afuera con nombre libre (x:…) que todavía no están. */
export function conExternosLibres(personas: Persona[], ocupantes: Ocupante[]): Persona[] {
  const ids = new Set(personas.map((p) => p.id));
  const nuevos: Persona[] = [];
  for (const o of ocupantes) {
    if (ids.has(o.persona) || !o.persona.startsWith("x:")) continue;
    ids.add(o.persona);
    nuevos.push({ id: o.persona, nombre: o.persona.slice(2), apellido: "", origen: "externo", activo: true });
  }
  return nuevos.length ? [...personas, ...nuevos] : personas;
}

// ── Nodos ────────────────────────────────────────────────────────────────────

export function nodoDeFila(f: FilaNodo, notaInterna?: string): Nodo {
  return {
    clave: f.clave,
    dependeDe: f.depende_de,
    tipo: f.tipo,
    titulo: f.titulo,
    ...(f.rol ? { rol: f.rol } : {}),
    ...(f.color ? { color: f.color } : {}),
    ...(f.mision ? { mision: f.mision } : {}),
    tareas: f.tareas ?? [],
    noHace: f.no_hace ?? [],
    kpis: f.kpis ?? [],
    ...(f.nota_diseno ? { notaDiseno: f.nota_diseno } : {}),
    ...(notaInterna ? { notaInterna } : {}),
    ...(f.fuente_ocupantes === "cuadrillas" ? { fuenteOcupantes: "cuadrillas" as const } : {}),
    orden: f.orden,
  };
}

const vacioANull = (s: string | undefined) => (s?.trim() ? s : null);

/** La fila que se guarda (sin la nota interna, que va aparte y no se versiona). */
export function filaDeNodo(n: Nodo): FilaNodo {
  return {
    clave: n.clave,
    depende_de: n.dependeDe,
    tipo: n.tipo,
    titulo: n.titulo,
    rol: vacioANull(n.rol),
    color: n.tipo === "puesto" ? null : (n.color ?? null),
    mision: vacioANull(n.mision),
    tareas: n.tareas.map((t) => (t.docs?.length ? { texto: t.texto, docs: t.docs.map((d) => ({ codigo: d.codigo, rol: d.rol })) } : { texto: t.texto })),
    no_hace: n.noHace,
    kpis: n.kpis,
    nota_diseno: vacioANull(n.notaDiseno),
    fuente_ocupantes: n.fuenteOcupantes === "cuadrillas" ? "cuadrillas" : "manual",
    orden: n.orden,
  };
}

// ── Ocupantes ────────────────────────────────────────────────────────────────

export function ocupanteDeFila(f: FilaOcupante, legajoDeUsuario: Map<string, string>): Ocupante | null {
  let persona: string | null = null;
  if (f.personal_id) persona = idLegajo(f.personal_id);
  else if (f.usuario_id) persona = legajoDeUsuario.has(f.usuario_id) ? idLegajo(legajoDeUsuario.get(f.usuario_id)!) : idUsuario(f.usuario_id);
  else if (f.nombre_libre?.trim()) persona = idExternoLibre(f.nombre_libre);
  if (!persona) return null;
  return {
    id: f.id,
    nodo: f.clave,
    persona,
    modalidad: f.modalidad === "interino" ? "interino" : "titular",
    desde: f.desde,
    ...(f.hasta ? { hasta: f.hasta } : {}),
  };
}

export type FilaOcupanteGuardar = Omit<FilaOcupante, "modalidad"> & { modalidad: Modalidad };

export function filaDeOcupante(o: Ocupante): FilaOcupanteGuardar {
  return { id: o.id, clave: o.nodo, ...referenciaDe(o.persona), modalidad: o.modalidad, desde: o.desde, hasta: o.hasta ?? null };
}

// ── Todo junto ───────────────────────────────────────────────────────────────

export type BorradorMeta = { fecha: string; autor: string };

export type EstadoServidor = {
  vigente: Nodo[];
  borrador: Nodo[] | null;
  borradorId: string | null;
  borradorMeta: BorradorMeta | null;
  /** Publicadas y archivadas, de la más nueva a la más vieja. */
  versiones: Version[];
  ocupantes: Ocupante[];
  personas: Persona[];
  cuadrillas: Cuadrilla[];
  /** La persona de quien mira (su legajo vinculado, o su usuario). */
  yo: string | null;
  puedeEditar: boolean;
};

/**
 * En el orden del árbol (padre, después sus hijos por `orden`, en profundidad), como la base:
 * la lista de nodos se recorre así en el mapa, la impresión y el recorrido. Si quedara algún
 * nodo suelto (no debería), va al final en vez de perderse.
 */
export function ordenarArbol(nodos: Nodo[]): Nodo[] {
  const porPadre = new Map<string | null, Nodo[]>();
  for (const n of nodos) porPadre.set(n.dependeDe, [...(porPadre.get(n.dependeDe) ?? []), n]);
  for (const hs of porPadre.values()) hs.sort((a, b) => a.orden - b.orden || a.clave.localeCompare(b.clave));
  const fuera: Nodo[] = [];
  const vistos = new Set<string>();
  const visitar = (n: Nodo) => {
    if (vistos.has(n.clave)) return;
    vistos.add(n.clave);
    fuera.push(n);
    for (const h of porPadre.get(n.clave) ?? []) visitar(h);
  };
  for (const r of porPadre.get(null) ?? []) visitar(r);
  for (const n of nodos) if (!vistos.has(n.clave)) fuera.push(n);
  return fuera;
}

export function desdeServidor(l: LecturaOrg): EstadoServidor {
  const notas = new Map(l.notas.map((n) => [n.clave, n.texto]));
  const legajoDeUsuario = new Map(l.personal.filter((p) => p.user_id).map((p) => [p.user_id!, p.id]));
  const ocupantes = l.ocupantes.map((f) => ocupanteDeFila(f, legajoDeUsuario)).filter((o): o is Ocupante => !!o);
  const yo = l.yo ? (l.yo.personal_id ? idLegajo(l.yo.personal_id) : legajoDeUsuario.has(l.yo.usuario_id) ? idLegajo(legajoDeUsuario.get(l.yo.usuario_id)!) : idUsuario(l.yo.usuario_id)) : null;
  const plantelExterno = new Map<string, string[]>();
  for (const e of l.externos) {
    if (!e.cuadrilla_id || !e.activo) continue;
    plantelExterno.set(e.cuadrilla_id, [...(plantelExterno.get(e.cuadrilla_id) ?? []), idExternoCuadrilla(e.id)]);
  }
  return {
    vigente: ordenarArbol(l.nodos_vigentes.map((f) => nodoDeFila(f, notas.get(f.clave)))),
    borrador: l.nodos_borrador ? ordenarArbol(l.nodos_borrador.map((f) => nodoDeFila(f, notas.get(f.clave)))) : null,
    borradorId: l.borrador?.id ?? null,
    borradorMeta: l.borrador ? { fecha: fechaDe(l.borrador.created_at), autor: l.borrador.autor ?? "Un editor" } : null,
    versiones: l.versiones
      .filter((v) => v.estado !== "borrador")
      .sort((a, b) => (b.numero ?? 0) - (a.numero ?? 0))
      .map((v) => ({
        id: v.id,
        numero: v.numero,
        estado: v.estado,
        nota: v.nota ?? "",
        fecha: fechaDe(v.publicada_at ?? v.created_at),
        autor: v.autor ?? "Carga inicial",
        cambios: v.cambios ?? [],
      })),
    ocupantes,
    personas: conExternosLibres(personasDe(l), ocupantes),
    cuadrillas: [...l.cuadrillas]
      .sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre))
      .map((c) => ({
        id: c.id,
        nombre: c.nombre,
        capataz: c.responsable_id ? idLegajo(c.responsable_id) : null,
        plantel: [...c.plantel.map(idLegajo), ...(plantelExterno.get(c.id) ?? [])],
        ...(c.es_temporaria ? { temporaria: true } : {}),
      })),
    yo,
    puedeEditar: l.puede_editar,
  };
}

// ── Qué mandar a la base ─────────────────────────────────────────────────────

export type CambiosNodos = { upsert: FilaNodo[]; borrar: string[]; notas: { clave: string; texto: string | null }[] };

const igual = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Lo que cambió en el borrador: filas nuevas o distintas, claves que ya no están y notas internas. */
export function diffNodos(antes: Nodo[], despues: Nodo[]): CambiosNodos {
  const previos = new Map(antes.map((n) => [n.clave, n]));
  const quedan = new Set(despues.map((n) => n.clave));
  const upsert: FilaNodo[] = [];
  const notas: CambiosNodos["notas"] = [];
  for (const d of despues) {
    const a = previos.get(d.clave);
    const fila = filaDeNodo(d);
    if (!a || !igual(filaDeNodo(a), fila)) upsert.push(fila);
    const nota = d.notaInterna?.trim() ?? "";
    if (nota !== (a?.notaInterna?.trim() ?? "")) notas.push({ clave: d.clave, texto: nota || null });
  }
  return { upsert, borrar: antes.filter((a) => !quedan.has(a.clave)).map((a) => a.clave), notas };
}

export type CambiosOcupantes = { upsert: FilaOcupanteGuardar[]; borrar: string[] };

/**
 * Lo que cambió en la ocupación. Un ocupante que desaparece se BORRA: solo pasa al deshacer
 * una asignación recién hecha (quitar a alguien no lo borra, le pone `hasta`).
 */
export function diffOcupantes(antes: Ocupante[], despues: Ocupante[]): CambiosOcupantes {
  const previos = new Map(antes.map((o) => [o.id, o]));
  const quedan = new Set(despues.map((o) => o.id));
  const upsert = despues.filter((d) => !igual(previos.get(d.id), d)).map(filaDeOcupante);
  return { upsert, borrar: antes.filter((a) => !quedan.has(a.id)).map((a) => a.id) };
}

export type Operacion =
  | { tipo: "crearBorrador" }
  | { tipo: "guardarBorrador"; cambios: CambiosNodos }
  | { tipo: "descartar" }
  | { tipo: "publicar"; nota: string; cambios: Cambio[] }
  | { tipo: "ocupantes"; cambios: CambiosOcupantes };

/** Lo que importa para sincronizar: el borrador y la ocupación (lo publicado no se edita). */
export type Sincro = { borrador: Nodo[] | null; ocupantes: Ocupante[] };

const vacio = (c: CambiosNodos) => !c.upsert.length && !c.borrar.length && !c.notas.length;

/**
 * Las operaciones que llevan la base de `enviado` (lo último que se mandó) a `local` (lo que se
 * ve). Si el borrador aparece, se crea en la base (copia de la vigente) y se le aplica la
 * diferencia contra la vigente; si desaparece, se descarta (publicar NO pasa por acá: el
 * proveedor la manda explícita, con su nota). La estructura va antes que la ocupación: una
 * persona puede caer en un puesto que nació en el mismo cambio.
 */
export function operacionesPara(enviado: Sincro, local: Sincro, vigente: Nodo[]): Operacion[] {
  const ops: Operacion[] = [];
  if (!enviado.borrador && local.borrador) {
    ops.push({ tipo: "crearBorrador" });
    const c = diffNodos(vigente, local.borrador);
    if (!vacio(c)) ops.push({ tipo: "guardarBorrador", cambios: c });
  } else if (enviado.borrador && !local.borrador) {
    ops.push({ tipo: "descartar" });
  } else if (enviado.borrador && local.borrador && enviado.borrador !== local.borrador) {
    const c = diffNodos(enviado.borrador, local.borrador);
    if (!vacio(c)) ops.push({ tipo: "guardarBorrador", cambios: c });
  }
  if (enviado.ocupantes !== local.ocupantes) {
    const c = diffOcupantes(enviado.ocupantes, local.ocupantes);
    if (c.upsert.length || c.borrar.length) ops.push({ tipo: "ocupantes", cambios: c });
  }
  return ops;
}
