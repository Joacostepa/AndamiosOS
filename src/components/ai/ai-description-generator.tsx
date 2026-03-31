"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sparkles, Loader2, Copy, Check } from "lucide-react";
import { toast } from "sonner";

interface AIDescriptionGeneratorProps {
  context: Record<string, unknown>;
  onGenerated: (text: string) => void;
}

export function AIDescriptionGenerator({ context, onGenerated }: AIDescriptionGeneratorProps) {
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState("");
  const [copied, setCopied] = useState(false);
  const [generatingType, setGeneratingType] = useState<string | null>(null);

  async function handleGenerate(tipo: "descripcion" | "condiciones") {
    setLoading(true);
    setGeneratingType(tipo);
    try {
      const res = await fetch("/api/ai/descripcion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo, contexto: context }),
      });
      const data = await res.json();
      if (data.error) {
        toast.error(data.error);
      } else {
        setGenerated(data.text);
      }
    } catch {
      toast.error("Error de conexion");
    } finally {
      setLoading(false);
      setGeneratingType(null);
    }
  }

  function handleUse() {
    onGenerated(generated);
    toast.success("Texto aplicado");
    setGenerated("");
  }

  function handleCopy() {
    navigator.clipboard.writeText(generated);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (generated) {
    return (
      <Card className="border-primary/30 bg-primary/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />Generado por IA
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="max-h-[300px] overflow-y-auto rounded-md bg-background p-3 text-sm whitespace-pre-wrap">
            {generated}
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleUse}>Usar este texto</Button>
            <Button size="sm" variant="outline" onClick={handleCopy}>
              {copied ? <Check className="mr-1 h-3 w-3" /> : <Copy className="mr-1 h-3 w-3" />}
              {copied ? "Copiado" : "Copiar"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setGenerated("")}>Descartar</Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex gap-2">
      <Button type="button" variant="outline" size="sm" onClick={() => handleGenerate("descripcion")} disabled={loading}>
        {loading && generatingType === "descripcion" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
        Generar descripcion con IA
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={() => handleGenerate("condiciones")} disabled={loading}>
        {loading && generatingType === "condiciones" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
        Generar condiciones con IA
      </Button>
    </div>
  );
}
