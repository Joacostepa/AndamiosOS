"use client";

// Lo de la Hoja del día en Legajos: "Puede estar a cargo" (la sugerencia de a cargo y el
// orden de "Sin asignar") y el Telegram (vinculado o no, con "Copiar link para vincular").
// Sólo para quien edita la Hoja del día: las rutas lo piden.

import { useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { toast } from "sonner";
import type { Personal } from "@/hooks/use-personal";
import { usePuedeEditar } from "@/components/providers/acceso-provider";
import { useVincularTelegram } from "@/hooks/use-hoja-dia";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { BotonVincularTelegram } from "@/components/hoja-dia/comunes/vincular-telegram";

async function marcarACargo(personaId: string, valor: boolean) {
  const r = await fetch("/api/hoja-dia/personas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accion: "puede_estar_a_cargo", personaId, valor }) });
  if (!r.ok) throw new Error(((await r.json().catch(() => null)) as { error?: string } | null)?.error ?? `Error ${r.status}`);
}

export function SwitchACargo({ persona }: { persona: Personal }) {
  const qc = useQueryClient();
  const puede = usePuedeEditar("hoja-dia");
  const valor = !!persona.puede_estar_a_cargo;
  return (
    <Switch
      checked={valor}
      disabled={!puede}
      aria-label={`${persona.apellido} puede estar a cargo`}
      onCheckedChange={async (v) => {
        try {
          await marcarACargo(persona.id, v);
          toast(v ? `${persona.apellido} puede estar a cargo` : `${persona.apellido} ya no aparece como «puede estar a cargo»`);
          void qc.invalidateQueries({ queryKey: ["personal"] });
          void qc.invalidateQueries({ queryKey: ["hoja-dia"] });
        } catch (e) {
          toast.error(e instanceof Error ? e.message : String(e));
        }
      }}
    />
  );
}

export function EstadoTelegram({ persona, conDesvincular = false }: { persona: Personal; conDesvincular?: boolean }) {
  const puede = usePuedeEditar("hoja-dia");
  const qc = useQueryClient();
  const desvincular = useVincularTelegram();
  if (persona.telegram_chat_id != null) {
    return (
      <span className="inline-flex flex-wrap items-center gap-2 text-sm">
        <span className="inline-flex items-center gap-1 text-hd-verde">
          <Check className="size-3.5" /> Vinculado{persona.telegram_usuario ? ` (@${persona.telegram_usuario})` : ""}
        </span>
        {conDesvincular && puede && (
          <Button
            size="xs"
            variant="ghost"
            className="text-muted-foreground"
            onClick={() =>
              desvincular.mutate(
                { accion: "desvincular", personaId: persona.id },
                { onSuccess: (r) => { toast(r.texto); void qc.invalidateQueries({ queryKey: ["personal"] }); } },
              )
            }
          >
            Desvincular
          </Button>
        )}
      </span>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
      No vinculado
      {puede && <BotonVincularTelegram personaId={persona.id} nombre={persona.apellido} size="xs" />}
    </span>
  );
}
