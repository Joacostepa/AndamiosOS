"use client";

import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { useGuardarSupervision } from "@/hooks/use-permisos-via-publica";
import type { Supervision } from "@/lib/permisos-via-publica/supervision";

// "Qué sale solo" (antes "Modo supervisado", JS 2026-09-15): cada paso que sale hacia afuera sale
// solo o espera un botón. Es un ajuste, no trabajo del día: vive en la configuración de la lista.

const PASOS: { clave: keyof Supervision; titulo: string; conBoton: string; solo: string }[] = [
  {
    clave: "linkAlCliente",
    titulo: "Link al cliente",
    conBoton: "El link le llega a la vendedora, que se lo pasa al cliente.",
    solo: "«Iniciar trámite» le manda el link directo al cliente.",
  },
  {
    clave: "endosoAutomatico",
    titulo: "Endoso a Segucom",
    conBoton: "Se pide con el botón de la ficha cuando el cliente carga el dueño del lote.",
    solo: "Sale apenas el cliente carga el dueño del lote. Si el nombre viene raro, espera a una persona.",
  },
  {
    clave: "encomiendaAutomatica",
    titulo: "Encomienda del CPAU",
    conBoton: "Se arma con el botón de la ficha; después el robot hace todo, también el pago.",
    solo: "El robot la arma, la paga y la envía apenas están los papeles completos.",
  },
  {
    clave: "presentacionAutomatica",
    titulo: "Presentación en TAD",
    conBoton: "Se presenta con el botón de la ficha.",
    solo: "El robot presenta solo cuando está todo, de 19 a 7.",
  },
];

export function QueSaleSolo({ supervision, puedeEditar }: { supervision: Supervision; puedeEditar: boolean }) {
  const guardar = useGuardarSupervision();
  return (
    <ul className="divide-y rounded-md border">
      {PASOS.map((p) => (
        <li key={p.clave} className="flex items-start gap-3 px-3 py-2.5 text-[13px]">
          <Switch
            aria-label={`${p.titulo}: ${supervision[p.clave] ? "sale solo" : "con botón"}`}
            checked={supervision[p.clave]}
            disabled={guardar.isPending || !puedeEditar}
            onCheckedChange={(valor) =>
              guardar.mutate({ [p.clave]: valor }, {
                onSuccess: () => toast.success(`${p.titulo}: ${valor ? "sale solo" : "con botón"}`),
                onError: (e) => toast.error(e instanceof Error ? e.message : "No se pudo guardar"),
              })
            }
            className="mt-0.5"
          />
          <div>
            <p className="font-medium">
              {p.titulo} <span className="font-normal text-muted-foreground">· {supervision[p.clave] ? "sale solo" : "con botón"}</span>
            </p>
            <p className="text-[12px] text-muted-foreground">{supervision[p.clave] ? p.solo : p.conBoton}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

export const cuantosConBoton = (s: Supervision) => PASOS.filter((p) => !s[p.clave]).length;
