"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Siren } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import type { Urgencia } from "@/lib/tablero/tipos-orden";

// Marcar la OT como urgente desde la app.
//
// POR QUÉ EXISTE. La urgencia (`x_urgencia`) ya estaba: el tablero le pinta el borde
// rojo a la tarjeta y le arma un grupo propio en la bandeja de sin asignar. Pero para
// cargarla había que entrar a Odoo, así que no la cargó nadie — medido el 2026-09-01
// sobre las 64 OTs activas: 60 en baja, 4 en media, NINGUNA en alta. Toda esa maquinaria
// estaba esperando un dato que no se podía escribir desde donde se trabaja.
//
// EL MOTIVO ES OBLIGATORIO. Una OT que salta al tope de la bandeja sin decir por qué
// obliga a preguntarle a quien la marcó, y ese es exactamente el WhatsApp que el tablero
// existe para no necesitar. El motivo viaja en la notificación y se ve en la tarjeta.

export function MarcarUrgencia({
  otId,
  urgencia,
  motivo,
}: {
  otId: number;
  urgencia: Urgencia;
  motivo: string | null;
}) {
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState(motivo ?? "");
  const queryClient = useQueryClient();

  const guardar = useMutation({
    mutationFn: async (v: { urgencia: Urgencia; motivo: string | null }) => {
      const res = await fetch(`/api/ordenes-trabajo/${otId}/urgencia`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(v),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `Error ${res.status}`);
      }
      return res.json();
    },
    onSuccess: (_d, v) => {
      // El listado y el tablero leen la misma urgencia: si no se invalidan, la tarjeta
      // sigue sin el borde rojo hasta el próximo refetch y parece que no pasó nada.
      queryClient.invalidateQueries({ queryKey: ["orden-odoo", otId] });
      queryClient.invalidateQueries({ queryKey: ["ordenes-odoo"] });
      queryClient.invalidateQueries({ queryKey: ["tablero"] });
      queryClient.invalidateQueries({ queryKey: ["alertas"] });
      setAbierto(false);
      toast.success(
        v.urgencia === "alta"
          ? "Marcada urgente · operaciones ya tiene el aviso"
          : "Ya no está marcada como urgente",
      );
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "No se pudo guardar"),
  });

  if (urgencia === "alta") {
    return (
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <span
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
            style={{ backgroundColor: "#FEE4E2", color: "#912018" }}
          >
            <Siren className="h-3 w-3" />
            Urgente
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[11px]"
            disabled={guardar.isPending}
            onClick={() => guardar.mutate({ urgencia: "baja", motivo: null })}
          >
            {guardar.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
            Quitar
          </Button>
        </div>
        {motivo && <p className="text-[12px] text-muted-foreground">{motivo}</p>}
      </div>
    );
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setAbierto(true)}>
        <Siren className="mr-1.5 h-3.5 w-3.5" />
        Marcar urgente
      </Button>

      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Siren className="h-4 w-4" style={{ color: "#912018" }} />
              Marcar la OT como urgente
            </DialogTitle>
            <DialogDescription>
              Va al tope de la bandeja de sin asignar con el borde rojo, y operaciones
              recibe la notificación en el momento.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <p className="text-[12px] text-muted-foreground">
              Escribí por qué. El motivo se ve en la tarjeta del tablero y viaja en el
              aviso, así que nadie tiene que preguntar.
            </p>
            <Textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Ej: se lo prometimos al cliente para el jueves y todavía no tiene fecha"
              className="min-h-20 text-[13px]"
              autoFocus
            />
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setAbierto(false)}>
              Cancelar
            </Button>
            <Button
              disabled={guardar.isPending}
              onClick={() => {
                if (!texto.trim()) {
                  toast.error("Escribí el motivo para poder marcarla");
                  return;
                }
                guardar.mutate({ urgencia: "alta", motivo: texto.trim() });
              }}
            >
              {guardar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Marcar urgente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
