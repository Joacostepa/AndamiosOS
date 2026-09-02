"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, ListChecks, Plus, StickyNote, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ConflictoNota,
  useActualizarPendiente,
  useAgregarPendiente,
  useBorrarPendiente,
  useCajon,
  useGuardarNota,
} from "@/hooks/use-cajon";
import {
  DIAS_RETENCION_HECHOS,
  type NotaCajon,
  type Pendiente,
} from "@/lib/tablero/tipos-cajon";

// El cajón: el panel de abajo del tablero. Pendientes de quien planifica, y criterios
// que no vencen.
//
// EMPUJA LA GRILLA, no la tapa. Es un hermano del área de scroll dentro del flex-col del
// board, así que abrirlo le saca alto a la grilla en vez de esconderle filas debajo. Un
// overlay sobre un tablero es peor que inútil: lo que tapa es justo lo que uno está
// mirando cuando anota algo.
//
// LAS DOS COLUMNAS SON GENERALES, no de la semana. El tablero no tiene semanas —es una
// ventana rodante anclada en hoy— y además el corte por fecha es el que sobra: un
// pendiente está abierto hasta que se hace. Ver la migración 20260901000002.

const CLAVE_ABIERTO = "cajon-planificacion-abierto";
const CLAVE_ALTO = "cajon-planificacion-alto";

/**
 * El alto del cajón: uno solo, y lo mueve el usuario arrastrando el borde de arriba.
 *
 * Antes eran dos fijos con un botón de agrandar. Se fueron los dos porque cada píxel del
 * cajón sale de la grilla, y cuánto vale eso depende de cuántas cuadrillas estés mirando
 * —una fila mide 114px— y de la pantalla. Adivinarlo es peor que dejar decidir.
 *
 * Lo que NO se hace es crecer solo para llenar el blanco que queda debajo de la grilla:
 * ese blanco aparece cuando hay pocas cuadrillas visibles y desaparece al prender otra,
 * así que el cajón se estaría redimensionando solo mientras alguien trabaja.
 */
const ALTO_BARRA = 44;
const ALTO_DEFECTO = 240;
const ALTO_MIN = 120;
/** Techo relativo: el cajón nunca se queda con más de dos tercios de lo que hay. */
const ALTO_MAX = () => Math.max(ALTO_MIN, Math.round(window.innerHeight * 0.66));

function leerGuardado<T>(clave: string, parsear: (crudo: string) => T | null, porDefecto: T): T {
  if (typeof window === "undefined") return porDefecto;
  try {
    const crudo = window.localStorage.getItem(clave);
    return crudo === null ? porDefecto : (parsear(crudo) ?? porDefecto);
  } catch {
    return porDefecto;
  }
}

function guardar(clave: string, valor: string) {
  try {
    window.localStorage.setItem(clave, valor);
  } catch {
    // Modo privado o storage lleno: el cajón funciona igual, sólo no recuerda.
  }
}

