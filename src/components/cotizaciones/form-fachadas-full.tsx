"use client";

import { useCallback } from "react";
import { useFormContext } from "react-hook-form";
import { useConfiguracion } from "@/hooks/use-configuracion";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Calculator } from "lucide-react";
import { TituloClienteFields } from "@/components/cotizaciones/titulo-cliente-fields";
import { FormDatosComerciales } from "@/components/cotizaciones/form-datos-comerciales";
import { ServiceToggles } from "@/components/cotizaciones/service-toggles";
import { AIImproveButton } from "@/components/cotizaciones/ai-improve-button";
import { ImageSelector } from "@/components/cotizaciones/image-selector";
import type { CotizacionFormData, CotizacionItemFormData } from "@/types/cotizacion-form";

const TIPO_PRODUCTO = [
  {
    key: "andamio_completo",
    title: "Andamio completo",
    description: "Estructura completa con bandeja fenólico, escaleras, tablones y mediasombra. Precio por m².",
  },
  {
    key: "bandeja_peatonal",
    title: "Bandeja de protección peatonal",
    description: "Bandeja debajo del primer balcón para silleteros. Precio por metro lineal.",
  },
];

function getConfigVal(configs: any[] | undefined, key: string): string {
  return configs?.find((c: any) => c.clave === key)?.valor || "";
}

