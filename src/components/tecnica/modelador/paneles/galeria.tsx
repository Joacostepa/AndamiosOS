"use client";

// Galería de plantillas (dinámica, desde el registro de tipologías) + "Mis plantillas" de la
// Oficina Técnica. Clic en una plantilla: si la obra está vacía la agrega en el origen; si no,
// la deja "en la mano" para ubicarla en el 3D con encastre (como en la maqueta).

import { useState } from "react";
import { toast } from "sonner";
import { instanciarPlantilla, type Diseno, type PresetGaleria, type Union } from "@/lib/tecnica/modelo";
import { cn } from "@/lib/utils";
import { useEditor } from "../estado/store";
import { agregarPreset } from "../estado/acciones";
import { useModelos } from "../datos/api";
import type { ModeloFila } from "../datos/tipos";
import { galeriaAgrupada, iconoDe } from "../util/galeria";
import { ChevronDown, ChevronRight, Star } from "lucide-react";

const GRUPOS = galeriaAgrupada();

/** Suma las estructuras de una plantilla propia al diseño, con ids nuevos. */
export function sumarPlantilla(diseno: Diseno, plantilla: Diseno, origen: [number, number]): { diseno: Diseno; ids: string[] } {
  const p = instanciarPlantilla(plantilla, { origen });
  const d = structuredClone(diseno);
  let n = Math.max(0, ...d.estructuras.map((e) => +e.id.replace(/\D/g, "") || 0));
  let u = Math.max(0, ...d.uniones.map((x) => +x.id.replace(/\D/g, "") || 0));
  const mapa = new Map<string, string>();
  for (const e of p.estructuras) mapa.set(e.id, `E${++n}`);
  for (const e of p.estructuras) {
    const nuevo = { ...e, id: mapa.get(e.id)! };
    if (nuevo.apoyo?.tipo === "sobre_estructura") nuevo.apoyo = { tipo: "sobre_estructura", estructuraId: mapa.get(nuevo.apoyo.estructuraId) ?? nuevo.apoyo.estructuraId };
    d.estructuras.push(nuevo);
  }
  for (const x of p.uniones) {
    const un: Union = { ...x, id: `U${++u}`, a: { ...x.a, estructuraId: mapa.get(x.a.estructuraId)! }, b: { ...x.b, estructuraId: mapa.get(x.b.estructuraId)! } };
    d.uniones.push(un);
  }
  // los volúmenes de la plantilla también vienen (si no están ya)
  const ids = new Set(d.contexto.volumenes.map((v) => v.id));
  for (const v of p.contexto.volumenes) if (!ids.has(v.id)) d.contexto.volumenes.push(v);
  return { diseno: d, ids: [...mapa.values()] };
}

export function Galeria() {
  const soloLectura = useEditor((s) => s.soloLectura);
  const colocando = useEditor((s) => s.colocando);
  const [abiertos, setAbiertos] = useState<Record<string, boolean>>({ fachadas: true });
  const plantillas = useModelos({ plantillas: true });

  const elegir = (p: PresetGaleria) => {
    const s = useEditor.getState();
    if (s.soloLectura) return;
    if (!s.diseno.estructuras.length) {
      agregarPreset(p.id, p.nombre);
      return;
    }
    s.setColocando(s.colocando === p.id ? null : p.id);
  };

  const usarPlantilla = async (m: { id: string; nombre: string }) => {
    try {
      const r = await fetch(`/api/tecnica/modelador/${m.id}`);
      if (!r.ok) throw new Error(`Error ${r.status}`);
      const { modelo } = (await r.json()) as { modelo: ModeloFila };
      const s = useEditor.getState();
      const xs = s.res.estructuras.flatMap((e) => e.huella.map((q) => q[0]));
      const origen: [number, number] = [xs.length ? Math.max(...xs) + 3 : 0, 0];
      const { diseno, ids } = sumarPlantilla(s.diseno, modelo.diseno, origen);
      if (s.commit(diseno, `Plantilla ${m.nombre}`)) {
        useEditor.getState().seleccionar({ estructuraId: ids[0] ?? null, celdas: [] });
        toast.success(`Sumé la plantilla ${m.nombre}`, { action: { label: "Deshacer", onClick: () => useEditor.getState().deshacer() } });
      }
    } catch (e) {
      toast.error("No pude abrir la plantilla", { description: e instanceof Error ? e.message : undefined });
    }
  };

  return (
    <div className="space-y-1">
      {GRUPOS.map((g) => {
        const abierto = abiertos[g.id] ?? false;
        return (
          <section key={g.id}>
            <button
              type="button"
              className="flex w-full items-center gap-1 px-1 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
              onClick={() => setAbiertos({ ...abiertos, [g.id]: !abierto })}
              aria-expanded={abierto}
            >
              {abierto ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
              {g.etiqueta}
              <span className="ml-auto font-mono font-normal">{g.presets.length}</span>
            </button>
            {abierto && (
              <div className="grid grid-cols-2 gap-1 pb-1">
                {g.presets.map((p) => {
                  const Ic = iconoDe(p.icono, p.tipologia);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      disabled={soloLectura}
                      title={`${p.descripcion}\nClic: ubicar en la obra`}
                      onClick={() => elegir(p)}
                      aria-pressed={colocando === p.id}
                      className={cn(
                        "flex flex-col items-start gap-1 rounded-lg border border-border p-1.5 text-left text-xs transition-colors hover:border-primary/50 hover:bg-muted disabled:opacity-50",
                        colocando === p.id && "border-primary bg-primary/10",
                      )}
                    >
                      <span className="flex w-full items-center justify-between">
                        <Ic className="size-4 text-muted-foreground" />
                        {p.tecla && <kbd className="rounded border border-border px-1 font-mono text-[10px] text-muted-foreground">{p.tecla}</kbd>}
                      </span>
                      <span className="line-clamp-2 leading-tight">{p.nombre}</span>
                      <span className="text-[10px] text-muted-foreground">{p.sistema === "bastidor" ? "bastidor" : "multidireccional"}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}
      <section>
        <button
          type="button"
          className="flex w-full items-center gap-1 px-1 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
          onClick={() => setAbiertos({ ...abiertos, mias: !abiertos.mias })}
          aria-expanded={!!abiertos.mias}
        >
          {abiertos.mias ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
          <Star className="size-3" /> Mis plantillas
          <span className="ml-auto font-mono font-normal">{plantillas.data?.length ?? ""}</span>
        </button>
        {abiertos.mias && (
          <div className="space-y-1 pb-1">
            {plantillas.isLoading && <p className="px-1 text-[11px] text-muted-foreground">Cargando…</p>}
            {plantillas.isError && <p className="px-1 text-[11px] text-muted-foreground">No pude leer las plantillas propias.</p>}
            {plantillas.data?.length === 0 && <p className="px-1 text-[11px] text-muted-foreground">Todavía no hay. Guardá un modelo con «Guardar como plantilla».</p>}
            {plantillas.data?.map((m) => (
              <button
                key={m.id}
                type="button"
                disabled={soloLectura}
                onClick={() => usarPlantilla(m)}
                className="flex w-full items-center gap-2 rounded-lg border border-border p-1.5 text-left text-xs hover:bg-muted disabled:opacity-50"
                title={m.descripcion ?? m.nombre}
              >
                <Star className="size-3.5 shrink-0 text-primary" />
                <span className="min-w-0 flex-1 truncate">{m.nombre}</span>
                <span className="text-[10px] text-muted-foreground">{m.plantilla_categoria ?? ""}</span>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
