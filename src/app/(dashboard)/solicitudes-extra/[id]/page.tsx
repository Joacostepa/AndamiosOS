"use client";

import { use } from "react";
import { useSolicitudExtra, useUpdateSolicitudExtra } from "@/hooks/use-solicitudes-extra";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { formatRelativeDate } from "@/lib/utils/formatters";
import { Check, X } from "lucide-react";
import { toast } from "sonner";

const MOTIVO_LABELS: Record<string, string> = {
  error_computo: "Error en computo", cambio_alcance: "Cambio de alcance",
  reemplazo_danado: "Reemplazo danado", otro: "Otro",
};

const URGENCIA_COLORS: Record<string, string> = {
  normal: "bg-blue-500/15 text-blue-400 border-blue-500/25",
  urgente: "bg-orange-500/15 text-orange-400 border-orange-500/25",
  critica: "bg-red-500/15 text-red-400 border-red-500/25",
};

const ESTADO_TRANSITIONS: Record<string, string[]> = {
  solicitada: ["aprobada", "rechazada"],
  aprobada: ["despachada"],
  despachada: ["entregada"],
};

const ESTADO_LABELS: Record<string, string> = {
  solicitada: "Solicitada", aprobada: "Aprobada", rechazada: "Rechazada",
  despachada: "Despachada", entregada: "Entregada",
};

export default function SolicitudExtraDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: solicitud, isLoading } = useSolicitudExtra(id);
  const updateSolicitud = useUpdateSolicitudExtra();

  if (isLoading || !solicitud) {
    return <div className="space-y-6"><Skeleton className="h-10 w-64" /><Skeleton className="h-64 w-full" /></div>;
  }

  const transitions = ESTADO_TRANSITIONS[solicitud.estado] || [];

  function handleChangeState(newState: string) {
    updateSolicitud.mutate(
      { id, data: { estado: newState } },
      {
        onSuccess: () => toast.success(`Estado cambiado a ${ESTADO_LABELS[newState]}`),
        onError: () => toast.error("Error al cambiar estado"),
      }
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Solicitud Extra">
        <Badge variant="outline" className={`capitalize ${URGENCIA_COLORS[solicitud.urgencia]}`}>{solicitud.urgencia}</Badge>
        <StatusBadge status={solicitud.estado} />
        {transitions.map((state) => (
          <Button
            key={state}
            variant={state === "rechazada" ? "outline" : "default"}
            size="sm"
            onClick={() => handleChangeState(state)}
            disabled={updateSolicitud.isPending}
          >
            {state === "aprobada" && <Check className="mr-2 h-4 w-4" />}
            {state === "rechazada" && <X className="mr-2 h-4 w-4" />}
            {ESTADO_LABELS[state]}
          </Button>
        ))}
      </PageHeader>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Datos</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <InfoRow label="Obra" value={solicitud.obras ? `${solicitud.obras.codigo} — ${solicitud.obras.nombre}` : "—"} />
            <InfoRow label="Motivo" value={MOTIVO_LABELS[solicitud.motivo] || solicitud.motivo} />
            <InfoRow label="Urgencia" value={solicitud.urgencia} />
            <InfoRow label="Solicitante" value={solicitud.personal ? `${solicitud.personal.nombre} ${solicitud.personal.apellido}` : "—"} />
            <InfoRow label="Creada" value={formatRelativeDate(solicitud.created_at)} />
          </CardContent>
        </Card>

        {solicitud.observaciones && (
          <Card>
            <CardHeader><CardTitle className="text-base">Observaciones</CardTitle></CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{solicitud.observaciones}</p>
            </CardContent>
          </Card>
        )}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Items solicitados ({solicitud.solicitud_extra_items?.length || 0})</CardTitle></CardHeader>
        <CardContent>
          {solicitud.solicitud_extra_items && solicitud.solicitud_extra_items.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Codigo</TableHead>
                  <TableHead>Descripcion</TableHead>
                  <TableHead>Cantidad</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {solicitud.solicitud_extra_items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-mono text-sm">{item.catalogo_piezas?.codigo}</TableCell>
                    <TableCell>{item.catalogo_piezas?.descripcion}</TableCell>
                    <TableCell className="font-semibold">{item.cantidad}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-center py-4 text-muted-foreground">Sin items</p>
          )}
        </CardContent>
      </Card>
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
