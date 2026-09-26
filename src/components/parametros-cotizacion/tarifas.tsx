"use client";

import { useMemo, useState } from "react";
import { Pencil, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EditarParametro } from "./editar-parametro";
import { GRUPOS, mostrarValor, type Parametro } from "@/lib/parametros-cotizacion/tipos";

// Las tarifas y reglas numéricas, agrupadas como en el criterio. Son los números que usa el
// motor de precios: lo que se cambia acá, el asistente lo aplica desde la próxima cuenta.

const fecha = (iso: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");

const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function Tarifas({ parametros, puedeEditar }: { parametros: Parametro[]; puedeEditar: boolean }) {
  const [editando, setEditando] = useState<Parametro | null>(null);
  const [busqueda, setBusqueda] = useState("");

  const grupos = useMemo(() => {
    const q = sinTildes(busqueda.trim());
    const visibles = q
      ? parametros.filter((p) => sinTildes(`${p.etiqueta} ${p.descripcion ?? ""} ${p.clave}`).includes(q))
      : parametros;
    const conocidos = GRUPOS.map((g) => ({ ...g, filas: visibles.filter((p) => p.grupo === g.id) }));
    const otros = [...new Set(visibles.map((p) => p.grupo))]
      .filter((g) => !GRUPOS.some((x) => x.id === g))
      .map((g) => ({ id: g, titulo: g, descripcion: "", filas: visibles.filter((p) => p.grupo === g) }));
    return [...conocidos, ...otros].filter((g) => g.filas.length > 0);
  }, [parametros, busqueda]);

  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar: bandeja, UOCRA, flete…" className="pl-8" />
      </div>

      {grupos.map((g) => (
        <section key={g.id} className="rounded-lg border border-border">
          <header className="border-b border-border bg-muted/30 px-4 py-2.5">
            <h2 className="text-sm font-semibold">{g.titulo}</h2>
            {g.descripcion && <p className="text-[12px] text-muted-foreground">{g.descripcion}</p>}
          </header>
          <ul className="divide-y divide-border">
            {g.filas.map((p) => (
              <li key={p.clave} className="flex items-start gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium">{p.etiqueta}</p>
                  {p.descripcion && <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">{p.descripcion}</p>}
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-mono text-[13px] tabular-nums">{mostrarValor(p)}</p>
                  <p className="text-[11px] text-muted-foreground">desde {fecha(p.vigente_desde)}</p>
                </div>
                {puedeEditar && (
                  <Button variant="ghost" size="icon-sm" onClick={() => setEditando(p)} aria-label={`Editar ${p.etiqueta}`}>
                    <Pencil />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}

      {grupos.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">Nada coincide con «{busqueda}».</p>}

      {editando && <EditarParametro key={editando.clave} parametro={editando} onCerrar={() => setEditando(null)} />}
    </div>
  );
}
