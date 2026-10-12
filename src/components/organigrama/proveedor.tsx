"use client";

// Estado del organigrama: lo que se ve, con updates OPTIMISTAS, y una cola que lo guarda en la
// base (docs/organigrama/modulo.md § Datos).
//
// Dos cosas separadas a propósito (docs/organigrama/propuesta.md § 4.1):
//   - la ESTRUCTURA: `vigente` (lo publicado) y `borrador` (lo que los editores están armando).
//     Los cambios de estructura solo impactan al publicar.
//   - la OCUPACIÓN: `ocupantes`. Asignar o quitar es inmediato y NO marca el borrador.
//
// CÓMO SE GUARDA. Las pantallas despachan las mismas acciones de siempre (`estructura`,
// `restaurar`, `asignar`…) y el cambio se ve al instante: las animaciones del Lienzo no esperan
// a la red. Cada acción calcula el estado nuevo y la DIFERENCIA contra lo último que se mandó
// (operacionesPara, en src/lib/organigrama/datos.ts) y la encola: las RPC corren de a una, en
// orden. Por eso deshacer/rehacer del Lienzo —que restaura una foto— se guarda solo como la
// operación inversa. Publicar es la única que se manda explícita (lleva la nota).
//
// SI ALGO FALLA, no se adivina: se avisa, se descarta lo que quedaba en la cola y se vuelve a
// leer la base, que pisa el estado local (lo que no se guardó, se pierde y se dice). Lo que
// cambian otras personas entra al volver a leer (al volver a la pestaña o después de publicar),
// siempre que no haya nada pendiente de guardar.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { usePuedeEditar } from "@/components/providers/acceso-provider";
import {
  CLAVE_ORGANIGRAMA,
  crearBorradorOrg,
  descartarBorradorOrg,
  guardarBorradorOrg,
  guardarOcupantesOrg,
  publicarOrg,
  sembrarOrg,
  useOrganigrama,
} from "@/hooks/use-organigrama";
import { diffVersiones, nodoDe, nombreCompleto, personaDe } from "@/lib/organigrama/arbol";
import { conExternosLibres, filaDeNodo, hoyBA, operacionesPara, type BorradorMeta, type EstadoServidor, type Operacion } from "@/lib/organigrama/datos";
import { DOCUMENTOS, ESTRUCTURA_BASE } from "@/lib/organigrama/estructura-base";
import type { Cambio, DatosOrg, Documento, Modalidad, Nodo, Ocupante, Persona, Version } from "@/lib/organigrama/tipos";

