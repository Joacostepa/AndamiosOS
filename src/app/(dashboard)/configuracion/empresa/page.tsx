"use client";

import { useState, useEffect, useRef } from "react";
import { useConfiguracion, useUpdateConfiguracion } from "@/hooks/use-configuracion";
import { createClient } from "@/lib/supabase/client";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Save, Loader2, Upload, Image as ImageIcon, X } from "lucide-react";
import { toast } from "sonner";

export default function EmpresaPage() {
  const { data: configs, isLoading } = useConfiguracion();
  const updateConfig = useUpdateConfiguracion();
  const [values, setValues] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

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

  async function handleUploadLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Solo se permiten imágenes");
      return;
    }

    setUploading(true);
    try {
      const supabase = createClient();
      const ext = file.name.split(".").pop();
      const fileName = `logo.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("empresa")
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from("empresa")
        .getPublicUrl(fileName);

      // Add cache buster
      const urlWithCacheBust = `${publicUrl}?v=${Date.now()}`;
      await updateConfig.mutateAsync({ clave: "empresa_logo_url", valor: urlWithCacheBust });
      update("empresa_logo_url", urlWithCacheBust);
      toast.success("Logo actualizado");
    } catch (err: any) {
      toast.error("Error al subir: " + (err.message || ""));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleRemoveLogo() {
    await updateConfig.mutateAsync({ clave: "empresa_logo_url", valor: "" });
    update("empresa_logo_url", "");
    toast.success("Logo eliminado");
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

  const logoUrl = values.empresa_logo_url;

  return (
    <div className="space-y-6">
      <PageHeader title="Datos de empresa" description="Informacion que aparece en PDFs, cotizaciones y documentos" />

      {/* Logo */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Logo de la empresa</CardTitle>
          <CardDescription>
            Aparece en cotizaciones PDF y encabezados del sistema.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-6">
            {logoUrl ? (
              <div className="relative">
                <img
                  src={logoUrl}
                  alt="Logo"
                  className="h-20 w-auto max-w-[200px] object-contain rounded-md border bg-white p-2"
                />
                <Button
                  type="button"
                  variant="destructive"
                  size="icon"
                  className="absolute -top-2 -right-2 h-6 w-6"
                  onClick={handleRemoveLogo}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ) : (
              <div className="flex h-20 w-40 items-center justify-center rounded-md border border-dashed text-muted-foreground">
                <ImageIcon className="h-8 w-8" />
              </div>
            )}
            <div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                onChange={handleUploadLogo}
                className="hidden"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="mr-2 h-4 w-4" />
                )}
                {logoUrl ? "Cambiar logo" : "Subir logo"}
              </Button>
              <p className="text-xs text-muted-foreground mt-1">
                PNG o JPG, fondo transparente recomendado
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Datos */}
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
