"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Send, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  UnidadCotizacion,
  SubVertical,
  CotizacionFormData,
} from "@/types/cotizacion-form";

type Message = {
  role: "user" | "assistant";
  content: string;
};

type FieldUpdates = Partial<CotizacionFormData>;

function parseFieldUpdates(text: string): {
  message: string;
  updates: FieldUpdates | null;
} {
  const separator = "---FIELD_UPDATES---";
  const idx = text.indexOf(separator);
  if (idx === -1) return { message: text, updates: null };

  const message = text.slice(0, idx).trim();
  const jsonStr = text.slice(idx + separator.length).trim();

  try {
    const parsed = JSON.parse(jsonStr);
    return { message, updates: parsed.field_updates || parsed };
  } catch {
    return { message: text, updates: null };
  }
}

export function AIChatPanel({
  unidad,
  subVertical,
  formValues,
  onFieldUpdates,
  onCreateCliente,
}: {
  unidad: UnidadCotizacion;
  subVertical?: SubVertical;
  formValues: Partial<CotizacionFormData>;
  onFieldUpdates: (updates: FieldUpdates) => void;
  onCreateCliente?: (nombre: string, telefono: string) => Promise<void>;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [lastUpdateCount, setLastUpdateCount] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: Message = { role: "user", content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);
    setLastUpdateCount(0);

    try {
      const res = await fetch("/api/ai/cotizacion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages,
          unidad_cotizacion: unidad,
          sub_vertical: subVertical,
          formValues: {
            titulo: formValues.titulo,
            cliente_id: formValues.cliente_id,
            descripcion_servicio: formValues.descripcion_servicio,
            items: formValues.items,
            fraccion_dias: formValues.fraccion_dias,
            tonelaje_estimado: formValues.tonelaje_estimado,
            sub_vertical: formValues.sub_vertical,
            ubicacion: formValues.ubicacion,
            zona_entrega: formValues.zona_entrega,
          },
        }),
      });

      const data = await res.json();
      if (data.error) throw new Error(data.error);

      const { message, updates } = parseFieldUpdates(data.message);

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: message },
      ]);

      if (updates) {
        // Handle nuevo_cliente separately
        const { nuevo_cliente, ...fieldUpdates } = updates as any;
        if (nuevo_cliente && onCreateCliente) {
          await onCreateCliente(
            nuevo_cliente.nombre || "",
            nuevo_cliente.telefono || ""
          );
        }
        onFieldUpdates(fieldUpdates);
        const count = Object.keys(fieldUpdates).length + (nuevo_cliente ? 1 : 0);
        setLastUpdateCount(count);
      }
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Error: ${err.message || "No se pudo procesar"}`,
        },
      ]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }, [
    input,
    loading,
    messages,
    unidad,
    subVertical,
    formValues,
    onFieldUpdates,
  ]);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <Sparkles className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Asistente IA</h3>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-center text-sm text-muted-foreground py-8 space-y-2">
            <Sparkles className="h-8 w-8 mx-auto text-primary/40" />
            <p>Contame qué necesita el cliente y te ayudo a armar la cotización.</p>
            <p className="text-xs">
              Voy a ir completando el formulario a medida que hablemos.
            </p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={cn(
              "rounded-lg px-3 py-2 text-sm max-w-[90%]",
              msg.role === "user"
                ? "ml-auto bg-primary text-primary-foreground"
                : "bg-muted"
            )}
          >
            <p className="whitespace-pre-wrap">{msg.content}</p>
          </div>
        ))}

        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Pensando...
          </div>
        )}

        {lastUpdateCount > 0 && !loading && (
          <div className="text-xs text-primary flex items-center gap-1">
            <Sparkles className="h-3 w-3" />
            Se actualizaron {lastUpdateCount} campo
            {lastUpdateCount > 1 ? "s" : ""} del formulario
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t p-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendMessage();
          }}
          className="flex gap-2"
        >
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Describí el trabajo..."
            disabled={loading}
            className="text-sm"
          />
          <Button
            type="submit"
            size="icon"
            disabled={!input.trim() || loading}
          >
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}
