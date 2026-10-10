// La bandeja del pañol: "¿qué hago ahora?" (docs/modulo-panol.md §6.14).
//
// LÓGICA PURA. Recibe las filas crudas (catálogo, saldos, conteos, sin alta, vales, personas,
// nombres de OT) y devuelve las secciones ya armadas, con el texto que se lee y lo que hace
// cada botón. La arma el servidor (/api/panol/bandeja) y la misma cuenta la usa el barrido
// diario para decidir qué avisos crear (avisos.ts): si la bandeja muestra algo, el aviso
// habla de lo mismo, con las mismas palabras.
//
// Una sección vacía no se muestra: lo que no está en la bandeja anda bien.

import {
  bajoMinimo, diasEntre, existencias, faltantePuedePasarAPerdida, hoyBA, inspeccion, leerLugar,
  prestamoVencido, sugeridoReponer,
} from "./estado.ts";
import type {
  Articulo, ClaveParametro, EstadoVuelta, PersonaTipo, Saldo, TipoMovimiento, Ubicacion, Unidad, Variante,
} from "./tipos.ts";
import {
  fechaCorta, linkWhatsapp, mensajeFaltante, mensajeInspeccion, mensajeNoVolvio, mensajePrestamoVencido,
} from "./whatsapp.ts";

// ─── Entrada ────────────────────────────────────────────────────────────────

export type OtResumen = { id: number; nombre: string | null; cliente: string | null; direccion: string | null };

export type PersonaBandeja = {
  tipo: PersonaTipo;
  id: string;
  nombre: string;
  telefono: string | null;
  activo: boolean;
  userId: string | null;
};

export type CuadrillaBandeja = { id: string; nombre: string; activo: boolean; responsableId: string | null };

export type ConteoItemCrudo = {
  articulo_id: string;
  variante_id: string | null;
  unidad_id: string | null;
  contado: number | null;
  esperado: number | null;
  encontrado_extra: boolean;
};

export type ConteoCrudo = {
  id: string;
  ubicacion_id: string;
  contado_por_tipo: PersonaTipo | null;
  contado_por_id: string | null;
  registrado_por: string | null;
  umbral_pct: number | null;
  cerrado_at: string | null;
  items: ConteoItemCrudo[];
};

export type SinAltaCrudo = {
  id: string;
  descripcion: string;
  cantidad: number;
  foto_path: string | null;
  quien_tipo: PersonaTipo | null;
  quien_id: string | null;
  odoo_ot_id: number | null;
  created_at: string;
};

export type ValeSinEncargado = { id: string; created_at: string; movimientos: TipoMovimiento[] };

/** Un movimiento a "faltante" de algo a granel (sin unidad): de quién era y cuándo faltó. */
export type FaltanteGranel = {
  id: string;
  articulo_id: string;
  variante_id: string | null;
  cantidad: number;
  desde: string;
  capataz_id: string | null;
  created_at: string;
};

/** El último movimiento de una unidad: por qué está en revisión o en el taller. */
export type UltimoMovimiento = {
  tipo: TipoMovimiento;
  desde: string;
  estado_vuelta: EstadoVuelta | null;
  motivo: string | null;
  quien_tipo: PersonaTipo | null;
  quien_id: string | null;
  odoo_ot_id: number | null;
  created_at: string;
};

export type Yo = { userId: string | null; personaId: string | null; esEncargado: boolean };

export type EntradaBandeja = {
  /** ISO del momento en que se arma: todo lo relativo ("hace 3 días") sale de acá. */
  ahora: string;
  parametros: Partial<Record<ClaveParametro, number>>;
  ubicaciones: Ubicacion[];
  articulos: Articulo[];
  variantes: Variante[];
  unidades: Unidad[];
  saldos: Saldo[];
  conteos: ConteoCrudo[];
  sinAlta: SinAltaCrudo[];
  valesSinEncargado: ValeSinEncargado[];
  faltantesGranel: FaltanteGranel[];
  ultimos: Record<string, UltimoMovimiento>;
  personas: PersonaBandeja[];
  cuadrillas: CuadrillaBandeja[];
  ots: Record<number, OtResumen>;
  yo: Yo;
};

// ─── Salida ─────────────────────────────────────────────────────────────────

export type TonoBandeja = "bloqueo" | "aviso" | "marcha" | "listo" | "neutro";

/**
 * Lo que hace cada botón. La bandeja dice QUÉ; la pantalla sabe CÓMO (la RPC, el diálogo,
 * el Deshacer). `bloqueo` es el texto que explica por qué el botón no se puede usar todavía:
 * un botón apagado sin explicación es un botón roto.
 */
