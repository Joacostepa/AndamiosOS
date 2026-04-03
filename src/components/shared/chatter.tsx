"use client";

import { useState } from "react";
import { useChatterFeed, useCreateNota } from "@/hooks/use-chatter";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { formatRelativeDate } from "@/lib/utils/formatters";
import { Send, Loader2, MessageSquare, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface ChatterProps {
  entidadTipo: string;
  entidadId: string;
}

const ACTION_ICONS: Record<string, React.ReactNode> = {
  nota: <MessageSquare className="h-3.5 w-3.5" />,
  cambio: <Pencil className="h-3.5 w-3.5" />,
};

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function Chatter({ entidadTipo, entidadId }: ChatterProps) {
  const { data: feed, isLoading } = useChatterFeed(entidadTipo, entidadId);
  const createNota = useCreateNota();
  const [texto, setTexto] = useState("");

  function handleSubmit() {
    if (!texto.trim()) return;
    createNota.mutate(
      { entidad_tipo: entidadTipo, entidad_id: entidadId, contenido: texto.trim() },
      {
        onSuccess: () => { setTexto(""); toast.success("Nota agregada"); },
        onError: () => toast.error("Error al agregar nota"),
      }
    );
  }

  return (
    <div className="space-y-4">
      {/* Input nueva nota */}
      <div className="space-y-2">
        <Textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Agregar una nota..."
          rows={2}
          className="text-sm"
        />
        <div className="flex justify-end">
          <Button
            size="sm"
            disabled={!texto.trim() || createNota.isPending}
            onClick={handleSubmit}
          >
            {createNota.isPending ? (
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            ) : (
              <Send className="mr-1 h-3 w-3" />
            )}
            Enviar
          </Button>
        </div>
      </div>

      {/* Feed */}
      {isLoading ? (
        <div className="text-sm text-muted-foreground text-center py-4">Cargando historial...</div>
      ) : feed && feed.length > 0 ? (
        <div className="space-y-3">
          {feed.map((entry) => (
            <div key={entry.id} className="flex gap-3">
              <Avatar className="h-7 w-7 shrink-0 mt-0.5">
                <AvatarFallback className={`text-[10px] ${entry.tipo === "nota" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                  {getInitials(entry.autor)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium">{entry.autor}</span>
                  <span className="text-[10px] text-muted-foreground">{formatRelativeDate(entry.fecha)}</span>
                </div>
                {entry.tipo === "nota" ? (
                  <p className="text-sm text-foreground mt-0.5 whitespace-pre-wrap">{entry.contenido}</p>
                ) : (
                  <div className="mt-0.5">
                    {entry.detalles ? (
                      entry.detalles.map((d, i) => (
                        <div key={i} className="text-xs text-muted-foreground">
                          <span className="font-medium text-foreground">{d.campo}</span>
                          {": "}
                          <span className="line-through text-red-400/70">{d.antes}</span>
                          {" → "}
                          <span className="text-green-400/90">{d.despues}</span>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-muted-foreground">{entry.contenido}</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-6 text-muted-foreground">
          <MessageSquare className="h-6 w-6 mx-auto mb-2 opacity-40" />
          <p className="text-xs">Sin actividad registrada</p>
        </div>
      )}
    </div>
  );
}
