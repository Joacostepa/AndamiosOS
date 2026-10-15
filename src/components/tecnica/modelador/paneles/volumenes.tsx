"use client";

// VOLÚMENES DE REFERENCIA (pedido de JS: "muchas veces nos pasan solo las medidas del
// edificio"). Se dibujan a partir de medidas: caja, prisma por planta, escalonado con
// retranqueos, salientes (balcón, marquesina, cornisa), cilindro/cúpula y huecos/patios.
// Se guardan en diseno.contexto.volumenes con el formato del núcleo (def versionada, ver
// src/lib/tecnica/modelo/volumenes) y sobre ellos se modela: «Estructura desde una cara» arma
// la fachada con el largo, el ángulo y la altura de la cara (o una envolvente en una cara curva,
// un patio interno en un patio y una estructura libre sobre una terraza).

import { useState } from "react";
import { toast } from "../util/toast";
import type { V2 } from "@/lib/tecnica/modelo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useEditor, resueltaSel } from "../estado/store";
import {
  formaDeGrupo, gruposDe, ladosDe, NOMBRE_FORMA, NOMBRE_SALIENTE, nuevoIdVolumen, ponerForma, salientePorDefecto,
  type FormaVolumen, type VolumenRef,
} from "../volumenes/geometria";
import { CampoNumero, EditorPoligono } from "../alzado/planta";
import { Chips } from "./campos";
import { fmt } from "../util/formato";
import { borrarVolumen } from "../comandos";
import { Box, MousePointerClick, Plus, Trash2 } from "lucide-react";

type Forma = FormaVolumen["forma"];

/** Los avisos de la geometría (planta inválida, saliente sin padre…) como toast. */
function avisar(avisos: string[]) {
  if (avisos.length) toast.warning(avisos[0], avisos.length > 1 ? { description: avisos.slice(1).join(" ") } : undefined);
}

function formaInicial(forma: Forma, diseno: ReturnType<typeof useEditor.getState>["diseno"], sobre?: VolumenRef): FormaVolumen | null {
  switch (forma) {
    case "caja": return { forma, largo: 20, ancho: 12, alto: 15, origen: [0, -12.2], rumbo: 0, yBase: 0 };
    case "prisma": return { forma, puntos: [[0, -12], [16, -12], [20, -6], [20, 0], [0, 0]], alto: 12, yBase: 0 };
    case "escalonado": return { forma, largo: 20, ancho: 14, origen: [0, -14.2], rumbo: 0, lados: "frente", pisos: [{ alto: 21, retiro: 0 }, { alto: 3, retiro: 2 }, { alto: 3, retiro: 2 }] };
    case "cilindro": return { forma, centro: [0, -6], radio: 5, alto: 8, cupula: true, altoCupula: 3, yBase: 0 };
    case "hueco": return { forma, largo: 6, ancho: 4, origen: [0, -8], rumbo: 0, yBase: 0, alto: 15 };
    case "saliente": {
      const v = sobre ?? (diseno.contexto.volumenes as VolumenRef[]).find((x) => !x.hueco && x.tipo === "edificio" && x.def?.tipo !== "saliente");
      if (!v) return null;
      return salientePorDefecto("marquesina", v.id, 0, ladosDe(v)[0]?.largo ?? 10);
    }
  }
}

