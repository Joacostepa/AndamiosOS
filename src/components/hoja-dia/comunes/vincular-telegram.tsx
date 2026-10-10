"use client";

// "Copiar link para vincular": genera el link de una vez (t.me/<bot>?start=<código>), lo
// copia y ofrece mandarlo por WhatsApp. Se usa en la lista de envío y en Legajos.

import { Link2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useVincularTelegram } from "@/hooks/use-hoja-dia";

export async function copiar(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    return false;
  }
}

export function BotonVincularTelegram({
  personaId,
  nombre,
  size = "sm",
  variant = "ghost",
  className,
}: {
  personaId: string;
  nombre: string;
  size?: "sm" | "xs" | "default";
  variant?: "ghost" | "outline";
  className?: string;
}) {
  const vincular = useVincularTelegram();
  return (
    <Button
      size={size}
      variant={variant}
      className={className}
      disabled={vincular.isPending}
      onClick={() =>
        vincular.mutate(
          { accion: "vincular", personaId },
          {
            onSuccess: async (r) => {
              const ok = r.link ? await copiar(r.link) : false;
              const wa = r.waLink;
              toast(ok ? `Link para vincular a ${nombre} copiado. Mandáselo una vez: al tocarlo queda vinculado.` : `Link para vincular a ${nombre}: ${r.link ?? ""}`, {
                duration: 12_000,
                action: wa ? { label: "Abrir WhatsApp", onClick: () => window.open(wa, "_blank", "noopener") } : undefined,
              });
            },
          },
        )
      }
    >
      <Link2 data-icon="inline-start" />
      Copiar link para vincular
    </Button>
  );
}
