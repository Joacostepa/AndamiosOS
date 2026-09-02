"use client";

import Link from "next/link";
import { useAlertas, useMarkAlertaRead, type Alerta } from "@/hooks/use-alertas";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatRelativeDate } from "@/lib/utils/formatters";
import { CheckCircle, ChevronRight } from "lucide-react";
import { PRIORIDAD_COLORS, IconoAlerta } from "@/components/alertas/presentacion";
import { cn } from "@/lib/utils";

export default function AlertasPage() {
  const { data, isLoading } = useAlertas();
  const markRead = useMarkAlertaRead();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  const alertas = data?.alertas ?? [];
  const noLeidas = alertas.filter((a) => !a.leida);
  const leidas = alertas.filter((a) => a.leida);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <PageHeader
          title="Alertas"
          description={`${noLeidas.length} ${noLeidas.length === 1 ? "alerta sin leer" : "alertas sin leer"}`}
        />
        {noLeidas.length > 1 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => markRead.mutate(noLeidas.map((a) => a.id))}
          >
            Marcar todas leídas
          </Button>
        )}
      </div>

      {alertas.length > 0 ? (
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
                Leídas ({leidas.length})
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
  // EL AVISO TIENE QUE LLEVAR A ALGÚN LADO. Un cartel que dice "la obra se habilitó" y
  // te deja a pie obliga a buscarla a mano, que es el trabajo que venía a ahorrar. Al
  // entrar queda leída: si fuiste a verla, ya no es novedad.
  const cuerpo = (
    <CardContent className="flex items-start gap-4 py-4">
      <div className="mt-0.5 text-muted-foreground">
        <IconoAlerta tipo={alerta.tipo} className="h-5 w-5" />
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
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            // El botón vive adentro del enlace: sin esto, marcar leído también navega.
            e.preventDefault();
            e.stopPropagation();
            onMarkRead();
          }}
        >
          Marcar leída
        </Button>
      )}
      {alerta.enlace && (
        <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
      )}
    </CardContent>
  );

  const clases = cn(
    "transition-colors",
    !alerta.leida && "border-primary/20 bg-primary/5",
    alerta.enlace && "hover:border-primary/40",
  );

  if (!alerta.enlace) return <Card className={clases}>{cuerpo}</Card>;

  return (
    <Link href={alerta.enlace} onClick={() => onMarkRead?.()} className="block">
      <Card className={clases}>{cuerpo}</Card>
    </Link>
  );
}
