"use client";

import { useObras } from "@/hooks/use-obras";
import { useStock } from "@/hooks/use-stock";
import { useAlertas, useAlertasCount } from "@/hooks/use-alertas";
import { useRemitos } from "@/hooks/use-remitos";
import { usePersonal } from "@/hooks/use-personal";
import { useIncidentes } from "@/hooks/use-incidentes";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatRelativeDate } from "@/lib/utils/formatters";
import {
  Building2, AlertTriangle, FileText, Package, Users, ShieldAlert,
  TrendingUp, Clock, UserX,
} from "lucide-react";
import Link from "next/link";

export default function DashboardPage() {
  const { data: obras, isLoading: obrasLoading } = useObras();
  const { data: stock, isLoading: stockLoading } = useStock();
  const { data: alertasCount } = useAlertasCount();
  const { data: alertas } = useAlertas();
  const { data: remitos } = useRemitos();
  const { data: personal } = usePersonal();
  const { data: incidentes } = useIncidentes();

  const obrasActivas = obras?.filter((o) => !["cancelada", "cerrada_operativamente", "suspendida"].includes(o.estado)).length || 0;
  const remitosAbiertos = remitos?.filter((r) => !["cerrado", "anulado"].includes(r.estado)).length || 0;
  const stockBajoMinimo = stock?.filter((s) => s.en_deposito < s.catalogo_piezas.stock_minimo).length || 0;
  const personalVencido = personal?.filter((p) => p.estado_habilitacion === "vencido").length || 0;
  const personalPorVencer = personal?.filter((p) => p.estado_habilitacion === "por_vencer").length || 0;
  const incidentesAbiertos = incidentes?.filter((i) => i.estado !== "cerrado").length || 0;

  if (obrasLoading || stockLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48" />
        <div className="grid gap-4 md:grid-cols-4">{[...Array(8)].map((_, i) => <Skeleton key={i} className="h-28" />)}</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" description="Resumen operativo de AndamiosOS" />

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KPICard icon={Building2} label="Obras activas" value={obrasActivas} href="/obras" />
        <KPICard icon={AlertTriangle} label="Alertas" value={alertasCount || 0} href="/alertas" alert={!!alertasCount && alertasCount > 0} />
        <KPICard icon={FileText} label="Remitos abiertos" value={remitosAbiertos} href="/logistica/remitos" />
        <KPICard icon={Package} label="Stock bajo minimo" value={stockBajoMinimo} href="/deposito/stock" alert={stockBajoMinimo > 0} />
        <KPICard icon={UserX} label="Personal vencido" value={personalVencido} href="/personal" alert={personalVencido > 0} />
        <KPICard icon={Clock} label="Docs por vencer" value={personalPorVencer} href="/personal" alert={personalPorVencer > 0} />
        <KPICard icon={ShieldAlert} label="Incidentes abiertos" value={incidentesAbiertos} href="/incidentes" alert={incidentesAbiertos > 0} />
        <KPICard icon={Users} label="Personal activo" value={personal?.length || 0} href="/personal" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Alertas */}
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4" />Ultimas alertas</CardTitle></CardHeader>
          <CardContent>
            {alertas && alertas.length > 0 ? (
              <div className="space-y-3">
                {alertas.slice(0, 5).map((a) => (
                  <div key={a.id} className="flex items-center justify-between text-sm">
                    <p className="font-medium truncate max-w-[200px]">{a.titulo}</p>
                    <StatusBadge status={a.prioridad} />
                  </div>
                ))}
              </div>
            ) : <p className="text-sm text-muted-foreground text-center py-4">Sin alertas</p>}
          </CardContent>
        </Card>

        {/* Obras por estado */}
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><TrendingUp className="h-4 w-4" />Obras por estado</CardTitle></CardHeader>
          <CardContent>
            {obras && obras.length > 0 ? (
              <div className="space-y-2">
                {Object.entries(obras.reduce((acc, o) => { acc[o.estado] = (acc[o.estado] || 0) + 1; return acc; }, {} as Record<string, number>))
                  .sort((a, b) => b[1] - a[1])
                  .map(([estado, count]) => (
                    <div key={estado} className="flex items-center justify-between">
                      <StatusBadge status={estado} />
                      <span className="font-semibold text-sm">{count}</span>
                    </div>
                  ))}
              </div>
            ) : <p className="text-sm text-muted-foreground text-center py-4">Sin obras</p>}
          </CardContent>
        </Card>

        {/* Stock critico */}
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Package className="h-4 w-4" />Stock critico</CardTitle></CardHeader>
          <CardContent>
            {stock && stockBajoMinimo > 0 ? (
              <div className="space-y-2">
                {stock
                  .filter((s) => s.en_deposito < s.catalogo_piezas.stock_minimo)
                  .slice(0, 5)
                  .map((s) => (
                    <div key={s.id} className="flex items-center justify-between text-sm">
                      <span className="font-mono text-xs">{s.catalogo_piezas.codigo}</span>
                      <span className="text-red-400 font-semibold">{s.en_deposito} / {s.catalogo_piezas.stock_minimo}</span>
                    </div>
                  ))}
              </div>
            ) : <p className="text-sm text-muted-foreground text-center py-4">Todo OK</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function KPICard({ icon: Icon, label, value, href, alert = false }: { icon: React.ElementType; label: string; value: number; href: string; alert?: boolean }) {
  return (
    <Link href={href}>
      <Card className="hover:border-primary/50 transition-colors cursor-pointer">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">{label}</p>
              <p className={`text-3xl font-bold mt-1 ${alert ? "text-red-400" : ""}`}>{value}</p>
            </div>
            <Icon className={`h-8 w-8 ${alert ? "text-red-400/50" : "text-muted-foreground/30"}`} />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
