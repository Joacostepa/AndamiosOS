"use client";

// Estado de la MAQUETA del organigrama: todo en memoria (useReducer), se pierde al recargar.
//
// Dos cosas separadas a propósito (docs/organigrama/propuesta.md § 4.1):
//   - la ESTRUCTURA: `vigente` (lo publicado) y `borrador` (lo que los editores están armando).
//     Los cambios de estructura solo impactan al publicar.
//   - la OCUPACIÓN: `ocupantes`. Asignar o quitar es inmediato y NO marca el borrador.
//
// «Ver como» reemplaza al permiso real (usePuedeEditar) mientras esto sea una maqueta: así se
// puede mostrar qué ve un lector sin cambiar de usuario.

import { createContext, useCallback, useContext, useMemo, useReducer, useState } from "react";
import { toast } from "sonner";
import { diffVersiones, nodoDe, nombreCompleto, personaDe } from "@/lib/organigrama/arbol";
import {
  BORRADOR_META,
  CUADRILLAS,
  DOCUMENTOS,
  HOY,
  NODOS_BORRADOR,
  NODOS_VIGENTES,
  OCUPANTES,
  OPCIONES_VER_COMO,
  PERSONAS,
  VERSIONES,
} from "@/lib/organigrama/datos-maqueta";
import type { Cambio, DatosOrg, Documento, Modalidad, Nodo, Ocupante, Persona, Version, VerComo } from "@/lib/organigrama/tipos";

type Estado = {
  vigente: Nodo[];
  borrador: Nodo[] | null;
  borradorMeta: { fecha: string; autor: string } | null;
  versiones: Version[];
  ocupantes: Ocupante[];
  /** El editor está mirando el borrador (barra de borrador + menú ⋯ en las tarjetas). */
  editando: boolean;
};

/**
 * Lo que el Lienzo guarda para deshacer/rehacer: el borrador (estructura) y la ocupación. Lo
 * publicado (`vigente`, `versiones`) no se deshace desde el lienzo.
 */
export type FotoOrg = Pick<Estado, "borrador" | "borradorMeta" | "editando" | "ocupantes">;

type Accion =
  | { tipo: "restaurar"; foto: FotoOrg }
  | { tipo: "entrar"; autor: string }
  | { tipo: "salir" }
  | { tipo: "descartar" }
  | { tipo: "estructura"; nodos: Nodo[] }
  | { tipo: "publicar"; nota: string; autor: string }
  | { tipo: "asignar"; ocupante: Ocupante }
  | { tipo: "terminar"; id: string; hasta: string }
  | { tipo: "reponer"; ocupante: Ocupante }
  | { tipo: "borrarOcupante"; id: string };

const INICIAL: Estado = {
  vigente: NODOS_VIGENTES,
  borrador: NODOS_BORRADOR,
  borradorMeta: BORRADOR_META,
  versiones: VERSIONES,
  ocupantes: OCUPANTES,
  editando: false,
};

function reducir(e: Estado, a: Accion): Estado {
  switch (a.tipo) {
    case "restaurar":
      return { ...e, ...a.foto };
    case "entrar":
      // Si no hay borrador, se crea como copia de la vigente.
      return e.borrador
        ? { ...e, editando: true }
        : { ...e, editando: true, borrador: e.vigente, borradorMeta: { fecha: HOY, autor: a.autor } };
    case "salir":
      return { ...e, editando: false };
    case "descartar":
      return { ...e, borrador: null, borradorMeta: null, editando: false };
    case "estructura":
      return e.borrador ? { ...e, borrador: a.nodos } : e;
    case "publicar": {
      if (!e.borrador) return e;
      const numero = Math.max(0, ...e.versiones.map((v) => v.numero ?? 0)) + 1;
      const nueva: Version = {
        id: `v${numero}`,
        numero,
        estado: "publicada",
        fecha: HOY,
        autor: a.autor,
        nota: a.nota,
        cambios: diffVersiones(e.vigente, e.borrador),
      };
      return {
        ...e,
        vigente: e.borrador,
        borrador: null,
        borradorMeta: null,
        editando: false,
        versiones: [nueva, ...e.versiones.map((v) => (v.estado === "publicada" ? { ...v, estado: "archivada" as const } : v))],
      };
    }
    case "asignar":
      return { ...e, ocupantes: [...e.ocupantes, a.ocupante] };
    case "terminar":
      return { ...e, ocupantes: e.ocupantes.map((o) => (o.id === a.id ? { ...o, hasta: a.hasta } : o)) };
    case "reponer":
      return { ...e, ocupantes: e.ocupantes.map((o) => (o.id === a.ocupante.id ? a.ocupante : o)) };
    case "borrarOcupante":
      return { ...e, ocupantes: e.ocupantes.filter((o) => o.id !== a.id) };
  }
}

/** Los diálogos y hojas de edición: uno abierto a la vez, se abren desde cualquier pantalla. */
export type Dialogo =
  | { tipo: "asignar"; nodo?: string; persona?: string; reemplaza?: string }
  | { tipo: "editar"; clave: string }
  | { tipo: "mover"; clave: string }
  | { tipo: "eliminar"; clave: string }
  | { tipo: "cambios" }
  | { tipo: "publicar" }
  | { tipo: "descartar" };

