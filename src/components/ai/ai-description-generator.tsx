"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sparkles, Loader2, Copy, Check } from "lucide-react";
import { toast } from "sonner";

interface AIDescriptionGeneratorProps {
  context: {
    tipo?: string;
    altura?: number;
    metros?: number;
    superficie?: number;
    sistema?: string;
    ubicacion?: string;
    pisos?: number;
    plazo_meses?: number;
  };
  onGenerated: (text: string) => void;
  label?: string;
  placeholder?: string;
}

// Template-based generation (no external API needed)
function generateDescription(ctx: AIDescriptionGeneratorProps["context"]): string {
  const sistema = ctx.sistema || "multidireccional";
  const sistemaLabel = sistema === "multidireccional" ? "multidireccional certificado" : sistema === "tubular" ? "tubular normalizado" : sistema;

  let desc = `Provision de servicio de alquiler, montaje y desarme de andamio ${sistemaLabel}`;

  if (ctx.tipo === "fachada" || ctx.tipo === "Fachada") {
    desc += ` para trabajos en fachada`;
  } else if (ctx.tipo === "construccion") {
    desc += ` para obra en construccion`;
  } else if (ctx.tipo === "industria") {
    desc += ` para mantenimiento industrial`;
  } else if (ctx.tipo === "evento") {
    desc += ` para estructura temporaria de evento`;
  }

  if (ctx.ubicacion) desc += ` en ${ctx.ubicacion}`;
  desc += `.`;

  const specs: string[] = [];
  if (ctx.altura) specs.push(`Altura maxima: ${ctx.altura}m`);
  if (ctx.metros) specs.push(`Metros lineales: ${ctx.metros}m`);
  if (ctx.superficie) specs.push(`Superficie de trabajo: ${ctx.superficie}m2`);
  if (ctx.pisos) specs.push(`Edificio de ${ctx.pisos} pisos`);

  if (specs.length > 0) {
    desc += `\n\nEspecificaciones tecnicas:\n${specs.map((s) => `- ${s}`).join("\n")}`;
  }

  desc += `\n\nEl servicio incluye:`;
  desc += `\n- Provision de material de andamio ${sistemaLabel}`;
  desc += `\n- Montaje completo por cuadrilla especializada`;
  desc += `\n- Desarme y retiro al finalizar los trabajos`;
  desc += `\n- Transporte de materiales (ida y vuelta)`;
  desc += `\n- Elementos de seguridad: barandillas, rodapies y accesos seguros`;
  desc += `\n- Anclajes a estructura segun normas vigentes`;

  if (ctx.plazo_meses && ctx.plazo_meses > 1) {
    desc += `\n\nPlazo de alquiler: ${ctx.plazo_meses} meses desde la fecha de montaje.`;
  }

  desc += `\n\nEl andamio sera montado cumpliendo las normativas de seguridad vigentes (Res. SRT 550/11 y normas IRAM aplicables). Todo el personal cuenta con habilitacion para trabajo en altura.`;

  return desc;
}

function generateConditions(ctx: AIDescriptionGeneratorProps["context"]): string {
  let cond = `CONDICIONES GENERALES:\n\n`;
  cond += `1. ALCANCE: El presente presupuesto incluye provision de material, montaje, desarme y transporte del andamio segun especificaciones tecnicas detalladas.\n\n`;
  cond += `2. PLAZO DE VALIDEZ: Esta cotizacion tiene una validez de 30 (treinta) dias corridos desde su emision.\n\n`;
  cond += `3. FORMA DE PAGO: Segun condiciones acordadas. El alquiler se factura mensualmente por adelantado.\n\n`;
  cond += `4. PLAZO DE MONTAJE: A coordinar segun disponibilidad operativa, estimado dentro de los 5 dias habiles posteriores a la confirmacion del servicio.\n\n`;
  cond += `5. RESPONSABILIDAD DEL CLIENTE:\n`;
  cond += `   - Proveer acceso libre y seguro al area de trabajo\n`;
  cond += `   - No modificar ni alterar la estructura del andamio\n`;
  cond += `   - Custodiar el material durante el periodo de alquiler\n`;
  cond += `   - Comunicar con 48hs de anticipacion la fecha de desarme\n\n`;
  cond += `6. SEGURIDAD: El andamio sera inspeccionado previo a su habilitacion. Cualquier modificacion requerida debera ser comunicada y ejecutada exclusivamente por nuestro personal.\n\n`;
  cond += `7. SEGURO: Contamos con seguro de responsabilidad civil y ART para todo nuestro personal.\n\n`;
  cond += `8. PRECIOS: Expresados en Pesos Argentinos. No incluyen IVA.`;

  return cond;
}

export function AIDescriptionGenerator({ context, onGenerated, label = "Generar con IA", placeholder }: AIDescriptionGeneratorProps) {
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState("");
  const [copied, setCopied] = useState(false);

  function handleGenerate(type: "descripcion" | "condiciones") {
    setLoading(true);
    // Simulate AI delay for UX
    setTimeout(() => {
      const text = type === "descripcion" ? generateDescription(context) : generateConditions(context);
      setGenerated(text);
      setLoading(false);
    }, 800);
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
            <Sparkles className="h-4 w-4 text-primary" />Texto generado
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
        {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
        Generar descripcion
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={() => handleGenerate("condiciones")} disabled={loading}>
        {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
        Generar condiciones
      </Button>
    </div>
  );
}
