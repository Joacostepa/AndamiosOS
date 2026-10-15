"use client";

// Lista de piezas en vivo (BOM): por familia, con el bloque "Ajuste con caño y grampa", "sin
// peso" y "sin código" visibles, stock libre y faltantes, y ajustes manuales ± que NO tocan el
// modelo (quedan en diseno.ajustesBom). Pasar el cursor por una línea la resalta en el 3D.

import { useMemo, useState } from "react";
import { GRUPO_AJUSTE, type LineaBom } from "@/lib/tecnica/modelo";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useEditor } from "../estado/store";
import { aplicar } from "../estado/acciones";
import { Chips } from "./campos";
import { entero, fmt, kg } from "../util/formato";
import { Minus, Plus, Search } from "lucide-react";

export function ListaPiezas() {
  const bom = useEditor((s) => s.res.bom);
  const resumen = useEditor((s) => s.res.resumen);
  const modoBom = useEditor((s) => s.diseno.modoBom);
  const hayBastidor = useEditor((s) => s.diseno.estructuras.some((e) => e.sistema === "bastidor"));
  const soloLectura = useEditor((s) => s.soloLectura);
  const resaltado = useEditor((s) => s.bomResaltado);
  const [q, setQ] = useState("");
  const [filtro, setFiltro] = useState<"todo" | "sin" | "falta" | "ajuste">("todo");

  const grupos = useMemo(() => {
    const t = q.trim().toLowerCase();
    const lineas = bom.filter((l) => {
      if (filtro === "sin" && !(l.sinCodigo || l.peso_unit === null)) return false;
      if (filtro === "falta" && !((l.falta ?? 0) > 0)) return false;
      if (filtro === "ajuste" && !l.esAjuste) return false;
      return !t || (l.codigo ?? "").toLowerCase().includes(t) || l.descripcion.toLowerCase().includes(t);
    });
    const m = new Map<string, LineaBom[]>();
    for (const l of lineas) m.set(l.grupo, [...(m.get(l.grupo) ?? []), l]);
    // el bloque de ajuste va al final, separado
    return [...m.entries()].sort((a, b) => (a[0] === GRUPO_AJUSTE ? 1 : b[0] === GRUPO_AJUSTE ? -1 : 0));
  }, [bom, q, filtro]);

  const ajustar = (l: LineaBom, delta: number) => {
    if (!l.codigo) return;
    const s = useEditor.getState();
    const lista = [...(s.diseno.ajustesBom ?? [])];
    const i = lista.findIndex((a) => a.codigo === l.codigo);
    const nuevo = (i >= 0 ? lista[i].delta : 0) + delta;
    if (i >= 0) {
      if (nuevo === 0) lista.splice(i, 1);
      else lista[i] = { ...lista[i], delta: nuevo };
    } else lista.push({ codigo: l.codigo, delta, motivo: "manual" });
    s.commit({ ...s.diseno, ajustesBom: lista }, `Ajuste manual ${l.codigo} ${delta > 0 ? "+1" : "−1"}`);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-2 border-b border-border p-3">
        <div className="grid grid-cols-3 gap-2 text-center">
          <Dato titulo="Peso" valor={`${kg(resumen.pesoKg)}${resumen.pesoParcial ? "*" : ""} kg`} ayuda={resumen.pesoParcial ? "Mínimo: hay piezas sin peso o sin código" : undefined} />
          <Dato titulo="Piezas" valor={entero(resumen.piezas)} />
          <Dato titulo="Ajuste" valor={entero(resumen.piezasAjuste)} ayuda="Piezas de caño y grampa" />
        </div>
        {hayBastidor && (
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">Bastidores</span>
            <Chips
              opciones={[{ valor: "kit", etiqueta: "Por kit" }, { valor: "despiezado", etiqueta: "Despiezado" }]}
              valor={modoBom}
              deshabilitado={soloLectura}
              onElegir={(m) => aplicar({ tipo: "modoBom", modo: m }, m === "kit" ? "Lista por kit" : "Lista despiezada")}
            />
          </div>
        )}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar código o pieza" className="h-7 pl-7 text-xs" />
          </div>
        </div>
        <Chips
          opciones={[
            { valor: "todo", etiqueta: "Todo" }, { valor: "sin", etiqueta: "Sin peso / código" },
            { valor: "falta", etiqueta: "Falta stock" }, { valor: "ajuste", etiqueta: "Caño y grampa" },
          ]}
          valor={filtro}
          onElegir={setFiltro}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto" onPointerLeave={() => useEditor.getState().setBomResaltado(null)}>
        {grupos.map(([grupo, lineas]) => (
          <section key={grupo} className={cn("border-b border-border", grupo === GRUPO_AJUSTE && "bg-amber-500/5")}>
            <h4 className={cn("sticky top-0 z-[1] bg-card/95 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide backdrop-blur", grupo === GRUPO_AJUSTE ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground")}>
              {grupo} <span className="font-mono font-normal">({lineas.reduce((t, l) => t + l.cantidad, 0)})</span>
            </h4>
            <ul>
              {lineas.map((l) => (
                <li
                  key={l.clave}
                  className={cn("group grid grid-cols-[1fr_auto] gap-x-2 px-3 py-1 text-xs hover:bg-muted/60", resaltado === (l.codigo ?? l.clave) && "bg-primary/10")}
                  onPointerEnter={() => useEditor.getState().setBomResaltado(l.codigo ?? l.clave)}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className={cn("font-mono", l.sinCodigo && "text-destructive")}>{l.codigo ?? "sin código"}</span>
                      {l.peso_unit === null && !l.sinCodigo && <span className="rounded bg-muted px-1 text-[10px] text-muted-foreground">sin peso</span>}
                      {l.esKit && <span className="rounded bg-muted px-1 text-[10px] text-muted-foreground">kit</span>}
                    </div>
                    <div className="truncate text-muted-foreground" title={l.descripcion}>{l.descripcion}</div>
                    {(l.stockLibre !== null || (l.falta ?? 0) > 0) && (
                      <div className="text-[10px] text-muted-foreground">
                        stock libre {l.stockLibre ?? "—"}
                        {(l.falta ?? 0) > 0 && <span className="ml-1 font-medium text-destructive">falta {l.falta}</span>}
                      </div>
                    )}
                  </div>
                  <div className="flex items-start gap-1">
                    {!soloLectura && l.codigo && (
                      <span className="flex opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                        <Button size="icon-xs" variant="ghost" aria-label={`Restar 1 ${l.codigo}`} onClick={() => ajustar(l, -1)}><Minus /></Button>
                        <Button size="icon-xs" variant="ghost" aria-label={`Sumar 1 ${l.codigo}`} onClick={() => ajustar(l, 1)}><Plus /></Button>
                      </span>
                    )}
                    <div className="text-right">
                      <div className="font-mono font-medium">
                        {entero(l.cantidad)} <span className="text-muted-foreground">{l.unidad}</span>
                      </div>
                      {l.ajusteManual !== 0 && <div className="font-mono text-[10px] text-primary">{l.ajusteManual > 0 ? "+" : ""}{l.ajusteManual} manual</div>}
                      {l.medida !== undefined && <div className="font-mono text-[10px] text-muted-foreground">{fmt(l.medida)} {l.unidad === "u" ? "m²" : ""}</div>}
                      <div className="font-mono text-[10px] text-muted-foreground">{l.peso_total === null ? "—" : `${kg(l.peso_total)} kg`}</div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
        {!grupos.length && <p className="p-3 text-xs text-muted-foreground">No hay piezas para mostrar.</p>}
      </div>
      <p className="border-t border-border px-3 py-1.5 text-[10px] text-muted-foreground">
        PREDIMENSIONADO · {resumen.catalogoFuente === "fixture" ? "catálogo de prueba" : "catálogo de Andamios OS"} · {resumen.sinCodigo.length} sin código · {resumen.codigosSinPeso.length} sin peso
      </p>
    </div>
  );
}

function Dato({ titulo, valor, ayuda }: { titulo: string; valor: string; ayuda?: string }) {
  return (
    <div className="rounded-md bg-muted/60 px-2 py-1" title={ayuda}>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{titulo}</div>
      <div className="font-mono text-sm font-medium">{valor}</div>
    </div>
  );
}
