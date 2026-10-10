"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CoordinadorPublico, VistaPublica } from "@/lib/hoja-dia/vista";
import { horaDe } from "./aplicar";
import type { AccionesCelular, Conexion, Pendiente, ResultadoToque, Toque } from "./tipos";

// El link /h/[token] en el teléfono: trae la hoja, la guarda para cuando no haya señal,
// la refresca cada 30 s mientras está a la vista (y al volver a la app o a la señal), y
// manda los toques. Sin señal, los toques quedan en cola CON LA HORA EN QUE SE TOCARON
// (`at`) y salen solos cuando vuelve (§12 "Sin señal").
//
// Todo lo guardado va en localStorage envuelto en try/catch: en modo privado, con el
// almacenamiento lleno o bloqueado, la página sigue andando (sin la copia offline).

const CADA = 30_000;
const ESPERA = 12_000;
const clave = (token: string) => `hoja-dia:vista:${token}`;
const claveCola = (token: string) => `hoja-dia:cola:${token}`;
const CLAVE_COORD = "hoja-dia:coordinador";

type Guardada = { vista: VistaPublica; at: string };

function leer<T>(k: string): T | null {
  try {
    const s = localStorage.getItem(k);
    return s ? (JSON.parse(s) as T) : null;
  } catch {
    return null;
  }
}
function escribir(k: string, v: unknown) {
  try {
    if (v == null) localStorage.removeItem(k);
    else localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* sin almacenamiento: no hay copia offline, nada más */
  }
}
const coordDe = (v: VistaPublica): CoordinadorPublico | null => ("coordinador" in v && v.coordinador ? v.coordinador : null);
const enLinea = () => (typeof navigator === "undefined" ? true : navigator.onLine !== false);

async function conTiempo(url: string, init?: RequestInit): Promise<Response> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ESPERA);
  try {
    return await fetch(url, { ...init, signal: ctl.signal, cache: "no-store" });
  } finally {
    clearTimeout(t);
  }
}

export type EstadoHojaPublica = {
  /** null mientras carga la primera vez (o sin nada guardado). */
  vista: VistaPublica | null;
  conexion: Conexion;
  /** No hay red y nunca se descargó. */
  sinDescargar: boolean;
  /** El servidor no contestó y no hay nada guardado. */
  error: string | null;
  cargando: boolean;
  pendientes: Pendiente[];
  acciones: AccionesCelular;
  coordinadorConocido: CoordinadorPublico | null;
};

