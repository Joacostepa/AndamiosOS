"use client";

// Monta la Escena 3D (imperativa) y la conecta con el store: le pasa los datos en cada cambio y
// traduce sus intenciones (clic, pincel, cara de volumen, colocación) a operaciones del núcleo.

import { useEffect, useRef, useState, type RefObject } from "react";
import { toast } from "sonner";
import { agregarEnCara, type Diseno, type Pieza } from "@/lib/tecnica/modelo";
import { cn } from "@/lib/utils";
import { useEditor, todosLosAvisos } from "../estado/store";
import { pintarDiseno } from "../estado/acciones";
import { fmt } from "../util/formato";
import { Escena, type DatosEscena } from "./escena";

function datosDe(verVolumenes: boolean): DatosEscena {
  const s = useEditor.getState();
  const errores = new Set<string>();
  for (const a of todosLosAvisos(s)) {
    if (a.nivel === "info" || !a.estructuraId || !a.celda) continue;
    errores.add(`${a.estructuraId}|${a.celda}`);
  }
  return {
    res: s.res, diseno: s.diseno, catalogo: s.catalogo, estructuraSel: s.sel.estructuraId, celdasSel: s.sel.celdas,
    hover: s.hover, volumenSel: s.sel.volumen, herramienta: s.herramienta, bomResaltado: s.bomResaltado, errores, verVolumenes,
  };
}

interface Ficha {
  pieza: Pieza;
  x: number;
  y: number;
}

