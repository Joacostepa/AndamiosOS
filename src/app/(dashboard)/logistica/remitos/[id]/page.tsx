"use client";

import { use } from "react";
import { useRemito, useUpdateRemito } from "@/hooks/use-remitos";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate, formatDateTime } from "@/lib/utils/formatters";
import { ArrowRight } from "lucide-react";
import { toast } from "sonner";

const ESTADO_TRANSITIONS: Record<string, string[]> = {
  emitido: ["en_transito", "anulado"],
  en_transito: ["recibido", "con_diferencia"],
  recibido: ["cerrado"],
  con_diferencia: ["cerrado"],
};

const ESTADO_LABELS: Record<string, string> = {
  emitido: "Emitido",
  en_transito: "En transito",
  recibido: "Recibido",
  con_diferencia: "Con diferencia",
  cerrado: "Cerrado",
  anulado: "Anulado",
};

const TIPO_LABELS: Record<string, string> = {
  entrega: "Entrega",
  devolucion: "Devolucion",
  transferencia: "Transferencia",
};

export default function RemitoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data: remito, isLoading } = useRemito(id);
  const updateRemito = useUpdateRemito();

  if (isLoading || !remito) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const transitions = ESTADO_TRANSITIONS[remito.estado] || [];

  function handleChangeState(newState: string) {
    const updates: Record<string, unknown> = { estado: newState };
    if (newState === "recibido" || newState === "con_diferencia") {
      updates.fecha_recepcion = new Date().toISOString();
    }

    updateRemito.mutate(
      { id: remito!.id, data: updates as { estado: string } },
      {
        onSuccess: () => {
          toast.success(`Estado cambiado a ${ESTADO_LABELS[newState]}`);
        },
        onError: () => {
          toast.error("Error al cambiar estado");
        },
      }
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title={`Remito ${remito.numero}`}>
        <Badge variant="outline" className="capitalize">
          {TIPO_LABELS[remito.tipo]}
        </Badge>
        <StatusBadge status={remito.estado} />
        {transitions.map((state) => (
          <Button
            key={state}
            variant="outline"
            size="sm"
            onClick={() => handleChangeState(state)}
            disabled={updateRemito.isPending}
          >
            <ArrowRight className="mr-2 h-4 w-4" />
            {ESTADO_LABELS[state]}
          </Button>
        ))}
      </PageHeader>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Datos del remito</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <InfoRow label="Numero" value={remito.numero} />
            <InfoRow label="Tipo" value={TIPO_LABELS[remito.tipo]} />
            <InfoRow
              label="Obra"
              value={
                remito.obras
                  ? `${remito.obras.codigo} — ${remito.obras.nombre}`
                  : "—"
              }
            />
            <InfoRow
              label="Chofer"
              value={
                remito.personal
                  ? `${remito.personal.nombre} ${remito.personal.apellido}`
                  : "—"
              }
            />
            <InfoRow label="Receptor" value={remito.receptor_nombre} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Fechas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <InfoRow
              label="Emision"
              value={formatDateTime(remito.fecha_emision)}
            />
            <InfoRow
              label="Recepcion"
              value={formatDateTime(remito.fecha_recepcion)}
            />
            {remito.tiene_diferencia && (
              <div className="rounded-md bg-red-500/10 p-3 text-sm text-red-400">
                Este remito tiene diferencias registradas
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Items ({remito.remito_items?.length || 0})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Codigo</TableHead>
                <TableHead>Descripcion</TableHead>
                <TableHead>Remitido</TableHead>
                <TableHead>Recibido</TableHead>
                <TableHead>Diferencia</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {remito.remito_items?.map((item) => {
                const diff =
                  item.cantidad_recibida !== null
                    ? item.cantidad_remitida - item.cantidad_recibida
                    : null;
                return (
                  <TableRow key={item.id}>
                    <TableCell className="font-mono text-sm">
                      {item.catalogo_piezas?.codigo}
                    </TableCell>
                    <TableCell>
                      {item.catalogo_piezas?.descripcion}
                    </TableCell>
                    <TableCell className="font-semibold">
                      {item.cantidad_remitida}
                    </TableCell>
                    <TableCell>
                      {item.cantidad_recibida ?? "—"}
                    </TableCell>
                    <TableCell>
                      {diff !== null && diff !== 0 ? (
                        <span className="text-red-400 font-semibold">
                          {diff > 0 ? `-${diff}` : `+${Math.abs(diff)}`}
                        </span>
                      ) : diff === 0 ? (
                        <span className="text-green-400">OK</span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {remito.observaciones && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Observaciones</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">
              {remito.observaciones}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value || "—"}</span>
    </div>
  );
}
