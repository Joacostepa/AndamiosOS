"use client";

import { useState, useRef, useEffect } from "react";
import { Loader2, Send, Download, Phone, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const MAX_MESSAGES = 20;
const WHATSAPP = "11-2734-4214";
const LOGO_URL =
  "https://andamiosbuenosaires.com.ar/wp-content/uploads/2026/02/cropped-1.png";

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
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "Disculpá, hubo un error. Intentá de nuevo o contactanos por WhatsApp.",
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
        empresa: cotizacion.empresa,
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
    <div className="flex min-h-svh flex-col bg-white text-gray-900">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white px-4 py-3 shadow-sm">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src={LOGO_URL}
              alt="Andamios Buenos Aires"
              className="h-10 w-auto"
            />
            <div className="hidden sm:block">
              <span className="font-semibold text-gray-900 text-sm">
                Andamios Buenos Aires
              </span>
              <p className="text-xs text-gray-500">Cotizador online</p>
            </div>
          </div>
          <a
            href={`https://wa.me/54${WHATSAPP.replace(/-/g, "")}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-xl bg-green-500 px-4 py-2 text-xs font-medium text-white shadow-sm hover:bg-green-600 transition-colors"
          >
            <Phone className="h-3.5 w-3.5" />
            WhatsApp
          </a>
        </div>
      </header>

      {/* Chat */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6 bg-gray-50">
        <div className="mx-auto max-w-2xl space-y-4">
          {messages.length === 0 && (
            <div className="text-center py-16 space-y-5">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-red-50">
                <MessageCircle className="h-8 w-8 text-[#ee3c23]" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  Cotizá tu andamio
                </h1>
                <p className="text-gray-500 mt-2 max-w-md mx-auto">
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
                  <button
                    key={suggestion}
                    className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-xs text-gray-700 shadow-sm hover:border-[#ee3c23] hover:text-[#ee3c23] transition-colors"
                    onClick={() => {
                      setInput(suggestion);
                      inputRef.current?.focus();
                    }}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div
              key={i}
              className={cn(
                "rounded-2xl px-4 py-3 text-sm max-w-[85%] shadow-sm",
                msg.role === "user"
                  ? "ml-auto bg-[#ee3c23] text-white"
                  : "bg-white text-gray-800 border border-gray-200"
              )}
            >
              <p className="whitespace-pre-wrap">{msg.content}</p>
            </div>
          ))}

          {loading && (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin text-[#ee3c23]" />
              Preparando respuesta...
            </div>
          )}

          {/* Botón descargar PDF */}
          {cotizacionId && (
            <div className="flex justify-center pt-4">
              <button
                onClick={handleDownloadPdf}
                disabled={loadingPdf}
                className="inline-flex items-center gap-2 rounded-xl bg-[#ee3c23] px-6 py-3 text-sm font-medium text-white shadow-lg hover:bg-[#c62f1b] transition-colors disabled:opacity-50"
              >
                {loadingPdf ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                Descargar cotización PDF
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Input */}
      <div className="border-t border-gray-200 bg-white px-4 py-3">
        <div className="mx-auto max-w-2xl">
          {limited ? (
            <div className="text-center text-sm text-gray-500 py-2">
              <p>
                Para seguir, contactanos por{" "}
                <a
                  href={`https://wa.me/54${WHATSAPP.replace(/-/g, "")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#ee3c23] font-medium underline"
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
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Contame qué trabajo necesitás hacer..."
                disabled={loading}
                className="flex-1 rounded-full border border-gray-300 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#ee3c23] focus:outline-none focus:ring-1 focus:ring-[#ee3c23]"
              />
              <button
                type="submit"
                disabled={!input.trim() || loading}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#ee3c23] text-white shadow-sm hover:bg-[#c62f1b] transition-colors disabled:opacity-40"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
          )}
          <p className="text-center text-[10px] text-gray-400 mt-2">
            Andamios Buenos Aires — Todos los precios + IVA
          </p>
        </div>
      </div>
    </div>
  );
}