export type AccionBandeja =
  | { tipo: "aprobar_conteo" | "rechazar_conteo"; conteoId: string; contadoPor: string; bloqueo: string | null }
  | { tipo: "reponer"; clave: string; articuloId: string; varianteId: string | null; cantidad: number; texto: string }
  | { tipo: "whatsapp"; etiqueta: string; clave: string; url: string | null; a: string }
  | { tipo: "perdida"; articuloId: string; varianteId: string | null; unidadId: string | null; cantidad: number; que: string; aCargo: string | null; bloqueo: string | null }
  | { tipo: "revision"; articuloId: string; unidadId: string; nuevoEstado: "disponible" | "fuera_de_servicio"; que: string }
  | { tipo: "taller_envio" | "taller_vuelta"; articuloId: string; unidadId: string; que: string }
  | { tipo: "sin_alta_resuelto"; sinAltaId: string; que: string }
  | { tipo: "link"; etiqueta: string; href: string };

export type FilaBandeja = {
  /** Estable entre lecturas: es la clave de React y la base de la clave del aviso. */
  id: string;
  titulo: string;
  /** "#H-008" */
  codigo: string | null;
  detalle: string;
  /** Las diferencias de un conteo, una por renglón. */
  items?: string[];
  /** "hoy 14:35", "hace 4 días", "16 días". */
  cuando: string | null;
  chip: { texto: string; tono: TonoBandeja } | null;
  acciones: AccionBandeja[];
  /** Para los avisos (avisos.ts): cuántos días lleva, y si ya está para actuar. */
  dias?: number;
  urgente?: boolean;
};

export type IdSeccion =
  | "ajustes" | "negativo" | "reponer" | "vencidas" | "faltantes" | "revision" | "taller"
  | "inspecciones" | "sin_alta" | "sin_encargado";

export type SeccionBandeja = { id: IdSeccion; titulo: string; ayuda: string; filas: FilaBandeja[] };

/** "Legajo dado de baja con cosas a cargo": va arriba de todo, no es una sección más. */
export type AvisoBaja = { lugar: string; clase: "persona" | "cuadrilla"; nombre: string; cosas: string[]; href: string };

export type Bandeja = {
  generado: string;
  hoy: string;
  yo: Yo;
  parametros: Partial<Record<ClaveParametro, number>>;
  bajas: AvisoBaja[];
  secciones: SeccionBandeja[];
  pendientes: number;
};

// ─── Textos ─────────────────────────────────────────────────────────────────

const NUM = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 3 });
export const numero = (n: number) => NUM.format(n).replace("-", "−");

const HORA = new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires", hour: "2-digit", minute: "2-digit", hour12: false });

/** La fecha de Buenos Aires de un instante. */
const fechaBA = (iso: string) => hoyBA(new Date(iso));

/** "hoy 14:35", "ayer 16:10", "hace 4 días", "06/10". */
export function cuandoFue(iso: string, hoy: string): string {
  const dia = fechaBA(iso);
  const dias = diasEntre(dia, hoy);
  if (dias <= 0) return `hoy ${HORA.format(new Date(iso))}`;
  if (dias === 1) return `ayer ${HORA.format(new Date(iso))}`;
  if (dias < 7) return `hace ${dias} días`;
  return fechaCorta(dia);
}

const dias = (n: number) => (n === 1 ? "1 día" : `${n} días`);

export function textoOt(ot: number | null | undefined, ots: Record<number, OtResumen>): string | null {
  if (!ot) return null;
  const o = ots[ot];
  return o?.direccion ? `OT ${ot} · ${o.direccion}` : `OT ${ot}`;
}

/** "Juan, Pedro y Ana". */
function enumerar(cosas: string[]): string {
  if (cosas.length <= 1) return cosas[0] ?? "";
  return `${cosas.slice(0, -1).join(", ")} y ${cosas[cosas.length - 1]}`;
}

function plural(n: number, uno: string, varios: string) {
  return `${n} ${n === 1 ? uno : varios}`;
}

// ─── El armado ──────────────────────────────────────────────────────────────

/** Las OTs que nombra la bandeja: el servidor las resuelve con Odoo antes de armarla. */
export function otsReferidas(e: Pick<EntradaBandeja, "unidades" | "sinAlta" | "ultimos">): number[] {
  const ids = new Set<number>();
  for (const u of e.unidades) if (u.odoo_ot_id && u.activo && u.estado === "afuera") ids.add(Number(u.odoo_ot_id));
  for (const s of e.sinAlta) if (s.odoo_ot_id) ids.add(Number(s.odoo_ot_id));
  for (const m of Object.values(e.ultimos)) if (m.odoo_ot_id) ids.add(Number(m.odoo_ot_id));
  return [...ids];
}

