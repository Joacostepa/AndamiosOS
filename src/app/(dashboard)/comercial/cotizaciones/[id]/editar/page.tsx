"use client";

import { use, useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm, FormProvider } from "react-hook-form";
import { useCotizacion, useUpdateCotizacion } from "@/hooks/use-cotizaciones";
import { useConfiguracion } from "@/hooks/use-configuracion";
import { CommonFields } from "@/components/cotizaciones/common-fields";
import { FormHogareno } from "@/components/cotizaciones/form-hogareno";
import { FormMultidireccional } from "@/components/cotizaciones/form-multidireccional";
import { FormArmadoDesarme } from "@/components/cotizaciones/form-armado-desarme";
import { ItemsTable } from "@/components/cotizaciones/items-table";
import { AIChatPanel } from "@/components/cotizaciones/ai-chat-panel";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsMobile } from "@/hooks/use-mobile";
import { ArrowLeft, Loader2, Save, Sparkles } from "lucide-react";
import { toast } from "sonner";
import type { UnidadCotizacion, CotizacionFormData } from "@/types/cotizacion-form";
import { UNIDAD_LABELS, SUB_VERTICAL_LABELS } from "@/types/cotizacion-form";

const DRAFT_KEY = "cotizacion-edit-draft";

export default function EditarCotizacionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const isMobile = useIsMobile();
  const { data: cotizacion, isLoading } = useCotizacion(id);
  const { data: configs } = useConfiguracion();
  const updateCotizacion = useUpdateCotizacion();
  const [chatOpen, setChatOpen] = useState(false);

  const form = useForm<CotizacionFormData>();

  // Pre-fill form when cotización loads
  useEffect(() => {
    if (!cotizacion) return;

    // Check for auto-saved draft
    const draftKey = `${DRAFT_KEY}-${id}`;
    const savedDraft = localStorage.getItem(draftKey);
    if (savedDraft) {
      try {
        const draft = JSON.parse(savedDraft);
        const useDraft = confirm("Hay un borrador guardado automáticamente. ¿Querés retomarlo?");
        if (useDraft) {
          form.reset(draft);
          return;
        } else {
          localStorage.removeItem(draftKey);
        }
      } catch { localStorage.removeItem(draftKey); }
    }

    const meta = (cotizacion.metadata || {}) as Record<string, any>;
    form.reset({
      titulo: cotizacion.titulo,
      cliente_id: cotizacion.cliente_id || undefined,
      oportunidad_id: cotizacion.oportunidad_id || undefined,
      descripcion_servicio: cotizacion.descripcion_servicio || "",
      condiciones: cotizacion.condiciones || "",
      condicion_pago: cotizacion.condicion_pago || "",
      unidad_cotizacion: (cotizacion.unidad_cotizacion as UnidadCotizacion) || "armado_desarme",
      sub_vertical: cotizacion.sub_vertical as any,
      fraccion_dias: cotizacion.fraccion_dias as any,
      zona_entrega: cotizacion.zona_entrega || undefined,
      tonelaje_estimado: cotizacion.tonelaje_estimado || undefined,
      urgencia: cotizacion.urgencia || undefined,
      plazo_alquiler_meses: cotizacion.plazo_alquiler_meses || undefined,
      incluye_montaje: cotizacion.incluye_montaje,
      incluye_desarme: cotizacion.incluye_desarme,
      incluye_transporte: cotizacion.incluye_transporte,
      responsable_id: cotizacion.responsable_id || undefined,
      ubicacion: meta.ubicacion as string || undefined,
      metadata: meta,
      items: cotizacion.cotizacion_items?.map((item) => ({
        tipo: item.tipo,
        concepto: item.concepto,
        detalle: item.detalle || undefined,
        cantidad: item.cantidad,
        unidad: item.unidad,
        precio_unitario: item.precio_unitario,
      })) || [],
    });
  }, [cotizacion, form, id]);

  // Auto-save draft every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      const values = form.getValues();
      if (values.titulo) {
        localStorage.setItem(`${DRAFT_KEY}-${id}`, JSON.stringify(values));
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [form, id]);

  const handleFieldUpdates = useCallback(
    (updates: Partial<CotizacionFormData>) => {
      Object.entries(updates).forEach(([key, value]) => {
        if (key === "items" && Array.isArray(value)) {
          form.setValue("items", value, { shouldDirty: true });
        } else if (key === "metadata" && typeof value === "object") {
          const current = form.getValues("metadata") || {};
          form.setValue("metadata", { ...current, ...(value as Record<string, unknown>) }, { shouldDirty: true });
        } else {
          form.setValue(key as any, value, { shouldDirty: true });
        }
      });
    },
    [form]
  );

  const onSubmit = useCallback(
    async (data: CotizacionFormData) => {
      try {
        await updateCotizacion.mutateAsync({
          id,
          data: {
            titulo: data.titulo,
            cliente_id: data.cliente_id || null,
            oportunidad_id: data.oportunidad_id || null,
            descripcion_servicio: data.descripcion_servicio,
            condiciones: data.condiciones,
            condicion_pago: data.condicion_pago,
            plazo_alquiler_meses: data.plazo_alquiler_meses,
            unidad_cotizacion: data.unidad_cotizacion,
            sub_vertical: data.sub_vertical,
            fraccion_dias: data.fraccion_dias,
            zona_entrega: data.zona_entrega,
            tonelaje_estimado: data.tonelaje_estimado,
            urgencia: data.urgencia,
            incluye_montaje: data.incluye_montaje,
            incluye_desarme: data.incluye_desarme,
            incluye_transporte: data.incluye_transporte,
            responsable_id: data.responsable_id || null,
            metadata: data.metadata,
          },
          items: data.items.map((item) => ({
            tipo: item.tipo,
            concepto: item.concepto,
            detalle: item.detalle,
            cantidad: item.cantidad,
            unidad: item.unidad,
            precio_unitario: item.precio_unitario,
          })),
        });
        // Clear draft
        localStorage.removeItem(`${DRAFT_KEY}-${id}`);
        toast.success("Cotización actualizada");
        router.push(`/comercial/cotizaciones/${id}`);
      } catch {
        toast.error("Error al actualizar");
      }
    },
    [updateCotizacion, router, id]
  );

  if (isLoading || !cotizacion) {
    return <div className="space-y-6 p-6"><Skeleton className="h-10 w-64" /><Skeleton className="h-96 w-full" /></div>;
  }

  if (cotizacion.estado !== "borrador") {
    return (
      <div className="flex items-center justify-center h-[60vh] text-muted-foreground">
        <p>Solo se pueden editar cotizaciones en estado borrador.</p>
      </div>
    );
  }

  const unidad = (cotizacion.unidad_cotizacion as UnidadCotizacion) || "armado_desarme";
  const isFachadas = unidad === "armado_desarme" && cotizacion.sub_vertical === "fachadas";

  const chatPanel = (
    <AIChatPanel
      unidad={unidad}
      subVertical={form.watch("sub_vertical")}
      formValues={form.getValues()}
      onFieldUpdates={handleFieldUpdates}
    />
  );

  return (
    <FormProvider {...form}>
      <div className="flex h-[calc(100vh-8rem)]">
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className={`flex-1 overflow-y-auto p-6 space-y-6 transition-all duration-200 ${chatOpen && !isMobile ? "lg:w-3/5" : "w-full"}`}
        >
          {/* Top bar */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button type="button" variant="ghost" size="icon" onClick={() => router.push(`/comercial/cotizaciones/${id}`)}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div>
                <h1 className="text-2xl font-bold tracking-tight">
                  Editar cotización
                </h1>
                <p className="text-sm text-muted-foreground">
                  {cotizacion.codigo} — {UNIDAD_LABELS[unidad]}
                  {cotizacion.sub_vertical && ` — ${SUB_VERTICAL_LABELS[cotizacion.sub_vertical as keyof typeof SUB_VERTICAL_LABELS]}`}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button type="button" variant={chatOpen ? "default" : "outline"} size="sm" onClick={() => setChatOpen(!chatOpen)}>
                <Sparkles className="mr-1.5 h-3.5 w-3.5" />Asistente IA
              </Button>
              <Button type="submit" disabled={updateCotizacion.isPending}>
                {updateCotizacion.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Guardar cambios
              </Button>
            </div>
          </div>

          {/* Form fields */}
          {!isFachadas && <CommonFields />}
          {unidad === "hogareno" && <FormHogareno />}
          {unidad === "multidireccional" && <FormMultidireccional />}
          {unidad === "armado_desarme" && <FormArmadoDesarme />}
          <ItemsTable unidad={unidad} />
        </form>

        {/* AI Chat */}
        {!isMobile && chatOpen && (
          <div className="hidden lg:flex w-2/5 border-l transition-all duration-200">{chatPanel}</div>
        )}
      </div>

      {isMobile && (
        <Sheet open={chatOpen} onOpenChange={setChatOpen}>
          <SheetContent side="right" className="w-full sm:max-w-md p-0">
            <SheetTitle className="sr-only">Asistente IA</SheetTitle>
            <div className="h-full">{chatPanel}</div>
          </SheetContent>
        </Sheet>
      )}
    </FormProvider>
  );
}
