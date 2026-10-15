"use client";

// Estado de cliente del sector Dirección (lo monta el layout):
//  · permisos de quien mira (conSocios, puedeEditar) para ARMAR la pantalla — la puerta de
//    verdad son el proxy y el servidor;
//  · la moneda (en la URL: ?moneda=ARS; USD por defecto) y el dólar de hoy → useFormato();
//  · la lectura de la pantalla abierta ("Datos de Odoo al…", banda de Odoo caído), que cada
//    página registra con <LecturaPantalla>;
//  · la pila del desglose (PanelDesglose): abrirNodo / volverNodo / cerrarPanel.

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { formatearValor, mon, unidad, type CtxFormato } from "@/lib/direccion/formato";
import { DEF, DICC, type DefIndicador } from "@/lib/direccion/diccionario";
import type { Lectura, Moneda, Monto, NodoRef, PantallaId, Regla, TcDia, Valor } from "@/lib/direccion/tipos";

type EstadoLectura = {
  pantalla: PantallaId | null;
  lectura: Lectura | null;
  tc: TcDia | null;
  vacia?: boolean;
  /** Datos con más de 26 h: el encabezado pone el chip ámbar "Datos del …" (§6). */
  vieja?: boolean;
};

type Ctx = {
  conSocios: boolean;
  /** El diccionario de quien mira: con las definiciones reservadas completas sólo si es socio. */
  defs: Readonly<Record<string, DefIndicador>>;
  puedeEditar: boolean;
  /** Dólar de hoy leído por el layout (respaldo si la pantalla no trae el suyo). */
  tcLayout: TcDia | null;
  lectura: EstadoLectura;
  setLectura: (l: EstadoLectura) => void;
  pila: NodoRef[];
  abrirNodo: (ref: NodoRef, opts?: { desdePanel?: boolean }) => void;
  reemplazarNodo: (ref: NodoRef) => void;
  irANivel: (i: number) => void;
  volverNodo: () => void;
  cerrarPanel: () => void;
};

const DireccionContext = createContext<Ctx | null>(null);

export function DireccionProvider({
  conSocios,
  puedeEditar,
  tcLayout,
  defsReservadas,
  children,
}: {
  conSocios: boolean;
  puedeEditar: boolean;
  tcLayout: TcDia | null;
  /** Lo manda el servidor sólo a socios (diccionario-socios.ts). */
  defsReservadas?: Record<string, DefIndicador>;
  children: React.ReactNode;
}) {
  const defs = useMemo(() => ({ ...DEF, ...(conSocios ? defsReservadas ?? {} : {}) }), [conSocios, defsReservadas]);
  const [lectura, setLectura] = useState<EstadoLectura>({ pantalla: null, lectura: null, tc: null });
  const [pila, setPila] = useState<NodoRef[]>([]);

  // Desde una tarjeta o la narrativa, el panel arranca de cero; desde una fila del panel, apila.
  const abrirNodo = useCallback((ref: NodoRef, opts?: { desdePanel?: boolean }) => setPila((p) => (opts?.desdePanel ? [...p, ref] : [ref])), []);
  const reemplazarNodo = useCallback((ref: NodoRef) => setPila((p) => (p.length ? [...p.slice(0, -1), ref] : [ref])), []);
  const irANivel = useCallback((i: number) => setPila((p) => p.slice(0, i + 1)), []);
  const volverNodo = useCallback(() => setPila((p) => p.slice(0, -1)), []);
  const cerrarPanel = useCallback(() => setPila([]), []);

  const valor = useMemo<Ctx>(
    () => ({ conSocios, defs, puedeEditar, tcLayout, lectura, setLectura, pila, abrirNodo, reemplazarNodo, irANivel, volverNodo, cerrarPanel }),
    [conSocios, defs, puedeEditar, tcLayout, lectura, pila, abrirNodo, reemplazarNodo, irANivel, volverNodo, cerrarPanel],
  );
  return <DireccionContext.Provider value={valor}>{children}</DireccionContext.Provider>;
}

/** El diccionario de quien mira (lista y por id), con lo reservado completo sólo para socios. */
export function useDiccionario(): { def: (kpi: string) => DefIndicador | undefined; lista: DefIndicador[] } {
  const { defs, conSocios } = useDireccion();
  return useMemo(
    () => ({ def: (kpi: string) => defs[kpi], lista: DICC.filter((d) => !d.reservado || conSocios).map((d) => defs[d.id] ?? d) }),
    [defs, conSocios],
  );
}

export function useDireccion(): Ctx {
  const c = useContext(DireccionContext);
  if (!c) throw new Error("useDireccion fuera de DireccionProvider (el layout de /direccion lo monta).");
  return c;
}

/**
 * La moneda del sector, en la URL (?moneda=ARS). Cambiarla no pide nada al servidor: los
 * componentes formatean en el cliente. Se conserva al navegar entre pestañas.
 */
export function useMoneda(): [Moneda, (m: Moneda) => void] {
  const q = useSearchParams();
  const moneda: Moneda = q.get("moneda") === "ARS" ? "ARS" : "USD";
  const setMoneda = useCallback((m: Moneda) => {
    const url = new URL(window.location.href);
    if (m === "USD") url.searchParams.delete("moneda");
    else url.searchParams.set("moneda", m);
    window.history.replaceState(null, "", url.toString());
  }, []);
  return [moneda, setMoneda];
}

/** "?moneda=ARS" para sumar a un link interno (vacío en USD). */
export function useQueryMoneda(): string {
  const [moneda] = useMoneda();
  return moneda === "USD" ? "" : `?moneda=${moneda}`;
}

/**
 * Todo el formato de montos del cliente sale de acá: la moneda elegida y el dólar de la
 * lectura (el del día del snapshot si se muestra uno; si no, el de hoy).
 */
export function useFormato() {
  const [moneda] = useMoneda();
  const { lectura, tcLayout } = useDireccion();
  const tc = lectura.tc ?? tcLayout;
  return useMemo(() => {
    const ctx: CtxFormato = { moneda, tc };
    return {
      moneda,
      tc,
      ctx,
      mon: (m: Monto | null | undefined) => mon(m, ctx),
      valor: (v: Valor) => formatearValor(v, ctx),
      unidad: (r: Regla) => unidad(r, moneda),
    };
  }, [moneda, tc]);
}