type Estado = {
  vigente: Nodo[];
  borrador: Nodo[] | null;
  borradorMeta: BorradorMeta | null;
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

const VACIO: Estado = { vigente: [], borrador: null, borradorMeta: null, versiones: [], ocupantes: [], editando: false };

function desdeBase(s: EstadoServidor, editando: boolean): Estado {
  return {
    vigente: s.vigente,
    borrador: s.borrador,
    borradorMeta: s.borradorMeta,
    versiones: s.versiones,
    ocupantes: s.ocupantes,
    editando: editando && !!s.borrador,
  };
}

function reducir(e: Estado, a: Accion): Estado {
  switch (a.tipo) {
    case "restaurar":
      return { ...e, ...a.foto };
    case "entrar":
      // Si no hay borrador, se crea como copia de la vigente (en la base, org_crear_borrador).
      if (!e.vigente.length) return e;
      return e.borrador
        ? { ...e, editando: true }
        : { ...e, editando: true, borrador: e.vigente, borradorMeta: { fecha: hoyBA(), autor: a.autor } };
    case "salir":
      return { ...e, editando: false };
    case "descartar":
      return { ...e, borrador: null, borradorMeta: null, editando: false };
    case "estructura":
      return e.borrador ? { ...e, borrador: a.nodos } : e;
    case "publicar": {
      if (!e.borrador) return e;
      const numero = Math.max(0, ...e.versiones.map((v) => v.numero ?? 0)) + 1;
      // Provisoria hasta que vuelve la base (con el id y la fecha reales).
      const nueva: Version = {
        id: `nueva-${numero}`,
        numero,
        estado: "publicada",
        fecha: hoyBA(),
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

/** cargando · error · vacio (no hay ninguna versión publicada) · listo. */
export type Carga = "cargando" | "error" | "vacio" | "listo";

type Contexto = {
  estado: Estado;
  dispatch: (a: Accion) => void;
  puedeEditar: boolean;
  /** Quien mira, como persona del organigrama (su legajo vinculado o su usuario). */
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
  carga: Carga;
  errorCarga: string | null;
  reintentar: () => void;
  /** «Empezar desde la estructura base» (solo con la base vacía). */
  sembrar: () => Promise<void>;
  /** Hay cambios todavía viajando a la base. */
  guardando: boolean;
};

const Ctx = createContext<Contexto | null>(null);

const nuevoId = () => crypto.randomUUID();

export function ProveedorOrganigrama({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const consulta = useOrganigrama();
  const servidor = consulta.data;
  const puedeEditarAcceso = usePuedeEditar("organigrama");

  const [estado, setEstado] = useState<Estado>(VACIO);
  const [busqueda, setBusqueda] = useState("");
  const [dialogo, setDialogo] = useState<Dialogo | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [hidratado, setHidratado] = useState(false);

  // ── Sincronización ───────────────────────────────────────────────────────────
  // `estadoRef` es la verdad local, sincrónica: dos despachos seguidos en el mismo evento
  // (entrar + estructura) se aplican uno sobre otro. `enviado` es lo último que se encoló.
  const estadoRef = useRef<Estado>(VACIO);
  const enviado = useRef<{ borrador: Nodo[] | null; ocupantes: Ocupante[] }>({ borrador: null, ocupantes: [] });
  const borradorId = useRef<string | null>(null);
  const cola = useRef<Promise<void>>(Promise.resolve());
  const enCola = useRef(0);
  const fallo = useRef(false);
  const releer = useRef(false);
  const hidratadoEn = useRef(0);
  const ultimoCambioEn = useRef(0);

  const fijar = useCallback((e: Estado) => {
    estadoRef.current = e;
    setEstado(e);
  }, []);

  const hidratar = useCallback(
    (s: EstadoServidor) => {
      fijar(desdeBase(s, estadoRef.current.editando));
      enviado.current = { borrador: s.borrador, ocupantes: s.ocupantes };
      borradorId.current = s.borradorId;
      setHidratado(true);
    },
    [fijar],
  );

  // Lo que llega de la base pisa lo local solo si no hay nada en viaje: si no, se perdería
  // un cambio que todavía no llegó. Al vaciarse la cola se vuelve a leer.
  useEffect(() => {
    if (!servidor || consulta.dataUpdatedAt === hidratadoEn.current) return;
    hidratadoEn.current = consulta.dataUpdatedAt;
    if (enCola.current > 0) {
      releer.current = true;
      return;
    }
    // Pedida antes del último cambio local: puede no traerlo. Se pide de nuevo.
    if (servidor.pedidoEn <= ultimoCambioEn.current) {
      void qc.invalidateQueries({ queryKey: CLAVE_ORGANIGRAMA });
      return;
    }
    hidratar(servidor);
  }, [servidor, consulta.dataUpdatedAt, hidratar, qc]);

  const ejecutar = useCallback(async (op: Operacion) => {
    switch (op.tipo) {
      case "crearBorrador":
        borradorId.current = await crearBorradorOrg();
        releer.current = true;
        return;
      case "guardarBorrador":
        if (!borradorId.current) throw new Error("No hay un borrador abierto.");
        return guardarBorradorOrg(borradorId.current, op.cambios);
      case "descartar":
        if (borradorId.current) await descartarBorradorOrg(borradorId.current);
        borradorId.current = null;
        releer.current = true;
        return;
      case "publicar":
        if (!borradorId.current) throw new Error("No hay un borrador para publicar.");
        await publicarOrg(borradorId.current, op.nota, op.cambios);
        borradorId.current = null;
        releer.current = true;
        return;
      case "ocupantes":
        return guardarOcupantesOrg(op.cambios);
    }
  }, []);

  const encolar = useCallback(
    (ops: Operacion[]) => {
      ultimoCambioEn.current = Date.now();
      for (const op of ops) {
        enCola.current++;
        setGuardando(true);
        cola.current = cola.current
          .then(async () => {
            // Después de un error, lo que seguía en la cola se basaba en algo que no se guardó.
            if (fallo.current) return;
            await ejecutar(op);
          })
          .catch((e: unknown) => {
            fallo.current = true;
            toast.error("No se pudo guardar el cambio", {
              description: `${e instanceof Error ? e.message : "Error desconocido"} Volvimos a lo último guardado.`,
            });
          })
          .finally(() => {
            enCola.current--;
            if (enCola.current > 0) return;
            setGuardando(false);
            const forzar = fallo.current;
            fallo.current = false;
            if (forzar || releer.current) {
              releer.current = false;
              void qc.invalidateQueries({ queryKey: CLAVE_ORGANIGRAMA });
            }
          });
      }
    },
    [ejecutar, qc],
  );

  const dispatch = useCallback(
    (a: Accion) => {
      const antes = estadoRef.current;
      const despues = reducir(antes, a);
      if (despues === antes) return;
      fijar(despues);
      if (a.tipo === "publicar") {
        // Publicar va explícito (lleva la nota). El borrador queda «enviado» como inexistente.
        enviado.current = { borrador: null, ocupantes: enviado.current.ocupantes };
        encolar([{ tipo: "publicar", nota: a.nota, cambios: despues.versiones[0]?.cambios ?? [] }]);
      }
      const local = { borrador: despues.borrador, ocupantes: despues.ocupantes };
      const ops = operacionesPara(enviado.current, local, despues.vigente);
      enviado.current = local;
      if (ops.length) encolar(ops);
    },
    [fijar, encolar],
  );

  // Avisar antes de cerrar la pestaña con cambios en viaje.
  useEffect(() => {
    if (!guardando) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [guardando]);

  // ── Derivados ────────────────────────────────────────────────────────────────
  const puedeEditar = servidor ? servidor.puedeEditar : puedeEditarAcceso;
  const enBorrador = puedeEditar && estado.editando && !!estado.borrador;

  const personas = useMemo(() => conExternosLibres(servidor?.personas ?? [], estado.ocupantes), [servidor?.personas, estado.ocupantes]);
  const cuadrillas = servidor?.cuadrillas;
  const datosVigentes = useMemo<DatosOrg>(
    () => ({ nodos: estado.vigente, personas, ocupantes: estado.ocupantes, cuadrillas: cuadrillas ?? [] }),
    [estado.vigente, personas, estado.ocupantes, cuadrillas],
  );
  const datos = useMemo<DatosOrg>(
    () => (enBorrador && estado.borrador ? { ...datosVigentes, nodos: estado.borrador } : datosVigentes),
    [enBorrador, estado.borrador, datosVigentes],
  );
  const cambios = useMemo(() => (estado.borrador ? diffVersiones(estado.vigente, estado.borrador) : []), [estado.vigente, estado.borrador]);
  const version = estado.versiones.find((v) => v.estado === "publicada");
  const usuario = personaDe(personas, servidor?.yo);

  const carga: Carga = !hidratado ? (consulta.isError ? "error" : "cargando") : estado.vigente.length ? "listo" : "vacio";

  const cerrar = useCallback(() => setDialogo(null), []);

  const asignar = useCallback(
    (nodo: string, persona: string, modalidad: Modalidad, reemplaza?: string) => {
      const hoy = hoyBA();
      const ocupante: Ocupante = { id: nuevoId(), nodo, persona, modalidad, desde: hoy };
      const anterior = reemplaza ? estadoRef.current.ocupantes.find((o) => o.id === reemplaza) : undefined;
      if (anterior) dispatch({ tipo: "terminar", id: anterior.id, hasta: hoy });
      dispatch({ tipo: "asignar", ocupante });
      const p = personaDe(conExternosLibres(personas, [ocupante]), persona);
      const n = nodoDe(estadoRef.current.vigente, nodo) ?? nodoDe(estadoRef.current.borrador ?? [], nodo);
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
    [dispatch, personas],
  );

  const quitar = useCallback(
    (ocupanteId: string) => {
      const anterior = estadoRef.current.ocupantes.find((o) => o.id === ocupanteId);
      if (!anterior) return;
      dispatch({ tipo: "terminar", id: ocupanteId, hasta: hoyBA() < anterior.desde ? anterior.desde : hoyBA() });
      const p = personaDe(personas, anterior.persona);
      const n = nodoDe(estadoRef.current.vigente, anterior.nodo) ?? nodoDe(estadoRef.current.borrador ?? [], anterior.nodo);
      toast(`${p ? nombreCompleto(p) : "La persona"} ya no está en ${n?.titulo ?? "el puesto"}`, {
        duration: 9000,
        action: { label: "Deshacer", onClick: () => dispatch({ tipo: "reponer", ocupante: anterior }) },
      });
    },
    [dispatch, personas],
  );

  const reintentar = useCallback(() => void consulta.refetch(), [consulta]);

  const sembrar = useCallback(async () => {
    try {
      await sembrarOrg(ESTRUCTURA_BASE.map(filaDeNodo));
      await qc.invalidateQueries({ queryKey: CLAVE_ORGANIGRAMA });
      toast("Listo: cargamos la estructura base como versión 1.");
    } catch (e) {
      toast.error("No se pudo cargar la estructura base", { description: e instanceof Error ? e.message : undefined });
    }
  }, [qc]);

  const valor: Contexto = {
    estado,
    dispatch,
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
    carga,
    errorCarga: consulta.error instanceof Error ? consulta.error.message : null,
    reintentar,
    sembrar,
    guardando,
  };
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useOrg(): Contexto {
  const c = useContext(Ctx);
  if (!c) throw new Error("useOrg fuera de <ProveedorOrganigrama>");
  return c;
}

/** ¿Edita el organigrama? (admin o módulo «organigrama» en «editar»; lo confirma la base). */
export function usePuedeEditarOrg(): boolean {
  return useOrg().puedeEditar;
}
