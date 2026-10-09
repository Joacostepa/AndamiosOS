"use client";

import { ChevronRight, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useGuardarSupervision } from "@/hooks/use-permisos-via-publica";
import type { Supervision } from "@/lib/permisos-via-publica/supervision";

// Modo supervisado (JS, 2026-09-15): durante las primeras semanas con clientes reales cada paso
// que sale hacia afuera espera a una persona. Prendido = el paso se hace solo.

const PASOS: { clave: keyof Supervision; titulo: string; manual: string; automatico: string }[] = [
  {
    clave: "linkAlCliente",
    titulo: "Link al cliente",
    manual: "«Iniciar trámite» le manda el link al vendedor de la orden, que se lo pasa al cliente.",
    automatico: "«Iniciar trámite» le manda el link directo al cliente.",
  },
  {
    clave: "endosoAutomatico",
    titulo: "Pedido de endoso a Segucom",
    manual: "Cuando el cliente carga el dueño del lote se avisa, y el pedido sale con «Pedir endoso» en la ficha.",
    automatico: "El pedido sale solo apenas el cliente carga el dueño del lote.",
  },
  {
    clave: "encomiendaAutomatica",
    titulo: "Encomienda del CPAU",
    manual: "Con el legajo completo se avisa, y la encomienda se arma con el botón de la ficha.",
    automatico: "El robot arma la encomienda solo apenas el legajo está completo (Finalizar sigue siendo manual).",
  },
  {
    clave: "presentacionAutomatica",
    titulo: "Presentación en TAD",
    manual: "Con todos los documentos se avisa, y se presenta con «Presentar ahora» en la ficha.",
    automatico: "El robot presenta solo apenas el trámite está listo.",
  },
];

export function ModoSupervisado({ supervision, className }: { supervision: Supervision; className?: string }) {
  const guardar = useGuardarSupervision();
  const manuales = PASOS.filter((p) => !supervision[p.clave]).length;

  return (
    <details className={cn("group rounded-md border bg-card", className)}>
      <summary className="flex h-9 cursor-pointer list-none items-center gap-2 rounded-md px-3 text-[13px] hover:bg-muted/40 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
        <ShieldCheck aria-hidden className="size-4 text-muted-foreground" />
        <span className="font-semibold">Modo supervisado</span>
        <span className="text-muted-foreground">
          · {manuales === 0 ? "todo automático" : `${manuales} de ${PASOS.length} pasos manuales`}
        </span>
        <ChevronRight aria-hidden className="ml-auto size-4 text-muted-foreground transition-transform group-open:rotate-90" />
      </summary>
      <ul className="border-t">
        {PASOS.map((p) => (
          <li key={p.clave} className="flex items-start gap-3 border-b px-3 py-2 text-[13px] last:border-b-0">
            <Switch
              aria-label={`${p.titulo}: ${supervision[p.clave] ? "automático" : "manual"}`}
              checked={supervision[p.clave]}
              disabled={guardar.isPending}
              onCheckedChange={(valor) =>
                guardar.mutate({ [p.clave]: valor }, {
                  onSuccess: () => toast.success(`${p.titulo}: ${valor ? "automático" : "manual"}`),
                  onError: (e) => toast.error(e instanceof Error ? e.message : "No se pudo guardar"),
                })
              }
              className="mt-0.5"
            />
            <div>
              <p className="font-medium">
                {p.titulo} <span className="font-normal text-muted-foreground">· {supervision[p.clave] ? "automático" : "manual"}</span>
              </p>
              <p className="text-[12px] text-muted-foreground">{supervision[p.clave] ? p.automatico : p.manual}</p>
            </div>
          </li>
        ))}
      </ul>
      <p className="border-t px-3 py-2 text-[12px] text-muted-foreground">
        Todos los mails van con copia al vendedor de la orden y a quien inició el trámite, y las respuestas le llegan al vendedor.
      </p>
    </details>
  );
}
