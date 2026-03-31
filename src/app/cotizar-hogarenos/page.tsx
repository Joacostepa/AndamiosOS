"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Send, Sparkles, Download, Phone } from "lucide-react";
import { cn } from "@/lib/utils";

const MAX_MESSAGES = 20;
const WHATSAPP = "11-2734-4214";

type Message = {
  role: "user" | "assistant";
  content: string;
};

export default function CotizarHogarenosPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [messageCount, setMessageCount] = useState(0);
  const [limited, setLimited] = useState(false);
  const [cotizacionId, setCotizacionId] = useState<string | null>(null);
  const [loadingPdf, setLoadingPdf] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  async function sendMessage() {
    const text = input.trim();
    if (!text || loading || limited) return;

    const userMsg: Message = { role: "user", content: text };
    const newMessages = [...messages, userMsg];
    const newCount = messageCount + 1;
    setMessages(newMessages);
    setInput("");
    setMessageCount(newCount);
    setLoading(true);

    try {
      const res = await fetch("/api/public/cotizar-hogarenos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages,
          messageCount: newCount,
        }),
      });

      const data = await res.json();

      if (data.limited) {
        setLimited(true);
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: data.message },
        ]);
        return;
      }

      if (data.error) throw new Error(data.error);

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.message },
      ]);

      if (data.cotizacion_id) {
        setCotizacionId(data.cotizacion_id);
      }
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Disculpá, hubo un error. Intentá de nuevo o contactanos por WhatsApp.",
        },
      ]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  async function handleDownloadPdf() {
    if (!cotizacionId) return;
    setLoadingPdf(true);
    try {
      const res = await fetch(
        `/api/public/cotizacion-pdf?id=${cotizacionId}`
      );
      const cotizacion = await res.json();
      if (cotizacion.error) throw new Error(cotizacion.error);

      const { pdf } = await import("@react-pdf/renderer");
      const { CotizacionPDF } = await import(
        "@/components/pdf/cotizacion-pdf"
      );
      const React = await import("react");

      const doc = React.createElement(CotizacionPDF, {
        cotizacion,
        items: cotizacion.cotizacion_items || [],
        clienteNombre: cotizacion.clientes?.razon_social,
      } as any);

      const blob = await pdf(doc as any).toBlob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${cotizacion.codigo || "cotizacion"}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("Error al generar el PDF. Contactanos por WhatsApp.");
    } finally {
      setLoadingPdf(false);
    }
  }

  return (
    <div className="flex min-h-svh flex-col bg-background">
      {/* Header */}
      <header className="border-b bg-card px-4 py-3">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground font-bold text-sm">
              A
            </span>
            <div>
              <span className="font-bold text-sm">
                Andamios<span className="text-primary">OS</span>
              </span>
              <p className="text-xs text-muted-foreground">
                Cotizador de alquileres
              </p>
            </div>
          </div>
          <a
            href={`https://wa.me/54${WHATSAPP.replace(/-/g, "")}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button variant="outline" size="sm" className="text-xs">
              <Phone className="mr-1 h-3 w-3" />
              WhatsApp
            </Button>
          </a>
        </div>
      </header>

      {/* Chat */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-6"
      >
        <div className="mx-auto max-w-2xl space-y-4">
          {messages.length === 0 && (
            <div className="text-center py-16 space-y-4">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
                <Sparkles className="h-8 w-8 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">Cotizá tu andamio</h1>
                <p className="text-muted-foreground mt-1">
                  Contame qué trabajo necesitás hacer y te armo el
                  presupuesto al instante.
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-2 pt-2">
                {[
                  "Necesito andamio para pintar un frente",
                  "Quiero alquilar para reparar un balcón",
                  "Preciso andamio con ruedas",
                ].map((suggestion) => (
                  <Button
                    key={suggestion}
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    onClick={() => {
                      setInput(suggestion);
                      inputRef.current?.focus();
                    }}
                  >
                    {suggestion}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div
              key={i}
              className={cn(
                "rounded-2xl px-4 py-3 text-sm max-w-[85%]",
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
              <Loader2 className="h-4 w-4 animate-spin" />
              Preparando respuesta...
            </div>
          )}

          {/* Botón descargar PDF */}
          {cotizacionId && (
            <div className="flex justify-center pt-4">
              <Button
                size="lg"
                onClick={handleDownloadPdf}
                disabled={loadingPdf}
                className="shadow-lg"
              >
                {loadingPdf ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Download className="mr-2 h-4 w-4" />
                )}
                Descargar cotización PDF
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Input */}
      <div className="border-t bg-card px-4 py-3">
        <div className="mx-auto max-w-2xl">
          {limited ? (
            <div className="text-center text-sm text-muted-foreground py-2">
              <p>
                Para seguir, contactanos por{" "}
                <a
                  href={`https://wa.me/54${WHATSAPP.replace(/-/g, "")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary font-medium underline"
                >
                  WhatsApp al {WHATSAPP}
                </a>
              </p>
            </div>
          ) : (
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
                placeholder="Contame qué trabajo necesitás hacer..."
                disabled={loading}
                className="rounded-full"
              />
              <Button
                type="submit"
                size="icon"
                className="rounded-full shrink-0"
                disabled={!input.trim() || loading}
              >
                <Send className="h-4 w-4" />
              </Button>
            </form>
          )}
          <p className="text-center text-[10px] text-muted-foreground mt-2">
            Andamios Buenos Aires — Todos los precios + IVA
          </p>
        </div>
      </div>
    </div>
  );
}
