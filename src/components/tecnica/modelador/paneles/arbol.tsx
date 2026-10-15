"use client";

// Estructuras de la obra y sus uniones (cambiar el modo o desunir).

import { tipologia } from "@/lib/tecnica/modelo";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useEditor } from "../estado/store";
import { aplicar } from "../estado/acciones";
import { iconoDe } from "../util/galeria";
import { fmt } from "../util/formato";

export function Arbol() {
  const diseno = useEditor((s) => s.diseno);
  const res = useEditor((s) => s.res);
  const pantalla = useEditor((s) => s.avisosPantalla);
  const sel = useEditor((s) => s.sel.estructuraId);
  const soloLectura = useEditor((s) => s.soloLectura);
  const uniones = res.uniones;

  return (
    <div className="space-y-0.5">
      {diseno.estructuras.map((e) => {
        const r = res.estructuras.find((x) => x.id === e.id);
        const tip = tipologia(e.tipologia);
        const Ic = iconoDe(tip?.presets.find((p) => p.id === e.preset)?.icono ?? tip?.presets[0]?.icono, e.tipologia);
        const errs = [...res.avisos, ...pantalla].filter((a) => a.estructuraId === e.id && a.nivel === "error").length;
        const avs = res.avisos.filter((a) => a.estructuraId === e.id && a.nivel === "aviso").length;
        const nOv = Object.keys(e.overrides ?? {}).length;
        return (
          <button
            key={e.id}
            type="button"
            onClick={() => useEditor.getState().seleccionar({ estructuraId: e.id, celdas: [], volumen: null })}
            className={cn("flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-xs hover:bg-muted", sel === e.id && "bg-primary/10 text-foreground")}
            title={`${e.nombre} · ${e.sistema === "bastidor" ? "bastidor" : "multidireccional"}${e.medida === "libre" ? " · medida libre" : ""}`}
          >
            <Ic className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{e.nombre}</span>
              <span className="block truncate font-mono text-[10px] text-muted-foreground">
                {r ? `${fmt(r.ml, 1)} ml · ${fmt(r.alturaReal, 1)} m` : "—"}
                {e.tipologia === "libre" ? " · libre" : e.medida === "libre" ? " · medida libre" : ""}
              </span>
            </span>
            {errs > 0 ? <span className="size-2 rounded-full bg-destructive" title={`${errs} errores`} /> : avs > 0 ? <span className="size-2 rounded-full bg-[var(--tb-aviso-icono)]" title={`${avs} avisos`} /> : null}
            {nOv > 0 && <span className="size-2 rounded-full bg-primary" title={`${nOv} ajustes de celda`} />}
          </button>
        );
      })}
      {!diseno.estructuras.length && <p className="px-1.5 text-[11px] text-muted-foreground">Sin estructuras. Elegí una plantilla de la galería.</p>}
      {uniones.length > 0 && (
        <div className="pt-1.5">
          <div className="px-1.5 pb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Uniones ({uniones.length})</div>
          {uniones.map((u) => (
            <div key={u.id} className="flex items-center gap-1 px-1.5 py-0.5 text-[11px]">
              <span className="min-w-0 flex-1 truncate text-muted-foreground" title={u.etiqueta}>{u.etiqueta}</span>
              {u.alternar && (
                <Button size="xs" variant="ghost" disabled={soloLectura} onClick={() => aplicar(u.alternar!, `Cambiar unión: ${u.etiqueta}`)}>
                  Cambiar
                </Button>
              )}
              {u.tipo === "estructura" && (
                <Button size="xs" variant="ghost" disabled={soloLectura} onClick={() => aplicar({ tipo: "quitarUnion", unionId: u.id }, `Desunir ${u.nombreB ?? ""}`)}>
                  Desunir
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
