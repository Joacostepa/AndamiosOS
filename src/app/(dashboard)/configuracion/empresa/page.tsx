"use client";

import { useState, useEffect } from "react";
import { useConfiguracion, useUpdateConfiguracion } from "@/hooks/use-configuracion";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Save, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function EmpresaPage() {
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

  async function handleSave() {
    const claves = ["empresa_nombre", "empresa_cuit", "empresa_direccion", "empresa_telefono", "empresa_email", "empresa_web"];
    for (const clave of claves) {
      const original = configs?.find((c) => c.clave === clave)?.valor || "";
      if (values[clave] !== original) {
        await updateConfig.mutateAsync({ clave, valor: values[clave] || "" });
      }
    }
    toast.success("Datos de empresa guardados");
  }

  if (isLoading) {
    return <div className="space-y-6"><Skeleton className="h-10 w-48" /><Skeleton className="h-96 w-full" /></div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Datos de empresa" description="Informacion que aparece en PDFs, cotizaciones y documentos" />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Información general</CardTitle>
          <CardDescription>
            Estos datos se usan en los PDFs de cotizaciones, remitos y documentos generados.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Nombre de la empresa</Label>
              <Input value={values.empresa_nombre || ""} onChange={(e) => update("empresa_nombre", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>CUIT</Label>
              <Input value={values.empresa_cuit || ""} onChange={(e) => update("empresa_cuit", e.target.value)} placeholder="XX-XXXXXXXX-X" />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Direccion</Label>
            <Input value={values.empresa_direccion || ""} onChange={(e) => update("empresa_direccion", e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Telefono</Label>
              <Input value={values.empresa_telefono || ""} onChange={(e) => update("empresa_telefono", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input value={values.empresa_email || ""} onChange={(e) => update("empresa_email", e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Sitio web</Label>
            <Input value={values.empresa_web || ""} onChange={(e) => update("empresa_web", e.target.value)} placeholder="https://..." />
          </div>
          <div className="flex justify-end">
            <Button size="sm" onClick={handleSave} disabled={updateConfig.isPending}>
              {updateConfig.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Guardar datos empresa
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
