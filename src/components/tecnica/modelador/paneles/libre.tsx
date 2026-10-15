"use client";

// Herramientas de la ESTRUCTURA LIBRE (pedido 8c): crecer hacia un costado, hacia afuera o
// hacia arriba (también solo en una zona), medida por vano (catálogo o libre), apoyo por
// columna a distinto nivel y extras por nodo. Todo entra por OpEsqueleto del núcleo: las
// reglas quedan como sugerencias en Avisos, no se imponen.

import { useState } from "react";
import { editarEsqueleto, partirClave, type Columna, type Diseno, type EstructuraResuelta, type OpEsqueleto } from "@/lib/tecnica/modelo";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useEditor } from "../estado/store";
import { operarEsqueleto } from "../estado/acciones";
import { CampoNumero } from "../alzado/planta";
import { Chips } from "./campos";
import { fmt } from "../util/formato";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Minus, Plus } from "lucide-react";

const APOYOS: { valor: Columna["apoyo"]; etiqueta: string }[] = [
  { valor: "base_regulable", etiqueta: "Base regulable" },
  { valor: "base_fija", etiqueta: "Base fija" },
  { valor: "rueda_freno", etiqueta: "Rueda c/freno" },
  { valor: "colgada", etiqueta: "Colgada" },
  { valor: "ninguno", etiqueta: "Sin apoyo" },
];