export function CajonPlanificacion() {
  const [abierto, setAbierto] = useState(() =>
    leerGuardado(CLAVE_ABIERTO, (c) => c === "true", false),
  );
  const [alto, setAlto] = useState(() =>
    leerGuardado(
      CLAVE_ALTO,
      (c) => {
        const n = Number(c);
        return Number.isFinite(n) && n >= ALTO_MIN ? n : null;
      },
      ALTO_DEFECTO,
    ),
  );
  const [arrastrando, setArrastrando] = useState(false);

  const { data, isLoading } = useCajon();
  const pendientes = useMemo(() => data?.pendientes ?? [], [data]);
  const abiertos = pendientes.filter((p) => !p.hecho);
  const hechos = pendientes.filter((p) => p.hecho);

  const alternar = (v: boolean) => {
    setAbierto(v);
    guardar(CLAVE_ABIERTO, String(v));
  };

  // Arrastre del borde de arriba. Con captura del puntero: sin ella, salirse del div de
  // 6px mientras se arrastra corta el gesto, que es justo lo que pasa siempre.
  const empezarArrastre = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!abierto) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const yInicial = e.clientY;
    const altoInicial = alto;
    const techo = ALTO_MAX();
    setArrastrando(true);

    const mover = (ev: PointerEvent) => {
      // Arriba es más alto: el borde sube, el cajón crece.
      setAlto(Math.min(techo, Math.max(ALTO_MIN, altoInicial + (yInicial - ev.clientY))));
    };
    const soltar = () => {
      setArrastrando(false);
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", soltar);
      setAlto((actual) => {
        guardar(CLAVE_ALTO, String(actual));
        return actual;
      });
    };
    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", soltar);
  };

  return (
    <div
      className={cn(
        "flex shrink-0 flex-col overflow-hidden border-t bg-card",
        // La transición se apaga mientras se arrastra: animar cada píxel del gesto lo
        // hace sentir elástico y con retraso.
        !arrastrando && "transition-[height] duration-300 ease-out",
      )}
      style={{ height: abierto ? `${alto}px` : `${ALTO_BARRA}px` }}
    >
      {/* La manija. Va como franja propia arriba de la barra y no sobre la barra misma:
          la barra es un botón que abre y cierra, y un gesto de arrastre encima de un
          botón termina siempre en un clic que no se quiso dar. */}
      {abierto && (
        <div
          onPointerDown={empezarArrastre}
          className="group/manija flex h-1.5 shrink-0 cursor-ns-resize items-center justify-center hover:bg-foreground/10"
          role="separator"
          aria-orientation="horizontal"
          aria-label="Arrastrá para cambiar el alto del cajón"
          title="Arrastrá para cambiar el alto"
        >
          <div className="h-0.5 w-8 rounded-full bg-foreground/20 group-hover/manija:bg-foreground/40" />
        </div>
      )}

      <Barra
        abierto={abierto}
        hechos={hechos.length}
        totales={pendientes.length}
        onAlternar={() => alternar(!abierto)}
      />

      {abierto && (
        // Las notas se llevan la parte grande. Un pendiente es UN RENGLÓN corto
        // —"confirmar plantel de la 1"— y lo que necesita es alto, no ancho: darle más
        // columna sólo alarga el blanco a la derecha del texto. Las notas son prosa
        // libre, y ahí el ancho sí es lo que hace que se puedan leer.
        <div className="grid min-h-0 flex-1 grid-cols-[2fr_3fr]">
          <ColumnaPendientes
            abiertos={abiertos}
            hechos={hechos}
            cargando={isLoading}
          />
          {/* Se monta recién con el dato cargado, y de ahí en más el textarea es dueño
              del texto: no hay efecto que sincronice el servidor con el borrador. Es lo
              que evita el modo de falla clásico de un campo autoguardado —un refetch
              devuelve texto viejo y le arranca lo que estaba escribiendo—. Lo que llegue
              de otro se entera por el conflicto al guardar, que es cuando importa.
              Cerrar y volver a abrir el cajón lo remonta, y ahí sí relee. */}
          {data ? (
            <ColumnaNotas inicial={data.nota} />
          ) : (
            <section className="flex min-h-0 flex-col" aria-busy />
          )}
        </div>
      )}
    </div>
  );
}

// ── Barra ────────────────────────────────────────────────────────────────────
//
// Colapsada sigue diciendo lo esencial: cuántos pendientes quedan. Un cajón cerrado que
// no dice nada es un cajón que nadie abre, y entonces lo de adentro deja de existir.

function Barra({
  abierto,
  hechos,
  totales,
  onAlternar,
}: {
  abierto: boolean;
  hechos: number;
  totales: number;
  onAlternar: () => void;
}) {
  const completo = totales > 0 && hechos === totales;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onAlternar}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onAlternar();
        }
      }}
      className="flex h-11 shrink-0 cursor-pointer select-none items-center gap-4 px-3 hover:bg-foreground/[0.04]"
      title={abierto ? "Cerrar el cajón" : "Abrir el cajón"}
      aria-expanded={abierto}
    >
      <ChevronDown
        className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", !abierto && "-rotate-90")}
        aria-hidden
      />

      {/* Cerrado, el número es la mitad de la razón para abrirlo. "X/Y" solo es ambiguo
          —¿los hechos o los que quedan?— así que el title lo dice con palabras. */}
      <span
        className="flex items-center gap-1.5 text-[12px] font-medium"
        title={totales === 0 ? "Sin pendientes anotados" : `${hechos} de ${totales} hechos`}
      >
        <ListChecks className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
        Pendientes
        <span className={cn("tabular-nums", completo ? "font-semibold text-primary" : "text-muted-foreground")}>
          {hechos}/{totales}
        </span>
      </span>

      <span className="flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground">
        <StickyNote className="h-3.5 w-3.5" aria-hidden />
        Notas generales
      </span>

    </div>
  );
}

// ── Pendientes ───────────────────────────────────────────────────────────────

