"use client";

import { Archive, Loader2, MessageSquarePlus } from "lucide-react";
import { formatDistanceToNowStrict, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import type { ConversacionListada } from "@/lib/asistente/datos";

export function ListaConversaciones({
  conversaciones,
  actual,
  onElegir,
  onNueva,
  onArchivar,
  creando,
}: {
  conversaciones: ConversacionListada[];
  actual: string | null;
  onElegir: (id: string) => void;
  onNueva: () => void;
  onArchivar: (id: string) => void;
  creando: boolean;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="p-3">
        <Button className="w-full" onClick={onNueva} disabled={creando}>
          {creando ? <Loader2 className="animate-spin" /> : <MessageSquarePlus />} Nueva conversación
        </Button>
      </div>
      <ul className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
        {conversaciones.map((c) => (
          <li key={c.id} className="group relative">
            <button
              onClick={() => onElegir(c.id)}
              className={`w-full rounded-md px-2.5 py-2 text-left text-[13px] transition-colors ${c.id === actual ? "bg-muted" : "hover:bg-muted/60"}`}
            >
              <p className="truncate pr-6">{c.titulo ?? "Conversación nueva"}</p>
              <p className="truncate text-[11px] text-muted-foreground">
                {c.venta ? `${c.venta} · ` : ""}
                {c.ultimo_mensaje_at ? `hace ${formatDistanceToNowStrict(parseISO(c.ultimo_mensaje_at), { locale: es })}` : "sin mensajes"}
              </p>
            </button>
            <button
              onClick={() => onArchivar(c.id)}
              className="absolute top-2 right-2 hidden rounded p-1 text-muted-foreground hover:bg-background group-hover:block"
              aria-label="Archivar"
              title="Archivar"
            >
              <Archive className="size-3.5" />
            </button>
          </li>
        ))}
        {conversaciones.length === 0 && <li className="px-2.5 py-2 text-[12px] text-muted-foreground">Todavía no hay conversaciones.</li>}
      </ul>
    </div>
  );
}