export function useHojaPublica(token: string): EstadoHojaPublica {
  const [vista, setVista] = useState<VistaPublica | null>(null);
  const [guardadaAt, setGuardadaAt] = useState<string | null>(null);
  const [sinRed, setSinRed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [pendientes, setPendientes] = useState<Pendiente[]>([]);
  const [coordinadorConocido, setCoord] = useState<CoordinadorPublico | null>(null);
  const enCurso = useRef<Promise<void> | null>(null);
  const vaciando = useRef(false);
  const pendRef = useRef<Pendiente[]>([]);

  const guardarCola = useCallback((ps: Pendiente[]) => {
    pendRef.current = ps;
    setPendientes(ps);
    escribir(claveCola(token), ps.length ? ps.map((p) => ({ ...p, estado: "cola" })) : null);
  }, [token]);

  // Lo guardado en el teléfono, apenas abre (antes de que conteste la red).
  useEffect(() => {
    const g = leer<Guardada>(clave(token));
    if (g?.vista) { setVista(g.vista); setGuardadaAt(g.at); }
    setCoord(leer<CoordinadorPublico>(CLAVE_COORD));
    const c = leer<Pendiente[]>(claveCola(token)) ?? [];
    pendRef.current = c.map((p) => ({ ...p, estado: "cola" as const }));
    setPendientes(pendRef.current);
  }, [token]);

  // Un GET a la vez: si hay uno en camino y hace falta lo último (después de un toque),
  // se espera a que termine y se pide de nuevo (así uno viejo nunca pisa a uno nuevo).
  const traer = useCallback(async () => {
    if (!enLinea()) { setSinRed(true); setCargando(false); return; }
    try {
      const res = await conTiempo(`/api/public/hoja/${encodeURIComponent(token)}`);
      const body = (await res.json().catch(() => null)) as VistaPublica | { error?: string } | null;
      if (body && "situacion" in body) {
        const at = new Date().toISOString();
        setVista(body);
        setGuardadaAt(at);
        setSinRed(false);
        setError(null);
        escribir(clave(token), { vista: body, at } satisfies Guardada);
        const co = coordDe(body);
        if (co) { setCoord(co); escribir(CLAVE_COORD, co); }
      } else {
        // Contestó con error (502): se sigue viendo lo guardado, avisando que no se actualizó.
        setSinRed(false);
        setError((body && "error" in body && body.error) || "No se pudo cargar la hoja. Probá de nuevo en un rato.");
      }
    } catch {
      setSinRed(true);
    } finally {
      setCargando(false);
    }
  }, [token]);
  const cargar = useCallback(async (forzar = false) => {
    if (enCurso.current) {
      if (!forzar) return enCurso.current;
      await enCurso.current;
      if (enCurso.current) return enCurso.current;
    }
    const p = traer().finally(() => { if (enCurso.current === p) enCurso.current = null; });
    enCurso.current = p;
    return p;
  }, [traer]);

  /** Manda un toque. `true` si salió, `false` si no hay red (queda en cola), o el error del servidor. */
  const mandar = useCallback(async (p: Pendiente): Promise<true | false | string> => {
    if (!enLinea()) return false;
    try {
      const res = await conTiempo(`/api/public/hoja/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...p.toque, at: p.at }),
      });
      if (res.ok) return true;
      if (res.status === 429 || res.status >= 500) return false;
      const b = (await res.json().catch(() => null)) as { error?: string } | null;
      return b?.error ?? "No se pudo.";
    } catch {
      return false;
    }
  }, [token]);

  /** Manda lo que quedó en cola, en orden. Si se corta la señal, para y espera. */
  const vaciarCola = useCallback(async () => {
    if (vaciando.current || !enLinea()) return;
    vaciando.current = true;
    let algo = false;
    try {
      for (const p of [...pendRef.current]) {
        if (p.estado !== "cola") continue;
        const r = await mandar(p);
        if (r === false) break;
        // Salió, o el servidor no lo acepta (ya no es tuyo, venció): no se reintenta.
        guardarCola(pendRef.current.filter((x) => x.id !== p.id));
        algo = true;
      }
    } finally {
      vaciando.current = false;
    }
    if (algo) await cargar(true);
  }, [cargar, guardarCola, mandar]);

  const tocar = useCallback(async (toque: Toque): Promise<ResultadoToque> => {
    const p: Pendiente = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, toque, at: new Date().toISOString(), estado: enLinea() ? "enviando" : "cola" };
    guardarCola([...pendRef.current, p]);
    if (p.estado === "cola") { setSinRed(true); return { k: "cola" }; }
    const r = await mandar(p);
    if (r === true) {
      await cargar(true);
      guardarCola(pendRef.current.filter((x) => x.id !== p.id));
      return { k: "ok" };
    }
    if (r === false) {
      guardarCola(pendRef.current.map((x) => (x.id === p.id ? { ...x, estado: "cola" as const } : x)));
      setSinRed(true);
      return { k: "cola" };
    }
    guardarCola(pendRef.current.filter((x) => x.id !== p.id));
    return { k: "error", error: r };
  }, [cargar, guardarCola, mandar]);

  const quitarDeCola = useCallback((id: string) => guardarCola(pendRef.current.filter((x) => x.id !== id)), [guardarCola]);

  // Primera carga, cada 30 s a la vista, al volver a la app y al volver la señal.
  useEffect(() => {
    const alPrimerPlano = () => { if (document.visibilityState === "visible") { void vaciarCola(); void cargar(); } };
    const alVolverRed = () => { setSinRed(false); void vaciarCola().then(() => cargar()); };
    const alPerderRed = () => setSinRed(true);
    void cargar().then(vaciarCola);
    const id = setInterval(() => {
      if (document.visibilityState !== "visible" || !enLinea()) return;
      void cargar();
      if (pendRef.current.some((p) => p.estado === "cola")) void vaciarCola();
    }, CADA);
    document.addEventListener("visibilitychange", alPrimerPlano);
    window.addEventListener("online", alVolverRed);
    window.addEventListener("offline", alPerderRed);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", alPrimerPlano);
      window.removeEventListener("online", alVolverRed);
      window.removeEventListener("offline", alPerderRed);
    };
  }, [cargar, vaciarCola]);

  const fecha = vista && "fecha" in vista ? vista.fecha : null;
  const desde = guardadaAt && fecha ? horaDe(fecha, guardadaAt) : null;
  const conexion: Conexion = {
    sinConexion: !!vista && (sinRed || !!error),
    sinActualizar: !sinRed && !!error,
    desde,
  };

  return {
    vista,
    conexion,
    sinDescargar: !vista && sinRed,
    error: !vista ? error : null,
    cargando: cargando && !vista,
    pendientes,
    acciones: { tocar, quitarDeCola, reintentar: () => void cargar(true) },
    coordinadorConocido,
  };
}