function ColumnaPendientes({
  abiertos,
  hechos,
  cargando,
}: {
  abiertos: Pendiente[];
  hechos: Pendiente[];
  cargando: boolean;
}) {
  const [texto, setTexto] = useState("");
  const [verHechos, setVerHechos] = useState(false);
  const agregar = useAgregarPendiente();

  const enviar = () => {
    const limpio = texto.trim();
    if (!limpio) return;
    // Se vacía sin esperar la confirmación: el gesto es escribir y seguir escribiendo, y
    // un campo que se queda lleno medio segundo hace que se agregue dos veces.
    setTexto("");
    agregar.mutate(limpio);
  };

  return (
    <section className="flex min-h-0 flex-col border-r">
      <h2 className="px-3 pt-2 text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
        Pendientes
      </h2>

      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 py-1">
        {cargando ? (
          <p className="px-1.5 py-2 text-[11px] text-muted-foreground">Cargando…</p>
        ) : abiertos.length === 0 && hechos.length === 0 ? (
          <p className="px-1.5 py-2 text-[11px] text-muted-foreground">
            Sin pendientes. Agregá el primero abajo.
          </p>
        ) : (
          <ul className="space-y-px">
            {abiertos.map((p) => (
              <ItemPendiente key={p.id} pendiente={p} />
            ))}
          </ul>
        )}

        {/* Los hechos van plegados y no borrados: destildar es la forma de deshacer un
            clic equivocado, y una lista que hace desaparecer las cosas al tocarlas no
            deja hacerlo. Se borran solos a los 30 días, así que el plegable no crece
            para siempre. */}
        {hechos.length > 0 && (
          <div className="mt-1">
            <button
              type="button"
              onClick={() => setVerHechos(!verHechos)}
              className="flex w-full items-center gap-1 rounded px-1.5 py-1 text-[11px] text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground"
              aria-expanded={verHechos}
              title={`Se borran solos a los ${DIAS_RETENCION_HECHOS} días de tildados`}
            >
              {verHechos ? (
                <ChevronDown className="h-3 w-3" aria-hidden />
              ) : (
                <ChevronRight className="h-3 w-3" aria-hidden />
              )}
              Hechos ({hechos.length})
            </button>
            {verHechos && (
              <ul className="space-y-px">
                {hechos.map((p) => (
                  <ItemPendiente key={p.id} pendiente={p} />
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1.5 border-t px-3 py-1.5">
        <Plus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              enviar();
            }
          }}
          placeholder="Agregar pendiente y Enter…"
          maxLength={500}
          aria-label="Nuevo pendiente"
          className="min-w-0 flex-1 bg-transparent text-[12px] outline-none placeholder:text-muted-foreground"
        />
      </div>
    </section>
  );
}

function ItemPendiente({ pendiente }: { pendiente: Pendiente }) {
  const actualizar = useActualizarPendiente();
  const borrar = useBorrarPendiente();

  return (
    <li className="group/item flex items-start gap-2 rounded px-1.5 py-1 hover:bg-foreground/[0.04]">
      {/* Checkbox propio y no el de shadcn: acá hace falta que el área clickeable sea la
          línea entera —tildar un pendiente de 3 palabras apuntando a un cuadrado de 14px
          es una puntería que nadie quiere tener— y eso se resuelve con el label. */}
      <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-2">
        <input
          type="checkbox"
          checked={pendiente.hecho}
          onChange={(e) => actualizar.mutate({ id: pendiente.id, hecho: e.target.checked })}
          className="mt-[3px] h-3.5 w-3.5 shrink-0 cursor-pointer accent-[var(--primary)]"
        />
        <span
          className={cn(
            "min-w-0 flex-1 text-[12px] leading-snug",
            pendiente.hecho && "text-muted-foreground line-through",
          )}
          title={pendiente.autorNombre ? `Lo anotó ${pendiente.autorNombre}` : undefined}
        >
          {pendiente.texto}
        </span>
      </label>

      <button
        type="button"
        onClick={() => borrar.mutate(pendiente.id)}
        className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 hover:bg-foreground/10 hover:text-foreground focus-visible:opacity-100 group-hover/item:opacity-100"
        title="Borrar pendiente"
        aria-label={`Borrar "${pendiente.texto}"`}
      >
        <X className="h-3 w-3" />
      </button>
    </li>
  );
}

// ── Notas generales ────────────────────────────────────────────────────────────────

const DEBOUNCE_MS = 600;

/** La versión que ganó la carrera, cuando alguien guardó entre nuestra lectura y la nuestra. */
type Conflicto = { autor: string; texto: string; updatedAt: string };

function ColumnaNotas({ inicial }: { inicial: NotaCajon }) {
  const { mutate, isPending } = useGuardarNota();
  const [borrador, setBorrador] = useState(inicial.texto);
  // Lo que el servidor tiene por confirmado. Va en ESTADO y no en un ref porque decide
  // el rótulo de la esquina: un ref no vuelve a pintar y "Sin guardar" quedaría clavado.
  const [guardado, setGuardado] = useState(inicial.texto);
  // El sello de la fila. Arranca del que se leyó y avanza con cada guardado propio; es
  // lo que el servidor compara para saber si alguien se metió en el medio.
  const [sello, setSello] = useState(inicial.updatedAt);
  const [conflicto, setConflicto] = useState<Conflicto | null>(null);

  useEffect(() => {
    // Con un conflicto abierto NO se reintenta solo: seguir mandando sería insistir en
    // pisar a alguien. Se destraba cuando el usuario decide, abajo.
    if (borrador === guardado || conflicto) return;
    const t = setTimeout(() => {
      mutate(
        { texto: borrador, updatedAt: sello },
        {
          onSuccess: ({ nota }) => {
            setGuardado(borrador);
            setSello(nota.updatedAt);
          },
          onError: (e) => {
            if (e instanceof ConflictoNota) {
              setConflicto({
                autor: e.actual.autorNombre ?? "Otra persona",
                texto: e.actual.texto,
                updatedAt: e.actual.updatedAt,
              });
            }
          },
        },
      );
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [borrador, guardado, sello, conflicto, mutate]);

  const estado = conflicto
    ? `${conflicto.autor} guardó primero`
    : isPending
      ? "Guardando…"
      : borrador !== guardado
        ? "Sin guardar"
        : "Guardado";

  return (
    <section className="flex min-h-0 flex-col">
      <div className="flex items-baseline gap-2 px-3 pt-2">
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
          Notas generales
        </h2>
        <span
          className={cn(
            "ml-auto text-[10px]",
            conflicto ? "font-medium text-destructive" : "text-muted-foreground",
          )}
          role="status"
        >
          {estado}
        </span>
      </div>

      <textarea
        value={borrador}
        onChange={(e) => setBorrador(e.target.value)}
        maxLength={20_000}
        aria-label="Notas generales de planificación"
        // El placeholder tiene que hacer el reparto con las notas del día, o el primero
        // que quiera anotar "el jueves falta Juan" lo escribe acá y el jueves no aparece
        // en ningún lado. Es la única parte de la UI donde se puede explicar la
        // diferencia en el momento en que importa.
        placeholder="Lo que no vence: “los desarmes de Olivos van con el camión chico”, teléfonos, acuerdos.&#10;&#10;Lo que pasa un día puntual va en la nota del día, arriba en la grilla."
        className="mx-3 mt-1.5 min-h-0 flex-1 resize-none rounded-md border bg-background px-2.5 py-2 text-[12px] leading-relaxed outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
      />

      {/* El conflicto no es un callejón: se muestran LAS DOS versiones y decide una
          persona. Pisar en silencio era el bug que esto vino a evitar, pero dejar un
          cartel de error sin salida es la otra mitad del mismo problema — el texto
          propio quedaría inguardable para siempre. */}
      {conflicto ? (
        <div className="mx-3 mb-3 mt-1.5 shrink-0 rounded-md border border-destructive/40 p-2">
          <p className="text-[10px] font-medium text-destructive">
            {conflicto.autor} guardó su versión mientras escribías. Arriba está la tuya;
            acá abajo, la suya.
          </p>
          <p className="mt-1 max-h-16 overflow-y-auto whitespace-pre-wrap rounded bg-muted px-2 py-1 text-[11px] leading-snug">
            {conflicto.texto || <span className="text-muted-foreground">(vacío)</span>}
          </p>
          <div className="mt-1.5 flex gap-2">
            <button
              type="button"
              // Adopta el sello nuevo: el próximo guardado ya no choca y el texto propio
              // pasa a ser el bueno. Lo de la otra persona quedó a la vista para copiar
              // lo que haga falta antes de apretar.
              onClick={() => {
                setSello(conflicto.updatedAt);
                setConflicto(null);
              }}
              className="rounded border px-2 py-0.5 text-[11px] font-medium hover:bg-foreground/[0.06]"
            >
              Guardar la mía
            </button>
            <button
              type="button"
              onClick={() => {
                setBorrador(conflicto.texto);
                setGuardado(conflicto.texto);
                setSello(conflicto.updatedAt);
                setConflicto(null);
              }}
              className="rounded border px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground"
            >
              Quedarme con la suya
            </button>
          </div>
        </div>
      ) : (
        <div className="h-3 shrink-0" />
      )}
    </section>
  );
}
