"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { cuandoFue, horaCorta } from "@/lib/permisos-via-publica/estado";
import type { Evento, TipoEvento } from "@/lib/permisos-via-publica/tipos";
import { Seccion } from "../ui";

// El historial del permiso (rediseño 09/10): trámite y expediente juntos, por día, con quién lo
// hizo, filtros y las últimas 12 líneas a la vista. Antes el del trámite eran fecha y texto en una
// caja con scroll, y el del expediente vivía en otra página.

const ETIQUETA: Partial<Record<TipoEvento, string>> = {
  alta: "Apareció en TAD",
  cambio_estado: "Cambió el estado en TAD",
  tarea_subsanacion: "El Gobierno pidió corregir",
  tarea_resuelta: "Se corrigió",
  motivo: "Lo que pidió el Gobierno",
  permiso_descargado: "Permiso",
  vinculado_odoo: "El robot propuso una venta",
  error_robot: "El robot se frenó",
  caratula_leida: "Datos de la carátula",
  vinculo_confirmado: "Venta confirmada",
  vinculo_descartado: "Venta descartada",
  odoo_escrito: "Odoo actualizado",
  odoo_conflicto: "No se pudo actualizar Odoo",
  tramite_abierto: "Se inició el trámite",
  documento_pedido: "Pedido",
  documento_subido: "Subió un papel",
  documento_revisado: "Revisión",
  aviso_productor: "Mail a Segucom",
  link_cliente: "Cliente",
  titular_cargado: "Dueño del lote",
  encomienda_cpau: "Encomienda del CPAU",
  presentacion_tad: "Presentación en TAD",
};

const ACTOR: Record<Evento["actor"], string> = {
  robot: "Robot", ia: "Revisión automática", sistema: "App", productor: "Segucom", persona: "Oficina", gcba: "Gobierno", cliente: "Cliente",
};

type Filtro = "todo" | "personas" | "cliente" | "robot" | "gobierno";
const FILTROS: { clave: Filtro; texto: string; pasa: (e: Evento) => boolean }[] = [
  { clave: "todo", texto: "Todo", pasa: () => true },
  { clave: "personas", texto: "Oficina", pasa: (e) => e.actor === "persona" },
  { clave: "cliente", texto: "Cliente", pasa: (e) => e.actor === "cliente" || e.tipo === "link_cliente" },
  { clave: "robot", texto: "Robot", pasa: (e) => e.actor === "robot" || e.actor === "ia" },
  { clave: "gobierno", texto: "Gobierno", pasa: (e) => e.actor === "gcba" || ["tarea_subsanacion", "tarea_resuelta", "motivo", "cambio_estado"].includes(e.tipo) },
];

export function Historial({ eventos, ahora }: { eventos: Evento[]; ahora: number }) {
  const [filtro, setFiltro] = useState<Filtro>("todo");
  const [todo, setTodo] = useState(false);
  const lista = eventos.filter(FILTROS.find((f) => f.clave === filtro)!.pasa);
  const visibles = todo ? lista : lista.slice(0, 12);
  const dias: { dia: string; eventos: Evento[] }[] = [];
  for (const e of visibles) {
    const d = cuandoFue(e.created_at.slice(0, 10), ahora);
    const ultimo = dias.at(-1);
    if (ultimo?.dia === d) ultimo.eventos.push(e);
    else dias.push({ dia: d, eventos: [e] });
  }
  return (
    <Seccion
      id="historial"
      titulo={`Historial · ${eventos.length}`}
      accion={
        <div role="group" aria-label="Filtrar el historial" className="flex flex-wrap gap-1">
          {FILTROS.map((f) => (
            <button
              key={f.clave}
              type="button"
              aria-pressed={filtro === f.clave}
              onClick={() => setFiltro(f.clave)}
              className={cn("h-7 rounded-full border px-2.5 text-[12px] focus-visible:outline-2 focus-visible:outline-ring max-sm:h-9", filtro === f.clave ? "border-foreground bg-foreground text-background" : "hover:bg-muted")}
            >
              {f.texto}
            </button>
          ))}
        </div>
      }
    >
      {lista.length === 0 ? (
        <p className="px-3 py-3 text-[13px] text-muted-foreground">Todavía no hay movimientos.</p>
      ) : (
        <div className="divide-y">
          {dias.map((d) => (
            <div key={d.dia} className="px-3 py-2">
              <p className="pb-1 text-[12px] font-semibold text-muted-foreground">{d.dia}</p>
              <ul className="space-y-1.5">
                {d.eventos.map((e) => (
                  <li key={`${e.id}`} className="grid gap-x-3 gap-y-0.5 text-[13px] sm:grid-cols-[9.5rem_minmax(0,1fr)]">
                    <span className="text-[12px] text-muted-foreground">{ACTOR[e.actor] ?? e.actor} · {horaCorta(e.created_at)}</span>
                    <span className="break-words">
                      <span className="font-medium">{ETIQUETA[e.tipo] ?? e.tipo}</span>
                      {e.detalle ? <span className="text-foreground/80">: {e.detalle.replace(/\s+/g, " ").slice(0, 400)}</span> : null}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {lista.length > 12 && (
            <div className="px-3 py-2">
              <button type="button" className="text-[13px] font-medium underline underline-offset-2" onClick={() => setTodo((x) => !x)}>
                {todo ? "Ver menos" : `Ver todo (${lista.length})`}
              </button>
            </div>
          )}
        </div>
      )}
    </Seccion>
  );
}
