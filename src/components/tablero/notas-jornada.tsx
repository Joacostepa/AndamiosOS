"use client";

import { useEffect, useRef, useState, type ReactElement } from "react";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAgregarNotaJornada, useBorrarNotaJornada } from "@/hooks/use-notas-jornada";
import { CORAL } from "@/lib/tablero/colores";
import type { NotaJornada } from "@/lib/tablero/tipos-nota";

/**
 * Lo mínimo que hace falta para nombrar una cuadrilla y ofrecerla como alcance.
 *
 * Estructural y no `CuadrillaTablero`: el listado de partes trae las suyas sin
 * `tercerizada` (ver ListadoJornadas), y pedir el tipo entero obligaría a inventarle un
 * campo que esa pantalla no usa sólo para poder anotar una nota.
 */
type CuadrillaNombrada = { id: number; nombre: string };

// Notas de un día: lo que hay que tener en cuenta al planificar y que no es una obra.
//
// "El chofer se va temprano el jueves", "llevar material a Turme", "Juan de licencia del
// 12 al 20". Hoy eso llega por WhatsApp y vive en la cabeza del que planifica.
//
// DECISIÓN (visual): la marca de que un día tiene notas es un ÍCONO, no un color. La
// paleta del tablero ya está repartida —beige es el domingo, coral es hoy y la acción,
// rojo es error y sobreasignación, ámbar es obra empezada, violeta es feriado— y meter
// un color más haría que "este día tiene una nota" compita con "este día está roto".
// El ícono es un canal libre y además dice qué es sin que haya que aprender la clave.
//
// La nota NO toca la capacidad de la cuadrilla, a propósito: traducir "se va temprano" a
// media jornada es una decisión de quien planifica, y un descuento automático haría que
// el número del encabezado dependa de cómo alguien redactó un texto libre.

/** El alcance "día entero" en el `Select`, que sólo maneja strings. */
const TODO_EL_DIA = "dia";

function fechaCorta(iso: string): string {
  return format(parseISO(iso), "d MMM", { locale: es });
}

/** "jueves 4 de septiembre" — el título del popover. */
function fechaLarga(iso: string): string {
  return format(parseISO(iso), "EEEE d 'de' MMMM", { locale: es });
}

function UnaNota({ nota, cuadrillas }: { nota: NotaJornada; cuadrillas: CuadrillaNombrada[] }) {
  const borrar = useBorrarNotaJornada();
  const cuadrilla =
    nota.cuadrillaId != null
      ? (cuadrillas.find((c) => c.id === nota.cuadrillaId)?.nombre ?? `Cuadrilla ${nota.cuadrillaId}`)
      : null;
  // El rango se muestra sólo cuando la nota dura más de un día. En una nota de un día
  // sería repetir la fecha que ya está en el título del popover.
  const variosDias = nota.hasta > nota.desde;

  return (
    <li className="flex items-start gap-2 border-b px-2.5 py-2 text-[12px] last:border-b-0">
      <span className="min-w-0 flex-1">
        <span className="block whitespace-pre-wrap">{nota.texto}</span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[10px] text-muted-foreground">
          {cuadrilla ? (
            <span className="inline-flex items-center gap-0.5 font-medium text-foreground/70">
              <Users className="h-2.5 w-2.5" />
              {cuadrilla}
            </span>
          ) : (
            <span className="font-medium text-foreground/70">Todo el día</span>
          )}
          {variosDias && <span>· {fechaCorta(nota.desde)} al {fechaCorta(nota.hasta)}</span>}
          <span>· {nota.autorNombre ?? "—"}</span>
        </span>
      </span>
      <Button
        size="icon"
        variant="ghost"
        className="h-6 w-6 shrink-0"
        title="Borrar la nota"
        disabled={borrar.isPending}
        onClick={() =>
          borrar.mutate(nota.id, {
            onError: (e) => toast.error("No se pudo borrar", { description: e.message }),
          })
        }
      >
        <Trash2 className="h-3 w-3" />
      </Button>
    </li>
  );
}

