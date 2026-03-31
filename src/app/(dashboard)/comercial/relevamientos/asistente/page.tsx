"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useCreateRelevamiento } from "@/hooks/use-relevamientos";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Sparkles, Send, Loader2, MapPin, User, CheckCircle } from "lucide-react";
import { toast } from "sonner";

type Message = { role: "user" | "assistant"; content: string };

export default function AsistenteRelevamientoPage() {
  const router = useRouter();
  const createRelevamiento = useCreateRelevamiento();

  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "Hola! Arrancamos con el relevamiento. Decime, donde estas? (direccion completa)",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [pendingRelevamiento, setPendingRelevamiento] = useState<any>(null);
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
      const res = await fetch("/api/ai/relevamiento", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages.map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      const data = await res.json();
      if (data.error) { toast.error(data.error); setLoading(false); return; }

      const aiText = data.message;
      const jsonMatch = aiText.match(/\{[\s\S]*"ready"\s*:\s*true[\s\S]*\}/);

      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          setPendingRelevamiento(parsed.relevamiento);
          const cleanText = aiText.replace(jsonMatch[0], "").trim();
          setMessages([...newMessages, {
            role: "assistant",
            content: cleanText || "Listo! Arme el relevamiento con toda la info. Revisa los datos y si esta bien, confirma para guardarlo.",
          }]);
        } catch {
          setMessages([...newMessages, { role: "assistant", content: aiText }]);
        }
      } else {
        setMessages([...newMessages, { role: "assistant", content: aiText }]);
      }
    } catch {
      toast.error("Error de conexion");
    } finally {
      setLoading(false);
    }
  }

  function handleCreateRelevamiento() {
    if (!pendingRelevamiento) return;
    createRelevamiento.mutate(
      { ...pendingRelevamiento, estado: "realizado", fecha_realizada: new Date().toISOString() },
      {
        onSuccess: () => {
          toast.success("Relevamiento guardado!");
          router.push("/comercial/relevamientos");
        },
        onError: () => toast.error("Error al guardar"),
      }
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] max-w-2xl mx-auto">
      <PageHeader title="Asistente de Relevamiento" description="Te guio paso a paso en la visita" />

      {/* Chat */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-3 py-4">
        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            {msg.role === "assistant" && (
              <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                <MapPin className="h-4 w-4 text-primary" />
              </div>
            )}
            <div className={`max-w-[80%] rounded-lg px-4 py-3 text-sm ${
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
              <MapPin className="h-4 w-4 text-primary" />
            </div>
            <div className="bg-muted rounded-lg px-4 py-3">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          </div>
        )}
      </div>

      {/* Pending relevamiento */}
      {pendingRelevamiento && (
        <Card className="border-primary/30 bg-primary/5 mb-4">
          <CardContent className="py-4 space-y-3">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-primary" />
              <span className="font-medium text-sm">Relevamiento listo para guardar</span>
            </div>
            <div className="text-sm space-y-1">
              <p><strong>{pendingRelevamiento.direccion}</strong></p>
              <p className="text-muted-foreground">
                {pendingRelevamiento.tipo_edificio} — {pendingRelevamiento.cantidad_pisos} pisos — {pendingRelevamiento.metros_lineales}m lineales
              </p>
              <p className="text-muted-foreground capitalize">
                Sistema: {pendingRelevamiento.sistema_recomendado}
              </p>
              {pendingRelevamiento.requiere_permiso_municipal && (
                <p className="text-yellow-400 text-xs">⚠ Requiere permiso municipal</p>
              )}
              {pendingRelevamiento.observaciones_tecnicas && (
                <p className="text-xs text-muted-foreground mt-2">{pendingRelevamiento.observaciones_tecnicas}</p>
              )}
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleCreateRelevamiento} disabled={createRelevamiento.isPending}>
                {createRelevamiento.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-2 h-4 w-4" />}
                Guardar relevamiento
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setPendingRelevamiento(null)}>Descartar</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Input */}
      <div className="flex gap-2 pt-2 border-t">
        <Input
          placeholder="Escribi aca..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
          disabled={loading}
          className="flex-1 h-12 text-base"
        />
        <Button onClick={handleSend} disabled={loading || !input.trim()} size="lg">
          {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
        </Button>
      </div>
    </div>
  );
}
