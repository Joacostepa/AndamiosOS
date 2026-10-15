"use client";

// Lo guardado en Supabase para "Para decidir" (dueño vigente y notas), compartido entre la
// lista, la hoja del celular y el modo reunión. Se escribe con POST /api/direccion/dueno y
// /api/direccion/notas (nunca Odoo). Si la migración todavía no se aplicó, la API contesta
// 503 con un mensaje amable: se muestra y se vuelve atrás, sin romper la pantalla.

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { toast } from "sonner";
import { duenoVigente, notasDe, type NotaDecision } from "@/lib/direccion/calculo/decisiones";
import type { Decision } from "@/lib/direccion/tipos";

export type PropiosSemana = {
  /** false = faltan las tablas: no se puede guardar (se avisa al intentar). */
  disponible: boolean;
  duenos: Record<string, string | null>;
  notas: NotaDecision[];
  metas: Record<string, number>;
};

type Ctx = {
  disponible: boolean;
  metas: Record<string, number>;
  dueno: (d: Decision) => string | null;
  notas: (id: string) => NotaDecision[];
  asignarDueno: (d: Decision, dueno: string | null) => Promise<void>;
  /** Devuelve la nota guardada (o null si no se pudo). */
  anotar: (d: Decision, texto: string, opts?: { reunion?: boolean }) => Promise<NotaDecision | null>;
};

const PropiosContext = createContext<Ctx | null>(null);

async function enviar(url: string, body: unknown): Promise<{ ok: true; j: Record<string, unknown> } | { ok: false; error: string }> {
  try {
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    if (!r.ok) return { ok: false, error: typeof j.error === "string" ? j.error : "No se pudo guardar. Probá de nuevo." };
    return { ok: true, j };
  } catch {
    return { ok: false, error: "No hay conexión. Probá de nuevo." };
  }
}

export function PropiosProvider({ inicial, autor, children }: { inicial: PropiosSemana; autor: string | null; children: React.ReactNode }) {
  const [duenos, setDuenos] = useState(inicial.duenos);
  const [notas, setNotas] = useState(inicial.notas);

  const asignarDueno = useCallback(async (d: Decision, dueno: string | null) => {
    const antes = duenos;
    setDuenos((x) => ({ ...x, [d.id]: dueno }));
    const r = await enviar("/api/direccion/dueno", { alertaId: d.id, dueno });
    if (!r.ok) {
      setDuenos(antes);
      toast(r.error);
    }
  }, [duenos]);

  const anotar = useCallback(async (d: Decision, texto: string, opts?: { reunion?: boolean }) => {
    const limpio = texto.trim();
    if (!limpio) return null;
    const dueno = duenoVigente(d, duenos);
    const r = await enviar("/api/direccion/notas", { alertaId: d.id, texto: limpio, dueno, reunion: !!opts?.reunion });
    if (!r.ok) {
      toast(r.error);
      return null;
    }
    const nota: NotaDecision = {
      id: String(r.j.id ?? `local-${Date.now()}`),
      alertaId: d.id,
      texto: limpio,
      dueno,
      reunion: !!opts?.reunion,
      autor,
      fecha: typeof r.j.fecha === "string" ? r.j.fecha : new Date().toISOString(),
    };
    setNotas((x) => [nota, ...x]);
    return nota;
  }, [duenos, autor]);

  const valor = useMemo<Ctx>(() => ({
    disponible: inicial.disponible,
    metas: inicial.metas,
    dueno: (d) => duenoVigente(d, duenos),
    notas: (id) => notasDe(id, notas),
    asignarDueno,
    anotar,
  }), [inicial.disponible, inicial.metas, duenos, notas, asignarDueno, anotar]);

  return <PropiosContext.Provider value={valor}>{children}</PropiosContext.Provider>;
}

export function usePropios(): Ctx {
  const c = useContext(PropiosContext);
  if (!c) throw new Error("usePropios fuera de PropiosProvider.");
  return c;
}