export function Lienzo({ escenaRef, verVolumenes, className }: { escenaRef: RefObject<Escena | null>; verVolumenes: boolean; className?: string }) {
  const cont = useRef<HTMLDivElement>(null);
  const [ficha, setFicha] = useState<Ficha | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const verRef = useRef(verVolumenes);
  const pintura = useRef<{ base: Diseno; estructuraId: string; celdas: Set<string> } | null>(null);

  useEffect(() => {
    if (!cont.current) return;
    const escena = new Escena(cont.current, {
      alClic({ pieza, estructuraId, celda, shift }) {
        setFicha(null);
        const s = useEditor.getState();
        if (s.herramienta === "pincel") return;
        if (!estructuraId) {
          if (s.sel.celdas.length || s.sel.volumen) s.seleccionar({ celdas: [], volumen: null });
          return;
        }
        const misma = s.sel.estructuraId === estructuraId;
        const celdas = celda && (misma || pieza) ? [celda] : [];
        s.seleccionar({ estructuraId, celdas: shift && misma ? [...new Set([...s.sel.celdas, ...celdas])] : celdas, volumen: null });
      },
      alHover(info) {
        const s = useEditor.getState();
        const celda = info?.estructuraId === s.sel.estructuraId ? info?.celda ?? null : null;
        if (celda !== s.hover) s.setHover(celda);
        setFicha(info?.pieza ? { pieza: info.pieza, x: info.x, y: info.y } : null);
      },
      alPintar({ estructuraId, celda, fase }) {
        const s = useEditor.getState();
        if (s.soloLectura) return;
        if (fase === "inicio") {
          pintura.current = { base: s.diseno, estructuraId, celdas: new Set([celda]) };
        } else if (pintura.current) {
          pintura.current.celdas.add(celda);
        }
        const p = pintura.current;
        if (!p) return;
        if (fase === "fin") {
          const d = pintarDiseno(p.base, s.res, p.estructuraId, [...p.celdas], s.pincel);
          pintura.current = null;
          if (d !== p.base) s.commit(d, `Pincel en ${p.celdas.size} celda${p.celdas.size === 1 ? "" : "s"}`, p.base);
          else s.preview(p.base);
          return;
        }
        s.preview(pintarDiseno(p.base, s.res, p.estructuraId, [...p.celdas], s.pincel));
      },
      alClicCara({ caraId }) {
        const s = useEditor.getState();
        if (s.soloLectura) return;
        try {
          // lógica oficial: fachada en planta baja, libre sobre una terraza, envolvente en una cara
          // curva o patio interno en la pared de un patio
          const r = agregarEnCara(s.diseno, caraId, { retiro: s.desdeCara.retiro, seguir: s.desdeCara.contorno ? "contorno" : "cara" }, s.catalogo);
          if (!r.estructuraId || !r.propuesta) {
            toast.error("No pude armar una estructura en esa cara", { description: r.avisos[0] });
            return;
          }
          const nombre = r.diseno.estructuras.find((e) => e.id === r.estructuraId)?.nombre ?? "Estructura";
          if (s.commit(r.diseno, `${nombre} desde una cara`)) {
            useEditor.getState().seleccionar({ estructuraId: r.estructuraId, celdas: [] });
            useEditor.getState().setHerramienta("seleccionar");
            const que = { fachada: "Fachada", terraza: "Estructura sobre la terraza", envolvente: "Envolvente", patio: "Patio interno" }[r.propuesta.tipo];
            toast.success(`${que}: ${nombre}`, {
              description: [`Separada ${fmt(s.desdeCara.retiro)} m de la cara.`, ...r.avisos].join(" "),
              action: { label: "Deshacer", onClick: () => useEditor.getState().deshacer() },
            });
          }
        } catch (e) {
          toast.error("No pude armar la fachada desde esa cara", { description: e instanceof Error ? e.message : undefined });
        }
      },
      alClicVolumen(grupo) {
        useEditor.getState().seleccionar({ volumen: grupo });
      },
      alColocar({ estado, snap, alt }) {
        if (estado === "fin") {
          setHint(null);
          return;
        }
        setHint(snap ? `Encastra en ${snap.etiqueta}` : alt ? "Sin unir (Alt)" : "Libre: acercate a una línea azul para unir");
      },
      alColocado({ diseno, estructuraId, snap }) {
        const s = useEditor.getState();
        const nombre = diseno.estructuras.find((e) => e.id === estructuraId)?.nombre ?? "estructura";
        s.setColocando(null);
        if (s.commit(diseno, snap ? `Agregar ${nombre} (unión con ${snap.etiqueta.split(" · ").slice(0, 2).join(" · ")})` : `Agregar ${nombre}`)) {
          useEditor.getState().seleccionar({ estructuraId, celdas: [] });
          toast(snap ? `${nombre}: ${snap.etiqueta}` : `Agregué ${nombre.toLowerCase()} sin unir`, {
            description: snap ? "La unión quedó en la lista de estructuras." : "Para unirla, deshacé y soltala cerca de una línea azul.",
            action: { label: "Deshacer", onClick: () => useEditor.getState().deshacer() },
          });
        }
      },
    });
    escenaRef.current = escena;
    escena.actualizar(datosDe(verRef.current));
    let previo = useEditor.getState();
    const desub = useEditor.subscribe((s) => {
      if (s.res === previo.res && s.diseno === previo.diseno && s.sel === previo.sel && s.hover === previo.hover && s.herramienta === previo.herramienta && s.bomResaltado === previo.bomResaltado && s.avisosPantalla === previo.avisosPantalla) return;
      previo = s;
      escena.actualizar(datosDe(verRef.current));
    });
    // la colocación arranca y termina desde el store (galería, atajos, Esc)
    const desubColocar = useEditor.subscribe((s, ant) => {
      if (s.colocando === ant.colocando) return;
      if (s.colocando) escena.empezarColocacion(s.colocando);
      else escena.cancelarColocacion();
    });
    return () => {
      desub();
      desubColocar();
      escena.destruir();
      escenaRef.current = null;
    };
  }, [escenaRef]);

  useEffect(() => {
    verRef.current = verVolumenes;
    escenaRef.current?.actualizar(datosDe(verVolumenes));
  }, [verVolumenes, escenaRef]);

  const catalogo = useEditor((s) => s.catalogo);
  const item = ficha?.pieza.codigo ? catalogo.piezas[ficha.pieza.codigo] : undefined;
  const largo = ficha ? Math.hypot(ficha.pieza.b[0] - ficha.pieza.a[0], ficha.pieza.b[1] - ficha.pieza.a[1], ficha.pieza.b[2] - ficha.pieza.a[2]) : 0;

  return (
    <div className={cn("relative h-full w-full overflow-hidden", className)}>
      <div ref={cont} className="absolute inset-0" />
      {hint && (
        <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-lg border border-border bg-popover/95 px-3 py-1.5 text-xs text-popover-foreground shadow">
          <b className="font-medium">{hint}</b>
          <span className="ml-2 text-muted-foreground">Clic coloca · Alt sin unir · R gira · Esc cancela</span>
        </div>
      )}
      {ficha && (
        <div
          className="pointer-events-none fixed z-50 w-60 rounded-lg border border-border bg-popover p-2.5 text-xs text-popover-foreground shadow-lg"
          style={{ left: Math.min(ficha.x + 16, (typeof window !== "undefined" ? window.innerWidth : 2000) - 260), top: ficha.y + 14 }}
        >
          <div className="font-mono font-medium">{ficha.pieza.codigo ?? <span className="text-destructive">sin código</span>}</div>
          <div className="text-muted-foreground">{item?.descripcion ?? ficha.pieza.familia.replace(/_/g, " ")}</div>
          <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
            <dt className="text-muted-foreground">Medida</dt>
            <dd className="font-mono">
              {ficha.pieza.medida ? `${fmt(ficha.pieza.medida)} ${item?.unidad === "m²" || ficha.pieza.familia === "fenolico" || ficha.pieza.familia === "lona" ? "m²" : "m"}` : `${fmt(ficha.pieza.medidas.largo ?? largo)} m`}
            </dd>
            <dt className="text-muted-foreground">Peso</dt>
            <dd className="font-mono">{ficha.pieza.peso_kg == null ? <span className="rounded bg-muted px-1">sin peso</span> : `${fmt(ficha.pieza.peso_kg, 1)} kg`}</dd>
            {ficha.pieza.celda && (
              <>
                <dt className="text-muted-foreground">Celda</dt>
                <dd className="font-mono">{ficha.pieza.celda}</dd>
              </>
            )}
            {ficha.pieza.ajuste && (
              <>
                <dt className="text-muted-foreground">Ajuste</dt>
                <dd>caño y grampa ({fmt(ficha.pieza.ajuste.medidaPedida)} m)</dd>
              </>
            )}
          </dl>
        </div>
      )}
    </div>
  );
}