export function armarBandeja(e: EntradaBandeja): Bandeja {
  const hoy = hoyBA(new Date(e.ahora));
  const avisoInspeccion = e.parametros.aviso_inspeccion_dias ?? 15;
  const diasPerdida = e.parametros.faltante_perdida_dias ?? 15;
  const umbral = e.parametros.conteo_umbral_pct ?? 10;

  const articulo = new Map(e.articulos.map((a) => [a.id, a]));
  const variante = new Map(e.variantes.map((v) => [v.id, v]));
  const ubicacion = new Map(e.ubicaciones.map((u) => [u.id, u]));
  const unidad = new Map(e.unidades.map((u) => [u.id, u]));
  const persona = new Map(e.personas.map((p) => [`${p.tipo === "externa" ? "x" : "p"}:${p.id}`, p]));
  const legajo = new Map(e.personas.filter((p) => p.tipo === "persona").map((p) => [p.id, p]));
  const cuadrilla = new Map(e.cuadrillas.map((c) => [c.id, c]));
  const soloEncargado = e.yo.esEncargado ? null : "Esto lo hace alguien a cargo del pañol.";

  const nombreArt = (articuloId: string, varianteId?: string | null) => {
    const a = articulo.get(articuloId);
    const v = varianteId ? variante.get(varianteId) : null;
    return `${a?.nombre ?? "Artículo"}${v ? ` · ${v.nombre}` : ""}`;
  };
  const cant = (n: number, articuloId: string) => `${numero(n)} ${articulo.get(articuloId)?.unidad ?? "u."}`;

  /** De un lugar, quién o qué es, en palabras. */
  const nombreLugar = (lugar: string): string => {
    const l = leerLugar(lugar);
    if (!l) return lugar;
    switch (l.clase) {
      case "persona":
      case "externa":
        return persona.get(lugar)?.nombre ?? "una persona";
      case "cuadrilla":
        return cuadrilla.get(l.id)?.nombre ?? "una cuadrilla";
      case "obra":
        return textoOt(l.ot, e.ots) ?? `OT ${l.ot}`;
      case "ubicacion":
        return ubicacion.get(l.id)?.nombre ?? "el pañol";
      case "taller":
        return "el taller";
      case "faltante":
        return "faltante";
      case "perdida":
        return "perdida";
      case "baja":
        return "de baja";
      default:
        return lugar;
    }
  };

  /** A quién se le escribe por algo que tiene `lugar`: la persona, o el capataz de la cuadrilla. */
  const contactoDe = (lugar: string, capatazId?: string | null): { nombre: string; telefono: string | null } | null => {
    const l = leerLugar(lugar);
    if (!l) return null;
    if (l.clase === "persona" || l.clase === "externa") {
      const p = persona.get(lugar);
      return p ? { nombre: p.nombre, telefono: p.telefono } : null;
    }
    if (l.clase === "cuadrilla") {
      const id = capatazId ?? cuadrilla.get(l.id)?.responsableId ?? null;
      const p = id ? legajo.get(id) : null;
      return p ? { nombre: p.nombre, telefono: p.telefono } : null;
    }
    if (capatazId) {
      const p = legajo.get(capatazId);
      return p ? { nombre: p.nombre, telefono: p.telefono } : null;
    }
    return null;
  };

  const whatsapp = (etiqueta: string, clave: string, contacto: { nombre: string; telefono: string | null } | null, texto: (nombre: string) => string): AccionBandeja | null =>
    contacto ? { tipo: "whatsapp", etiqueta, clave, url: linkWhatsapp(contacto.telefono, texto(contacto.nombre)), a: contacto.nombre } : null;

  const unidadesActivas = e.unidades.filter((u) => u.activo);
  const secciones: SeccionBandeja[] = [];

  // 1. Ajustes por aprobar ─────────────────────────────────────────────────
  {
    const filas: FilaBandeja[] = [];
    for (const c of e.conteos) {
      const quien = c.contado_por_id ? (persona.get(`${c.contado_por_tipo === "externa" ? "x" : "p"}:${c.contado_por_id}`)?.nombre ?? "alguien") : "alguien";
      const items: string[] = [];
      for (const it of c.items) {
        if (it.contado === null) continue;
        const esperado = Number(it.esperado ?? 0);
        const contado = Number(it.contado);
        if (it.unidad_id) {
          const n = unidad.get(it.unidad_id)?.numero ?? "una unidad";
          if (contado === 0 && esperado === 1) items.push(`${nombreArt(it.articulo_id)} ${n}: no apareció (queda faltante)`);
          else if (contado === 1 && esperado === 0) items.push(`${nombreArt(it.articulo_id)} ${n}: apareció acá`);
          continue;
        }
        const dif = contado - esperado;
        if (dif === 0) continue;
        const pct = Math.round((dif * 100) / Math.max(esperado, 1));
        items.push(
          `${nombreArt(it.articulo_id, it.variante_id)}: contaron ${numero(contado)}, figuraban ${numero(esperado)} → ` +
          `${dif > 0 ? "+" : ""}${cant(dif, it.articulo_id)} (${pct > 0 ? "+" : ""}${numero(pct)} %)`,
        );
      }
      const contoYo = (!!e.yo.userId && c.registrado_por === e.yo.userId) || (!!e.yo.personaId && c.contado_por_id === e.yo.personaId);
      const bloqueo = soloEncargado ?? (contoYo ? "Lo contaste vos: lo tiene que aprobar otro encargado." : null);
      filas.push({
        id: c.id,
        titulo: `Conteo de ${ubicacion.get(c.ubicacion_id)?.nombre ?? "una ubicación"}`,
        codigo: null,
        detalle: `Lo contó ${quien}. ${plural(items.length, "diferencia", "diferencias")} que pasan el ${numero(Number(c.umbral_pct ?? umbral))} %.`,
        items,
        cuando: c.cerrado_at ? cuandoFue(c.cerrado_at, hoy) : null,
        chip: null,
        acciones: [
          { tipo: "aprobar_conteo", conteoId: c.id, contadoPor: quien, bloqueo },
          { tipo: "rechazar_conteo", conteoId: c.id, contadoPor: quien, bloqueo },
        ],
      });
    }
    secciones.push({
      id: "ajustes",
      titulo: "Ajustes por aprobar",
      ayuda: `Diferencias de conteo que pasan el ${numero(umbral)} %. Las aprueba otro encargado, no quien contó.`,
      filas,
    });
  }

  // 2. Stock negativo ──────────────────────────────────────────────────────
  {
    const filas: FilaBandeja[] = e.saldos
      .filter((s) => Number(s.cantidad) < 0 && articulo.has(s.articulo_id))
      .map((s) => ({
        id: `${s.articulo_id}:${s.variante_id ?? "-"}:${s.lugar}`,
        titulo: nombreArt(s.articulo_id, s.variante_id),
        codigo: null,
        detalle: `Figura ${cant(Number(s.cantidad), s.articulo_id)} en ${nombreLugar(s.lugar)}. ¿Falta cargar una compra, o hay que contarlo?`,
        cuando: null,
        chip: null,
        acciones: [{ tipo: "link", etiqueta: "Abrir el artículo", href: `/deposito/panol/stock/${s.articulo_id}` }],
      }));
    secciones.push({
      id: "negativo",
      titulo: "Stock negativo",
      ayuda: "Se retiró más de lo que figuraba. El retiro no se frenó: hay que contar o cargar el ingreso que falta.",
      filas,
    });
  }

  // 3. Reponer ─────────────────────────────────────────────────────────────
  {
    const filas: FilaBandeja[] = [];
    for (const a of e.articulos) {
      if (!a.activo || a.tipo === "herramienta" || !a.minimo || Number(a.minimo) <= 0) continue;
      // Con talles, el mínimo es por talle: lo que falta es el 42, no "botines" en general.
      const talles = a.tiene_talles ? e.variantes.filter((v) => v.articulo_id === a.id && v.activo) : [];
      const casos: (string | null)[] = talles.length ? talles.map((v) => v.id) : [null];
      for (const varianteId of casos) {
        const hay = existencias(e.saldos, a.id, talles.length ? varianteId : undefined).enPanol;
        if (!bajoMinimo(hay, Number(a.minimo))) continue;
        const sugerido = sugeridoReponer(hay, Number(a.minimo), a.reponer_hasta === null ? null : Number(a.reponer_hasta), Number(a.factor_compra));
        if (sugerido <= 0) continue;
        const factor = Number(a.factor_compra);
        const enCompra = a.unidad_compra && factor > 1 ? ` (${numero(sugerido / factor)} ${a.unidad_compra} de ${numero(factor)})` : "";
        const que = nombreArt(a.id, varianteId);
        filas.push({
          id: `${a.id}:${varianteId ?? "-"}`,
          titulo: que,
          codigo: null,
          detalle:
            `Quedan ${cant(hay, a.id)} · mínimo ${numero(Number(a.minimo))}` +
            (a.reponer_hasta !== null ? ` · reponer hasta ${numero(Number(a.reponer_hasta))}` : "") +
            ` → sugerido ${cant(sugerido, a.id)}${enCompra}`,
          cuando: null,
          chip: null,
          acciones: [{
            tipo: "reponer", clave: `${a.id}:${varianteId ?? "-"}`, articuloId: a.id, varianteId, cantidad: sugerido,
            texto: `${que} — ${cant(sugerido, a.id)}${enCompra}${a.proveedor ? ` · ${a.proveedor}` : ""}`,
          }],
        });
      }
    }
    secciones.push({
      id: "reponer",
      titulo: "Reponer",
      ayuda: "Bajo el mínimo. La cantidad sugerida completa hasta «reponer hasta».",
      filas,
    });
  }

  // 4. Vencidas sin devolver ───────────────────────────────────────────────
  {
    const filas: FilaBandeja[] = [];
    for (const u of unidadesActivas) {
      if (u.estado !== "afuera" || !/^(p|x|c):/.test(u.lugar) || !prestamoVencido(u.vence_el, hoy)) continue;
      const venceEl = u.vence_el as string;
      const n = diasEntre(venceEl, hoy);
      const herramienta = nombreArt(u.articulo_id);
      const obra = textoOt(u.odoo_ot_id, e.ots);
      // Dos casos con la misma regla: el préstamo a una persona, y lo que salió con una
      // cuadrilla marcado "vuelve hoy" (vence_el = ese día) y no volvió. Lo segundo es del
      // capataz: a él va el WhatsApp.
      const deCuadrilla = u.lugar.startsWith("c:");
      const contacto = contactoDe(u.lugar, u.capataz_id);
      const accion = whatsapp("Avisar por WhatsApp", `vencida:${u.id}:${venceEl}`, contacto, (nombre) =>
        deCuadrilla
          ? mensajeNoVolvio({ nombre, cuadrilla: nombreLugar(u.lugar), herramienta, numero: u.numero, dia: venceEl, obra })
          : mensajePrestamoVencido({ nombre, herramienta, numero: u.numero, venceEl, obra }));
      filas.push({
        id: `${u.id}:${venceEl}`,
        titulo: herramienta,
        codigo: `#${u.numero}`,
        detalle: (deCuadrilla
          ? [nombreLugar(u.lugar), contacto ? `capataz ${contacto.nombre}` : null, obra, `tenía que volver en el día (${fechaCorta(venceEl)})`]
          : [nombreLugar(u.lugar), obra, `tenía que volver el ${fechaCorta(venceEl)}`]).filter(Boolean).join(" · "),
        cuando: n === 1 ? "desde ayer" : `hace ${dias(n)}`,
        chip: { texto: deCuadrilla ? "No volvió hoy" : "Préstamo vencido", tono: "aviso" },
        acciones: accion ? [accion] : [],
        dias: n,
      });
    }
    filas.sort((a, b) => (b.dias ?? 0) - (a.dias ?? 0));
    secciones.push({
      id: "vencidas",
      titulo: "Vencidas sin devolver",
      ayuda: "Préstamos a personas que pasaron la fecha, y lo que salió con una cuadrilla para volver en el día y no volvió. El equipo que se queda con la cuadrilla no vence.",
      filas,
    });
  }

  // 5. Faltantes de cuadrilla ──────────────────────────────────────────────
  {
    const filas: FilaBandeja[] = [];
    const filaFaltante = (p: {
      id: string; titulo: string; codigo: string | null; de: string | null; capatazId: string | null; desdeISO: string;
      articuloId: string; varianteId: string | null; unidadId: string | null; cantidad: number; que: string;
    }) => {
      const desde = fechaBA(p.desdeISO);
      const n = Math.max(0, diasEntre(desde, hoy));
      const puede = faltantePuedePasarAPerdida(desde, hoy, diasPerdida);
      const deLugar = p.de ? leerLugar(p.de) : null;
      const capataz = p.capatazId ? legajo.get(p.capatazId)?.nombre ?? null
        : deLugar?.clase === "cuadrilla" ? (legajo.get(cuadrilla.get(deLugar.id)?.responsableId ?? "")?.nombre ?? null) : null;
      const aCargo = capataz ?? (deLugar && (deLugar.clase === "persona" || deLugar.clase === "externa") ? nombreLugar(p.de as string) : null);
      const origen = !p.de ? null
        : deLugar?.clase === "ubicacion" ? `no apareció en el conteo de ${nombreLugar(p.de)}`
        : nombreLugar(p.de);
      const habilita = new Date(Date.parse(`${desde}T12:00:00Z`) + diasPerdida * 86_400_000).toISOString().slice(0, 10);
      const acciones: AccionBandeja[] = [{
        tipo: "perdida", articuloId: p.articuloId, varianteId: p.varianteId, unidadId: p.unidadId, cantidad: p.cantidad, que: p.que, aCargo,
        bloqueo: soloEncargado ?? (puede ? null : `Se habilita a los ${dias(diasPerdida)} (el ${fechaCorta(habilita)}).`),
      }];
      const contacto = p.de ? contactoDe(p.de, p.capatazId) : null;
      const cuadrillaNombre = deLugar?.clase === "cuadrilla" ? cuadrilla.get(deLugar.id)?.nombre ?? null : null;
      const wa = whatsapp("Avisar por WhatsApp", `faltante:${p.id}`, contacto, (nombre) => mensajeFaltante({ nombre, cuadrilla: cuadrillaNombre, cosas: [`${p.titulo}${p.codigo ? ` ${p.codigo}` : ""}`] }));
      if (wa) acciones.push(wa);
      filas.push({
        id: p.id,
        titulo: p.titulo,
        codigo: p.codigo,
        detalle: [origen, capataz && deLugar?.clase === "cuadrilla" ? `capataz ${capataz}` : null, `faltante desde el ${fechaCorta(desde)}`].filter(Boolean).join(" · "),
        cuando: n === 0 ? "hoy" : dias(n),
        chip: null,
        acciones,
        dias: n,
        urgente: puede,
      });
    };

    for (const u of unidadesActivas) {
      if (u.estado !== "faltante") continue;
      filaFaltante({
        id: u.id, titulo: nombreArt(u.articulo_id), codigo: `#${u.numero}`, de: u.faltante_de, capatazId: u.capataz_id,
        desdeISO: u.desde_at, articuloId: u.articulo_id, varianteId: null, unidadId: u.id, cantidad: 1, que: `${nombreArt(u.articulo_id)} ${u.numero}`,
      });
    }
    for (const g of faltantesGranelVigentes(e.saldos, e.faltantesGranel)) {
      filaFaltante({
        id: g.id, titulo: `${nombreArt(g.articulo_id, g.variante_id)} × ${cant(g.cantidad, g.articulo_id)}`, codigo: null, de: g.desde,
        capatazId: g.capataz_id, desdeISO: g.created_at, articuloId: g.articulo_id, varianteId: g.variante_id, unidadId: null,
        cantidad: g.cantidad, que: `${cant(g.cantidad, g.articulo_id)} de ${nombreArt(g.articulo_id, g.variante_id)}`,
      });
    }
    filas.sort((a, b) => (b.dias ?? 0) - (a.dias ?? 0));
    secciones.push({
      id: "faltantes",
      titulo: "Faltantes de cuadrilla",
      ayuda: `No aparecieron en el control. Están a cargo del capataz y pasan a pérdida a los ${dias(diasPerdida)}.`,
      filas,
    });
  }

  // 6. En revisión ─────────────────────────────────────────────────────────
  {
    const filas: FilaBandeja[] = unidadesActivas
      .filter((u) => u.estado === "en_revision")
      .map((u) => {
        const m = e.ultimos[u.id];
        const que = `${nombreArt(u.articulo_id)} ${u.numero}`;
        const como = m?.estado_vuelta === "incompleta" ? "Incompleta" : "Con falla";
        const quien = m?.quien_id ? persona.get(`${m.quien_tipo === "externa" ? "x" : "p"}:${m.quien_id}`)?.nombre : null;
        const deDonde = m && /^(p|x|c|o):/.test(m.desde) ? (leerLugar(m.desde)?.clase === "cuadrilla" ? `volvió con la ${nombreLugar(m.desde)}` : null) : null;
        const obra = textoOt(m?.odoo_ot_id, e.ots);
        const detalle = [
          m?.motivo ? `${como}: «${m.motivo}»` : como,
          deDonde ?? (quien ? `la devolvió ${quien}${obra ? ` de ${obra}` : ""}` : null),
        ].filter(Boolean).join(" · ");
        const acciones: AccionBandeja[] = e.yo.esEncargado ? [
          { tipo: "revision", articuloId: u.articulo_id, unidadId: u.id, nuevoEstado: "disponible", que },
          { tipo: "revision", articuloId: u.articulo_id, unidadId: u.id, nuevoEstado: "fuera_de_servicio", que },
          { tipo: "taller_envio", articuloId: u.articulo_id, unidadId: u.id, que },
        ] : [];
        acciones.push({ tipo: "link", etiqueta: "Abrir la ficha", href: `/deposito/panol/herramientas/${u.id}` });
        return { id: u.id, titulo: nombreArt(u.articulo_id), codigo: `#${u.numero}`, detalle, cuando: cuandoFue(u.desde_at, hoy), chip: null, acciones };
      });
    secciones.push({
      id: "revision",
      titulo: "En revisión",
      ayuda: "Volvieron con falla o incompletas. No se prestan hasta que alguien las revise.",
      filas,
    });
  }

  // 7. En taller externo ───────────────────────────────────────────────────
  {
    // La fecha prevista de vuelta llega con los mantenimientos (fase 2). Mientras, se
    // muestra todo lo que está en el taller, lo que más tiempo lleva primero.
    const filas: FilaBandeja[] = unidadesActivas
      .filter((u) => u.estado === "en_mantenimiento")
      .map((u) => {
        const m = e.ultimos[u.id];
        const n = Math.max(0, diasEntre(fechaBA(u.desde_at), hoy));
        const que = `${nombreArt(u.articulo_id)} ${u.numero}`;
        return {
          id: u.id,
          titulo: nombreArt(u.articulo_id),
          codigo: `#${u.numero}`,
          detalle: [`se envió el ${fechaCorta(fechaBA(u.desde_at))}`, m?.motivo ? `«${m.motivo}»` : null].filter(Boolean).join(" · "),
          cuando: n === 0 ? "hoy" : dias(n),
          chip: null,
          acciones: e.yo.esEncargado ? [{ tipo: "taller_vuelta", articuloId: u.articulo_id, unidadId: u.id, que } as AccionBandeja] : [],
          dias: n,
        };
      })
      .sort((a, b) => b.dias - a.dias);
    secciones.push({
      id: "taller",
      titulo: "En taller externo",
      ayuda: "Lo que está en un taller de afuera, lo que más tiempo lleva primero.",
      filas,
    });
  }

  // 8. Inspecciones de seguridad que vencen ────────────────────────────────
  {
    const filas: FilaBandeja[] = [];
    for (const u of unidadesActivas) {
      const a = articulo.get(u.articulo_id);
      if (!a?.seguridad_critica || u.estado === "baja" || u.estado === "perdida" || u.estado === "faltante") continue;
      const est = inspeccion(u.proxima_inspeccion, hoy, avisoInspeccion);
      if (est !== "vencida" && est !== "por_vencer") continue;
      const proxima = u.proxima_inspeccion as string;
      const vencida = est === "vencida";
      const n = Math.abs(diasEntre(hoy, proxima));
      const afuera = /^(p|x|c|o):/.test(u.lugar);
      const dondeTxt = afuera ? `afuera con ${nombreLugar(u.lugar)}` : u.lugar.startsWith("u:") ? `en el pañol, ${nombreLugar(u.lugar)}` : nombreLugar(u.lugar);
      const acciones: AccionBandeja[] = [];
      if (afuera) {
        const herramienta = a.nombre;
        const wa = whatsapp("Pedir que vuelva", `inspeccion:${u.id}:${proxima}:${est}`, contactoDe(u.lugar, u.capataz_id), (nombre) =>
          mensajeInspeccion({ nombre, herramienta, numero: u.numero, proxima, vencida }));
        if (wa) acciones.push(wa);
      }
      acciones.push({ tipo: "link", etiqueta: "Abrir la ficha", href: `/deposito/panol/herramientas/${u.id}` });
      filas.push({
        id: `${u.id}:${proxima}:${est}`,
        titulo: a.nombre,
        codigo: `#${u.numero}`,
        detalle: `${vencida ? "Inspección de seguridad vencida el" : "La inspección de seguridad vence el"} ${fechaCorta(proxima)} · ${dondeTxt}`,
        cuando: vencida ? (n === 0 ? "hoy" : `hace ${dias(n)}`) : n === 0 ? "hoy" : `en ${dias(n)}`,
        chip: vencida ? { texto: afuera ? "No usar" : "No sale", tono: "bloqueo" } : { texto: "Vence pronto", tono: "aviso" },
        acciones,
        dias: vencida ? n : -n,
        urgente: vencida && afuera,
      });
    }
    filas.sort((a, b) => (b.dias ?? 0) - (a.dias ?? 0));
    secciones.push({
      id: "inspecciones",
      titulo: "Inspecciones de seguridad que vencen",
      ayuda: `Vencidas y las que vencen en los próximos ${dias(avisoInspeccion)}, incluido lo que está afuera. Con la inspección vencida no sale del pañol.`,
      filas,
    });
  }

  // 9. Artículos sin alta ──────────────────────────────────────────────────
  {
    const filas: FilaBandeja[] = e.sinAlta.map((s) => {
      const quien = s.quien_id ? persona.get(`${s.quien_tipo === "externa" ? "x" : "p"}:${s.quien_id}`)?.nombre ?? null : null;
      const acciones: AccionBandeja[] = [
        { tipo: "link", etiqueta: "Dar de alta", href: `/deposito/panol/stock?nuevo=${encodeURIComponent(s.descripcion)}&sin_alta=${s.id}` },
      ];
      if (e.yo.esEncargado) acciones.push({ tipo: "sin_alta_resuelto", sinAltaId: s.id, que: s.descripcion });
      return {
        id: s.id,
        titulo: `«${s.descripcion}»`,
        codigo: Number(s.cantidad) !== 1 ? `× ${numero(Number(s.cantidad))}` : null,
        detalle: [quien, textoOt(s.odoo_ot_id, e.ots), s.foto_path ? "con foto" : null].filter(Boolean).join(" · ") || "Sin datos de quién",
        cuando: cuandoFue(s.created_at, hoy),
        chip: null,
        acciones,
      };
    });
    secciones.push({
      id: "sin_alta",
      titulo: "Artículos sin alta",
      ayuda: "Se llevaron con «Me llevo algo que no está». Ya quedaron registrados; falta darlos de alta.",
      filas,
    });
  }

  // 10. Movido sin nadie a cargo ───────────────────────────────────────────
  {
    const ayer = new Date(Date.parse(`${hoy}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
    const filas: FilaBandeja[] = [];
    for (const [dia, rotulo] of [[ayer, "Ayer"], [hoy, "Hoy"]] as const) {
      const vales = e.valesSinEncargado.filter((v) => fechaBA(v.created_at) === dia);
      if (vales.length === 0) continue;
      const horas = vales.map((v) => v.created_at).sort();
      const desde = HORA.format(new Date(horas[0]));
      const hasta = HORA.format(new Date(horas[horas.length - 1]));
      filas.push({
        id: `sin_encargado:${dia}`,
        titulo: `${rotulo}, ${desde === hasta ? `a las ${desde}` : `de ${desde} a ${hasta}`}`,
        codigo: null,
        detalle: resumenMovimientos(vales.flatMap((v) => v.movimientos), vales.length),
        cuando: null,
        chip: null,
        acciones: [{ tipo: "link", etiqueta: "Revisar", href: "/deposito/panol/movimientos?sin_encargado=1" }],
      });
    }
    secciones.push({
      id: "sin_encargado",
      titulo: "Movido sin nadie a cargo",
      ayuda: "Lo que se registró en autoservicio en el kiosco, ayer y hoy.",
      filas,
    });
  }

  const bajas = bajasConCosas(e, nombreArt);
  return {
    generado: e.ahora,
    hoy,
    yo: e.yo,
    parametros: e.parametros,
    bajas,
    secciones,
    pendientes: secciones.reduce((n, s) => n + s.filas.length, 0) + bajas.length,
  };
}

// ─── Piezas ─────────────────────────────────────────────────────────────────

const NOMBRE_MOV: Partial<Record<TipoMovimiento, [string, string]>> = {
  retiro: ["retiro", "retiros"],
  prestamo: ["préstamo", "préstamos"],
  devolucion: ["devolución", "devoluciones"],
  sobrante: ["sobrante devuelto", "sobrantes devueltos"],
  transferencia: ["pase de mano", "pases de mano"],
};

/** "14 movimientos en 6 vales: 9 retiros, 3 devoluciones y 2 préstamos." */
export function resumenMovimientos(tipos: TipoMovimiento[], vales: number): string {
  const cuenta = new Map<string, number>();
  for (const t of tipos) {
    const k = NOMBRE_MOV[t] ? t : "otro";
    cuenta.set(k, (cuenta.get(k) ?? 0) + 1);
  }
  const partes = [...cuenta.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([t, n]) => {
      const nombres = NOMBRE_MOV[t as TipoMovimiento] ?? ["otro", "otros"];
      return `${n} ${n === 1 ? nombres[0] : nombres[1]}`;
    });
  const cabeza = `${plural(tipos.length, "movimiento", "movimientos")} en ${plural(vales, "vale", "vales")}`;
  return partes.length ? `${cabeza}: ${enumerar(partes)}.` : `${cabeza}.`;
}

/**
 * Lo que sigue en "faltante" de algo a granel, repartido entre los movimientos que lo
 * mandaron ahí.
 *
 * El saldo de "faltante" es uno solo por artículo y talle: no dice de quién era cada parte.
 * Eso está en los movimientos. Se supone que lo que se resolvió (pérdida, recuperado) fue
 * lo más viejo —es lo primero que se pasa a pérdida—, así que el saldo vigente se le asigna
 * a los faltantes más recientes. Si el saldo es 0, no hay nada que mostrar aunque haya
 * movimientos viejos.
 */
export function faltantesGranelVigentes(saldos: readonly Saldo[], movimientos: readonly FaltanteGranel[]): FaltanteGranel[] {
  const clave = (a: string, v: string | null) => `${a}:${v ?? "-"}`;
  const resto = new Map<string, number>();
  for (const s of saldos) if (s.lugar === "faltante" && Number(s.cantidad) > 0) resto.set(clave(s.articulo_id, s.variante_id), Number(s.cantidad));
  const salida: FaltanteGranel[] = [];
  const recientes = [...movimientos].sort((a, b) => b.created_at.localeCompare(a.created_at));
  for (const m of recientes) {
    const k = clave(m.articulo_id, m.variante_id);
    const queda = resto.get(k) ?? 0;
    if (queda <= 0) continue;
    const toma = Math.min(queda, Number(m.cantidad));
    resto.set(k, queda - toma);
    salida.push({ ...m, cantidad: toma });
  }
  return salida;
}

/**
 * Legajos dados de baja (y cuadrillas disueltas) que todavía tienen cosas a su nombre. La
 * baja no se frena (decisión 8): se avisa arriba de la bandeja para reasignar.
 */
function bajasConCosas(e: EntradaBandeja, nombreArt: (a: string, v?: string | null) => string): AvisoBaja[] {
  const inactivos = new Map<string, { clase: "persona" | "cuadrilla"; nombre: string }>();
  for (const p of e.personas) if (!p.activo) inactivos.set(`${p.tipo === "externa" ? "x" : "p"}:${p.id}`, { clase: "persona", nombre: p.nombre });
  for (const c of e.cuadrillas) if (!c.activo) inactivos.set(`c:${c.id}`, { clase: "cuadrilla", nombre: c.nombre });
  if (inactivos.size === 0) return [];

  const cosas = new Map<string, string[]>();
  const sumar = (lugar: string, cosa: string) => cosas.set(lugar, [...(cosas.get(lugar) ?? []), cosa]);
  for (const u of e.unidades) if (u.activo && inactivos.has(u.lugar)) sumar(u.lugar, `${nombreArt(u.articulo_id)} #${u.numero}`);
  for (const s of e.saldos) {
    // Las unidades con número ya están contadas arriba, una por una.
    const art = e.articulos.find((a) => a.id === s.articulo_id);
    if (!inactivos.has(s.lugar) || Number(s.cantidad) <= 0 || art?.tipo === "herramienta") continue;
    sumar(s.lugar, `${numero(Number(s.cantidad))} ${art?.unidad ?? "u."} de ${nombreArt(s.articulo_id, s.variante_id)}`);
  }
  return [...cosas.entries()].map(([lugar, lista]) => {
    const quien = inactivos.get(lugar)!;
    return { lugar, clase: quien.clase, nombre: quien.nombre, cosas: lista, href: `/deposito/panol/afuera?titular=${encodeURIComponent(lugar)}` };
  });
}

/** "Taladro #H-026 y Nivel láser #H-033", cortado si son muchas. */
export function listaCorta(cosas: string[], max = 3): string {
  if (cosas.length <= max) return enumerar(cosas);
  return `${cosas.slice(0, max).join(", ")} y ${cosas.length - max} más`;
}