export function PanelLibre({ r, soloLectura }: { r: EstructuraResuelta; soloLectura: boolean }) {
  const celdas = useEditor((s) => s.sel.celdas);
  const catalogo = useEditor((s) => s.catalogo);
  const esq = r.esqueleto;
  const vanosSel = [...new Set(celdas.map((c) => partirClave(c).id))].map((id) => esq.vanos.find((v) => v.id === id)).filter((v) => !!v);
  const ks = celdas.map((c) => partirClave(c).k);
  const vano = vanosSel[0] ?? esq.vanos.find((v) => v.cara === "exterior") ?? esq.vanos[0];
  const [medida, setMedida] = useState(2.5);
  const [zona, setZona] = useState(false);
  const [cotaNueva, setCotaNueva] = useState<number | null>(null);
  const cotaSug = Math.round(((esq.cotas[esq.cotas.length - 1] ?? 0) + 2) * 100) / 100;
  const vanosCat = catalogo.medidas.multi.vanos.length ? catalogo.medidas.multi.vanos : [2.5, 2, 1.5, 1.25, 1.09, 0.73];
  const libre = !vanosCat.some((x) => Math.abs(x - medida) < 0.002);
  const op = (o: OpEsqueleto, nombre: string) => operarEsqueleto(r.id, o, nombre);
  // nombre legible del vano (V1, V2… en su cara), en vez del id interno
  const nombreVano = (v: { id: string; cara?: string } | undefined) => {
    if (!v) return "—";
    const deCara = esq.vanos.filter((x) => x.cara === v.cara);
    const i = deCara.findIndex((x) => x.id === v.id);
    return `V${i + 1}${v.cara && v.cara !== "exterior" ? ` (${v.cara})` : ""}`;
  };
  const columnasSel = [...new Set(vanosSel.flatMap((v) => [v.a, v.b]))];
  const colsDe = columnasSel.map((id) => esq.columnas.find((c) => c.id === id)).filter((c) => !!c);

  const crecer = (hacia: "izq" | "der" | "afuera" | "adentro") => {
    if (!vano) return;
    op(
      {
        op: "agregarVano", desde: { vanoId: vano.id }, hacia, medida, libre,
        ...(zona && ks.length ? { desdeK: Math.max(0, Math.min(...ks) - 1), hastaK: Math.max(...ks) } : {}),
      },
      `Agregar vano de ${fmt(medida)} ${hacia === "izq" ? "a la izquierda" : hacia === "der" ? "a la derecha" : hacia === "afuera" ? "hacia afuera" : "hacia adentro"}${zona ? " (en la zona)" : ""}`,
    );
  };

  return (
    <section className="space-y-2 rounded-lg border border-border p-2">
      <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Estructura libre</h4>
      <p className="text-[11px] text-muted-foreground">
        {vanosSel.length
          ? `Crece desde el vano ${nombreVano(vano)} (${fmt(vano?.medida ?? 0)} m${vano?.libre ? ", caño y grampa" : ""}) · ${celdas.length} celda${celdas.length === 1 ? "" : "s"}`
          : `Sin selección: crece desde el vano ${nombreVano(vano)} de la cara exterior. Tocá una celda en el alzado o en el 3D para crecer desde otro lado.`}
      </p>

      <div className="space-y-1">
        <span className="text-xs text-muted-foreground">Medida del vano nuevo</span>
        <Chips opciones={vanosCat.map((x) => ({ valor: x, etiqueta: fmt(x) }))} valor={medida} onElegir={setMedida} deshabilitado={soloLectura} />
        <div className="flex items-center gap-2">
          <CampoNumero className="w-24" valor={medida} min={0.2} unidad="m" onCambiar={setMedida} deshabilitado={soloLectura} ariaLabel="Medida libre del vano" />
          {libre && <span className="text-[11px] text-[var(--tb-aviso-icono)]">medida libre: caño y grampa</span>}
        </div>
      </div>

      <div className="space-y-1">
        <span className="text-xs text-muted-foreground">Agregar un vano</span>
        <div className="grid grid-cols-2 gap-1 [&_button]:h-auto [&_button]:min-h-7 [&_button]:whitespace-normal [&_button]:py-1 [&_button]:text-left">
          <Button size="xs" variant="outline" disabled={soloLectura || !vano} onClick={() => crecer("izq")} title="Un vano más al costado, al principio de la fila (en el sentido del alzado)">
            <ArrowLeft /> Al costado, al inicio
          </Button>
          <Button size="xs" variant="outline" disabled={soloLectura || !vano} onClick={() => crecer("der")} title="Un vano más al costado, al final de la fila (en el sentido del alzado)">
            <ArrowRight /> Al costado, al final
          </Button>
          <Button size="xs" variant="outline" disabled={soloLectura || !vano} onClick={() => crecer("afuera")} title="Otra fila de profundidad del lado de la cara exterior">
            <ArrowDown /> Hacia afuera
          </Button>
          <Button size="xs" variant="outline" disabled={soloLectura || !vano} onClick={() => crecer("adentro")} title="Otra fila de profundidad del lado de la fachada">
            <ArrowUp /> Hacia la fachada
          </Button>
        </div>
      </div>
      <label className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        Solo en la zona elegida (niveles de la selección)
        <Switch size="sm" checked={zona} onCheckedChange={setZona} disabled={soloLectura || !ks.length} />
      </label>

      <div className="flex flex-wrap gap-1">
        <Button size="xs" variant="outline" disabled={soloLectura || !vanosSel.length} onClick={() => vano && op({ op: "medidaVano", vanoId: vano.id, medida, libre }, `Vano ${nombreVano(vano)}: ${fmt(vano.medida)} → ${fmt(medida)} m`)}>
          Cambiar medida a {fmt(medida)}
        </Button>
        <Button size="xs" variant="outline" disabled={soloLectura || !vanosSel.length || esq.vanos.length <= 1} onClick={() => vano && op({ op: "quitarVano", vanoId: vano.id }, `Quitar vano ${nombreVano(vano)}`)}>
          <Minus /> Quitar vano
        </Button>
      </div>

      <div className="space-y-1 border-t border-border pt-2">
        <span className="text-xs text-muted-foreground">Niveles: {esq.cotas.length} (a {esq.cotas.map((c) => fmt(c)).join(" · ")} m)</span>
        <span className="block text-[11px] text-muted-foreground">Altura del nivel nuevo</span>
        <div className="flex flex-wrap items-center gap-1">
          <CampoNumero className="w-24" valor={cotaNueva ?? cotaSug} min={0.1} unidad="m" onCambiar={setCotaNueva} deshabilitado={soloLectura} ariaLabel="Cota del nivel nuevo" />
          <Button
            size="xs"
            variant="outline"
            disabled={soloLectura}
            onClick={() => {
              const c = cotaNueva ?? cotaSug;
              op({ op: "agregarNivel", cota: c, ...(zona && columnasSel.length ? { columnas: columnasSel } : {}) }, `Agregar nivel a ${fmt(c)} m${zona ? " (en la zona)" : ""}`);
              setCotaNueva(null);
            }}
          >
            <Plus /> Nivel
          </Button>
          <Button
            size="xs"
            variant="outline"
            disabled={soloLectura || !ks.length || esq.cotas.length <= 2}
            onClick={() => {
              const k = Math.max(...ks);
              op({ op: "quitarNivel", k, ...(zona && columnasSel.length ? { columnas: columnasSel } : {}) }, `Quitar nivel a ${fmt(esq.cotas[k])} m`);
            }}
          >
            <Minus /> Nivel de la selección
          </Button>
        </div>
      </div>

      {colsDe.length > 0 && (
        <div className="space-y-1 border-t border-border pt-2">
          <span className="text-xs text-muted-foreground">Apoyo de {colsDe.length === 1 ? "la columna elegida" : `las ${colsDe.length} columnas elegidas`}</span>
          <Chips
            opciones={APOYOS}
            valor={colsDe.every((c) => c.apoyo === colsDe[0].apoyo) ? colsDe[0].apoyo : undefined}
            deshabilitado={soloLectura}
            onElegir={(apoyo) => {
              const s = useEditor.getState();
              let d = s.diseno;
              for (const c of colsDe) d = editarCol(d, r.id, { op: "columna", columnaId: c.id, apoyo });
              s.commit(d, `Apoyo ${APOYOS.find((a) => a.valor === apoyo)?.etiqueta.toLowerCase()} en ${colsDe.length} columna${colsDe.length === 1 ? "" : "s"}`);
            }}
          />
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-muted-foreground">Suelo a</span>
            <CampoNumero
              className="w-24"
              valor={colsDe[0].ySuelo ?? 0}
              min={-50}
              unidad="m"
              deshabilitado={soloLectura}
              ariaLabel="Cota del suelo bajo las columnas"
              onCambiar={(y) => {
                const s = useEditor.getState();
                let d = s.diseno;
                for (const c of colsDe) d = editarCol(d, r.id, { op: "columna", columnaId: c.id, ySuelo: y, yBase: Math.max(y + 0.25, Math.min(c.yBase, y + 0.75)) });
                s.commit(d, `Apoyo a ${fmt(y)} m en ${colsDe.length} columna${colsDe.length === 1 ? "" : "s"}`);
              }}
            />
            <span className="text-[11px] text-muted-foreground">(apoyos a distinto nivel)</span>
          </div>
          <Button
            size="xs"
            variant="outline"
            disabled={soloLectura}
            onClick={() => {
              const s = useEditor.getState();
              let d = s.diseno;
              const k = Math.min(...ks, esq.cotas.length - 1);
              for (const c of colsDe) {
                const clave = `${c.id}@${Math.max(0, k)}`;
                const tiene = !!esq.nodos[clave]?.estabilizador;
                d = editarCol(d, r.id, { op: "nodo", clave, valor: { estabilizador: tiene ? null : { brazo: 1.2 } } });
              }
              s.commit(d, "Estabilizadores en la selección");
            }}
          >
            Estabilizador
          </Button>
        </div>
      )}

      {esq.elementos.length > 0 && (
        <details className="border-t border-border pt-2">
          <summary className="cursor-pointer text-xs text-muted-foreground">Elementos especiales ({esq.elementos.length})</summary>
          <ul className="mt-1 max-h-40 space-y-0.5 overflow-y-auto">
            {esq.elementos.map((el) => (
              <li key={el.id} className="flex items-center justify-between gap-1 text-[11px]">
                <span className="truncate font-mono">{el.grupo ? `${el.grupo} · ` : ""}{el.familia.replace(/_/g, " ")}</span>
                <Button size="xs" variant="ghost" disabled={soloLectura} onClick={() => op({ op: "quitarElemento", id: el.id }, `Quitar ${el.familia.replace(/_/g, " ")}`)}>
                  Quitar
                </Button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}


function editarCol(d: Diseno, id: string, o: OpEsqueleto): Diseno {
  return editarEsqueleto(d, id, o, useEditor.getState().catalogo);
}
