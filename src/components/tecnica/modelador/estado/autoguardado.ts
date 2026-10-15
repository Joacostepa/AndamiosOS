"use client";

// Autoguardado: PATCH con 1,5 s de respiro después del último cambio, con control optimista de
// revisión. Si otra persona guardó antes (409), queda en "conflicto" y la pantalla pregunta:
// recargar lo de la otra persona o sobrescribir con lo propio.

import { useEffect } from "react";
import type { Diseno, Resultado } from "@/lib/tecnica/modelo";
import { resumenDe as resumenPersistencia } from "@/lib/tecnica/persistencia/computo";
import { serializarGuardado } from "@/lib/tecnica/persistencia/candado";
import { ErrorRevision, guardarModelo } from "../datos/api";
import type { ResumenModelo } from "../datos/tipos";
import { useEditor } from "./store";

const ESPERA_MS = 1500;
let revisionRemota: number | null = null;

/** El resumen que se guarda en tec_modelos.resumen: el mismo que arma el servidor. */
export function resumenDe(res: Resultado, diseno: Diseno): ResumenModelo {
  return resumenPersistencia(res, diseno);
}

// Un solo guardado en vuelo (src/lib/tecnica/persistencia/candado.ts, con tests): si llega otro pedido
// mientras tanto, queda pendiente y se manda al terminar con la revisión nueva.
const candado = serializarGuardado((forzar) => guardarUnaVez(forzar));

/** Guarda ya (Ctrl+S o "sobrescribir"). Devuelve true si quedó guardado. Serializa los guardados. */
export function guardarAhora(forzar = false): Promise<boolean> {
  return candado.pedir(forzar);
}

async function guardarUnaVez(forzar: boolean): Promise<boolean> {
  const s = useEditor.getState();
  if (!s.modeloId || s.soloLectura) return false;
  if (!forzar && s.version === s.versionGuardada) return true;
  const version = s.version;
  const revision = forzar && revisionRemota !== null ? revisionRemota : s.revision ?? 1;
  s.setGuardado("guardando");
  try {
    // obra_id no viaja en el autoguardado: la columna manda (la RPC de cómputo puede vincular la obra) y
    // solo se cambia cuando el usuario elige otra obra. Con el catálogo de prueba no se guarda el resumen
    // (pesos inventados nunca llegan a la base).
    const nueva = await guardarModelo({
      id: s.modeloId, revision, diseno: s.diseno, nombre: s.diseno.nombre || "Modelo sin nombre",
      ...(s.catalogo.fuente === "fixture" ? {} : { resumen: resumenDe(s.res, s.diseno) }),
    });
    revisionRemota = null;
    useEditor.getState().marcarGuardado(nueva, version);
    return true;
  } catch (e) {
    if (e instanceof ErrorRevision) {
      revisionRemota = e.revisionActual;
      useEditor.getState().setGuardado("conflicto");
    } else {
      useEditor.getState().setGuardado("error");
    }
    return false;
  }
}

export function useAutoguardado() {
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null;
    const desub = useEditor.subscribe((s, ant) => {
      if (s.version === ant.version || !s.modeloId || s.soloLectura || s.guardado === "conflicto") return;
      if (t) clearTimeout(t);
      t = setTimeout(() => {
        t = null;
        void guardarAhora();
      }, ESPERA_MS);
    });
    const antesDeSalir = (e: BeforeUnloadEvent) => {
      const s = useEditor.getState();
      if (s.modeloId && s.version !== s.versionGuardada) {
        e.preventDefault();
        void guardarAhora();
      }
    };
    window.addEventListener("beforeunload", antesDeSalir);
    return () => {
      desub();
      if (t) clearTimeout(t);
      window.removeEventListener("beforeunload", antesDeSalir);
      // lo que quedó pendiente se manda igual al salir del editor
      const s = useEditor.getState();
      if (s.modeloId && s.version !== s.versionGuardada && s.guardado !== "conflicto") void guardarAhora();
    };
  }, []);
}