export function FormFachadasFull() {
  const { register, watch, setValue } = useFormContext<CotizacionFormData>();
  const { data: configs } = useConfiguracion();
  const tipoProducto = (watch("metadata.tipo_producto_fachada" as any) as string) || "";

  const handleGenerateItems = useCallback(() => {
    const tipo = (watch("metadata.tipo_producto_fachada" as any) as string) || "";
    if (!tipo) return;

    const precioM2 = Number(getConfigVal(configs, "precio_m2_fachada")) || 50000;
    const precioMl = Number(getConfigVal(configs, "precio_ml_bandeja")) || 110000;
    const precioGestoria = Number(getConfigVal(configs, "precio_gestoria_permiso")) || 250000;
    const precioIngenieria = Number(getConfigVal(configs, "precio_ingenieria")) || 1250000;
    const precioSyh = Number(getConfigVal(configs, "precio_syh_jornada")) || 250000;

    let multiplicadorTotal = 1;
    try {
      const multJson = getConfigVal(configs, "multiplicadores_comerciales");
      if (multJson) {
        const mults = JSON.parse(multJson);
        const perfil = (watch("metadata.tipo_cliente_perfil" as any) as string) || "";
        if (perfil && mults[perfil]) multiplicadorTotal *= mults[perfil];
        const competencia = watch("metadata.hay_competencia" as any) as boolean;
        if (competencia && mults.hay_competencia) multiplicadorTotal *= mults.hay_competencia;
        const etapa = (watch("metadata.etapa_cliente" as any) as string) || "";
        if (etapa && mults[etapa]) multiplicadorTotal *= mults[etapa];
      }
    } catch { /* use default */ }

    const base = (watch("metadata.fachada_base" as any) as number) || 0;
    const altura = (watch("metadata.fachada_altura" as any) as number) || 0;
    const m2 = base * altura;
    const ml = (watch("metadata.metros_lineales" as any) as number) || 0;
    const plazo = watch("plazo_alquiler_meses") || 1;

    const items: CotizacionItemFormData[] = [];

    // Cálculo: total = cantidad × precio_unitario × multiplicador
    // Desglose: 35% canon locativo (mínimo 30 días), 32.5% montaje, 32.5% desarme
    // Fracción mínima de alquiler: 30 días. Si plazo > 30, se calcula proporcional.
    const periodos = plazo <= 30 ? 1 : Math.ceil(plazo / 30);

    if (tipo === "andamio_completo" && m2 > 0) {
      const valorTotal = Math.round(m2 * precioM2 * multiplicadorTotal);
      const canonLocativo = Math.round(valorTotal * 0.35);
      const montaje = Math.round(valorTotal * 0.325);
      const desarme = Math.round(valorTotal * 0.325);

      items.push({
        tipo: "alquiler_mensual",
        concepto: `Canon locativo - ${m2} m² (${periodos > 1 ? `${periodos} períodos de 30 días` : "30 días"})`,
        cantidad: periodos,
        unidad: "período",
        precio_unitario: canonLocativo,
      });
      if (watch("incluye_montaje")) {
        items.push({ tipo: "montaje", concepto: `Mano de obra montaje - ${m2} m²`, cantidad: 1, unidad: "servicio", precio_unitario: montaje });
      }
      if (watch("incluye_desarme")) {
        items.push({ tipo: "desarme", concepto: `Mano de obra desarme - ${m2} m²`, cantidad: 1, unidad: "servicio", precio_unitario: desarme });
      }
    } else if (tipo === "bandeja_peatonal" && ml > 0) {
      const valorTotal = Math.round(ml * precioMl * multiplicadorTotal);
      const canonLocativo = Math.round(valorTotal * 0.35);
      const montaje = Math.round(valorTotal * 0.325);
      const desarme = Math.round(valorTotal * 0.325);

      items.push({
        tipo: "alquiler_mensual",
        concepto: `Canon locativo bandeja peatonal - ${ml} ml (${periodos > 1 ? `${periodos} períodos de 30 días` : "30 días"})`,
        cantidad: periodos,
        unidad: "período",
        precio_unitario: canonLocativo,
      });
      if (watch("incluye_montaje")) {
        items.push({ tipo: "montaje", concepto: `Mano de obra montaje - ${ml} ml`, cantidad: 1, unidad: "servicio", precio_unitario: montaje });
      }
      if (watch("incluye_desarme")) {
        items.push({ tipo: "desarme", concepto: `Mano de obra desarme - ${ml} ml`, cantidad: 1, unidad: "servicio", precio_unitario: desarme });
      }
    }

    // Transporte: $0 (incluido, se agrega manual si es lejos)
    if (watch("incluye_transporte")) {
      items.push({ tipo: "transporte", concepto: "Transporte (incluido)", cantidad: 1, unidad: "servicio", precio_unitario: 0 });
    }
    if (watch("metadata.incluye_ingenieria" as any)) {
      items.push({ tipo: "ingenieria", concepto: "Ingeniería - Memoria de cálculo, planos, firma profesional", cantidad: 1, unidad: "servicio", precio_unitario: precioIngenieria });
    }
    if (watch("metadata.incluye_permiso" as any)) {
      items.push({ tipo: "permiso", concepto: "Gestoría permiso municipal", cantidad: 1, unidad: "servicio", precio_unitario: precioGestoria });
    }
    if (watch("metadata.incluye_syh" as any)) {
      items.push({ tipo: "extra", concepto: "Seguridad e Higiene - Técnico por jornada", cantidad: 1, unidad: "jornada", precio_unitario: precioSyh });
    }

    setValue("items", items, { shouldDirty: true });
  }, [watch, setValue, configs]);

  // Default condicion de pago from config
  const condicionPagoDefault = getConfigVal(configs, "condicion_pago_default") || "50% anticipo, 50% finalización montaje";
  const validezDefault = getConfigVal(configs, "validez_oferta_dias") || "15";

  return (
    <div className="space-y-6">
      {/* 1. Título + Cliente + Oportunidad */}
      <TituloClienteFields />

      {/* 2. Datos comerciales (incluye ubicación con mapa) */}
      <FormDatosComerciales />

      {/* 3. Tareas del cliente */}
      <div className="space-y-2">
        <Label>Tareas que debe realizar el cliente</Label>
        <Textarea
          {...register("metadata.tareas_cliente" as any)}
          rows={2}
          placeholder="Ej: Pintura de frente completo, restauración de balcones, limpieza de fachada..."
          data-field="tareas_cliente"
        />
      </div>

      {/* 3.5. Tiempo estimado de trabajo */}
      <div className="space-y-2">
        <Label>Tiempo estimado de trabajo del cliente (días)</Label>
        <Input
          type="number"
          min={1}
          {...register("plazo_alquiler_meses", { valueAsNumber: true })}
          placeholder="Ej: 30"
          data-field="plazo_alquiler_meses"
        />
      </div>

      {/* 4. Información técnica */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Información técnica
        </h3>
        <div className="grid grid-cols-2 gap-3">
          {TIPO_PRODUCTO.map((tipo) => (
            <button
              key={tipo.key}
              type="button"
              className={cn(
                "rounded-lg border p-4 text-left transition-all hover:border-primary/50",
                tipoProducto === tipo.key
                  ? "border-primary ring-2 ring-primary/20"
                  : "border-border"
              )}
              onClick={() => setValue("metadata.tipo_producto_fachada" as any, tipo.key)}
            >
              <p className="font-medium text-sm">{tipo.title}</p>
              <p className="text-xs text-muted-foreground mt-1">{tipo.description}</p>
            </button>
          ))}
        </div>

        {tipoProducto === "andamio_completo" && (
          <div className="space-y-4 rounded-lg border p-4">
            <p className="text-xs font-medium text-muted-foreground">Andamio completo — Precio por m²</p>
            {/* Dimensiones */}
            <div className="grid grid-cols-4 gap-3">
              <div className="space-y-2">
                <Label>Base / Frente (m)</Label>
                <Input type="number" step="0.1" min={0} {...register("metadata.fachada_base" as any, { valueAsNumber: true })} placeholder="Ej: 15" />
              </div>
              <div className="space-y-2">
                <Label>Altura (m)</Label>
                <Input type="number" step="0.1" min={0} {...register("metadata.fachada_altura" as any, { valueAsNumber: true })} placeholder="Ej: 12" />
              </div>
              <div className="space-y-2">
                <Label>Profundidad (m)</Label>
                <Input type="number" step="0.1" min={0} {...register("metadata.fachada_profundidad" as any, { valueAsNumber: true })} placeholder="Ej: 1.5" />
              </div>
              <div className="space-y-2">
                <Label>m² totales</Label>
                <Input type="number" step="0.1" value={((watch("metadata.fachada_base" as any) as number) || 0) * ((watch("metadata.fachada_altura" as any) as number) || 0) || ""} readOnly className="bg-muted" />
              </div>
            </div>
            {/* Tipo edificio + pisos + niveles */}
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label>Tipo de edificio</Label>
                <Select value={(watch("metadata.tipo_edificio" as any) as string) || ""} onValueChange={(val) => setValue("metadata.tipo_edificio" as any, val)}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="edificio_estandar">Edificio estándar</SelectItem>
                    <SelectItem value="edificio_propiedad_horizontal">Edificio PH</SelectItem>
                    <SelectItem value="casa">Casa</SelectItem>
                    <SelectItem value="ph">PH</SelectItem>
                    <SelectItem value="comercial">Local comercial</SelectItem>
                    <SelectItem value="industrial">Nave industrial</SelectItem>
                    <SelectItem value="otro">Otro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Pisos</Label>
                <Input type="number" min={1} {...register("metadata.pisos" as any, { valueAsNumber: true })} placeholder="Ej: 8" />
              </div>
              <div className="space-y-2">
                <Label>Niveles de trabajo</Label>
                <Input type="number" min={1} {...register("metadata.niveles_trabajo" as any, { valueAsNumber: true })} placeholder="Ej: 4" />
              </div>
            </div>
            {/* Sistema y escalera */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Tipo de material / Sistema</Label>
                <Select value={(watch("metadata.tipo_material" as any) as string) || ""} onValueChange={(val) => setValue("metadata.tipo_material" as any, val)}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="multidireccional">Multidireccional</SelectItem>
                    <SelectItem value="bastidor_prearmado">Bastidor pre-armado</SelectItem>
                    <SelectItem value="mixto">Mixto</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Tipo de escalera</Label>
                <Select value={(watch("metadata.tipo_escalera" as any) as string) || ""} onValueChange={(val) => setValue("metadata.tipo_escalera" as any, val)}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="escotilla">Escalera escotilla</SelectItem>
                    <SelectItem value="interna">Escalera interna</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {/* Checks de seguridad */}
            <div className="flex gap-6">
              <div className="flex items-center gap-2">
                <Switch checked={!!(watch("metadata.barandas_seguridad" as any) as boolean)} onCheckedChange={(v) => setValue("metadata.barandas_seguridad" as any, v)} />
                <Label className="text-sm">Barandas de seguridad</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={!!(watch("metadata.rodapies" as any) as boolean)} onCheckedChange={(v) => setValue("metadata.rodapies" as any, v)} />
                <Label className="text-sm">Rodapiés</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={!!(watch("metadata.alambre_concertina" as any) as boolean)} onCheckedChange={(v) => setValue("metadata.alambre_concertina" as any, v)} />
                <Label className="text-sm">Alambre concertina</Label>
              </div>
            </div>
          </div>
        )}

        {tipoProducto === "bandeja_peatonal" && (
          <div className="space-y-4 rounded-lg border p-4">
            <p className="text-xs font-medium text-muted-foreground">Bandeja peatonal — Precio por metro lineal</p>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label>Metros lineales *</Label>
                <Input type="number" step="0.1" min={0} {...register("metadata.metros_lineales" as any, { valueAsNumber: true })} placeholder="Ej: 20" />
              </div>
              <div className="space-y-2">
                <Label>Altura bandeja (m)</Label>
                <Input type="number" step="0.1" min={0} {...register("metadata.altura_bandeja" as any, { valueAsNumber: true })} placeholder="Ej: 3.5" />
              </div>
              <div className="space-y-2">
                <Label>Profundidad (m)</Label>
                <Input type="number" step="0.1" min={0} {...register("metadata.bandeja_profundidad" as any, { valueAsNumber: true })} placeholder="Ej: 2.5" />
              </div>
            </div>
            {/* Sistema y escalera */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Tipo de material / Sistema</Label>
                <Select value={(watch("metadata.tipo_material" as any) as string) || ""} onValueChange={(val) => setValue("metadata.tipo_material" as any, val)}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="multidireccional">Multidireccional</SelectItem>
                    <SelectItem value="bastidor_prearmado">Bastidor pre-armado</SelectItem>
                    <SelectItem value="mixto">Mixto</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Niveles de contención</Label>
                <Input type="number" min={1} {...register("metadata.niveles_contencion" as any, { valueAsNumber: true })} placeholder="Ej: 2" />
              </div>
            </div>
            {/* Checks */}
            <div className="flex gap-6">
              <div className="flex items-center gap-2">
                <Switch checked={!!(watch("metadata.barandas_seguridad" as any) as boolean)} onCheckedChange={(v) => setValue("metadata.barandas_seguridad" as any, v)} />
                <Label className="text-sm">Barandas de seguridad</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={!!(watch("metadata.rodapies" as any) as boolean)} onCheckedChange={(v) => setValue("metadata.rodapies" as any, v)} />
                <Label className="text-sm">Rodapiés</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={!!(watch("metadata.alambre_concertina" as any) as boolean)} onCheckedChange={(v) => setValue("metadata.alambre_concertina" as any, v)} />
                <Label className="text-sm">Alambre concertina</Label>
              </div>
            </div>
          </div>
        )}

        {/* Servicios incluidos — dentro de info técnica */}
        <ServiceToggles />

        {/* Tiempos de armado y desarme */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Tiempo de armado (jornadas)</Label>
            <Input
              type="number"
              step="0.5"
              min={0}
              {...register("metadata.tiempo_armado" as any, { valueAsNumber: true })}
              placeholder="Ej: 1.5"
            />
          </div>
          <div className="space-y-2">
            <Label>Tiempo de desarme (jornadas)</Label>
            <Input
              type="number"
              step="0.5"
              min={0}
              {...register("metadata.tiempo_desarme" as any, { valueAsNumber: true })}
              placeholder="Ej: 1"
            />
          </div>
        </div>

        {/* Descripción técnica del servicio */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Descripción técnica del servicio</Label>
            <AIImproveButton
              currentText={(watch("metadata.descripcion_tecnica" as any) as string) || ""}
              fieldName="descripcion tecnica"
              context={watch() as Record<string, unknown>}
              onAccept={(text) => setValue("metadata.descripcion_tecnica" as any, text)}
              label="Generar redacción"
              allowEmpty
            />
          </div>
          <Textarea
            {...register("metadata.descripcion_tecnica" as any)}
            rows={4}
            placeholder="Detalle técnico: dimensiones, sistema de andamio, niveles de contención, materiales..."
            data-field="descripcion_tecnica"
          />
        </div>

        {/* Imágenes de referencia */}
        <ImageSelector
          categoria="fachadas"
          selectedIds={((watch("metadata.imagenes_ids" as any) as string[]) || [])}
          onSelectionChange={(ids) => setValue("metadata.imagenes_ids" as any, ids)}
        />
      </div>

      {/* 6.5 Botón calcular items */}
      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={handleGenerateItems}
        disabled={!tipoProducto}
      >
        <Calculator className="mr-2 h-4 w-4" />
        Calcular items recomendados
      </Button>

      {/* 7. Condiciones comerciales */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Condiciones comerciales
        </h3>

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label>Precios incluyen IVA</Label>
            <p className="text-xs text-muted-foreground">Si está desactivado, los precios son + IVA</p>
          </div>
          <Switch
            checked={!!(watch("metadata.incluye_iva" as any) as boolean)}
            onCheckedChange={(v) => setValue("metadata.incluye_iva" as any, v)}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Condición de pago</Label>
            <Input
              {...register("condicion_pago")}
              placeholder={condicionPagoDefault}
              data-field="condicion_pago"
            />
          </div>
          <div className="space-y-2">
            <Label>Validez de la oferta (días)</Label>
            <Input
              type="number"
              min={1}
              {...register("metadata.validez_oferta_dias" as any, { valueAsNumber: true })}
              placeholder={validezDefault}
              data-field="validez_oferta_dias"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Condiciones generales</Label>
          <Textarea
            {...register("condiciones")}
            rows={3}
            placeholder="Condiciones del servicio..."
            data-field="condiciones"
          />
        </div>
      </div>

      {/* Ubicación ya está en FormDatosComerciales */}
    </div>
  );
}
