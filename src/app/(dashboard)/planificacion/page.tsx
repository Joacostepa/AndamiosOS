"use client";

import { useState } from "react";
import { useTareas, useCreateTarea, useUpdateTarea, type TareaFormData } from "@/hooks/use-planificacion";
import { useObras } from "@/hooks/use-obras";
import { usePersonal } from "@/hooks/use-personal";
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
import { Plus, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { format, addDays, startOfWeek, isSameDay } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import { useForm } from "react-hook-form";

const TIPO_COLORS: Record<string, string> = {
  montaje: "bg-blue-500/15 text-blue-400 border-blue-500/25",
  desarme: "bg-orange-500/15 text-orange-400 border-orange-500/25",
  entrega: "bg-green-500/15 text-green-400 border-green-500/25",
  retiro: "bg-yellow-500/15 text-yellow-400 border-yellow-500/25",
  visita_tecnica: "bg-purple-500/15 text-purple-400 border-purple-500/25",
  inspeccion: "bg-cyan-500/15 text-cyan-400 border-cyan-500/25",
  otro: "bg-zinc-500/15 text-zinc-400 border-zinc-500/25",
};

const TIPO_LABELS: Record<string, string> = {
  montaje: "Montaje",
  desarme: "Desarme",
  entrega: "Entrega",
  retiro: "Retiro",
  visita_tecnica: "Visita tecnica",
  inspeccion: "Inspeccion",
  otro: "Otro",
};

export default function PlanificacionPage() {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const { data: tareas, isLoading } = useTareas();
  const { data: obras } = useObras();
  const createTarea = useCreateTarea();
  const updateTarea = useUpdateTarea();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>("");

  const { register, handleSubmit, reset, setValue, watch } = useForm<TareaFormData>();

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  function onSubmit(data: TareaFormData) {
    createTarea.mutate(data, {
      onSuccess: () => {
        toast.success("Tarea creada");
        setDrawerOpen(false);
        reset();
      },
      onError: () => toast.error("Error al crear tarea"),
    });
  }

  function openNewTarea(date: Date) {
    setSelectedDate(format(date, "yyyy-MM-dd"));
    setValue("fecha_programada", format(date, "yyyy-MM-dd"));
    setDrawerOpen(true);
  }

  if (isLoading) {
    return <div className="space-y-6"><Skeleton className="h-10 w-48" /><Skeleton className="h-96 w-full" /></div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Planificacion" description="Calendario operativo semanal">
        <Button onClick={() => { setSelectedDate(""); reset(); setDrawerOpen(true); }}>
          <Plus className="mr-2 h-4 w-4" />Nueva tarea
        </Button>
      </PageHeader>

      {/* Week navigation */}
      <div className="flex items-center justify-between">
        <Button variant="outline" size="sm" onClick={() => setWeekStart(addDays(weekStart, -7))}>
          <ChevronLeft className="h-4 w-4 mr-1" />Anterior
        </Button>
        <h2 className="text-lg font-semibold">
          {format(weekStart, "d MMM", { locale: es })} — {format(addDays(weekStart, 6), "d MMM yyyy", { locale: es })}
        </h2>
        <Button variant="outline" size="sm" onClick={() => setWeekStart(addDays(weekStart, 7))}>
          Siguiente<ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </div>

      {/* Week grid */}
      <div className="grid grid-cols-7 gap-2">
        {weekDays.map((day) => {
          const dayStr = format(day, "yyyy-MM-dd");
          const dayTareas = tareas?.filter((t) => t.fecha_programada === dayStr) || [];
          const isToday = isSameDay(day, new Date());

          return (
            <Card key={dayStr} className={isToday ? "border-primary/50" : ""}>
              <CardHeader className="p-3 pb-1">
                <div className="flex items-center justify-between">
                  <CardTitle className={`text-xs uppercase ${isToday ? "text-primary" : "text-muted-foreground"}`}>
                    {format(day, "EEE", { locale: es })}
                  </CardTitle>
                  <span className={`text-lg font-bold ${isToday ? "text-primary" : ""}`}>
                    {format(day, "d")}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="p-2 space-y-1 min-h-[120px]">
                {dayTareas.map((tarea) => (
                  <div
                    key={tarea.id}
                    className="rounded-md border p-2 text-xs space-y-1 cursor-pointer hover:bg-muted/50"
                    onClick={() => {
                      updateTarea.mutate(
                        { id: tarea.id, data: { estado: tarea.estado === "planificada" ? "confirmada" : tarea.estado === "confirmada" ? "completada" : tarea.estado } },
                        { onSuccess: () => toast.success("Estado actualizado") }
                      );
                    }}
                  >
                    <Badge variant="outline" className={`text-[10px] ${TIPO_COLORS[tarea.tipo] || TIPO_COLORS.otro}`}>
                      {TIPO_LABELS[tarea.tipo] || tarea.tipo}
                    </Badge>
                    <p className="font-medium truncate">{tarea.obras?.nombre}</p>
                    {tarea.hora_inicio && (
                      <p className="text-muted-foreground">{tarea.hora_inicio.slice(0, 5)}</p>
                    )}
                    <StatusBadge status={tarea.estado} className="text-[10px]" />
                  </div>
                ))}
                <Button variant="ghost" size="sm" className="w-full h-6 text-xs text-muted-foreground" onClick={() => openNewTarea(day)}>
                  + Agregar
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent className="overflow-y-auto">
          <SheetHeader><SheetTitle>Nueva tarea</SheetTitle></SheetHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label>Tipo *</Label>
              <Select value={watch("tipo") || ""} onValueChange={(val) => val && setValue("tipo", val)}>
                <SelectTrigger><SelectValue placeholder="Tipo de tarea..." /></SelectTrigger>
                <SelectContent>
                  {Object.entries(TIPO_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Obra *</Label>
              <Select value={watch("obra_id") || ""} onValueChange={(val) => val && setValue("obra_id", val)}>
                <SelectTrigger><SelectValue placeholder="Seleccionar obra..." /></SelectTrigger>
                <SelectContent>
                  {obras?.map((o) => (
                    <SelectItem key={o.id} value={o.id}>{o.codigo} — {o.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Fecha *</Label>
              <Input type="date" {...register("fecha_programada", { required: true })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Hora inicio</Label>
                <Input type="time" {...register("hora_inicio")} />
              </div>
              <div className="space-y-2">
                <Label>Hora fin est.</Label>
                <Input type="time" {...register("hora_fin_estimada")} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Prioridad</Label>
              <Select value={watch("prioridad") || "normal"} onValueChange={(val) => val && setValue("prioridad", val)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="urgente">Urgente</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Observaciones</Label>
              <Textarea {...register("observaciones")} rows={2} />
            </div>
            <div className="flex justify-end pt-4">
              <Button type="submit" disabled={createTarea.isPending}>
                {createTarea.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Crear tarea
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}
