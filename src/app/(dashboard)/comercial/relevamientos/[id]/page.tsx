"use client";

import { use } from "react";
import { useRelevamiento, useUpdateRelevamiento } from "@/hooks/use-relevamientos";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate, formatDateTime } from "@/lib/utils/formatters";
import { AlertTriangle, CheckCircle, ArrowRight, ChevronDown } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

const ESTADO_TRANSITIONS: Record<string, string[]> = {
  pendiente: ["agendado", "cancelado"],
  agendado: ["realizado", "cancelado"],
  realizado: [],
  cancelado: [],
};
const ESTADO_LABELS: Record<string, string> = {
  pendiente: "Pendiente", agendado: "Agendado", realizado: "Realizado", cancelado: "Cancelado",
};

export default function RelevamientoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: rel, isLoading } = useRelevamiento(id);
  const updateRel = useUpdateRelevamiento();

  if (isLoading || !rel) return <div className="space-y-6"><Skeleton className="h-10 w-64" /><Skeleton className="h-64 w-full" /></div>;

  const transitions = ESTADO_TRANSITIONS[rel.estado] || [];

  return (
    <div className="space-y-6">
      <PageHeader title={rel.direccion || "Relevamiento"}>
        <StatusBadge status={rel.estado} />
        {transitions.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" />}>Estado<ChevronDown className="ml-2 h-4 w-4" /></DropdownMenuTrigger>
            <DropdownMenuContent>
              {transitions.map((s) => (
                <DropdownMenuItem key={s} onClick={() => updateRel.mutate({ id, data: { estado: s } as any }, { onSuccess: () => toast.success(`Cambiado a ${ESTADO_LABELS[s]}`) })}>
                  <ArrowRight className="mr-2 h-4 w-4" />{ESTADO_LABELS[s]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </PageHeader>

      {rel.oportunidades && (
        <Badge variant="outline" className="text-xs">
          Oportunidad: {rel.oportunidades.codigo} — {rel.oportunidades.titulo}
        </Badge>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Ubicacion</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <InfoRow label="Direccion" value={rel.direccion} />
            <InfoRow label="Localidad" value={rel.localidad} />
            <InfoRow label="Provincia" value={rel.provincia} />
            <InfoRow label="Contacto" value={rel.contacto_nombre} />
            <InfoRow label="Telefono contacto" value={rel.contacto_telefono} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Datos del sitio</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <InfoRow label="Tipo edificio" value={rel.tipo_edificio} />
            <InfoRow label="Pisos" value={rel.cantidad_pisos ? String(rel.cantidad_pisos) : null} />
            <InfoRow label="Altura estimada" value={rel.altura_estimada ? `${rel.altura_estimada}m` : null} />
            <InfoRow label="Metros lineales" value={rel.metros_lineales ? `${rel.metros_lineales}m` : null} />
            <InfoRow label="Superficie fachada" value={rel.superficie_fachada ? `${rel.superficie_fachada}m2` : null} />
            <InfoRow label="Sistema recomendado" value={rel.sistema_recomendado} capitalize />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Condiciones</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <InfoRow label="Tipo acceso" value={rel.tipo_acceso} />
            <InfoRow label="Tipo suelo" value={rel.tipo_suelo} />
            <InfoRow label="Interferencias" value={rel.interferencias} />
            <InfoRow label="Restriccion horaria" value={rel.horario_restriccion} />
            <InfoRow label="Tipo montaje" value={rel.tipo_montaje} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Requerimientos</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <BoolRow label="Permiso municipal" value={rel.requiere_permiso_municipal} />
            <BoolRow label="Proteccion peatonal" value={rel.requiere_proteccion_peatonal} />
            <BoolRow label="Red de seguridad" value={rel.requiere_red_seguridad} />
            <BoolRow label="Anclajes especiales" value={rel.anclajes_especiales} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Fechas</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <InfoRow label="Programado" value={formatDateTime(rel.fecha_programada)} />
          <InfoRow label="Realizado" value={formatDateTime(rel.fecha_realizada)} />
          <InfoRow label="Creado" value={formatDateTime(rel.created_at)} />
        </CardContent>
      </Card>

      {rel.observaciones_tecnicas && (
        <Card>
          <CardHeader><CardTitle className="text-base">Observaciones tecnicas</CardTitle></CardHeader>
          <CardContent><p className="text-sm whitespace-pre-wrap">{rel.observaciones_tecnicas}</p></CardContent>
        </Card>
      )}

      {rel.observaciones && (
        <Card>
          <CardHeader><CardTitle className="text-base">Observaciones generales</CardTitle></CardHeader>
          <CardContent><p className="text-sm text-muted-foreground whitespace-pre-wrap">{rel.observaciones}</p></CardContent>
        </Card>
      )}
    </div>
  );
}

function InfoRow({ label, value, capitalize = false }: { label: string; value: string | null | undefined; capitalize?: boolean }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-medium ${capitalize ? "capitalize" : ""}`}>{value || "—"}</span>
    </div>
  );
}

function BoolRow({ label, value }: { label: string; value: boolean }) {
  return (
    <div className="flex justify-between text-sm items-center">
      <span className="text-muted-foreground">{label}</span>
      {value ? (
        <Badge variant="outline" className="bg-yellow-500/15 text-yellow-400 border-yellow-500/25">
          <AlertTriangle className="mr-1 h-3 w-3" />Si
        </Badge>
      ) : (
        <Badge variant="outline" className="bg-emerald-500/15 text-emerald-400 border-emerald-500/25">
          <CheckCircle className="mr-1 h-3 w-3" />No
        </Badge>
      )}
    </div>
  );
}
