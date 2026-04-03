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

const PRECIOS_KEYS = [
  { key: "precio_m2_fachada", label: "Precio por m² — Andamio completo", desc: "Incluye alquiler + mano de obra montaje y desarme" },
  { key: "precio_ml_bandeja", label: "Precio por metro lineal — Bandeja peatonal", desc: "Incluye alquiler + mano de obra montaje y desarme" },
  { key: "precio_ingenieria", label: "Ingeniería", desc: "Memoria de cálculo, planos, firma profesional" },
  { key: "precio_gestoria_permiso", label: "Gestoría permiso municipal", desc: "Gestión y tramitación del permiso" },
  { key: "precio_syh_jornada", label: "Seguridad e Higiene (por jornada)", desc: "Técnico SyH presente durante la jornada" },
];

const MULT_KEYS = [
  { key: "busca_profesionalismo", label: "Busca profesionalismo" },
  { key: "busca_precio", label: "Busca precio" },
  { key: "busca_velocidad", label: "Busca velocidad" },
  { key: "busca_seguridad", label: "Busca seguridad" },
  { key: "hay_competencia", label: "Hay competencia" },
  { key: "listo_contratar", label: "Listo para contratar" },
  { key: "licitacion", label: "En licitación" },
  { key: "cotizando", label: "Recién cotizando" },
  { key: "urgencia_alta", label: "Urgencia alta" },
];

export default function PreciosFachadasPage() {
  const { data: configs, isLoading } = useConfiguracion();
  const updateConfig = useUpdateConfiguracion();
  const [precios, setPrecios] = useState<Record<string, string>>({});
  const [mults, setMults] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (configs) {
      const p: Record<string, string> = {};
      configs.forEach((c) => { p[c.clave] = c.valor; });
      setPrecios(p);

      try {
        const m = JSON.parse(p.multiplicadores_comerciales || "{}");
        setMults(m);
      } catch { setMults({}); }
    }
  }, [configs]);

  async function handleSavePrecios() {
    setSaving(true);
    try {
      for (const pk of PRECIOS_KEYS) {
        const original = configs?.find((c) => c.clave === pk.key)?.valor || "";
        if (precios[pk.key] !== original) {
          await updateConfig.mutateAsync({ clave: pk.key, valor: precios[pk.key] || "0" });
        }
      }
      toast.success("Precios guardados");
    } catch { toast.error("Error al guardar"); }
    finally { setSaving(false); }
  }

  async function handleSaveMults() {
    setSaving(true);
    try {
      await updateConfig.mutateAsync({
        clave: "multiplicadores_comerciales",
        valor: JSON.stringify(mults),
      });
      toast.success("Multiplicadores guardados");
    } catch { toast.error("Error al guardar"); }
    finally { setSaving(false); }
  }

  if (isLoading) {
    return <div className="space-y-6"><Skeleton className="h-10 w-48" /><Skeleton className="h-96 w-full" /></div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Precios Fachadas" description="Valores base y multiplicadores comerciales para cotización de fachadas" />

      {/* Precios base */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Precios base</CardTitle>
          <CardDescription>
            El valor por m² y por metro lineal incluye alquiler + mano de obra (35% alquiler, 32.5% montaje, 32.5% desarme).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {PRECIOS_KEYS.map((pk) => (
            <div key={pk.key} className="grid grid-cols-2 gap-4 items-center">
              <div>
                <Label>{pk.label}</Label>
                <p className="text-xs text-muted-foreground">{pk.desc}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">$</span>
                <Input
                  type="number"
                  min={0}
                  step="1000"
                  value={precios[pk.key] || ""}
                  onChange={(e) => setPrecios({ ...precios, [pk.key]: e.target.value })}
                  className="text-right"
                />
              </div>
            </div>
          ))}
          <div className="flex justify-end pt-2">
            <Button size="sm" onClick={handleSavePrecios} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Guardar precios
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Multiplicadores comerciales */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Multiplicadores comerciales</CardTitle>
          <CardDescription>
            Ajustan el precio base según variables del cliente. Valor 1.00 = sin cambio, 1.15 = +15%, 0.90 = -10%.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            {MULT_KEYS.map((mk) => (
              <div key={mk.key} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                <Label className="text-sm">{mk.label}</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={mults[mk.key] ?? 1}
                  onChange={(e) => setMults({ ...mults, [mk.key]: Number(e.target.value) })}
                  className="w-20 text-center text-sm"
                />
              </div>
            ))}
          </div>
          <div className="flex justify-end pt-2">
            <Button size="sm" onClick={handleSaveMults} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Guardar multiplicadores
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