type Contexto = {
  estado: Estado;
  dispatch: React.Dispatch<Accion>;
  verComo: VerComo;
  setVerComo: (v: VerComo) => void;
  puedeEditar: boolean;
  usuario: Persona | undefined;
  /** La estructura que se está mirando (el borrador si el editor está editando). */
  datos: DatosOrg;
  /** Lo publicado, para comparar y para los lectores. */
  datosVigentes: DatosOrg;
  documentos: Documento[];
  enBorrador: boolean;
  cambios: Cambio[];
  version: Version | undefined;
  busqueda: string;
  setBusqueda: (q: string) => void;
  dialogo: Dialogo | null;
  abrir: (d: Dialogo) => void;
  cerrar: () => void;
  asignar: (nodo: string, persona: string, modalidad: Modalidad, reemplaza?: string) => void;
  quitar: (ocupanteId: string) => void;
};

const Ctx = createContext<Contexto | null>(null);

export function ProveedorOrganigrama({ children }: { children: React.ReactNode }) {
  const [estado, dispatch] = useReducer(reducir, INICIAL);
  const [verComo, setVerComo] = useState<VerComo>("direccion");
  const [busqueda, setBusqueda] = useState("");
  const [dialogo, setDialogo] = useState<Dialogo | null>(null);

  const opcion = OPCIONES_VER_COMO.find((o) => o.id === verComo)!;
  const puedeEditar = opcion.editor;
  const usuario = personaDe(PERSONAS, opcion.persona);
  const enBorrador = puedeEditar && estado.editando && !!estado.borrador;

  const datosVigentes = useMemo<DatosOrg>(
    () => ({ nodos: estado.vigente, personas: PERSONAS, ocupantes: estado.ocupantes, cuadrillas: CUADRILLAS }),
    [estado.vigente, estado.ocupantes],
  );
  const datos = useMemo<DatosOrg>(
    () => (enBorrador && estado.borrador ? { ...datosVigentes, nodos: estado.borrador } : datosVigentes),
    [enBorrador, estado.borrador, datosVigentes],
  );
  const cambios = useMemo(() => (estado.borrador ? diffVersiones(estado.vigente, estado.borrador) : []), [estado.vigente, estado.borrador]);
  const version = estado.versiones.find((v) => v.estado === "publicada");

  const cerrar = useCallback(() => setDialogo(null), []);

  const asignar = useCallback(
    (nodo: string, persona: string, modalidad: Modalidad, reemplaza?: string) => {
      const ocupante: Ocupante = { id: `o-${Date.now()}`, nodo, persona, modalidad, desde: HOY };
      const anterior = reemplaza ? estado.ocupantes.find((o) => o.id === reemplaza) : undefined;
      if (anterior) dispatch({ tipo: "terminar", id: anterior.id, hasta: HOY });
      dispatch({ tipo: "asignar", ocupante });
      const p = personaDe(PERSONAS, persona);
      const n = nodoDe(datosVigentes.nodos, nodo) ?? nodoDe(estado.borrador ?? [], nodo);
      toast(`${p ? nombreCompleto(p) : "La persona"} quedó en ${n?.titulo ?? "el puesto"}${modalidad === "interino" ? " (interino)" : ""}`, {
        duration: 9000,
        action: {
          label: "Deshacer",
          onClick: () => {
            dispatch({ tipo: "borrarOcupante", id: ocupante.id });
            if (anterior) dispatch({ tipo: "reponer", ocupante: anterior });
          },
        },
      });
    },
    [estado.ocupantes, estado.borrador, datosVigentes.nodos],
  );

  const quitar = useCallback(
    (ocupanteId: string) => {
      const anterior = estado.ocupantes.find((o) => o.id === ocupanteId);
      if (!anterior) return;
      dispatch({ tipo: "terminar", id: ocupanteId, hasta: HOY });
      const p = personaDe(PERSONAS, anterior.persona);
      const n = nodoDe(datosVigentes.nodos, anterior.nodo);
      toast(`${p ? nombreCompleto(p) : "La persona"} ya no está en ${n?.titulo ?? "el puesto"}`, {
        duration: 9000,
        action: { label: "Deshacer", onClick: () => dispatch({ tipo: "reponer", ocupante: anterior }) },
      });
    },
    [estado.ocupantes, datosVigentes.nodos],
  );

  const valor: Contexto = {
    estado,
    dispatch,
    verComo,
    setVerComo,
    puedeEditar,
    usuario,
    datos,
    datosVigentes,
    documentos: DOCUMENTOS,
    enBorrador,
    cambios,
    version,
    busqueda,
    setBusqueda,
    dialogo,
    abrir: setDialogo,
    cerrar,
    asignar,
    quitar,
  };
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useOrg(): Contexto {
  const c = useContext(Ctx);
  if (!c) throw new Error("useOrg fuera de <ProveedorOrganigrama>");
  return c;
}

/** En la maqueta depende de «Ver como», no del permiso real (usePuedeEditar). */
export function usePuedeEditarOrg(): boolean {
  return useOrg().puedeEditar;
}
