"use client";

import { useAlertas, useMarkAlertaRead, type Alerta } from "@/hooks/use-alertas";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatRelativeDate } from "@/lib/utils/formatters";
import {
  AlertTriangle,
  Bell,
  CheckCircle,
  FileWarning,
  Package,
} from "lucide-react";
import { cn } from "@/lib/utils";

const PRIORIDAD_COLORS: Record<string, string> = {
  critica: "bg-red-500/15 text-red-400 border-red-500/25",
  alta: "bg-orange-500/15 text-orange-400 border-orange-500/25",
  media: "bg-yellow-500/15 text-yellow-400 border-yellow-500/25",
  baja: "bg-blue-500/15 text-blue-400 border-blue-500/25",
};

const TIPO_ICONS: Record<string, React.ReactNode> = {
  documento_vencimiento: <FileWarning className="h-5 w-5" />,
  stock_bajo_minimo: <Package className="h-5 w-5" />,
  remito_pendiente: <AlertTriangle className="h-5 w-5" />,
};

export default function AlertasPage() {
  const { data: alertas, isLoading } = useAlertas();
  const markRead = useMarkAlertaRead();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  const noLeidas = alertas?.filter((a) => !a.leida) || [];
  const leidas = alertas?.filter((a) => a.leida) || [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Alertas"
        description={`${noLeidas.length} alertas sin leer`}
      />

      {alertas && alertas.length > 0 ? (
        <div className="space-y-3">
          {noLeidas.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-muted-foreground">
                Sin leer ({noLeidas.length})
              </h3>
              {noLeidas.map((alerta) => (
                <AlertaCard
                  key={alerta.id}
                  alerta={alerta}
                  onMarkRead={() => markRead.mutate(alerta.id)}
                />
              ))}
            </div>
          )}

          {leidas.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-muted-foreground mt-6">
                Leidas ({leidas.length})
              </h3>
              {leidas.map((alerta) => (
                <AlertaCard key={alerta.id} alerta={alerta} />
              ))}
            </div>
          )}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <CheckCircle className="h-12 w-12 text-green-400/50 mb-4" />
            <h3 className="text-lg font-medium">Todo en orden</h3>
            <p className="text-sm text-muted-foreground mt-1">
              No hay alertas pendientes
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function AlertaCard({
  alerta,
  onMarkRead,
}: {
  alerta: Alerta;
  onMarkRead?: () => void;
}) {
  return (
    <Card
      className={cn(
        "transition-colors",
        !alerta.leida && "border-primary/20 bg-primary/5"
      )}
    >
      <CardContent className="flex items-start gap-4 py-4">
        <div className="mt-0.5 text-muted-foreground">
          {TIPO_ICONS[alerta.tipo] || <Bell className="h-5 w-5" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-medium text-sm">{alerta.titulo}</p>
            <Badge
              variant="outline"
              className={cn("text-xs", PRIORIDAD_COLORS[alerta.prioridad])}
            >
              {alerta.prioridad}
            </Badge>
          </div>
          {alerta.descripcion && (
            <p className="text-sm text-muted-foreground mt-1">
              {alerta.descripcion}
            </p>
          )}
          <p className="text-xs text-muted-foreground mt-1">
            {formatRelativeDate(alerta.created_at)}
          </p>
        </div>
        {!alerta.leida && onMarkRead && (
          <Button variant="ghost" size="sm" onClick={onMarkRead}>
            Marcar leida
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
