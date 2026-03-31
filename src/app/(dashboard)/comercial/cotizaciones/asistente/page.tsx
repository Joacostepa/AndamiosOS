"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useCotizaciones, useCreateCotizacion } from "@/hooks/use-cotizaciones";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sparkles, Send, Loader2, FileText, User } from "lucide-react";
import { toast } from "sonner";

type Message = {
  role: "user" | "assistant";
  content: string;
};

export default function AsistenteCotizacionPage() {
  const router = useRouter();
  const { data: cotizacionesAnteriores } = useCotizaciones();
  const createCotizacion = useCreateCotizacion();

  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "Hola! Soy el asistente de cotizaciones de Andamios Buenos Aires. Contame, que necesita el cliente? Tipo de obra, ubicacion, medidas... todo lo que sepas.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [pendingCotizacion, setPendingCotizacion] = useState<any>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  async function handleSend() {
    if (!input.trim() || loading) return;

    const userMsg: Message = { role: "user", content: input.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/ai/cotizacion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages.map((m) => ({ role: m.role, content: m.content })),
          cotizacionesAnteriores: cotizacionesAnteriores?.slice(0, 5).map((c) => ({
            codigo: c.codigo, titulo: c.titulo, total: c.total, estado: c.estado,
          })),
        }),
      });

      const data = await res.json();

      if (data.error) {
        toast.error(data.error);
        setLoading(false);
        return;
      }

      const aiText = data.message;

      // Check if AI returned a cotizacion JSON
      const jsonMatch = aiText.match(/\{[\s\S]*"ready"\s*:\s*true[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          setPendingCotizacion(parsed.cotizacion);
          const cleanText = aiText.replace(jsonMatch[0], "").trim();
          setMessages([...newMessages, {
            role: "assistant",
            content: cleanText || "Listo! Arme la cotizacion basandome en lo que me contaste. Revisa los datos y si esta todo bien, confirma para crearla.",
          }]);
        } catch {
          setMessages([...newMessages, { role: "assistant", content: aiText }]);
        }
      } else {
        setMessages([...newMessages, { role: "assistant", content: aiText }]);
      }
    } catch (error) {
      toast.error("Error de conexion");
    } finally {
      setLoading(false);
    }
  }

  function handleCreateCotizacion() {
    if (!pendingCotizacion) return;

    createCotizacion.mutate(
      {
        titulo: pendingCotizacion.titulo,
        descripcion_servicio: pendingCotizacion.descripcion_servicio,
        condiciones: pendingCotizacion.condiciones,
        condicion_pago: pendingCotizacion.condicion_pago,
        plazo_alquiler_meses: pendingCotizacion.plazo_alquiler_meses,
        items: pendingCotizacion.items || [],
      },
      {
        onSuccess: (cot) => {
          toast.success(`Cotizacion ${cot.codigo} creada!`);
          router.push(`/comercial/cotizaciones/${cot.id}`);
        },
        onError: () => toast.error("Error al crear cotizacion"),
      }
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      <PageHeader title="Asistente de Cotizacion" description="Crea cotizaciones conversando con IA" />

      {/* Chat area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-4 py-4">
        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            {msg.role === "assistant" && (
              <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                <Sparkles className="h-4 w-4 text-primary" />
              </div>
            )}
            <div className={`max-w-[75%] rounded-lg px-4 py-3 text-sm ${
              msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"
            }`}>
              <p className="whitespace-pre-wrap">{msg.content}</p>
            </div>
            {msg.role === "user" && (
              <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                <User className="h-4 w-4" />
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div className="flex gap-3">
            <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
              <Sparkles className="h-4 w-4 text-primary" />
            </div>
            <div className="bg-muted rounded-lg px-4 py-3">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          </div>
        )}
      </div>

      {/* Pending cotizacion preview */}
      {pendingCotizacion && (
        <Card className="border-primary/30 bg-primary/5 mb-4">
          <CardContent className="py-4 space-y-3">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              <span className="font-medium text-sm">Cotizacion lista para crear</span>
            </div>
            <div className="text-sm space-y-1">
              <p><strong>{pendingCotizacion.titulo}</strong></p>
              <p className="text-muted-foreground">{pendingCotizacion.items?.length || 0} items</p>
              {pendingCotizacion.items && (
                <p className="font-semibold text-primary">
                  Total estimado: ${pendingCotizacion.items.reduce((s: number, i: any) => s + (i.cantidad * i.precio_unitario), 0).toLocaleString()} + IVA
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleCreateCotizacion} disabled={createCotizacion.isPending}>
                {createCotizacion.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
                Crear cotizacion
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setPendingCotizacion(null)}>Descartar</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Input */}
      <div className="flex gap-2 pt-2 border-t">
        <Input
          placeholder="Escribi aca... (ej: necesito andamio para fachada de 8 pisos en Belgrano)"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
          disabled={loading}
          className="flex-1"
        />
        <Button onClick={handleSend} disabled={loading || !input.trim()}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}
