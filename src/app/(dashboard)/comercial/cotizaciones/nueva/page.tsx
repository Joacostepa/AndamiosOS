"use client";

import { useState, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm, FormProvider } from "react-hook-form";
import { useCreateCotizacion } from "@/hooks/use-cotizaciones";
import { useClientes, useCreateCliente } from "@/hooks/use-clientes";
import { useConfiguracion } from "@/hooks/use-configuracion";
import { useOportunidades } from "@/hooks/use-oportunidades";
import { UnitSelector } from "@/components/cotizaciones/unit-selector";
import { SubrubroSelector } from "@/components/cotizaciones/subrubro-selector";
import { CommonFields } from "@/components/cotizaciones/common-fields";
import { FormHogareno } from "@/components/cotizaciones/form-hogareno";
import { FormMultidireccional } from "@/components/cotizaciones/form-multidireccional";
import { FormArmadoDesarme } from "@/components/cotizaciones/form-armado-desarme";
import { ItemsTable } from "@/components/cotizaciones/items-table";
import { AIChatPanel } from "@/components/cotizaciones/ai-chat-panel";
import { PDFDownloadButton } from "@/components/pdf/pdf-download-button";
import { CotizacionPDF, type EmpresaData } from "@/components/pdf/cotizacion-pdf";
import { useCotizacion } from "@/hooks/use-cotizaciones";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useIsMobile } from "@/hooks/use-mobile";
import { ArrowLeft, Loader2, Save, MessageSquare, CheckCircle2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import type {
  UnidadCotizacion,
  CotizacionFormData,
} from "@/types/cotizacion-form";
import { UNIDAD_LABELS, SUB_VERTICAL_LABELS } from "@/types/cotizacion-form";

export default function NuevaCotizacionPage() {
  return (
    <Suspense>
      <NuevaCotizacionContent />
    </Suspense>
  );
}

function NuevaCotizacionContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isMobile = useIsMobile();
  const createCotizacion = useCreateCotizacion();
  const { data: clientesList } = useClientes();
  const createCliente = useCreateCliente();
  const { data: configs } = useConfiguracion();
  const { data: oportunidades } = useOportunidades();

  const [unidad, setUnidad] = useState<UnidadCotizacion | null>(null);
  const [subRubroSelected, setSubRubroSelected] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);

  const { data: createdCot } = useCotizacion(createdId || "");

  const form = useForm<CotizacionFormData>({
    defaultValues: {
      titulo: "",
      descripcion_servicio: "",
      condiciones:
        "- Precios expresados en pesos argentinos + IVA\n- Plazo de validez: 30 días\n- No incluye permisos municipales salvo indicación expresa",
      condicion_pago: "",
      items: [],
      incluye_montaje: true,
      incluye_desarme: true,
      incluye_transporte: true,
      metadata: {},
    },
  });

  const handleUnitSelect = useCallback(
    (u: UnidadCotizacion) => {
      setUnidad(u);
      form.setValue("unidad_cotizacion", u);

      // Pre-fill from oportunidad if present
      const opId = searchParams.get("oportunidad");
      if (opId && oportunidades) {
        const op = oportunidades.find((o) => o.id === opId);
        if (op) {
          form.setValue("oportunidad_id", opId);
          if (op.cliente_id) form.setValue("cliente_id", op.cliente_id);
          if (op.titulo)
            form.setValue("titulo", `Cotización - ${op.titulo}`);
        }
      }
    },
    [form, searchParams, oportunidades]
  );

  const handleFieldUpdates = useCallback(
    (updates: Partial<CotizacionFormData>) => {
      Object.entries(updates).forEach(([key, value]) => {
        if (key === "items" && Array.isArray(value)) {
          form.setValue("items", value, { shouldDirty: true });
        } else if (key === "metadata" && typeof value === "object") {
          const current = form.getValues("metadata") || {};
          form.setValue(
            "metadata",
            { ...current, ...(value as Record<string, unknown>) },
            { shouldDirty: true }
          );
        } else {
          form.setValue(key as any, value, { shouldDirty: true });
        }
      });
    },
    [form]
  );

  const handleCreateCliente = useCallback(
    async (nombre: string, telefono: string) => {
      if (!nombre.trim()) return;
      // Search existing first to avoid duplicates
      const existing = clientesList?.find(
        (c) => c.razon_social.toLowerCase() === nombre.trim().toLowerCase()
      );
      if (existing) {
        form.setValue("cliente_id", existing.id);
        return;
      }
      try {
        const cliente = await createCliente.mutateAsync({
          razon_social: nombre.trim(),
          telefono: telefono.trim() || undefined,
          estado: "activo",
        });
        form.setValue("cliente_id", cliente.id);
      } catch {
        // silently fail — client can be created manually
      }
    },
    [createCliente, form, clientesList]
  );

  const onSubmit = useCallback(
    async (data: CotizacionFormData) => {
      if (data.items.length === 0) {
        toast.error("Agregá al menos un item");
        return;
      }

      // Build items list
      const items = data.items.map((item) => ({
        tipo: item.tipo,
        concepto: item.concepto,
        detalle: item.detalle,
        cantidad: item.cantidad,
        unidad: item.unidad,
        precio_unitario: item.precio_unitario,
      }));

      // Add mínimo operativo adjustment for hogareño
      if (data.unidad_cotizacion === "hogareno") {
        const minimoVal = configs?.find((c) => c.clave === "minimo_hogareno")?.valor;
        const minimo = minimoVal ? Number(minimoVal) : 0;
        if (minimo > 0) {
          const subtotal = items.reduce(
            (sum, i) => sum + (i.cantidad || 0) * (i.precio_unitario || 0),
            0
          );
          if (subtotal > 0 && subtotal < minimo) {
            items.push({
              tipo: "extra",
              concepto: "Ajuste mínimo operativo",
              detalle: `Mínimo operativo: $${minimo.toLocaleString("es-AR")}`,
              cantidad: 1,
              unidad: "un",
              precio_unitario: minimo - subtotal,
            });
          }
        }
      }

      try {
        const cot = await createCotizacion.mutateAsync({
          titulo: data.titulo,
          cliente_id: data.cliente_id || undefined,
          oportunidad_id: data.oportunidad_id || undefined,
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
          responsable_id: data.responsable_id || undefined,
          metadata: data.metadata,
          items,
        });
        toast.success("Cotización creada");
        setCreatedId(cot.id);
      } catch {
        toast.error("Error al crear la cotización");
      }
    },
    [createCotizacion, router, configs]
  );

  // Step 1: Unit selector
  if (!unidad) {
    return <UnitSelector onSelect={handleUnitSelect} />;
  }

  // Step 1.5: Sub-rubro selector for armado/desarme
  if (unidad === "armado_desarme" && !subRubroSelected) {
    return (
      <SubrubroSelector
        onSelect={(subrubro) => {
          form.setValue("sub_vertical", subrubro);
          setSubRubroSelected(true);
        }}
        onBack={() => setUnidad(null)}
      />
    );
  }

  // Build empresa data for PDF
  const empresa: EmpresaData = {
    nombre: configs?.find((c) => c.clave === "empresa_nombre")?.valor,
    cuit: configs?.find((c) => c.clave === "empresa_cuit")?.valor,
    direccion: configs?.find((c) => c.clave === "empresa_direccion")?.valor,
    telefono: configs?.find((c) => c.clave === "empresa_telefono")?.valor,
    email: configs?.find((c) => c.clave === "empresa_email")?.valor,
    web: configs?.find((c) => c.clave === "empresa_web")?.valor,
    logo_url: configs?.find((c) => c.clave === "empresa_logo_url")?.valor,
  };

  // Step 2: Split view workspace
  const chatPanel = (
    <AIChatPanel
      unidad={unidad}
      subVertical={form.watch("sub_vertical")}
      formValues={form.getValues()}
      onFieldUpdates={handleFieldUpdates}
      onCreateCliente={handleCreateCliente}
    />
  );

  return (
    <FormProvider {...form}>
      <div className="flex h-[calc(100vh-8rem)]">
        {/* Left: Form */}
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="flex-1 overflow-y-auto p-6 space-y-6 lg:w-3/5"
        >
          {/* Top bar */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => {
                  if (unidad === "armado_desarme" && subRubroSelected) {
                    form.setValue("sub_vertical", undefined);
                    setSubRubroSelected(false);
                  } else {
                    setUnidad(null);
                  }
                }}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div>
                <h1 className="text-2xl font-bold tracking-tight">
                  Nueva cotización
                </h1>
                <p className="text-sm text-muted-foreground">
                  {UNIDAD_LABELS[unidad]}
                  {form.watch("sub_vertical") && ` — ${SUB_VERTICAL_LABELS[form.watch("sub_vertical")!]}`}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {isMobile && (
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setChatOpen(true)}
                >
                  <MessageSquare className="h-4 w-4" />
                </Button>
              )}
              <Button type="submit" disabled={createCotizacion.isPending}>
                {createCotizacion.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                Crear cotización
              </Button>
            </div>
          </div>

          {/* Common fields */}
          <CommonFields />

          {/* Unit-specific fields */}
          {unidad === "hogareno" && <FormHogareno />}
          {unidad === "multidireccional" && <FormMultidireccional />}
          {unidad === "armado_desarme" && <FormArmadoDesarme />}

          {/* Items table */}
          <ItemsTable unidad={unidad} />
        </form>

        {/* Right: AI Chat (desktop) - OUTSIDE form to prevent submit bubbling */}
        {!isMobile && (
          <div className="hidden lg:flex w-2/5 border-l">{chatPanel}</div>
        )}
      </div>

      {/* Mobile: Chat in sheet */}
      {isMobile && (
        <Sheet open={chatOpen} onOpenChange={setChatOpen}>
          <SheetContent side="right" className="w-full sm:max-w-md p-0">
            <SheetTitle className="sr-only">Asistente IA</SheetTitle>
            <div className="h-full">{chatPanel}</div>
          </SheetContent>
        </Sheet>
      )}

      {/* Dialog post-creación con PDF */}
      <Dialog open={!!createdId} onOpenChange={(open) => { if (!open) router.push(`/comercial/cotizaciones/${createdId}`); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
              Cotización creada
            </DialogTitle>
            <DialogDescription>
              {createdCot ? `${createdCot.codigo} — ${createdCot.titulo}` : "Procesando..."}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 pt-2">
            {createdCot && (
              <PDFDownloadButton
                document={
                  <CotizacionPDF
                    cotizacion={createdCot}
                    items={createdCot.cotizacion_items || []}
                    clienteNombre={createdCot.clientes?.razon_social}
                    empresa={empresa}
                  />
                }
                fileName={`${createdCot.codigo}.pdf`}
                label="Descargar PDF"
              />
            )}
            <Button
              variant="outline"
              onClick={() => router.push(`/comercial/cotizaciones/${createdId}`)}
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              Ver cotización
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </FormProvider>
  );
}
