"use client";

// El banco de personas (dock de abajo): primero las que no tienen puesto, después todas, con
// búsqueda. Se arrastra un avatar a un puesto; un avatar que se arrastra FUERA de un puesto
// vuelve acá. Tocar un avatar lo selecciona para ubicarlo tocando un puesto (celular).

import { memo, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, ChevronUp, Search, Users } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { iniciales, nombreCompleto, normalizar } from "@/lib/organigrama/arbol";
import type { Persona } from "@/lib/organigrama/tipos";
import { cn } from "@/lib/utils";
import { useArrastre, useFuenteArrastre } from "./arrastre";

function Ficha({
  p,
  puestos,
  puedeEditar,
  seleccionada,
  onTocar,
}: {
  p: Persona;
  puestos: number;
  puedeEditar: boolean;
  seleccionada: boolean;
  onTocar: (id: string) => void;
}) {
  const fuente = useFuenteArrastre(() => ({ tipo: "persona", persona: p.id }), !puedeEditar || !p.activo);
  const { gesto, carga } = useArrastre();
  const agarrada = carga?.tipo === "persona" && carga.persona === p.id && !carga.desdeOcupante;
  return (
    <motion.li layout initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: agarrada ? 0.35 : 1, scale: 1 }} exit={{ opacity: 0, scale: 0.6 }}>
      <button
        type="button"
        {...fuente}
        onClick={() => !gesto.current.suprimirClick && onTocar(p.id)}
        aria-pressed={seleccionada}
        title={`${nombreCompleto(p)}${puestos ? ` · ${puestos} ${puestos === 1 ? "puesto" : "puestos"}` : " · sin puesto"}${!p.activo ? " · dado de baja" : ""}`}
        className={cn(
          "flex w-14 flex-col items-center gap-1 rounded-md py-1 outline-none focus-visible:ring-2 focus-visible:ring-ring",
          puedeEditar && p.activo && "cursor-grab active:cursor-grabbing",
          seleccionada && "bg-foreground/10",
        )}
      >
        <span className="relative">
          <Avatar className={cn(seleccionada && "ring-2 ring-foreground")}>
            <AvatarFallback className={cn("text-[11.5px] font-medium", !p.activo && "line-through", !puestos && p.activo && "border border-dashed border-amber-500")}>
              {iniciales(p)}
            </AvatarFallback>
          </Avatar>
          {puestos > 1 && (
            <span className="absolute -top-1 -right-1 rounded-full bg-muted px-1 text-[9.5px] font-semibold text-muted-foreground ring-2 ring-card">{puestos}</span>
          )}
        </span>
        <span className="w-full truncate text-center text-[10.5px] leading-tight text-muted-foreground">{p.nombre.split(" ")[0]}</span>
      </button>
    </motion.li>
  );
}

function BancoBase({
  personas,
  carga,
  puedeEditar,
  seleccion,
  onTocar,
}: {
  personas: Persona[];
  /** Cuántos puestos tiene cada persona. */
  carga: Map<string, number>;
  puedeEditar: boolean;
  seleccion: string | null;
  onTocar: (id: string) => void;
}) {
  const [abierto, setAbierto] = useState(true);
  const [q, setQ] = useState("");
  const { carga: arrastre, destino } = useArrastre();
  const recibiendo = arrastre?.tipo === "persona" && !!arrastre.desdeOcupante;
  const encima = recibiendo && destino?.tipo === "banco";

  const { sinPuesto, resto } = useMemo(() => {
    const t = normalizar(q.trim());
    const filtradas = personas
      .filter((p) => !t || normalizar(`${nombreCompleto(p)} ${p.empresa ?? ""}`).includes(t))
      .sort((a, b) => (a.apellido || a.nombre).localeCompare(b.apellido || b.nombre, "es"));
    return {
      sinPuesto: filtradas.filter((p) => p.activo && !carga.has(p.id)),
      resto: filtradas.filter((p) => !p.activo || carga.has(p.id)),
    };
  }, [personas, carga, q]);

  return (
    <motion.div
      data-sin-pan
      data-destino="banco"
      layout
      className={cn(
        "pointer-events-auto mx-auto w-full max-w-3xl rounded-lg border bg-card/95 shadow-lg backdrop-blur transition-colors",
        recibiendo && "border-dashed border-foreground/50",
        encima && "bg-muted",
      )}
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0, scale: encima ? 1.02 : 1 }}
      exit={{ opacity: 0, y: 24 }}
    >
      <div className="flex items-center gap-2 px-2 pt-1.5 pb-1">
        <button
          type="button"
          onClick={() => setAbierto((a) => !a)}
          aria-expanded={abierto}
          className="inline-flex h-8 items-center gap-1.5 rounded-md px-1.5 text-[12.5px] font-semibold hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Users aria-hidden className="size-4" />
          Personas
          {abierto ? <ChevronDown aria-hidden className="size-3.5" /> : <ChevronUp aria-hidden className="size-3.5" />}
        </button>
        <span className="text-[12px] text-muted-foreground max-sm:hidden">
          {recibiendo ? "Soltá acá para dejar el puesto vacante" : puedeEditar ? "Arrastrá a alguien a un puesto · o tocalo y tocá el puesto" : "Tocá a alguien para ver su ficha"}
        </span>
        {abierto && (
          <label className="relative ml-auto flex items-center">
            <Search aria-hidden className="pointer-events-none absolute left-2 size-3.5 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar"
              aria-label="Buscar personas"
              className="h-8 w-36 rounded-md border bg-background pr-2 pl-7 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring max-sm:w-28"
            />
          </label>
        )}
      </div>
      <AnimatePresence initial={false}>
        {abierto && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div data-con-scroll className="flex touch-pan-x items-start gap-3 overflow-x-auto px-2 pb-2 [scrollbar-width:thin]">
              {sinPuesto.length > 0 && (
                <section aria-label="Sin puesto" className="shrink-0">
                  <p className="mb-0.5 text-[10.5px] font-semibold tracking-wide text-amber-700 uppercase dark:text-amber-300">Sin puesto</p>
                  <ul className="flex gap-0.5">
                    <AnimatePresence initial={false}>
                      {sinPuesto.map((p) => (
                        <Ficha key={p.id} p={p} puestos={0} puedeEditar={puedeEditar} seleccionada={seleccion === p.id} onTocar={onTocar} />
                      ))}
                    </AnimatePresence>
                  </ul>
                </section>
              )}
              <section aria-label="Todas las personas" className="min-w-0 shrink-0">
                <p className="mb-0.5 text-[10.5px] font-semibold tracking-wide text-muted-foreground uppercase">Todas · {resto.length}</p>
                <ul className="flex gap-0.5">
                  <AnimatePresence initial={false}>
                    {resto.map((p) => (
                      <Ficha key={p.id} p={p} puestos={carga.get(p.id) ?? 0} puedeEditar={puedeEditar} seleccionada={seleccion === p.id} onTocar={onTocar} />
                    ))}
                  </AnimatePresence>
                </ul>
              </section>
              {!sinPuesto.length && !resto.length && <p className="py-3 text-[13px] text-muted-foreground">Nadie con «{q}».</p>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export const Banco = memo(BancoBase);
