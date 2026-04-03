"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2, Check, X } from "lucide-react";

interface AIImproveButtonProps {
  currentText: string;
  fieldName: string;
  context: Record<string, unknown>;
  onAccept: (improvedText: string) => void;
  label?: string;
  allowEmpty?: boolean;
}

export function AIImproveButton({
  currentText,
  fieldName,
  context,
  onAccept,
  label = "Mejorar redacción",
  allowEmpty = false,
}: AIImproveButtonProps) {
  const [loading, setLoading] = useState(false);
  const [improved, setImproved] = useState("");

  async function handleImprove() {
    if (!currentText.trim()) return;
    setLoading(true);
    setImproved("");
    try {
      const res = await fetch("/api/ai/descripcion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo: "mejorar",
          texto_original: currentText,
          contexto: context,
          campo: fieldName,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setImproved(data.text);
    } catch {
      setImproved("");
    } finally {
      setLoading(false);
    }
  }

  if (improved) {
    return (
      <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
        <div className="flex items-center gap-1.5 text-xs font-medium text-primary">
          <Sparkles className="h-3 w-3" />
          Texto mejorado por IA
        </div>
        <p className="text-sm whitespace-pre-wrap max-h-40 overflow-y-auto">
          {improved}
        </p>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            className="h-7 text-xs"
            onClick={() => {
              onAccept(improved);
              setImproved("");
            }}
          >
            <Check className="mr-1 h-3 w-3" />
            Usar este texto
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setImproved("")}
          >
            <X className="mr-1 h-3 w-3" />
            Descartar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-6 text-xs text-primary"
      disabled={(!allowEmpty && !currentText.trim()) || loading}
      onClick={handleImprove}
    >
      {loading ? (
        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
      ) : (
        <Sparkles className="mr-1 h-3 w-3" />
      )}
      {label}
    </Button>
  );
}
