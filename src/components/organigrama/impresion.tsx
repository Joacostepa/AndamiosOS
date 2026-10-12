"use client";

// Vista de impresión A4 (docs/organigrama/propuesta.md § 3.13): window.print() y CSS de
// impresión, sin html2canvas ni jsPDF. El mapa sale en A4 apaisada y cada ficha en una página
// vertical con nombre (`@page ficha`, soportado en Chromium).
//
// OJO CON EL TEMA OSCURO: la app arranca en oscuro y el papel es blanco. `.org-impresion`
// redefine los tokens neutros con los valores CLAROS de globals.css (:root), en pantalla y en
// papel, para que la vista previa sea fiel; si no, sale texto claro sobre papel blanco. Son
// los grises acromáticos del tema, no colores nuevos. Del color de área se usa solo el
// --tb-X-borde (tono medio, se lee igual en los dos temas) como raya superior de la columna.
//
// En la hoja impresa: ocupantes con nombre y SIN teléfonos; las vacantes como «Vacante» en texto.

import { useState } from "react";
import { Printer } from "lucide-react";
import Link from "next/link";
import { Aviso } from "@/components/permisos-via-publica/ui";
import { Button } from "@/components/ui/button";
import { ancestros, areaDe, estadoPuesto, fechaCorta, hijos, nombreCompleto, puestosDeArea, raiz } from "@/lib/organigrama/arbol";
import { hoyBA } from "@/lib/organigrama/datos";
import type { Nodo } from "@/lib/organigrama/tipos";
import { cn } from "@/lib/utils";
import { clasesArea } from "./colores-area";
import { useOrg } from "./proveedor";
import { personasDe } from "./tarjeta-puesto";

const CSS = `
.org-impresion {
  --background: oklch(1 0 0);
  --foreground: oklch(0.145 0 0);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.145 0 0);
  --muted: oklch(0.96 0 0);
  --muted-foreground: oklch(0.5 0 0);
  --border: oklch(0.9 0 0);
  color-scheme: light;
  background: var(--background);
  color: var(--foreground);
}
@page { size: A4 landscape; margin: 10mm; }
@page ficha { size: A4 portrait; margin: 12mm; }
@media print {
  /* Se oculta todo lo que no es la hoja ni la contiene (menú, encabezado, opciones), y los
     contenedores de la hoja quedan como bloques simples: sin position ni overflow, que en
     Chromium cortan la paginación y las páginas con nombre. */
  body *:not(:has(.org-impresion)):not(.org-impresion):not(.org-impresion *) { display: none !important; }
  body *:has(.org-impresion) {
    display: block !important; position: static !important; overflow: visible !important;
    margin: 0 !important; padding: 0 !important; border: 0 !important; width: auto !important;
    max-width: none !important; height: auto !important; min-height: 0 !important; background: none !important;
  }
  .org-impresion { width: auto !important; border: 0 !important; box-shadow: none !important; padding: 0 !important; margin: 0 !important; }
  .org-ficha { page: ficha; break-before: page; }
  .org-columna, .org-bloque { break-inside: avoid; }
}
`;

type Modo = "mapa" | "fichas" | "area";

function Ocupan({ clave }: { clave: string }) {
  const { datos } = useOrg();
  const ps = personasDe(datos, clave);
  const e = estadoPuesto(datos, clave);
  if (!ps.length) return <span className="italic">Vacante</span>;
  return (
    <>
      {ps.map((p) => `${nombreCompleto(p)}${p.activo ? "" : " (dado de baja)"}`).join(", ")}
      {e.vacante && e.interino && " (interino)"}
    </>
  );
}

