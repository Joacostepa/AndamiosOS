"use client";

// La barra de arriba del lienzo: contadores vivos (se mueven al vuelo con cada cambio),
// deshacer/rehacer, el estado del borrador y el ÚNICO coral de la pantalla, «Publicar versión».
// También arrancan acá los modos didácticos: «Conocé ABA» y «Seguí el papel», y está el selector
// Lista / Árbol (en el celular no aparece: ahí siempre es lista). El contador de vacantes es
// también el interruptor «Resaltar vacantes» (tecla V): por defecto las vacantes se ven calmas.

import { useEffect, useRef } from "react";
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { FileText, GraduationCap, Highlighter, Keyboard, ListTree, MoreHorizontal, Network, Redo2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { CIRCUITOS } from "@/lib/organigrama/circuitos";
import type { FormaLayout } from "@/lib/organigrama/layout";
import type { Resumen } from "@/lib/organigrama/lienzo";
import { cn } from "@/lib/utils";
import { RESORTE } from "./comun";

/** Un número que cuenta hasta su valor nuevo y da un saltito cuando cambia. */
export function Numero({ valor }: { valor: number }) {
  const mv = useMotionValue(valor);
  const texto = useTransform(mv, (v) => Math.round(v).toString());
  const escala = useMotionValue(1);
  const reducido = useReducedMotion();
  const previo = useRef(valor);
  useEffect(() => {
    if (previo.current === valor) return;
    previo.current = valor;
    if (reducido) {
      mv.set(valor);
      return;
    }
    const a = animate(mv, valor, { type: "spring", stiffness: 140, damping: 20 });
    const b = animate(escala, [1.35, 1], { type: "spring", stiffness: 400, damping: 14 });
    return () => {
      a.stop();
      b.stop();
    };
  }, [valor, mv, escala, reducido]);
  return (
    <motion.span className="inline-block tabular-nums" style={{ scale: escala }}>
      {texto}
    </motion.span>
  );
}

function Contador({ valor, de, titulo }: { valor: number; de?: number; titulo: string }) {
  return (
    <div className="flex items-baseline gap-1 rounded-md bg-muted/60 px-2 py-1">
      <span className="text-[15px] font-bold">
        <Numero valor={valor} />
        {de !== undefined && <span className="text-[12px] font-medium text-muted-foreground">/{de}</span>}
      </span>
      <span className="text-[11.5px] text-muted-foreground">{titulo}</span>
    </div>
  );
}

/**
 * «N vacantes» que además resalta todas las vacantes del lienzo al tocarlo. Discreto: el mismo
 * contador, con un ícono de resaltador; activo, se rellena con el ámbar de aviso.
 */
function ContadorVacantes({ valor, activo, onAlternar }: { valor: number; activo: boolean; onAlternar: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={activo}
      onClick={onAlternar}
      title={activo ? "Dejar de resaltar las vacantes (V)" : "Resaltar vacantes (V)"}
      className={cn(
        "flex h-8 items-baseline gap-1 rounded-md px-2 py-1 outline-none focus-visible:ring-2 focus-visible:ring-ring max-sm:h-10",
        activo
          ? "bg-amber-500/20 text-amber-900 ring-1 ring-amber-500/60 dark:bg-amber-500/25 dark:text-amber-200"
          : valor > 0
            ? "bg-amber-500/10 text-amber-800 hover:bg-amber-500/15 dark:bg-amber-500/15 dark:text-amber-300"
            : "bg-muted/60 hover:bg-muted",
      )}
    >
      <span className="text-[15px] font-bold">
        <Numero valor={valor} />
      </span>
      <span className="text-[11.5px] text-muted-foreground">{valor === 1 ? "vacante" : "vacantes"}</span>
      <Highlighter aria-hidden className={cn("size-3.5 self-center", activo ? "opacity-100" : "opacity-60")} />
      <span className="sr-only">{activo ? "(resaltadas)" : "(resaltar)"}</span>
    </button>
  );
}

const FORMAS: { forma: FormaLayout; titulo: string; ayuda: string; Icono: typeof ListTree }[] = [
  { forma: "lista", titulo: "Lista", ayuda: "Los puestos de cada área en lista (L)", Icono: ListTree },
  { forma: "arbol", titulo: "Árbol", ayuda: "Los puestos se abren debajo de su área (L)", Icono: Network },
];

/** Lista / Árbol: un control segmentado discreto (sin coral). La pastilla viaja con un spring. */
function SelectorForma({ forma, onForma }: { forma: FormaLayout; onForma: (f: FormaLayout) => void }) {
  return (
    <div role="radiogroup" aria-label="Forma del organigrama" className="flex items-center rounded-md bg-muted/70 p-0.5">
      {FORMAS.map(({ forma: f, titulo, ayuda, Icono }) => {
        const activa = f === forma;
        return (
          <button
            key={f}
            type="button"
            role="radio"
            aria-checked={activa}
            title={ayuda}
            onClick={() => onForma(f)}
            className={cn(
              "relative inline-flex h-7 items-center gap-1.5 rounded px-2 text-[12px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring",
              activa ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {activa && <motion.span layoutId="forma-lienzo" aria-hidden className="absolute inset-0 rounded bg-card shadow-sm ring-1 ring-border" transition={RESORTE} />}
            <Icono aria-hidden className="relative size-3.5" />
            <span className="relative">{titulo}</span>
          </button>
        );
      })}
    </div>
  );
}

export function BarraLienzo({
  resumen,
  puedeEditar,
  enBorrador,
  hayBorrador,
  cambios,
  puedeDeshacer,
  puedeRehacer,
  onDeshacer,
  onRehacer,
  onPublicar,
  onVerCambios,
  onDescartar,
  onAlternarBorrador,
  onRecorrido,
  onPapel,
  onAtajos,
  ocupado,
  forma,
  onForma,
  resaltarVacantes,
  onResaltarVacantes,
}: {
  resumen: Resumen;
  puedeEditar: boolean;
  enBorrador: boolean;
  hayBorrador: boolean;
  cambios: number;
  puedeDeshacer: boolean;
  puedeRehacer: boolean;
  onDeshacer: () => void;
  onRehacer: () => void;
  onPublicar: () => void;
  onVerCambios: () => void;
  onDescartar: () => void;
  onAlternarBorrador: () => void;
  onRecorrido: () => void;
  onPapel: (id: string) => void;
  onAtajos: () => void;
  /** Un modo didáctico está activo: se esconden las acciones de edición. */
  ocupado: boolean;
  forma: FormaLayout;
  /** Sin esto (celular, siempre lista) no se muestra el selector Lista / Árbol. */
  onForma?: (f: FormaLayout) => void;
  resaltarVacantes: boolean;
  onResaltarVacantes: () => void;
}) {
  return (
    <div
      data-sin-pan
      data-panel="arriba"
      className="pointer-events-auto flex flex-wrap items-center gap-1.5 rounded-lg border bg-card/95 p-1.5 shadow-lg backdrop-blur"
    >
      <div className="flex flex-wrap items-center gap-1" aria-live="polite">
        <Contador valor={resumen.puestos} titulo="puestos" />
        <Contador valor={resumen.conPuesto} de={resumen.activos} titulo="personas" />
        <ContadorVacantes valor={resumen.vacantes} activo={resaltarVacantes} onAlternar={onResaltarVacantes} />
      </div>
      {onForma && !ocupado && <SelectorForma forma={forma} onForma={onForma} />}

      <div className="ml-auto flex flex-wrap items-center gap-1">
        {puedeEditar && !ocupado && (
          <>
            <Button variant="ghost" size="icon" className="max-sm:size-10" onClick={onDeshacer} disabled={!puedeDeshacer} aria-label="Deshacer" title="Deshacer (⌘Z)">
              <Undo2 aria-hidden />
            </Button>
            <Button variant="ghost" size="icon" className="max-sm:size-10" onClick={onRehacer} disabled={!puedeRehacer} aria-label="Rehacer" title="Rehacer (⇧⌘Z)">
              <Redo2 aria-hidden />
            </Button>
          </>
        )}
        {puedeEditar && hayBorrador && !ocupado && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="outline" className={cn("h-8 gap-1.5 max-sm:h-10", enBorrador && "border-dashed border-foreground/50")} />
              }
            >
              <span className="text-[12px] font-semibold tracking-wide">{enBorrador ? "BORRADOR" : "VIGENTE"}</span>
              {enBorrador && (
                <span className="text-[12px] text-muted-foreground">
                  · <Numero valor={cambios} /> {cambios === 1 ? "cambio" : "cambios"}
                </span>
              )}
              <MoreHorizontal aria-hidden />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-52">
              <DropdownMenuItem onClick={onAlternarBorrador}>{enBorrador ? "Ver la versión vigente" : "Ver y editar el borrador"}</DropdownMenuItem>
              <DropdownMenuItem onClick={onVerCambios}>Ver cambios</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={onDescartar}>
                Descartar borrador
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <Button variant="outline" className="h-8 max-sm:h-10" onClick={onRecorrido} title="Recorrido guiado por las áreas">
          <GraduationCap aria-hidden /> <span className="max-sm:sr-only">Conocé ABA</span>
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="outline" className="h-8 max-sm:h-10" title="Un circuito documental, paso a paso" />}>
            <FileText aria-hidden /> <span className="max-sm:sr-only">Seguí el papel</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-64">
            {CIRCUITOS.map((c) => (
              <DropdownMenuItem key={c.id} onClick={() => onPapel(c.id)} className="flex-col items-start gap-0">
                <span className="font-medium">{c.titulo}</span>
                <span className="text-[12px] text-muted-foreground">{c.resumen}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button variant="ghost" size="icon" className="max-md:hidden" onClick={onAtajos} aria-label="Atajos de teclado" title="Atajos (?)">
          <Keyboard aria-hidden />
        </Button>
        {puedeEditar && enBorrador && !ocupado && (
          <Button className="h-8 max-sm:h-10" disabled={cambios === 0} onClick={onPublicar}>
            Publicar versión
          </Button>
        )}
      </div>
    </div>
  );
}
