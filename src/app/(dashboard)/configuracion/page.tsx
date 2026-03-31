"use client";

import { useState, useEffect } from "react";
import { useConfiguracion, useUpdateConfiguracion } from "@/hooks/use-configuracion";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Save, Loader2, Sparkles, RotateCcw } from "lucide-react";
import { toast } from "sonner";

export default function ConfiguracionPage() {
  const { data: configs, isLoading } = useConfiguracion();
  const updateConfig = useUpdateConfiguracion();

  const [promptCotizacion, setPromptCotizacion] = useState("");
  const [promptEstilo, setPromptEstilo] = useState("");
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (Array.isArray(configs)) {
      const cotConfig = configs.find((c: any) => c.clave === "ai_prompt_cotizacion");
      const estiloConfig = configs.find((c: any) => c.clave === "ai_prompt_estilo");
      if (cotConfig) setPromptCotizacion(cotConfig.valor);
      if (estiloConfig) setPromptEstilo(estiloConfig.valor);
    }
  }, [configs]);

  function handleSavePrompt() {
    updateConfig.mutate(
      { clave: "ai_prompt_cotizacion", valor: promptCotizacion },
      {
        onSuccess: () => {
          updateConfig.mutate(
            { clave: "ai_prompt_estilo", valor: promptEstilo },
            {
              onSuccess: () => {
                toast.success("Configuracion guardada");
                setHasChanges(false);
              },
              onError: () => toast.error("Error al guardar estilo"),
            }
          );
        },
        onError: () => toast.error("Error al guardar"),
      }
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Configuracion" description="Ajustes del sistema" />

      <Tabs defaultValue="ia">
        <TabsList>
          <TabsTrigger value="ia">Asistente IA</TabsTrigger>
          <TabsTrigger value="general">General</TabsTrigger>
        </TabsList>

        <TabsContent value="ia" className="mt-4 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                Instrucciones del asistente de cotizaciones
              </CardTitle>
              <CardDescription>
                Este texto se le da como contexto a la IA cuando genera cotizaciones.
                Podes incluir precios de referencia, politicas comerciales,
                condiciones especiales, y cualquier instruccion que quieras que siga.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Instrucciones y precios de referencia</Label>
                <Textarea
                  value={promptCotizacion}
                  onChange={(e) => {
                    setPromptCotizacion(e.target.value);
                    setHasChanges(true);
                  }}
                  rows={20}
                  className="font-mono text-sm"
                  placeholder="Escribi aca las instrucciones para la IA..."
                />
                <p className="text-xs text-muted-foreground">
                  {promptCotizacion.length} caracteres — Podes incluir precios,
                  condiciones de pago, politicas comerciales, etc.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Estilo de comunicacion</CardTitle>
              <CardDescription>
                Como queres que hable el asistente con los vendedores.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Estilo</Label>
                <Textarea
                  value={promptEstilo}
                  onChange={(e) => {
                    setPromptEstilo(e.target.value);
                    setHasChanges(true);
                  }}
                  rows={4}
                  className="font-mono text-sm"
                />
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                if (Array.isArray(configs)) {
                  const cotConfig = configs.find((c: any) => c.clave === "ai_prompt_cotizacion");
                  const estiloConfig = configs.find((c: any) => c.clave === "ai_prompt_estilo");
                  if (cotConfig) setPromptCotizacion(cotConfig.valor);
                  if (estiloConfig) setPromptEstilo(estiloConfig.valor);
                  setHasChanges(false);
                }
              }}
              disabled={!hasChanges}
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Descartar cambios
            </Button>
            <Button
              onClick={handleSavePrompt}
              disabled={!hasChanges || updateConfig.isPending}
            >
              {updateConfig.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Guardar configuracion
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="general" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Datos de la empresa</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Proximamente: configuracion de datos de empresa, logo, y preferencias generales.
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
