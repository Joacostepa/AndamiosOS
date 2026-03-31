"use client";

import { use } from "react";
import { useCotizacion, useUpdateCotizacion } from "@/hooks/use-cotizaciones";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { PDFDownloadButton } from "@/components/pdf/pdf-download-button";
import { CotizacionPDF } from "@/components/pdf/cotizacion-pdf";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/utils/formatters";
import { ArrowRight, ChevronDown } from "lucide-react";
import { toast } from "sonner";

const TIPO_LABELS: Record<string, string> = {
  alquiler_mensual: "Alquiler", montaje: "Montaje", desarme: "Desarme",
  transporte: "Transporte", permiso: "Permiso", ingenieria: "Ingenieria",
  extra: "Extra", descuento: "Descuento",
};

const ESTADO_TRANSITIONS: Record<string, string[]> = {
  borrador: ["enviada"], enviada: ["en_revision", "aprobada", "rechazada"],
  en_revision: ["aprobada", "rechazada"], aprobada: [], rechazada: [], vencida: [],
};

const ESTADO_LABELS: Record<string, string> = {
  borrador: "Borrador", enviada: "Enviada", en_revision: "En revision",
  aprobada: "Aprobada", rechazada: "Rechazada", vencida: "Vencida",
};

export default function CotizacionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: cotizacion, isLoading } = useCotizacion(id);
  const updateCotizacion = useUpdateCotizacion();

  if (isLoading || !cotizacion) return <div className="space-y-6"><Skeleton className="h-10 w-64" /><Skeleton className="h-64 w-full" /></div>;

  const transitions = ESTADO_TRANSITIONS[cotizacion.estado] || [];
  const items = cotizacion.cotizacion_items || [];

  return (
    <div className="space-y-6">
      <PageHeader title={`Cotizacion ${cotizacion.codigo}`}>
        <Badge variant="outline" className="capitalize">v{cotizacion.version}</Badge>
        <StatusBadge status={cotizacion.estado} />
        <PDFDownloadButton
          document={<CotizacionPDF cotizacion={cotizacion} items={items} clienteNombre={cotizacion.clientes?.razon_social || cotizacion.oportunidades?.titulo} />}
          fileName={`${cotizacion.codigo}.pdf`}
        />
        {transitions.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" />}>Estado<ChevronDown className="ml-2 h-4 w-4" /></DropdownMenuTrigger>
            <DropdownMenuContent>
              {transitions.map((s) => (
                <DropdownMenuItem key={s} onClick={() => updateCotizacion.mutate({ id, data: { estado: s } }, { onSuccess: () => toast.success(`Cambiado a ${ESTADO_LABELS[s]}`) })}>
                  <ArrowRight className="mr-2 h-4 w-4" />{ESTADO_LABELS[s]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </PageHeader>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Datos</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <InfoRow label="Titulo" value={cotizacion.titulo} />
            <InfoRow label="Cliente" value={cotizacion.clientes?.razon_social} />
            <InfoRow label="Oportunidad" value={cotizacion.oportunidades?.titulo} />
            <InfoRow label="Condicion pago" value={cotizacion.condicion_pago} />
            <InfoRow label="Plazo alquiler" value={cotizacion.plazo_alquiler_meses ? `${cotizacion.plazo_alquiler_meses} meses` : null} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Fechas y montos</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <InfoRow label="Emision" value={formatDate(cotizacion.fecha_emision)} />
            <InfoRow label="Vencimiento" value={formatDate(cotizacion.fecha_vencimiento)} />
            <InfoRow label="Validez" value={`${cotizacion.validez_dias} dias`} />
            <InfoRow label="Subtotal" value={`$${Number(cotizacion.subtotal).toLocaleString()}`} />
            <InfoRow label={`IVA (${cotizacion.iva_porcentaje}%)`} value={`$${Number(cotizacion.iva_monto).toLocaleString()}`} />
            <div className="flex justify-between text-sm pt-2 border-t">
              <span className="font-bold text-primary">TOTAL</span>
              <span className="font-bold text-primary text-lg">${Number(cotizacion.total).toLocaleString()}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {cotizacion.descripcion_servicio && (
        <Card>
          <CardHeader><CardTitle className="text-base">Descripcion del servicio</CardTitle></CardHeader>
          <CardContent><p className="text-sm whitespace-pre-wrap">{cotizacion.descripcion_servicio}</p></CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Items ({items.length})</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow><TableHead>Tipo</TableHead><TableHead>Concepto</TableHead><TableHead>Cant.</TableHead><TableHead>P. Unit.</TableHead><TableHead>Subtotal</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="text-xs">{TIPO_LABELS[item.tipo]}</TableCell>
                  <TableCell>{item.concepto}</TableCell>
                  <TableCell>{item.cantidad} {item.unidad}</TableCell>
                  <TableCell>${Number(item.precio_unitario).toLocaleString()}</TableCell>
                  <TableCell className="font-semibold">${Number(item.subtotal).toLocaleString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {cotizacion.condiciones && (
        <Card>
          <CardHeader><CardTitle className="text-base">Condiciones</CardTitle></CardHeader>
          <CardContent><p className="text-sm text-muted-foreground whitespace-pre-wrap">{cotizacion.condiciones}</p></CardContent>
        </Card>
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  return <div className="flex justify-between text-sm"><span className="text-muted-foreground">{label}</span><span className="font-medium">{value || "—"}</span></div>;
}
