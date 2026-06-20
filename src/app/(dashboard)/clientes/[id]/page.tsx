"use client";

import { use } from "react";
import { useCliente } from "@/hooks/use-clientes";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCuit, formatDate } from "@/lib/utils/formatters";

// NOTA: read-only — la edición de clientes se hace en Odoo (fuente de verdad).
export default function ClienteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data: cliente, isLoading } = useCliente(id);

  if (isLoading || !cliente) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title={cliente.razon_social}>
        <StatusBadge status={cliente.estado} />
      </PageHeader>

      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="obras">Obras</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="mt-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Datos fiscales</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <InfoRow label="CUIT" value={formatCuit(cliente.cuit)} />
                <InfoRow label="Condicion IVA" value={cliente.condicion_iva} />
                <InfoRow
                  label="Domicilio fiscal"
                  value={cliente.domicilio_fiscal}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Contacto</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <InfoRow label="Telefono" value={cliente.telefono} />
                <InfoRow label="Email" value={cliente.email} />
                <InfoRow label="Alta" value={formatDate(cliente.created_at)} />
              </CardContent>
            </Card>

            {cliente.notas && (
              <Card className="md:col-span-2">
                <CardHeader>
                  <CardTitle className="text-base">Notas</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                    {cliente.notas}
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="obras" className="mt-4">
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              Las obras asociadas se mostraran aqui.
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
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
