"use client";

import { useObras } from "@/hooks/use-obras";
import { useStock } from "@/hooks/use-stock";
import { useAlertas, useAlertasCount } from "@/hooks/use-alertas";
import { useRemitos } from "@/hooks/use-remitos";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatRelativeDate } from "@/lib/utils/formatters";
import {
  Building2,
  AlertTriangle,
  FileText,
  Package,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";

export default function DashboardPage() {
  const { data: obras, isLoading: obrasLoading } = useObras();
  const { data: stock, isLoading: stockLoading } = useStock();
  const { data: alertasCount } = useAlertasCount();
  const { data: alertas } = useAlertas();
  const { data: remitos } = useRemitos();

  const obrasActivas =
    obras?.filter(
      (o) => !["cancelada", "cerrada_operativamente", "suspendida"].includes(o.estado)
    ).length || 0;

  const remitosAbiertos =
    remitos?.filter((r) => !["cerrado", "anulado"].includes(r.estado)).length || 0;

  const stockBajoMinimo =
    stock?.filter((s) => s.en_deposito < s.catalogo_piezas.stock_minimo)
      .length || 0;

  const isLoading = obrasLoading || stockLoading;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48" />
        <div className="grid gap-4 md:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" description="Resumen operativo" />

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KPICard
          icon={Building2}
          label="Obras activas"
          value={obrasActivas}
          href="/obras"
        />
        <KPICard
          icon={AlertTriangle}
          label="Alertas criticas"
          value={alertasCount || 0}
          href="/alertas"
          alert={!!alertasCount && alertasCount > 0}
        />
        <KPICard
          icon={FileText}
          label="Remitos abiertos"
          value={remitosAbiertos}
          href="/logistica/remitos"
        />
        <KPICard
          icon={Package}
          label="Stock bajo minimo"
          value={stockBajoMinimo}
          href="/deposito/stock"
          alert={stockBajoMinimo > 0}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent Alerts */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Ultimas alertas
            </CardTitle>
          </CardHeader>
          <CardContent>
            {alertas && alertas.length > 0 ? (
              <div className="space-y-3">
                {alertas.slice(0, 5).map((alerta) => (
                  <div
                    key={alerta.id}
                    className="flex items-center justify-between text-sm"
                  >
                    <div className="min-w-0">
                      <p className="font-medium truncate">{alerta.titulo}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatRelativeDate(alerta.created_at)}
                      </p>
                    </div>
                    <StatusBadge status={alerta.prioridad} />
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                Sin alertas
              </p>
            )}
          </CardContent>
        </Card>

        {/* Obras by State */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Obras por estado
            </CardTitle>
          </CardHeader>
          <CardContent>
            {obras && obras.length > 0 ? (
              <div className="space-y-2">
                {Object.entries(
                  obras.reduce(
                    (acc, obra) => {
                      acc[obra.estado] = (acc[obra.estado] || 0) + 1;
                      return acc;
                    },
                    {} as Record<string, number>
                  )
                )
                  .sort((a, b) => b[1] - a[1])
                  .map(([estado, count]) => (
                    <div
                      key={estado}
                      className="flex items-center justify-between"
                    >
                      <StatusBadge status={estado} />
                      <span className="font-semibold text-sm">{count}</span>
                    </div>
                  ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                Sin obras
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function KPICard({
  icon: Icon,
  label,
  value,
  href,
  alert = false,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  href: string;
  alert?: boolean;
}) {
  return (
    <Link href={href}>
      <Card className="hover:border-primary/50 transition-colors cursor-pointer">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">{label}</p>
              <p
                className={`text-3xl font-bold mt-1 ${alert ? "text-red-400" : ""}`}
              >
                {value}
              </p>
            </div>
            <Icon
              className={`h-8 w-8 ${alert ? "text-red-400/50" : "text-muted-foreground/30"}`}
            />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
