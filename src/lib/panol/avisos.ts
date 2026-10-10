// Qué avisos crea el pañol (docs/modulo-panol.md §7).
//
// SALEN DE LA BANDEJA, NO DE UNA CUENTA APARTE: el barrido diario arma la misma bandeja que
// ve el encargado (bandeja.ts) y de ahí decide qué avisar. Así un aviso nunca dice algo que
// la bandeja no muestra, y al revés.
//
// A QUIÉN. crearAlertas reparte por ROL (`destinatario_rol`) y los encargados del pañol no
// son un rol: es quien tiene Pañol en "editar", sea de depósito, operativo o admin. Se
// dirigen a `deposito` porque es el rol de casi todos ellos; el admin los ve igual (la
// política de lectura de `alertas` le muestra todo). Quien esté a cargo con otro rol se
// entera por el canal de Slack del pañol, que es el destino real de estos avisos (§7). Mandarlos
// a todos (`null`) le llenaría la campanita de stock a Comercial.
//
// LA IDEMPOTENCIA ES DE LA CLAVE (ver alertas/servicio.ts): cada aviso dice una novedad una
// sola vez. Lo que no tiene un "desde cuándo" propio (stock bajo, negativo) lleva la semana
// en la clave: se recuerda una vez por semana mientras siga igual, no todos los días.
//
// Lógica pura: sólo importa tipos.

import type { NuevaAlerta, Prioridad, TipoAlerta } from "@/lib/alertas/servicio";
import type { Bandeja, FilaBandeja, IdSeccion } from "./bandeja.ts";
import { listaCorta } from "./bandeja.ts";
import type { ClaveParametro } from "./tipos.ts";

export const DESTINO_PANOL = "deposito" as const;

/** "2026-10-10" → "2026-W41" (semana ISO, lunes a domingo). */
export function semanaISO(fecha: string): string {
  const d = new Date(`${fecha.slice(0, 10)}T12:00:00Z`);
  const dia = (d.getUTCDay() + 6) % 7; // lunes = 0
  d.setUTCDate(d.getUTCDate() - dia + 3); // el jueves de esa semana define el año
  const anio = d.getUTCFullYear();
  const primerJueves = new Date(Date.UTC(anio, 0, 4));
  const semana = 1 + Math.round(((d.getTime() - primerJueves.getTime()) / 86_400_000 - 3 + ((primerJueves.getUTCDay() + 6) % 7)) / 7);
  return `${anio}-W${String(semana).padStart(2, "0")}`;
}

type Regla = {
  tipo: TipoAlerta;
  /** null = esta fila no avisa (todavía). */
  avisar: (f: FilaBandeja) => { prioridad: Prioridad; sufijo?: string } | null;
  titulo: (f: FilaBandeja) => string;
};

/**
 * Una regla por sección. Lo que no está acá (en revisión, en taller) se ve en la bandeja y
 * no avisa: no se le escapa a nadie que la abra, y no apura a nadie que no la abra.
 */
function reglas(b: Bandeja, p: Partial<Record<ClaveParametro, number>>): Partial<Record<IdSeccion, Regla>> {
  const semana = semanaISO(b.hoy);
  // El préstamo vence a la medianoche: se avisa pasadas las horas del parámetro desde ahí.
  const diasVencida = 1 + Math.floor((p.vencida_aviso_horas ?? 24) / 24);
  return {
    ajustes: { tipo: "panol_ajuste", avisar: () => ({ prioridad: "media" }), titulo: (f) => `${f.titulo}: ajuste por aprobar` },
    negativo: { tipo: "panol_stock", avisar: () => ({ prioridad: "media", sufijo: `negativo:${semana}` }), titulo: (f) => `Stock negativo — ${f.titulo}` },
    reponer: { tipo: "panol_stock", avisar: () => ({ prioridad: "baja", sufijo: `reponer:${semana}` }), titulo: (f) => `Reponer — ${f.titulo}` },
    vencidas: {
      tipo: "panol_vencida",
      avisar: (f) => ((f.dias ?? 0) >= diasVencida ? { prioridad: "media" } : null),
      titulo: (f) => `${f.titulo} ${f.codigo ?? ""} no volvió`.replace(/\s+/g, " "),
    },
    faltantes: {
      tipo: "panol_faltante",
      // Avisa cuando ya se puede pasar a pérdida: antes, el faltante es del capataz.
      avisar: (f) => (f.urgente ? { prioridad: "media" } : null),
      titulo: (f) => `${f.titulo} ${f.codigo ?? ""} — ${f.dias} días faltante`.replace(/\s+/g, " "),
    },
    inspecciones: {
      tipo: "panol_inspeccion",
      avisar: (f) => ({ prioridad: f.urgente ? "alta" : f.chip?.tono === "bloqueo" ? "media" : "baja" }),
      titulo: (f) => `${f.titulo} ${f.codigo ?? ""} — ${f.chip?.tono === "bloqueo" ? "inspección vencida" : "vence la inspección"}`.replace(/\s+/g, " "),
    },
    sin_alta: { tipo: "panol_sin_alta", avisar: () => ({ prioridad: "baja" }), titulo: (f) => `Sin alta — ${f.titulo}` },
    sin_encargado: {
      tipo: "panol_resumen",
      // Sólo el de ayer: el de hoy todavía está pasando.
      avisar: (f) => (f.id === `sin_encargado:${b.hoy}` ? null : { prioridad: "baja" }),
      titulo: (f) => `Movido sin nadie a cargo — ${f.titulo}`,
    },
  };
}

export function avisosDeBandeja(b: Bandeja): NuevaAlerta[] {
  const r = reglas(b, b.parametros);
  const avisos: NuevaAlerta[] = [];
  for (const s of b.secciones) {
    const regla = r[s.id];
    if (!regla) continue;
    for (const f of s.filas) {
      const a = regla.avisar(f);
      if (!a) continue;
      avisos.push({
        tipo: regla.tipo,
        clave: [regla.tipo, f.id, a.sufijo].filter(Boolean).join(":"),
        titulo: regla.titulo(f),
        descripcion: f.detalle,
        prioridad: a.prioridad,
        enlace: `/deposito/panol#${s.id}`,
        destinatarioRol: DESTINO_PANOL,
      });
    }
  }
  for (const baja of b.bajas) {
    avisos.push({
      tipo: "panol_baja",
      clave: `panol_baja:${baja.lugar}`,
      titulo: `${baja.clase === "cuadrilla" ? "Cuadrilla disuelta" : "Legajo dado de baja"} con cosas a cargo — ${baja.nombre}`,
      descripcion: `${listaCorta(baja.cosas)}. La baja no se frenó: hay que reasignarlo.`,
      prioridad: "alta",
      enlace: baja.href,
      destinatarioRol: DESTINO_PANOL,
    });
  }
  return avisos;
}
