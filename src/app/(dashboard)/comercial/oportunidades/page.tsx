"use client";

import { useState } from "react";
import { useOportunidades, useCreateOportunidad, type Oportunidad } from "@/hooks/use-oportunidades";
import { useClientes } from "@/hooks/use-clientes";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatRelativeDate } from "@/lib/utils/formatters";
import { Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import Link from "next/link";

const PIPELINE_STATES = [
  { key: "lead", label: "Lead", color: "text-zinc-400" },
  { key: "contactado", label: "Contactado", color: "text-blue-400" },
  { key: "relevamiento", label: "Relevamiento", color: "text-purple-400" },
  { key: "cotizado", label: "Cotizado", color: "text-yellow-400" },
  { key: "negociacion", label: "Negociacion", color: "text-orange-400" },
  { key: "ganado", label: "Ganado", color: "text-green-400" },
  { key: "perdido", label: "Perdido", color: "text-red-400" },
];

const TIPO_LABELS: Record<string, string> = {
  empresa_constructora: "Constructora", industria: "Industria", gobierno_publico: "Gobierno",
  particular: "Particular", consorcio: "Consorcio", evento: "Evento", otro: "Otro",
};

const PERFIL_LABELS: Record<string, string> = {
  busca_precio: "Busca precio", busca_profesionalismo: "Busca profesionalismo",
  busca_velocidad: "Busca velocidad", busca_seguridad: "Busca seguridad",
};

const SITUACION_LABELS: Record<string, string> = {
  consulta_inicial: "Consulta inicial", en_licitacion: "En licitacion", obra_ganada: "Obra ganada",
  proyecto_en_desarrollo: "Proyecto en desarrollo", urgencia: "Urgencia", mantenimiento: "Mantenimiento",
};

export default function OportunidadesPage() {
  const { data: oportunidades, isLoading } = useOportunidades();
  const { data: clientes } = useClientes();
  const createOportunidad = useCreateOportunidad();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const { register, handleSubmit, reset, setValue, watch } = useForm<Partial<Oportunidad>>({
    defaultValues: { tipo_cliente: "otro", perfil_decision: "busca_precio", situacion: "consulta_inicial", relacion: "nuevo", tamano: "mediano", poder_decision: "decide_solo", rango_presupuesto: "mediano", probabilidad: 50, origen: "directo" },
  });

  function onSubmit(data: Partial<Oportunidad>) {
    createOportunidad.mutate(data, {
      onSuccess: () => { toast.success("Oportunidad creada"); setDrawerOpen(false); reset(); },
      onError: () => toast.error("Error al crear"),
    });
  }

  if (isLoading) return <div className="space-y-6"><Skeleton className="h-10 w-48" /><Skeleton className="h-96 w-full" /></div>;

  return (
    <div className="space-y-6">
      <PageHeader title="Pipeline Comercial" description="Oportunidades y seguimiento">
        <Button onClick={() => setDrawerOpen(true)}><Plus className="mr-2 h-4 w-4" />Nueva oportunidad</Button>
      </PageHeader>

      {/* Kanban board */}
      <div className="flex gap-3 overflow-x-auto pb-4">
        {PIPELINE_STATES.map((stage) => {
          const stageOps = oportunidades?.filter((o) => o.estado === stage.key) || [];
          return (
            <div key={stage.key} className="min-w-[280px] flex-shrink-0">
              <div className="flex items-center justify-between mb-2 px-1">
                <h3 className={`text-sm font-semibold ${stage.color}`}>{stage.label}</h3>
                <Badge variant="outline" className="text-xs">{stageOps.length}</Badge>
              </div>
              <div className="space-y-2 min-h-[200px]">
                {stageOps.map((op) => (
                  <Link key={op.id} href={`/comercial/oportunidades/${op.id}`}>
                    <Card className="hover:border-primary/50 transition-colors cursor-pointer">
                      <CardContent className="p-3 space-y-2">
                        <div className="flex items-start justify-between">
                          <p className="font-medium text-sm leading-tight">{op.titulo}</p>
                          <span className="font-mono text-[10px] text-muted-foreground shrink-0 ml-2">{op.codigo}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {op.clientes?.razon_social || op.cliente_nombre || "Sin cliente"}
                        </p>
                        <div className="flex items-center justify-between">
                          {op.monto_estimado && (
                            <span className="text-xs font-semibold text-primary">
                              ${Number(op.monto_estimado).toLocaleString()}
                            </span>
                          )}
                          <span className="text-[10px] text-muted-foreground">{formatRelativeDate(op.created_at)}</span>
                        </div>
                        <div className="flex gap-1 flex-wrap">
                          <Badge variant="outline" className="text-[10px]">{TIPO_LABELS[op.tipo_cliente] || op.tipo_cliente}</Badge>
                          <Badge variant="outline" className="text-[10px]">{SITUACION_LABELS[op.situacion] || op.situacion}</Badge>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Drawer nueva oportunidad */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent className="overflow-y-auto sm:max-w-xl">
          <SheetHeader><SheetTitle>Nueva oportunidad</SheetTitle></SheetHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4">
            <div className="space-y-2"><Label>Titulo *</Label><Input {...register("titulo", { required: true })} placeholder="Ej: Andamio fachada edificio Belgrano" /></div>

            <div className="space-y-2">
              <Label>Cliente existente</Label>
              <Select value={watch("cliente_id") || ""} onValueChange={(val) => val && setValue("cliente_id", val)}>
                <SelectTrigger><SelectValue placeholder="Seleccionar o dejar vacio para nuevo..." /></SelectTrigger>
                <SelectContent>{clientes?.map((c) => <SelectItem key={c.id} value={c.id}>{c.razon_social}</SelectItem>)}</SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Nombre contacto</Label><Input {...register("cliente_nombre")} placeholder="Si es nuevo..." /></div>
              <div className="space-y-2"><Label>Telefono</Label><Input {...register("cliente_telefono")} /></div>
            </div>

            <p className="text-sm font-medium text-muted-foreground pt-2">Categorizacion</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tipo de cliente</Label>
                <Select value={watch("tipo_cliente") || "otro"} onValueChange={(val) => val && setValue("tipo_cliente", val as Oportunidad["tipo_cliente"])}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(TIPO_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Perfil de decision</Label>
                <Select value={watch("perfil_decision") || "busca_precio"} onValueChange={(val) => val && setValue("perfil_decision", val as Oportunidad["perfil_decision"])}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(PERFIL_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Situacion</Label>
                <Select value={watch("situacion") || "consulta_inicial"} onValueChange={(val) => val && setValue("situacion", val as Oportunidad["situacion"])}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(SITUACION_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Relacion</Label>
                <Select value={watch("relacion") || "nuevo"} onValueChange={(val) => val && setValue("relacion", val as Oportunidad["relacion"])}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nuevo">Nuevo</SelectItem><SelectItem value="recurrente">Recurrente</SelectItem>
                    <SelectItem value="referido">Referido</SelectItem><SelectItem value="ex_cliente">Ex-cliente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Monto estimado ($)</Label><Input type="number" step="0.01" {...register("monto_estimado", { valueAsNumber: true })} /></div>
              <div className="space-y-2"><Label>Zona</Label><Input {...register("zona")} placeholder="CABA, GBA Norte..." /></div>
            </div>

            <div className="space-y-2"><Label>Descripcion</Label><Textarea {...register("descripcion")} rows={3} placeholder="Detalle de lo que necesita..." /></div>
            <div className="space-y-2"><Label>Origen</Label><Input {...register("origen")} placeholder="Recomendacion, web, llamada..." /></div>

            <div className="flex justify-end pt-4">
              <Button type="submit" disabled={createOportunidad.isPending}>
                {createOportunidad.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Crear oportunidad
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}
