"use client";

import { use } from "react";
import { useProyecto, useUpdateProyecto } from "@/hooks/use-proyectos";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { formatDate } from "@/lib/utils/formatters";
import { ArrowRight, ChevronDown } from "lucide-react";
import { toast } from "sonner";

const ESTADO_TRANSITIONS: Record<string, string[]> = {
  pendiente: ["en_curso", "cancelado"],
  en_curso: ["en_revision", "cancelado"],
  en_revision: ["aprobado", "requiere_cambios"],
  requiere_cambios: ["en_curso", "cancelado"],
  aprobado: [],
  cancelado: [],
};

const ESTADO_LABELS: Record<string, string> = {
  pendiente: "Pendiente",
  en_curso: "En curso",
  en_revision: "En revision",
  aprobado: "Aprobado",
  requiere_cambios: "Requiere cambios",
  cancelado: "Cancelado",
};

export default function ProyectoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: proyecto, isLoading } = useProyecto(id);
  const updateProyecto = useUpdateProyecto();

  if (isLoading || !proyecto) {
    return <div className="space-y-6"><Skeleton className="h-10 w-64" /><Skeleton className="h-64 w-full" /></div>;
  }

  const transitions = ESTADO_TRANSITIONS[proyecto.estado] || [];

  function handleChangeState(newState: string) {
    updateProyecto.mutate(
      { id, data: { estado: newState } },
      {
        onSuccess: () => toast.success(`Estado cambiado a ${ESTADO_LABELS[newState]}`),
        onError: () => toast.error("Error al cambiar estado"),
      }
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title={`Proyecto ${proyecto.codigo}`}>
        <StatusBadge status={proyecto.estado} />
        {transitions.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" />}>
              Cambiar estado <ChevronDown className="ml-2 h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {transitions.map((state) => (
                <DropdownMenuItem key={state} onClick={() => handleChangeState(state)}>
                  <ArrowRight className="mr-2 h-4 w-4" />{ESTADO_LABELS[state]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </PageHeader>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Datos del proyecto</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <InfoRow label="Obra" value={proyecto.obras ? `${proyecto.obras.codigo} — ${proyecto.obras.nombre}` : "—"} />
            <InfoRow label="Tecnico" value={proyecto.user_profiles ? `${proyecto.user_profiles.nombre} ${proyecto.user_profiles.apellido}` : "Sin asignar"} />
            <InfoRow label="Sistema" value={proyecto.tipo_sistema_andamio} />
            <InfoRow label="Version" value={String(proyecto.version)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Medidas y fechas</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <InfoRow label="Altura maxima" value={proyecto.altura_maxima ? `${proyecto.altura_maxima}m` : null} />
            <InfoRow label="Metros lineales" value={proyecto.metros_lineales ? `${proyecto.metros_lineales}m` : null} />
            <InfoRow label="Superficie" value={proyecto.superficie ? `${proyecto.superficie}m2` : null} />
            <InfoRow label="Solicitud" value={formatDate(proyecto.fecha_solicitud)} />
            <InfoRow label="Entrega estimada" value={formatDate(proyecto.fecha_entrega_estimada)} />
            <InfoRow label="Entrega real" value={formatDate(proyecto.fecha_entrega_real)} />
            <InfoRow label="Aprobacion" value={formatDate(proyecto.fecha_aprobacion)} />
          </CardContent>
        </Card>

        {proyecto.observaciones_tecnicas && (
          <Card className="md:col-span-2">
            <CardHeader><CardTitle className="text-base">Observaciones tecnicas</CardTitle></CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{proyecto.observaciones_tecnicas}</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium capitalize">{value || "—"}</span>
    </div>
  );
}
