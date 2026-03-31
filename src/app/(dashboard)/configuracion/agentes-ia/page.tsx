"use client";

import { useState, useEffect } from "react";
import { useConfiguracion, useUpdateConfiguracion } from "@/hooks/use-configuracion";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Save, Loader2, Sparkles, Home, Layers, Wrench } from "lucide-react";
import { toast } from "sonner";
import type { Configuracion } from "@/hooks/use-configuracion";

function getVal(configs: Configuracion[] | undefined, clave: string): string {
  return configs?.find((c) => c.clave === clave)?.valor || "";
}

export default function AgentesIAPage() {
  const { data: configs, isLoading } = useConfiguracion();
  const updateConfig = useUpdateConfiguracion();
  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    if (configs) {
      const v: Record<string, string> = {};
      configs.forEach((c) => { v[c.clave] = c.valor; });
      setValues(v);
    }
  }, [configs]);

  function update(clave: string, valor: string) {
    setValues((v) => ({ ...v, [clave]: valor }));
  }

  async function handleSave(claves: string[]) {
    for (const clave of claves) {
      if (values[clave] !== getVal(configs, clave)) {
        await updateConfig.mutateAsync({ clave, valor: values[clave] || "" });
      }
    }
    toast.success("Configuracion guardada");
  }

  if (isLoading) {
    return <div className="space-y-6"><Skeleton className="h-10 w-48" /><Skeleton className="h-96 w-full" /></div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Agentes IA" description="Configuracion de los asistentes de inteligencia artificial" />

      {/* General */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Cotizaciones — General
          </CardTitle>
          <CardDescription>
            Instrucciones generales y estilo de comunicacion que aplican a todos los agentes de cotizacion.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Instrucciones generales y politicas</Label>
            <Textarea
              value={values.ai_prompt_cotizacion || ""}
              onChange={(e) => update("ai_prompt_cotizacion", e.target.value)}
              rows={8}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">{(values.ai_prompt_cotizacion || "").length} caracteres</p>
          </div>
          <div className="space-y-2">
            <Label>Estilo de comunicacion</Label>
            <Textarea
              value={values.ai_prompt_estilo || ""}
              onChange={(e) => update("ai_prompt_estilo", e.target.value)}
              rows={3}
              className="font-mono text-sm"
            />
          </div>
          <div className="flex justify-end">
            <Button size="sm" onClick={() => handleSave(["ai_prompt_cotizacion", "ai_prompt_estilo"])} disabled={updateConfig.isPending}>
              {updateConfig.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Guardar general
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Hogareño */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Home className="h-4 w-4 text-amber-400" />
            Cotizaciones — Alquiler hogareño
          </CardTitle>
          <CardDescription>
            Asesora sobre módulos, tablones y ruedas para trabajos domésticos.
            Incluye lista de precios por fracción (10/20/30 días) y reglas de recomendación.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Instrucciones, precios y reglas</Label>
            <Textarea
              value={values.ai_agente_hogareno || ""}
              onChange={(e) => update("ai_agente_hogareno", e.target.value)}
              rows={15}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">{(values.ai_agente_hogareno || "").length} caracteres</p>
          </div>
          <div className="flex justify-end">
            <Button size="sm" onClick={() => handleSave(["ai_agente_hogareno"])} disabled={updateConfig.isPending}>
              {updateConfig.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Guardar agente hogareño
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Multidireccional */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Layers className="h-4 w-4 text-cyan-400" />
            Cotizaciones — Multidireccional
          </CardTitle>
          <CardDescription>
            Alquiler de multidireccional por tonelada. Ajustes por urgencia, tipo de cliente y stock.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Instrucciones y reglas de negocio</Label>
            <Textarea
              value={values.ai_agente_multidireccional || ""}
              onChange={(e) => update("ai_agente_multidireccional", e.target.value)}
              rows={15}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">{(values.ai_agente_multidireccional || "").length} caracteres</p>
          </div>
          <div className="flex justify-end">
            <Button size="sm" onClick={() => handleSave(["ai_agente_multidireccional"])} disabled={updateConfig.isPending}>
              {updateConfig.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Guardar agente multidireccional
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Armado/Desarme */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Wrench className="h-4 w-4 text-purple-400" />
            Cotizaciones — Armado y desarme
          </CardTitle>
          <CardDescription>
            Servicio completo por sub-rubro: fachadas, industria, eventos, obra pública, construcción.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Instrucciones por rubro y reglas</Label>
            <Textarea
              value={values.ai_agente_armado_desarme || ""}
              onChange={(e) => update("ai_agente_armado_desarme", e.target.value)}
              rows={15}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">{(values.ai_agente_armado_desarme || "").length} caracteres</p>
          </div>
          <div className="flex justify-end">
            <Button size="sm" onClick={() => handleSave(["ai_agente_armado_desarme"])} disabled={updateConfig.isPending}>
              {updateConfig.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Guardar agente armado/desarme
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Computos */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-blue-400" />
            Agente de Computos
          </CardTitle>
          <CardDescription>
            Calcula las piezas necesarias para un proyecto. Reglas de ingeniería y márgenes.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Reglas de calculo e ingenieria</Label>
            <Textarea
              value={values.ai_agente_computo || ""}
              onChange={(e) => update("ai_agente_computo", e.target.value)}
              rows={15}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">{(values.ai_agente_computo || "").length} caracteres</p>
          </div>
          <div className="flex justify-end">
            <Button size="sm" onClick={() => handleSave(["ai_agente_computo"])} disabled={updateConfig.isPending}>
              {updateConfig.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Guardar agente computos
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Descripciones */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-green-400" />
            Agente de Descripciones
          </CardTitle>
          <CardDescription>
            Genera textos profesionales para cotizaciones: descripción del servicio y condiciones.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Instrucciones de redaccion</Label>
            <Textarea
              value={values.ai_agente_descripcion || ""}
              onChange={(e) => update("ai_agente_descripcion", e.target.value)}
              rows={15}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">{(values.ai_agente_descripcion || "").length} caracteres</p>
          </div>
          <div className="flex justify-end">
            <Button size="sm" onClick={() => handleSave(["ai_agente_descripcion"])} disabled={updateConfig.isPending}>
              {updateConfig.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Guardar agente descripciones
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Relevamiento */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-orange-400" />
            Agente de Relevamiento
          </CardTitle>
          <CardDescription>
            Guía al relevador paso a paso en la visita de campo. Optimizado para celular.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Instrucciones de campo y reglas de negocio</Label>
            <Textarea
              value={values.ai_agente_relevamiento || ""}
              onChange={(e) => update("ai_agente_relevamiento", e.target.value)}
              rows={15}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">{(values.ai_agente_relevamiento || "").length} caracteres</p>
          </div>
          <div className="flex justify-end">
            <Button size="sm" onClick={() => handleSave(["ai_agente_relevamiento"])} disabled={updateConfig.isPending}>
              {updateConfig.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Guardar agente relevamiento
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