export function PopoverNotasDia({
  fecha,
  notas,
  cuadrillas,
  cuadrillaInicial = null,
  trigger,
}: {
  fecha: string;
  /** Las que aplican a este día (y a esta cuadrilla, si el trigger es de una celda). */
  notas: NotaJornada[];
  cuadrillas: CuadrillaNombrada[];
  /**
   * Alcance con el que arranca el formulario. Desde una celda viene la cuadrilla de esa
   * fila: quien abre ahí ya dijo de quién está hablando y no tiene que repetirlo.
   */
  cuadrillaInicial?: number | null;
  trigger: ReactElement;
}) {
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState("");
  const [alcance, setAlcance] = useState<string>(
    cuadrillaInicial != null ? String(cuadrillaInicial) : TODO_EL_DIA,
  );
  // Vacío = la nota es de un día. El campo aparece recién al pedirlo: el caso común es
  // un día suelto y un segundo selector de fecha siempre visible convierte una nota de
  // diez segundos en un formulario.
  const [hasta, setHasta] = useState("");
  const [rangoAbierto, setRangoAbierto] = useState(false);
  const agregar = useAgregarNotaJornada();
  const campo = useRef<HTMLTextAreaElement | null>(null);

  // El foco va al campo al abrir. La única razón para abrir esto en un día sin notas es
  // escribir una, y sin esto había que acertarle al textarea antes de poder tipear.
  // Se espera un frame porque el popover mueve el foco a su propio contenedor al montar.
  useEffect(() => {
    if (!abierto) return;
    const id = requestAnimationFrame(() => campo.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [abierto]);

  function guardar() {
    const limpio = texto.trim();
    // Sin texto NO es un no-op silencioso: el botón queda apretable a propósito y el clic
    // manda el foco al campo. Antes iba `disabled`, y `disabled:pointer-events-none` hace
    // que el navegador ni registre el clic — apretar "Agregar" con el campo vacío no
    // producía absolutamente nada, ni un cursor distinto, y se leía como que estaba roto.
    if (!limpio) {
      campo.current?.focus();
      return;
    }
    if (hasta && hasta < fecha) {
      toast.error("El último día no puede ser anterior al primero");
      return;
    }
    agregar.mutate(
      {
        desde: fecha,
        hasta: hasta || fecha,
        cuadrillaId: alcance === TODO_EL_DIA ? null : Number(alcance),
        texto: limpio,
      },
      {
        onSuccess: () => {
          setTexto("");
          setHasta("");
          setRangoAbierto(false);
        },
        onError: (e) => toast.error("No se pudo guardar la nota", { description: e.message }),
      },
    );
  }

  const opciones: Record<string, string> = {
    [TODO_EL_DIA]: "Todo el día",
    ...Object.fromEntries(cuadrillas.map((c) => [String(c.id), c.nombre])),
  };

  return (
    <Popover open={abierto} onOpenChange={setAbierto}>
      <PopoverTrigger render={trigger} />
      <PopoverContent align="start" className="w-80 gap-0 p-0">
        <header className="border-b px-2.5 py-2">
          <p className="text-[12px] font-semibold capitalize">{fechaLarga(fecha)}</p>
          <p className="text-[10px] text-muted-foreground">
            Lo que hay que tener en cuenta al planificar este día.
          </p>
        </header>

        <ul className="max-h-64 overflow-y-auto">
          {notas.map((n) => (
            <UnaNota key={n.id} nota={n} cuadrillas={cuadrillas} />
          ))}
          {notas.length === 0 && (
            <li className="px-2.5 py-3 text-[11px] text-muted-foreground">
              Sin notas. Ej: “el chofer se va 14 h”, “llevar material a Turme”.
            </li>
          )}
        </ul>

        <div className="space-y-2 border-t p-2.5">
          <Textarea
            ref={campo}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            // Enter solo hace salto de línea —una nota puede tener dos renglones— así que
            // guardar es ⌘/Ctrl+Enter, que es lo que ya hace la mano en cualquier campo
            // de comentario.
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                guardar();
              }
            }}
            placeholder="Ej: el chofer avisó que se va temprano"
            className="min-h-14 text-[12px]"
          />
          <div className="flex items-center gap-2">
            <Select items={opciones} value={alcance} onValueChange={(v) => v && setAlcance(String(v))}>
              <SelectTrigger className="h-7 flex-1 text-[11px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(opciones).map(([valor, label]) => (
                  <SelectItem key={valor} value={valor} className="text-[12px]">
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              // Atenuado mientras no hay texto, pero NUNCA `disabled`: ver guardar().
              className={`h-7 px-3 text-[11px] ${texto.trim() ? "" : "opacity-60"}`}
              style={{ backgroundColor: CORAL, color: "#fff" }}
              disabled={agregar.isPending}
              onClick={guardar}
            >
              {agregar.isPending ? "Guardando…" : "Agregar"}
            </Button>
          </div>

          {/* Una nota puede durar varios días ("Juan de licencia del 12 al 20"). Sin
              esto habría que cargar la misma nota siete veces, y entonces se carga el
              primer día y los otros seis quedan mudos. */}
          {rangoAbierto ? (
            <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
              Hasta el
              <Input
                type="date"
                value={hasta}
                min={fecha}
                onChange={(e) => setHasta(e.target.value)}
                className="h-7 w-36 text-[11px]"
              />
            </label>
          ) : (
            <button
              type="button"
              className="text-[11px] text-muted-foreground underline-offset-2 hover:underline"
              onClick={() => setRangoAbierto(true)}
            >
              Dura varios días
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
