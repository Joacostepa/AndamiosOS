"use client";

import { use } from "react";
import { PantallaEtiquetas, type Inicial } from "@/components/panol/oficina/etiquetas/pantalla-etiquetas";
import { esTipoEtiqueta } from "@/lib/panol/etiquetas";

// Pañol › Etiquetas. Se puede llegar con la elección hecha:
//   ?solo=nuevas                       lo que quedó sin imprimir (p. ej. después de un alta de unidades)
//   ?tipo=herramientas                 estantes | cajones | herramientas | credenciales
//   ?tipo=credenciales&sel=persona:<id>,externa:<id>   una selección a mano (desde Configuración)

type Busqueda = { [k: string]: string | string[] | undefined };

const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

function leerInicial(q: Busqueda): Inicial {
  const tipoQ = uno(q.tipo);
  const sel = (uno(q.sel) ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const tipo = esTipoEtiqueta(tipoQ) ? tipoQ : sel.some((s) => /^(persona|externa):/.test(s)) ? "credenciales" : "herramientas";
  const alcance = sel.length ? "elegir" : uno(q.solo) === "todas" ? "todas" : "nuevas";
  return { tipo, alcance, seleccion: sel };
}

export default function EtiquetasPage({ searchParams }: { searchParams: Promise<Busqueda> }) {
  const inicial = leerInicial(use(searchParams));
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Etiquetas QR</h2>
        <p className="text-[13px] text-muted-foreground">
          Cada etiqueta lleva un QR que abre la ficha con la cámara del celular, el código debajo y el nombre corto.
        </p>
      </div>
      {/* La key reinicia la pantalla si se llega con otra elección (p. ej. desde Configuración). */}
      <PantallaEtiquetas key={`${inicial.tipo}|${inicial.alcance}|${inicial.seleccion.join()}`} inicial={inicial} />
    </div>
  );
}
