"use client";

// "¿Qué venís a hacer?". Cuatro gestos, en el orden en que más se usan. Un encargado
// identificado ve además lo suyo (conteo, control de cuadrilla, qué hay afuera).

import Link from "next/link";
import { ArrowDownToLine, KeyRound, ClipboardCheck, ClipboardList, PackageMinus, Truck, Users, Wrench, type LucideIcon } from "lucide-react";
import type { Identidad } from "@/lib/panol/tipos";
import { Pantalla, Titulo } from "./ui";

export type Gesto = "retiro" | "sobrante" | "herramienta" | "cuadrilla";

const GESTOS: { id: Gesto; titulo: string; sub: string; icono: LucideIcon }[] = [
  { id: "retiro", titulo: "Retirar", sub: "Insumos para la obra o el taller", icono: PackageMinus },
  { id: "sobrante", titulo: "Devolver sobrante", sub: "Alambre, precintos o lo que volvió de obra", icono: ArrowDownToLine },
  { id: "herramienta", titulo: "Herramienta", sub: "Pedir prestada o devolver, también lo a granel", icono: Wrench },
  { id: "cuadrilla", titulo: "Salida / vuelta de cuadrilla", sub: "Todo lo que lleva o trae una cuadrilla", icono: Truck },
];

const DE_ENCARGADO = [
  { href: "/kiosco/conteo", titulo: "Conteo", icono: ClipboardList },
  { href: "/kiosco/control-cuadrilla", titulo: "Control de cuadrilla", icono: ClipboardCheck },
  { href: "/kiosco/afuera", titulo: "Qué hay afuera", icono: Users },
];

export function Inicio({ identidad, onElegir, onUsarPin }: { identidad: Identidad; onElegir: (g: Gesto) => void; onUsarPin: () => void }) {
  const nombre = identidad.nombre.split(" ")[0];
  return (
    <Pantalla>
      <Titulo sub="¿Qué venís a hacer?">Hola, {nombre}</Titulo>
      <div className="flex flex-col gap-3">
        {GESTOS.map((g) => (
          <button
            key={g.id}
            type="button"
            onClick={() => onElegir(g.id)}
            className="flex min-h-20 items-center gap-4 rounded-xl border-2 border-input bg-card px-4 py-3 text-left active:translate-y-px"
          >
            <span className="grid size-12 shrink-0 place-items-center rounded-lg bg-muted">
              <g.icono className="size-7" aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block text-xl font-bold leading-tight">{g.titulo}</span>
              <span className="block text-base text-muted-foreground">{g.sub}</span>
            </span>
          </button>
        ))}
      </div>
      {/* La credencial está impresa: cualquiera que la tenga en la mano entra como esa persona.
          Por eso lo de encargado pide el PIN; con la credencial sólo se le avisa, no se lo frena. */}
      {identidad.encargadoSinPin && !identidad.esEncargado && (
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-muted p-4">
          <p className="text-base font-medium">Para lo de encargado (conteo, control, anular), entrá con tu PIN.</p>
          <button type="button" onClick={onUsarPin} className="flex h-14 items-center justify-center gap-2 rounded-xl border-2 border-input bg-card text-lg font-semibold">
            <KeyRound className="size-5" aria-hidden />
            Entrar con PIN
          </button>
        </div>
      )}
      {identidad.esEncargado && (
        <section className="mt-2 flex flex-col gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">A cargo del pañol</h2>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {DE_ENCARGADO.map((e) => (
              <Link key={e.href} href={e.href} className="flex h-14 items-center gap-3 rounded-xl border border-input bg-card px-4 text-lg font-semibold">
                <e.icono className="size-5" aria-hidden />
                {e.titulo}
              </Link>
            ))}
          </div>
        </section>
      )}
    </Pantalla>
  );
}
