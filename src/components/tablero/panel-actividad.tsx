"use client";

import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { ArrowRight, Check, CircleDashed, Plus, Trash2, Undo2 } from "lucide-react";
import { useActividad } from "@/hooks/use-actividad";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { CORAL, INACTIVO, OK, PELIGRO } from "@/lib/tablero/colores";
import {
  cuando, fraseConfirmacion, fraseMovimiento, type EntradaActividad,
} from "@/lib/tablero/tipos-movimiento";

// El panel de actividad: qué se hizo en el tablero, quién y a qué hora.
//
// POR QUÉ ES UN SHEET Y NO EL CAJÓN DE ABAJO. El cajón le come alto a la grilla, y está
// pensado para lo que se consulta MIENTRAS se planifica —pendientes, criterios—. La
// actividad es lo contrario: se abre cuando algo llamó la atención y se cierra. Meterla en
// el cajón le sacaría filas de cuadrilla a todo el mundo, todos los días, por algo que se
// mira una vez por semana.
//
// SÓLO LECTURA. Deshacer desde acá es otra cosa y tiene otras guardas: hay que comprobar
// que la asignación siga existiendo, que no tenga parte cargado y que nadie la haya tocado
// después. El deshacer que existe hoy es el del toast, que cubre el caso real —el arrastre
// que acabás de hacer— sin ninguna de esas dudas.

/** Un día de actividad, con sus entradas. */
type Dia = { fecha: string; entradas: EntradaActividad[] };

function fechaDe(e: EntradaActividad): string {
  return e.tipo === "movimiento" ? e.movimiento.createdAt : e.confirmacion.createdAt;
}

function autorDe(e: EntradaActividad): string {
  return (
    (e.tipo === "movimiento" ? e.movimiento.autorNombre : e.confirmacion.autorNombre) ?? "—"
  );
}

function obraDe(e: EntradaActividad): string {
  const [titulo, otId] =
    e.tipo === "movimiento"
      ? [e.movimiento.otTitulo, e.movimiento.otId]
      : [e.confirmacion.otTitulo, e.confirmacion.otId];
  return titulo ?? `OT #${otId}`;
}

/**
 * El ícono dice QUÉ CLASE de cosa pasó, de un vistazo y sin leer.
 *
 * El color sigue el idioma del tablero: verde lo que suma, rojo lo que saca, coral lo que
 * mueve. Un deshacer se marca aparte —la flecha de vuelta— porque leer "movió de A a B" y
 * abajo "movió de B a A" sin distinguirlos parece un ida y vuelta sin sentido.
 */
function Icono({ e }: { e: EntradaActividad }) {
  const clase = "h-3.5 w-3.5 shrink-0";
  if (e.tipo === "confirmacion") {
    return e.confirmacion.estado === "confirmada" ? (
      <Check className={clase} style={{ color: OK }} />
    ) : (
      <CircleDashed className={clase} style={{ color: INACTIVO }} />
    );
  }
  const m = e.movimiento;
  if (m.deshaceA) return <Undo2 className={clase} style={{ color: INACTIVO }} />;
  if (m.accion === "crear") return <Plus className={clase} style={{ color: OK }} />;
  if (m.accion === "quitar") return <Trash2 className={clase} style={{ color: PELIGRO }} />;
  return <ArrowRight className={clase} style={{ color: CORAL }} />;
}

function Entrada({ e }: { e: EntradaActividad }) {
  const deshecho = e.tipo === "movimiento" && e.movimiento.deshecho;

  return (
    <li className="flex gap-2 py-1.5">
      <span className="mt-1">
        <Icono e={e} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium" title={obraDe(e)}>
          {obraDe(e)}
        </p>
        {/* Lo que ya fue deshecho se tacha en vez de esconderse: que alguien se haya
            equivocado y lo haya corregido también es información, y esconderlo dejaría un
            hueco inexplicable entre dos líneas. */}
        <p
          className="text-[12px] leading-snug text-muted-foreground"
          style={deshecho ? { textDecoration: "line-through" } : undefined}
        >
          {e.tipo === "movimiento" ? fraseMovimiento(e.movimiento) : fraseConfirmacion(e.confirmacion)}
        </p>
        <p className="text-[11px] text-muted-foreground">
          {autorDe(e)} · {cuando(fechaDe(e))}
          {deshecho && " · deshecho"}
        </p>
      </div>
    </li>
  );
}

export function PanelActividad({
  abierto,
  onOpenChange,
}: {
  abierto: boolean;
  onOpenChange: (abierto: boolean) => void;
}) {
  const { data, isLoading, error } = useActividad(abierto);
  const [autor, setAutor] = useState<string | null>(null);

  const autores = useMemo(
    () => [...new Set((data ?? []).map(autorDe))].sort(),
    [data],
  );

  /**
   * Agrupado POR DÍA. Sin el corte, treinta líneas seguidas con "hoy 14:32" no dejan ver
   * dónde termina lo de hoy y empieza lo de ayer, que es la primera pregunta al abrir.
   */
  const dias = useMemo<Dia[]>(() => {
    const filtradas = (data ?? []).filter((e) => !autor || autorDe(e) === autor);
    const mapa = new Map<string, EntradaActividad[]>();
    for (const e of filtradas) {
      const dia = fechaDe(e).slice(0, 10);
      mapa.set(dia, [...(mapa.get(dia) ?? []), e]);
    }
    return [...mapa.entries()].map(([fecha, entradas]) => ({ fecha, entradas }));
  }, [data, autor]);

  return (
    <Sheet open={abierto} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="text-base">Actividad del tablero</SheetTitle>
        </SheetHeader>

        <div className="space-y-3 px-4 pb-6">
          {/* El filtro por persona es el único que hay, y es el que contesta la pregunta
              que trae a alguien acá: "¿quién movió esto?". Por obra no hace falta — para
              eso está el historial dentro del panel de la tarjeta. */}
          {autores.length > 1 && (
            <div className="flex flex-wrap gap-1">
              <Chip activo={autor === null} onClick={() => setAutor(null)}>
                Todos
              </Chip>
              {autores.map((a) => (
                <Chip key={a} activo={autor === a} onClick={() => setAutor(a)}>
                  {a}
                </Chip>
              ))}
            </div>
          )}

          {isLoading && <Skeleton className="h-40 w-full" />}

          {error && (
            <p className="text-sm" style={{ color: PELIGRO }}>
              No se pudo leer la actividad: {error.message}
            </p>
          )}

          {!isLoading && !error && dias.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Todavía no hay nada registrado.
            </p>
          )}

          {dias.map((d) => (
            <section key={d.fecha}>
              <h3 className="sticky top-0 bg-background py-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                {format(parseISO(d.fecha), "EEEE d 'de' MMMM", { locale: es })}
              </h3>
              <ul className="divide-y">
                {d.entradas.map((e) => (
                  <Entrada
                    key={e.tipo === "movimiento" ? e.movimiento.id : e.confirmacion.id}
                    e={e}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Chip({
  activo,
  onClick,
  children,
}: {
  activo: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border px-2 py-0.5 text-[11px] transition-colors"
      style={
        activo
          ? { backgroundColor: CORAL, borderColor: CORAL, color: "#fff" }
          : undefined
      }
    >
      {children}
    </button>
  );
}