function ColumnaImpresa({ area }: { area: Nodo }) {
  const { datos } = useOrg();
  return (
    <div className={cn("org-columna rounded-sm border border-t-4 p-2", clasesArea(area.color).borde)}>
      <p className="text-[11px] leading-tight font-bold">{area.titulo}</p>
      <p className="mb-1.5 text-[10px] text-muted-foreground">
        <Ocupan clave={area.clave} />
      </p>
      <ul className="grid gap-1.5">
        {puestosDeArea(datos.nodos, area.clave).map(({ nodo, nivel }) => (
          <li key={nodo.clave} className={cn("border-l-2 pl-1.5 text-[10px] leading-tight", nivel > 0 && "ml-2")}>
            <span className="block font-semibold">{nodo.titulo}</span>
            <span className="block text-muted-foreground">
              {nodo.fuenteOcupantes === "cuadrillas" ? `Capataces: ${personasDe(datos, nodo.clave).map(nombreCompleto).join(", ")}` : <Ocupan clave={nodo.clave} />}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FichaImpresa({ nodo }: { nodo: Nodo }) {
  const { datos } = useOrg();
  const area = areaDe(datos.nodos, nodo.clave);
  const heredar = nodo.tipo === "puesto" && area && area.clave !== nodo.clave;
  const noHace = nodo.noHace.length || !heredar ? nodo.noHace : area.noHace;
  const kpis = nodo.kpis.length || !heredar ? nodo.kpis : area.kpis;
  return (
    <section className="org-ficha mt-8 border-t pt-6 text-[12px] print:mt-0 print:border-0 print:pt-0">
      <h2 className="text-[18px] font-bold">{nodo.titulo}</h2>
      <p className="text-muted-foreground">
        {area && area.clave !== nodo.clave ? area.titulo : nodo.tipo === "direccion" ? "Dirección" : "Responsable del área"}
        {nodo.rol && ` · ${nodo.rol}`}
      </p>
      <p className="mt-2">
        <b>Ocupa:</b> {nodo.fuenteOcupantes === "cuadrillas" ? `Capataces ${personasDe(datos, nodo.clave).map(nombreCompleto).join(", ")}` : <Ocupan clave={nodo.clave} />}
      </p>
      <p>
        <b>Reporta a:</b> {ancestros(datos.nodos, nodo.clave).map((a) => a.titulo).join(" → ") || "—"}
      </p>
      {hijos(datos.nodos, nodo.clave).length > 0 && (
        <p>
          <b>Le reportan:</b> {hijos(datos.nodos, nodo.clave).map((h) => h.titulo).join(", ")}
        </p>
      )}
      {nodo.mision && (
        <div className="org-bloque mt-3">
          <h3 className="font-bold">Para qué está</h3>
          <p>{nodo.mision}</p>
        </div>
      )}
      {nodo.tareas.length > 0 && (
        <div className="org-bloque mt-3">
          <h3 className="font-bold">Qué hace</h3>
          <ol className="list-decimal pl-5">
            {nodo.tareas.map((t, i) => (
              <li key={i}>
                {t.texto}
                {t.docs?.length ? <span className="text-muted-foreground"> [{t.docs.map((d) => `${d.codigo} ${d.rol}`).join(", ")}]</span> : null}
              </li>
            ))}
          </ol>
        </div>
      )}
      {noHace.length > 0 && (
        <div className="org-bloque mt-3">
          <h3 className="font-bold">Qué NO hace{nodo.noHace.length ? "" : " (del área)"}</h3>
          <ul className="list-disc pl-5">
            {noHace.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </div>
      )}
      {kpis.length > 0 && (
        <div className="org-bloque mt-3">
          <h3 className="font-bold">Cómo se mide{nodo.kpis.length ? "" : " (del área)"}</h3>
          <p>{kpis.join(" · ")}</p>
        </div>
      )}
    </section>
  );
}

export function Impresion() {
  const { datos, version } = useOrg();
  const dg = raiz(datos.nodos);
  const areas = dg ? hijos(datos.nodos, dg.clave).filter((x) => x.tipo !== "puesto") : [];
  const [modo, setModo] = useState<Modo>("mapa");
  const [areaElegida, setAreaElegida] = useState(areas.find((a) => a.clave === "deposito")?.clave ?? areas[0]?.clave ?? "");
  if (!dg) return null;

  const columnas = modo === "area" ? areas.filter((a) => a.clave === areaElegida) : areas;
  const fichas: Nodo[] =
    modo === "fichas"
      ? [dg, ...areas.flatMap((a) => [a, ...puestosDeArea(datos.nodos, a.clave).map((x) => x.nodo)])]
      : modo === "area"
        ? columnas.flatMap((a) => [a, ...puestosDeArea(datos.nodos, a.clave).map((x) => x.nodo)])
        : [];

  return (
    <div className="space-y-4">
      <style>{CSS}</style>

      <div className="grid gap-3 print:hidden">
        <Aviso tono="marcha" className="md:hidden">
          Para imprimir, abrilo desde una computadora. El botón igual funciona.
        </Aviso>
        <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13.5px]">
          <legend className="sr-only">Qué imprimir</legend>
          <span className="font-medium">Qué imprimir:</span>
          {(
            [
              ["mapa", "Solo el mapa"],
              ["fichas", "Mapa + fichas de puesto"],
              ["area", "Un área"],
            ] as const
          ).map(([id, titulo]) => (
            <label key={id} className="flex min-h-10 items-center gap-2">
              <input type="radio" name="modo-impresion" value={id} checked={modo === id} onChange={() => setModo(id)} className="size-4 accent-foreground" />
              {titulo}
            </label>
          ))}
          {modo === "area" && (
            <select
              aria-label="Área a imprimir"
              value={areaElegida}
              onChange={(e) => setAreaElegida(e.target.value)}
              className="h-9 rounded-md border bg-background px-2 text-[13px] max-sm:h-10 dark:[color-scheme:dark]"
            >
              {areas.map((a) => (
                <option key={a.clave} value={a.clave}>
                  {a.titulo}
                </option>
              ))}
            </select>
          )}
        </fieldset>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button variant="outline" className="h-9 max-sm:h-10" nativeButton={false} render={<Link href="/organigrama" />}>
            Volver
          </Button>
          <Button className="h-9 max-sm:h-10" onClick={() => window.print()}>
            <Printer aria-hidden /> Imprimir
          </Button>
        </div>
        <p className="text-[12.5px] text-muted-foreground">
          Vista previa: el mapa sale en A4 apaisada{fichas.length ? " y cada ficha en una página vertical" : ""}. En papel siempre va en claro.
        </p>
      </div>

      <div className="-mx-1 overflow-x-auto px-1 print:mx-0 print:overflow-visible print:px-0">
        <div className="org-impresion mx-auto w-[277mm] max-w-none rounded-md border p-[10mm] shadow-sm print:w-auto">
          <header className="mb-4 flex items-end justify-between gap-4 border-b pb-2">
            <p className="text-[13px] font-bold tracking-wide">
              ANDAMIOS BUENOS AIRES · Organigrama · versión {version?.numero ?? "—"} · {version ? fechaCorta(version.fecha, true) : ""}
            </p>
            <p className="text-[10px] text-muted-foreground">Impreso el {fechaCorta(hoyBA(), true)}</p>
          </header>

          <div className="mx-auto mb-2 w-fit rounded-sm border border-t-4 px-4 py-1.5 text-center">
            <p className="text-[12px] font-bold">{dg.titulo}</p>
            <p className="text-[10px] text-muted-foreground">
              {dg.rol} · <Ocupan clave={dg.clave} />
            </p>
          </div>
          <div
            className="grid gap-2"
            style={{ gridTemplateColumns: `repeat(${Math.max(1, columnas.length)}, minmax(0, 1fr))` }}
          >
            {columnas.map((a) => (
              <ColumnaImpresa key={a.clave} area={a} />
            ))}
          </div>

          {fichas.map((n) => (
            <FichaImpresa key={n.clave} nodo={n} />
          ))}
        </div>
      </div>
    </div>
  );
}