export function Volumenes() {
  const diseno = useEditor((s) => s.diseno);
  const selGrupo = useEditor((s) => s.sel.volumen);
  const herramienta = useEditor((s) => s.herramienta);
  const desdeCara = useEditor((s) => s.desdeCara);
  const soloLectura = useEditor((s) => s.soloLectura);
  const r = useEditor(resueltaSel);
  const grupos = gruposDe(diseno);
  const hayVolumenes = grupos.length > 0;

  const agregar = (forma: Forma) => {
    const s = useEditor.getState();
    const f = formaInicial(forma, s.diseno);
    if (!f) return;
    const id = nuevoIdVolumen(s.diseno);
    const nombre = forma === "saliente" ? NOMBRE_SALIENTE[(f as Extract<FormaVolumen, { forma: "saliente" }>).tipo] : forma === "hueco" ? "Patio" : forma === "cilindro" ? "Tanque" : "Edificio";
    const r = ponerForma(s.diseno, id, f, nombre);
    avisar(r.avisos);
    if (s.commit(r.diseno, `Agregar volumen: ${NOMBRE_FORMA[forma].toLowerCase()}`)) useEditor.getState().seleccionar({ volumen: id });
  };

  /** Edificio detrás de la estructura seleccionada (largo y altura de la estructura). */
  const detras = () => {
    const s = useEditor.getState();
    if (!r) return;
    const est = s.diseno.estructuras.find((e) => e.id === r.id);
    const retiro = typeof est?.params.retiro === "number" ? est.params.retiro : 0.2;
    const rb = (r.marco.rumbo * Math.PI) / 180;
    const n: V2 = [-Math.sin(rb), Math.cos(rb)];
    const ancho = 12;
    const origen: V2 = [r.marco.origen[0] - n[0] * (retiro + ancho), r.marco.origen[1] - n[1] * (retiro + ancho)];
    const id = nuevoIdVolumen(s.diseno);
    const f: FormaVolumen = { forma: "caja", largo: Math.max(2, r.ml), ancho, alto: Math.max(3, Math.round(r.alturaReal)), origen: [Math.round(origen[0] * 100) / 100, Math.round(origen[1] * 100) / 100], rumbo: r.marco.rumbo, yBase: 0 };
    if (s.commit(ponerForma(s.diseno, id, f, "Edificio").diseno, `Edificio detrás de ${r.nombre}`)) useEditor.getState().seleccionar({ volumen: id });
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1">
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button size="xs" variant="outline" disabled={soloLectura} />}>
            <Plus /> Volumen
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {(Object.keys(NOMBRE_FORMA) as Forma[]).map((f) => (
              <DropdownMenuItem key={f} disabled={f === "saliente" && !hayVolumenes} onClick={() => agregar(f)}>
                {NOMBRE_FORMA[f]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        {r && (
          <Button size="xs" variant="ghost" disabled={soloLectura} onClick={detras} title="Caja del largo y la altura de la estructura seleccionada, detrás de ella">
            <Box /> Detrás de la selección
          </Button>
        )}
      </div>

      {hayVolumenes && (
        <div className="space-y-1.5 rounded-lg border border-border p-2">
          <Button
            size="xs"
            variant={herramienta === "cara" ? "default" : "outline"}
            className="w-full"
            disabled={soloLectura}
            aria-pressed={herramienta === "cara"}
            onClick={() => useEditor.getState().setHerramienta(herramienta === "cara" ? "seleccionar" : "cara")}
            title="Tocá una cara de un volumen en el 3D: se crea la fachada con su largo, ángulo y altura (envolvente en una cara curva, patio interno en un patio)"
          >
            <MousePointerClick /> {herramienta === "cara" ? "Tocá una cara en el 3D…" : "Estructura desde una cara"}
          </Button>
          <div className="grid grid-cols-2 gap-1.5">
            <label className="text-[11px] text-muted-foreground">
              Separación a fachada
              <CampoNumero valor={desdeCara.retiro} min={0} unidad="m" onCambiar={(v) => useEditor.getState().setDesdeCara({ retiro: v })} />
            </label>
            <label className="flex flex-col gap-1 text-[11px] text-muted-foreground" title="La fachada sigue las esquinas a 90° del volumen hasta una medianera">
              Seguir el contorno
              <Switch size="sm" checked={desdeCara.contorno} onCheckedChange={(v) => useEditor.getState().setDesdeCara({ contorno: v })} />
            </label>
          </div>
        </div>
      )}

      <ul className="space-y-0.5">
        {grupos.map((g) => (
          <li key={g.grupo}>
            <button
              type="button"
              onClick={() => useEditor.getState().seleccionar({ volumen: selGrupo === g.grupo ? null : g.grupo })}
              className={cn("flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-xs hover:bg-muted", selGrupo === g.grupo && "bg-primary/10")}
            >
              <span className={cn("size-2.5 shrink-0 rounded-sm", g.volumen.hueco ? "border border-dashed border-primary" : "bg-muted-foreground/50")} />
              <span className="min-w-0 flex-1 truncate">{g.nombre}</span>
              <span className="font-mono text-[10px] text-muted-foreground">
                {g.forma ? NOMBRE_FORMA[g.forma.forma].split(" ")[0].toLowerCase() : "volumen"} · {fmt(g.yTope, 1)} m
              </span>
            </button>
            {selGrupo === g.grupo && <EditorVolumen grupo={g.grupo} soloLectura={soloLectura} />}
          </li>
        ))}
      </ul>
      {!hayVolumenes && <p className="px-1 text-[11px] text-muted-foreground">Dibujá el edificio con sus medidas para modelar arriba: tocá una cara y sale la fachada.</p>}
    </div>
  );
}

function EditorVolumen({ grupo, soloLectura }: { grupo: string; soloLectura: boolean }) {
  const diseno = useEditor((s) => s.diseno);
  const fg = formaDeGrupo(diseno, grupo);
  const [nombre, setNombre] = useState<string | null>(null);
  if (!fg) {
    return (
      <div className="space-y-1 rounded-b-lg border-x border-b border-border p-2">
        <p className="text-[11px] text-muted-foreground">Este volumen no se edita con el formulario (planta no rectangular o cargado de otra forma): se ve y cuenta para choques y caras.</p>
        <BotonBorrarVolumen grupo={grupo} soloLectura={soloLectura} />
      </div>
    );
  }
  const f = fg.forma;
  const set = (nueva: FormaVolumen, txt: string, nom = fg.nombre) => {
    const s = useEditor.getState();
    const r = ponerForma(s.diseno, grupo, nueva, nom);
    avisar(r.avisos);
    s.commit(r.diseno, `${nom}: ${txt}`);
  };
  const num = (etiqueta: string, valor: number, aplicar: (v: number) => FormaVolumen, min = 0, unidad = "m") => (
    <label className="text-[11px] text-muted-foreground">
      {etiqueta}
      <CampoNumero valor={valor} min={min} unidad={unidad} deshabilitado={soloLectura} onCambiar={(v) => set(aplicar(v), `${etiqueta.toLowerCase()} ${fmt(v)}`)} />
    </label>
  );
  const pos = (o: V2, aplicar: (o: V2) => FormaVolumen) => (
    <>
      {num("A lo largo", o[0], (v) => aplicar([v, o[1]]), -1000)}
      {num("Hacia el fondo", o[1], (v) => aplicar([o[0], v]), -1000)}
    </>
  );
  const vols = (diseno.contexto.volumenes as VolumenRef[]).filter((v) => !v.hueco && v.def?.tipo !== "saliente");

  return (
    <div className="space-y-2 rounded-b-lg border-x border-b border-border p-2">
      <Input
        value={nombre ?? fg.nombre}
        disabled={soloLectura}
        className="h-7 text-xs"
        aria-label="Nombre del volumen"
        onChange={(e) => setNombre(e.target.value)}
        onBlur={() => {
          if (nombre && nombre.trim() && nombre !== fg.nombre) set(f, "nombre", nombre.trim());
          setNombre(null);
        }}
      />
      <div className="grid grid-cols-2 gap-1.5">
        {f.forma === "caja" && (
          <>
            {num("Largo", f.largo, (v) => ({ ...f, largo: v }), 0.5)}
            {num("Ancho", f.ancho, (v) => ({ ...f, ancho: v }), 0.5)}
            {num("Alto", f.alto, (v) => ({ ...f, alto: v }), 0.5)}
            {num("Desde altura", f.yBase, (v) => ({ ...f, yBase: v }), -50)}
            {pos(f.origen, (o) => ({ ...f, origen: o }))}
            {num("Giro (°)", f.rumbo, (v) => ({ ...f, rumbo: v }), -360, "°")}
          </>
        )}
        {f.forma === "hueco" && (
          <>
            {num("Largo", f.largo, (v) => ({ ...f, largo: v }), 0.5)}
            {num("Ancho", f.ancho, (v) => ({ ...f, ancho: v }), 0.5)}
            {num("Alto", f.alto, (v) => ({ ...f, alto: v }), 0.5)}
            {num("Desde altura", f.yBase, (v) => ({ ...f, yBase: v }), -50)}
            {pos(f.origen, (o) => ({ ...f, origen: o }))}
            {num("Giro (°)", f.rumbo, (v) => ({ ...f, rumbo: v }), -360, "°")}
          </>
        )}
        {f.forma === "prisma" && (
          <>
            {num("Alto", f.alto, (v) => ({ ...f, alto: v }), 0.5)}
            {num("Desde altura", f.yBase, (v) => ({ ...f, yBase: v }), -50)}
          </>
        )}
        {f.forma === "cilindro" && (
          <>
            {num("Radio", f.radio, (v) => ({ ...f, radio: v }), 0.2)}
            {num("Alto", f.alto, (v) => ({ ...f, alto: v }), 0.5)}
            {pos(f.centro, (o) => ({ ...f, centro: o }))}
            {num("Desde altura", f.yBase, (v) => ({ ...f, yBase: v }), -50)}
            {f.cupula && num("Alto de cúpula", f.altoCupula, (v) => ({ ...f, altoCupula: v }), 0)}
          </>
        )}
        {f.forma === "escalonado" && (
          <>
            {num("Largo", f.largo, (v) => ({ ...f, largo: v }), 0.5)}
            {num("Ancho", f.ancho, (v) => ({ ...f, ancho: v }), 0.5)}
            {pos(f.origen, (o) => ({ ...f, origen: o }))}
            {num("Giro (°)", f.rumbo, (v) => ({ ...f, rumbo: v }), -360, "°")}
          </>
        )}
        {f.forma === "saliente" && (
          <>
            {num("Vuelo", f.vuelo, (v) => ({ ...f, vuelo: v }), 0.05)}
            {num("Altura", f.altura, (v) => ({ ...f, altura: v }), 0)}
            {num("Espesor", f.espesor, (v) => ({ ...f, espesor: v }), 0.02)}
            {num("Largo", f.largo, (v) => ({ ...f, largo: v }), 0.2)}
            {num("Desde (sobre la cara)", f.desde, (v) => ({ ...f, desde: v }), 0)}
          </>
        )}
      </div>
      {f.forma === "cilindro" && (
        <label className="flex items-center justify-between text-xs">
          Con cúpula arriba
          <Switch size="sm" checked={f.cupula} disabled={soloLectura} onCheckedChange={(v) => set({ ...f, cupula: v }, v ? "con cúpula" : "sin cúpula")} />
        </label>
      )}
      {f.forma === "prisma" && <EditorPoligono valor={f.puntos} deshabilitado={soloLectura} onCambiar={(v, n) => Array.isArray(v) && set({ ...f, puntos: v }, n.toLowerCase())} />}
      {f.forma === "escalonado" && (
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground">Retranqueos</span>
            <Chips opciones={[{ valor: "frente", etiqueta: "Solo frente" }, { valor: "todos", etiqueta: "Todos los lados" }]} valor={f.lados} deshabilitado={soloLectura} onElegir={(l) => set({ ...f, lados: l }, "retranqueos")} />
          </div>
          {f.pisos.map((p, i) => (
            <div key={i} className="grid grid-cols-[3.5rem_1fr_1fr_auto] items-center gap-1">
              <span className="text-[11px] text-muted-foreground">Tramo {i + 1}</span>
              <CampoNumero valor={p.alto} min={0.5} unidad="m" deshabilitado={soloLectura} ariaLabel={`Alto del tramo ${i + 1}`} onCambiar={(v) => set({ ...f, pisos: f.pisos.map((q, k) => (k === i ? { ...q, alto: v } : q)) }, `alto tramo ${i + 1}`)} />
              <CampoNumero valor={p.retiro} min={0} unidad="m" deshabilitado={soloLectura || i === 0} ariaLabel={`Retiro del tramo ${i + 1}`} onCambiar={(v) => set({ ...f, pisos: f.pisos.map((q, k) => (k === i ? { ...q, retiro: v } : q)) }, `retiro tramo ${i + 1}`)} />
              <Button size="icon-xs" variant="ghost" aria-label={`Quitar tramo ${i + 1}`} disabled={soloLectura || f.pisos.length <= 1} onClick={() => set({ ...f, pisos: f.pisos.filter((_, k) => k !== i) }, `quitar tramo ${i + 1}`)}>
                <Trash2 />
              </Button>
            </div>
          ))}
          <Button size="xs" variant="outline" disabled={soloLectura} onClick={() => set({ ...f, pisos: [...f.pisos, { alto: 3, retiro: 2 }] }, "agregar tramo")}>
            <Plus /> Tramo
          </Button>
        </div>
      )}
      {f.forma === "saliente" && (
        <div className="space-y-1.5">
          <Chips opciones={(Object.keys(NOMBRE_SALIENTE) as (keyof typeof NOMBRE_SALIENTE)[]).map((t) => ({ valor: t, etiqueta: NOMBRE_SALIENTE[t] }))} valor={f.tipo} deshabilitado={soloLectura} onElegir={(t) => set({ ...f, tipo: t }, NOMBRE_SALIENTE[t].toLowerCase())} />
          <div className="grid grid-cols-2 gap-1.5">
            <label className="text-[11px] text-muted-foreground">
              Sobre
              <select className="h-7 w-full rounded-md border border-input bg-background px-1.5 text-xs" value={f.sobre} disabled={soloLectura} onChange={(e) => set({ ...f, sobre: e.target.value, cara: 0 }, "volumen")}>
                {vols.map((v) => <option key={v.id} value={v.id}>{v.nombre || v.id}</option>)}
              </select>
            </label>
            <label className="text-[11px] text-muted-foreground">
              Cara
              <select className="h-7 w-full rounded-md border border-input bg-background px-1.5 text-xs" value={f.cara} disabled={soloLectura} onChange={(e) => set({ ...f, cara: +e.target.value }, "cara")}>
                {(() => {
                  const v = vols.find((x) => x.id === f.sobre);
                  return v ? ladosDe(v).map((l) => <option key={l.lado} value={l.lado}>{`${l.lado + 1} · ${fmt(l.largo)} m`}</option>) : null;
                })()}
              </select>
            </label>
          </div>
        </div>
      )}
      <BotonBorrarVolumen grupo={grupo} soloLectura={soloLectura} />
    </div>
  );
}

function BotonBorrarVolumen({ grupo, soloLectura }: { grupo: string; soloLectura: boolean }) {
  return (
    <Button size="xs" variant="ghost" className="text-destructive" disabled={soloLectura} onClick={() => borrarVolumen(grupo)}>
      <Trash2 /> Borrar volumen
    </Button>
  );
}
